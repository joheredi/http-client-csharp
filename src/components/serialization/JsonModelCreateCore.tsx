/**
 * JsonModelCreateCore component for C# model serialization files.
 *
 * Generates the `JsonModelCreateCore` method that deserializes a model from a
 * `Utf8JsonReader`. This is the format-dispatching entry point called by the
 * `IJsonModel<T>.Create` explicit interface implementation.
 *
 * The generated method includes:
 * - **Format resolution**: Resolves "W" (wire) format to the concrete format
 *   by calling `GetFormatFromOptions`, otherwise uses the specified format.
 * - **Format validation**: Throws `FormatException` if the format is not "J".
 * - **JSON parsing**: Uses `JsonDocument.ParseValue(ref reader)` to parse the
 *   reader into a `JsonDocument`, then delegates to `Deserialize{Model}`.
 * - **Virtual/override modifiers**: Root models use `protected virtual`,
 *   derived models use `protected override`.
 * - **Return type**: For root models, returns the model type itself. For derived
 *   models, returns the root base type (enabling polymorphic deserialization
 *   via the virtual method override chain).
 *
 * @example Generated output (root model):
 * ```csharp
 * protected virtual Widget JsonModelCreateCore(ref Utf8JsonReader reader, ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Widget>)this).GetFormatFromOptions(options) : options.Format;
 *     if (format != "J")
 *     {
 *         throw new FormatException($"The model {nameof(Widget)} does not support reading '{format}' format.");
 *     }
 *     using JsonDocument document = JsonDocument.ParseValue(ref reader);
 *     return DeserializeWidget(document.RootElement, options);
 * }
 * ```
 *
 * @example Generated output (derived model, root base is Animal):
 * ```csharp
 * protected override Animal JsonModelCreateCore(ref Utf8JsonReader reader, ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Dog>)this).GetFormatFromOptions(options) : options.Format;
 *     if (format != "J")
 *     {
 *         throw new FormatException($"The model {nameof(Dog)} does not support reading '{format}' format.");
 *     }
 *     using JsonDocument document = JsonDocument.ParseValue(ref reader);
 *     return DeserializeDog(document.RootElement, options);
 * }
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { System } from "../../builtins/system.js";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemTextJson } from "../../builtins/system-text-json.js";
import { isDynamicModel } from "../models/DynamicModel.js";
import { getRootModelType } from "./PersistableModelCreateCore.js";

/**
 * Props for the {@link JsonModelCreateCore} component.
 */
export interface JsonModelCreateCoreProps {
  /** The TCGC SDK model type whose deserialization method is being generated. */
  type: SdkModelType;
}

/**
 * Determines whether a model is derived (has a base model) and should use
 * `protected override` instead of `protected virtual`.
 *
 * @param model - The TCGC SDK model type.
 * @returns `true` if the model has a base model requiring override semantics.
 */
function shouldOverride(model: SdkModelType): boolean {
  return model.baseModel !== undefined;
}

/**
 * Generates the `JsonModelCreateCore` method for a model's serialization
 * partial class.
 *
 * This method is the core Utf8JsonReader deserialization entry point called by
 * `IJsonModel<T>.Create`. It resolves the wire format, parses the JSON reader
 * into a `JsonDocument`, and delegates to the model's static `Deserialize{Model}`
 * method.
 *
 * For derived models, the return type is the root base type (not the derived type)
 * because the method overrides the virtual declaration from the root base class.
 * The `IPersistableModel` cast and `Deserialize` call still use the current model name.
 *
 * Uses `code` templates with builtin refkeys to auto-generate `using` directives
 * for `System` (FormatException), `System.Text.Json` (Utf8JsonReader, JsonDocument),
 * and `System.ClientModel.Primitives` (ModelReaderWriterOptions, IPersistableModel).
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the complete method.
 */
export function JsonModelCreateCore(props: JsonModelCreateCoreProps) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const isDerived = shouldOverride(props.type);
  const rootModel = getRootModelType(props.type);
  const returnTypeName = namePolicy.getName(rootModel.name, "class");

  return (
    <>
      {`/// <param name="reader"> The JSON reader. </param>`}
      {"\n"}
      {`/// <param name="options"> The client options for reading and writing models. </param>`}
      {"\n"}
      {code`protected ${isDerived ? "override" : "virtual"} ${returnTypeName} JsonModelCreateCore(ref ${SystemTextJson.Utf8JsonReader} reader, ${SystemClientModelPrimitives.ModelReaderWriterOptions} options)`}
      {"\n{\n"}
      {code`    string format = options.Format == "W" ? ((${SystemClientModelPrimitives.IPersistableModel}<${modelName}>)this).GetFormatFromOptions(options) : options.Format;`}
      {'\n    if (format != "J")'}
      {"\n    {"}
      {"\n"}
      {code`        throw new ${System.FormatException}($"The model {nameof(${modelName})} does not support reading '{format}' format.");`}
      {"\n    }"}
      {"\n"}
      {code`    using ${SystemTextJson.JsonDocument} document = ${SystemTextJson.JsonDocument}.ParseValue(ref reader);`}
      {isDynamicModel(props.type)
        ? `\n    return Deserialize${modelName}(document.RootElement, null, options);`
        : `\n    return Deserialize${modelName}(document.RootElement, options);`}
      {"\n}"}
    </>
  );
}
