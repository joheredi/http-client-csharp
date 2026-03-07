import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";

/**
 * The fully-qualified decorator name for `@useSystemTextJsonConverter` as it
 * appears in TCGC's `DecoratorInfo.name` field. This decorator is defined in
 * the `@azure-tools/typespec-client-generator-core` package and signals that
 * a model needs a custom `JsonConverter<T>` to support System.Text.Json
 * serialization in the Azure C# SDK.
 *
 * The value must match the regex pattern used in TCGC's `additionalDecorators`
 * configuration (with escaped dots for the regex version).
 */
export const SYSTEM_TEXT_JSON_CONVERTER_DECORATOR =
  "Azure.ClientGenerator.Core.@useSystemTextJsonConverter";

/**
 * The regex pattern for configuring TCGC to include the
 * `@useSystemTextJsonConverter` decorator in model decorator lists.
 * Must be passed to `createSdkContext` via `additionalDecorators`.
 */
export const SYSTEM_TEXT_JSON_CONVERTER_DECORATOR_PATTERN =
  "Azure\\.ClientGenerator\\.Core\\.@useSystemTextJsonConverter";

/**
 * Checks whether a TCGC SDK model type has the `@useSystemTextJsonConverter`
 * decorator applied (for any scope or specifically for "csharp").
 *
 * When this returns `true`, the model's serialization file should include:
 * 1. A `[JsonConverter(typeof({Model}Converter))]` attribute on the class
 * 2. A nested `internal partial class {Model}Converter : JsonConverter<{Model}>`
 *    with Write/Read method overrides
 *
 * The decorator is detected via the model's `decorators` array, which is
 * populated by TCGC only when `additionalDecorators` is configured in the
 * SDK context options. Without this configuration, the decorator won't appear.
 *
 * @param model - The TCGC SDK model type to check.
 * @returns `true` if the model has the `@useSystemTextJsonConverter` decorator.
 */
export function hasSystemTextJsonConverter(model: SdkModelType): boolean {
  return model.decorators.some(
    (d) => d.name === SYSTEM_TEXT_JSON_CONVERTER_DECORATOR,
  );
}
