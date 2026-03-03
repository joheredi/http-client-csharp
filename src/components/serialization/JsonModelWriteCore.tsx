/**
 * JsonModelWriteCore component for C# model serialization files.
 *
 * Generates the `JsonModelWriteCore` method that is the core JSON serialization
 * method for models implementing `IJsonModel<T>`. This method writes each model
 * property to a `Utf8JsonWriter` and is called by the `IJsonModel<T>.Write`
 * explicit interface implementation.
 *
 * The generated method includes:
 * - **Format validation**: Verifies the serialization format is "J" (JSON),
 *   throwing `FormatException` for unsupported formats.
 * - **Virtual/override modifiers**: Root models use `protected virtual`,
 *   derived models use `protected override`.
 * - **Base class call**: Derived models call `base.JsonModelWriteCore(writer, options)`
 *   to serialize inherited properties before their own.
 * - **Property serialization**: Iterates over the model's own properties and
 *   generates `writer.WritePropertyName("name"u8)` + `writer.WriteXxxValue(Name)`
 *   for each primitive property. Derived discriminated models filter out base
 *   discriminator overrides (handled by the base class call).
 * - **Children slot**: Additional content (e.g., additional binary data from
 *   task 2.2.14) is rendered after property writes.
 *
 * @example Generated output (root model with string property):
 * ```csharp
 * protected virtual void JsonModelWriteCore(Utf8JsonWriter writer, ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Friend>)this).GetFormatFromOptions(options) : options.Format;
 *     if (format != "J")
 *     {
 *         throw new FormatException($"The model {nameof(Friend)} does not support writing '{format}' format.");
 *     }
 *     writer.WritePropertyName("name"u8);
 *     writer.WriteStringValue(Name);
 * }
 * ```
 *
 * @example Generated output (derived model with boolean property):
 * ```csharp
 * protected override void JsonModelWriteCore(Utf8JsonWriter writer, ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Dog>)this).GetFormatFromOptions(options) : options.Format;
 *     if (format != "J")
 *     {
 *         throw new FormatException($"The model {nameof(Dog)} does not support writing '{format}' format.");
 *     }
 *     base.JsonModelWriteCore(writer, options);
 *     writer.WritePropertyName("breed"u8);
 *     writer.WriteStringValue(Breed);
 * }
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { code, type Children } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { System } from "../../builtins/system.js";
import { SystemTextJson } from "../../builtins/system-text-json.js";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import {
  isBaseDiscriminatorOverride,
  isDerivedDiscriminatedModel,
} from "../models/ModelConstructors.js";
import { isDynamicModel } from "../models/DynamicModel.js";
import { WritePropertySerialization } from "./PropertySerializer.js";
import { DynamicWritePropertySerialization } from "./DynamicPropertySerializer.js";

/**
 * Props for the {@link JsonModelWriteCore} component.
 */
export interface JsonModelWriteCoreProps {
  /** The TCGC SDK model type whose serialization method is being generated. */
  type: SdkModelType;
  /**
   * Optional children for additional content after property writes.
   * Used by task 2.2.14 (additional binary data serialization) to render
   * the `_additionalBinaryDataProperties` loop after all property writes.
   */
  children?: Children;
}

/**
 * Determines whether a model is derived (has a base model) and should use
 * `protected override` instead of `protected virtual` for JsonModelWriteCore.
 *
 * @param model - The TCGC SDK model type.
 * @returns `true` if the model has a base model requiring override semantics.
 */
function shouldOverride(model: SdkModelType): boolean {
  return model.baseModel !== undefined;
}

/**
 * Generates the `JsonModelWriteCore` method for a model's serialization partial class.
 *
 * This method is the core JSON serialization entry point called by `IJsonModel<T>.Write`.
 * It validates the wire format, optionally calls the base class implementation for
 * derived models, and renders children for property-level serialization.
 *
 * Uses `code` templates with builtin refkeys to auto-generate `using` directives
 * for `System` (FormatException), `System.Text.Json` (Utf8JsonWriter), and
 * `System.ClientModel.Primitives` (ModelReaderWriterOptions, IPersistableModel).
 *
 * @param props - The component props containing the model type and optional children.
 * @returns JSX element rendering the complete method.
 */
export function JsonModelWriteCore(props: JsonModelWriteCoreProps) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const isDerived = shouldOverride(props.type);
  const isDynamic = isDynamicModel(props.type);

  // For derived discriminated models, filter out base discriminator override
  // properties (e.g., kind: "eagle") — they're serialized by the base class's
  // JsonModelWriteCore via the base.JsonModelWriteCore call.
  const isDerivedDisc = isDerivedDiscriminatedModel(props.type);
  const serializableProperties = isDerivedDisc
    ? props.type.properties.filter((p) => !isBaseDiscriminatorOverride(p))
    : props.type.properties;

  return (
    <>
      {code`protected ${isDerived ? "override" : "virtual"} void JsonModelWriteCore(${SystemTextJson.Utf8JsonWriter} writer, ${SystemClientModelPrimitives.ModelReaderWriterOptions} options)`}
      {"\n{\n"}
      {code`    string format = options.Format == "W" ? ((${SystemClientModelPrimitives.IPersistableModel}<${modelName}>)this).GetFormatFromOptions(options) : options.Format;`}
      {'\n    if (format != "J")'}
      {"\n    {"}
      {"\n"}
      {code`        throw new ${System.FormatException}($"The model {nameof(${modelName})} does not support writing '{format}' format.");`}
      {"\n    }"}
      {isDerived && "\n    base.JsonModelWriteCore(writer, options);"}
      {isDynamic &&
        "\n#pragma warning disable SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates."}
      {isDynamic
        ? serializableProperties.map((p) => (
            <DynamicWritePropertySerialization property={p} />
          ))
        : serializableProperties.map((p) => (
            <WritePropertySerialization property={p} />
          ))}
      {isDynamic ? null : props.children}
      {isDynamic && "\n\n    Patch.WriteTo(writer);"}
      {isDynamic &&
        "\n#pragma warning restore SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates."}
      {"\n}"}
    </>
  );
}
