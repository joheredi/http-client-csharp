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
 * - **Children slot**: Property serialization statements (tasks 2.2.2–2.2.14)
 *   and additional binary data (task 2.2.14) are passed as children.
 *
 * @example Generated output (root model):
 * ```csharp
 * protected virtual void JsonModelWriteCore(Utf8JsonWriter writer, ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Friend>)this).GetFormatFromOptions(options) : options.Format;
 *     if (format != "J")
 *     {
 *         throw new FormatException($"The model {nameof(Friend)} does not support writing '{format}' format.");
 *     }
 *     // property writes (children)
 * }
 * ```
 *
 * @example Generated output (derived model):
 * ```csharp
 * protected override void JsonModelWriteCore(Utf8JsonWriter writer, ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Dog>)this).GetFormatFromOptions(options) : options.Format;
 *     if (format != "J")
 *     {
 *         throw new FormatException($"The model {nameof(Dog)} does not support writing '{format}' format.");
 *     }
 *     base.JsonModelWriteCore(writer, options);
 *     // property writes (children)
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

/**
 * Props for the {@link JsonModelWriteCore} component.
 */
export interface JsonModelWriteCoreProps {
  /** The TCGC SDK model type whose serialization method is being generated. */
  type: SdkModelType;
  /**
   * Optional children for property serialization statements.
   * Future tasks (2.2.2–2.2.14) will pass property write statements and
   * additional binary data serialization as children.
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
      {props.children}
      {"\n}"}
    </>
  );
}
