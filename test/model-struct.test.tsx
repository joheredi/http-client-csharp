import { Output, render } from "@alloy-js/core";
import {
  ClassDeclaration,
  Namespace,
  SourceFile,
  StructDeclaration,
} from "@alloy-js/csharp";
import { describe, expect, it } from "vitest";
import { isModelStruct } from "../src/utils/model.js";

/**
 * Tests for model-as-struct support (task 1.2.8).
 *
 * These tests validate the infrastructure for generating C# `readonly struct`
 * declarations instead of `class` declarations when a model has
 * `modelAsStruct=true`.
 *
 * Why these tests matter:
 * - Struct models are value types in C# (stack-allocated, copied on assignment)
 * - The legacy emitter generates `public readonly partial struct` for these
 *   (ModelProvider.cs line 218: TypeSignatureModifiers.ReadOnly | Struct)
 * - All non-readonly properties must be constructor parameters for structs
 * - Structs cannot have base types or be abstract
 *
 * Testing strategy:
 * - `isModelStruct` utility: tested with unit tests (pure function)
 * - `isConstructorParameter` with isStruct=true: tested in property-utils.test.ts
 * - Struct rendering with StructDeclaration: tested via direct alloy rendering
 * - Full integration test (TypeSpec → struct C#): deferred until TCGC adds
 *   `modelAsStruct` to SdkModelType (the TypeSpec compiler loads emitter
 *   modules in its own context, preventing vi.mock from intercepting)
 */
describe("isModelStruct", () => {
  /**
   * Models without the modelAsStruct flag should not be structs.
   * This is the default behavior — all current TCGC models return false.
   */
  it("returns false for a model without modelAsStruct", () => {
    const model = { name: "Widget" } as any;
    expect(isModelStruct(model)).toBe(false);
  });

  /**
   * Models with modelAsStruct=true should be detected as structs.
   * This is forward-compatible with when TCGC adds the property.
   */
  it("returns true for a model with modelAsStruct=true", () => {
    const model = { name: "Point", modelAsStruct: true } as any;
    expect(isModelStruct(model)).toBe(true);
  });

  /**
   * Explicit modelAsStruct=false should not trigger struct generation.
   */
  it("returns false for a model with modelAsStruct=false", () => {
    const model = { name: "Widget", modelAsStruct: false } as any;
    expect(isModelStruct(model)).toBe(false);
  });

  /**
   * Non-boolean truthy values should not trigger struct generation.
   * Only explicit `true` is accepted to avoid accidental struct generation.
   */
  it("returns false for a model with modelAsStruct as truthy non-boolean", () => {
    const model = { name: "Widget", modelAsStruct: "yes" } as any;
    expect(isModelStruct(model)).toBe(false);
  });
});

/**
 * Tests that StructDeclaration from @alloy-js/csharp produces the correct
 * C# struct declaration syntax. This validates the rendering layer used
 * by ModelFile when generating struct models.
 *
 * These tests verify the direct alloy rendering (bypassing the TypeSpec
 * compiler) to ensure that:
 * - `readonly partial struct` syntax is correct
 * - Access modifiers (public/internal) work correctly
 * - Struct declarations are placed inside namespaces
 */
describe("StructDeclaration rendering", () => {
  /**
   * Validates that StructDeclaration with readonly+partial produces the
   * expected `public readonly partial struct` syntax. This matches the
   * legacy emitter's output for struct models (ModelProvider.cs line 218).
   */
  it("renders public readonly partial struct", () => {
    const result = render(
      <Output>
        <SourceFile path="Test.cs">
          <Namespace name="TestNamespace">
            <StructDeclaration public readonly partial name="Point" />
          </Namespace>
        </SourceFile>
      </Output>,
    );

    const content = (result.contents[0] as { contents: string }).contents;
    expect(content).toMatch(/public\s+readonly\s+partial\s+struct\s+Point/);
    expect(content).not.toContain("class");
  });

  /**
   * Validates that internal structs use the `internal` access modifier
   * instead of `public`, matching how internal models are generated.
   */
  it("renders internal readonly partial struct", () => {
    const result = render(
      <Output>
        <SourceFile path="Test.cs">
          <Namespace name="TestNamespace">
            <StructDeclaration internal readonly partial name="Config" />
          </Namespace>
        </SourceFile>
      </Output>,
    );

    const content = (result.contents[0] as { contents: string }).contents;
    expect(content).toMatch(/internal\s+readonly\s+partial\s+struct\s+Config/);
    expect(content).not.toContain("public");
  });

  /**
   * Validates that struct declarations are correctly nested inside a
   * namespace block, matching the file structure of generated model files.
   */
  it("renders struct inside namespace", () => {
    const result = render(
      <Output>
        <SourceFile path="Test.cs">
          <Namespace name="MyService.Models">
            <StructDeclaration public readonly partial name="Point" />
          </Namespace>
        </SourceFile>
      </Output>,
    );

    const content = (result.contents[0] as { contents: string }).contents;
    expect(content).toContain("namespace MyService.Models");
    expect(content).toMatch(/public\s+readonly\s+partial\s+struct\s+Point/);
  });

  /**
   * Validates that a class declaration (the default path) does NOT
   * produce struct syntax. This is a regression test ensuring the
   * branching logic in ModelFile correctly differentiates.
   */
  it("ClassDeclaration produces class, not struct", () => {
    const result = render(
      <Output>
        <SourceFile path="Test.cs">
          <Namespace name="TestNamespace">
            <ClassDeclaration public partial name="Widget" />
          </Namespace>
        </SourceFile>
      </Output>,
    );

    const content = (result.contents[0] as { contents: string }).contents;
    expect(content).toMatch(/public\s+partial\s+class\s+Widget/);
    expect(content).not.toContain("struct");
  });
});
