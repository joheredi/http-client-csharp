/**
 * PersistableModelWriteCore component for C# model serialization files.
 *
 * Generates the `PersistableModelWriteCore` method that serializes a model to
 * `BinaryData`. This is the format-dispatching entry point called by the
 * `IPersistableModel<T>.Write` explicit interface implementation.
 *
 * The generated method includes:
 * - **Format resolution**: Resolves "W" (wire) format to the concrete format
 *   by calling `GetFormatFromOptions`, otherwise uses the specified format.
 * - **Switch dispatch**: Routes to `ModelReaderWriter.Write` for JSON ("J").
 *   Future tasks will add XML ("X") support.
 * - **Error handling**: Throws `FormatException` for unsupported formats.
 * - **Virtual/override modifiers**: Root models use `protected virtual`,
 *   derived models use `protected override`.
 *
 * @example Generated output (root model):
 * ```csharp
 * protected virtual BinaryData PersistableModelWriteCore(ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Widget>)this).GetFormatFromOptions(options) : options.Format;
 *     switch (format)
 *     {
 *         case "J":
 *             return ModelReaderWriter.Write(this, options, WidgetContext.Default);
 *         default:
 *             throw new FormatException($"The model {nameof(Widget)} does not support writing '{options.Format}' format.");
 *     }
 * }
 * ```
 *
 * @example Generated output (derived model):
 * ```csharp
 * protected override BinaryData PersistableModelWriteCore(ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Dog>)this).GetFormatFromOptions(options) : options.Format;
 *     switch (format)
 *     {
 *         case "J":
 *             return ModelReaderWriter.Write(this, options, DogContext.Default);
 *         default:
 *             throw new FormatException($"The model {nameof(Dog)} does not support writing '{options.Format}' format.");
 *     }
 * }
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { type Children, code } from "@alloy-js/core";
import {
  type SdkModelType,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";
import { System } from "../../builtins/system.js";
import { SystemIO } from "../../builtins/system-io.js";
import { SystemXml } from "../../builtins/system-xml.js";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { modelReaderWriterContextRefkey } from "../../utils/refkey.js";

/**
 * Props for the {@link PersistableModelWriteCore} component.
 */
export interface PersistableModelWriteCoreProps {
  /** The TCGC SDK model type whose serialization method is being generated. */
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
 * Gets the XML root element name for a model.
 *
 * Uses the model's XML serialization options name if available,
 * otherwise falls back to the model's TypeSpec name.
 *
 * @param model - The TCGC SDK model type.
 * @returns The XML root element name string.
 */
function getXmlRootElementName(model: SdkModelType): string {
  return model.serializationOptions.xml?.name ?? model.name;
}

/**
 * Generates the `PersistableModelWriteCore` method for a model's serialization
 * partial class.
 *
 * This method is the core BinaryData serialization entry point called by
 * `IPersistableModel<T>.Write`. It resolves the wire format and dispatches to
 * `ModelReaderWriter.Write` for JSON serialization.
 *
 * The return type is always `BinaryData` regardless of the model's position
 * in the inheritance hierarchy.
 *
 * Uses `code` templates with builtin refkeys to auto-generate `using` directives
 * for `System` (BinaryData, FormatException), and `System.ClientModel.Primitives`
 * (ModelReaderWriterOptions, IPersistableModel, ModelReaderWriter).
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the complete method.
 */
export function PersistableModelWriteCore(
  props: PersistableModelWriteCoreProps,
) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const isDerived = shouldOverride(props.type);

  const supportsJson = (props.type.usage & UsageFlags.Json) !== 0;
  const supportsXml = (props.type.usage & UsageFlags.Xml) !== 0;

  // Build the format cases based on which serialization formats the model supports
  const formatCases: Children[] = [];

  if (supportsJson) {
    formatCases.push(
      <>
        {'\n        case "J":'}
        {"\n"}
        {code`            return ${SystemClientModelPrimitives.ModelReaderWriter}.Write(this, options, ${modelReaderWriterContextRefkey()}.Default);`}
      </>,
    );
  }

  if (supportsXml) {
    const xmlRootName = getXmlRootElementName(props.type);
    formatCases.push(
      <>
        {'\n        case "X":'}
        {"\n"}
        {code`            using (${SystemIO.MemoryStream} stream = new ${SystemIO.MemoryStream}(256))`}
        {"\n            {"}
        {"\n"}
        {code`                using (${SystemXml.XmlWriter} writer = ${SystemXml.XmlWriter}.Create(stream, ModelSerializationExtensions.XmlWriterSettings))`}
        {"\n                {"}
        {`\n                    WriteXml(writer, options, "${xmlRootName}");`}
        {"\n                }"}
        {"\n                if (stream.Position > int.MaxValue)"}
        {"\n                {"}
        {"\n"}
        {code`                    return ${System.BinaryData}.FromStream(stream);`}
        {"\n                }"}
        {"\n                else"}
        {"\n                {"}
        {"\n"}
        {code`                    return new ${System.BinaryData}(stream.GetBuffer().AsMemory(0, (int)stream.Position));`}
        {"\n                }"}
        {"\n            }"}
      </>,
    );
  }

  return (
    <>
      {code`protected ${isDerived ? "override" : "virtual"} ${System.BinaryData} PersistableModelWriteCore(${SystemClientModelPrimitives.ModelReaderWriterOptions} options)`}
      {"\n{\n"}
      {code`    string format = options.Format == "W" ? ((${SystemClientModelPrimitives.IPersistableModel}<${modelName}>)this).GetFormatFromOptions(options) : options.Format;`}
      {"\n    switch (format)"}
      {"\n    {"}
      {formatCases}
      {"\n        default:"}
      {"\n"}
      {code`            throw new ${System.FormatException}($"The model {nameof(${modelName})} does not support writing '{options.Format}' format.");`}
      {"\n    }"}
      {"\n}"}
    </>
  );
}
