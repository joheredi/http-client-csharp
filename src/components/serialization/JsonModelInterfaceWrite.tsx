/**
 * JsonModelInterfaceWrite component for C# model serialization files.
 *
 * Generates the explicit interface implementation `void IJsonModel<T>.Write(...)` that
 * wraps the core JSON serialization with object delimiters:
 *
 * ```csharp
 * void IJsonModel<Widget>.Write(Utf8JsonWriter writer, ModelReaderWriterOptions options)
 * {
 *     writer.WriteStartObject();
 *     JsonModelWriteCore(writer, options);
 *     writer.WriteEndObject();
 * }
 * ```
 *
 * This method is the top-level entry point for JSON serialization when a model is
 * written through the `IJsonModel<T>` interface. It frames the JSON object with
 * `WriteStartObject`/`WriteEndObject` and delegates property-level serialization
 * to the virtual `JsonModelWriteCore` method, which handles format validation,
 * base class calls (for derived models), and per-property writing.
 *
 * Both root and derived models generate their own explicit interface implementation
 * because `IJsonModel<T>` is parameterized by the model type — e.g., `IJsonModel<Pet>`
 * and `IJsonModel<Dog>` are distinct interfaces, each requiring its own `Write` method.
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemTextJson } from "../../builtins/system-text-json.js";

/**
 * Props for the {@link JsonModelInterfaceWrite} component.
 */
export interface JsonModelInterfaceWriteProps {
  /** The TCGC SDK model type whose explicit IJsonModel.Write method is being generated. */
  type: SdkModelType;
}

/**
 * Generates the explicit `IJsonModel<T>.Write` interface implementation for
 * a model's serialization partial class.
 *
 * This method wraps the polymorphic `JsonModelWriteCore` with JSON object
 * delimiters (`WriteStartObject`/`WriteEndObject`). The body is identical for
 * root and derived models — polymorphic dispatch happens inside `JsonModelWriteCore`
 * via the virtual/override mechanism.
 *
 * Uses `code` templates with builtin refkeys for `IJsonModel`, `Utf8JsonWriter`,
 * and `ModelReaderWriterOptions` to auto-generate the required `using` directives.
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the explicit interface method.
 */
export function JsonModelInterfaceWrite(props: JsonModelInterfaceWriteProps) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");

  return (
    <>
      {code`void ${SystemClientModelPrimitives.IJsonModel}<${modelName}>.Write(${SystemTextJson.Utf8JsonWriter} writer, ${SystemClientModelPrimitives.ModelReaderWriterOptions} options)`}
      {"\n{\n"}
      {"    writer.WriteStartObject();\n"}
      {"    JsonModelWriteCore(writer, options);\n"}
      {"    writer.WriteEndObject();\n"}
      {"}"}
    </>
  );
}
