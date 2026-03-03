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

import {
  findCustomCodeFiles,
  parseCustomCodeFile,
  scanCustomCode,
} from "../src/utils/custom-code-scanner.js";
import { createEmptyCustomCodeModel } from "../src/utils/custom-code-model.js";
import { isMemberSuppressed } from "../src/contexts/custom-code-context.js";

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
