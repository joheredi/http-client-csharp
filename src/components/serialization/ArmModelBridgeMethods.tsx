/**
 * ARM model bridge methods for serialization/deserialization between
 * Azure.Response/RequestContent and model types.
 *
 * Generates two methods on ARM model serialization classes:
 *
 * - **FromResponse**: `internal static T FromResponse(Response response)` —
 *   Deserializes a model from an `Azure.Response` by parsing its JSON content.
 *   Used by ARM resource/collection classes to convert pipeline responses to models.
 *
 * - **ToRequestContent**: `internal virtual RequestContent ToRequestContent()` —
 *   Serializes a model to `RequestContent` (Utf8JsonRequestContent) for HTTP requests.
 *   Used by ARM resource/collection classes to send models in request bodies.
 *
 * These methods bridge the Azure SDK's `Azure.Response`/`RequestContent` types
 * with the model's `IJsonModel<T>` serialization, matching the legacy Azure SDK
 * pattern from `MrwSerializationTypeDefinition`.
 *
 * Only generated for management-plane (ARM) models.
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import {
  type SdkModelType,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";
import { Azure, AzureCore } from "../../builtins/azure.js";
import { efCsharpRefkey } from "../../utils/refkey.js";

/**
 * Props for the ARM bridge method components.
 */
export interface ArmBridgeMethodProps {
  /** The TCGC SDK model type for which to generate bridge methods. */
  type: SdkModelType;
}

/**
 * Generates `internal static T FromResponse(Response response)` method.
 *
 * Parses the response body as JSON and delegates to the model's Deserialize
 * method. Only generated for models with output usage (i.e., models that
 * appear in operation responses).
 *
 * @example Generated output:
 * ```csharp
 * internal static TopLevelTrackedResource FromResponse(Response response)
 * {
 *     using var document = JsonDocument.Parse(response.Content);
 *     return DeserializeTopLevelTrackedResource(document.RootElement, ModelSerializationExtensions.WireOptions);
 * }
 * ```
 */
export function ArmFromResponse(props: ArmBridgeMethodProps) {
  const isOutput = (props.type.usage & UsageFlags.Output) !== 0;
  if (!isOutput) return undefined;

  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const modelRef = efCsharpRefkey(props.type.__raw!);

  return code`
internal static ${modelRef} FromResponse(${Azure.Response} response)
{
    using var document = System.Text.Json.JsonDocument.Parse(response.Content);
    return Deserialize${modelName}(document.RootElement, ModelSerializationExtensions.WireOptions);
}`;
}

/**
 * Generates `internal virtual RequestContent ToRequestContent()` method.
 *
 * Serializes the model to JSON using Utf8JsonRequestContent and WriteObjectValue.
 * Only generated for models with input usage (i.e., models used as operation parameters).
 *
 * @example Generated output:
 * ```csharp
 * internal virtual RequestContent ToRequestContent()
 * {
 *     var content = new Utf8JsonRequestContent();
 *     content.JsonWriter.WriteObjectValue(this);
 *     return content;
 * }
 * ```
 */
export function ArmToRequestContent(props: ArmBridgeMethodProps) {
  const isInput = (props.type.usage & UsageFlags.Input) !== 0;
  if (!isInput) return undefined;

  return code`
internal virtual ${AzureCore.RequestContent} ToRequestContent()
{
    var content = new Utf8JsonRequestContent();
    content.JsonWriter.WriteObjectValue(this);
    return content;
}`;
}
