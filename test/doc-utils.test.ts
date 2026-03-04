import { describe, expect, it } from "vitest";
import { ensureTrailingPeriod, formatDocLines } from "../src/utils/doc.js";

/**
 * Tests for the formatDocLines utility (src/utils/doc.ts).
 *
 * These tests verify that multiline documentation text is properly formatted
 * for C# XML doc comments. Without this formatting, continuation lines in
 * `/// <param>` and `/// <summary>` tags would lack the `///` prefix,
 * producing invalid C# that fails compilation.
 *
 * Why these tests matter:
 * - TypeSpec `@doc` decorators can contain multiline text that gets interpolated
 *   into `///` comment lines — each continuation line MUST start with `///`.
 * - This is a silent correctness bug: the TypeScript emitter succeeds but
 *   the generated C# won't compile.
 */
describe("formatDocLines", () => {
  /**
   * Single-line text should pass through unchanged since there are no
   * continuation lines to prefix.
   */
  it("returns single-line text unchanged", () => {
    expect(formatDocLines("Hello world.")).toBe("Hello world.");
  });

  /**
   * The core case: multi-line text must have `/// ` inserted after every
   * newline so each continuation line is a valid XML doc comment line.
   */
  it("prefixes continuation lines with /// for multiline text", () => {
    const input = "First line\nsecond line\nthird line";
    const expected = "First line\n/// second line\n/// third line";
    expect(formatDocLines(input)).toBe(expected);
  });

  /**
   * Verifies formatting works in the context of a `<param>` tag,
   * matching the broken pattern observed in ConditionalRequestClient.cs.
   */
  it("produces valid param doc when interpolated", () => {
    const doc =
      "A timestamp indicating the last modified time of the resource known to the\nclient. The operation will be performed only if the resource on the service has\nbeen modified since the specified time.";
    const result = `/// <param name="ifModifiedSince"> ${formatDocLines(doc)} </param>`;
    expect(result).toContain("/// client.");
    expect(result).toContain("/// been modified");
    expect(result).not.toMatch(/\nclient\./);
  });

  /**
   * Verifies formatting works in the context of a `<summary>` tag,
   * matching the broken pattern observed in ServiceClient.cs.
   */
  it("produces valid summary doc when interpolated", () => {
    const doc = "Line one.\nLine two.\nLine three.";
    const result = `/// <summary> ${formatDocLines(doc)} </summary>`;
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("/// <summary> Line one.");
    expect(lines[1]).toBe("/// Line two.");
    expect(lines[2]).toBe("/// Line three. </summary>");
  });

  /**
   * Empty string edge case — should return empty string without error.
   */
  it("handles empty string", () => {
    expect(formatDocLines("")).toBe("");
  });

  /**
   * Text with only a single trailing newline — ensures trailing newline
   * also gets the prefix.
   */
  it("handles trailing newline", () => {
    expect(formatDocLines("text\n")).toBe("text\n/// ");
  });
});

/**
 * Tests for the ensureTrailingPeriod utility (src/utils/doc.ts).
 *
 * The legacy emitter (XmlDocStatement.GetPeriodOrEmpty) always terminates
 * single-line summary comments with a period. TCGC's doc/summary fields
 * carry the raw TypeSpec text which may or may not already include a period.
 * These tests verify the utility correctly normalises text so the generated
 * C# matches the golden file convention.
 *
 * Why these tests matter:
 * - Every property and member summary in the golden output ends with a period.
 *   Missing periods cause diff failures in scenario tests and break SDK
 *   documentation consistency.
 */
describe("ensureTrailingPeriod", () => {
  /**
   * Text without a period should get one appended. This is the primary
   * case: TCGC returns "Name of the animal" and the golden file expects
   * "Name of the animal."
   */
  it("appends a period when text does not end with one", () => {
    expect(ensureTrailingPeriod("Name of the animal")).toBe(
      "Name of the animal.",
    );
  });

  /**
   * Text that already ends with a period should not get a second one.
   * This avoids producing "Name of the animal.." in summaries.
   */
  it("does not double-add a period when text already ends with one", () => {
    expect(ensureTrailingPeriod("Name of the animal.")).toBe(
      "Name of the animal.",
    );
  });

  /**
   * Empty string edge case — should return empty string without error.
   * An empty doc value should not produce a lone period.
   */
  it("returns empty string unchanged", () => {
    expect(ensureTrailingPeriod("")).toBe("");
  });

  /**
   * Single word without period — verifies the simplest non-empty case.
   */
  it("appends period to single word", () => {
    expect(ensureTrailingPeriod("Widget")).toBe("Widget.");
  });

  /**
   * Text ending with other punctuation (e.g., question mark) should
   * still get a period, matching the legacy emitter's behaviour.
   */
  it("appends period even when text ends with other punctuation", () => {
    expect(ensureTrailingPeriod("Is this a widget?")).toBe(
      "Is this a widget?.",
    );
  });
});
