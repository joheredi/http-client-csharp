import { describe, expect, it } from "vitest";
import { formatDocLines } from "../src/utils/doc.js";

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
