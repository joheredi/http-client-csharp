/**
 * Literal type wrapper struct utilities.
 *
 * Provides functions to identify TCGC constant types that need C# readonly
 * struct wrappers (e.g., `ThingOptionalLiteralFloat`) and to collect them
 * from model property trees.
 *
 * A constant type needs a wrapper struct when:
 * 1. It appears as a model property type
 * 2. The property is optional or explicitly nullable
 * 3. The constant's underlying value type is NOT boolean
 *
 * Required non-nullable literals use raw primitive types with initializers
 * (e.g., `public float RequiredLiteralFloat { get; } = 1.23F;`). Boolean
 * literals always use `bool?` — they don't benefit from extensible wrappers
 * since bool has only two possible values.
 *
 * @module
 */

import type {
  SdkConstantType,
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { unwrapNullableType } from "../../utils/nullable.js";

/**
 * Determines whether a constant type on a model property needs a C# wrapper struct.
 *
 * Wrapper structs are generated for optional/nullable constant types with non-boolean
 * value types. They follow the extensible enum pattern: `readonly partial struct`
 * implementing `IEquatable<T>` with equality, operators, implicit conversions, and
 * `ToString`.
 *
 * @param type - The unwrapped SDK type from a model property.
 * @param isOptionalOrNullable - Whether the property is optional or explicitly nullable.
 * @returns `true` if the type is a constant that needs a wrapper struct.
 */
export function needsLiteralWrapperStruct(
  type: SdkType,
  isOptionalOrNullable: boolean,
): boolean {
  if (type.kind !== "constant") return false;
  if (!isOptionalOrNullable) return false;
  if (type.valueType.kind === "boolean") return false;
  return true;
}

/**
 * Collects all unique SdkConstantType instances from model properties that need
 * wrapper struct generation.
 *
 * Walks all properties of the given models, unwraps nullable wrappers, and identifies
 * constant types that are optional or nullable with non-boolean value types. Returns
 * a deduplicated list keyed by the constant type's name.
 *
 * @param models - The array of TCGC SDK model types to scan.
 * @returns A deduplicated array of SdkConstantType instances needing wrapper structs,
 *   each paired with the namespace from the containing model.
 */
export function collectLiteralTypes(
  models: SdkModelType[],
): { constantType: SdkConstantType; namespace: string }[] {
  const seen = new Set<string>();
  const result: { constantType: SdkConstantType; namespace: string }[] = [];

  for (const model of models) {
    for (const prop of model.properties) {
      if (prop.kind !== "property") continue;
      const unwrapped = unwrapNullableType(prop.type);
      const isNullable = prop.optional || prop.type.kind === "nullable";

      if (needsLiteralWrapperStruct(unwrapped, isNullable)) {
        const ct = unwrapped as SdkConstantType;
        if (!seen.has(ct.name)) {
          seen.add(ct.name);
          result.push({
            constantType: ct,
            namespace: model.namespace ?? "",
          });
        }
      }
    }
  }

  return result;
}
