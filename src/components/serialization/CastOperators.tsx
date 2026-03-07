/**
 * Cast operator components for C# model serialization files.
 *
 * Generates implicit and explicit conversion operators on model serialization
 * classes. These operators enable ergonomic conversion between model instances
 * and HTTP request/response types:
 *
 * - **Implicit BinaryContent operator** (task 2.5.1): Converts input model → BinaryContent
 *   for request body serialization.
 * - **Explicit ClientResult operator** (task 2.5.2): Converts ClientResult → output model
 *   for response deserialization.
 * - **Dual-format operator** (task 2.5.3): Adds Content-Type sniffing for models that
 *   support both JSON and XML serialization formats.
 *
 * The legacy emitter generates these in `MrwSerializationTypeDefinition.BuildImplicitToBinaryContent()`
 * and `MrwSerializationTypeDefinition.BuildExplicitFromClientResult()`.
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import {
  type SdkModelType,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";
import { System } from "../../builtins/system.js";
import { SystemIO } from "../../builtins/system-io.js";
import {
  SystemClientModel,
  SystemClientModelPrimitives,
} from "../../builtins/system-client-model.js";
import { SystemTextJson } from "../../builtins/system-text-json.js";
import { SystemXmlLinq } from "../../builtins/system-xml-linq.js";
import { isDynamicModel } from "../models/DynamicModel.js";
import { collectPropertyCSharpNames } from "../../utils/property.js";
import { getPipelineTypes } from "../../utils/pipeline-types.js";

/**
 * Props for the {@link ImplicitBinaryContentOperator} component.
 */
export interface ImplicitBinaryContentOperatorProps {
  /** The TCGC SDK model type for which to generate the cast operator. */
  type: SdkModelType;
  /** The emitter flavor ("azure" or "unbranded") for selecting pipeline types. */
  flavor?: string;
}

/**
 * Generates a `public static implicit operator BinaryContent(T model)` method
 * on input model serialization classes.
 *
 * This operator enables implicit conversion of model instances to BinaryContent
 * for HTTP request body serialization, making API calls ergonomic:
 * ```csharp
 * // Without operator: explicit conversion needed
 * BinaryContent content = BinaryContent.Create(widget, options);
 * // With operator: implicit conversion
 * client.CreateWidget(widget); // widget auto-converts to BinaryContent
 * ```
 *
 * Only generated for models that have the `UsageFlags.Input` flag set (i.e.,
 * models used as operation parameters). Output-only models do not need this
 * operator since they are never sent as request bodies.
 *
 * The method body:
 * 1. Performs a null check (returns null if model is null).
 * 2. Delegates to `BinaryContent.Create(model, ModelSerializationExtensions.WireOptions)`
 *    which serializes the model using the default wire format.
 *
 * @remarks
 * The legacy emitter generates this in `MrwSerializationTypeDefinition.BuildImplicitToBinaryContent()`.
 * It is generated for models in `RootInputModels` that are not unknown discriminator models.
 * In TCGC terms, `UsageFlags.Input` maps to the legacy `RootInputModels` concept.
 *
 * `ModelSerializationExtensions.WireOptions` is a generated infrastructure type
 * (task 5.1.5). Until that task is complete, the `using` directive for its
 * namespace will not be auto-generated. This is a known gap that will be resolved
 * when the infrastructure files are generated.
 *
 * @example Generated output for an input model:
 * ```csharp
 * public static implicit operator BinaryContent(Widget widget)
 * {
 *     if (widget == null)
 *     {
 *         return null;
 *     }
 *     return BinaryContent.Create(widget, ModelSerializationExtensions.WireOptions);
 * }
 * ```
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the operator, or null for non-input models.
 */
export function ImplicitBinaryContentOperator(
  props: ImplicitBinaryContentOperatorProps,
) {
  const { type, flavor } = props;
  const pipelineTypes = getPipelineTypes(flavor ?? "unbranded");

  // Only generate for input models — models used as operation parameters.
  // Output-only models (UsageFlags.Output without Input) don't need this
  // operator because they are never serialized into request bodies.
  const isInput = (type.usage & UsageFlags.Input) !== 0;
  if (!isInput) {
    return null;
  }

  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(type.name, "class");
  // The name policy automatically escapes C# keywords with `@` prefix.
  // E.g., a model named "As" → paramName "as" → "@as" in C#.
  const paramName = namePolicy.getName(type.name, "parameter");

  return (
    <>
      {`/// <param name="${paramName}"> The <see cref="${modelName}"/> to serialize into <see cref="BinaryContent"/>. </param>`}
      {"\n"}
      {code`public static implicit operator ${pipelineTypes.binaryContent}(${modelName} ${paramName})`}
      {"\n{"}
      {`\n    if (${paramName} == null)`}
      {"\n    {"}
      {"\n        return null;"}
      {"\n    }"}
      {"\n"}
      {code`    return ${pipelineTypes.binaryContent}.Create(${paramName}, ModelSerializationExtensions.WireOptions);`}
      {"\n}"}
    </>
  );
}

/**
 * Props for the {@link ExplicitClientResultOperator} component.
 */
export interface ExplicitClientResultOperatorProps {
  /** The TCGC SDK model type for which to generate the cast operator. */
  type: SdkModelType;
  /** The emitter flavor ("azure" or "unbranded") for selecting pipeline types. */
  flavor?: string;
}

/**
 * Generates a `public static explicit operator T(ClientResult result)` method
 * on output model serialization classes.
 *
 * This operator enables explicit conversion of `ClientResult` responses to
 * typed model instances for response deserialization, making API consumption
 * ergonomic:
 * ```csharp
 * // Without operator: manual deserialization
 * PipelineResponse response = result.GetRawResponse();
 * Widget widget = JsonSerializer.Deserialize<Widget>(response.Content);
 * // With operator: explicit cast
 * Widget widget = (Widget)result;
 * ```
 *
 * Only generated for models that have the `UsageFlags.Output` flag set (i.e.,
 * models returned from operations). Input-only models do not need this operator
 * since they are never deserialized from responses.
 *
 * The operator body varies based on which serialization formats the model supports:
 *
 * - **JSON-only** (default): Parses `response.Content` as `JsonDocument` and calls
 *   `Deserialize{Model}(document.RootElement, WireOptions)`.
 * - **XML-only**: Reads `response.ContentStream` into an `XElement` via
 *   `XElement.Load(stream, LoadOptions.PreserveWhitespace)` and calls
 *   `Deserialize{Model}(element, WireOptions)`.
 * - **Dual-format (JSON + XML)**: Sniffs the `Content-Type` response header. If it
 *   starts with `"application/json"`, uses the JSON path; otherwise falls through
 *   to the XML path.
 *
 * @remarks
 * The legacy emitter generates this in `MrwSerializationTypeDefinition.BuildExplicitFromClientResult()`,
 * dispatching to `BuildJsonAndXmlExplicitFromClientResult()` for dual-format and
 * `BuildXmlExplicitFromClientResult()` for XML-only models.
 *
 * Key differences from JSON-only:
 * - XML-only and dual-format declare `response` with `using` (JSON-only does not).
 * - XML-only and dual-format read from `ContentStream` (not `Content`).
 * - Dual-format checks `response.Headers.TryGetValue("Content-Type", ...)` to
 *   select the deserialization path.
 *
 * `ModelSerializationExtensions.WireOptions` and `ModelSerializationExtensions.JsonDocumentOptions`
 * are generated infrastructure types (task 5.1.5). Until that task is complete, the `using`
 * directive for their namespace will not be auto-generated. This is a known gap.
 *
 * @example Generated output for a JSON-only output model:
 * ```csharp
 * public static explicit operator Widget(ClientResult result)
 * {
 *     PipelineResponse response = result.GetRawResponse();
 *     using JsonDocument document = JsonDocument.Parse(response.Content, ModelSerializationExtensions.JsonDocumentOptions);
 *     return DeserializeWidget(document.RootElement, ModelSerializationExtensions.WireOptions);
 * }
 * ```
 *
 * @example Generated output for an XML-only model:
 * ```csharp
 * public static explicit operator XmlWidget(ClientResult result)
 * {
 *     using PipelineResponse response = result.GetRawResponse();
 *     using Stream stream = response.ContentStream;
 *     if ((stream == null))
 *     {
 *         return default;
 *     }
 *
 *     return XmlWidget.DeserializeXmlWidget(XElement.Load(stream, LoadOptions.PreserveWhitespace), ModelSerializationExtensions.WireOptions);
 * }
 * ```
 *
 * @example Generated output for a dual-format (JSON + XML) model:
 * ```csharp
 * public static explicit operator DualWidget(ClientResult result)
 * {
 *     using PipelineResponse response = result.GetRawResponse();
 *
 *     if ((response.Headers.TryGetValue("Content-Type", out string value) && value.StartsWith("application/json", StringComparison.OrdinalIgnoreCase)))
 *     {
 *         using JsonDocument document = JsonDocument.Parse(response.Content, ModelSerializationExtensions.JsonDocumentOptions);
 *         return DualWidget.DeserializeDualWidget(document.RootElement, ModelSerializationExtensions.WireOptions);
 *     }
 *
 *     using Stream stream = response.ContentStream;
 *     if ((stream == null))
 *     {
 *         return default;
 *     }
 *
 *     return DualWidget.DeserializeDualWidget(XElement.Load(stream, LoadOptions.PreserveWhitespace), ModelSerializationExtensions.WireOptions);
 * }
 * ```
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the operator, or null for non-output models.
 */
export function ExplicitClientResultOperator(
  props: ExplicitClientResultOperatorProps,
) {
  const { type, flavor } = props;
  const pipelineTypes = getPipelineTypes(flavor ?? "unbranded");
  const isAzure = flavor === "azure";

  // Only generate for output models — models returned from operations.
  // Input-only models (UsageFlags.Input without Output) don't need this
  // operator because they are never deserialized from responses.
  const isOutput = (type.usage & UsageFlags.Output) !== 0;
  if (!isOutput) {
    return null;
  }

  const supportsJson = (type.usage & UsageFlags.Json) !== 0;
  const supportsXml = (type.usage & UsageFlags.Xml) !== 0;
  const isDynamic = isDynamicModel(type);

  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(type.name, "class");

  // Detect CS0120 collisions: if the model class name matches any property name
  // visible in this class (including inherited properties), the unqualified name
  // resolves to the instance property in static operator context. Use the
  // namespace-qualified type reference to disambiguate.
  const propertyNames = collectPropertyCSharpNames(type, namePolicy);
  const typeRef = propertyNames.has(modelName)
    ? `${type.namespace}.${modelName}`
    : modelName;

  // Select the appropriate operator body based on the model's serialization formats.
  // The dispatch mirrors the legacy emitter's GetExplicitFromClientResultMethod().
  if (supportsJson && supportsXml) {
    return renderDualFormatOperator(modelName, typeRef, isDynamic, pipelineTypes, isAzure);
  } else if (supportsXml) {
    return renderXmlOnlyOperator(modelName, typeRef, pipelineTypes, isAzure);
  } else {
    return renderJsonOnlyOperator(modelName, typeRef, isDynamic, pipelineTypes, isAzure);
  }
}

/**
 * Renders the explicit operator body for JSON-only models.
 *
 * Extracts `PipelineResponse` from `ClientResult`, parses the response content
 * as a `JsonDocument`, and calls the model's `Deserialize` method with the root element.
 * The `response` variable is NOT declared with `using` (consistent with the legacy emitter).
 *
 * Dynamic models (JsonMergePatch) additionally pass `response.Content` as the
 * `BinaryData data` parameter so that `JsonPatch` can be initialized with the
 * raw binary data for round-trip fidelity.
 */
function renderJsonOnlyOperator(
  modelName: string,
  typeRef: string,
  isDynamic: boolean,
  pipelineTypes?: import("../../utils/pipeline-types.js").PipelineTypes,
  isAzure?: boolean,
) {
  const resultType = pipelineTypes?.clientResult ?? SystemClientModel.ClientResult;
  const responseType = pipelineTypes?.response ?? SystemClientModelPrimitives.PipelineResponse;
  // Dynamic models need the BinaryData data parameter for JsonPatch initialization
  const deserializeArgs = isDynamic
    ? `document.RootElement, response.Content, ModelSerializationExtensions.WireOptions`
    : `document.RootElement, ModelSerializationExtensions.WireOptions`;

  // Azure: result IS the Response — no GetRawResponse() needed
  const responseExpr = isAzure
    ? code`${responseType} response = result;`
    : code`${responseType} response = result.GetRawResponse();`;

  return (
    <>
      {`/// <param name="result"> The <see cref="ClientResult"/> to deserialize the <see cref="${modelName}"/> from. </param>`}
      {"\n"}
      {code`public static explicit operator ${modelName}(${resultType} result)`}
      {"\n{"}
      {"\n    "}
      {responseExpr}
      {"\n    "}
      {code`using ${SystemTextJson.JsonDocument} document = ${SystemTextJson.JsonDocument}.Parse(response.Content, ModelSerializationExtensions.JsonDocumentOptions);`}
      {`\n    return ${typeRef}.Deserialize${modelName}(${deserializeArgs});`}
      {"\n}"}
    </>
  );
}

/**
 * Renders the explicit operator body for XML-only models.
 *
 * Extracts `PipelineResponse` (with `using`) from `ClientResult`, reads the
 * `ContentStream` into a `Stream`, checks for null, and parses via
 * `XElement.Load(stream, LoadOptions.PreserveWhitespace)`.
 *
 * The legacy emitter generates this in `BuildXmlExplicitFromClientResult()`.
 */
function renderXmlOnlyOperator(
  modelName: string,
  typeRef: string,
  pipelineTypes?: import("../../utils/pipeline-types.js").PipelineTypes,
  isAzure?: boolean,
) {
  const resultType = pipelineTypes?.clientResult ?? SystemClientModel.ClientResult;
  const responseType = pipelineTypes?.response ?? SystemClientModelPrimitives.PipelineResponse;

  // Azure: result IS the Response; unbranded: need GetRawResponse()
  // XML operator uses `using` on the response variable
  const responseExpr = isAzure
    ? code`using ${responseType} response = result;`
    : code`using ${responseType} response = result.GetRawResponse();`;

  return (
    <>
      {`/// <param name="result"> The <see cref="ClientResult"/> to deserialize the <see cref="${modelName}"/> from. </param>`}
      {"\n"}
      {code`public static explicit operator ${modelName}(${resultType} result)`}
      {"\n{"}
      {"\n    "}
      {responseExpr}
      {"\n    "}
      {code`using ${SystemIO.Stream} stream = response.ContentStream;`}
      {"\n    if ((stream == null))"}
      {"\n    {"}
      {"\n        return default;"}
      {"\n    }"}
      {"\n"}
      {"\n    "}
      {code`return ${typeRef}.Deserialize${modelName}(${SystemXmlLinq.XElement}.Load(stream, ${SystemXmlLinq.LoadOptions}.PreserveWhitespace), ModelSerializationExtensions.WireOptions);`}
      {"\n}"}
    </>
  );
}

/**
 * Renders the explicit operator body for dual-format (JSON + XML) models.
 *
 * Sniffs the `Content-Type` response header to determine the deserialization path:
 * - If `Content-Type` starts with `"application/json"` (case-insensitive), uses
 *   the JSON deserialization path (`JsonDocument.Parse`).
 * - Otherwise, falls through to the XML deserialization path (`XElement.Load`).
 *
 * The `response` variable IS declared with `using` for dual-format models.
 *
 * Dynamic models (JsonMergePatch) additionally pass `response.Content` as the
 * `BinaryData data` parameter in the JSON path so that `JsonPatch` can be
 * initialized with the raw binary data for round-trip fidelity.
 *
 * The legacy emitter generates this in `BuildJsonAndXmlExplicitFromClientResult()`.
 */
function renderDualFormatOperator(
  modelName: string,
  typeRef: string,
  isDynamic: boolean,
  pipelineTypes?: import("../../utils/pipeline-types.js").PipelineTypes,
  isAzure?: boolean,
) {
  const resultType = pipelineTypes?.clientResult ?? SystemClientModel.ClientResult;
  const responseType = pipelineTypes?.response ?? SystemClientModelPrimitives.PipelineResponse;
  // Dynamic models need the BinaryData data parameter for JsonPatch initialization
  const jsonDeserializeArgs = isDynamic
    ? `document.RootElement, response.Content, ModelSerializationExtensions.WireOptions`
    : `document.RootElement, ModelSerializationExtensions.WireOptions`;

  // Azure: result IS the Response; unbranded: need GetRawResponse()
  const responseExpr = isAzure
    ? code`using ${responseType} response = result;`
    : code`using ${responseType} response = result.GetRawResponse();`;

  return (
    <>
      {`/// <param name="result"> The <see cref="ClientResult"/> to deserialize the <see cref="${modelName}"/> from. </param>`}
      {"\n"}
      {code`public static explicit operator ${modelName}(${resultType} result)`}
      {"\n{"}
      {"\n    "}
      {responseExpr}
      {"\n"}
      {"\n    "}
      {code`if ((response.Headers.TryGetValue("Content-Type", out string value) && value.StartsWith("application/json", ${System.StringComparison}.OrdinalIgnoreCase)))`}
      {"\n    {"}
      {"\n        "}
      {code`using ${SystemTextJson.JsonDocument} document = ${SystemTextJson.JsonDocument}.Parse(response.Content, ModelSerializationExtensions.JsonDocumentOptions);`}
      {`\n        return ${typeRef}.Deserialize${modelName}(${jsonDeserializeArgs});`}
      {"\n    }"}
      {"\n"}
      {"\n    "}
      {code`using ${SystemIO.Stream} stream = response.ContentStream;`}
      {"\n    if ((stream == null))"}
      {"\n    {"}
      {"\n        return default;"}
      {"\n    }"}
      {"\n"}
      {"\n    "}
      {code`return ${typeRef}.Deserialize${modelName}(${SystemXmlLinq.XElement}.Load(stream, ${SystemXmlLinq.LoadOptions}.PreserveWhitespace), ModelSerializationExtensions.WireOptions);`}
      {"\n}"}
    </>
  );
}
