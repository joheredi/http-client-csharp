import { type Children } from "@alloy-js/core";
import { Reference } from "@alloy-js/csharp";
import type { IntrinsicType, Scalar, Union } from "@typespec/compiler";
import {
  Experimental_ComponentOverrides,
  Experimental_ComponentOverridesConfig,
} from "@typespec/emitter-framework";
import { intrinsicNameToCSharpType } from "@typespec/emitter-framework/csharp";
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
 * Checks whether a named TypeSpec Union represents a multi-type union
 * (e.g., `union Foo { string, int32 }`) rather than an extensible enum
 * (e.g., `union Bar { string, "a", "b" }`).
 *
 * Multi-type named unions have variants with different underlying scalar
 * types (e.g., string + integer). C# has no equivalent union type, so these
 * are mapped to BinaryData. Extensible enums have all variants based on the
 * same scalar type and are handled by the existing enum generation.
 *
 * @param union - A TypeSpec Union type.
 * @returns `true` if the union has variants with different root scalar types.
 */
function isMultiTypeNamedUnion(union: Union): boolean {
  if (!union.name) return false;

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

  // Non-scalar, non-literal variants (Model, nested Union, etc.) → multi-type
  if (
    variants.some(
      (t) =>
        t.kind !== "Scalar" &&
        t.kind !== "String" &&
        t.kind !== "Number" &&
        t.kind !== "Boolean",
    )
  ) {
    return true;
  }

  // Check if scalar variants have different root types
  const scalarVariants = variants.filter(
    (t): t is Scalar => t.kind === "Scalar",
  );
  if (scalarVariants.length <= 1) return false;

  const rootNames = new Set<string>();
  for (const s of scalarVariants) {
    let current: Scalar = s;
    while (current.baseScalar) {
      current = current.baseScalar;
    }
    rootNames.add(current.name);
  }

  return rootNames.size > 1;
}

/**
 * Experimental_ComponentOverrides configuration for the HTTP client C# emitter.
 *
 * Overrides TypeExpression's type rendering for:
 *
 * **Unions**:
 * - Multi-type named unions (e.g., `union Foo { string, int32 }`) map to
 *   BinaryData since C# has no equivalent union type.
 * - Named single-type unions (extensible enums) and nullable unions delegate
 *   to the default TypeExpression.
 * - Unnamed non-nullable unions (e.g., `"red" | "blue"`) are inline string
 *   literal unions that TCGC converts to `SdkEnumType`. These are referenced
 *   via `efCsharpRefkey` to resolve to the generated enum declaration.
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
      // Multi-type named unions (e.g., `union Foo { string, int32 }`) have
      // no single C# type equivalent — map to BinaryData.
      if (isMultiTypeNamedUnion(props.type)) {
        return System.BinaryData;
      }

      // Named unions (extensible enums) and nullable unions are handled
      // correctly by the default TypeExpression — delegate to it.
      if (props.type.name || hasNullVariant(props.type)) {
        return props.default;
      }

      // Unnamed non-nullable unions are inline string literal unions
      // (e.g., `"red" | "blue"`) that TCGC converts to SdkEnumType.
      // The enum declarations register efCsharpRefkey(rawType), so we
      // reference the same key to resolve to the generated enum type.
      return <Reference refkey={efCsharpRefkey(props.type)} />;
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
