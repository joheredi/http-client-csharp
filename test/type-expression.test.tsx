import { render } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/csharp";
import type { ModelProperty } from "@typespec/compiler";
import { Output } from "@typespec/emitter-framework";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { beforeEach, describe, expect, it } from "vitest";
import { CSharpScalarOverrides } from "../src/components/CSharpTypeExpression.js";
import { System } from "../src/builtins/system.js";
import { ApiTester, HttpTester } from "./test-host.js";

/**
 * Tests for the CSharpScalarOverrides provider component.
 *
 * These tests verify that the HTTP client C# emitter's type overrides are
 * correctly applied when TypeExpression renders scalar types. This is critical
 * because the emitter-framework's default TypeExpression maps some scalars to
 * different C# types than the legacy HTTP client C# emitter expects.
 *
 * Without these overrides:
 * - `bytes` would render as `byte[]` instead of `BinaryData`
 * - `integer` would render as `int` instead of `long`
 * - `plainDate` would render as `DateOnly` instead of `DateTimeOffset`
 * - etc.
 *
 * Each test compiles TypeSpec, extracts the scalar type, renders it through
 * TypeExpression wrapped in CSharpScalarOverrides, and verifies the output.
 */
describe("CSharpScalarOverrides", () => {
  let runner: Awaited<ReturnType<typeof ApiTester.createInstance>>;

  beforeEach(async () => {
    runner = await ApiTester.createInstance();
  });

  /**
   * Compiles TypeSpec with a model property of the given type and returns
   * the TypeSpec Type for that property. Uses the @test decorator to extract
   * the specific property from the compiled program.
   */
  async function getType(typeRef: string) {
    const { test } = await runner.compile(`
      model Test {
        @test test: ${typeRef};
      }
    `);
    return (test as ModelProperty).type;
  }

  /**
   * Renders a TypeExpression for the given type within a CSharpScalarOverrides
   * provider and returns the generated C# source text.
   */
  function renderType(type: Parameters<typeof TypeExpression>[0]["type"]) {
    const result = render(
      <Output program={runner.program}>
        <CSharpScalarOverrides>
          <SourceFile path="Test.cs">
            <TypeExpression type={type} />
          </SourceFile>
        </CSharpScalarOverrides>
      </Output>,
    );
    return (result.contents[0] as { contents: string }).contents;
  }

  /**
   * Renders a TypeExpression WITHOUT the override provider for comparison.
   * Used to verify that overrides are actually changing the output.
   */
  function renderTypeWithoutOverrides(
    type: Parameters<typeof TypeExpression>[0]["type"],
  ) {
    const result = render(
      <Output program={runner.program}>
        <SourceFile path="Test.cs">
          <TypeExpression type={type} />
        </SourceFile>
      </Output>,
    );
    return (result.contents[0] as { contents: string }).contents;
  }

  describe("scalar overrides", () => {
    /**
     * Verifies each scalar type override produces the correct C# type.
     * These mappings match the legacy HTTP client C# emitter's behavior:
     *
     * - bytes → BinaryData: richer serialization than byte[]
     * - integer → long: 64-bit safety for the abstract integer type
     * - safeint → long: IEEE 754 safe integer range
     * - numeric → double: broad compatibility vs decimal
     * - float → double: 64-bit safety for abstract float
     * - plainDate → DateTimeOffset: .NET backward compat (DateOnly needs .NET 6+)
     * - plainTime → TimeSpan: .NET backward compat (TimeOnly needs .NET 6+)
     * - duration → TimeSpan: override ensures using System; via refkey
     * - utcDateTime → DateTimeOffset: override ensures using System; via refkey
     * - offsetDateTime → DateTimeOffset: override ensures using System; via refkey
     * - url → Uri: override ensures using System; via refkey
     */
    it.each([
      ["bytes", "BinaryData"],
      ["integer", "long"],
      ["safeint", "long"],
      ["numeric", "double"],
      ["float", "double"],
      ["plainDate", "DateTimeOffset"],
      ["plainTime", "TimeSpan"],
      ["duration", "TimeSpan"],
      ["utcDateTime", "DateTimeOffset"],
      ["offsetDateTime", "DateTimeOffset"],
      ["url", "Uri"],
    ])("overrides %s to %s", async (tspType, csType) => {
      const type = await getType(tspType);
      const content = renderType(type);
      expect(content).toContain(csType);
    });

    /**
     * Verifies that `bytes` maps to `BinaryData` (not `byte[]`).
     * This is a critical override because the entire SCM serialization
     * pipeline assumes BinaryData for binary content.
     */
    it("bytes renders BinaryData, not byte[]", async () => {
      const type = await getType("bytes");
      const content = renderType(type);
      expect(content).toContain("BinaryData");
      expect(content).not.toContain("byte[]");
    });

    /**
     * Verifies that without the override provider, TypeExpression uses
     * the emitter-framework defaults. This proves the overrides are
     * actually changing behavior rather than matching the defaults.
     */
    it("without overrides, bytes renders as byte[]", async () => {
      const type = await getType("bytes");
      const content = renderTypeWithoutOverrides(type);
      expect(content).toContain("byte[]");
    });
  });

  describe("non-overridden scalars fall through", () => {
    /**
     * Verifies that scalars NOT in the override map still render correctly.
     * The override provider should fall through to TypeExpression's default
     * rendering for standard types.
     */
    it.each([
      ["string", "string"],
      ["int32", "int"],
      ["int64", "long"],
      ["float32", "float"],
      ["float64", "double"],
      ["boolean", "bool"],
    ])("passes through %s as %s", async (tspType, csType) => {
      const type = await getType(tspType);
      const content = renderType(type);
      expect(content).toContain(csType);
    });
  });

  describe("union type overrides", () => {
    /**
     * Multi-type named unions (e.g., `union Foo { string, int32 }`) have no
     * single C# type equivalent and should map to BinaryData. This matches the
     * legacy emitter's behavior for versioning scenarios where unions contain
     * heterogeneous scalar types (e.g., string + integer).
     */
    it("maps multi-type named union to BinaryData", async () => {
      const { test } = await runner.compile(`
        union MyUnion {
          string,
          int32,
        }
        model Test {
          @test test: MyUnion;
        }
      `);
      const type = (test as ModelProperty).type;
      const content = renderType(type);
      expect(content).toContain("BinaryData");
    });

    /**
     * Named unions with scalar types derived from different roots should also
     * map to BinaryData. V2Scalar extends int32, so string + V2Scalar is
     * multi-type (string root vs numeric root).
     */
    it("maps named union with derived scalars to BinaryData", async () => {
      const { test } = await runner.compile(`
        scalar V2Scalar extends int32;
        union MyUnion {
          string,
          V2Scalar,
        }
        model Test {
          @test test: MyUnion;
        }
      `);
      const type = (test as ModelProperty).type;
      const content = renderType(type);
      expect(content).toContain("BinaryData");
    });

    /**
     * Unnamed multi-type unions created via TypeSpec aliases (e.g.,
     * `alias MixedTypesUnion = Cat | "a" | int32 | boolean`) should map to
     * BinaryData. TypeSpec aliases are transparent — the union has no `name`.
     * Without this fix, the override falls through to `efCsharpRefkey` which
     * creates an unresolved symbol.
     *
     * This is the primary fix for task 12.2.5: the type/union spec uses
     * aliases like `MixedTypesUnion`, `MixedLiteralsUnion`, etc. that
     * produce unnamed multi-type unions.
     */
    it("maps unnamed multi-type alias union to BinaryData", async () => {
      const { test } = await runner.compile(`
        model Cat {
          name: string;
        }
        alias MixedTypesUnion = Cat | "a" | int32 | boolean;
        model Test {
          @test test: MixedTypesUnion;
        }
      `);
      const type = (test as ModelProperty).type;
      const content = renderType(type);
      expect(content).toContain("BinaryData");
      expect(content).not.toContain("Unresolved");
    });

    /**
     * Mixed literal unions (e.g., `"a" | 2 | 3.3 | true`) combine string,
     * number, and boolean literals. These have different base kinds so they
     * should map to BinaryData. The legacy emitter maps MixedLiteralsCases
     * properties to BinaryData.
     *
     * Without this fix, all four properties of MixedLiteralsCases would
     * contain unresolved refkey symbols.
     */
    it("maps mixed literal type union to BinaryData", async () => {
      const { test } = await runner.compile(`
        alias MixedLiterals = "a" | 2 | 3.3 | true;
        model Test {
          @test test: MixedLiterals;
        }
      `);
      const type = (test as ModelProperty).type;
      const content = renderType(type);
      expect(content).toContain("BinaryData");
      expect(content).not.toContain("Unresolved");
    });

    /**
     * Inline unions mixing a scalar with an array type (e.g., `string | string[]`)
     * should map to BinaryData. The `string` variant is a scalar (kind "string")
     * and `string[]` is a Model (templated Array), so they have different base
     * kinds.
     *
     * The type/union spec's StringAndArrayCases model uses this pattern.
     */
    it("maps inline scalar+array union to BinaryData", async () => {
      const { test } = await runner.compile(`
        model Test {
          @test test: string | string[];
        }
      `);
      const type = (test as ModelProperty).type;
      const content = renderType(type);
      expect(content).toContain("BinaryData");
      expect(content).not.toContain("Unresolved");
    });

    /**
     * Single-type unnamed unions (e.g., `"red" | "blue"`) where all variants
     * share the same base kind should NOT map to BinaryData. These are
     * extensible enum patterns that TCGC converts to SdkEnumType.
     * This test ensures the fix for multi-type unions doesn't break
     * single-type union handling.
     */
    it("does not map single-type literal union to BinaryData", async () => {
      const { test } = await runner.compile(`
        model Test {
          @test test: "red" | "blue" | "green";
        }
      `);
      const type = (test as ModelProperty).type;
      const content = renderType(type);
      expect(content).not.toContain("BinaryData");
    });

    /**
     * Union of multiple model types (e.g., `Cat | Dog`) should map to
     * BinaryData. Even though all variants share the Model base kind,
     * model unions cannot be extensible enums. The legacy emitter maps
     * `ModelsOnlyUnion = Cat | Dog` to BinaryData.
     *
     * Without this, GetResponse5.Prop in the type/union spec would have
     * unresolved refkey symbols.
     */
    it("maps model-only union to BinaryData", async () => {
      const { test } = await runner.compile(`
        model Cat { name: string; }
        model Dog { bark: string; }
        model Test {
          @test test: Cat | Dog;
        }
      `);
      const type = (test as ModelProperty).type;
      const content = renderType(type);
      expect(content).toContain("BinaryData");
      expect(content).not.toContain("Unresolved");
    });
  });

  describe("BinaryData library declaration", () => {
    /**
     * Verifies that System.BinaryData from the builtins library is properly
     * declared and accessible. This is important because BinaryData is not in
     * @alloy-js/csharp builtins and needs a custom library declaration.
     * Using the single System library from builtins (rather than a separate
     * SystemBinaryData library) avoids refkey conflicts that cause BinaryData_2
     * naming in generated model files.
     */
    it("System.BinaryData is defined", () => {
      expect(System.BinaryData).toBeDefined();
    });

    /**
     * Verifies that referencing BinaryData in a SourceFile produces
     * the correct `using System;` directive. This ensures that generated
     * C# code compiles when BinaryData is used as a type.
     */
    it("generates using System when BinaryData is referenced", async () => {
      const type = await getType("bytes");
      const content = renderType(type);
      expect(content).toContain("using System;");
      expect(content).toContain("BinaryData");
    });
  });

  describe("union variant type overrides", () => {
    /**
     * Verifies that a UnionVariant used as a property type (e.g.,
     * `ExtendedEnum.EnumValue2`) resolves to the parent union/extensible
     * enum type in C#. Without this override, the emitter crashes with
     * "Unsupported type for TypeExpression: UnionVariant" because the
     * emitter-framework's TypeExpression does not handle UnionVariant
     * nodes natively. The override maps the variant to the parent union
     * type, matching the legacy emitter's behavior where `ExtendedEnum.EnumValue2`
     * produces a property of type `ExtendedEnum`.
     */
    it("maps named union variant to parent union type", async () => {
      const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
        using TypeSpec.Http;

        @service
        namespace TestNamespace;

        union ExtendedEnum {
          string,
          EnumValue2: "value2",
        }

        model TestModel {
          property: ExtendedEnum.EnumValue2;
        }

        @route("/test")
        op test(): TestModel;
      `);

      expect(diagnostics).toHaveLength(0);

      // Find the generated model file
      const modelFileKey = Object.keys(outputs).find(
        (k) => k.includes("TestModel") && !k.includes("Serialization"),
      );
      expect(modelFileKey).toBeDefined();

      const modelFile = outputs[modelFileKey!];
      // The property type should be ExtendedEnum (parent union), not a string literal
      expect(modelFile).toContain("ExtendedEnum");
      expect(modelFile).not.toContain("UnionVariant");
      expect(modelFile).not.toContain("Unresolved");
    });
  });
});
