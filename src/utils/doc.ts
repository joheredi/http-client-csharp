/**
 * Ensures multiline documentation text is properly formatted for C# XML doc comments.
 *
 * When TypeSpec `@doc` content spans multiple lines, interpolating the raw text
 * into a `/// <tag>` string produces continuation lines that lack the `///` prefix,
 * breaking C# syntax. This function inserts `/// ` after every newline so that
 * all lines are valid XML doc comment lines.
 *
 * @example
 * ```ts
 * // Input:  "First line\nsecond line\nthird line"
 * // Output: "First line\n/// second line\n/// third line"
 * ```
 */
export function formatDocLines(text: string): string {
  return text.replace(/\n/g, "\n/// ");
}
