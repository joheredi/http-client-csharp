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
import {
  SystemClientModel,
  SystemClientModelPrimitives,
} from "../../builtins/system-client-model.js";
import { SystemTextJson } from "../../builtins/system-text-json.js";

/**
 * Props for the {@link ImplicitBinaryContentOperator} component.
 */
export interface ImplicitBinaryContentOperatorProps {
  /** The TCGC SDK model type for which to generate the cast operator. */
  type: SdkModelType;
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
  const { type } = props;

  // Only generate for input models — models used as operation parameters.
  // Output-only models (UsageFlags.Output without Input) don't need this
  // operator because they are never serialized into request bodies.
  const isInput = (type.usage & UsageFlags.Input) !== 0;
  if (!isInput) {
    return null;
  }

  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(type.name, "class");
  const paramName = namePolicy.getName(type.name, "parameter");

  return (
    <>
      {code`public static implicit operator ${SystemClientModel.BinaryContent}(${modelName} ${paramName})`}
      {"\n{"}
      {`\n    if (${paramName} == null)`}
      {"\n    {"}
      {"\n        return null;"}
      {"\n    }"}
      {"\n"}
      {code`    return ${SystemClientModel.BinaryContent}.Create(${paramName}, ModelSerializationExtensions.WireOptions);`}
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
 * The method body (JSON-only, non-dynamic models):
 * 1. Extracts the `PipelineResponse` from the `ClientResult` via `GetRawResponse()`.
 * 2. Parses the response content as a `JsonDocument` using `ModelSerializationExtensions.JsonDocumentOptions`.
 * 3. Calls the model's `Deserialize{ModelName}` static method with the root element
 *    and `ModelSerializationExtensions.WireOptions`.
 *
 * @remarks
 * The legacy emitter generates this in `MrwSerializationTypeDefinition.BuildExplicitFromClientResult()`.
 * It is generated for models in `RootOutputModels`. In TCGC terms, `UsageFlags.Output` maps
 * to the legacy `RootOutputModels` concept.
 *
 * `ModelSerializationExtensions.WireOptions` and `ModelSerializationExtensions.JsonDocumentOptions`
 * are generated infrastructure types (task 5.1.5). Until that task is complete, the `using`
 * directive for their namespace will not be auto-generated. This is a known gap.
 *
 * The `response` variable is NOT declared with `using` for JSON-only models (consistent with
 * the legacy emitter). The `document` variable IS declared with `using` because `JsonDocument`
 * is `IDisposable`.
 *
 * Dual-format models (JSON + XML) are handled by task 2.5.3 which adds content-type sniffing.
 *
 * @example Generated output for an output model:
 * ```csharp
 * public static explicit operator Widget(ClientResult result)
 * {
 *     PipelineResponse response = result.GetRawResponse();
 *     using JsonDocument document = JsonDocument.Parse(response.Content, ModelSerializationExtensions.JsonDocumentOptions);
 *     return DeserializeWidget(document.RootElement, ModelSerializationExtensions.WireOptions);
 * }
 * ```
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the operator, or null for non-output models.
 */
export function ExplicitClientResultOperator(
  props: ExplicitClientResultOperatorProps,
) {
  const { type } = props;

  // Only generate for output models — models returned from operations.
  // Input-only models (UsageFlags.Input without Output) don't need this
  // operator because they are never deserialized from responses.
  const isOutput = (type.usage & UsageFlags.Output) !== 0;
  if (!isOutput) {
    return null;
  }

  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(type.name, "class");

  return (
    <>
      {code`public static explicit operator ${modelName}(${SystemClientModel.ClientResult} result)`}
      {"\n{"}
      {"\n    "}
      {code`${SystemClientModelPrimitives.PipelineResponse} response = result.GetRawResponse();`}
      {"\n    "}
      {code`using ${SystemTextJson.JsonDocument} document = ${SystemTextJson.JsonDocument}.Parse(response.Content, ModelSerializationExtensions.JsonDocumentOptions);`}
      {`\n    return ${modelName}.Deserialize${modelName}(document.RootElement, ModelSerializationExtensions.WireOptions);`}
      {"\n}"}
    </>
  );
}
