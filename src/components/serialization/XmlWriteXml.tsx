/**
 * XmlWriteXml component for C# model serialization files.
 *
 * Generates the private `WriteXml` method that wraps `XmlModelWriteCore` with
 * optional XML element start/end tags. This method is called from
 * `PersistableModelWriteCore` (with a name hint for the root element) and from
 * `WriteObjectValue` extension method (with null name hint for nested models).
 *
 * The `nameHint` parameter controls whether to emit wrapping element tags:
 * - When non-null: writes `WriteStartElement(nameHint)` / `WriteEndElement()`
 *   around the core content. Used when serializing the root document element.
 * - When null: writes only the core content (attributes + child elements).
 *   Used by `WriteObjectValue` for nested model serialization where the caller
 *   already provides the wrapping element.
 *
 * For models with XML namespace info on the root element, uses the three-argument
 * overload: `WriteStartElement(prefix, nameHint, namespace)`.
 *
 * @example Generated output (no namespace):
 * ```csharp
 * private void WriteXml(XmlWriter writer, ModelReaderWriterOptions options, string nameHint)
 * {
 *     if (nameHint != null)
 *     {
 *         writer.WriteStartElement(nameHint);
 *     }
 *
 *     XmlModelWriteCore(writer, options);
 *
 *     if (nameHint != null)
 *     {
 *         writer.WriteEndElement();
 *     }
 * }
 * ```
 *
 * @module
 */

import { code } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { SystemXml } from "../../builtins/system-xml.js";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";

/**
 * Props for the {@link XmlWriteXml} component.
 */
export interface XmlWriteXmlProps {
  /** The TCGC SDK model type whose WriteXml method is being generated. */
  type: SdkModelType;
}

/**
 * Generates the private `WriteXml` method for XML model serialization.
 *
 * This method serves as the bridge between `PersistableModelWriteCore` (which
 * creates the XmlWriter) and `XmlModelWriteCore` (which writes the properties).
 * It optionally wraps the content in root element tags based on the `nameHint`
 * parameter.
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the WriteXml method.
 */
export function XmlWriteXml(props: XmlWriteXmlProps) {
  const xmlInfo = props.type.serializationOptions.xml;
  const ns = xmlInfo?.ns;

  // Determine the WriteStartElement call based on namespace presence
  const writeStartElement = ns
    ? `writer.WriteStartElement("${ns.prefix}", nameHint, "${ns.namespace}")`
    : "writer.WriteStartElement(nameHint)";

  return (
    <>
      {code`private void WriteXml(${SystemXml.XmlWriter} writer, ${SystemClientModelPrimitives.ModelReaderWriterOptions} options, string nameHint)`}
      {"\n{"}
      {"\n    if (nameHint != null)"}
      {"\n    {"}
      {`\n        ${writeStartElement};`}
      {"\n    }"}
      {"\n"}
      {"\n    XmlModelWriteCore(writer, options);"}
      {"\n"}
      {"\n    if (nameHint != null)"}
      {"\n    {"}
      {"\n        writer.WriteEndElement();"}
      {"\n    }"}
      {"\n}"}
    </>
  );
}
