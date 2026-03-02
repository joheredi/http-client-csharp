import { describe, expect, it } from "vitest";
import {
  SCALAR_TYPE_OVERRIDES,
  EMITTER_FRAMEWORK_SCALAR_MAP,
  SCALAR_TO_CSHARP,
  getScalarOverride,
  getCSharpType,
  isOverriddenScalar,
} from "../src/utils/type-mapping.js";

/**
 * Tests for the type mapping audit utilities.
 *
 * These tests verify that the type mapping module correctly documents and
 * provides lookup functions for the gaps between the emitter-framework's
 * TypeExpression component and the legacy HTTP client C# emitter.
 *
 * Why these tests matter:
 * - They serve as a living document of all known type mapping gaps.
 * - They verify that the override mappings match the legacy emitter exactly.
 * - They ensure that the utility functions (getScalarOverride, getCSharpType,
 *   isOverriddenScalar) return correct results for all known scalars.
 * - They act as a regression guard: if the emitter-framework changes its
 *   default mappings, these tests will detect the drift.
 */
describe("Type Mapping Audit", () => {
  /**
   * Validates that SCALAR_TYPE_OVERRIDES contains exactly the scalars that
   * differ between the emitter-framework and the legacy emitter. This is
   * the core audit result — any change here means the gap analysis has changed.
   */
  describe("SCALAR_TYPE_OVERRIDES", () => {
    it("contains all 8 known scalar gaps", () => {
      expect(SCALAR_TYPE_OVERRIDES.size).toBe(8);
    });

    /**
     * bytes → BinaryData: The legacy emitter uses BinaryData (System namespace)
     * for binary content, not raw byte[]. BinaryData provides richer
     * serialization support and is the standard .NET type for opaque binary data
     * in cloud client libraries.
     */
    it("overrides bytes from byte[] to BinaryData", () => {
      expect(SCALAR_TYPE_OVERRIDES.get("bytes")).toBe("BinaryData");
    });

    /**
     * unknown → BinaryData: Unknown types are represented as BinaryData in the
     * legacy emitter for flexible serialization. This differs from the
     * emitter-framework's default of 'object'.
     */
    it("overrides unknown from object to BinaryData", () => {
      expect(SCALAR_TYPE_OVERRIDES.get("unknown")).toBe("BinaryData");
    });

    /**
     * integer → long: The base integer type (no size specified) maps to long
     * (64-bit) for safety in the legacy emitter, not int (32-bit) as the
     * emitter-framework defaults.
     */
    it("overrides integer from int to long", () => {
      expect(SCALAR_TYPE_OVERRIDES.get("integer")).toBe("long");
    });

    /**
     * numeric → double: The base numeric type maps to double for broad
     * compatibility in the legacy emitter, not decimal as the emitter-framework
     * defaults.
     */
    it("overrides numeric from decimal to double", () => {
      expect(SCALAR_TYPE_OVERRIDES.get("numeric")).toBe("double");
    });

    /**
     * float → double: The base float type (no size specified) maps to double
     * (64-bit) for safety in the legacy emitter, not float (32-bit).
     */
    it("overrides float from float to double", () => {
      expect(SCALAR_TYPE_OVERRIDES.get("float")).toBe("double");
    });

    /**
     * plainDate → DateTimeOffset: The legacy emitter uses DateTimeOffset for
     * backward compatibility rather than DateOnly (.NET 6+). This is a
     * deliberate choice to support older .NET target frameworks.
     */
    it("overrides plainDate from DateOnly to DateTimeOffset", () => {
      expect(SCALAR_TYPE_OVERRIDES.get("plainDate")).toBe("DateTimeOffset");
    });

    /**
     * plainTime → TimeSpan: The legacy emitter uses TimeSpan rather than
     * TimeOnly (.NET 6+) for backward compatibility with older .NET targets.
     */
    it("overrides plainTime from TimeOnly to TimeSpan", () => {
      expect(SCALAR_TYPE_OVERRIDES.get("plainTime")).toBe("TimeSpan");
    });

    /**
     * safeint → long: Safe integers (values exactly representable in IEEE 754
     * double) map to long in the legacy emitter for safety, not int.
     */
    it("overrides safeint from int to long", () => {
      expect(SCALAR_TYPE_OVERRIDES.get("safeint")).toBe("long");
    });
  });

  /**
   * Validates the emitter-framework's default mappings haven't changed.
   * If these fail, the emitter-framework has updated its type mappings and
   * the override analysis may need to be revisited.
   */
  describe("EMITTER_FRAMEWORK_SCALAR_MAP", () => {
    it("documents the emitter-framework defaults for overridden scalars", () => {
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("bytes")).toBe("byte[]");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("unknown")).toBe("object");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("integer")).toBe("int");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("numeric")).toBe("decimal");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("float")).toBe("float");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("plainDate")).toBe("DateOnly");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("plainTime")).toBe("TimeOnly");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("safeint")).toBe("int");
    });

    it("documents the emitter-framework defaults for correct scalars", () => {
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("string")).toBe("string");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("boolean")).toBe("bool");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("int32")).toBe("int");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("int64")).toBe("long");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("float32")).toBe("float");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("float64")).toBe("double");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("utcDateTime")).toBe(
        "DateTimeOffset",
      );
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("duration")).toBe("TimeSpan");
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.get("url")).toBe("Uri");
    });

    it("covers all 28 known scalar types", () => {
      expect(EMITTER_FRAMEWORK_SCALAR_MAP.size).toBe(28);
    });
  });

  /**
   * Validates the complete SCALAR_TO_CSHARP map which represents the final,
   * correct mapping that should appear in generated C# code.
   */
  describe("SCALAR_TO_CSHARP", () => {
    it("maps correct emitter-framework scalars unchanged", () => {
      expect(SCALAR_TO_CSHARP.get("string")).toBe("string");
      expect(SCALAR_TO_CSHARP.get("boolean")).toBe("bool");
      expect(SCALAR_TO_CSHARP.get("int32")).toBe("int");
      expect(SCALAR_TO_CSHARP.get("int64")).toBe("long");
      expect(SCALAR_TO_CSHARP.get("float32")).toBe("float");
      expect(SCALAR_TO_CSHARP.get("float64")).toBe("double");
      expect(SCALAR_TO_CSHARP.get("decimal")).toBe("decimal");
      expect(SCALAR_TO_CSHARP.get("decimal128")).toBe("decimal");
      expect(SCALAR_TO_CSHARP.get("utcDateTime")).toBe("DateTimeOffset");
      expect(SCALAR_TO_CSHARP.get("offsetDateTime")).toBe("DateTimeOffset");
      expect(SCALAR_TO_CSHARP.get("duration")).toBe("TimeSpan");
      expect(SCALAR_TO_CSHARP.get("url")).toBe("Uri");
    });

    it("maps overridden scalars to the legacy emitter values", () => {
      expect(SCALAR_TO_CSHARP.get("bytes")).toBe("BinaryData");
      expect(SCALAR_TO_CSHARP.get("unknown")).toBe("BinaryData");
      expect(SCALAR_TO_CSHARP.get("integer")).toBe("long");
      expect(SCALAR_TO_CSHARP.get("numeric")).toBe("double");
      expect(SCALAR_TO_CSHARP.get("float")).toBe("double");
      expect(SCALAR_TO_CSHARP.get("plainDate")).toBe("DateTimeOffset");
      expect(SCALAR_TO_CSHARP.get("plainTime")).toBe("TimeSpan");
      expect(SCALAR_TO_CSHARP.get("safeint")).toBe("long");
    });

    it("excludes non-value-type scalars (null, void, never)", () => {
      expect(SCALAR_TO_CSHARP.has("null")).toBe(false);
      expect(SCALAR_TO_CSHARP.has("void")).toBe(false);
      expect(SCALAR_TO_CSHARP.has("never")).toBe(false);
    });

    it("contains all integer variant mappings", () => {
      expect(SCALAR_TO_CSHARP.get("int8")).toBe("sbyte");
      expect(SCALAR_TO_CSHARP.get("uint8")).toBe("byte");
      expect(SCALAR_TO_CSHARP.get("int16")).toBe("short");
      expect(SCALAR_TO_CSHARP.get("uint16")).toBe("ushort");
      expect(SCALAR_TO_CSHARP.get("int32")).toBe("int");
      expect(SCALAR_TO_CSHARP.get("uint32")).toBe("uint");
      expect(SCALAR_TO_CSHARP.get("int64")).toBe("long");
      expect(SCALAR_TO_CSHARP.get("uint64")).toBe("ulong");
    });

    it("has 26 total entries (all value-type scalars)", () => {
      expect(SCALAR_TO_CSHARP.size).toBe(26);
    });
  });

  /**
   * Validates the getScalarOverride utility function which is the primary
   * lookup function for downstream tasks (1.1.2) to determine if a scalar
   * needs special handling.
   */
  describe("getScalarOverride", () => {
    it("returns the override type for scalars that need correction", () => {
      expect(getScalarOverride("bytes")).toBe("BinaryData");
      expect(getScalarOverride("unknown")).toBe("BinaryData");
      expect(getScalarOverride("integer")).toBe("long");
      expect(getScalarOverride("numeric")).toBe("double");
      expect(getScalarOverride("float")).toBe("double");
      expect(getScalarOverride("plainDate")).toBe("DateTimeOffset");
      expect(getScalarOverride("plainTime")).toBe("TimeSpan");
      expect(getScalarOverride("safeint")).toBe("long");
    });

    it("returns undefined for scalars that are already correct", () => {
      expect(getScalarOverride("string")).toBeUndefined();
      expect(getScalarOverride("boolean")).toBeUndefined();
      expect(getScalarOverride("int32")).toBeUndefined();
      expect(getScalarOverride("int64")).toBeUndefined();
      expect(getScalarOverride("float32")).toBeUndefined();
      expect(getScalarOverride("float64")).toBeUndefined();
      expect(getScalarOverride("utcDateTime")).toBeUndefined();
      expect(getScalarOverride("duration")).toBeUndefined();
      expect(getScalarOverride("url")).toBeUndefined();
    });

    it("returns undefined for unknown scalar names", () => {
      expect(getScalarOverride("customScalar")).toBeUndefined();
      expect(getScalarOverride("")).toBeUndefined();
    });
  });

  /**
   * Validates the getCSharpType utility function which provides the final
   * correct C# type for any TypeSpec scalar.
   */
  describe("getCSharpType", () => {
    it("returns the correct C# type for all known scalars", () => {
      // Spot-check a mix of overridden and non-overridden
      expect(getCSharpType("string")).toBe("string");
      expect(getCSharpType("bytes")).toBe("BinaryData");
      expect(getCSharpType("int32")).toBe("int");
      expect(getCSharpType("plainDate")).toBe("DateTimeOffset");
      expect(getCSharpType("float")).toBe("double");
      expect(getCSharpType("utcDateTime")).toBe("DateTimeOffset");
    });

    it("returns undefined for unknown scalars", () => {
      expect(getCSharpType("myCustomType")).toBeUndefined();
    });
  });

  /**
   * Validates the isOverriddenScalar predicate which is used to efficiently
   * check if a scalar needs special handling without retrieving the override value.
   */
  describe("isOverriddenScalar", () => {
    it("returns true for all overridden scalars", () => {
      expect(isOverriddenScalar("bytes")).toBe(true);
      expect(isOverriddenScalar("unknown")).toBe(true);
      expect(isOverriddenScalar("integer")).toBe(true);
      expect(isOverriddenScalar("numeric")).toBe(true);
      expect(isOverriddenScalar("float")).toBe(true);
      expect(isOverriddenScalar("plainDate")).toBe(true);
      expect(isOverriddenScalar("plainTime")).toBe(true);
      expect(isOverriddenScalar("safeint")).toBe(true);
    });

    it("returns false for correct scalars", () => {
      expect(isOverriddenScalar("string")).toBe(false);
      expect(isOverriddenScalar("boolean")).toBe(false);
      expect(isOverriddenScalar("int32")).toBe(false);
      expect(isOverriddenScalar("utcDateTime")).toBe(false);
    });

    it("returns false for unknown scalar names", () => {
      expect(isOverriddenScalar("notAScalar")).toBe(false);
    });
  });

  /**
   * Cross-validation: ensures consistency between SCALAR_TYPE_OVERRIDES,
   * EMITTER_FRAMEWORK_SCALAR_MAP, and SCALAR_TO_CSHARP. This catches any
   * inconsistency between the maps (e.g., an override that doesn't match
   * what SCALAR_TO_CSHARP says).
   */
  describe("cross-validation", () => {
    it("every override scalar has a different value in EF map vs SCALAR_TO_CSHARP", () => {
      for (const [scalar, override] of SCALAR_TYPE_OVERRIDES) {
        const efDefault = EMITTER_FRAMEWORK_SCALAR_MAP.get(scalar);
        const finalType = SCALAR_TO_CSHARP.get(scalar);
        expect(efDefault).toBeDefined();
        expect(finalType).toBe(override);
        expect(efDefault).not.toBe(override);
      }
    });

    it("every non-overridden scalar in SCALAR_TO_CSHARP matches the EF map", () => {
      for (const [scalar, csharpType] of SCALAR_TO_CSHARP) {
        if (!SCALAR_TYPE_OVERRIDES.has(scalar)) {
          const efDefault = EMITTER_FRAMEWORK_SCALAR_MAP.get(scalar);
          expect(csharpType).toBe(efDefault);
        }
      }
    });
  });
});
