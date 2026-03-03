/**
 * PersistableModelCreateCore component for C# model serialization files.
 *
 * Generates the `PersistableModelCreateCore` method that deserializes a model
 * from `BinaryData`. This is the format-dispatching entry point called by the
 * `IPersistableModel<T>.Create` explicit interface implementation.
 *
 * The generated method includes:
 * - **Format resolution**: Resolves "W" (wire) format to the concrete format
 *   by calling `GetFormatFromOptions`, otherwise uses the specified format.
 * - **Switch dispatch**: Routes to `JsonDocument.Parse` → `Deserialize{Model}`
 *   for JSON ("J"). Future tasks will add XML ("X") support.
 * - **Error handling**: Throws `FormatException` for unsupported formats.
 * - **Virtual/override modifiers**: Root models use `protected virtual`,
 *   derived models use `protected override`.
 * - **Return type**: For root models, returns the model type itself. For derived
 *   models, returns the root base type (enabling polymorphic deserialization).
 *
 * @example Generated output (root model):
 * ```csharp
 * protected virtual Widget PersistableModelCreateCore(BinaryData data, ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Widget>)this).GetFormatFromOptions(options) : options.Format;
 *     switch (format)
 *     {
 *         case "J":
 *             using (JsonDocument document = JsonDocument.Parse(data))
 *             {
 *                 return DeserializeWidget(document.RootElement, options);
 *             }
 *         default:
 *             throw new FormatException($"The model {nameof(Widget)} does not support reading '{options.Format}' format.");
 *     }
 * }
 * ```
 *
 * @example Generated output (derived model, root base is Animal):
 * ```csharp
 * protected override Animal PersistableModelCreateCore(BinaryData data, ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Dog>)this).GetFormatFromOptions(options) : options.Format;
 *     switch (format)
 *     {
 *         case "J":
 *             using (JsonDocument document = JsonDocument.Parse(data))
 *             {
 *                 return DeserializeDog(document.RootElement, options);
 *             }
 *         default:
 *             throw new FormatException($"The model {nameof(Dog)} does not support reading '{options.Format}' format.");
 *     }
 * }
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { UsageFlags } from "@azure-tools/typespec-client-generator-core";
import { System } from "../../builtins/system.js";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemIO } from "../../builtins/system-io.js";
import { SystemTextJson } from "../../builtins/system-text-json.js";
import { SystemXmlLinq } from "../../builtins/system-xml-linq.js";

/**
 * Props for the {@link PersistableModelCreateCore} component.
 */
export interface PersistableModelCreateCoreProps {
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
 * Finds the root model type in an inheritance chain.
 *
 * For a model hierarchy like Dog → Pet → Animal, this returns Animal.
 * For a root model with no base, this returns the model itself.
 * Used to determine the return type of `PersistableModelCreateCore` — derived
 * models must return the root type to match the virtual method signature.
 *
 * @param model - The TCGC SDK model type.
 * @returns The root model type at the top of the inheritance chain.
 */
export function getRootModelType(model: SdkModelType): SdkModelType {
  let current = model;
  while (current.baseModel) {
    current = current.baseModel;
  }
  return current;
}

/**
 * Generates the `PersistableModelCreateCore` method for a model's serialization
 * partial class.
 *
 * This method is the core BinaryData deserialization entry point called by
 * `IPersistableModel<T>.Create`. It resolves the wire format, parses the
 * BinaryData as a JsonDocument, and delegates to the model's static
 * `Deserialize{Model}` method.
 *
 * For derived models, the return type is the root base type (not the derived type)
 * because the method overrides the virtual declaration from the root base class.
 * The IPersistableModel cast and Deserialize call still use the current model name.
 *
 * Uses `code` templates with builtin refkeys to auto-generate `using` directives
 * for `System` (BinaryData, FormatException), `System.Text.Json` (JsonDocument),
 * and `System.ClientModel.Primitives` (ModelReaderWriterOptions, IPersistableModel).
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the complete method.
 */
export function PersistableModelCreateCore(
  props: PersistableModelCreateCoreProps,
) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const isDerived = shouldOverride(props.type);
  const rootModel = getRootModelType(props.type);
  const returnTypeName = namePolicy.getName(rootModel.name, "class");
  const supportsJson = (props.type.usage & UsageFlags.Json) !== 0;
  const supportsXml = (props.type.usage & UsageFlags.Xml) !== 0;

  return (
    <>
      {code`protected ${isDerived ? "override" : "virtual"} ${returnTypeName} PersistableModelCreateCore(${System.BinaryData} data, ${SystemClientModelPrimitives.ModelReaderWriterOptions} options)`}
      {"\n{\n"}
      {code`    string format = options.Format == "W" ? ((${SystemClientModelPrimitives.IPersistableModel}<${modelName}>)this).GetFormatFromOptions(options) : options.Format;`}
      {"\n    switch (format)"}
      {"\n    {"}
      {supportsJson && '\n        case "J":'}
      {supportsJson && "\n"}
      {supportsJson &&
        code`            using (${SystemTextJson.JsonDocument} document = ${SystemTextJson.JsonDocument}.Parse(data))`}
      {supportsJson && "\n            {"}
      {supportsJson &&
        `\n                return Deserialize${modelName}(document.RootElement, options);`}
      {supportsJson && "\n            }"}
      {supportsXml && '\n        case "X":'}
      {supportsXml && "\n"}
      {supportsXml &&
        code`            using (${SystemIO.Stream} dataStream = data.ToStream())`}
      {supportsXml && "\n            {"}
      {supportsXml && "\n"}
      {supportsXml &&
        code`                return Deserialize${modelName}(${SystemXmlLinq.XElement}.Load(dataStream, ${SystemXmlLinq.LoadOptions}.PreserveWhitespace), options);`}
      {supportsXml && "\n            }"}
      {"\n        default:"}
      {"\n"}
      {code`            throw new ${System.FormatException}($"The model {nameof(${modelName})} does not support reading '{options.Format}' format.");`}
      {"\n    }"}
      {"\n}"}
    </>
  );
}
