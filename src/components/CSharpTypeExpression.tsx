import { type Children } from "@alloy-js/core";
import { createLibrary } from "@alloy-js/csharp";
import System from "@alloy-js/csharp/global/System";
import type { IntrinsicType, Scalar } from "@typespec/compiler";
import {
  Experimental_ComponentOverrides,
  Experimental_ComponentOverridesConfig,
} from "@typespec/emitter-framework";
import { intrinsicNameToCSharpType } from "@typespec/emitter-framework/csharp";

/**
 * Library declaration for System.BinaryData.
 *
 * BinaryData is not included in the @alloy-js/csharp builtins, so we declare
 * it here. The legacy HTTP client C# emitter maps `bytes` and `unknown` to
 * BinaryData (instead of byte[] and object) because BinaryData provides richer
 * serialization support for binary payloads in the System.ClientModel stack.
 *
 * When referenced in a SourceFile, alloy auto-generates `using System;`.
 */
export const SystemBinaryData = createLibrary("System", {
  BinaryData: { kind: "class" as const, members: {} },
});

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
 *   SystemBinaryData.BinaryData, System.DateTimeOffset, System.TimeSpan
 */
const scalarOverrideMap = new Map<string, Children>([
  // bytes → BinaryData (EF default: byte[])
  // BinaryData provides richer serialization for the SCM pipeline
  ["bytes", SystemBinaryData.BinaryData],

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
 * Experimental_ComponentOverrides configuration for the HTTP client C# emitter.
 *
 * Overrides TypeExpression's type rendering for:
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
        return SystemBinaryData.BinaryData;
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
