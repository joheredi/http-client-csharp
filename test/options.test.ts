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
      flavor: "azure",
      "api-version": "2024-01-01",
      "generate-protocol-methods": true,
      "generate-convenience-methods": false,
      "unreferenced-types-handling": "keepAll",
      "new-project": true,
      "save-inputs": true,
      "disable-xml-docs": true,
      "package-name": "MyClient",
      management: true,
      "enable-wire-path-attribute": true,
      "use-legacy-resource-detection": false,
      license: {
        name: "MIT",
        company: "Contoso",
        link: "https://example.com/license",
        header: "Copyright (c) Contoso",
        description: "MIT License",
      },
    };
    expect(opts.flavor).toBe("azure");
    expect(opts["api-version"]).toBe("2024-01-01");
    expect(opts["generate-protocol-methods"]).toBe(true);
    expect(opts["generate-convenience-methods"]).toBe(false);
    expect(opts["unreferenced-types-handling"]).toBe("keepAll");
    expect(opts["new-project"]).toBe(true);
    expect(opts["save-inputs"]).toBe(true);
    expect(opts["disable-xml-docs"]).toBe(true);
    expect(opts["package-name"]).toBe("MyClient");
    expect(opts.management).toBe(true);
    expect(opts["enable-wire-path-attribute"]).toBe(true);
    expect(opts["use-legacy-resource-detection"]).toBe(false);
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

  /**
   * Verifies the flavor enum values are correctly typed. These values control
   * whether Azure SDK or unbranded System.ClientModel code is generated —
   * an incorrect type would silently produce the wrong SDK flavor.
   */
  it("accepts all flavor enum values", () => {
    const azure: CSharpEmitterOptions = { flavor: "azure" };
    const unbranded: CSharpEmitterOptions = { flavor: "unbranded" };
    expect(azure.flavor).toBe("azure");
    expect(unbranded.flavor).toBe("unbranded");
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
      "flavor",
      "api-version",
      "generate-protocol-methods",
      "generate-convenience-methods",
      "unreferenced-types-handling",
      "new-project",
      "save-inputs",
      "disable-xml-docs",
      "package-name",
      "model-namespace",
      "license",
      "management",
      "enable-wire-path-attribute",
      "use-legacy-resource-detection",
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
   * Verifies the flavor schema uses the correct enum values.
   * An incorrect schema would cause the TypeSpec compiler to reject valid
   * flavor settings in tspconfig.yaml.
   */
  it("defines correct enum values for flavor", () => {
    const schema = CSharpEmitterOptionsSchema.properties["flavor"];
    expect(schema.enum).toEqual(["azure", "unbranded"]);
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

  /**
   * Verifies the management-plane schema properties are boolean-typed and
   * nullable. These options are consumed by phase-19 ARM features (resource
   * detection, property flattening, subscription-ID transformation).
   * Missing or incorrect schema types would cause TypeSpec to reject valid
   * mgmt tspconfig.yaml entries.
   */
  it("defines management-plane schema properties as nullable booleans", () => {
    const mgmt = CSharpEmitterOptionsSchema.properties["management"];
    expect(mgmt.type).toBe("boolean");
    expect(mgmt.nullable).toBe(true);

    const wirePath =
      CSharpEmitterOptionsSchema.properties["enable-wire-path-attribute"];
    expect(wirePath.type).toBe("boolean");
    expect(wirePath.nullable).toBe(true);

    const legacyDetection =
      CSharpEmitterOptionsSchema.properties["use-legacy-resource-detection"];
    expect(legacyDetection.type).toBe("boolean");
    expect(legacyDetection.nullable).toBe(true);
  });
});

describe("defaultOptions", () => {
  /**
   * Verifies default values match the legacy emitter's defaults.
   * This ensures backward compatibility — users upgrading from the legacy
   * emitter will get the same behavior without changing their config.
   */
  it("has correct default values matching legacy emitter", () => {
    expect(defaultOptions.flavor).toBe("unbranded");
    expect(defaultOptions["api-version"]).toBe("latest");
    expect(defaultOptions["generate-protocol-methods"]).toBe(true);
    expect(defaultOptions["generate-convenience-methods"]).toBe(true);
    expect(defaultOptions["new-project"]).toBe(false);
    expect(defaultOptions["save-inputs"]).toBe(false);
  });

  /**
   * Verifies management-plane option defaults match the legacy mgmt emitter.
   * - management: false (off by default — data-plane is the common case)
   * - enable-wire-path-attribute: false (opt-in, same as legacy mgmt emitter)
   * - use-legacy-resource-detection: true (matches legacy default behavior)
   * Incorrect defaults would silently change mgmt codegen behavior.
   */
  it("has correct default values for management-plane options", () => {
    expect(defaultOptions.management).toBe(false);
    expect(defaultOptions["enable-wire-path-attribute"]).toBe(false);
    expect(defaultOptions["use-legacy-resource-detection"]).toBe(true);
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

    expect(resolved.flavor).toBe("unbranded");
    expect(resolved["api-version"]).toBe("latest");
    expect(resolved["generate-protocol-methods"]).toBe(true);
    expect(resolved["generate-convenience-methods"]).toBe(true);
    expect(resolved["new-project"]).toBe(false);
    expect(resolved["save-inputs"]).toBe(false);
    // model-namespace defaults to false for unbranded flavor
    expect(resolved["model-namespace"]).toBe(false);
    // management-plane defaults
    expect(resolved.management).toBe(false);
    expect(resolved["enable-wire-path-attribute"]).toBe(false);
    expect(resolved["use-legacy-resource-detection"]).toBe(true);
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
   * Verifies that flavor can be overridden to "azure". This is the key
   * mechanism for enabling Azure SDK generation — the emit-e2e.ts script
   * passes flavor=azure for Azure specs.
   */
  it("user can override flavor to azure", () => {
    const mockContext = {
      options: {
        flavor: "azure",
      } as CSharpEmitterOptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resolved = resolveOptions(mockContext);

    expect(resolved.flavor).toBe("azure");
    // model-namespace defaults to true for azure flavor
    expect(resolved["model-namespace"]).toBe(true);
    // Non-overridden defaults should still apply
    expect(resolved["api-version"]).toBe("latest");
    expect(resolved["generate-protocol-methods"]).toBe(true);
  });

  /**
   * Verifies that model-namespace can be explicitly set to false even
   * when flavor is azure. This allows users to opt out of the Models
   * sub-namespace if their service has a custom namespace convention.
   */
  it("user can explicitly disable model-namespace for azure flavor", () => {
    const mockContext = {
      options: {
        flavor: "azure",
        "model-namespace": false,
      } as CSharpEmitterOptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resolved = resolveOptions(mockContext);

    expect(resolved.flavor).toBe("azure");
    expect(resolved["model-namespace"]).toBe(false);
  });

  /**
   * Verifies that model-namespace can be explicitly enabled for unbranded
   * flavor. While unusual, users may want Models sub-namespace for
   * non-Azure packages too.
   */
  it("user can explicitly enable model-namespace for unbranded flavor", () => {
    const mockContext = {
      options: {
        "model-namespace": true,
      } as CSharpEmitterOptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resolved = resolveOptions(mockContext);

    expect(resolved.flavor).toBe("unbranded");
    expect(resolved["model-namespace"]).toBe(true);
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

  /**
   * Verifies that management=true defaults model-namespace to true.
   * Management-plane libraries always use the .Models sub-namespace —
   * this default mirrors the legacy mgmt emitter which sets
   * `context.options["model-namespace"] ??= true`.
   */
  it("defaults model-namespace to true when management is true", () => {
    const mockContext = {
      options: {
        management: true,
      } as CSharpEmitterOptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resolved = resolveOptions(mockContext);

    expect(resolved.management).toBe(true);
    expect(resolved["model-namespace"]).toBe(true);
  });

  /**
   * Verifies that user can explicitly disable model-namespace even when
   * management is true. This supports edge cases where mgmt libraries
   * need a custom namespace layout.
   */
  it("user can explicitly disable model-namespace for management mode", () => {
    const mockContext = {
      options: {
        management: true,
        "model-namespace": false,
      } as CSharpEmitterOptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resolved = resolveOptions(mockContext);

    expect(resolved.management).toBe(true);
    expect(resolved["model-namespace"]).toBe(false);
  });

  /**
   * Verifies that management-plane sub-options (enable-wire-path-attribute,
   * use-legacy-resource-detection) pass through resolveOptions and override
   * their defaults. These options control ARM-specific code generation
   * behaviors in phase 19 tasks.
   */
  it("passes through management-plane sub-options", () => {
    const mockContext = {
      options: {
        flavor: "azure",
        management: true,
        "enable-wire-path-attribute": true,
        "use-legacy-resource-detection": false,
      } as CSharpEmitterOptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resolved = resolveOptions(mockContext);

    expect(resolved.management).toBe(true);
    expect(resolved["enable-wire-path-attribute"]).toBe(true);
    expect(resolved["use-legacy-resource-detection"]).toBe(false);
    // azure flavor + management both default model-namespace to true
    expect(resolved["model-namespace"]).toBe(true);
  });

  /**
   * Verifies that management-plane options retain their defaults when only
   * management=true is set. This is the typical mgmt tspconfig.yaml where
   * users enable mgmt mode but don't customise sub-options.
   */
  it("retains management sub-option defaults when only management is set", () => {
    const mockContext = {
      options: {
        flavor: "azure",
        management: true,
      } as CSharpEmitterOptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resolved = resolveOptions(mockContext);

    expect(resolved.management).toBe(true);
    expect(resolved["enable-wire-path-attribute"]).toBe(false);
    expect(resolved["use-legacy-resource-detection"]).toBe(true);
  });
});
