import {
  ClassDeclaration,
  Method,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { SystemTextJson } from "../../builtins/system-text-json.js";
import { SystemTextJsonSerialization } from "../../builtins/system-text-json-serialization.js";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";

/**
 * Props for the {@link SystemTextJsonConverterClass} component.
 */
export interface SystemTextJsonConverterClassProps {
  /** The TCGC SDK model type that needs the JsonConverter nested class. */
  type: SdkModelType;
}

/**
 * Generates a nested `internal partial class {Model}Converter : JsonConverter<{Model}>`
 * inside a model's serialization partial class.
 *
 * This converter is generated when a model has the `@useSystemTextJsonConverter`
 * decorator (Azure flavor). It delegates serialization to the model's
 * `IJsonModel<T>` implementation and deserialization to the static
 * `Deserialize{Model}` method, both using `ModelSerializationExtensions.WireOptions`.
 *
 * The converter enables `JsonSerializer.Serialize/Deserialize` to work with
 * the model type by registering via the `[JsonConverter]` attribute on the
 * serialization partial class.
 *
 * @example Generated output:
 * ```csharp
 * internal partial class FooPropertiesConverter : JsonConverter<FooProperties>
 * {
 *     public override void Write(Utf8JsonWriter writer, FooProperties model, JsonSerializerOptions options)
 *     {
 *         writer.WriteObjectValue<IJsonModel<FooProperties>>(model, ModelSerializationExtensions.WireOptions);
 *     }
 *
 *     public override FooProperties Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
 *     {
 *         using JsonDocument document = JsonDocument.ParseValue(ref reader);
 *         return DeserializeFooProperties(document.RootElement, ModelSerializationExtensions.WireOptions);
 *     }
 * }
 * ```
 */
export function SystemTextJsonConverterClass(
  props: SystemTextJsonConverterClassProps,
) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const converterName = `${modelName}Converter`;

  return (
    <ClassDeclaration
      internal
      partial
      name={converterName}
      baseType={code`${SystemTextJsonSerialization.JsonConverter}<${modelName}>`}
    >
      <Method
        public
        override
        name="Write"
        parameters={[
          {
            name: "writer",
            type: SystemTextJson.Utf8JsonWriter,
          },
          {
            name: "model",
            type: modelName,
          },
          {
            name: "options",
            type: SystemTextJson.JsonSerializerOptions,
          },
        ]}
      >
        {code`writer.WriteObjectValue<${SystemClientModelPrimitives.IJsonModel}<${modelName}>>(model, ModelSerializationExtensions.WireOptions);`}
      </Method>
      {"\n\n"}
      <Method
        public
        override
        name="Read"
        returns={modelName}
        parameters={[
          {
            name: "reader",
            ref: true,
            type: SystemTextJson.Utf8JsonReader,
          },
          {
            name: "typeToConvert",
            type: "Type",
          },
          {
            name: "options",
            type: SystemTextJson.JsonSerializerOptions,
          },
        ]}
      >
        {code`using ${SystemTextJson.JsonDocument} document = ${SystemTextJson.JsonDocument}.ParseValue(ref reader);`}
        {"\n"}
        {code`return Deserialize${modelName}(document.RootElement, ModelSerializationExtensions.WireOptions);`}
      </Method>
    </ClassDeclaration>
  );
}
