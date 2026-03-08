/**
 * Azure.Core scalar serialization helpers.
 *
 * Azure.Core defines TypeSpec scalars (eTag, azureLocation, armResourceIdentifier,
 * ipV4Address, ipV6Address) that extend `string` but map to non-string C# types
 * (ETag, AzureLocation, ResourceIdentifier, IPAddress). In the TCGC SDK, these
 * scalars have `kind: "string"`, so the default serialization would generate
 * `WriteStringValue(prop)` / `GetString()` — which fails because the C# types
 * don't implicitly convert to/from string.
 *
 * This module detects these scalars via the `SdkType.__raw` TypeSpec Scalar and
 * provides the write transform (`.ToString()`) and read wrapper (`new Type(...)`)
 * needed for correct JSON serialization.
 *
 * This follows the same pattern as the existing `url` → `Uri` handling in
 * PropertySerializer.tsx and PropertyMatchingLoop.tsx.
 *
 * @module
 */

import type { Namespace, Scalar, Type } from "@typespec/compiler";
import type { SdkType } from "@azure-tools/typespec-client-generator-core";
import { unwrapNullableType } from "./nullable.js";

/**
 * Information about how to convert an Azure.Core wrapped scalar type
 * during JSON serialization and deserialization.
 */
export interface AzureScalarConversion {
  /**
   * Transform for the write path — converts the C# value to the JSON-compatible type.
   * Applied as `valueTransform` in `WriteMethodInfo`.
   *
   * @example For ETag: `(name) => "name.ToString()"` → `writer.WriteStringValue(Etag.ToString())`
   */
  writeTransform: (name: string) => string;

  /**
   * Wrapper for the read path — converts the JSON-deserialized value to the C# type.
   * Applied around the `GetString()` call in `getReadExpression`.
   *
   * @example For ETag: `(expr) => "new ETag(expr)"` → `new ETag(jsonProperty.Value.GetString())`
   */
  readWrapper: (getStringExpr: string) => string;
}

/**
 * Map of Azure.Core scalar names to their serialization conversion info.
 *
 * These scalars extend `string` in TypeSpec but map to non-string C# types.
 * Each entry provides the write transform and read wrapper needed for correct
 * JSON round-tripping.
 *
 * Key: TypeSpec scalar name (as defined in Azure.Core).
 * Value: Conversion functions for write and read paths.
 */
const AZURE_SCALAR_CONVERSIONS: ReadonlyMap<string, AzureScalarConversion> =
  new Map([
    // Azure.Core.eTag → Azure.ETag (struct)
    // Write: ETag → string via ToString()
    // Read: string → ETag via constructor
    [
      "eTag",
      {
        writeTransform: (name: string) => `${name}.ToString()`,
        readWrapper: (expr: string) => `new ETag(${expr})`,
      },
    ],

    // Azure.Core.azureLocation → Azure.AzureLocation (struct)
    // Write: AzureLocation → string via ToString()
    // Read: string → AzureLocation via constructor
    [
      "azureLocation",
      {
        writeTransform: (name: string) => `${name}.ToString()`,
        readWrapper: (expr: string) => `new AzureLocation(${expr})`,
      },
    ],

    // Azure.Core.armResourceIdentifier → Azure.Core.ResourceIdentifier (class)
    // Write: ResourceIdentifier → string via ToString()
    // Read: string → ResourceIdentifier via constructor
    [
      "armResourceIdentifier",
      {
        writeTransform: (name: string) => `${name}.ToString()`,
        readWrapper: (expr: string) => `new ResourceIdentifier(${expr})`,
      },
    ],

    // Azure.Core.ipV4Address → System.Net.IPAddress (class)
    // Write: IPAddress → string via ToString()
    // Read: string → IPAddress via static Parse method
    [
      "ipV4Address",
      {
        writeTransform: (name: string) => `${name}.ToString()`,
        readWrapper: (expr: string) => `IPAddress.Parse(${expr})`,
      },
    ],

    // Azure.Core.ipV6Address → System.Net.IPAddress (class)
    // Write: IPAddress → string via ToString()
    // Read: string → IPAddress via static Parse method
    [
      "ipV6Address",
      {
        writeTransform: (name: string) => `${name}.ToString()`,
        readWrapper: (expr: string) => `IPAddress.Parse(${expr})`,
      },
    ],
  ]);

/**
 * Checks whether a TypeSpec Namespace is `Azure.Core` or a child of it.
 *
 * Mirrors the `isAzureCoreNamespace` function in CSharpTypeExpression.tsx
 * to ensure consistent Azure.Core detection across the emitter.
 *
 * @param ns - A TypeSpec Namespace.
 * @returns `true` if the namespace is Azure.Core or nested under it.
 */
function isAzureCoreNamespace(ns: Namespace): boolean {
  if (ns.name === "Core" && ns.namespace?.name === "Azure") return true;
  if (ns.namespace) return isAzureCoreNamespace(ns.namespace);
  return false;
}

/**
 * Determines if an SdkType represents an Azure.Core scalar that maps to a
 * non-string C# type and returns the serialization conversion info.
 *
 * Azure.Core scalars like `eTag`, `azureLocation`, and `armResourceIdentifier`
 * have `kind: "string"` in TCGC but their C# representations (ETag, AzureLocation,
 * ResourceIdentifier) require explicit conversion during JSON serialization.
 *
 * Detection uses the `__raw` TypeSpec Scalar type to check the namespace and
 * name, consistent with how {@link CSharpTypeExpression} resolves Azure scalar
 * type overrides.
 *
 * @param type - An SDK type from TCGC.
 * @returns Conversion info if the type is a wrapped Azure.Core scalar, or
 *   `undefined` if it's a plain string that needs no conversion.
 */
export function getAzureScalarConversion(
  type: SdkType,
): AzureScalarConversion | undefined {
  const unwrapped = unwrapNullableType(type);

  // Only string-kinded scalars can be Azure.Core wrapped types.
  if (unwrapped.kind !== "string") return undefined;

  // Access the underlying TypeSpec type.
  const raw: Type | undefined = unwrapped.__raw;
  if (!raw || raw.kind !== "Scalar") return undefined;

  const scalar = raw as Scalar;

  // Must be from the Azure.Core namespace.
  if (!scalar.namespace || !isAzureCoreNamespace(scalar.namespace))
    return undefined;

  // Look up conversion info by scalar name.
  return AZURE_SCALAR_CONVERSIONS.get(scalar.name);
}
