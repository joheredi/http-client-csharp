import { type Children } from "@alloy-js/core";
import { Reference } from "@alloy-js/csharp";
import type { IntrinsicType, Scalar, Type, Union, UnionVariant } from "@typespec/compiler";
import {
  Experimental_ComponentOverrides,
  Experimental_ComponentOverridesConfig,
} from "@typespec/emitter-framework";
import { TypeExpression, intrinsicNameToCSharpType } from "@typespec/emitter-framework/csharp";
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
 * "numeric" — for scalars and literals. Other type kinds (Model, Union, etc.)
 * return their own kind string, ensuring they are always treated as distinct.
 *
 * This categorization groups types that can coexist in a single extensible enum
 * (e.g., `string` scalar + `"red"` literal → both "string"), while separating
 * types that cannot (e.g., `"a"` string + `2` number → "string" vs "numeric").
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
  return singleKind !== "string" && singleKind !== "numeric" && singleKind !== "boolean";
}

/**
 * Experimental_ComponentOverrides configuration for the HTTP client C# emitter.
 *
 * Overrides TypeExpression's type rendering for:
 *
 * **Unions**:
 * - Nullable unions (e.g., `T | null`) delegate to the default TypeExpression.
 * - Multi-type unions (variants with different base kinds) map to BinaryData
 *   since C# has no equivalent union type. This covers both named unions
 *   (e.g., `union Foo { string, int32 }`) and unnamed unions from aliases
 *   or inline expressions (e.g., `Cat | "a" | int32`, `string | string[]`,
 *   `"a" | 2 | 3.3 | true`).
 * - Named single-type unions (extensible enums) delegate to the default
 *   TypeExpression.
 * - Unnamed single-type non-nullable unions (e.g., `"red" | "blue"`) are
 *   inline string literal unions that TCGC converts to `SdkEnumType`. These
 *   are referenced via `efCsharpRefkey` to resolve to the generated enum
 *   declaration.
 *
 * **UnionVariants**:
 * - A UnionVariant used as a property type (e.g., `ExtendedEnum.EnumValue2`)
 *   resolves to the parent union/extensible enum type. The emitter-framework's
 *   TypeExpression does not handle UnionVariant natively, so this override
 *   prevents a crash.
 *
 * **Scalars** (7 overrides):
 * - bytes → BinaryData, integer/safeint → long, numeric/float → double,
 *   plainDate → DateTimeOffset, plainTime → TimeSpan
 *
 * **Intrinsics** (1 override):
 * - unknown → BinaryData (instead of object)
 *
 * Non-overridden types fall through to the emitter-framework's default
 * TypeExpression rendering via `props.default`.
 */
const csharpTypeOverrides = Experimental_ComponentOverridesConfig()
  .forTypeKind("Union", {
    reference: (props) => {
      // Nullable unions (e.g., `T | null`) are handled correctly by the
      // default TypeExpression — delegate to it.
      if (hasNullVariant(props.type)) {
        return props.default;
      }

      // Multi-type unions (variants with different base kinds) have no single
      // C# type equivalent — map to BinaryData. This covers named unions,
      // unnamed aliases (e.g., `alias Foo = Cat | "a" | int32`), mixed
      // literals (e.g., `"a" | 2 | 3.3 | true`), and inline unions
      // (e.g., `string | string[]`).
      if (isMultiTypeUnion(props.type)) {
        return System.BinaryData;
      }

      // Named single-type unions (extensible enums) are handled correctly
      // by the default TypeExpression — delegate to it.
      if (props.type.name) {
        return props.default;
      }

      // Unnamed single-type non-nullable unions are inline string literal
      // unions (e.g., `"red" | "blue"`) that TCGC converts to SdkEnumType.
      // The enum declarations register efCsharpRefkey(rawType), so we
      // reference the same key to resolve to the generated enum type.
      return <Reference refkey={efCsharpRefkey(props.type)} />;
    },
  })
  .forTypeKind("UnionVariant", {
    reference: (props) => {
      const variant = props.type as UnionVariant;
      // A UnionVariant used as a property type means referencing a specific
      // member of a named union (e.g., ExtendedEnum.EnumValue2). In C#, the
      // property type resolves to the parent union/extensible enum type.
      if (variant.union.name) {
        return <Reference refkey={efCsharpRefkey(variant.union)} />;
      }
      // Fallback for unnamed union variants: render the variant's inner type.
      return <TypeExpression type={variant.type} />;
    },
  })
  .forTypeKind("Scalar", {
    reference: (props) => {
      const override = getScalarOverride(props.type as Scalar);
      return override !== undefined ? override : props.default;
    },
  })
  .forTypeKind("Intrinsic", {
    reference: (props) => {
      const intrinsic = props.type as IntrinsicType;
      if (intrinsic.name === "unknown") {
        return System.BinaryData;
      }
      return props.default;
    },
  });

/**
 * Props for the {@link CSharpScalarOverrides} provider component.
 */
export interface CSharpScalarOverridesProps {
  children?: Children;
}

/**
 * Provider component that overrides TypeExpression's scalar type mappings
 * for the HTTP client C# emitter.
 *
 * Wrap the emitter's component tree with this provider to ensure all
 * `<TypeExpression>` usages emit the correct C# types. The overrides apply
 * to the entire subtree, including TypeExpression calls inside
 * emitter-framework components.
 *
 * @example
 * ```tsx
 * <CSharpScalarOverrides>
 *   <SourceFile path="Model.cs">
 *     <TypeExpression type={bytesScalar} />  // renders "BinaryData" not "byte[]"
 *   </SourceFile>
 * </CSharpScalarOverrides>
 * ```
 */
export function CSharpScalarOverrides(props: CSharpScalarOverridesProps) {
  return (
    <Experimental_ComponentOverrides overrides={csharpTypeOverrides}>
      {props.children}
    </Experimental_ComponentOverrides>
  );
}
