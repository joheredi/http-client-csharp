import { type Children } from "@alloy-js/core";
import { Reference } from "@alloy-js/csharp";
import type {
  Enum,
  EnumMember,
  IntrinsicType,
  Namespace,
  Scalar,
  Type,
  Union,
  UnionVariant,
} from "@typespec/compiler";
import {
  Experimental_ComponentOverrides,
  Experimental_ComponentOverridesConfig,
} from "@typespec/emitter-framework";
import {
  TypeExpression,
  intrinsicNameToCSharpType,
} from "@typespec/emitter-framework/csharp";
import { Azure, AzureCore } from "../builtins/azure.js";
import { SystemNet } from "../builtins/system-net.js";
import { System } from "../builtins/system.js";
import { efCsharpRefkey } from "../utils/refkey.js";

/**
 * Map of TypeSpec built-in scalar names to their HTTP client C# type overrides.
 *
 * These override the emitter-framework's TypeExpression defaults to match the
 * legacy HTTP client C# emitter's behavior. Each entry corrects a mapping where
 * the emitter-framework chooses a different C# type than the HTTP client emitter.
 *
 * Values are either:
 * - String literals for C# keywords (no `using` needed): "long", "double"
 * - Alloy library symbol references for System types (auto-generates `using`):
 *   System.BinaryData, System.DateTimeOffset, System.TimeSpan
 */
const scalarOverrideMap = new Map<string, Children>([
  // bytes → BinaryData (EF default: byte[])
  // BinaryData provides richer serialization for the SCM pipeline
  ["bytes", System.BinaryData],

  // integer → long (EF default: int)
  // 64-bit safety: the abstract "integer" type should map to the widest safe type
  ["integer", "long"],

  // safeint → long (EF default: int)
  // IEEE 754 safe integer range fits in long
  ["safeint", "long"],

  // numeric → double (EF default: decimal)
  // Broad numeric compatibility; the abstract "numeric" uses double for interop
  ["numeric", "double"],

  // float → double (EF default: float)
  // 64-bit safety: the abstract "float" type should map to the widest float type
  ["float", "double"],

  // plainDate → DateTimeOffset (EF default: DateOnly)
  // .NET backward compatibility: DateOnly requires .NET 6+
  ["plainDate", System.DateTimeOffset],

  // plainTime → TimeSpan (EF default: TimeOnly)
  // .NET backward compatibility: TimeOnly requires .NET 6+
  ["plainTime", System.TimeSpan],

  // duration → TimeSpan (EF renders as string "TimeSpan" without using directive)
  // Override ensures using System; is auto-generated via refkey
  ["duration", System.TimeSpan],

  // utcDateTime → DateTimeOffset (EF renders as string "DateTimeOffset" without using directive)
  // Override ensures using System; is auto-generated via refkey
  ["utcDateTime", System.DateTimeOffset],

  // offsetDateTime → DateTimeOffset (EF renders as string "DateTimeOffset" without using directive)
  // Override ensures using System; is auto-generated via refkey
  ["offsetDateTime", System.DateTimeOffset],

  // url → Uri (EF renders as string "Uri" without using directive)
  // Override ensures using System; is auto-generated via refkey
  ["url", System.Uri],
]);

/**
 * Resolves the override for a TypeSpec scalar, handling both built-in and
 * user-defined scalars correctly.
 *
 * For built-in scalars (those in TypeExpression's intrinsic map), checks the
 * override map directly. This ensures specific built-in scalars like `int32`
 * or `float32` keep their TypeExpression defaults even though their parents
 * (`integer`, `float`) have overrides.
 *
 * For user-defined scalars (not in the intrinsic map), walks the base chain
 * until finding a match in the override map or a built-in scalar without an
 * override. This ensures `scalar myBytes extends bytes` inherits the
 * `bytes → BinaryData` override.
 *
 * @param scalar - A TypeSpec Scalar type.
 * @returns The override Children, or undefined if no override applies.
 */
function getScalarOverride(scalar: Scalar): Children | undefined {
  // Built-in scalars: check only the direct name
  if (intrinsicNameToCSharpType.has(scalar.name)) {
    return scalarOverrideMap.get(scalar.name);
  }

  // User-defined scalars: walk the base chain to inherit overrides
  let current: Scalar | undefined = scalar.baseScalar;
  while (current) {
    const override = scalarOverrideMap.get(current.name);
    if (override !== undefined) return override;
    // Stop walking once we hit a built-in scalar without an override
    if (intrinsicNameToCSharpType.has(current.name)) return undefined;
    current = current.baseScalar;
  }
  return undefined;
}

/**
 * Map of Azure.Core TypeSpec scalar names to their Azure SDK C# type overrides.
 *
 * These mappings are only active when the emitter `flavor` is `"azure"`. They
 * map TypeSpec scalars defined in the `@azure-tools/typespec-azure-core` library
 * to their corresponding C# types from the Azure.Core NuGet package.
 *
 * All Azure.Core scalars extend `string` in TypeSpec, so without these overrides
 * they would fall through to `string` in C#. The Azure SDK uses richer types
 * to provide type safety and helper methods.
 *
 * Values are Alloy library symbol references that auto-generate the correct
 * `using` directives (e.g., `using Azure;`, `using Azure.Core;`, `using System.Net;`).
 *
 * Reference: KnownAzureTypes.cs in Azure.Generator
 */
const azureScalarOverrideMap = new Map<string, Children>([
  // Azure.Core.azureLocation → Azure.AzureLocation
  // Represents an Azure geography region (e.g., "WestUS")
  ["azureLocation", Azure.AzureLocation],

  // Azure.Core.eTag → Azure.ETag
  // HTTP ETag for conditional requests
  ["eTag", Azure.ETag],

  // Azure.Core.armResourceIdentifier → Azure.Core.ResourceIdentifier
  // Fully qualified ARM resource identifier
  ["armResourceIdentifier", AzureCore.ResourceIdentifier],

  // Azure.Core.ipV4Address → System.Net.IPAddress
  // IPv4 address (e.g., "129.144.50.56")
  ["ipV4Address", SystemNet.IPAddress],

  // Azure.Core.ipV6Address → System.Net.IPAddress
  // IPv6 address (e.g., "2001:db8::1")
  ["ipV6Address", SystemNet.IPAddress],

  // Azure.Core.uuid → System.Guid
  // UUID scalar — Azure SDK maps to Guid (same as built-in uuid)
  ["uuid", System.Guid],
]);

/**
 * Checks whether a TypeSpec Scalar belongs to the `Azure.Core` namespace.
 *
 * Used to distinguish Azure.Core scalars (e.g., `azureLocation`, `eTag`) from
 * user-defined or built-in scalars that happen to share the same name. Only
 * scalars defined in the `Azure.Core` TypeSpec namespace should receive Azure
 * type mappings.
 *
 * @param scalar - A TypeSpec Scalar type.
 * @returns `true` if the scalar's namespace is `Azure.Core`.
 */
function isAzureCoreScalar(scalar: Scalar): boolean {
  const ns = scalar.namespace;
  if (!ns) return false;
  return isAzureCoreNamespace(ns);
}

/**
 * Checks whether a TypeSpec Namespace is `Azure.Core` or a child of it
 * (e.g., `Azure.Core.Foundations`).
 *
 * @param ns - A TypeSpec Namespace.
 * @returns `true` if the namespace is Azure.Core or nested under it.
 */
function isAzureCoreNamespace(ns: Namespace): boolean {
  // Direct match: Azure.Core
  if (ns.name === "Core" && ns.namespace?.name === "Azure") return true;
  // Nested match: Azure.Core.Foundations, etc.
  if (ns.namespace) return isAzureCoreNamespace(ns.namespace);
  return false;
}

/**
 * Resolves the Azure-specific override for a TypeSpec scalar from the
 * `Azure.Core` namespace.
 *
 * Only checks scalars that belong to the `Azure.Core` namespace (verified via
 * {@link isAzureCoreScalar}). For non-Azure scalars, returns `undefined` to
 * let the standard scalar override logic handle them.
 *
 * @param scalar - A TypeSpec Scalar type.
 * @returns The Azure C# type override, or `undefined` if not an Azure scalar.
 */
function getAzureScalarOverride(scalar: Scalar): Children | undefined {
  if (isAzureCoreScalar(scalar)) {
    return azureScalarOverrideMap.get(scalar.name);
  }
  return undefined;
}

/**
 * Checks whether a TypeSpec Union has a null or void variant.
 *
 * Used to distinguish nullable unions (e.g., `T | null`) from inline
 * literal unions (e.g., `"red" | "blue"`). Nullable unions are handled
 * by the default TypeExpression; literal unions need the enum override.
 *
 * @param union - A TypeSpec Union type.
 * @returns `true` if any variant is the `null` or `void` intrinsic.
 */
function hasNullVariant(union: Union): boolean {
  return Array.from(union.variants.values()).some(
    (v) =>
      v.type.kind === "Intrinsic" &&
      (v.type.name === "null" || v.type.name === "void"),
  );
}

/**
 * Returns the base kind category of a TypeSpec type for union diversity checking.
 *
 * Maps each type to one of three base categories — "string", "boolean", or
 * "numeric" — for scalars, literals, enums, and enum members. Other type kinds
 * (Model, Union, etc.) return their own kind string, ensuring they are always
 * treated as distinct.
 *
 * This categorization groups types that can coexist in a single extensible enum
 * (e.g., `string` scalar + `"red"` literal → both "string"), while separating
 * types that cannot (e.g., `"a"` string + `2` number → "string" vs "numeric").
 *
 * TypeSpec Enum types are classified by their backing type: string-backed enums
 * (the default) return "string", numeric-backed enums return "numeric". This
 * ensures that unions of homogeneous enums (e.g., `LR | UD` where both are
 * string-backed) are treated as extensible enums, not multi-type unions.
 *
 * @param type - A TypeSpec type (variant type from a union).
 * @returns A category string used to determine union type diversity.
 */
function getVariantBaseKind(type: Type): string {
  if (type.kind === "String") return "string";
  if (type.kind === "Number") return "numeric";
  if (type.kind === "Boolean") return "boolean";
  if (type.kind === "Scalar") {
    let current: Scalar = type;
    while (current.baseScalar) {
      current = current.baseScalar;
    }
    if (current.name === "string") return "string";
    if (current.name === "boolean") return "boolean";
    // All numeric root scalars (integer, float, numeric, decimal) → "numeric"
    return "numeric";
  }
  // TypeSpec enum types — determine base kind from member values.
  // String-backed enums (default or explicit string values) → "string".
  // Numeric-backed enums (explicit number values) → "numeric".
  // This allows unions of homogeneous enums (e.g., LR | UD where both are
  // string-backed) to be treated as extensible enums rather than multi-type
  // unions that would incorrectly map to BinaryData.
  if (type.kind === "Enum") {
    const firstMember = [...(type as Enum).members.values()][0];
    if (firstMember && typeof firstMember.value === "number") return "numeric";
    return "string";
  }
  if (type.kind === "EnumMember") {
    if (typeof (type as EnumMember).value === "number") return "numeric";
    return "string";
  }
  // Model, Union, Tuple, etc. — each is unique / multi-type
  return type.kind;
}

/**
 * Checks whether a TypeSpec Union represents a multi-type union rather than
 * an extensible enum. Works for both named and unnamed (aliased/inline) unions.
 *
 * A multi-type union has variants with different underlying base kinds — e.g.,
 * `Cat | "a" | int32 | boolean` mixes Model + string + numeric + boolean.
 * C# has no equivalent union type, so these are mapped to BinaryData.
 *
 * Extensible enums have all variants based on the same base kind (e.g.,
 * `"red" | "blue"` are all string) and are handled by enum generation.
 *
 * Examples of multi-type unions (→ BinaryData):
 * - `Cat | "a" | int32 | boolean` — Model + mixed literals
 * - `"a" | 2 | 3.3 | true` — mixed literal types
 * - `string | string[]` — scalar + array model
 * - `Cat | Dog` — all Model variants (not a scalar/literal extensible enum)
 *
 * Examples of single-type unions (→ extensible enum):
 * - `"red" | "blue"` — all string literals
 * - `1 | 2 | 3` — all numeric literals
 * - `string | "red" | "blue"` — all string-based
 * - `LR | UD` — all string-backed enums (classified by backing type)
 *
 * @param union - A TypeSpec Union type.
 * @returns `true` if the union has variants with different base kinds.
 */
function isMultiTypeUnion(union: Union): boolean {
  const variants = [...union.variants.values()]
    .map((v) => v.type)
    .filter(
      (t) =>
        !(
          t.kind === "Intrinsic" &&
          ((t as IntrinsicType).name === "null" ||
            (t as IntrinsicType).name === "void")
        ),
    );

  if (variants.length <= 1) return false;

  const baseKinds = new Set(variants.map(getVariantBaseKind));

  // Different base kinds → definitely multi-type (e.g., string + numeric + boolean)
  if (baseKinds.size > 1) return true;

  // All variants share the same base kind. If that kind is a scalar/literal
  // category (string, numeric, boolean), it can be an extensible enum.
  // Any other kind (Model, Union, Tuple, etc.) cannot, so it's multi-type.
  // Example: Cat | Dog → all "Model" → multi-type → BinaryData.
  const singleKind = [...baseKinds][0];
  return (
    singleKind !== "string" &&
    singleKind !== "numeric" &&
    singleKind !== "boolean"
  );
}

/**
 * Shared override handler for Union type kinds.
 *
 * Handles nullable unions, multi-type unions, named unions (extensible enums),
 * and unnamed inline literal unions consistently across both unbranded and
 * Azure flavors.
 */
const unionOverrideHandler = {
  reference: (props: { type: Union; default: Children }) => {
    if (hasNullVariant(props.type)) {
      return props.default;
    }
    if (isMultiTypeUnion(props.type)) {
      return System.BinaryData;
    }
    if (props.type.name) {
      return props.default;
    }
    return <Reference refkey={efCsharpRefkey(props.type)} />;
  },
};

/**
 * Shared override handler for UnionVariant type kinds.
 *
 * Maps named union variants to the parent union type and falls back to
 * rendering the variant's inner type for unnamed union variants.
 */
const unionVariantOverrideHandler = {
  reference: (props: { type: UnionVariant; default: Children }) => {
    const variant = props.type as UnionVariant;
    if (variant.union.name) {
      return <Reference refkey={efCsharpRefkey(variant.union)} />;
    }
    return <TypeExpression type={variant.type} />;
  },
};

/**
 * Shared override handler for Intrinsic type kinds.
 *
 * Maps the `unknown` intrinsic to BinaryData instead of `object`.
 */
const intrinsicOverrideHandler = {
  reference: (props: { type: IntrinsicType; default: Children }) => {
    const intrinsic = props.type as IntrinsicType;
    if (intrinsic.name === "unknown") {
      return System.BinaryData;
    }
    return props.default;
  },
};

/**
 * Override handler for Scalar type kinds in unbranded (System.ClientModel) mode.
 *
 * Applies the standard scalar override map (bytes → BinaryData, integer → long, etc.)
 * without any Azure-specific mappings.
 */
const unbrandedScalarOverrideHandler = {
  reference: (props: { type: Scalar; default: Children }) => {
    const override = getScalarOverride(props.type as Scalar);
    return override !== undefined ? override : props.default;
  },
};

/**
 * Override handler for Scalar type kinds in Azure mode.
 *
 * First checks for Azure.Core scalar overrides (azureLocation → AzureLocation,
 * eTag → ETag, etc.), then falls back to the standard scalar override map.
 * This layered approach ensures Azure types take precedence while preserving
 * all unbranded scalar mappings.
 */
const azureScalarOverrideHandler = {
  reference: (props: { type: Scalar; default: Children }) => {
    // Try Azure-specific override first (only matches Azure.Core scalars)
    const azureOverride = getAzureScalarOverride(props.type as Scalar);
    if (azureOverride !== undefined) return azureOverride;

    // Fall back to standard scalar overrides
    const override = getScalarOverride(props.type as Scalar);
    return override !== undefined ? override : props.default;
  },
};

/**
 * Type override configuration for unbranded (System.ClientModel) flavor.
 *
 * Overrides TypeExpression's type rendering for unions, union variants,
 * scalars, and intrinsics to match the legacy HTTP client C# emitter's
 * behavior with System.ClientModel types.
 */
const csharpTypeOverrides = Experimental_ComponentOverridesConfig()
  .forTypeKind("Union", unionOverrideHandler)
  .forTypeKind("UnionVariant", unionVariantOverrideHandler)
  .forTypeKind("Scalar", unbrandedScalarOverrideHandler)
  .forTypeKind("Intrinsic", intrinsicOverrideHandler);

/**
 * Type override configuration for Azure (Azure.Core) flavor.
 *
 * Extends the unbranded overrides with Azure-specific scalar mappings.
 * Azure.Core TypeSpec scalars (azureLocation, eTag, armResourceIdentifier,
 * ipV4Address, ipV6Address, uuid) are mapped to their Azure SDK C# equivalents
 * (AzureLocation, ETag, ResourceIdentifier, IPAddress, Guid).
 *
 * All non-Azure type overrides (unions, union variants, intrinsics, and
 * standard scalar overrides) are shared with the unbranded configuration.
 */
const azureCsharpTypeOverrides = Experimental_ComponentOverridesConfig()
  .forTypeKind("Union", unionOverrideHandler)
  .forTypeKind("UnionVariant", unionVariantOverrideHandler)
  .forTypeKind("Scalar", azureScalarOverrideHandler)
  .forTypeKind("Intrinsic", intrinsicOverrideHandler);

/**
 * Props for the {@link CSharpScalarOverrides} provider component.
 */
export interface CSharpScalarOverridesProps {
  children?: Children;

  /**
   * Controls which type override configuration to apply.
   *
   * - `"unbranded"` (default): Uses System.ClientModel type mappings.
   * - `"azure"`: Adds Azure.Core type mappings on top of unbranded mappings.
   *   Azure.Core TypeSpec scalars are mapped to Azure SDK C# types.
   */
  flavor?: "azure" | "unbranded";
}

/**
 * Provider component that overrides TypeExpression's type mappings
 * for the HTTP client C# emitter.
 *
 * Wrap the emitter's component tree with this provider to ensure all
 * `<TypeExpression>` usages emit the correct C# types. The overrides apply
 * to the entire subtree, including TypeExpression calls inside
 * emitter-framework components.
 *
 * When `flavor` is `"azure"`, Azure.Core TypeSpec scalars are mapped to their
 * Azure SDK C# equivalents (e.g., `azureLocation` → `AzureLocation`).
 * When `flavor` is `"unbranded"` (default), only standard System.ClientModel
 * type mappings are applied.
 *
 * @example
 * ```tsx
 * <CSharpScalarOverrides flavor="azure">
 *   <SourceFile path="Model.cs">
 *     <TypeExpression type={azureLocationScalar} />  // renders "AzureLocation"
 *   </SourceFile>
 * </CSharpScalarOverrides>
 * ```
 */
export function CSharpScalarOverrides(props: CSharpScalarOverridesProps) {
  const overrides =
    props.flavor === "azure" ? azureCsharpTypeOverrides : csharpTypeOverrides;
  return (
    <Experimental_ComponentOverrides overrides={overrides}>
      {props.children}
    </Experimental_ComponentOverrides>
  );
}
