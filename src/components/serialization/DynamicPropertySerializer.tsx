/**
 * Patch-aware property serialization for dynamic (JSON Merge Patch) models.
 *
 * Dynamic models track property-level changes via a `JsonPatch` field. During
 * serialization, each property is wrapped in `Patch.Contains`/`Patch.IsRemoved`
 * checks so that only modified properties are written.
 *
 * This module handles all property type patterns:
 *
 * - **Simple properties** (primitives, models, enums): Wrapped in
 *   `if (!Patch.Contains("$.name"u8)) { write }`. Optional properties add
 *   `&& !Patch.Contains(...)` to the existing `Optional.IsDefined` guard.
 *
 * - **List/Array properties**: Two-branch pattern where `Patch.Contains` checks
 *   if the entire collection was replaced (write raw value from patch), otherwise
 *   iterates with `for` loops and per-element `Patch.IsRemoved` checks.
 *
 * - **Dictionary properties**: Wrapped in `!Patch.Contains` at the container level,
 *   with per-key `patchContains` checks inside the `foreach` loop using
 *   `#if NET8_0_OR_GREATER` optimization for `Span<byte>` stackalloc.
 *
 * @see DynamicModel.Serialization.cs in the legacy generator's TestProjects
 *   for the ground truth generated output.
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import {
  type SdkArrayType,
  type SdkDictionaryType,
  type SdkModelPropertyType,
  type SdkModelType,
  type SdkType,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";
import { unwrapNullableType } from "../../utils/nullable.js";
import {
  isCSharpReferenceType,
  isPropertyReadOnly,
} from "../../utils/property.js";
import {
  buildGuardCondition,
  getWriteMethodInfo,
  isRequiredNullable,
  needsNullableValueAccess,
  needsSerializationGuard,
} from "./PropertySerializer.js";

/**
 * Props for the {@link DynamicWritePropertySerialization} component.
 */
export interface DynamicWritePropertySerializationProps {
  /** The TCGC SDK model property to serialize with patch awareness. */
  property: SdkModelPropertyType;
}

/**
 * Checks whether an SDK type is a dynamic model (has JsonMergePatch usage).
 */
function isItemDynamicModel(type: SdkType): boolean {
  const unwrapped = unwrapNullableType(type);
  if (unwrapped.kind !== "model") return false;
  return ((unwrapped as SdkModelType).usage & UsageFlags.JsonMergePatch) !== 0;
}

/**
 * Determines whether a collection item type needs a null check.
 */
function collectionItemNeedsNullCheck(itemType: SdkType): boolean {
  if (itemType.kind === "nullable") return true;
  const unwrapped = unwrapNullableType(itemType);
  if (unwrapped.kind === "array" || unwrapped.kind === "dict") return true;
  return isCSharpReferenceType(itemType);
}

/** Dictionary loop variable name at a given depth. */
function getDictItemVarName(depth: number): string {
  return depth === 0 ? "item" : `item${depth - 1}`;
}

/** Array index variable name at a given depth. */
function getArrayIndexVarName(depth: number): string {
  return depth === 0 ? "i" : `i${depth - 1}`;
}

/** Dictionary patch variable names at a given depth. */
function getDictPatchVarNames(depth: number) {
  const suffix = depth === 0 ? "" : `${depth - 1}`;
  return {
    buffer: `buffer${suffix}`,
    bytesWritten: `bytesWritten${suffix}`,
    patchContains: `patchContains${suffix}`,
  };
}

/** JSON path expression — static (u8 literal) or dynamic (Encoding.UTF8.GetBytes). */
interface PathExpr {
  isStatic: boolean;
  path: string;
}

/** Renders a path expression as a C# source string. */
function renderPath(p: PathExpr): string {
  return p.isStatic ? `"${p.path}"u8` : `Encoding.UTF8.GetBytes($"${p.path}")`;
}

// ─── STRING-BASED HELPERS ────────────────────────────────────────────────────
// These functions build C# code as string arrays to avoid complex JSX nesting
// that causes issues with the Alloy Babel plugin.

/**
 * Builds the per-key patch check lines for a dictionary loop.
 * Returns an array of C# source lines.
 */
function buildDictPerKeyPatchCheck(
  pathExpr: PathExpr,
  loopVar: string,
  depth: number,
  indent: string,
): string[] {
  const vars = getDictPatchVarNames(depth);
  const pathStr = pathExpr.isStatic
    ? `"${pathExpr.path}"u8`
    : `global::System.Text.Encoding.UTF8.GetBytes($"${pathExpr.path}")`;
  const globalEnc = "global::System.Text.Encoding";

  return [
    `\n#if NET8_0_OR_GREATER`,
    `\n${indent}int ${vars.bytesWritten} = ${globalEnc}.UTF8.GetBytes(${loopVar}.Key.AsSpan(), ${vars.buffer});`,
    `\n${indent}bool ${vars.patchContains} = (${vars.bytesWritten} == 256) ? Patch.Contains(${pathStr}, ${globalEnc}.UTF8.GetBytes(${loopVar}.Key)) : Patch.Contains(${pathStr}, ${vars.buffer}.Slice(0, ${vars.bytesWritten}));`,
    `\n#else`,
    `\n${indent}bool ${vars.patchContains} = Patch.Contains(${renderPath(pathExpr)}, Encoding.UTF8.GetBytes(${loopVar}.Key));`,
    `\n#endif`,
  ];
}

/** Builds the buffer stackalloc declaration inside #if NET8_0_OR_GREATER. */
function buildBufferDeclaration(depth: number, indent: string): string[] {
  const vars = getDictPatchVarNames(depth);
  return [
    `\n#if NET8_0_OR_GREATER`,
    `\n${indent}global::System.Span<byte> ${vars.buffer} = stackalloc byte[256];`,
    `\n#endif`,
  ];
}

/**
 * Builds the value-write expression for a single item (primitive, model, or enum).
 * Returns an array of C# source lines, or null for unsupported types.
 */
function buildValueWrite(
  type: SdkType,
  valueExpr: string,
  indent: string,
): string[] | null {
  const unwrapped = unwrapNullableType(type);

  if (unwrapped.kind === "model") {
    return [`\n${indent}writer.WriteObjectValue(${valueExpr}, options);`];
  }

  const writeInfo = getWriteMethodInfo(type);
  if (!writeInfo) return null;

  const valuePart = writeInfo.valueTransform
    ? writeInfo.valueTransform(valueExpr)
    : valueExpr;
  const formatPart = writeInfo.formatArg ? `, "${writeInfo.formatArg}"` : "";

  return [
    `\n${indent}writer.${writeInfo.methodName}(${valuePart}${formatPart});`,
  ];
}

/**
 * Builds the dynamic array serialization (for loop with patch checks).
 * Returns an array of C# source lines.
 */
function buildDynamicArraySerialization(
  arrayType: SdkArrayType,
  valueExpr: string,
  jsonPath: PathExpr,
  indent: string,
  depth: number = 0,
): string[] | null {
  const itemType = arrayType.valueType;
  const unwrappedItemType = unwrapNullableType(itemType);
  const innerIndent = indent + "    ";
  const indexVar = getArrayIndexVarName(depth);
  const elementExpr = `${valueExpr}[${indexVar}]`;
  const isDynamicItem = isItemDynamicModel(itemType);
  const needsNull = collectionItemNeedsNullCheck(itemType);

  const elementJsonPath: PathExpr = {
    isStatic: false,
    path: `${jsonPath.path}[{${indexVar}}]`,
  };

  // Build item serialization
  let itemLines: string[] | null;

  if (unwrappedItemType.kind === "array") {
    const innerArrayLines = buildDynamicArraySerialization(
      unwrappedItemType as SdkArrayType,
      elementExpr,
      elementJsonPath,
      innerIndent,
      depth + 1,
    );
    if (innerArrayLines === null) return null;
    itemLines = [
      `\n${innerIndent}writer.WriteStartArray();`,
      ...innerArrayLines,
      `\n${innerIndent}Patch.WriteTo(writer, ${renderPath(elementJsonPath)});`,
      `\n${innerIndent}writer.WriteEndArray();`,
    ];
  } else if (unwrappedItemType.kind === "dict") {
    const dictLines = buildDynamicDictionarySerialization(
      unwrappedItemType as SdkDictionaryType,
      elementExpr,
      elementJsonPath,
      innerIndent,
      0,
    );
    if (dictLines === null) return null;
    itemLines = dictLines;
  } else {
    itemLines = buildValueWrite(itemType, elementExpr, innerIndent);
  }

  if (itemLines === null) return null;

  const lines: string[] = [];
  lines.push(
    `\n${indent}for (int ${indexVar} = 0; ${indexVar} < ${valueExpr}.Count; ${indexVar}++)`,
  );
  lines.push(`\n${indent}{`);

  // Element removal check
  if (isDynamicItem) {
    lines.push(`\n${innerIndent}if (${elementExpr}.Patch.IsRemoved("$"u8))`);
    lines.push(`\n${innerIndent}{`);
    lines.push(`\n${innerIndent}    continue;`);
    lines.push(`\n${innerIndent}}`);
  } else {
    lines.push(
      `\n${innerIndent}if (Patch.IsRemoved(${renderPath(elementJsonPath)}))`,
    );
    lines.push(`\n${innerIndent}{`);
    lines.push(`\n${innerIndent}    continue;`);
    lines.push(`\n${innerIndent}}`);
  }

  // Null check for reference type items
  if (needsNull) {
    lines.push(`\n${innerIndent}if (${elementExpr} == null)`);
    lines.push(`\n${innerIndent}{`);
    lines.push(`\n${innerIndent}    writer.WriteNullValue();`);
    lines.push(`\n${innerIndent}    continue;`);
    lines.push(`\n${innerIndent}}`);
  }

  lines.push(...itemLines);
  lines.push(`\n${indent}}`);

  return lines;
}

/**
 * Builds the dynamic dictionary serialization with per-key patch checks.
 * Returns an array of C# source lines.
 */
function buildDynamicDictionarySerialization(
  dictType: SdkDictionaryType,
  valueExpr: string,
  jsonPath: PathExpr,
  indent: string,
  depth: number = 0,
): string[] | null {
  const valueType = dictType.valueType;
  const unwrappedValueType = unwrapNullableType(valueType);
  const innerIndent = indent + "    ";
  const loopVar = getDictItemVarName(depth);
  const vars = getDictPatchVarNames(depth);

  // Nested key path
  const nestedJsonPath: PathExpr = {
    isStatic: false,
    path: `${jsonPath.path}[\\"{${loopVar}.Key}\\"]`,
  };

  // Build value serialization
  let valueLines: string[] | null;

  if (unwrappedValueType.kind === "dict") {
    valueLines = buildDynamicDictionarySerialization(
      unwrappedValueType as SdkDictionaryType,
      `${loopVar}.Value`,
      nestedJsonPath,
      innerIndent,
      depth + 1,
    );
  } else if (unwrappedValueType.kind === "array") {
    const arrayLines = buildDynamicArraySerialization(
      unwrappedValueType as SdkArrayType,
      `${loopVar}.Value`,
      nestedJsonPath,
      innerIndent,
      0,
    );
    if (arrayLines === null) return null;
    valueLines = [
      `\n${innerIndent}writer.WriteStartArray();`,
      ...arrayLines,
      `\n${innerIndent}Patch.WriteTo(writer, ${renderPath(nestedJsonPath)});`,
      `\n${innerIndent}writer.WriteEndArray();`,
    ];
  } else {
    valueLines = buildValueWrite(valueType, `${loopVar}.Value`, innerIndent);
  }

  if (valueLines === null) return null;

  const needsNull = collectionItemNeedsNullCheck(valueType);
  const lines: string[] = [];

  lines.push(`\n${indent}writer.WriteStartObject();`);
  lines.push(...buildBufferDeclaration(depth, indent));
  lines.push(`\n${indent}foreach (var ${loopVar} in ${valueExpr})`);
  lines.push(`\n${indent}{`);
  lines.push(
    ...buildDictPerKeyPatchCheck(jsonPath, loopVar, depth, innerIndent),
  );
  lines.push(`\n${innerIndent}if (!${vars.patchContains})`);
  lines.push(`\n${innerIndent}{`);
  lines.push(`\n${innerIndent}    writer.WritePropertyName(${loopVar}.Key);`);

  if (needsNull) {
    lines.push(`\n${innerIndent}    if (${loopVar}.Value == null)`);
    lines.push(`\n${innerIndent}    {`);
    lines.push(`\n${innerIndent}        writer.WriteNullValue();`);
    lines.push(`\n${innerIndent}        continue;`);
    lines.push(`\n${innerIndent}    }`);
  }

  lines.push(...valueLines);
  lines.push(`\n${innerIndent}}`);
  lines.push(`\n${indent}}`);
  lines.push(`\n`);
  lines.push(`\n${indent}Patch.WriteTo(writer, ${renderPath(jsonPath)});`);
  lines.push(`\n${indent}writer.WriteEndObject();`);

  return lines;
}

// ─── PROPERTY-LEVEL RENDERING ────────────────────────────────────────────────

/**
 * Builds the else-null branch for required-nullable properties.
 */
function buildElseNull(
  property: SdkModelPropertyType,
  serializedName: string,
): string[] {
  if (!isRequiredNullable(property)) return [];
  const readOnly = isPropertyReadOnly(property);
  const prefix = readOnly
    ? `\n    else if (options.Format != "W")`
    : "\n    else";
  return [
    prefix,
    "\n    {",
    `\n        writer.WriteNull("${serializedName}"u8);`,
    "\n    }",
  ];
}

/**
 * Builds patch-aware serialization lines for a simple property (primitive/model/enum).
 */
function buildDynamicSimpleProperty(
  property: SdkModelPropertyType,
  serializedName: string,
  csharpName: string,
): string[] | null {
  const unwrapped = unwrapNullableType(property.type);
  const isModel = unwrapped.kind === "model";

  if (isModel) {
    if (needsSerializationGuard(property)) {
      const condition = buildGuardCondition(property, csharpName);
      return [
        `\n    if (${condition} && !Patch.Contains("$.${serializedName}"u8))`,
        "\n    {",
        `\n        writer.WritePropertyName("${serializedName}"u8);`,
        `\n        writer.WriteObjectValue(${csharpName}, options);`,
        "\n    }",
        ...buildElseNull(property, serializedName),
      ];
    }
    return [
      `\n    if (!Patch.Contains("$.${serializedName}"u8))`,
      "\n    {",
      `\n        writer.WritePropertyName("${serializedName}"u8);`,
      `\n        writer.WriteObjectValue(${csharpName}, options);`,
      "\n    }",
    ];
  }

  // Primitive/enum
  const writeInfo = getWriteMethodInfo(property.type);
  if (!writeInfo) return null;

  const valueAccessor = needsNullableValueAccess(property) ? ".Value" : "";
  const valuePart = writeInfo.valueTransform
    ? writeInfo.valueTransform(csharpName + valueAccessor)
    : csharpName + valueAccessor;
  const formatPart = writeInfo.formatArg ? `, "${writeInfo.formatArg}"` : "";

  if (needsSerializationGuard(property)) {
    const condition = buildGuardCondition(property, csharpName);
    return [
      `\n    if (${condition} && !Patch.Contains("$.${serializedName}"u8))`,
      "\n    {",
      `\n        writer.WritePropertyName("${serializedName}"u8);`,
      `\n        writer.${writeInfo.methodName}(${valuePart}${formatPart});`,
      "\n    }",
      ...buildElseNull(property, serializedName),
    ];
  }

  return [
    `\n    if (!Patch.Contains("$.${serializedName}"u8))`,
    "\n    {",
    `\n        writer.WritePropertyName("${serializedName}"u8);`,
    `\n        writer.${writeInfo.methodName}(${valuePart}${formatPart});`,
    "\n    }",
  ];
}

/**
 * Builds patch-aware serialization lines for a list/array property.
 * Uses two-branch: Patch.Contains → raw, else → for loop with removal checks.
 */
function buildDynamicCollectionProperty(
  property: SdkModelPropertyType,
  arrayType: SdkArrayType,
  serializedName: string,
  csharpName: string,
): string[] | null {
  const jsonPath: PathExpr = { isStatic: true, path: `$.${serializedName}` };
  const hasGuard = needsSerializationGuard(property);
  const innerIndent = hasGuard ? "        " : "    ";

  const arrayLines = buildDynamicArraySerialization(
    arrayType,
    csharpName,
    jsonPath,
    innerIndent,
    0,
  );
  if (arrayLines === null) return null;

  // Branch 1: Patch contains entire collection → write raw
  const patchBranch: string[] = [
    `\n    if (Patch.Contains("$.${serializedName}"u8))`,
    "\n    {",
    `\n        if (!Patch.IsRemoved("$.${serializedName}"u8))`,
    "\n        {",
    `\n            writer.WritePropertyName("${serializedName}"u8);`,
    `\n            writer.WriteRawValue(Patch.GetJson("$.${serializedName}"u8));`,
    "\n        }",
    "\n    }",
  ];

  // Branch 2: Normal serialization with for loop
  if (hasGuard) {
    const condition = buildGuardCondition(property, csharpName);
    return [
      ...patchBranch,
      `\n    else if (${condition})`,
      "\n    {",
      `\n        writer.WritePropertyName("${serializedName}"u8);`,
      `\n        writer.WriteStartArray();`,
      ...arrayLines,
      `\n        Patch.WriteTo(writer, "$.${serializedName}"u8);`,
      `\n        writer.WriteEndArray();`,
      "\n    }",
      ...buildElseNull(property, serializedName),
    ];
  }

  return [
    ...patchBranch,
    "\n    else",
    "\n    {",
    `\n        writer.WritePropertyName("${serializedName}"u8);`,
    `\n        writer.WriteStartArray();`,
    ...arrayLines,
    `\n        Patch.WriteTo(writer, "$.${serializedName}"u8);`,
    `\n        writer.WriteEndArray();`,
    "\n    }",
  ];
}

/**
 * Builds patch-aware serialization lines for a dictionary property.
 * Wraps in !Patch.Contains with per-key checks inside.
 */
function buildDynamicDictionaryProperty(
  property: SdkModelPropertyType,
  dictType: SdkDictionaryType,
  serializedName: string,
  csharpName: string,
): string[] | null {
  const jsonPath: PathExpr = { isStatic: true, path: `$.${serializedName}` };

  if (needsSerializationGuard(property)) {
    const condition = buildGuardCondition(property, csharpName);
    const dictLines = buildDynamicDictionarySerialization(
      dictType,
      csharpName,
      jsonPath,
      "        ",
    );
    if (dictLines === null) return null;

    return [
      `\n    if (${condition} && !Patch.Contains("$.${serializedName}"u8))`,
      "\n    {",
      `\n        writer.WritePropertyName("${serializedName}"u8);`,
      ...dictLines,
      "\n    }",
      ...buildElseNull(property, serializedName),
    ];
  }

  const dictLines = buildDynamicDictionarySerialization(
    dictType,
    csharpName,
    jsonPath,
    "        ",
  );
  if (dictLines === null) return null;

  return [
    `\n    if (!Patch.Contains("$.${serializedName}"u8))`,
    "\n    {",
    `\n        writer.WritePropertyName("${serializedName}"u8);`,
    ...dictLines,
    "\n    }",
  ];
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

/**
 * Generates patch-aware serialization statements for a single property
 * in a dynamic (JSON Merge Patch) model.
 *
 * This component replaces WritePropertySerialization for dynamic models,
 * wrapping each property write in Patch.Contains/Patch.IsRemoved checks.
 *
 * The component uses a string-building approach internally to avoid complex
 * JSX nesting. The `using System.Text;` import for Encoding.UTF8.GetBytes()
 * is handled by ModelSerializationFile via its additionalUsings prop.
 */
export function DynamicWritePropertySerialization(
  props: DynamicWritePropertySerializationProps,
) {
  const namePolicy = useCSharpNamePolicy();
  const { property } = props;

  const serializedName = property.serializedName;
  const csharpName = namePolicy.getName(property.name, "class-property");

  const unwrapped = unwrapNullableType(property.type);

  let lines: string[] | null = null;

  if (unwrapped.kind === "array") {
    lines = buildDynamicCollectionProperty(
      property,
      unwrapped as SdkArrayType,
      serializedName,
      csharpName,
    );
  } else if (unwrapped.kind === "dict") {
    lines = buildDynamicDictionaryProperty(
      property,
      unwrapped as SdkDictionaryType,
      serializedName,
      csharpName,
    );
  } else {
    lines = buildDynamicSimpleProperty(property, serializedName, csharpName);
  }

  if (lines === null) return null;

  return <>{lines.join("")}</>;
}
