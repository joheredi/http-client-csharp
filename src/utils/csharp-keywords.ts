/**
 * C# reserved and contextual keyword handling.
 *
 * Provides utilities for escaping C# identifiers that collide with language
 * keywords. In C#, reserved keywords can be used as identifiers by prefixing
 * them with `@` (e.g., `@class`, `@return`, `@as`).
 *
 * The keyword list matches the legacy emitter's behavior, which uses Roslyn's
 * `SyntaxFacts.GetKeywordKind()` and `SyntaxFacts.GetContextualKeywordKind()`
 * to determine whether an identifier needs escaping.
 *
 * @module
 */

/**
 * Set of all C# reserved and contextual keywords that require `@` prefix
 * escaping when used as identifiers.
 *
 * This list includes both reserved keywords (e.g., `class`, `for`, `if`) and
 * contextual keywords (e.g., `async`, `await`, `var`, `get`, `set`). The
 * notable exclusion is `dynamic`, which is a contextual keyword but does not
 * require escaping per the legacy emitter's behavior.
 *
 * Source: Microsoft.CodeAnalysis.CSharp.SyntaxFacts (Roslyn), validated against
 * the legacy emitter's CSharpTypeTests.cs which tests 101 keywords.
 */
const csharpKeywords: ReadonlySet<string> = new Set([
  "abstract",
  "add",
  "alias",
  "as",
  "ascending",
  "async",
  "await",
  "base",
  "bool",
  "break",
  "by",
  "byte",
  "case",
  "catch",
  "char",
  "checked",
  "class",
  "const",
  "continue",
  "decimal",
  "default",
  "delegate",
  "descending",
  "do",
  "double",
  "else",
  "enum",
  "equals",
  "event",
  "explicit",
  "extern",
  "false",
  "finally",
  "fixed",
  "float",
  "for",
  "foreach",
  "from",
  "get",
  "global",
  "goto",
  "if",
  "implicit",
  "in",
  "int",
  "interface",
  "internal",
  "into",
  "is",
  "join",
  "let",
  "lock",
  "long",
  "nameof",
  "namespace",
  "new",
  "null",
  "object",
  "on",
  "operator",
  "out",
  "override",
  "params",
  "partial",
  "private",
  "protected",
  "public",
  "readonly",
  "ref",
  "remove",
  "return",
  "sbyte",
  "sealed",
  "set",
  "short",
  "sizeof",
  "stackalloc",
  "static",
  "string",
  "struct",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "uint",
  "ulong",
  "unchecked",
  "unmanaged",
  "unsafe",
  "ushort",
  "using",
  "var",
  "virtual",
  "void",
  "volatile",
  "when",
  "where",
  "while",
  "yield",
]);

/**
 * Returns whether the given name is a C# reserved or contextual keyword.
 *
 * @param name - The identifier to check (case-sensitive, should be lowercase for keyword matching).
 * @returns `true` if the name is a C# keyword that needs `@` prefix escaping.
 */
export function isCSharpKeyword(name: string): boolean {
  return csharpKeywords.has(name);
}

/**
 * Escapes a C# identifier by prepending `@` if it collides with a C# keyword.
 *
 * In C#, reserved keywords can be used as identifiers when prefixed with `@`.
 * For example, `as` is a keyword, but `@as` is a valid parameter name.
 * Non-keyword names are returned unchanged.
 *
 * @param name - The identifier name (typically after case conversion via naming policy).
 * @returns The name prefixed with `@` if it is a C# keyword, otherwise unchanged.
 *
 * @example
 * ```ts
 * escapeCSharpKeyword("as")       // → "@as"
 * escapeCSharpKeyword("widget")   // → "widget"
 * escapeCSharpKeyword("class")    // → "@class"
 * escapeCSharpKeyword("Widget")   // → "Widget" (PascalCase, not a keyword)
 * ```
 */
export function escapeCSharpKeyword(name: string): string {
  if (csharpKeywords.has(name)) {
    return `@${name}`;
  }
  return name;
}
