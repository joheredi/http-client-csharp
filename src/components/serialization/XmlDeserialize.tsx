/**
 * XmlDeserialize component for C# model XML deserialization.
 *
 * Generates the `DeserializeXxx(XElement element, ModelReaderWriterOptions options)`
 * static method that is the core XML deserialization method for models supporting
 * XML serialization. This method takes an `XElement` and `ModelReaderWriterOptions`
 * and returns a fully populated model instance.
 *
 * The generated method follows the legacy emitter's pattern:
 * 1. **Null check**: Returns null if the element is null.
 * 2. **Namespace declarations**: Declares `XNamespace` variables for any namespaced
 *    attributes or elements.
 * 3. **Variable declarations**: Declares local variables for all constructor parameters
 *    (reuses {@link DeserializeVariableDeclarations}).
 * 4. **Attribute matching loop**: `foreach (var attr in element.Attributes())` to
 *    extract properties marked as XML attributes.
 * 5. **Element matching loop**: `foreach (var child in element.Elements())` to
 *    extract properties serialized as XML elements, including arrays, dictionaries,
 *    and nested models.
 * 6. **Text content**: Assigns `element.Value` for properties marked as text content.
 * 7. **Constructor return**: Returns a new model instance with all deserialized values
 *    (reuses {@link DeserializeReturnStatement}).
 *
 * Unlike JSON deserialization which uses `JsonElement.GetXxx()` methods, XML
 * deserialization uses explicit casts (`(string)child`, `(int)child`) and
 * extension methods (`child.GetDateTimeOffset("O")`, `child.GetBytesFromBase64("D")`).
 *
 * For derived models with discriminators, the method handles all properties
 * (including inherited base properties) in a single flat deserialization, matching
 * the legacy emitter's pattern.
 *
 * @example Generated output for a simple model with an attribute and element:
 * ```csharp
 * internal static Widget DeserializeWidget(XElement element, ModelReaderWriterOptions options)
 * {
 *     if (element == null)
 *     {
 *         return null;
 *     }
 *
 *     string id = default;
 *     string name = default;
 *     IDictionary<string, BinaryData> additionalBinaryDataProperties = new ChangeTrackingDictionary<string, BinaryData>();
 *
 *     foreach (var attr in element.Attributes())
 *     {
 *         string localName = attr.Name.LocalName;
 *         if (localName == "id")
 *         {
 *             id = (string)attr;
 *             continue;
 *         }
 *     }
 *     foreach (var child in element.Elements())
 *     {
 *         string localName = child.Name.LocalName;
 *         if (localName == "name")
 *         {
 *             name = (string)child;
 *             continue;
 *         }
 *     }
 *     return new Widget(id, name, additionalBinaryDataProperties);
 * }
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { code, type Children } from "@alloy-js/core";
import type { NamePolicy } from "@alloy-js/core";
import type {
  SdkArrayType,
  SdkBuiltInType,
  SdkDateTimeType,
  SdkDictionaryType,
  SdkDurationType,
  SdkEnumType,
  SdkModelPropertyType,
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemXmlLinq } from "../../builtins/system-xml-linq.js";
import { unwrapNullableType } from "../../utils/nullable.js";
import { resolvePropertyName } from "../../utils/property.js";
import {
  isBaseDiscriminatorOverride,
  isDerivedDiscriminatedModel,
} from "../models/ModelConstructors.js";
import { DeserializeReturnStatement } from "./DeserializeReturnStatement.js";
import { DeserializeVariableDeclarations } from "./DeserializeVariableDeclarations.js";

/**
 * Props for the {@link XmlDeserialize} component.
 */
export interface XmlDeserializeProps {
  /** The TCGC SDK model type whose XML deserialization method is being generated. */
  type: SdkModelType;
}

// ---------------------------------------------------------------------------
// Type-kind sets for XML cast expressions
// ---------------------------------------------------------------------------

const STRING_CAST_KINDS = new Set(["string", "url"]);
const INT_CAST_KINDS = new Set(["int32", "safeint"]);
const LONG_CAST_KINDS = new Set(["int64"]);
const FLOAT_CAST_KINDS = new Set(["float32"]);
const DOUBLE_CAST_KINDS = new Set([
  "float64",
  "float",
  "numeric",
  "decimal",
  "decimal128",
]);
const BOOL_CAST_KINDS = new Set(["boolean"]);
const SBYTE_CAST_KINDS = new Set(["int8"]);
const SHORT_CAST_KINDS = new Set(["int16"]);
const BYTE_CAST_KINDS = new Set(["uint8"]);
const USHORT_CAST_KINDS = new Set(["uint16"]);
const UINT_CAST_KINDS = new Set(["uint32"]);
const ULONG_CAST_KINDS = new Set(["uint64"]);

/**
 * Maps SDK type kinds to their XElement explicit cast type name.
 * XElement supports explicit conversions like `(string)element`, `(int)element`, etc.
 */
function getXmlCastType(kind: string): string | null {
  if (STRING_CAST_KINDS.has(kind)) return "string";
  if (INT_CAST_KINDS.has(kind)) return "int";
  if (LONG_CAST_KINDS.has(kind)) return "long";
  if (FLOAT_CAST_KINDS.has(kind)) return "float";
  if (DOUBLE_CAST_KINDS.has(kind)) return "double";
  if (BOOL_CAST_KINDS.has(kind)) return "bool";
  if (SBYTE_CAST_KINDS.has(kind)) return null; // sbyte needs (int) then cast
  if (SHORT_CAST_KINDS.has(kind)) return null; // short needs (int) then cast
  if (BYTE_CAST_KINDS.has(kind)) return null; // byte needs (int) then cast
  if (USHORT_CAST_KINDS.has(kind)) return null; // ushort needs (int) then cast
  if (UINT_CAST_KINDS.has(kind)) return null; // uint needs special handling
  if (ULONG_CAST_KINDS.has(kind)) return null; // ulong needs special handling
  return null;
}

// ---------------------------------------------------------------------------
// XML value read helpers
// ---------------------------------------------------------------------------

/**
 * Returns the C# expression to extract a value from an XML element or attribute
 * for the given SDK type.
 *
 * XML deserialization uses explicit casts (`(string)child`, `(int)child`) for
 * simple types and extension methods for DateTime/Duration/Bytes. This is
 * fundamentally different from JSON which uses `GetXxx()` methods.
 *
 * @param type - The SDK type to extract.
 * @param accessor - The C# expression for the XElement/XAttribute (e.g., `"child"` or `"attr"`).
 * @param namePolicy - C# name policy for resolving model/enum names.
 * @returns The C# expression string, or `null` if the type is not supported as a scalar.
 */
function getXmlReadExpression(
  type: SdkType,
  accessor: string,
  namePolicy: NamePolicy<string>,
): string | null {
  let unwrapped = unwrapNullableType(type);

  // Unwrap constant types
  if (unwrapped.kind === "constant") {
    unwrapped = unwrapped.valueType;
  }

  const kind = unwrapped.kind;

  // URL type — construct Uri from string cast
  if (kind === "url") {
    return `new Uri((string)${accessor})`;
  }

  // DateTime types — extension method with format
  if (kind === "utcDateTime" || kind === "offsetDateTime") {
    return getXmlDateTimeReadExpression(unwrapped as SdkDateTimeType, accessor);
  }

  // Duration types — extension method with format
  if (kind === "duration") {
    return getXmlDurationReadExpression(unwrapped as SdkDurationType, accessor);
  }

  // Bytes type — extension method
  if (kind === "bytes") {
    return getXmlBytesReadExpression(unwrapped as SdkBuiltInType, accessor);
  }

  // Plain date/time — extension methods
  if (kind === "plainDate") {
    return `${accessor}.GetDateTimeOffset("D")`;
  }
  if (kind === "plainTime") {
    return `${accessor}.GetTimeSpan("T")`;
  }

  // Enum types — cast to backing type then convert
  if (kind === "enum") {
    return getXmlEnumReadExpression(
      unwrapped as SdkEnumType,
      accessor,
      namePolicy,
    );
  }

  // Model types — call static DeserializeXxx method
  if (kind === "model") {
    const modelType = unwrapped as SdkModelType;
    const modelName = namePolicy.getName(modelType.name, "class");
    return `${modelName}.Deserialize${modelName}(${accessor}, options)`;
  }

  // Narrow int types that XElement doesn't support directly — cast through int
  if (SBYTE_CAST_KINDS.has(kind)) return `(sbyte)(int)${accessor}`;
  if (SHORT_CAST_KINDS.has(kind)) return `(short)(int)${accessor}`;
  if (BYTE_CAST_KINDS.has(kind)) return `(byte)(int)${accessor}`;
  if (USHORT_CAST_KINDS.has(kind)) return `(ushort)(int)${accessor}`;
  if (UINT_CAST_KINDS.has(kind)) return `(uint)${accessor}`;
  if (ULONG_CAST_KINDS.has(kind)) return `(ulong)${accessor}`;

  // Simple types with direct XElement casts
  const castType = getXmlCastType(kind);
  if (castType) {
    return `(${castType})${accessor}`;
  }

  // Unknown/any — use element.Value (string)
  if (kind === "unknown") {
    return `BinaryData.FromString(${accessor}.Value)`;
  }

  return null;
}

/**
 * Returns the C# read expression for a DateTime from XML.
 *
 * Uses the `GetDateTimeOffset(format)` extension method defined in
 * `ModelSerializationExtensions`.
 */
function getXmlDateTimeReadExpression(
  type: SdkDateTimeType,
  accessor: string,
): string {
  if (type.encode === "unixTimestamp") {
    return `DateTimeOffset.FromUnixTimeSeconds((long)${accessor})`;
  }
  const format = type.encode === "rfc7231" ? "R" : "O";
  return `${accessor}.GetDateTimeOffset("${format}")`;
}

/**
 * Returns the C# read expression for a Duration from XML.
 *
 * Uses the `GetTimeSpan(format)` extension method defined in
 * `ModelSerializationExtensions`.
 */
function getXmlDurationReadExpression(
  type: SdkDurationType,
  accessor: string,
): string {
  if (type.encode === "seconds") {
    const getter = type.wireType.kind === "int32" ? "(int)" : "(double)";
    return `TimeSpan.FromSeconds(${getter}${accessor})`;
  }
  if (type.encode === "milliseconds") {
    const getter = type.wireType.kind === "int32" ? "(int)" : "(double)";
    return `TimeSpan.FromMilliseconds(${getter}${accessor})`;
  }
  // ISO8601 default
  return `${accessor}.GetTimeSpan("P")`;
}

/**
 * Returns the C# read expression for bytes from XML.
 *
 * Uses the `GetBytesFromBase64(format)` extension method defined in
 * `ModelSerializationExtensions`.
 */
function getXmlBytesReadExpression(
  type: SdkBuiltInType,
  accessor: string,
): string {
  if (type.encode === "base64") {
    return `BinaryData.FromBytes(${accessor}.GetBytesFromBase64("D"))`;
  }
  if (type.encode === "base64url") {
    return `BinaryData.FromBytes(${accessor}.GetBytesFromBase64("U"))`;
  }
  return `BinaryData.FromString(${accessor}.Value)`;
}

/**
 * Returns the C# read expression for an enum from XML.
 *
 * Fixed enums: cast to backing type then call extension method.
 * Extensible enums: cast to backing type then construct new instance.
 */
function getXmlEnumReadExpression(
  enumType: SdkEnumType,
  accessor: string,
  namePolicy: NamePolicy<string>,
): string | null {
  const valueTypeKind = enumType.valueType.kind;
  const castType = getXmlCastType(valueTypeKind);
  if (!castType) return null;

  const castExpr = `(${castType})${accessor}`;
  const enumName = namePolicy.getName(enumType.name, "enum");

  if (enumType.isFixed) {
    // Fixed enums: ((type)accessor).To{EnumName}()
    return `(${castExpr}).To${enumName}()`;
  }

  // Extensible enums: new {EnumName}((type)accessor)
  return `new ${enumName}(${castExpr})`;
}

// ---------------------------------------------------------------------------
// XML property categorization (reused from XmlModelWriteCore pattern)
// ---------------------------------------------------------------------------

interface CategorizedXmlProperties {
  attributes: SdkModelPropertyType[];
  elements: SdkModelPropertyType[];
  textContent: SdkModelPropertyType | null;
}

/**
 * Categorizes model properties into XML attributes, elements, and text content.
 * Reuses the same classification logic as XmlModelWriteCore but for the
 * deserialization path.
 */
function categorizeXmlProperties(
  properties: SdkModelPropertyType[],
): CategorizedXmlProperties {
  const attributes: SdkModelPropertyType[] = [];
  const elements: SdkModelPropertyType[] = [];
  let textContent: SdkModelPropertyType | null = null;

  for (const prop of properties) {
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
 * Determines if a property is text content (unwrapped scalar without element
 * wrapping). Text content is read from `element.Value`.
 */
function isTextContent(prop: SdkModelPropertyType): boolean {
  const xmlInfo = prop.serializationOptions.xml;
  if (!xmlInfo) return false;
  if (!xmlInfo.unwrapped) return false;
  if (xmlInfo.attribute) return false;
  const unwrapped = unwrapNullableType(prop.type);
  return (
    unwrapped.kind !== "array" &&
    unwrapped.kind !== "dict" &&
    unwrapped.kind !== "model"
  );
}

// ---------------------------------------------------------------------------
// Namespace collection
// ---------------------------------------------------------------------------

interface XmlNamespaceInfo {
  prefix: string;
  namespace: string;
  varName: string;
}

/**
 * Collects all unique XML namespaces used by the model's properties.
 * Returns namespace declarations that should appear at the top of the method.
 */
function collectNamespaces(
  properties: SdkModelPropertyType[],
): Map<string, XmlNamespaceInfo> {
  const namespaces = new Map<string, XmlNamespaceInfo>();
  let counter = 0;

  for (const prop of properties) {
    if (prop.kind !== "property") continue;
    const xmlInfo = prop.serializationOptions.xml;
    if (!xmlInfo) continue;

    // Property namespace
    if (xmlInfo.ns && !namespaces.has(xmlInfo.ns.namespace)) {
      const varName = `${xmlInfo.ns.prefix}Ns`;
      namespaces.set(xmlInfo.ns.namespace, {
        prefix: xmlInfo.ns.prefix,
        namespace: xmlInfo.ns.namespace,
        varName: counter === 0 ? varName : `${varName}${counter}`,
      });
      counter++;
    }

    // Items namespace (for wrapped arrays)
    if (xmlInfo.itemsNs && !namespaces.has(xmlInfo.itemsNs.namespace)) {
      const varName = `${xmlInfo.itemsNs.prefix}Ns`;
      namespaces.set(xmlInfo.itemsNs.namespace, {
        prefix: xmlInfo.itemsNs.prefix,
        namespace: xmlInfo.itemsNs.namespace,
        varName: counter === 0 ? varName : `${varName}${counter}`,
      });
      counter++;
    }
  }

  return namespaces;
}

// ---------------------------------------------------------------------------
// Property matching loop rendering
// ---------------------------------------------------------------------------

/**
 * Computes the flat list of all properties that need to be deserialized from XML.
 * For derived models, includes base model properties + own properties.
 */
function computeAllXmlProperties(model: SdkModelType): SdkModelPropertyType[] {
  if (model.baseModel) {
    const baseProps = computeAllXmlProperties(model.baseModel);
    const ownProps = model.properties.filter(
      (p) => !isBaseDiscriminatorOverride(p),
    );
    return [...baseProps, ...ownProps];
  }

  return [...model.properties];
}

/**
 * Renders a single attribute matching block inside the attribute foreach loop.
 */
function renderAttributeMatch(
  prop: SdkModelPropertyType,
  namePolicy: NamePolicy<string>,
  namespaces: Map<string, XmlNamespaceInfo>,
  indent: string,
  modelName: string,
): Children | null {
  const xmlInfo = prop.serializationOptions.xml!;
  const xmlName = xmlInfo.name;
  const varName = namePolicy.getName(
    resolvePropertyName(prop.name, modelName),
    "parameter",
  );
  const readExpr = getXmlReadExpression(prop.type, "attr", namePolicy);
  if (!readExpr) return null;

  const ns = xmlInfo.ns;
  const nsInfo = ns ? namespaces.get(ns.namespace) : undefined;

  // Namespace-qualified attribute: check both localName and namespace
  if (nsInfo) {
    return (
      <>
        {`\n${indent}if (localName == "${xmlName}" && ns == ${nsInfo.varName})`}
        {`\n${indent}{`}
        {`\n${indent}    ${varName} = ${readExpr};`}
        {`\n${indent}    continue;`}
        {`\n${indent}}`}
      </>
    );
  }

  // Simple attribute
  return (
    <>
      {`\n${indent}if (localName == "${xmlName}")`}
      {`\n${indent}{`}
      {`\n${indent}    ${varName} = ${readExpr};`}
      {`\n${indent}    continue;`}
      {`\n${indent}}`}
    </>
  );
}

/**
 * Renders a single element matching block inside the element foreach loop.
 * Handles scalar, model, array, and dictionary element types.
 */
function renderElementMatch(
  prop: SdkModelPropertyType,
  namePolicy: NamePolicy<string>,
  namespaces: Map<string, XmlNamespaceInfo>,
  indent: string,
  modelName: string,
): Children | null {
  const xmlInfo = prop.serializationOptions.xml!;
  const xmlName = xmlInfo.name;
  const varName = namePolicy.getName(
    resolvePropertyName(prop.name, modelName),
    "parameter",
  );
  const unwrapped = unwrapNullableType(prop.type);

  const ns = xmlInfo.ns;
  const nsInfo = ns ? namespaces.get(ns.namespace) : undefined;

  // Build the condition check
  const condition = nsInfo
    ? `localName == "${xmlName}" && ns == ${nsInfo.varName}`
    : `localName == "${xmlName}"`;

  // Array types
  if (unwrapped.kind === "array") {
    return renderXmlArrayDeserialize(
      prop,
      unwrapped as SdkArrayType,
      varName,
      condition,
      namePolicy,
      namespaces,
      indent,
    );
  }

  // Dictionary types
  if (unwrapped.kind === "dict") {
    return renderXmlDictionaryDeserialize(
      prop,
      unwrapped as SdkDictionaryType,
      varName,
      condition,
      namePolicy,
      indent,
    );
  }

  // Scalar and model types
  const readExpr = getXmlReadExpression(prop.type, "child", namePolicy);
  if (!readExpr) return null;

  return (
    <>
      {`\n${indent}if (${condition})`}
      {`\n${indent}{`}
      {`\n${indent}    ${varName} = ${readExpr};`}
      {`\n${indent}    continue;`}
      {`\n${indent}}`}
    </>
  );
}

// ---------------------------------------------------------------------------
// Array deserialization for XML
// ---------------------------------------------------------------------------

/**
 * Returns the XML item element name for array items, following the same logic
 * as the write path.
 */
function getItemXmlName(
  prop: SdkModelPropertyType,
  itemType: SdkType,
  namePolicy: NamePolicy<string>,
): { name: string; ns?: { prefix: string; namespace: string } } {
  const xmlInfo = prop.serializationOptions.xml!;

  if (xmlInfo.itemsName) {
    return { name: xmlInfo.itemsName, ns: xmlInfo.itemsNs };
  }

  if (itemType.kind === "model") {
    const itemXml = itemType.serializationOptions?.xml;
    if (itemXml?.name) {
      return { name: itemXml.name, ns: itemXml.ns };
    }
    return { name: namePolicy.getName(itemType.name, "class") };
  }

  // For primitive items, use C# type name
  return { name: getPrimitiveXmlName(itemType) };
}

/**
 * Gets a default XML element name for a primitive type.
 * Mirrors XmlModelWriteCore's getPrimitiveXmlName.
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
  return "string";
}

/**
 * Renders XML array deserialization for a property.
 *
 * Handles wrapped and unwrapped arrays:
 * - **Unwrapped**: Each child element is a direct item, requires lazy init:
 *   ```csharp
 *   if (items == null) { items = new List<T>(); }
 *   items.Add((string)child);
 *   ```
 * - **Wrapped**: Items inside a container element:
 *   ```csharp
 *   List<T> array = new List<T>();
 *   foreach (var e in child.Elements("ItemName")) { array.Add(...); }
 *   items = array;
 *   ```
 */
function renderXmlArrayDeserialize(
  prop: SdkModelPropertyType,
  arrayType: SdkArrayType,
  varName: string,
  condition: string,
  namePolicy: NamePolicy<string>,
  namespaces: Map<string, XmlNamespaceInfo>,
  indent: string,
): Children | null {
  const xmlInfo = prop.serializationOptions.xml!;
  const isUnwrapped = xmlInfo.unwrapped === true;
  const itemType = arrayType.valueType;
  const unwrappedItemType = unwrapNullableType(itemType);
  const innerIndent = indent + "    ";

  if (isUnwrapped) {
    // Unwrapped: each matching child is an item — lazy init the list
    const itemReadExpr = getXmlReadExpression(itemType, "child", namePolicy);
    if (!itemReadExpr) return null;

    return (
      <>
        {`\n${indent}if (${condition})`}
        {`\n${indent}{`}
        {`\n${innerIndent}if (${varName} == null)`}
        {`\n${innerIndent}{`}
        {`\n${innerIndent}    ${varName} = new List<`}
        <TypeExpression type={unwrappedItemType.__raw!} />
        {`>();`}
        {`\n${innerIndent}}`}
        {`\n${innerIndent}${varName}.Add(${itemReadExpr});`}
        {`\n${innerIndent}continue;`}
        {`\n${indent}}`}
      </>
    );
  }

  // Wrapped: items inside the child element
  const itemInfo = getItemXmlName(prop, unwrappedItemType, namePolicy);
  const itemNsInfo = itemInfo.ns
    ? namespaces.get(itemInfo.ns.namespace)
    : undefined;

  // Build the Elements() selector
  let elementsSelector: string;
  if (itemNsInfo) {
    elementsSelector = `child.Elements(${itemNsInfo.varName} + "${itemInfo.name}")`;
  } else {
    elementsSelector = `child.Elements("${itemInfo.name}")`;
  }

  // Determine how to deserialize each item
  if (unwrappedItemType.kind === "array") {
    // Array of arrays — nested foreach
    const innerArrayType = unwrappedItemType as SdkArrayType;
    const innerItemType = unwrapNullableType(innerArrayType.valueType);
    const innerItemInfo = getItemXmlName(
      { serializationOptions: { xml: {} } } as unknown as SdkModelPropertyType,
      innerItemType,
      namePolicy,
    );

    return (
      <>
        {`\n${indent}if (${condition})`}
        {`\n${indent}{`}
        {`\n${innerIndent}List<`}
        <TypeExpression type={unwrappedItemType.__raw!} />
        {`> array = new List<`}
        <TypeExpression type={unwrappedItemType.__raw!} />
        {`>();`}
        {`\n${innerIndent}foreach (var e in ${elementsSelector})`}
        {`\n${innerIndent}{`}
        {renderNestedArrayDeserialize(
          innerArrayType,
          innerItemInfo,
          namePolicy,
          namespaces,
          innerIndent + "    ",
        )}
        {`\n${innerIndent}}`}
        {`\n${innerIndent}${varName} = array;`}
        {`\n${innerIndent}continue;`}
        {`\n${indent}}`}
      </>
    );
  }

  if (unwrappedItemType.kind === "dict") {
    // Array of dictionaries
    const dictType = unwrappedItemType as SdkDictionaryType;
    const innerIndent2 = innerIndent + "    ";

    return (
      <>
        {`\n${indent}if (${condition})`}
        {`\n${indent}{`}
        {`\n${innerIndent}List<`}
        <TypeExpression type={unwrappedItemType.__raw!} />
        {`> array = new List<`}
        <TypeExpression type={unwrappedItemType.__raw!} />
        {`>();`}
        {`\n${innerIndent}foreach (var e in ${elementsSelector})`}
        {`\n${innerIndent}{`}
        {renderInlineDictDeserialize(dictType, namePolicy, innerIndent2)}
        {`\n${innerIndent2}array.Add(dictionary);`}
        {`\n${innerIndent}}`}
        {`\n${innerIndent}${varName} = array;`}
        {`\n${innerIndent}continue;`}
        {`\n${indent}}`}
      </>
    );
  }

  // Simple wrapped array
  const itemReadExpr = getXmlReadExpression(itemType, "e", namePolicy);
  if (!itemReadExpr) return null;

  return (
    <>
      {`\n${indent}if (${condition})`}
      {`\n${indent}{`}
      {`\n${innerIndent}List<`}
      <TypeExpression type={unwrappedItemType.__raw!} />
      {`> array = new List<`}
      <TypeExpression type={unwrappedItemType.__raw!} />
      {`>();`}
      {`\n${innerIndent}foreach (var e in ${elementsSelector})`}
      {`\n${innerIndent}{`}
      {`\n${innerIndent}    array.Add(${itemReadExpr});`}
      {`\n${innerIndent}}`}
      {`\n${innerIndent}${varName} = array;`}
      {`\n${innerIndent}continue;`}
      {`\n${indent}}`}
    </>
  );
}

/**
 * Renders nested array deserialization for array-of-arrays patterns.
 */
function renderNestedArrayDeserialize(
  arrayType: SdkArrayType,
  itemInfo: { name: string; ns?: { prefix: string; namespace: string } },
  namePolicy: NamePolicy<string>,
  namespaces: Map<string, XmlNamespaceInfo>,
  indent: string,
): Children | null {
  const innerItemType = unwrapNullableType(arrayType.valueType);
  const innerItemRead = getXmlReadExpression(
    arrayType.valueType,
    "item",
    namePolicy,
  );

  // Build inner Elements selector
  const nsInfo = itemInfo.ns
    ? namespaces.get(itemInfo.ns.namespace)
    : undefined;
  const innerSelector = nsInfo
    ? `e.Elements(${nsInfo.varName} + "${itemInfo.name}")`
    : `e.Elements("${itemInfo.name}")`;

  return (
    <>
      {`\n${indent}List<`}
      <TypeExpression type={innerItemType.__raw!} />
      {`> array0 = new List<`}
      <TypeExpression type={innerItemType.__raw!} />
      {`>();`}
      {`\n${indent}foreach (var item in ${innerSelector})`}
      {`\n${indent}{`}
      {innerItemRead ? `\n${indent}    array0.Add(${innerItemRead});` : ""}
      {`\n${indent}}`}
      {`\n${indent}array.Add(array0);`}
    </>
  );
}

// ---------------------------------------------------------------------------
// Dictionary deserialization for XML
// ---------------------------------------------------------------------------

/**
 * Renders XML dictionary deserialization for a property.
 *
 * Each child element of the wrapper becomes a key-value pair where the
 * element's local name is the key and the content is the value.
 */
function renderXmlDictionaryDeserialize(
  prop: SdkModelPropertyType,
  dictType: SdkDictionaryType,
  varName: string,
  condition: string,
  namePolicy: NamePolicy<string>,
  indent: string,
): Children | null {
  const innerIndent = indent + "    ";

  return (
    <>
      {`\n${indent}if (${condition})`}
      {`\n${indent}{`}
      {renderInlineDictDeserialize(dictType, namePolicy, innerIndent)}
      {`\n${innerIndent}${varName} = dictionary;`}
      {`\n${innerIndent}continue;`}
      {`\n${indent}}`}
    </>
  );
}

/**
 * Renders inline dictionary deserialization code (dict declaration + foreach).
 * Used by both standalone dictionary properties and arrays-of-dictionaries.
 */
function renderInlineDictDeserialize(
  dictType: SdkDictionaryType,
  namePolicy: NamePolicy<string>,
  indent: string,
): Children | null {
  const valueType = dictType.valueType;
  const unwrappedValueType = unwrapNullableType(valueType);
  const innerIndent = indent + "    ";

  // Nested dictionary
  if (unwrappedValueType.kind === "dict") {
    const innerDictType = unwrappedValueType as SdkDictionaryType;

    return (
      <>
        {`\n${indent}Dictionary<string, `}
        <TypeExpression type={unwrappedValueType.__raw!} />
        {`> dictionary = new Dictionary<string, `}
        <TypeExpression type={unwrappedValueType.__raw!} />
        {`>();`}
        {`\n${indent}foreach (var e in child.Elements())`}
        {`\n${indent}{`}
        {renderInnerDictDeserialize(innerDictType, namePolicy, innerIndent)}
        {`\n${innerIndent}dictionary.Add(e.Name.LocalName, dict);`}
        {`\n${indent}}`}
      </>
    );
  }

  // Array value in dictionary
  if (unwrappedValueType.kind === "array") {
    const innerArrayType = unwrappedValueType as SdkArrayType;
    const innerItemType = unwrapNullableType(innerArrayType.valueType);
    const innerItemRead = getXmlReadExpression(
      innerArrayType.valueType,
      "item",
      namePolicy,
    );

    // Get item element info
    const itemInfo = getItemXmlName(
      { serializationOptions: { xml: {} } } as unknown as SdkModelPropertyType,
      innerItemType,
      namePolicy,
    );

    return (
      <>
        {`\n${indent}Dictionary<string, `}
        <TypeExpression type={unwrappedValueType.__raw!} />
        {`> dictionary = new Dictionary<string, `}
        <TypeExpression type={unwrappedValueType.__raw!} />
        {`>();`}
        {`\n${indent}foreach (var e in child.Elements())`}
        {`\n${indent}{`}
        {`\n${innerIndent}List<`}
        <TypeExpression type={innerItemType.__raw!} />
        {`> array = new List<`}
        <TypeExpression type={innerItemType.__raw!} />
        {`>();`}
        {`\n${innerIndent}foreach (var item in e.Elements("${itemInfo.name}"))`}
        {`\n${innerIndent}{`}
        {innerItemRead
          ? `\n${innerIndent}    array.Add(${innerItemRead});`
          : ""}
        {`\n${innerIndent}}`}
        {`\n${innerIndent}dictionary.Add(e.Name.LocalName, array);`}
        {`\n${indent}}`}
      </>
    );
  }

  // Simple value dictionary
  const valueReadExpr = getXmlReadExpression(valueType, "e", namePolicy);
  if (!valueReadExpr) return null;

  return (
    <>
      {`\n${indent}Dictionary<string, `}
      <TypeExpression type={unwrappedValueType.__raw!} />
      {`> dictionary = new Dictionary<string, `}
      <TypeExpression type={unwrappedValueType.__raw!} />
      {`>();`}
      {`\n${indent}foreach (var e in child.Elements())`}
      {`\n${indent}{`}
      {`\n${innerIndent}dictionary.Add(e.Name.LocalName, ${valueReadExpr});`}
      {`\n${indent}}`}
    </>
  );
}

/**
 * Renders inner dictionary deserialization for nested dictionary patterns
 * (Dictionary<string, Dictionary<string, T>>).
 */
function renderInnerDictDeserialize(
  dictType: SdkDictionaryType,
  namePolicy: NamePolicy<string>,
  indent: string,
): Children | null {
  const valueType = dictType.valueType;
  const unwrappedValueType = unwrapNullableType(valueType);
  const innerIndent = indent + "    ";

  const valueReadExpr = getXmlReadExpression(valueType, "item", namePolicy);
  if (!valueReadExpr) return null;

  return (
    <>
      {`\n${indent}Dictionary<string, `}
      <TypeExpression type={unwrappedValueType.__raw!} />
      {`> dict = new Dictionary<string, `}
      <TypeExpression type={unwrappedValueType.__raw!} />
      {`>();`}
      {`\n${indent}foreach (var item in e.Elements())`}
      {`\n${indent}{`}
      {`\n${innerIndent}dict.Add(item.Name.LocalName, ${valueReadExpr});`}
      {`\n${indent}}`}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Generates the `DeserializeXxx` static deserialization method for XML models.
 *
 * This is the core XML deserialization entry point called by
 * `PersistableModelCreateCore` (case "X") and the `ExplicitClientResultOperator`
 * (XML response path). It produces an `internal static` method that takes an
 * `XElement` and `ModelReaderWriterOptions`, returning a populated model instance.
 *
 * The method name follows the legacy emitter's convention:
 * `Deserialize{PascalCaseModelName}`.
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the deserialization method.
 */
export function XmlDeserialize(props: XmlDeserializeProps) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const allProperties = computeAllXmlProperties(props.type);

  // Categorize properties for the two separate loops
  const { attributes, elements, textContent } =
    categorizeXmlProperties(allProperties);

  // Collect namespaces from all properties
  const namespaces = collectNamespaces(allProperties);

  // Check if we need attribute or element loops
  const hasAttributes = attributes.length > 0;
  const hasElements = elements.length > 0;

  // Check if any attribute has a namespace (need ns variable in attributes loop)
  const hasNamespacedAttrs = attributes.some(
    (p) => p.serializationOptions.xml?.ns,
  );
  // Check if any element has a namespace
  const hasNamespacedElems = elements.some(
    (p) => p.serializationOptions.xml?.ns,
  );

  // Build content arrays imperatively to avoid Babel JSX transform issues
  const nsDecls: string[] = [];
  if (namespaces.size > 0) {
    nsDecls.push("\n");
    for (const ns of namespaces.values()) {
      nsDecls.push(`\n    XNamespace ${ns.varName} = "${ns.namespace}";`);
    }
  }

  const attrMatches: Children[] = [];
  for (const p of attributes) {
    const match = renderAttributeMatch(
      p,
      namePolicy,
      namespaces,
      "        ",
      props.type.name,
    );
    if (match) attrMatches.push(match);
  }

  const elemMatches: Children[] = [];
  for (const p of elements) {
    const match = renderElementMatch(
      p,
      namePolicy,
      namespaces,
      "        ",
      props.type.name,
    );
    if (match) elemMatches.push(match);
  }

  return (
    <>
      {`/// <param name="element"> The xml element to deserialize. </param>`}
      {"\n"}
      {`/// <param name="options"> The client options for reading and writing models. </param>`}
      {"\n"}
      {code`internal static ${modelName} Deserialize${modelName}(${SystemXmlLinq.XElement} element, ${SystemClientModelPrimitives.ModelReaderWriterOptions} options)`}
      {"\n{"}
      {"\n    if (element == null)"}
      {"\n    {"}
      {"\n        return null;"}
      {"\n    }"}
      {nsDecls}
      <DeserializeVariableDeclarations type={props.type} />
      {"\n"}
      {hasAttributes ? "\n    foreach (var attr in element.Attributes())" : ""}
      {hasAttributes ? "\n    {" : ""}
      {hasAttributes ? "\n        string localName = attr.Name.LocalName;" : ""}
      {hasAttributes && hasNamespacedAttrs
        ? "\n        XNamespace ns = attr.Name.Namespace;"
        : ""}
      {attrMatches}
      {hasAttributes ? "\n    }" : ""}
      {hasElements ? "\n    foreach (var child in element.Elements())" : ""}
      {hasElements ? "\n    {" : ""}
      {hasElements ? "\n        string localName = child.Name.LocalName;" : ""}
      {hasElements && hasNamespacedElems
        ? "\n        XNamespace ns = child.Name.Namespace;"
        : ""}
      {elemMatches}
      {hasElements ? "\n    }" : ""}
      {textContent
        ? `\n    ${namePolicy.getName(resolvePropertyName(textContent.name, props.type.name), "parameter")} = element.Value;`
        : ""}
      <DeserializeReturnStatement type={props.type} />
      {"\n}"}
    </>
  );
}
