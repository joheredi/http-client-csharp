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
 *   for response deserialization. (Future task)
 *
 * The legacy emitter generates these in `MrwSerializationTypeDefinition.BuildImplicitToBinaryContent()`
 * and `MrwSerializationTypeDefinition.BuildExplicitCastFromClientResult()`.
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import {
  type SdkModelType,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";
import { SystemClientModel } from "../../builtins/system-client-model.js";

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
