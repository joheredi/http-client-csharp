/**
 * ToBinaryContent component for C# model serialization files.
 *
 * Generates the `internal BinaryContent ToBinaryContent(string format)` method
 * on dual-format model serialization classes. This method is only generated for
 * models that support **both** JSON and XML serialization.
 *
 * The method enables convenience methods to serialize a model with an explicit
 * format string ("J" for JSON, "X" for XML) rather than relying on the implicit
 * BinaryContent operator (which always uses the default wire format).
 *
 * @example Generated output:
 * ```csharp
 * internal BinaryContent ToBinaryContent(string format)
 * {
 *     ModelReaderWriterOptions options = new ModelReaderWriterOptions(format);
 *     return BinaryContent.Create(this, options);
 * }
 * ```
 *
 * @remarks
 * The legacy emitter generates this in `MrwSerializationTypeDefinition.BuildToBinaryContentMethod()`.
 * It is only emitted when `_supportsJson && _supportsXml` — single-format models
 * do not need explicit format selection at the call site.
 *
 * Convenience methods call `model.ToBinaryContent("X")` or `model.ToBinaryContent("J")`
 * depending on the operation's expected content type.
 *
 * @module
 */

import { code } from "@alloy-js/core";
import {
  type SdkModelType,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";
import {
  SystemClientModel,
  SystemClientModelPrimitives,
} from "../../builtins/system-client-model.js";

/**
 * Props for the {@link ToBinaryContent} component.
 */
export interface ToBinaryContentProps {
  /** The TCGC SDK model type for which to generate the method. */
  type: SdkModelType;
}

/**
 * Generates an `internal BinaryContent ToBinaryContent(string format)` method
 * for dual-format (JSON + XML) model serialization classes.
 *
 * This method creates a `ModelReaderWriterOptions` instance with the specified
 * format string and delegates to `BinaryContent.Create(this, options)`. It is
 * only generated for models that have both `UsageFlags.Json` and `UsageFlags.Xml`
 * set, AND are input models (used as operation parameters).
 *
 * Single-format models do not need this method because the implicit BinaryContent
 * operator always uses the correct default format. Dual-format models need it so
 * that convenience methods can specify which format to use at the call site.
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the method, or null if the model is not dual-format
 *          or not an input model.
 */
export function ToBinaryContent(props: ToBinaryContentProps) {
  const { type } = props;

  const supportsJson = (type.usage & UsageFlags.Json) !== 0;
  const supportsXml = (type.usage & UsageFlags.Xml) !== 0;

  // Only generate for dual-format models — models that support both JSON and XML.
  // Single-format models use the implicit BinaryContent operator instead.
  if (!supportsJson || !supportsXml) {
    return null;
  }

  return (
    <>
      {code`internal ${SystemClientModel.BinaryContent} ToBinaryContent(string format)`}
      {"\n{"}
      {"\n"}
      {code`    ${SystemClientModelPrimitives.ModelReaderWriterOptions} options = new ${SystemClientModelPrimitives.ModelReaderWriterOptions}(format);`}
      {"\n"}
      {code`    return ${SystemClientModel.BinaryContent}.Create(this, options);`}
      {"\n}"}
    </>
  );
}
