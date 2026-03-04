/**
 * XmlModelWriteCore component for C# model serialization files.
 *
 * Generates the `XmlModelWriteCore` method that writes all model properties
 * as XML attributes, elements, and text content using `XmlWriter`. This is
 * the core serialization method called by `WriteXml`.
 *
 * The generated method includes:
 * - **Format validation**: Checks format is "X" (XML), throws `FormatException` if not.
 * - **Attribute writes**: Properties marked as XML attributes are written first.
 * - **Element writes**: Properties serialized as XML elements (simple, model, array, dict).
 * - **Text content**: Unwrapped text properties written directly via `WriteValue`.
 * - **Virtual/override modifiers**: Root models use `protected virtual`,
 *   derived models use `protected override`.
 * - **Base call**: Derived models call `base.XmlModelWriteCore(writer, options)`.
 *
 * Property categories (written in this order per the legacy emitter):
 * 1. Attributes — `writer.WriteStartAttribute()` / `writer.WriteEndAttribute()`
 * 2. Elements — `writer.WriteStartElement()` / `writer.WriteEndElement()`
 * 3. Text content — `writer.WriteValue(Content)` (for unwrapped text properties)
 *
 * @example Generated output (simple model):
 * ```csharp
 * protected virtual void XmlModelWriteCore(XmlWriter writer, ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Widget>)this).GetFormatFromOptions(options) : options.Format;
 *     if (format != "X")
 *     {
 *         throw new FormatException($"The model {nameof(Widget)} does not support writing '{format}' format.");
 *     }
 *
 *     writer.WriteStartAttribute("id");
 *     writer.WriteValue(Id);
 *     writer.WriteEndAttribute();
 *     writer.WriteStartElement("name");
 *     writer.WriteValue(Name);
 *     writer.WriteEndElement();
 * }
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { type Children, code } from "@alloy-js/core";
import type {
  SdkArrayType,
  SdkBuiltInType,
  SdkDateTimeType,
  SdkDictionaryType,
  SdkDurationType,
  SdkModelPropertyType,
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { System } from "../../builtins/system.js";
import { SystemXml } from "../../builtins/system-xml.js";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { unwrapNullableType } from "../../utils/nullable.js";
import {
  needsSerializationGuard,
  buildGuardCondition,
  needsNullableValueAccess,
  getWriteMethodInfo,
} from "./PropertySerializer.js";

/**
 * Props for the {@link XmlModelWriteCore} component.
 */
export interface XmlModelWriteCoreProps {
  /** The TCGC SDK model type whose XML serialization method is being generated. */
  type: SdkModelType;
}

/**
 * Determines whether a model is derived (has a base model) and should use
 * `protected override` instead of `protected virtual`.
 */
function shouldOverride(model: SdkModelType): boolean {
  return model.baseModel !== undefined;
}

// ---------------------------------------------------------------------------
// Type-kind sets (same as PropertySerializer but for convenience)
// ---------------------------------------------------------------------------

const STRING_KINDS = new Set(["string", "url"]);
const NUMBER_KINDS = new Set([
  "int8",
  "int16",
  "int32",
  "int64",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "float32",
  "float64",
  "decimal",
  "decimal128",
  "safeint",
  "numeric",
  "integer",
  "float",
]);
const BOOLEAN_KINDS = new Set(["boolean"]);

// ---------------------------------------------------------------------------
// XML value write helpers
// ---------------------------------------------------------------------------

/**
 * Returns the XML `WriteValue` call expression for a scalar/enum value.
 *
 * For simple types (string, int, bool, float), returns `writer.WriteValue(expr)`.
 * For DateTime/Duration/Bytes, returns the format-aware extension method call
 * (e.g., `writer.WriteStringValue(expr, "O")`).
 * For enums, applies the same value transform as JSON (ToSerialString, cast, etc.)
 * but uses `writer.WriteValue(transformed)` instead of WriteStringValue/WriteNumberValue.
 *
 * @param type - The SDK type of the value.
 * @param valueExpr - The C# expression for the value.
 * @returns The write statement string, or null if not a scalar type.
 */
function getXmlScalarWrite(type: SdkType, valueExpr: string): string | null {
  const unwrapped = unwrapNullableType(type);
  const kind =
    unwrapped.kind === "constant" ? unwrapped.valueType.kind : unwrapped.kind;

  // Simple types — XmlWriter.WriteValue handles overloads for string, int, bool, etc.
  if (
    STRING_KINDS.has(kind) ||
    NUMBER_KINDS.has(kind) ||
    BOOLEAN_KINDS.has(kind)
  ) {
    return `writer.WriteValue(${valueExpr});`;
  }

  // DateTime — uses the extension method WriteStringValue(value, format)
  if (kind === "utcDateTime" || kind === "offsetDateTime") {
    const encoding = (unwrapped as SdkDateTimeType).encode;
    let format: string;
    switch (encoding) {
      case "rfc7231":
        format = "R";
        break;
      case "unixTimestamp":
        format = "U";
        break;
      default:
        format = "O";
    }
    if (encoding === "unixTimestamp") {
      return `writer.WriteNumberValue(${valueExpr}, "${format}");`;
    }
    return `writer.WriteStringValue(${valueExpr}, "${format}");`;
  }

  // Duration — WriteStringValue with "P" for ISO8601
  if (kind === "duration") {
    const encoding = (unwrapped as SdkDurationType).encode;
    switch (encoding) {
      case "seconds":
        return `writer.WriteValue(${valueExpr}.TotalSeconds);`;
      case "milliseconds":
        return `writer.WriteValue(${valueExpr}.TotalMilliseconds);`;
      default:
        return `writer.WriteStringValue(${valueExpr}, "P");`;
    }
  }

  // Plain date/time
  if (kind === "plainDate")
    return `writer.WriteStringValue(${valueExpr}, "D");`;
  if (kind === "plainTime")
    return `writer.WriteStringValue(${valueExpr}, "T");`;

  // Bytes — WriteBase64StringValue
  if (kind === "bytes") {
    const encoding = (unwrapped as SdkBuiltInType).encode;
    const format = encoding === "base64url" ? "U" : "D";
    return `writer.WriteBase64StringValue(${valueExpr}.ToArray(), "${format}");`;
  }

  // Enum — reuse getWriteMethodInfo for value transforms, but use WriteValue
  if (kind === "enum") {
    const writeInfo = getWriteMethodInfo(type);
    if (!writeInfo) return null;
    const valuePart = writeInfo.valueTransform
      ? writeInfo.valueTransform(valueExpr)
      : valueExpr;
    return `writer.WriteValue(${valuePart});`;
  }

  // Unknown/any — ToString()
  if (kind === "unknown") {
    return `writer.WriteValue(${valueExpr}.ToString());`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// XML property categorization
// ---------------------------------------------------------------------------

interface CategorizedXmlProperties {
  attributes: SdkModelPropertyType[];
  elements: SdkModelPropertyType[];
  textContent: SdkModelPropertyType | null;
}

/**
 * Categorizes model properties into XML attributes, elements, and text content.
 *
 * Properties are categorized based on their XML serialization options:
 * - `attribute === true` → XML attribute
 * - `unwrapped === true` with no name → text content (rare, for mixed content)
 * - Everything else → XML element
 *
 * Properties without XML serialization options are treated as elements,
 * using their serialized name as the element name.
 *
 * @param properties - The model's properties to categorize.
 * @returns Categorized properties in the order they should be written.
 */
function categorizeXmlProperties(
  properties: SdkModelPropertyType[],
): CategorizedXmlProperties {
  const attributes: SdkModelPropertyType[] = [];
  const elements: SdkModelPropertyType[] = [];
  let textContent: SdkModelPropertyType | null = null;

  for (const prop of properties) {
    // Skip discriminator properties inherited from base (they're written by base)
    if (prop.kind !== "property") continue;

    const xmlInfo = prop.serializationOptions.xml;
    if (xmlInfo?.attribute) {
      attributes.push(prop);
    } else if (isTextContent(prop)) {
      textContent = prop;
    } else {
      elements.push(prop);
    }
  }

  return { attributes, elements, textContent };
}

/**
 * Determines if a property is text content (unwrapped without a name that
 * would make it an element). Text content is written directly via
 * `writer.WriteValue(Content)` without element wrappers.
 */
function isTextContent(prop: SdkModelPropertyType): boolean {
  const xmlInfo = prop.serializationOptions.xml;
  if (!xmlInfo) return false;
  // Text content is identified by being unwrapped AND not having an element name
  // that would wrap it. In the legacy emitter, this is the "content" property
  // pattern where the property value IS the text content of the parent element.
  // We detect this when the property is unwrapped and the type is a simple scalar.
  if (!xmlInfo.unwrapped) return false;
  if (xmlInfo.attribute) return false;
  const unwrapped = unwrapNullableType(prop.type);
  // Text content is only for simple scalar types, not arrays/dicts/models
  return (
    unwrapped.kind !== "array" &&
    unwrapped.kind !== "dict" &&
    unwrapped.kind !== "model"
  );
}

// ---------------------------------------------------------------------------
// XML property rendering
// ---------------------------------------------------------------------------

/**
 * Renders an XML attribute write for a property.
 *
 * Generates either a simple attribute or a namespaced attribute:
 * - Simple: `writer.WriteStartAttribute("name"); writer.WriteValue(Value); writer.WriteEndAttribute();`
 * - Namespaced: `writer.WriteAttributeString("prefix", "name", "namespace", value);`
 */
function renderXmlAttribute(
  prop: SdkModelPropertyType,
  csharpName: string,
  indent: string,
): Children {
  const xmlInfo = prop.serializationOptions.xml!;
  const xmlName = xmlInfo.name;
  const ns = xmlInfo.ns;
  const valueExpr = needsNullableValueAccess(prop)
    ? `${csharpName}.Value`
    : csharpName;

  // Namespaced attributes use the single-call WriteAttributeString overload
  if (ns) {
    // For namespaced string attributes, WriteAttributeString takes string value directly
    const scalarWrite = getXmlScalarWrite(prop.type, valueExpr);
    if (scalarWrite && scalarWrite.startsWith("writer.WriteValue(")) {
      // Extract the value expression from "writer.WriteValue(expr);"
      const valExpr = scalarWrite.slice("writer.WriteValue(".length, -2);
      return (
        <>
          {`\n${indent}writer.WriteAttributeString("${ns.prefix}", "${xmlName}", "${ns.namespace}", ${valExpr});`}
        </>
      );
    }
    // Fallback for non-simple types: use start/end attribute pattern
    return (
      <>
        {`\n${indent}writer.WriteStartAttribute("${ns.prefix}", "${xmlName}", "${ns.namespace}");`}
        {`\n${indent}${getXmlScalarWrite(prop.type, valueExpr) ?? `writer.WriteValue(${valueExpr});`}`}
        {`\n${indent}writer.WriteEndAttribute();`}
      </>
    );
  }

  // Simple (non-namespaced) attributes
  return (
    <>
      {`\n${indent}writer.WriteStartAttribute("${xmlName}");`}
      {`\n${indent}writer.WriteValue(${valueExpr});`}
      {`\n${indent}writer.WriteEndAttribute();`}
    </>
  );
}

/**
 * Renders an XML element write for a property.
 *
 * Handles all property type variations:
 * - Simple scalar: element wrapper + WriteValue
 * - Model: element wrapper + WriteObjectValue
 * - Array (wrapped): wrapper element + foreach loop
 * - Array (unwrapped): foreach without wrapper
 * - Dictionary: wrapper element + foreach with pair.Key as element name
 * - Namespaced elements: uses prefix/namespace overloads
 */
function renderXmlElement(
  prop: SdkModelPropertyType,
  csharpName: string,
  indent: string,
): Children | null {
  const xmlInfo = prop.serializationOptions.xml!;
  const xmlName = xmlInfo.name;
  const ns = xmlInfo.ns;
  const unwrapped = unwrapNullableType(prop.type);
  const valueExpr = needsNullableValueAccess(prop)
    ? `${csharpName}.Value`
    : csharpName;

  // Array types
  if (unwrapped.kind === "array") {
    return renderXmlArrayElement(prop, csharpName, indent);
  }

  // Dictionary types
  if (unwrapped.kind === "dict") {
    return renderXmlDictionaryElement(prop, csharpName, indent);
  }

  // Model types
  if (unwrapped.kind === "model") {
    const startElem = ns
      ? `writer.WriteStartElement("${ns.prefix}", "${xmlName}", "${ns.namespace}")`
      : `writer.WriteStartElement("${xmlName}")`;
    return (
      <>
        {`\n${indent}${startElem};`}
        {`\n${indent}writer.WriteObjectValue(${valueExpr}, options);`}
        {`\n${indent}writer.WriteEndElement();`}
      </>
    );
  }

  // Scalar types
  const scalarWrite = getXmlScalarWrite(prop.type, valueExpr);
  if (scalarWrite) {
    const startElem = ns
      ? `writer.WriteStartElement("${ns.prefix}", "${xmlName}", "${ns.namespace}")`
      : `writer.WriteStartElement("${xmlName}")`;
    return (
      <>
        {`\n${indent}${startElem};`}
        {`\n${indent}${scalarWrite}`}
        {`\n${indent}writer.WriteEndElement();`}
      </>
    );
  }

  return null;
}

/**
 * Renders XML array serialization for a property.
 *
 * Handles wrapped and unwrapped arrays:
 * - **Wrapped**: `<WrapperName><ItemName>value</ItemName>...</WrapperName>`
 * - **Unwrapped**: `<ItemName>value</ItemName>...` (no wrapper element)
 */
function renderXmlArrayElement(
  prop: SdkModelPropertyType,
  csharpName: string,
  indent: string,
): Children | null {
  const xmlInfo = prop.serializationOptions.xml!;
  const xmlName = xmlInfo.name;
  const ns = xmlInfo.ns;
  const isUnwrapped = xmlInfo.unwrapped === true;
  const arrayType = unwrapNullableType(prop.type) as SdkArrayType;
  const itemType = arrayType.valueType;
  const unwrappedItemType = unwrapNullableType(itemType);

  // Determine item element name from itemsName or derive from type
  const itemXmlInfo = getItemXmlInfo(prop, unwrappedItemType);
  const itemName = itemXmlInfo.name;
  const itemNs = itemXmlInfo.ns;

  const innerIndent = indent + "    ";
  const itemWrite = renderXmlItemWrite(
    unwrappedItemType,
    "item",
    itemName,
    itemNs,
    innerIndent,
  );
  if (!itemWrite) return null;

  if (isUnwrapped) {
    // Unwrapped: foreach without wrapper element, use property xmlName as element name
    return (
      <>
        {`\n${indent}foreach (`}
        <TypeExpression type={unwrappedItemType.__raw!} />
        {` item in ${csharpName})`}
        {`\n${indent}{`}
        {`\n${innerIndent}writer.WriteStartElement("${xmlName}");`}
        {renderXmlItemValue(unwrappedItemType, "item", innerIndent)}
        {`\n${innerIndent}writer.WriteEndElement();`}
        {`\n${indent}}`}
      </>
    );
  }

  // Wrapped: wrapper element + foreach + item elements
  const startWrapper = ns
    ? `writer.WriteStartElement("${ns.prefix}", "${xmlName}", "${ns.namespace}")`
    : `writer.WriteStartElement("${xmlName}")`;

  return (
    <>
      {`\n${indent}${startWrapper};`}
      {`\n${indent}foreach (`}
      <TypeExpression type={unwrappedItemType.__raw!} />
      {` item in ${csharpName})`}
      {`\n${indent}{`}
      {itemWrite}
      {`\n${indent}}`}
      {`\n${indent}writer.WriteEndElement();`}
    </>
  );
}

/**
 * Gets the XML element name and namespace for array items.
 */
function getItemXmlInfo(
  prop: SdkModelPropertyType,
  itemType: SdkType,
): { name: string; ns?: { prefix: string; namespace: string } } {
  const xmlInfo = prop.serializationOptions.xml!;

  // Use itemsName if specified
  if (xmlInfo.itemsName) {
    return { name: xmlInfo.itemsName, ns: xmlInfo.itemsNs };
  }

  // For model items, check if the item type has its own XML name
  if (itemType.kind === "model") {
    const itemXml = itemType.serializationOptions?.xml;
    if (itemXml?.name) {
      return { name: itemXml.name, ns: itemXml.ns };
    }
    // Fallback: use the model name
    return { name: itemType.name };
  }

  // For arrays of arrays, use "Array"
  if (itemType.kind === "array") return { name: "Array" };

  // For dictionaries, use "Record"
  if (itemType.kind === "dict") return { name: "Record" };

  // For primitives, use the C# type name
  return { name: getPrimitiveXmlName(itemType) };
}

/**
 * Gets a default XML element name for a primitive type.
 */
function getPrimitiveXmlName(type: SdkType): string {
  const unwrapped = unwrapNullableType(type);
  const kind =
    unwrapped.kind === "constant" ? unwrapped.valueType.kind : unwrapped.kind;
  if (kind === "string" || kind === "url") return "string";
  if (kind === "int32") return "int";
  if (kind === "int64") return "long";
  if (kind === "float32") return "float";
  if (kind === "float64") return "double";
  if (kind === "boolean") return "boolean";
  return "string"; // fallback
}

/**
 * Renders the XML write for a single array/collection item.
 * Wraps the value in start/end element tags.
 */
function renderXmlItemWrite(
  itemType: SdkType,
  itemVar: string,
  elementName: string,
  ns: { prefix: string; namespace: string } | undefined,
  indent: string,
): Children | null {
  const startElem = ns
    ? `writer.WriteStartElement("${ns.prefix}", "${elementName}", "${ns.namespace}")`
    : `writer.WriteStartElement("${elementName}")`;

  // Model items — WriteObjectValue
  if (itemType.kind === "model") {
    return (
      <>
        {`\n${indent}${startElem};`}
        {`\n${indent}writer.WriteObjectValue(${itemVar}, options);`}
        {`\n${indent}writer.WriteEndElement();`}
      </>
    );
  }

  // Array of arrays — nested foreach
  if (itemType.kind === "array") {
    const innerArray = itemType as SdkArrayType;
    const innerItemType = unwrapNullableType(innerArray.valueType);
    const innerIndent = indent + "    ";
    const innerItemXml = getItemXmlInfo(
      // Create a minimal property-like object for the inner array
      { serializationOptions: { xml: {} } } as unknown as SdkModelPropertyType,
      innerItemType,
    );
    const innerWrite = renderXmlItemWrite(
      innerItemType,
      "item0",
      innerItemXml.name,
      innerItemXml.ns,
      innerIndent,
    );
    if (!innerWrite) return null;

    return (
      <>
        {`\n${indent}${startElem};`}
        {`\n${indent}foreach (`}
        <TypeExpression type={innerItemType.__raw!} />
        {` item0 in ${itemVar})`}
        {`\n${indent}{`}
        {innerWrite}
        {`\n${indent}}`}
        {`\n${indent}writer.WriteEndElement();`}
      </>
    );
  }

  // Dictionary item — nested foreach with pair.Key as element name
  if (itemType.kind === "dict") {
    const dictType = itemType as SdkDictionaryType;
    const innerIndent = indent + "    ";
    const valueWrite = renderXmlDictValueWrite(
      dictType.valueType,
      "pair",
      innerIndent,
    );
    if (!valueWrite) return null;

    return (
      <>
        {`\n${indent}${startElem};`}
        {`\n${indent}foreach (var pair in ${itemVar})`}
        {`\n${indent}{`}
        {`\n${innerIndent}writer.WriteStartElement(pair.Key);`}
        {valueWrite}
        {`\n${innerIndent}writer.WriteEndElement();`}
        {`\n${indent}}`}
        {`\n${indent}writer.WriteEndElement();`}
      </>
    );
  }

  // Scalar items
  const scalarWrite = getXmlScalarWrite(itemType, itemVar);
  if (scalarWrite) {
    return (
      <>
        {`\n${indent}${startElem};`}
        {`\n${indent}${scalarWrite}`}
        {`\n${indent}writer.WriteEndElement();`}
      </>
    );
  }

  return null;
}

/**
 * Renders the value portion of an XML item write (without element wrappers).
 * Used for unwrapped arrays where the caller handles the element wrapping.
 */
function renderXmlItemValue(
  itemType: SdkType,
  itemVar: string,
  indent: string,
): Children | null {
  if (itemType.kind === "model") {
    return <>{`\n${indent}writer.WriteObjectValue(${itemVar}, options);`}</>;
  }

  const scalarWrite = getXmlScalarWrite(itemType, itemVar);
  if (scalarWrite) {
    return <>{`\n${indent}${scalarWrite}`}</>;
  }

  return null;
}

/**
 * Renders XML dictionary element serialization for a property.
 *
 * Dictionary entries are written as child elements where the key becomes
 * the element name and the value becomes the element content.
 */
function renderXmlDictionaryElement(
  prop: SdkModelPropertyType,
  csharpName: string,
  indent: string,
): Children | null {
  const xmlInfo = prop.serializationOptions.xml!;
  const xmlName = xmlInfo.name;
  const ns = xmlInfo.ns;
  const dictType = unwrapNullableType(prop.type) as SdkDictionaryType;
  const innerIndent = indent + "    ";

  const valueWrite = renderXmlDictValueWrite(
    dictType.valueType,
    "pair",
    innerIndent,
  );
  if (!valueWrite) return null;

  const startWrapper = ns
    ? `writer.WriteStartElement("${ns.prefix}", "${xmlName}", "${ns.namespace}")`
    : `writer.WriteStartElement("${xmlName}")`;

  return (
    <>
      {`\n${indent}${startWrapper};`}
      {`\n${indent}foreach (var pair in ${csharpName})`}
      {`\n${indent}{`}
      {`\n${innerIndent}writer.WriteStartElement(pair.Key);`}
      {valueWrite}
      {`\n${innerIndent}writer.WriteEndElement();`}
      {`\n${indent}}`}
      {`\n${indent}writer.WriteEndElement();`}
    </>
  );
}

/**
 * Renders the value write for a dictionary value, handling nested collections.
 */
function renderXmlDictValueWrite(
  valueType: SdkType,
  pairVar: string,
  indent: string,
  depth: number = 0,
): Children | null {
  const unwrapped = unwrapNullableType(valueType);

  // Nested dictionary
  if (unwrapped.kind === "dict") {
    const innerDict = unwrapped as SdkDictionaryType;
    const innerIndent = indent + "    ";
    const innerPairVar = depth === 0 ? "pair0" : `pair${depth}`;
    const innerWrite = renderXmlDictValueWrite(
      innerDict.valueType,
      innerPairVar,
      innerIndent,
      depth + 1,
    );
    if (!innerWrite) return null;

    return (
      <>
        {`\n${indent}foreach (var ${innerPairVar} in ${pairVar}.Value)`}
        {`\n${indent}{`}
        {`\n${innerIndent}writer.WriteStartElement(${innerPairVar}.Key);`}
        {innerWrite}
        {`\n${innerIndent}writer.WriteEndElement();`}
        {`\n${indent}}`}
      </>
    );
  }

  // Array value in dictionary
  if (unwrapped.kind === "array") {
    const arrayType = unwrapped as SdkArrayType;
    const innerItemType = unwrapNullableType(arrayType.valueType);
    const innerIndent = indent + "    ";
    const innerItemXml = getItemXmlInfo(
      { serializationOptions: { xml: {} } } as unknown as SdkModelPropertyType,
      innerItemType,
    );
    const innerWrite = renderXmlItemWrite(
      innerItemType,
      "item",
      innerItemXml.name,
      innerItemXml.ns,
      innerIndent,
    );
    if (!innerWrite) return null;

    return (
      <>
        {`\n${indent}foreach (`}
        <TypeExpression type={innerItemType.__raw!} />
        {` item in ${pairVar}.Value)`}
        {`\n${indent}{`}
        {innerWrite}
        {`\n${indent}}`}
      </>
    );
  }

  // Model value
  if (unwrapped.kind === "model") {
    return (
      <>{`\n${indent}writer.WriteObjectValue(${pairVar}.Value, options);`}</>
    );
  }

  // Scalar value
  const scalarWrite = getXmlScalarWrite(valueType, `${pairVar}.Value`);
  if (scalarWrite) {
    return <>{`\n${indent}${scalarWrite}`}</>;
  }

  return null;
}

/**
 * Renders a property with its optional guard wrapper.
 *
 * If the property needs a guard (optional or read-only), wraps the content
 * in an `if` block with the appropriate condition.
 */
function renderGuardedProperty(
  prop: SdkModelPropertyType,
  csharpName: string,
  renderContent: (indent: string) => Children | null,
  baseIndent: string,
): Children | null {
  if (needsSerializationGuard(prop)) {
    const condition = buildGuardCondition(prop, csharpName);
    const innerIndent = baseIndent + "    ";
    const content = renderContent(innerIndent);
    if (!content) return null;

    return (
      <>
        {`\n${baseIndent}if (${condition})`}
        {`\n${baseIndent}{`}
        {content}
        {`\n${baseIndent}}`}
      </>
    );
  }

  const content = renderContent(baseIndent);
  return content;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Generates the `XmlModelWriteCore` method for a model's XML serialization.
 *
 * This is the core method that writes all model properties as XML using
 * `XmlWriter`. Properties are categorized and written in order:
 * attributes first, then elements, then text content.
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the complete method.
 */
export function XmlModelWriteCore(props: XmlModelWriteCoreProps) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const isDerived = shouldOverride(props.type);

  // Get own properties (exclude inherited ones — those are written by base call)
  const ownProperties = isDerived
    ? props.type.properties.filter(
        (p) => p.kind === "property" && !isInheritedProperty(p, props.type),
      )
    : props.type.properties.filter((p) => p.kind === "property");

  // Categorize properties
  const { attributes, elements, textContent } =
    categorizeXmlProperties(ownProperties);

  // Render property writes
  const propertyWrites: Children[] = [];

  // Attributes first
  for (const prop of attributes) {
    const csharpName = namePolicy.getName(prop.name, "class-property");
    const guarded = renderGuardedProperty(
      prop,
      csharpName,
      (indent) => renderXmlAttribute(prop, csharpName, indent),
      "    ",
    );
    if (guarded) propertyWrites.push(guarded);
  }

  // Then elements
  for (const prop of elements) {
    const csharpName = namePolicy.getName(prop.name, "class-property");
    const guarded = renderGuardedProperty(
      prop,
      csharpName,
      (indent) => renderXmlElement(prop, csharpName, indent),
      "    ",
    );
    if (guarded) propertyWrites.push(guarded);
  }

  // Then text content
  if (textContent) {
    const csharpName = namePolicy.getName(textContent.name, "class-property");
    const scalarWrite = getXmlScalarWrite(textContent.type, csharpName);
    if (scalarWrite) {
      propertyWrites.push(<>{`\n    ${scalarWrite}`}</>);
    }
  }

  return (
    <>
      {`/// <param name="writer"> The XML writer. </param>`}
      {"\n"}
      {`/// <param name="options"> The client options for reading and writing models. </param>`}
      {"\n"}
      {code`protected ${isDerived ? "override" : "virtual"} void XmlModelWriteCore(${SystemXml.XmlWriter} writer, ${SystemClientModelPrimitives.ModelReaderWriterOptions} options)`}
      {"\n{\n"}
      {code`    string format = options.Format == "W" ? ((${SystemClientModelPrimitives.IPersistableModel}<${modelName}>)this).GetFormatFromOptions(options) : options.Format;`}
      {'\n    if (format != "X")'}
      {"\n    {"}
      {"\n"}
      {code`        throw new ${System.FormatException}($"The model {nameof(${modelName})} does not support writing '{format}' format.");`}
      {"\n    }"}
      {"\n"}
      {isDerived && "\n    base.XmlModelWriteCore(writer, options);"}
      {propertyWrites}
      {"\n}"}
    </>
  );
}

/**
 * Checks if a property is inherited from a base model (not defined on this model).
 */
function isInheritedProperty(
  prop: SdkModelPropertyType,
  model: SdkModelType,
): boolean {
  if (!model.baseModel) return false;
  return isPropertyInModel(prop, model.baseModel);
}

/**
 * Recursively checks if a property exists in a model or its base models.
 */
function isPropertyInModel(
  prop: SdkModelPropertyType,
  model: SdkModelType,
): boolean {
  for (const p of model.properties) {
    if (p.name === prop.name) return true;
  }
  if (model.baseModel) {
    return isPropertyInModel(prop, model.baseModel);
  }
  return false;
}
