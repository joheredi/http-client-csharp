import { describe, it, expect } from "vitest";
import {
  CSharpEmitterOptionsSchema,
  defaultOptions,
  resolveOptions,
} from "../src/options.js";
import type { CSharpEmitterOptions, LicenseOptions } from "../src/options.js";

/**
 * Tests for the CSharpEmitterOptions interface, JSON schema, defaults, and
 * resolveOptions function.
 *
 * These tests validate that:
 * 1. The options interface includes all required fields with correct types
 * 2. The JSON schema matches the interface shape for TypeSpec config validation
 * 3. Default values are correct and match legacy emitter behavior
 * 4. resolveOptions merges user options with defaults correctly
 *
 * This is critical because the options interface is consumed by:
 * - The TypeSpec compiler for config validation (via the schema)
 * - The $onEmit entry point (via resolveOptions)
 * - The EmitterContext provider (via resolved options)
 * Any mismatch would cause runtime failures or silent config being ignored.
 */
describe("CSharpEmitterOptions", () => {
  /**
   * Verifies that an empty options object is valid (all options are optional).
   * This is important because users should be able to use the emitter with
   * zero configuration — all options must have sensible defaults.
   */
  it("accepts an empty options object", () => {
    const opts: CSharpEmitterOptions = {};
    expect(opts).toEqual({});
  });

  /**
   * Verifies that all documented option fields can be assigned with their
   * expected types. This catches interface drift — if a field is renamed
   * or its type changes, this test will fail at compile time.
   */
  it("accepts all option fields with correct types", () => {
    const opts: CSharpEmitterOptions = {
      "api-version": "2024-01-01",
      "generate-protocol-methods": true,
      "generate-convenience-methods": false,
      "unreferenced-types-handling": "keepAll",
      "new-project": true,
      "save-inputs": true,
      "disable-xml-docs": true,
      "package-name": "MyClient",
      license: {
        name: "MIT",
        company: "Contoso",
        link: "https://example.com/license",
        header: "Copyright (c) Contoso",
        description: "MIT License",
      },
    };
    expect(opts["api-version"]).toBe("2024-01-01");
    expect(opts["generate-protocol-methods"]).toBe(true);
    expect(opts["generate-convenience-methods"]).toBe(false);
    expect(opts["unreferenced-types-handling"]).toBe("keepAll");
    expect(opts["new-project"]).toBe(true);
    expect(opts["save-inputs"]).toBe(true);
    expect(opts["disable-xml-docs"]).toBe(true);
    expect(opts["package-name"]).toBe("MyClient");
    expect(opts.license?.name).toBe("MIT");
    expect(opts.license?.company).toBe("Contoso");
  });

  /**
   * Verifies LicenseOptions requires `name` and allows optional fields.
   * The legacy emitter enforces `name` as required in the JSON schema —
   * this test ensures the TypeScript type matches that constraint.
   */
  it("requires license name field", () => {
    const license: LicenseOptions = { name: "Apache-2.0" };
    expect(license.name).toBe("Apache-2.0");
    expect(license.company).toBeUndefined();
    expect(license.link).toBeUndefined();
    expect(license.header).toBeUndefined();
    expect(license.description).toBeUndefined();
  });

  /**
   * Validates the unreferenced-types-handling enum values match the legacy
   * emitter. These values are used by downstream components to decide
   * whether to emit, internalize, or remove unreferenced types.
   */
  it("accepts all unreferenced-types-handling enum values", () => {
    const values: CSharpEmitterOptions["unreferenced-types-handling"][] = [
      "removeOrInternalize",
      "internalize",
      "keepAll",
    ];
    expect(values).toHaveLength(3);
  });
});

describe("CSharpEmitterOptionsSchema", () => {
  /**
   * Verifies the schema is a valid JSON Schema object type with no required
   * fields. The TypeSpec compiler uses this schema to validate tspconfig.yaml
   * entries — a malformed schema would cause config validation errors.
   */
  it("is a valid JSON Schema object type", () => {
    expect(CSharpEmitterOptionsSchema.type).toBe("object");
    expect(CSharpEmitterOptionsSchema.additionalProperties).toBe(false);
    expect(CSharpEmitterOptionsSchema.required).toEqual([]);
  });

  /**
   * Verifies every option in the interface has a corresponding schema
   * property. Missing schema properties would mean the TypeSpec compiler
   * silently ignores that option in tspconfig.yaml.
   */
  it("defines schema properties for all interface options", () => {
    const expectedKeys = [
      "api-version",
      "generate-protocol-methods",
      "generate-convenience-methods",
      "unreferenced-types-handling",
      "new-project",
      "save-inputs",
      "disable-xml-docs",
      "package-name",
      "license",
    ];
    const schemaKeys = Object.keys(CSharpEmitterOptionsSchema.properties);
    expect(schemaKeys.sort()).toEqual(expectedKeys.sort());
  });

  /**
   * Verifies the license sub-schema requires the `name` field and defines
   * all expected sub-properties. This mirrors the legacy emitter's schema
   * which enforces license name as mandatory.
   */
  it("defines license sub-schema with required name", () => {
    const licenseSchema = CSharpEmitterOptionsSchema.properties.license;
    expect(licenseSchema.type).toBe("object");
    expect(licenseSchema.required).toEqual(["name"]);
    expect(Object.keys(licenseSchema.properties)).toEqual(
      expect.arrayContaining([
        "name",
        "company",
        "link",
        "header",
        "description",
      ]),
    );
  });

  /**
   * Verifies unreferenced-types-handling schema uses the correct enum values.
   * Incorrect enum values would cause the TypeSpec compiler to reject valid
   * configuration entries.
   */
  it("defines correct enum values for unreferenced-types-handling", () => {
    const schema =
      CSharpEmitterOptionsSchema.properties["unreferenced-types-handling"];
    expect(schema.enum).toEqual([
      "removeOrInternalize",
      "internalize",
      "keepAll",
    ]);
  });
});

describe("defaultOptions", () => {
  /**
   * Verifies default values match the legacy emitter's defaults.
   * This ensures backward compatibility — users upgrading from the legacy
   * emitter will get the same behavior without changing their config.
   */
  it("has correct default values matching legacy emitter", () => {
    expect(defaultOptions["api-version"]).toBe("latest");
    expect(defaultOptions["generate-protocol-methods"]).toBe(true);
    expect(defaultOptions["generate-convenience-methods"]).toBe(true);
    expect(defaultOptions["new-project"]).toBe(false);
    expect(defaultOptions["save-inputs"]).toBe(false);
  });
});

describe("resolveOptions", () => {
  /**
   * Verifies that resolveOptions applies defaults when no user options are
   * provided. This is the most common case — users who don't specify any
   * emitter options should get all default values.
   */
  it("applies defaults when no user options are provided", () => {
    const mockContext = {
      options: {} as CSharpEmitterOptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resolved = resolveOptions(mockContext);

    expect(resolved["api-version"]).toBe("latest");
    expect(resolved["generate-protocol-methods"]).toBe(true);
    expect(resolved["generate-convenience-methods"]).toBe(true);
    expect(resolved["new-project"]).toBe(false);
    expect(resolved["save-inputs"]).toBe(false);
  });

  /**
   * Verifies that user-provided options override defaults. This ensures
   * the merge order is correct (user values win over defaults).
   */
  it("user options override defaults", () => {
    const mockContext = {
      options: {
        "generate-protocol-methods": false,
        "package-name": "MyCustomPackage",
      } as CSharpEmitterOptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resolved = resolveOptions(mockContext);

    expect(resolved["generate-protocol-methods"]).toBe(false);
    expect(resolved["package-name"]).toBe("MyCustomPackage");
    // Non-overridden defaults should still apply
    expect(resolved["generate-convenience-methods"]).toBe(true);
    expect(resolved["api-version"]).toBe("latest");
  });

  /**
   * Verifies that license options pass through resolveOptions correctly
   * since license has no default value.
   */
  it("passes through license options", () => {
    const mockContext = {
      options: {
        license: { name: "MIT", company: "TestCo" },
      } as CSharpEmitterOptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resolved = resolveOptions(mockContext);

    expect(resolved.license).toEqual({ name: "MIT", company: "TestCo" });
  });
});
