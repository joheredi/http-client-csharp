/**
 * Scans the emitter output directory for user-written C# partial classes
 * and extracts customization metadata (CodeGen attributes, member declarations).
 *
 * This is the TypeScript-based alternative to the legacy emitter's Roslyn
 * analysis. It uses regex-based parsing to extract well-known patterns:
 * - `[CodeGenType("name")]` on class declarations
 * - `[CodeGenMember("name")]` on property/field declarations
 * - `[CodeGenSuppress("member", typeof(Type))]` on class declarations
 * - `[CodeGenSerialization("prop", "serializationName")]` on class declarations
 * - `public partial class ClassName` declarations
 * - Property declarations within partial classes
 *
 * The scanner only reads files outside the `Generated/` subdirectory,
 * since that directory contains emitter-produced files.
 *
 * @module
 */

import { readdir, readFile, stat } from "fs/promises";
import { join, relative, sep } from "path";

import type {
  CustomCodeModel,
  CustomMemberInfo,
  CustomTypeInfo,
  SerializationOverrideInfo,
  SuppressedMemberInfo,
} from "./custom-code-model.js";
import { createEmptyCustomCodeModel } from "./custom-code-model.js";

/**
 * Scans the emitter output directory for custom C# code and builds a
 * {@link CustomCodeModel} describing all user customizations.
 *
 * The scanner looks for `.cs` files under `{emitterOutputDir}/src/` that are
 * NOT inside the `Generated/` subdirectory. Each file is parsed for partial
 * class declarations and CodeGen attributes.
 *
 * @param emitterOutputDir - The root output directory for the emitter
 *   (i.e., `context.emitterOutputDir` from TypeSpec).
 * @returns A model describing all custom code found, or an empty model
 *   if no custom code exists.
 */
export async function scanCustomCode(
  emitterOutputDir: string,
): Promise<CustomCodeModel> {
  const srcDir = join(emitterOutputDir, "src");

  // Check if src/ directory exists
  try {
    const srcStat = await stat(srcDir);
    if (!srcStat.isDirectory()) {
      return createEmptyCustomCodeModel();
    }
  } catch {
    return createEmptyCustomCodeModel();
  }

  const customFiles = await findCustomCodeFiles(srcDir);
  if (customFiles.length === 0) {
    return createEmptyCustomCodeModel();
  }

  const model: CustomCodeModel = { types: new Map() };

  for (const filePath of customFiles) {
    const content = await readFile(filePath, "utf-8");
    const typeInfos = parseCustomCodeFile(content);

    for (const typeInfo of typeInfos) {
      // Key by the original (generated) name so generation components
      // can quickly check "should I customize this generated type?"
      model.types.set(typeInfo.originalName, typeInfo);
    }
  }

  return model;
}

/**
 * Recursively finds all `.cs` files under `srcDir` that are NOT inside
 * a `Generated/` subdirectory.
 *
 * @param srcDir - The `src/` directory to scan.
 * @returns Array of absolute file paths to custom .cs files.
 */
export async function findCustomCodeFiles(
  srcDir: string,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip the Generated directory — it contains emitter output
        const relPath = relative(srcDir, fullPath);
        const firstSegment = relPath.split(sep)[0];
        if (firstSegment === "Generated") {
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".cs")) {
        results.push(fullPath);
      }
    }
  }

  await walk(srcDir);
  return results;
}

// ---------- Regex patterns for parsing C# constructs ----------

/**
 * Matches `namespace SomeNamespace { ... }` or `namespace SomeNamespace;` (file-scoped).
 * Captures the namespace name.
 */
const NAMESPACE_PATTERN = /^\s*namespace\s+([\w.]+)\s*[{;]/m;

/**
 * Matches a `[CodeGenType("name")]` attribute.
 * Captures the original name string.
 */
const CODEGEN_TYPE_PATTERN =
  /\[CodeGenType\(\s*"([^"]+)"\s*\)\]/g;

/**
 * Matches a `[CodeGenMember("name")]` attribute.
 * Captures the original member name.
 */
const CODEGEN_MEMBER_PATTERN =
  /\[CodeGenMember\(\s*"([^"]+)"\s*\)\]/g;

/**
 * Matches `[CodeGenSuppress("member", typeof(T1), ...)]`.
 * Captures the member name and optional typeof arguments.
 */
const CODEGEN_SUPPRESS_PATTERN =
  /\[CodeGenSuppress\(\s*"([^"]+)"(?:\s*,\s*((?:typeof\([^)]+\)\s*,?\s*)*))?\s*\)\]/g;

/**
 * Matches `[CodeGenSerialization("propName", ...)]` with optional named args.
 * Captures the property name and the rest of the arguments.
 */
const CODEGEN_SERIALIZATION_PATTERN =
  /\[CodeGenSerialization\(\s*"([^"]+)"(?:\s*,\s*([^)\]]*))?\s*\)\]/g;

/**
 * Matches a partial class or struct declaration.
 * Captures the type name.
 */
const PARTIAL_CLASS_PATTERN =
  /(?:public|internal)\s+partial\s+(?:class|struct)\s+(\w+)/g;

/**
 * Matches a property declaration: `public Type Name { get; set; }` etc.
 * Captures the property name. Handles nullable types, generics, arrays.
 */
const PROPERTY_PATTERN =
  /(?:public|internal|protected|private)\s+(?:(?:virtual|override|new|required|static)\s+)*[\w.<>[,?\s\]]+\s+(\w+)\s*\{[^}]*\}/g;

/**
 * Matches a `typeof(TypeName)` argument. Captures the type name.
 */
const TYPEOF_PATTERN = /typeof\(\s*(\w+)\s*\)/g;

/**
 * Parses a single C# file and extracts all partial class declarations
 * with their CodeGen attributes and member declarations.
 *
 * @param content - The full text content of a .cs file.
 * @returns Array of parsed type infos found in the file.
 */
export function parseCustomCodeFile(content: string): CustomTypeInfo[] {
  const results: CustomTypeInfo[] = [];

  // Extract namespace (applies to all types in the file)
  const nsMatch = NAMESPACE_PATTERN.exec(content);
  const namespace = nsMatch ? nsMatch[1] : undefined;

  // Find all partial class/struct declarations
  const classPattern = new RegExp(PARTIAL_CLASS_PATTERN.source, "g");
  let classMatch;

  while ((classMatch = classPattern.exec(content)) !== null) {
    const className = classMatch[1];
    const classPos = classMatch.index;

    // Look for CodeGenType attribute before this class declaration.
    // Search backwards from the class declaration for attributes on the same
    // block (within ~500 chars before the class keyword).
    const searchStart = Math.max(0, classPos - 500);
    const preClassBlock = content.substring(searchStart, classPos);

    let originalName = className;
    const codeGenTypePattern = new RegExp(CODEGEN_TYPE_PATTERN.source, "g");
    let cgtMatch;
    while ((cgtMatch = codeGenTypePattern.exec(preClassBlock)) !== null) {
      originalName = cgtMatch[1];
    }

    // Find the class body (everything between the opening { and matching })
    const classBody = extractClassBody(content, classPos);
    if (!classBody) continue;

    // Parse members from the class body
    const members = parseMembers(classBody);

    // Parse CodeGenSuppress attributes (on the class, before its declaration)
    const suppressedMembers = parseSuppressAttributes(preClassBlock);

    // Parse CodeGenSerialization attributes (on the class, before its declaration)
    const serializationOverrides =
      parseSerializationAttributes(preClassBlock);

    results.push({
      declaredName: className,
      originalName,
      namespace,
      members,
      suppressedMembers,
      serializationOverrides,
    });
  }

  return results;
}

/**
 * Extracts the body of a class/struct declaration starting from the
 * position of the declaration keyword.
 *
 * Handles nested braces by counting opening and closing braces.
 *
 * @param content - Full file content.
 * @param startPos - Position of the class/struct declaration.
 * @returns The text between the opening and closing braces, or null.
 */
function extractClassBody(content: string, startPos: number): string | null {
  // Find the opening brace
  const openBrace = content.indexOf("{", startPos);
  if (openBrace === -1) return null;

  let depth = 1;
  let i = openBrace + 1;

  while (i < content.length && depth > 0) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") depth--;
    i++;
  }

  if (depth !== 0) return null;
  return content.substring(openBrace + 1, i - 1);
}

/**
 * Parses member declarations (properties, fields) from a class body,
 * including any `[CodeGenMember]` attributes.
 *
 * @param classBody - The text content between the class braces.
 * @returns Array of parsed member infos.
 */
function parseMembers(classBody: string): CustomMemberInfo[] {
  const members: CustomMemberInfo[] = [];

  // Find properties with optional CodeGenMember attributes
  const propertyPattern = new RegExp(PROPERTY_PATTERN.source, "g");
  let propMatch;

  while ((propMatch = propertyPattern.exec(classBody)) !== null) {
    const propName = propMatch[1];
    const propPos = propMatch.index;

    // Look for CodeGenMember attribute before this property (within ~300 chars)
    const searchStart = Math.max(0, propPos - 300);
    const prePropBlock = classBody.substring(searchStart, propPos);

    let originalName: string | undefined;
    const memberAttrPattern = new RegExp(CODEGEN_MEMBER_PATTERN.source, "g");
    let memberMatch;
    while ((memberMatch = memberAttrPattern.exec(prePropBlock)) !== null) {
      originalName = memberMatch[1];
    }

    members.push({
      declaredName: propName,
      originalName,
    });
  }

  return members;
}

/**
 * Parses `[CodeGenSuppress("member", typeof(T), ...)]` attributes
 * from a block of text (typically the pre-class attribute block).
 *
 * @param block - Text to search for CodeGenSuppress attributes.
 * @returns Array of suppression infos.
 */
function parseSuppressAttributes(block: string): SuppressedMemberInfo[] {
  const results: SuppressedMemberInfo[] = [];
  const pattern = new RegExp(CODEGEN_SUPPRESS_PATTERN.source, "g");
  let match;

  while ((match = pattern.exec(block)) !== null) {
    const memberName = match[1];
    let parameterTypes: string[] | undefined;

    if (match[2]) {
      // Extract typeof(...) arguments
      const typeofPattern = new RegExp(TYPEOF_PATTERN.source, "g");
      parameterTypes = [];
      let typeofMatch;
      while ((typeofMatch = typeofPattern.exec(match[2])) !== null) {
        parameterTypes.push(typeofMatch[1]);
      }
    }

    results.push({ memberName, parameterTypes });
  }

  return results;
}

/**
 * Parses `[CodeGenSerialization("propName", "serializationName", ...)]`
 * attributes from a block of text.
 *
 * Supports positional args and named args like:
 * `SerializationValueHook = "MyHook"`, `DeserializationValueHook = "MyHook"`.
 *
 * @param block - Text to search for CodeGenSerialization attributes.
 * @returns Array of serialization override infos.
 */
function parseSerializationAttributes(
  block: string,
): SerializationOverrideInfo[] {
  const results: SerializationOverrideInfo[] = [];
  const pattern = new RegExp(CODEGEN_SERIALIZATION_PATTERN.source, "g");
  let match;

  while ((match = pattern.exec(block)) !== null) {
    const propertyName = match[1];
    const restArgs = match[2] || "";

    // Parse optional positional serializationName (second quoted string)
    let serializationName: string | undefined;
    const quotedStrMatch = /^"([^"]*)"/.exec(restArgs.trim());
    if (quotedStrMatch) {
      serializationName = quotedStrMatch[1];
    }

    // Parse named arguments
    let serializationValueHook: string | undefined;
    const serHookMatch = /SerializationValueHook\s*=\s*"([^"]+)"/.exec(
      restArgs,
    );
    if (serHookMatch) {
      serializationValueHook = serHookMatch[1];
    }

    let deserializationValueHook: string | undefined;
    const deserHookMatch = /DeserializationValueHook\s*=\s*"([^"]+)"/.exec(
      restArgs,
    );
    if (deserHookMatch) {
      deserializationValueHook = deserHookMatch[1];
    }

    results.push({
      propertyName,
      serializationName,
      serializationValueHook,
      deserializationValueHook,
    });
  }

  return results;
}
