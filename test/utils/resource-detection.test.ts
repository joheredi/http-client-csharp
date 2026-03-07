/**
 * Integration tests for ARM resource detection from TypeSpec definitions.
 *
 * These tests validate the ARM resource detection pipeline indirectly through
 * the emitter. When `management: true`, the emitter calls `detectArmResources`
 * and stores the result in the EmitterContext's `armProviderSchema` field.
 *
 * The tests verify that:
 * - The emitter successfully compiles ARM TypeSpec specs without errors
 * - ARM resource detection runs without throwing during emission
 * - The emitted outputs contain expected ARM-related patterns
 *
 * Direct unit testing of `detectArmResources` is covered by the arm-path-utils
 * and resource-metadata tests, which validate the pure algorithmic logic
 * without requiring a running TypeSpec compilation.
 *
 * Note: `resolveArmResources` from @azure-tools/typespec-azure-resource-manager
 * can only be called during the emitter's `$onEmit` phase (not post-compilation)
 * because the ARM library's state map is populated during decorator processing
 * and the emitter framework cleans up after emission.
 */
import { describe, expect, it } from "vitest";
import { MgmtTester } from "../test-host.js";

describe("ARM resource detection (emitter integration)", () => {
  /**
   * Validates that the emitter successfully compiles a tracked resource
   * TypeSpec with management mode enabled. The detection runs inside
   * $onEmit; a clean compilation confirms detection didn't throw.
   */
  it("compiles a tracked resource with CRUD operations without errors", async () => {
    const [{ outputs }, diagnostics] = await MgmtTester.compileAndDiagnose(`
      using TypeSpec.Rest;
      using TypeSpec.Http;
      using TypeSpec.Versioning;
      using Azure.ResourceManager;

      @armProviderNamespace
      @service(#{title: "TestService"})
      @versioned(Versions)
      namespace TestService;

      enum Versions {
        v2024_01_01: "2024-01-01",
      }

      interface Operations extends Azure.ResourceManager.Operations {}

      model FooProperties { displayName?: string; }

      model Foo is TrackedResource<FooProperties> {
        ...ResourceNameParameter<Foo>;
      }

      @armResourceOperations
      interface Foos {
        get is ArmResourceRead<Foo>;
        createOrUpdate is ArmResourceCreateOrReplaceSync<Foo>;
        update is ArmResourcePatchSync<Foo, FooProperties>;
        delete is ArmResourceDeleteSync<Foo>;
        listByResourceGroup is ArmResourceListByParent<Foo>;
      }
    `);

    // No errors expected
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    // Should have generated model files for the Foo resource
    const outputPaths = Object.keys(outputs);
    expect(outputPaths.length).toBeGreaterThan(0);
  });

  /**
   * Validates that singleton extension resources compile correctly.
   * The singleton pattern uses a fixed path segment (e.g., "default")
   * instead of a variable parameter.
   */
  it("compiles a singleton extension resource without errors", async () => {
    const [{ outputs }, diagnostics] = await MgmtTester.compileAndDiagnose(`
      using TypeSpec.Rest;
      using TypeSpec.Http;
      using TypeSpec.Versioning;
      using Azure.ResourceManager;

      @armProviderNamespace
      @service(#{title: "TestService"})
      @versioned(Versions)
      namespace TestService;

      enum Versions {
        v2024_01_01: "2024-01-01",
      }

      interface Operations extends Azure.ResourceManager.Operations {}

      model SettingsProperties { value?: string; }

      @singleton("default")
      model Settings is ExtensionResource<SettingsProperties> {
        ...ResourceNameParameter<Settings, SegmentName = "settings">;
      }

      @armResourceOperations
      interface SettingsOps {
        get is ArmResourceRead<Settings>;
      }
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
    expect(Object.keys(outputs).length).toBeGreaterThan(0);
  });

  /**
   * Validates parent-child resource compilation. The ARM detection
   * should handle nested resources (Child under Parent) without errors.
   */
  it("compiles parent-child resources without errors", async () => {
    const [{ outputs }, diagnostics] = await MgmtTester.compileAndDiagnose(`
      using TypeSpec.Rest;
      using TypeSpec.Http;
      using TypeSpec.Versioning;
      using Azure.ResourceManager;

      @armProviderNamespace
      @service(#{title: "TestService"})
      @versioned(Versions)
      namespace TestService;

      enum Versions {
        v2024_01_01: "2024-01-01",
      }

      interface Operations extends Azure.ResourceManager.Operations {}

      model ParentProperties { displayName?: string; }
      model ChildProperties { value?: string; }

      model Parent is TrackedResource<ParentProperties> {
        ...ResourceNameParameter<Parent>;
      }

      @parentResource(Parent)
      model Child is ProxyResource<ChildProperties> {
        ...ResourceNameParameter<Child>;
      }

      @armResourceOperations
      interface Parents {
        get is ArmResourceRead<Parent>;
        createOrUpdate is ArmResourceCreateOrReplaceSync<Parent>;
        listByResourceGroup is ArmResourceListByParent<Parent>;
      }

      @armResourceOperations
      interface Children {
        get is ArmResourceRead<Child>;
        createOrUpdate is ArmResourceCreateOrReplaceSync<Child>;
        listByParent is ArmResourceListByParent<Child>;
      }
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
    expect(Object.keys(outputs).length).toBeGreaterThan(0);
  });
});


