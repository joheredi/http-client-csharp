import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the CodeGen attribute files.
 *
 * These tests verify that the emitter generates four C# attribute classes used
 * for customization support. Users annotate generated types with these
 * attributes to rename types/members, suppress generated members, and
 * customize serialization behavior.
 *
 * Generated files (all under `src/Generated/Internal/`):
 * - **CodeGenTypeAttribute** — Base attribute marking types with original names
 * - **CodeGenMemberAttribute** — Marks property/field members with original names
 * - **CodeGenSuppressAttribute** — Suppresses specific generated members
 * - **CodeGenSerializationAttribute** — Configures custom serialization hooks
 *
 * All files use the fixed namespace `Microsoft.TypeSpec.Generator.Customizations`,
 * NOT the package namespace. This matches the legacy emitter's behavior where
 * these attributes live in a standardized framework namespace.
 *
 * @module
 */

// --- Using directive ordering ---

describe("CodeGen attribute files using directive ordering", () => {
  /**
   * Verifies that `using System;` appears AFTER the `#nullable disable` directive,
   * not before the license header. This is critical because Alloy's SourceFile `using`
   * prop renders using directives at the very top of the file. The fix is to manually
   * place the using directive in the content after the header.
   *
   * When this test fails, it means the `using` prop was accidentally re-added to
   * `<SourceFile>` in CodeGenAttributeFiles.tsx.
   */
  const attributeFiles = [
    "CodeGenTypeAttribute",
    "CodeGenMemberAttribute",
    "CodeGenSuppressAttribute",
    "CodeGenSerializationAttribute",
  ];

  for (const attr of attributeFiles) {
    it(`${attr}.cs has using System after #nullable disable`, async () => {
      const [{ outputs }] = await HttpTester.compileAndDiagnose(`
        @service
        namespace TestService;
      `);
      const content = outputs[`src/Generated/Internal/${attr}.cs`];
      const nullableIdx = content.indexOf("#nullable disable");
      const usingIdx = content.indexOf("using System;");
      expect(nullableIdx).toBeGreaterThan(-1);
      expect(usingIdx).toBeGreaterThan(-1);
      expect(usingIdx).toBeGreaterThan(nullableIdx);
    });
  }
});

// --- CodeGenTypeAttribute ---

describe("CodeGenTypeAttributeFile", () => {
  /**
   * Verifies the file is generated at the expected path.
   * This path matches the legacy emitter output structure.
   */
  it("generates CodeGenTypeAttribute.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const key = Object.keys(outputs).find((k) =>
      k.endsWith("Internal/CodeGenTypeAttribute.cs"),
    );
    expect(key).toBe("src/Generated/Internal/CodeGenTypeAttribute.cs");
  });

  /**
   * Verifies the attribute uses the fixed customization namespace, NOT the
   * package namespace. This is important because these attributes are part
   * of the generator framework, not the service-specific generated code.
   */
  it("uses the fixed Customizations namespace", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace MyCustomPackage;
    `);
    const content = outputs["src/Generated/Internal/CodeGenTypeAttribute.cs"];
    expect(content).toContain(
      "namespace Microsoft.TypeSpec.Generator.Customizations",
    );
    // Must NOT contain the package namespace
    expect(content).not.toContain("namespace MyCustomPackage");
  });

  /**
   * Verifies the class declaration has the correct modifiers and base class.
   * The class must be internal partial and extend Attribute.
   */
  it("declares internal partial class extending Attribute", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/CodeGenTypeAttribute.cs"];
    expect(content).toContain(
      "internal partial class CodeGenTypeAttribute : Attribute",
    );
  });

  /**
   * Verifies the AttributeUsage targets Class, Enum, Struct — matching
   * the legacy emitter output exactly.
   */
  it("has correct AttributeUsage targeting Class, Enum, Struct", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/CodeGenTypeAttribute.cs"];
    expect(content).toContain("AttributeTargets.Class");
    expect(content).toContain("AttributeTargets.Enum");
    expect(content).toContain("AttributeTargets.Struct");
  });

  /**
   * Verifies the constructor and OriginalName property are present.
   * These are the core API surface of the attribute.
   */
  it("has constructor with originalName parameter and OriginalName property", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/CodeGenTypeAttribute.cs"];
    expect(content).toContain(
      "public CodeGenTypeAttribute(string originalName)",
    );
    expect(content).toContain("OriginalName = originalName;");
    expect(content).toContain("public string OriginalName { get; }");
  });
});

// --- CodeGenMemberAttribute ---

describe("CodeGenMemberAttributeFile", () => {
  /**
   * Verifies the file is generated at the expected path.
   */
  it("generates CodeGenMemberAttribute.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const key = Object.keys(outputs).find((k) =>
      k.endsWith("Internal/CodeGenMemberAttribute.cs"),
    );
    expect(key).toBe("src/Generated/Internal/CodeGenMemberAttribute.cs");
  });

  /**
   * Verifies the class inherits from CodeGenTypeAttribute, not Attribute.
   * This inheritance chain is important for the customization framework.
   */
  it("extends CodeGenTypeAttribute", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/CodeGenMemberAttribute.cs"];
    expect(content).toContain(
      "internal partial class CodeGenMemberAttribute : CodeGenTypeAttribute",
    );
  });

  /**
   * Verifies the AttributeUsage targets Property and Field — matching
   * the legacy emitter. This attribute is for members, not types.
   */
  it("targets Property and Field", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/CodeGenMemberAttribute.cs"];
    expect(content).toContain("AttributeTargets.Property");
    expect(content).toContain("AttributeTargets.Field");
  });

  /**
   * Verifies the constructor calls base(originalName) to delegate to
   * CodeGenTypeAttribute's constructor.
   */
  it("has constructor calling base(originalName)", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/CodeGenMemberAttribute.cs"];
    expect(content).toContain(
      "public CodeGenMemberAttribute(string originalName) : base(originalName)",
    );
  });
});

// --- CodeGenSuppressAttribute ---

describe("CodeGenSuppressAttributeFile", () => {
  /**
   * Verifies the file is generated at the expected path.
   */
  it("generates CodeGenSuppressAttribute.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const key = Object.keys(outputs).find((k) =>
      k.endsWith("Internal/CodeGenSuppressAttribute.cs"),
    );
    expect(key).toBe("src/Generated/Internal/CodeGenSuppressAttribute.cs");
  });

  /**
   * Verifies the class declaration is correct with Attribute base class.
   */
  it("declares internal partial class extending Attribute", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/CodeGenSuppressAttribute.cs"];
    expect(content).toContain(
      "internal partial class CodeGenSuppressAttribute : Attribute",
    );
  });

  /**
   * Verifies AllowMultiple = true is set on the attribute. This is important
   * because users may need to suppress multiple members on a single type.
   */
  it("has AllowMultiple = true in AttributeUsage", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/CodeGenSuppressAttribute.cs"];
    expect(content).toContain("AllowMultiple = true");
  });

  /**
   * Verifies the constructor accepts member name and params Type[] parameters,
   * and that the Member and Parameters properties are present.
   */
  it("has constructor with member and params parameters, and properties", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/CodeGenSuppressAttribute.cs"];
    expect(content).toContain(
      "public CodeGenSuppressAttribute(string member, params Type[] parameters)",
    );
    expect(content).toContain("public string Member { get; }");
    expect(content).toContain("public Type[] Parameters { get; }");
  });
});

// --- CodeGenSerializationAttribute ---

describe("CodeGenSerializationAttributeFile", () => {
  /**
   * Verifies the file is generated at the expected path.
   */
  it("generates CodeGenSerializationAttribute.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const key = Object.keys(outputs).find((k) =>
      k.endsWith("Internal/CodeGenSerializationAttribute.cs"),
    );
    expect(key).toBe("src/Generated/Internal/CodeGenSerializationAttribute.cs");
  });

  /**
   * Verifies AllowMultiple = true and Inherited = true are set.
   * AllowMultiple allows configuring multiple properties' serialization.
   * Inherited ensures derived types inherit the serialization configuration.
   */
  it("has AllowMultiple and Inherited in AttributeUsage", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/CodeGenSerializationAttribute.cs"];
    expect(content).toContain("AllowMultiple = true");
    expect(content).toContain("Inherited = true");
  });

  /**
   * Verifies both constructor overloads exist:
   * 1. One-parameter (propertyName only)
   * 2. Two-parameter (propertyName + serializationName)
   */
  it("has two constructor overloads", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/CodeGenSerializationAttribute.cs"];
    // Single-parameter constructor
    expect(content).toContain(
      "public CodeGenSerializationAttribute(string propertyName)",
    );
    // Two-parameter constructor
    expect(content).toContain(
      "public CodeGenSerializationAttribute(string propertyName, string serializationName)",
    );
  });

  /**
   * Verifies all four properties exist: PropertyName, SerializationName,
   * SerializationValueHook, DeserializationValueHook.
   * PropertyName is read-only (get only); the rest are settable.
   */
  it("has all four properties with correct accessors", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/CodeGenSerializationAttribute.cs"];
    expect(content).toContain("public string PropertyName { get; }");
    expect(content).toContain("public string SerializationName { get; set; }");
    expect(content).toContain(
      "public string SerializationValueHook { get; set; }",
    );
    expect(content).toContain(
      "public string DeserializationValueHook { get; set; }",
    );
  });

  /**
   * Verifies XML doc comments include the detailed hook method signatures.
   * These doc comments are important for IDE support and developer experience.
   */
  it("has detailed XML doc comments for hook properties", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/CodeGenSerializationAttribute.cs"];
    expect(content).toContain(
      "Gets or sets the method name to use when serializing",
    );
    expect(content).toContain(
      "Gets or sets the method name to use when deserializing",
    );
  });
});
