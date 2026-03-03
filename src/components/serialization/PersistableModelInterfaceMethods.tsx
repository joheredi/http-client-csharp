/**
 * PersistableModelInterfaceMethods component for C# model serialization files.
 *
 * Generates the explicit interface implementations for `IPersistableModel<T>`:
 *
 * 1. **Write** — Delegates to the virtual `PersistableModelWriteCore` method:
 *    `BinaryData IPersistableModel<T>.Write(ModelReaderWriterOptions options) => PersistableModelWriteCore(options);`
 *
 * 2. **Create** — Delegates to the virtual `PersistableModelCreateCore` method:
 *    `T IPersistableModel<T>.Create(BinaryData data, ModelReaderWriterOptions options) => PersistableModelCreateCore(data, options);`
 *    For derived models, a cast is added because `PersistableModelCreateCore` returns the root base type.
 *
 * 3. **GetFormatFromOptions** — Returns the wire format string for the model:
 *    `string IPersistableModel<T>.GetFormatFromOptions(ModelReaderWriterOptions options) => "J";`
 *
 * These are one-liner expression-bodied methods that satisfy the `IPersistableModel<T>` interface
 * contract by delegating to the protected virtual/override core methods. The explicit interface
 * qualification (e.g., `IPersistableModel<T>.Write`) ensures these methods are only callable
 * through the interface, not directly on the model instance.
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
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";

/**
 * Props for the {@link PersistableModelInterfaceMethods} component.
 */
export interface PersistableModelInterfaceMethodsProps {
  /** The TCGC SDK model type whose explicit interface methods are being generated. */
  type: SdkModelType;
}

/**
 * Generates the explicit `IPersistableModel<T>` interface implementations for
 * a model's serialization partial class.
 *
 * These methods delegate to the corresponding protected virtual/override core
 * methods (`PersistableModelWriteCore`, `PersistableModelCreateCore`). For
 * derived models, the `Create` method includes a cast from the root base type
 * to the current model type, since `PersistableModelCreateCore` returns the
 * root type for polymorphic compatibility.
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the three explicit interface methods.
 */
export function PersistableModelInterfaceMethods(
  props: PersistableModelInterfaceMethodsProps,
) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const isDerived = props.type.baseModel !== undefined;

  // For derived models, PersistableModelCreateCore returns the root base type
  // (to match the virtual method signature). The explicit interface implementation
  // must return T (the current model type), so a cast is needed.
  const createExpression = isDerived
    ? `(${modelName})PersistableModelCreateCore(data, options)`
    : "PersistableModelCreateCore(data, options)";

  // XML-only models return "X" format; JSON models (including dual-format) return "J".
  const supportsJson = (props.type.usage & UsageFlags.Json) !== 0;
  const wireFormat = supportsJson ? "J" : "X";

  return (
    <>
      {code`${System.BinaryData} ${SystemClientModelPrimitives.IPersistableModel}<${modelName}>.Write(${SystemClientModelPrimitives.ModelReaderWriterOptions} options) => PersistableModelWriteCore(options);`}
      {"\n\n"}
      {code`${modelName} ${SystemClientModelPrimitives.IPersistableModel}<${modelName}>.Create(${System.BinaryData} data, ${SystemClientModelPrimitives.ModelReaderWriterOptions} options) => ${createExpression};`}
      {"\n\n"}
      {code`string ${SystemClientModelPrimitives.IPersistableModel}<${modelName}>.GetFormatFromOptions(${SystemClientModelPrimitives.ModelReaderWriterOptions} options) => "${wireFormat}";`}
    </>
  );
}
