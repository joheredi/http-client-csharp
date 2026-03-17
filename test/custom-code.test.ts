/**
 * Tests for the custom code scanner and context.
 *
 * These tests verify that the emitter can detect user-written partial classes
 * and their CodeGen attributes, then use that information to filter generated
 * members. This is critical for the regeneration workflow where users have
 * customized generated code via partial classes.
 *
 * @module
 */
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";

import {
  findCustomCodeFiles,
  parseCustomCodeFile,
  scanCustomCode,
} from "../src/utils/custom-code-scanner.js";
import { createEmptyCustomCodeModel } from "../src/utils/custom-code-model.js";
import { isMemberSuppressed } from "../src/contexts/custom-code-context.js";
import { getCustomNamespace } from "../src/contexts/custom-code-context.js";

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `custom-code-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("parseCustomCodeFile", () => {
  /**
   * Tests that a basic partial class declaration is recognized and its
   * name is correctly extracted. This is the foundation — if this fails,
   * no custom code awareness works.
   */
  it("parses a basic partial class declaration", () => {
    const content = `
namespace MyNamespace
{
    public partial class MyModel
    {
        public string CustomProp { get; set; }
    }
}`;

    const result = parseCustomCodeFile(content);
    expect(result).toHaveLength(1);
    expect(result[0].declaredName).toBe("MyModel");
    expect(result[0].originalName).toBe("MyModel");
    expect(result[0].namespace).toBe("MyNamespace");
    expect(result[0].members).toHaveLength(1);
    expect(result[0].members[0].declaredName).toBe("CustomProp");
  });

  /**
   * Tests [CodeGenType("OrigName")] attribute parsing. This attribute tells
   * the emitter that the custom class replaces the generated type with
   * the given original name. Without this, type renaming won't work.
   */
  it("parses CodeGenType attribute for type renaming", () => {
    const content = `
namespace SampleTypeSpec.Models
{
    [CodeGenType("RenamedModel")]
    public partial class RenamedModelCustom
    {
    }
}`;

    const result = parseCustomCodeFile(content);
    expect(result).toHaveLength(1);
    expect(result[0].declaredName).toBe("RenamedModelCustom");
    expect(result[0].originalName).toBe("RenamedModel");
    expect(result[0].namespace).toBe("SampleTypeSpec.Models");
  });

  /**
   * Tests [CodeGenMember("OrigName")] attribute parsing. This attribute
   * indicates the user is replacing a generated property with their own
   * version (possibly renamed). The emitter must suppress the original.
   */
  it("parses CodeGenMember attribute for property renaming", () => {
    const content = `
namespace SampleTypeSpec.Models
{
    public partial class Thing
    {
        [CodeGenMember("Name")]
        public string? Rename { get; set; }
    }
}`;

    const result = parseCustomCodeFile(content);
    expect(result).toHaveLength(1);
    expect(result[0].declaredName).toBe("Thing");
    expect(result[0].members).toHaveLength(1);
    expect(result[0].members[0].declaredName).toBe("Rename");
    expect(result[0].members[0].originalName).toBe("Name");
  });

  /**
   * Tests [CodeGenSuppress("MemberName")] attribute parsing. This explicitly
   * tells the emitter to skip generating a specific member, which is the
   * most direct form of customization.
   */
  it("parses CodeGenSuppress attribute", () => {
    const content = `
namespace MyNamespace
{
    [CodeGenSuppress("ToString")]
    [CodeGenSuppress("Create", typeof(string), typeof(int))]
    public partial class MyModel
    {
    }
}`;

    const result = parseCustomCodeFile(content);
    expect(result).toHaveLength(1);
    expect(result[0].suppressedMembers).toHaveLength(2);
    expect(result[0].suppressedMembers[0].memberName).toBe("ToString");
    expect(result[0].suppressedMembers[0].parameterTypes).toBeUndefined();
    expect(result[0].suppressedMembers[1].memberName).toBe("Create");
    expect(result[0].suppressedMembers[1].parameterTypes).toEqual([
      "string",
      "int",
    ]);
  });

  /**
   * Tests [CodeGenSerialization("PropName", "serializationName")] parsing.
   * This attribute customizes how a property is serialized/deserialized,
   * allowing users to override the default JSON property name or hook
   * custom serialization methods.
   */
  it("parses CodeGenSerialization attribute", () => {
    const content = `
namespace MyNamespace
{
    [CodeGenSerialization("MyProp", "my_prop", SerializationValueHook = "SerializeMyProp", DeserializationValueHook = "DeserializeMyProp")]
    public partial class MyModel
    {
    }
}`;

    const result = parseCustomCodeFile(content);
    expect(result).toHaveLength(1);
    expect(result[0].serializationOverrides).toHaveLength(1);
    const override = result[0].serializationOverrides[0];
    expect(override.propertyName).toBe("MyProp");
    expect(override.serializationName).toBe("my_prop");
    expect(override.serializationValueHook).toBe("SerializeMyProp");
    expect(override.deserializationValueHook).toBe("DeserializeMyProp");
  });

  /**
   * Tests that file-scoped namespaces (C# 10+) are parsed correctly.
   * Many modern C# projects use this syntax instead of braced namespaces.
   */
  it("parses file-scoped namespace", () => {
    const content = `
namespace SampleTypeSpec.Models;

public partial class MyModel
{
    public string Prop { get; set; }
}`;

    const result = parseCustomCodeFile(content);
    expect(result).toHaveLength(1);
    expect(result[0].namespace).toBe("SampleTypeSpec.Models");
    expect(result[0].declaredName).toBe("MyModel");
  });

  /**
   * Tests that multiple partial classes in the same file are all parsed.
   * Users may declare multiple custom types in a single file.
   */
  it("parses multiple partial classes in one file", () => {
    const content = `
namespace MyNamespace
{
    public partial class ModelA
    {
        public string PropA { get; set; }
    }

    public partial class ModelB
    {
        public int PropB { get; set; }
    }
}`;

    const result = parseCustomCodeFile(content);
    expect(result).toHaveLength(2);
    expect(result[0].declaredName).toBe("ModelA");
    expect(result[1].declaredName).toBe("ModelB");
  });

  /**
   * Tests that internal partial classes are recognized (not just public).
   * Generated types can have internal visibility.
   */
  it("parses internal partial class", () => {
    const content = `
namespace MyNamespace
{
    internal partial class InternalModel
    {
        public string Prop { get; set; }
    }
}`;

    const result = parseCustomCodeFile(content);
    expect(result).toHaveLength(1);
    expect(result[0].declaredName).toBe("InternalModel");
  });

  /**
   * Tests that files without partial class declarations produce empty results.
   * Not all .cs files in the project are custom code.
   */
  it("returns empty array for file without partial classes", () => {
    const content = `
namespace MyNamespace
{
    public class RegularClass
    {
        public string Prop { get; set; }
    }
}`;

    const result = parseCustomCodeFile(content);
    expect(result).toHaveLength(0);
  });

  /**
   * Tests parsing of partial structs (not just classes). The emitter
   * generates readonly partial structs for some model types.
   */
  it("parses partial struct declarations", () => {
    const content = `
namespace MyNamespace
{
    public partial struct MyStruct
    {
        public int Value { get; set; }
    }
}`;

    const result = parseCustomCodeFile(content);
    expect(result).toHaveLength(1);
    expect(result[0].declaredName).toBe("MyStruct");
  });
});

describe("findCustomCodeFiles", () => {
  /**
   * Tests that the scanner finds .cs files in subdirectories but
   * excludes the Generated/ directory. This is the core file discovery
   * logic that prevents the scanner from reading its own output.
   */
  it("finds .cs files excluding Generated/ directory", async () => {
    // Create test directory structure
    const srcDir = join(testDir, "src");
    await mkdir(join(srcDir, "Custom"), { recursive: true });
    await mkdir(join(srcDir, "Generated", "Models"), { recursive: true });

    // Custom file (should be found)
    await writeFile(join(srcDir, "Custom", "MyModel.cs"), "// custom");
    // Generated file (should be excluded)
    await writeFile(
      join(srcDir, "Generated", "Models", "MyModel.cs"),
      "// generated",
    );

    const files = await findCustomCodeFiles(srcDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("Custom");
    expect(files[0]).not.toContain("Generated");
  });

  /**
   * Tests that non-.cs files are ignored. The scanner should only
   * read C# source files.
   */
  it("ignores non-.cs files", async () => {
    const srcDir = join(testDir, "src");
    await mkdir(join(srcDir, "Custom"), { recursive: true });

    await writeFile(join(srcDir, "Custom", "readme.md"), "# readme");
    await writeFile(join(srcDir, "Custom", "model.json"), "{}");
    await writeFile(join(srcDir, "Custom", "MyModel.cs"), "// custom");

    const files = await findCustomCodeFiles(srcDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.cs$/);
  });

  /**
   * Tests that the scanner handles a non-existent directory gracefully.
   * In a fresh project, src/ may not exist yet.
   */
  it("returns empty array for non-existent directory", async () => {
    const files = await findCustomCodeFiles(join(testDir, "nonexistent"));
    expect(files).toHaveLength(0);
  });
});

describe("scanCustomCode", () => {
  /**
   * Tests the full scanning pipeline end-to-end: creates a realistic
   * directory structure with custom code, scans it, and verifies the
   * resulting model. This validates the integration between file
   * discovery and parsing.
   */
  it("scans output directory and builds custom code model", async () => {
    const srcDir = join(testDir, "src");
    await mkdir(join(srcDir, "Custom"), { recursive: true });
    await mkdir(join(srcDir, "Generated"), { recursive: true });

    await writeFile(
      join(srcDir, "Custom", "Thing.cs"),
      `
namespace SampleTypeSpec.Models
{
    public partial class Thing
    {
        [CodeGenMember("Name")]
        public string? Rename { get; set; }
    }
}`,
    );

    const model = await scanCustomCode(testDir);
    expect(model.types.size).toBe(1);
    expect(model.types.has("Thing")).toBe(true);

    const thingType = model.types.get("Thing")!;
    expect(thingType.members).toHaveLength(1);
    expect(thingType.members[0].originalName).toBe("Name");
    expect(thingType.members[0].declaredName).toBe("Rename");
  });

  /**
   * Tests that CodeGenType attribute correctly maps the custom type
   * to its original generated name in the model lookup.
   */
  it("maps CodeGenType types by original name", async () => {
    const srcDir = join(testDir, "src");
    await mkdir(join(srcDir, "Custom"), { recursive: true });

    await writeFile(
      join(srcDir, "Custom", "RenamedModelCustom.cs"),
      `
namespace SampleTypeSpec.Models
{
    [CodeGenType("RenamedModel")]
    public partial class RenamedModelCustom
    {
    }
}`,
    );

    const model = await scanCustomCode(testDir);
    expect(model.types.has("RenamedModel")).toBe(true);
    expect(model.types.get("RenamedModel")!.declaredName).toBe(
      "RenamedModelCustom",
    );
  });

  /**
   * Tests that scanning returns an empty model when no custom code
   * exists. This is the common case for fresh projects.
   */
  it("returns empty model when no custom code exists", async () => {
    const model = await scanCustomCode(testDir);
    expect(model.types.size).toBe(0);
  });
});

describe("isMemberSuppressed", () => {
  /**
   * Tests that a property is suppressed when a custom class has
   * [CodeGenMember("PropertyName")] pointing to it. This is the
   * primary mechanism for users to replace generated properties.
   */
  it("returns true for CodeGenMember-targeted properties", () => {
    const model = createEmptyCustomCodeModel();
    model.types.set("Thing", {
      declaredName: "Thing",
      originalName: "Thing",
      members: [{ declaredName: "Rename", originalName: "Name" }],
      suppressedMembers: [],
      serializationOverrides: [],
    });

    expect(isMemberSuppressed(model, "Thing", "Name")).toBe(true);
    expect(isMemberSuppressed(model, "Thing", "Rename")).toBe(false);
    expect(isMemberSuppressed(model, "Thing", "Other")).toBe(false);
  });

  /**
   * Tests that a property is suppressed when explicitly listed in
   * [CodeGenSuppress("PropertyName")]. This is the direct suppression
   * mechanism.
   */
  it("returns true for CodeGenSuppress-targeted members", () => {
    const model = createEmptyCustomCodeModel();
    model.types.set("MyModel", {
      declaredName: "MyModel",
      originalName: "MyModel",
      members: [],
      suppressedMembers: [{ memberName: "ToString" }],
      serializationOverrides: [],
    });

    expect(isMemberSuppressed(model, "MyModel", "ToString")).toBe(true);
    expect(isMemberSuppressed(model, "MyModel", "Other")).toBe(false);
  });

  /**
   * Tests that isMemberSuppressed returns false when no custom code
   * model is provided. Components should generate normally without
   * custom code awareness.
   */
  it("returns false when custom code model is undefined", () => {
    expect(isMemberSuppressed(undefined, "Thing", "Name")).toBe(false);
  });

  /**
   * Tests that isMemberSuppressed returns false for types that have
   * no custom code entry. Most types won't have custom code.
   */
  it("returns false for types not in custom code model", () => {
    const model = createEmptyCustomCodeModel();
    expect(isMemberSuppressed(model, "Unknown", "Prop")).toBe(false);
  });
});

describe("getCustomNamespace", () => {
  /**
   * Tests that a custom namespace is returned when a custom partial class
   * declares a different namespace for a generated type. This is the core
   * mechanism that enables the legacy emitter's "custom namespace" pattern
   * (e.g., Friend model placed in SampleTypeSpec.Models.Custom via
   * [CodeGenType("Friend")] in a custom file with that namespace).
   */
  it("returns custom namespace when type has one", () => {
    const model = createEmptyCustomCodeModel();
    model.types.set("Friend", {
      declaredName: "Friend",
      originalName: "Friend",
      namespace: "SampleTypeSpec.Models.Custom",
      members: [],
      suppressedMembers: [],
      serializationOverrides: [],
    });

    expect(getCustomNamespace(model, "Friend")).toBe(
      "SampleTypeSpec.Models.Custom",
    );
  });

  /**
   * Tests that undefined is returned when a custom type exists but has
   * no namespace override. Most custom types declare in the same namespace
   * as the generated code and don't need an override.
   */
  it("returns undefined when type has no namespace", () => {
    const model = createEmptyCustomCodeModel();
    model.types.set("Widget", {
      declaredName: "Widget",
      originalName: "Widget",
      members: [],
      suppressedMembers: [],
      serializationOverrides: [],
    });

    expect(getCustomNamespace(model, "Widget")).toBeUndefined();
  });

  /**
   * Tests that undefined is returned when no custom code model is provided.
   * Components should use the default TCGC namespace in this case.
   */
  it("returns undefined when custom code model is undefined", () => {
    expect(getCustomNamespace(undefined, "Friend")).toBeUndefined();
  });

  /**
   * Tests that undefined is returned for types not in the custom code model.
   * Most generated types won't have custom code entries.
   */
  it("returns undefined for types not in custom code model", () => {
    const model = createEmptyCustomCodeModel();
    expect(getCustomNamespace(model, "Unknown")).toBeUndefined();
  });
});

/**
 * Tests for applyCustomCodeRenames — the pre-processing step in the emitter
 * that mutates TCGC model names to match custom code declared names.
 *
 * This is critical for the @clientName + custom code interaction:
 * When TypeSpec uses @clientName("RenamedModel") and user writes
 * [CodeGenType("RenamedModel")] on class RenamedModelCustom, the
 * generated code must use "RenamedModelCustom" everywhere.
 */
describe("applyCustomCodeRenames", () => {
  // Lazy import to avoid circular dependency issues
  let applyCustomCodeRenames: typeof import("../src/emitter.js").applyCustomCodeRenames;

  beforeEach(async () => {
    const mod = await import("../src/emitter.js");
    applyCustomCodeRenames = mod.applyCustomCodeRenames;
  });

  /**
   * Core scenario: custom code declares [CodeGenType("RenamedModel")] on
   * class RenamedModelCustom. The model name should be mutated from
   * "RenamedModel" to "RenamedModelCustom".
   */
  it("renames model when custom code has a different declaredName", () => {
    const model = { name: "RenamedModel" } as unknown as SdkModelType;
    const customCode = createEmptyCustomCodeModel();
    customCode.types.set("RenamedModel", {
      declaredName: "RenamedModelCustom",
      originalName: "RenamedModel",
      members: [],
      suppressedMembers: [],
      serializationOverrides: [],
    });

    applyCustomCodeRenames([model], customCode);

    expect(model.name).toBe("RenamedModelCustom");
  });

  /**
   * When a rename is applied, the custom code map should also include
   * an entry under the new name so that downstream lookups
   * (isMemberSuppressed, getCustomNamespace) work correctly.
   */
  it("adds custom code entry under the new name for downstream lookups", () => {
    const model = { name: "RenamedModel" } as unknown as SdkModelType;
    const customCode = createEmptyCustomCodeModel();
    const typeInfo = {
      declaredName: "RenamedModelCustom",
      originalName: "RenamedModel",
      namespace: "Custom.Namespace",
      members: [],
      suppressedMembers: [],
      serializationOverrides: [],
    };
    customCode.types.set("RenamedModel", typeInfo);

    applyCustomCodeRenames([model], customCode);

    // Lookup by the new name should return the same typeInfo
    expect(customCode.types.get("RenamedModelCustom")).toBe(typeInfo);
    // Lookup by the old name should still work too
    expect(customCode.types.get("RenamedModel")).toBe(typeInfo);
  });

  /**
   * Models without any custom code should not be affected.
   * This is the common case for most models.
   */
  it("does not rename models without custom code entries", () => {
    const model = { name: "Widget" } as unknown as SdkModelType;
    const customCode = createEmptyCustomCodeModel();

    applyCustomCodeRenames([model], customCode);

    expect(model.name).toBe("Widget");
  });

  /**
   * When a custom partial class has the same name as the generated type
   * (declaredName === originalName, i.e., no [CodeGenType] attribute),
   * the model should NOT be renamed.
   */
  it("does not rename when declaredName equals originalName", () => {
    const model = { name: "Friend" } as unknown as SdkModelType;
    const customCode = createEmptyCustomCodeModel();
    customCode.types.set("Friend", {
      declaredName: "Friend",
      originalName: "Friend",
      members: [],
      suppressedMembers: [],
      serializationOverrides: [],
    });

    applyCustomCodeRenames([model], customCode);

    expect(model.name).toBe("Friend");
  });

  /**
   * Multiple models can have renames. Verify that the function processes
   * all of them, including models that should and shouldn't be renamed.
   */
  it("handles multiple models with mixed rename scenarios", () => {
    const model1 = { name: "RenamedModel" } as unknown as SdkModelType;
    const model2 = { name: "Widget" } as unknown as SdkModelType;
    const model3 = { name: "AnotherRename" } as unknown as SdkModelType;
    const customCode = createEmptyCustomCodeModel();
    customCode.types.set("RenamedModel", {
      declaredName: "RenamedModelCustom",
      originalName: "RenamedModel",
      members: [],
      suppressedMembers: [],
      serializationOverrides: [],
    });
    customCode.types.set("AnotherRename", {
      declaredName: "AnotherRenameCustom",
      originalName: "AnotherRename",
      members: [],
      suppressedMembers: [],
      serializationOverrides: [],
    });

    applyCustomCodeRenames([model1, model2, model3], customCode);

    expect(model1.name).toBe("RenamedModelCustom");
    expect(model2.name).toBe("Widget");
    expect(model3.name).toBe("AnotherRenameCustom");
  });

  /**
   * When custom code has an empty types map (fresh project without custom code),
   * no models should be renamed. This is a no-op.
   */
  it("is a no-op when custom code has no types", () => {
    const model = { name: "Widget" } as unknown as SdkModelType;
    const customCode = createEmptyCustomCodeModel();

    applyCustomCodeRenames([model], customCode);

    expect(model.name).toBe("Widget");
  });
});
