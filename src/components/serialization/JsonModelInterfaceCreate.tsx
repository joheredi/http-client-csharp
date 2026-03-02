/**
 * JsonModelInterfaceCreate component for C# model serialization files.
 *
 * Generates the explicit interface implementation `T IJsonModel<T>.Create(...)` that
 * delegates to the protected virtual `JsonModelCreateCore` method:
 *
 * ```csharp
 * Widget IJsonModel<Widget>.Create(ref Utf8JsonReader reader, ModelReaderWriterOptions options)
 *     => JsonModelCreateCore(ref reader, options);
 * ```
 *
 * This is the counterpart to `JsonModelInterfaceWrite` — while `Write` delegates
 * to `JsonModelWriteCore`, `Create` delegates to `JsonModelCreateCore`.
 *
 * Both root and derived models generate their own explicit interface implementation
 * because `IJsonModel<T>` is parameterized by the model type — e.g., `IJsonModel<Pet>`
 * and `IJsonModel<Dog>` are distinct interfaces, each requiring its own `Create` method.
 *
 * For derived models, a cast is added because `JsonModelCreateCore` returns the root
 * base type (to match the virtual method signature), but the interface expects the
 * derived type:
 *
 * ```csharp
 * Dog IJsonModel<Dog>.Create(ref Utf8JsonReader reader, ModelReaderWriterOptions options)
 *     => (Dog)JsonModelCreateCore(ref reader, options);
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemTextJson } from "../../builtins/system-text-json.js";

/**
 * Props for the {@link JsonModelInterfaceCreate} component.
 */
export interface JsonModelInterfaceCreateProps {
  /** The TCGC SDK model type whose explicit IJsonModel.Create method is being generated. */
  type: SdkModelType;
}

/**
 * Generates the explicit `IJsonModel<T>.Create` interface implementation for
 * a model's serialization partial class.
 *
 * This is an expression-bodied method that delegates to the protected virtual
 * `JsonModelCreateCore` method. For derived models, a cast from the root base
 * type to the current model type is added because `JsonModelCreateCore` returns
 * the root type for polymorphic compatibility.
 *
 * Uses `code` templates with builtin refkeys for `IJsonModel`, `Utf8JsonReader`,
 * and `ModelReaderWriterOptions` to auto-generate the required `using` directives.
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the explicit interface method.
 */
export function JsonModelInterfaceCreate(props: JsonModelInterfaceCreateProps) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const isDerived = props.type.baseModel !== undefined;

  // For derived models, JsonModelCreateCore returns the root base type
  // (to match the virtual method signature). The explicit interface implementation
  // must return T (the current model type), so a cast is needed.
  const createExpression = isDerived
    ? `(${modelName})JsonModelCreateCore(ref reader, options)`
    : "JsonModelCreateCore(ref reader, options)";

  return (
    <>
      {code`${modelName} ${SystemClientModelPrimitives.IJsonModel}<${modelName}>.Create(ref ${SystemTextJson.Utf8JsonReader} reader, ${SystemClientModelPrimitives.ModelReaderWriterOptions} options) => ${createExpression};`}
    </>
  );
}
