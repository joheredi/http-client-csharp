/**
 * Dynamic model generation for JSON Merge Patch support.
 *
 * When a model is used with the `application/merge-patch+json` content type,
 * TCGC sets the {@link UsageFlags.JsonMergePatch} flag. These models need
 * additional members to track property-level changes for partial updates
 * per RFC 7386.
 *
 * This module generates:
 * - A private `_patch` field of type `JsonPatch`
 * - A public `ref JsonPatch Patch` property with `[JsonIgnore]` and
 *   `[EditorBrowsable(Never)]` attributes
 * - `#pragma warning disable/restore SCME0001` to suppress the experimental
 *   API diagnostic from `JsonPatch` usage
 * - `PropagateGet` and `PropagateSet` methods for models with nested dynamic
 *   model properties (in the serialization partial class)
 * - `_patch.SetPropagators(PropagateSet, PropagateGet)` call in the internal
 *   constructor for models with nested dynamic model properties
 *
 * The `_patch` field is only generated on root models (models without a base
 * model that already declares it).
 *
 * @see ScmModelProvider.cs in the legacy emitter for the original implementation.
 * @see MrwSerializationTypeDefinition.Dynamic.cs for the propagator generation logic.
 * @module
 */

import { Attribute, Field, useCSharpNamePolicy } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type {
  SdkModelPropertyType,
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { UsageFlags } from "@azure-tools/typespec-client-generator-core";
import { SystemComponentModel } from "../../builtins/system-component-model.js";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemTextJsonSerialization } from "../../builtins/system-text-json-serialization.js";
import { unwrapNullableType } from "../../utils/nullable.js";
import { resolvePropertyName } from "../../utils/property.js";

/**
 * Determines whether a model is a dynamic model (used for JSON Merge Patch).
 *
 * Dynamic models have the `UsageFlags.JsonMergePatch` flag set by TCGC when
 * the model is used as the body of an operation with
 * `application/merge-patch+json` content type.
 *
 * @param model - The TCGC SDK model type.
 * @returns `true` if the model has the JsonMergePatch usage flag.
 */
export function isDynamicModel(model: SdkModelType): boolean {
  return (model.usage & UsageFlags.JsonMergePatch) !== 0;
}

/**
 * Generates the `_patch` field and `Patch` property for dynamic models.
 *
 * The generated C# code wraps `JsonPatch` references in
 * `#pragma warning disable/restore SCME0001` to suppress the experimental
 * API diagnostic. The structural pattern matches the legacy emitter's
 * ScmModelProvider:
 *
 * ```csharp
 * #pragma warning disable SCME0001
 * private JsonPatch _patch;
 *
 * [JsonIgnore]
 * [EditorBrowsable(EditorBrowsableState.Never)]
 * public ref JsonPatch Patch => ref _patch;
 * #pragma warning restore SCME0001
 * ```
 *
 * The `_patch` field tracks property-level changes for JSON merge patch
 * serialization. The `Patch` property exposes it as a `ref` return so
 * callers can modify the patch state directly.
 *
 * @returns JSX fragment containing the field and property declarations.
 */
export function DynamicModelMembers() {
  return (
    <>
      {"#pragma warning disable SCME0001\n"}
      <Field
        private
        name="_patch"
        type={SystemClientModelPrimitives.JsonPatch}
      />
      {"\n\n"}
      <Attribute name={SystemTextJsonSerialization.JsonIgnoreAttribute} />
      {"\n"}
      <Attribute
        name={SystemComponentModel.EditorBrowsableAttribute}
        args={[code`${SystemComponentModel.EditorBrowsableState}.Never`]}
      />
      {"\n"}
      {code`public ref ${SystemClientModelPrimitives.JsonPatch} Patch => ref _patch;`}
      {"\n"}
      {"#pragma warning restore SCME0001"}
    </>
  );
}

// ─── PROPAGATOR TYPES AND HELPERS ────────────────────────────────────────────

/** A navigation step through the type tree to reach a nested dynamic model. */
interface NavStep {
  kind: "array" | "dict";
  /** For dict steps: the SDK type of the dictionary's value (for TryGetValue out param). */
  dictValueType?: SdkType;
}

/** A property that references a nested dynamic model through zero or more collection levels. */
interface PropagatableProperty {
  /** JSON wire name (serializedName). */
  wireName: string;
  /** C# property name (PascalCase). */
  csharpName: string;
  /** Navigation steps from the property root to the dynamic model leaf. */
  steps: NavStep[];
}

/**
 * Checks whether an SDK type is a dynamic model (has JsonMergePatch usage).
 */
function isTypeDynamicModel(type: SdkType): boolean {
  const unwrapped = unwrapNullableType(type);
  if (unwrapped.kind !== "model") return false;
  return ((unwrapped as SdkModelType).usage & UsageFlags.JsonMergePatch) !== 0;
}

/**
 * Recursively walks a type tree to find navigation steps to a nested dynamic model.
 *
 * Returns null if the type does not contain a dynamic model reference.
 * Returns an empty array for a direct dynamic model reference.
 *
 * @param type - The SDK type to examine.
 * @returns Navigation steps to the dynamic model, or null if not found.
 */
function getNavigationSteps(type: SdkType): NavStep[] | null {
  const unwrapped = unwrapNullableType(type);

  if (isTypeDynamicModel(unwrapped)) {
    return [];
  }

  if (unwrapped.kind === "array") {
    const inner = getNavigationSteps(unwrapped.valueType);
    if (inner !== null) {
      return [{ kind: "array" }, ...inner];
    }
  }

  if (unwrapped.kind === "dict") {
    const inner = getNavigationSteps(unwrapped.valueType);
    if (inner !== null) {
      return [{ kind: "dict", dictValueType: unwrapped.valueType }, ...inner];
    }
  }

  return null;
}

/**
 * Computes the C# type name string for a type, used for dictionary TryGetValue out parameters.
 *
 * Only handles types that appear in the path to a dynamic model: models, arrays, and dicts.
 *
 * @param type - The SDK type to render.
 * @param namePolicy - The C# naming policy for model names.
 * @returns The C# type string (e.g., "AnotherDynamicModel", "IList<AnotherDynamicModel>").
 */
function getCSharpTypeString(
  type: SdkType,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): string {
  const unwrapped = unwrapNullableType(type);
  switch (unwrapped.kind) {
    case "model":
      return namePolicy.getName(unwrapped.name, "class");
    case "array":
      return `IList<${getCSharpTypeString(unwrapped.valueType, namePolicy)}>`;
    case "dict":
      return `IDictionary<string, ${getCSharpTypeString(unwrapped.valueType, namePolicy)}>`;
    default:
      return unwrapped.kind;
  }
}

/**
 * Returns the variable name suffix for a given step index.
 * First occurrence has no suffix, subsequent use 0-based numbering.
 */
function getSuffix(count: number): string {
  return count === 0 ? "" : `${count - 1}`;
}

/**
 * Finds all properties on a model that contain references to nested dynamic models.
 *
 * This identifies properties whose type tree (direct, through arrays, or through
 * dictionaries) reaches another model with the JsonMergePatch usage flag.
 *
 * @param model - The TCGC SDK model type.
 * @param namePolicy - The C# naming policy for property name conversion.
 * @returns Array of propagatable properties with navigation steps.
 */
export function getDynamicModelProperties(
  model: SdkModelType,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): PropagatableProperty[] {
  const result: PropagatableProperty[] = [];

  // Collect from current model and base models (propagators traverse hierarchy)
  const allPropertyInfos: {
    property: SdkModelPropertyType;
    modelName: string;
  }[] = [];
  let current: SdkModelType | undefined = model;
  while (current) {
    for (const p of current.properties) {
      allPropertyInfos.push({ property: p, modelName: current.name });
    }
    current = current.baseModel;
  }

  for (const { property: p, modelName } of allPropertyInfos) {
    const steps = getNavigationSteps(p.type);
    if (steps !== null) {
      result.push({
        wireName: p.serializedName,
        csharpName: namePolicy.getName(
          resolvePropertyName(p.name, modelName),
          "class-property",
        ),
        steps,
      });
    }
  }

  return result;
}

/**
 * Checks whether a dynamic model has any properties that reference other dynamic models.
 *
 * When true, the model needs `SetPropagators` in its constructor and
 * `PropagateGet`/`PropagateSet` methods in its serialization file.
 *
 * @param model - The TCGC SDK model type.
 * @param namePolicy - The C# naming policy.
 * @returns `true` if the model has at least one nested dynamic model property.
 */
export function hasDynamicModelProperties(
  model: SdkModelType,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): boolean {
  return getDynamicModelProperties(model, namePolicy).length > 0;
}

// ─── PROPAGATOR CODE GENERATION ──────────────────────────────────────────────

/**
 * Builds the code lines for a single property's if-block inside PropagateGet.
 *
 * Generates the navigation code (array index extraction, dictionary key lookup)
 * followed by the terminal `TryGetEncodedValue` call.
 *
 * @param prop - The propagatable property descriptor.
 * @param namePolicy - The C# naming policy for type name rendering.
 * @returns Array of C# source lines for this property's if-block.
 */
function buildPropagateGetBlock(
  prop: PropagatableProperty,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): string[] {
  const lines: string[] = [];
  const indent = "            ";

  lines.push(`${indent}if (local.StartsWith("${prop.wireName}"u8))`);
  lines.push(`${indent}{`);

  if (prop.steps.length === 0) {
    // Direct model reference
    lines.push(
      `${indent}    return ${prop.csharpName}.Patch.TryGetEncodedValue([.. "$"u8, .. local.Slice("${prop.wireName}"u8.Length)], out value);`,
    );
  } else {
    lines.push(
      `${indent}    int propertyLength = "${prop.wireName}"u8.Length;`,
    );
    lines.push(
      `${indent}    ReadOnlySpan<byte> currentSlice = local.Slice(propertyLength);`,
    );

    let accessor = prop.csharpName;
    let arrayCount = 0;
    let dictCount = 0;

    for (let i = 0; i < prop.steps.length; i++) {
      const step = prop.steps[i];
      const isLast = i === prop.steps.length - 1;

      if (step.kind === "array") {
        const idxSuffix = getSuffix(arrayCount);
        const idxVar = `index${idxSuffix}`;
        const bytesVar = `bytesConsumed${idxSuffix}`;

        lines.push(
          `${indent}    if (!currentSlice.TryGetIndex(out int ${idxVar}, out int ${bytesVar}))`,
        );
        lines.push(`${indent}    {`);
        lines.push(`${indent}        return false;`);
        lines.push(`${indent}    }`);

        if (!isLast) {
          lines.push(
            `${indent}    currentSlice = currentSlice.Slice(${bytesVar});`,
          );
          accessor = `${accessor}[${idxVar}]`;
        } else {
          lines.push(
            `${indent}    return ${accessor}[${idxVar}].Patch.TryGetEncodedValue([.. "$"u8, .. currentSlice.Slice(${bytesVar})], out value);`,
          );
        }

        arrayCount++;
      } else {
        // dict
        const keySuffix = getSuffix(dictCount);
        const keyVar = `key${keySuffix}`;
        const iVar = `i${keySuffix}`;
        const itemVar = `item${keySuffix}`;
        const outType = getCSharpTypeString(step.dictValueType!, namePolicy);

        lines.push(
          `${indent}    string ${keyVar} = currentSlice.GetFirstPropertyName(out int ${iVar});`,
        );
        lines.push(
          `${indent}    if (!${accessor}.TryGetValue(${keyVar}, out ${outType} ${itemVar}))`,
        );
        lines.push(`${indent}    {`);
        lines.push(`${indent}        return false;`);
        lines.push(`${indent}    }`);

        if (!isLast) {
          lines.push(
            `${indent}    currentSlice = currentSlice.GetRemainder(${iVar});`,
          );
          accessor = itemVar;
        } else {
          lines.push(
            `${indent}    return ${itemVar}.Patch.TryGetEncodedValue([.. "$"u8, .. currentSlice.GetRemainder(${iVar})], out value);`,
          );
        }

        dictCount++;
      }
    }
  }

  lines.push(`${indent}}`);
  return lines;
}

/**
 * Builds the code lines for a single property's if-block inside PropagateSet.
 *
 * Same navigation pattern as PropagateGet but uses `Patch.Set(...)` + `return true`
 * instead of `Patch.TryGetEncodedValue(...)`.
 *
 * @param prop - The propagatable property descriptor.
 * @param namePolicy - The C# naming policy for type name rendering.
 * @returns Array of C# source lines for this property's if-block.
 */
function buildPropagateSetBlock(
  prop: PropagatableProperty,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): string[] {
  const lines: string[] = [];
  const indent = "            ";

  lines.push(`${indent}if (local.StartsWith("${prop.wireName}"u8))`);
  lines.push(`${indent}{`);

  if (prop.steps.length === 0) {
    // Direct model reference
    lines.push(
      `${indent}    ${prop.csharpName}.Patch.Set([.. "$"u8, .. local.Slice("${prop.wireName}"u8.Length)], value);`,
    );
    lines.push(`${indent}    return true;`);
  } else {
    lines.push(
      `${indent}    int propertyLength = "${prop.wireName}"u8.Length;`,
    );
    lines.push(
      `${indent}    ReadOnlySpan<byte> currentSlice = local.Slice(propertyLength);`,
    );

    let accessor = prop.csharpName;
    let arrayCount = 0;
    let dictCount = 0;

    for (let i = 0; i < prop.steps.length; i++) {
      const step = prop.steps[i];
      const isLast = i === prop.steps.length - 1;

      if (step.kind === "array") {
        const idxSuffix = getSuffix(arrayCount);
        const idxVar = `index${idxSuffix}`;
        const bytesVar = `bytesConsumed${idxSuffix}`;

        lines.push(
          `${indent}    if (!currentSlice.TryGetIndex(out int ${idxVar}, out int ${bytesVar}))`,
        );
        lines.push(`${indent}    {`);
        lines.push(`${indent}        return false;`);
        lines.push(`${indent}    }`);

        if (!isLast) {
          lines.push(
            `${indent}    currentSlice = currentSlice.Slice(${bytesVar});`,
          );
          accessor = `${accessor}[${idxVar}]`;
        } else {
          lines.push(
            `${indent}    ${accessor}[${idxVar}].Patch.Set([.. "$"u8, .. currentSlice.Slice(${bytesVar})], value);`,
          );
          lines.push(`${indent}    return true;`);
        }

        arrayCount++;
      } else {
        // dict
        const keySuffix = getSuffix(dictCount);
        const keyVar = `key${keySuffix}`;
        const iVar = `i${keySuffix}`;
        const itemVar = `item${keySuffix}`;
        const outType = getCSharpTypeString(step.dictValueType!, namePolicy);

        lines.push(
          `${indent}    string ${keyVar} = currentSlice.GetFirstPropertyName(out int ${iVar});`,
        );
        lines.push(
          `${indent}    if (!${accessor}.TryGetValue(${keyVar}, out ${outType} ${itemVar}))`,
        );
        lines.push(`${indent}    {`);
        lines.push(`${indent}        return false;`);
        lines.push(`${indent}    }`);

        if (!isLast) {
          lines.push(
            `${indent}    currentSlice = currentSlice.GetRemainder(${iVar});`,
          );
          accessor = itemVar;
        } else {
          lines.push(
            `${indent}    ${itemVar}.Patch.Set([.. "$"u8, .. currentSlice.GetRemainder(${iVar})], value);`,
          );
          lines.push(`${indent}    return true;`);
        }

        dictCount++;
      }
    }
  }

  lines.push(`${indent}}`);
  return lines;
}

/**
 * Generates PropagateGet and PropagateSet methods for dynamic models with nested
 * dynamic model properties.
 *
 * These methods are called by the `JsonPatch.SetPropagators` callback system to
 * recursively propagate get/set operations through nested model hierarchies.
 *
 * PropagateGet retrieves encoded values from nested models' patches by navigating
 * the JSON path through collections. PropagateSet applies values to nested patches.
 *
 * Both methods are wrapped in `#pragma warning disable/restore SCME0001` because
 * they reference the experimental `JsonPatch.EncodedValue` type.
 *
 * @param props - Contains the model type for which to generate propagators.
 * @returns JSX fragment with both methods, or null if no propagatable properties exist.
 */
export function DynamicModelPropagators(props: { type: SdkModelType }) {
  const namePolicy = useCSharpNamePolicy();
  const dynamicProps = getDynamicModelProperties(props.type, namePolicy);

  if (dynamicProps.length === 0) {
    return null;
  }

  const indent = "        ";

  // Build PropagateGet method
  const getLines: string[] = [];
  getLines.push(`${indent}/// <summary></summary>`);
  getLines.push(`${indent}/// <param name="jsonPath"></param>`);
  getLines.push(`${indent}/// <param name="value"></param>`);
  getLines.push(`${indent}/// <returns></returns>`);
  getLines.push(
    "#pragma warning disable SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates.",
  );
  getLines.push(
    `${indent}private bool PropagateGet(ReadOnlySpan<byte> jsonPath, out JsonPatch.EncodedValue value)`,
  );
  getLines.push(`${indent}{`);
  getLines.push(
    `${indent}    ReadOnlySpan<byte> local = jsonPath.SliceToStartOfPropertyName();`,
  );
  getLines.push(`${indent}    value = default;`);

  for (const prop of dynamicProps) {
    getLines.push("");
    getLines.push(...buildPropagateGetBlock(prop, namePolicy));
  }

  getLines.push(`${indent}    return false;`);
  getLines.push(`${indent}}`);
  getLines.push(
    "#pragma warning restore SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates.",
  );

  // Build PropagateSet method
  const setLines: string[] = [];
  setLines.push("");
  setLines.push(`${indent}/// <summary></summary>`);
  setLines.push(`${indent}/// <param name="jsonPath"></param>`);
  setLines.push(`${indent}/// <param name="value"></param>`);
  setLines.push(`${indent}/// <returns></returns>`);
  setLines.push(
    "#pragma warning disable SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates.",
  );
  setLines.push(
    `${indent}private bool PropagateSet(ReadOnlySpan<byte> jsonPath, JsonPatch.EncodedValue value)`,
  );
  setLines.push(`${indent}{`);
  setLines.push(
    `${indent}    ReadOnlySpan<byte> local = jsonPath.SliceToStartOfPropertyName();`,
  );

  for (const prop of dynamicProps) {
    setLines.push("");
    setLines.push(...buildPropagateSetBlock(prop, namePolicy));
  }

  setLines.push(`${indent}    return false;`);
  setLines.push(`${indent}}`);
  setLines.push(
    "#pragma warning restore SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates.",
  );

  return <>{[...getLines, ...setLines].join("\n")}</>;
}
