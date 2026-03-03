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
 *
 * The `[Experimental("SCME0001")]` attribute is NOT generated in this phase
 * because `ExperimentalAttribute` is inaccessible (internal) on
 * netstandard2.0. It will be added in task 7.2.1 with conditional compilation.
 *
 * The `_patch` field is only generated on root models (models without a base
 * model that already declares it).
 *
 * @see ScmModelProvider.cs in the legacy emitter for the original implementation.
 * @module
 */

import { Attribute, Field } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { UsageFlags } from "@azure-tools/typespec-client-generator-core";
import { SystemComponentModel } from "../../builtins/system-component-model.js";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemTextJsonSerialization } from "../../builtins/system-text-json-serialization.js";

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
