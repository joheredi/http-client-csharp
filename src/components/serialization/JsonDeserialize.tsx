/**
 * JsonDeserialize component for C# model deserialization.
 *
 * Generates the `DeserializeXxx` static method that is the core JSON
 * deserialization method for models implementing `IJsonModel<T>`. This method
 * takes a `JsonElement` and `ModelReaderWriterOptions` and returns a fully
 * populated model instance.
 *
 * The generated method includes:
 * - **Method signature**: `internal static {Model} Deserialize{Model}(JsonElement element, ModelReaderWriterOptions options)`
 * - **Null check**: Returns null early if the JSON element is `JsonValueKind.Null`.
 * - **Children slot**: Subsequent tasks add variable declarations (2.3.3),
 *   the property matching loop (2.3.4–2.3.12), and the constructor return (2.3.13).
 *
 * The method name follows the legacy emitter's convention: `Deserialize{PascalCaseModelName}`.
 * Uses `code` templates with builtin refkeys to auto-generate `using` directives
 * for `System.Text.Json` (JsonElement) and `System.ClientModel.Primitives`
 * (ModelReaderWriterOptions).
 *
 * @example Generated output for a simple model:
 * ```csharp
 * internal static Widget DeserializeWidget(JsonElement element, ModelReaderWriterOptions options)
 * {
 *     if (element.ValueKind == JsonValueKind.Null)
 *     {
 *         return null;
 *     }
 * }
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { code, type Children } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemTextJson } from "../../builtins/system-text-json.js";

/**
 * Props for the {@link JsonDeserialize} component.
 */
export interface JsonDeserializeProps {
  /** The TCGC SDK model type whose deserialization method is being generated. */
  type: SdkModelType;
  /**
   * Optional children for the method body content.
   * Used by subsequent tasks to add variable declarations (2.3.3),
   * property matching loop (2.3.4–2.3.12), and constructor return (2.3.13).
   */
  children?: Children;
}

/**
 * Generates the `DeserializeXxx` static deserialization method for a model.
 *
 * This is the core deserialization entry point called by the `IJsonModel<T>.Create`
 * explicit interface implementation. It produces an `internal static` method that
 * takes a `JsonElement` and `ModelReaderWriterOptions`, returning a populated
 * model instance. The method name follows the legacy emitter's convention:
 * `Deserialize{PascalCaseModelName}`.
 *
 * The null check returns null for class models. Struct support (returning `default`)
 * is future work (task 1.2.8).
 *
 * @param props - The component props containing the model type and optional children.
 * @returns JSX element rendering the deserialization method.
 */
export function JsonDeserialize(props: JsonDeserializeProps) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");

  return (
    <>
      {code`internal static ${modelName} Deserialize${modelName}(${SystemTextJson.JsonElement} element, ${SystemClientModelPrimitives.ModelReaderWriterOptions} options)`}
      {"\n{"}
      {"\n    if (element.ValueKind == JsonValueKind.Null)"}
      {"\n    {"}
      {"\n        return null;"}
      {"\n    }"}
      {props.children}
      {"\n}"}
    </>
  );
}
