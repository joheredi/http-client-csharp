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

/**
 * Ensures that a documentation string ends with a period.
 *
 * The legacy emitter's XmlDocStatement.GetPeriodOrEmpty() adds a trailing period
 * to single-line summary comments when absent. TCGC's `doc` and `summary` fields
 * carry the raw text from TypeSpec `@doc` decorators, which may or may not include
 * a trailing period. Golden files consistently end property summaries with a period,
 * so this function normalises the text to match.
 *
 * @example
 * ```ts
 * ensureTrailingPeriod("Name of the animal")   // "Name of the animal."
 * ensureTrailingPeriod("Name of the animal.")  // "Name of the animal."
 * ensureTrailingPeriod("")                      // ""
 * ```
 */
export function ensureTrailingPeriod(text: string): string {
  if (text.length === 0) return text;
  return text.endsWith(".") ? text : text + ".";
}
