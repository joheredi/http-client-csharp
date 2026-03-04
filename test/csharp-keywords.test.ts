import { describe, expect, it } from "vitest";
import {
  escapeCSharpKeyword,
  isCSharpKeyword,
} from "../src/utils/csharp-keywords.js";

/**
 * Tests for the C# keyword escaping utility (csharp-keywords.ts).
 *
 * These tests validate that C# reserved and contextual keywords are correctly
 * detected and escaped with the `@` prefix. This is critical because unescaped
 * keyword identifiers produce invalid C# code (e.g., `int x = 5` is valid but
 * `int as = 5` is a syntax error — must be `int @as = 5`).
 *
 * The keyword list matches the legacy emitter's behavior (Roslyn SyntaxFacts),
 * which tests 101 keywords. Keeping this list consistent ensures the new emitter
 * generates the same escaping as the legacy emitter.
 */
describe("C# keyword escaping", () => {
  describe("isCSharpKeyword", () => {
    /**
     * Validates that common C# reserved keywords are correctly identified.
     * These are the keywords most likely to appear as TypeSpec model or
     * parameter names (e.g., the `special-words` spec uses `as`, `for`, `is`).
     */
    it("identifies reserved keywords", () => {
      const reservedKeywords = [
        "abstract",
        "as",
        "base",
        "bool",
        "break",
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
        "do",
        "double",
        "else",
        "enum",
        "event",
        "explicit",
        "extern",
        "false",
        "finally",
        "fixed",
        "float",
        "for",
        "foreach",
        "goto",
        "if",
        "implicit",
        "in",
        "int",
        "interface",
        "internal",
        "into",
        "is",
        "lock",
        "long",
        "namespace",
        "new",
        "null",
        "object",
        "operator",
        "out",
        "override",
        "params",
        "private",
        "protected",
        "public",
        "readonly",
        "ref",
        "return",
        "sbyte",
        "sealed",
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
        "unsafe",
        "ushort",
        "using",
        "virtual",
        "void",
        "volatile",
        "while",
      ];

      for (const keyword of reservedKeywords) {
        expect(
          isCSharpKeyword(keyword),
          `"${keyword}" should be a keyword`,
        ).toBe(true);
      }
    });

    /**
     * Validates that contextual keywords are also identified.
     * Contextual keywords like `async`, `await`, `var` are not reserved in all
     * positions, but when used as identifiers they need the `@` prefix to avoid
     * ambiguity in the C# parser.
     */
    it("identifies contextual keywords", () => {
      const contextualKeywords = [
        "add",
        "alias",
        "ascending",
        "async",
        "await",
        "by",
        "descending",
        "equals",
        "from",
        "get",
        "global",
        "join",
        "let",
        "nameof",
        "on",
        "partial",
        "remove",
        "set",
        "unmanaged",
        "var",
        "when",
        "where",
        "yield",
      ];

      for (const keyword of contextualKeywords) {
        expect(
          isCSharpKeyword(keyword),
          `"${keyword}" should be a keyword`,
        ).toBe(true);
      }
    });

    /**
     * Validates that `dynamic` is NOT treated as a keyword. The legacy emitter
     * (via Roslyn SyntaxFacts) excludes `dynamic` from the keyword list even
     * though it's contextual. We match this behavior for consistency.
     */
    it("does not treat 'dynamic' as a keyword (matches legacy emitter)", () => {
      expect(isCSharpKeyword("dynamic")).toBe(false);
    });

    /**
     * Validates that common non-keyword identifiers are not falsely detected.
     * PascalCase names (like class names) are never C# keywords since all
     * keywords are lowercase.
     */
    it("does not treat non-keywords as keywords", () => {
      const nonKeywords = [
        "widget",
        "Widget",
        "name",
        "value1",
        "myClass",
        "As",
        "For",
        "Is",
        "Return",
        "CONST",
        "hello",
        "foo",
      ];

      for (const name of nonKeywords) {
        expect(isCSharpKeyword(name), `"${name}" should not be a keyword`).toBe(
          false,
        );
      }
    });
  });

  describe("escapeCSharpKeyword", () => {
    /**
     * Validates that keyword identifiers get the `@` prefix. This is the
     * primary fix for the special-words spec where models named `As`, `For`,
     * `Is` etc. produce parameter names `as`, `for`, `is` that need escaping.
     */
    it("adds @ prefix to keywords", () => {
      expect(escapeCSharpKeyword("as")).toBe("@as");
      expect(escapeCSharpKeyword("for")).toBe("@for");
      expect(escapeCSharpKeyword("is")).toBe("@is");
      expect(escapeCSharpKeyword("class")).toBe("@class");
      expect(escapeCSharpKeyword("return")).toBe("@return");
      expect(escapeCSharpKeyword("if")).toBe("@if");
      expect(escapeCSharpKeyword("in")).toBe("@in");
      expect(escapeCSharpKeyword("while")).toBe("@while");
      expect(escapeCSharpKeyword("try")).toBe("@try");
      expect(escapeCSharpKeyword("break")).toBe("@break");
      expect(escapeCSharpKeyword("continue")).toBe("@continue");
      expect(escapeCSharpKeyword("else")).toBe("@else");
      expect(escapeCSharpKeyword("finally")).toBe("@finally");
      expect(escapeCSharpKeyword("async")).toBe("@async");
      expect(escapeCSharpKeyword("await")).toBe("@await");
    });

    /**
     * Validates that non-keyword identifiers pass through unchanged.
     * This ensures the escape function is safe to apply broadly without
     * altering valid identifiers.
     */
    it("does not modify non-keywords", () => {
      expect(escapeCSharpKeyword("widget")).toBe("widget");
      expect(escapeCSharpKeyword("name")).toBe("name");
      expect(escapeCSharpKeyword("count")).toBe("count");
      expect(escapeCSharpKeyword("Widget")).toBe("Widget");
      expect(escapeCSharpKeyword("As")).toBe("As");
      expect(escapeCSharpKeyword("For")).toBe("For");
    });

    /**
     * Validates that the function is case-sensitive. C# keywords are all
     * lowercase, so PascalCase names (typical for class/type names) should
     * never be escaped. This is important because the naming policy converts
     * "As" → "as" for parameters but "As" → "As" for classes.
     */
    it("is case-sensitive (PascalCase names are not keywords)", () => {
      expect(escapeCSharpKeyword("Class")).toBe("Class");
      expect(escapeCSharpKeyword("Return")).toBe("Return");
      expect(escapeCSharpKeyword("IF")).toBe("IF");
      expect(escapeCSharpKeyword("FOR")).toBe("FOR");
    });
  });
});
