import { render } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/csharp";
import type { ModelProperty } from "@typespec/compiler";
import { Output } from "@typespec/emitter-framework";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CSharpScalarOverrides,
  SystemBinaryData,
} from "../src/components/CSharpTypeExpression.js";
import { ApiTester } from "./test-host.js";

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
     */
    it.each([
      ["bytes", "BinaryData"],
      ["integer", "long"],
      ["safeint", "long"],
      ["numeric", "double"],
      ["float", "double"],
      ["plainDate", "DateTimeOffset"],
      ["plainTime", "TimeSpan"],
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
      ["url", "Uri"],
      ["utcDateTime", "DateTimeOffset"],
      ["duration", "TimeSpan"],
    ])("passes through %s as %s", async (tspType, csType) => {
      const type = await getType(tspType);
      const content = renderType(type);
      expect(content).toContain(csType);
    });
  });

  describe("BinaryData library declaration", () => {
    /**
     * Verifies that the SystemBinaryData library is properly declared
     * and accessible. This is important because BinaryData is not in
     * @alloy-js/csharp builtins and needs a custom library declaration.
     */
    it("SystemBinaryData.BinaryData is defined", () => {
      expect(SystemBinaryData.BinaryData).toBeDefined();
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
});
