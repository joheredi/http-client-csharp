import {
  Attribute,
  ClassDeclaration,
  Namespace,
  SourceFile,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import { type Children, code, namekey } from "@alloy-js/core";
import {
  type SdkModelType,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemTextJsonSerialization } from "../../builtins/system-text-json-serialization.js";
import {
  getCustomNamespace,
  useCustomCode,
} from "../../contexts/custom-code-context.js";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { efCsharpRefkey, unknownModelRefkey } from "../../utils/refkey.js";
import { hasSystemTextJsonConverter } from "../../utils/system-text-json-converter.js";
import { isModelAbstract } from "../models/ModelConstructors.js";
import { isDynamicModel } from "../models/DynamicModel.js";
import { SystemTextJsonConverterClass } from "./SystemTextJsonConverterClass.js";

/**
 * Props for the {@link ModelSerializationFile} component.
 */
export interface ModelSerializationFileProps {
  /** The TCGC SDK model type representing a TypeSpec model. */
  type: SdkModelType;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
  /** Optional children rendered inside the class body (e.g., serialization methods). */
  children?: Children;
}

/**
 * Checks whether a model needs a `.Serialization.cs` file based on its TCGC
 * usage flags.
 *
 * The legacy emitter's `ScmTypeFactory.CreateSerializationsCore()` only generates
 * serialization type definitions for models with `Json` or `Xml` usage flags.
 * Models used exclusively for multipart form data, file uploads, or spread
 * parameters do not get serialization files — they lack the usage flags that
 * would make them serializable via `IJsonModel<T>` or `IPersistableModel<T>`.
 *
 * @param type - The TCGC SDK model type to check.
 * @returns `true` if the model should have a serialization file generated.
 */
export function modelNeedsSerialization(type: SdkModelType): boolean {
  return (type.usage & (UsageFlags.Json | UsageFlags.Xml)) !== 0;
}

/**
 * Determines which serialization interfaces a model should implement based on
 * its TCGC usage flags.
 *
 * The logic mirrors the legacy emitter's `MrwSerializationTypeDefinition.BuildImplements()`:
 * - Models with JSON usage implement `IJsonModel<T>` (which inherits `IPersistableModel<T>`,
 *   so both interfaces are satisfied).
 * - Models with only XML usage implement `IPersistableModel<T>` directly (JSON methods
 *   are not needed).
 *
 * Callers should filter models with {@link modelNeedsSerialization} before calling
 * this function. Models without Json or Xml usage should not have serialization
 * files generated at all.
 *
 * @param type - The TCGC SDK model type.
 * @param modelName - The C# class name (used as the generic type argument `T`).
 * @returns An array of Alloy `code` expressions for the `interfaceTypes` prop.
 */
export function getSerializationInterfaces(
  type: SdkModelType,
  modelName: string,
): Children[] {
  const supportsJson = (type.usage & UsageFlags.Json) !== 0;
  const supportsXml = (type.usage & UsageFlags.Xml) !== 0;

  if (supportsJson) {
    return [code`${SystemClientModelPrimitives.IJsonModel}<${modelName}>`];
  } else if (supportsXml) {
    return [
      code`${SystemClientModelPrimitives.IPersistableModel}<${modelName}>`,
    ];
  }

  // Defensive fallback: models without Json or Xml usage should be filtered out
  // by modelNeedsSerialization() before reaching this point. If they somehow get
  // here, default to IPersistableModel<T> (the minimal interface) rather than
  // IJsonModel<T> to avoid declaring methods that won't be implemented.
  return [code`${SystemClientModelPrimitives.IPersistableModel}<${modelName}>`];
}

/**
 * Generates a C# `.Serialization.cs` partial class file that implements the
 * appropriate serialization interface (`IJsonModel<T>` or `IPersistableModel<T>`).
 *
 * This component produces the serialization file skeleton for a model: the license
 * header, namespace, and a `partial class` declaration with the correct serialization
 * interface. Interface selection is based on the model's TCGC usage flags:
 * - JSON models implement `IJsonModel<T>` (which inherits `IPersistableModel<T>`).
 * - XML-only models implement `IPersistableModel<T>` directly.
 *
 * The file is generated at `src/Generated/Models/{ModelName}.Serialization.cs`,
 * matching the legacy emitter's golden file format.
 *
 * For derived models, the class re-declares the base type to match C# partial class
 * requirements (e.g., `public partial class Dog : Pet, IJsonModel<Dog>`).
 *
 * Child components can render serialization methods (JsonModelWriteCore,
 * PersistableModelWriteCore, Deserialize, etc.) inside the class body — those
 * are handled by subsequent tasks (2.1.3–2.3.14).
 *
 * @example Generated output for a JSON model:
 * ```csharp
 * // <auto-generated/>
 *
 * #nullable disable
 *
 * using System.ClientModel.Primitives;
 *
 * namespace TestNamespace.Models
 * {
 *     public partial class Widget : IJsonModel<Widget>
 *     {
 *     }
 * }
 * ```
 *
 * @example Generated output for an XML-only model:
 * ```csharp
 * // <auto-generated/>
 *
 * #nullable disable
 *
 * using System.ClientModel.Primitives;
 *
 * namespace TestNamespace.Models
 * {
 *     public partial class Widget : IPersistableModel<Widget>
 *     {
 *     }
 * }
 * ```
 */
export function ModelSerializationFile(props: ModelSerializationFileProps) {
  const header = getLicenseHeader(props.options);
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const isPublic = props.type.access === "public";
  const isAbstract = isModelAbstract(props.type);

  // Use namekey with ignoreNameConflict to prevent Alloy's symbol deduplication.
  // The main model file (ModelFile.tsx) already declares a ClassDeclaration with
  // the same name in the same namespace — without this flag, Alloy would rename
  // the second declaration with a "_2" suffix.
  const partialName = namekey(modelName, { ignoreNameConflict: true });

  // When custom code declares a partial class in a different namespace
  // (e.g., [CodeGenType("Friend")] in SampleTypeSpec.Models.Custom),
  // the serialization file must match the model file's namespace.
  const customCode = useCustomCode();
  const effectiveNamespace =
    getCustomNamespace(customCode, modelName) ?? props.type.namespace;

  // Dynamic models (JSON Merge Patch) need System.Text for Encoding.UTF8.GetBytes()
  // used in per-key dictionary patch checks.
  const additionalUsings = isDynamicModel(props.type)
    ? ["System.Text"]
    : undefined;

  // Abstract base models with discriminated subtypes need the PersistableModelProxy
  // attribute to tell the framework which concrete type to instantiate when the
  // discriminator value is unrecognized during deserialization.
  //
  // Models with the @useSystemTextJsonConverter decorator (Azure flavor) need a
  // [JsonConverter(typeof({Model}Converter))] attribute to register the nested
  // converter class for System.Text.Json serialization support.
  const needsJsonConverter = hasSystemTextJsonConverter(props.type);
  const converterName = `${modelName}Converter`;
  const attributes: Children[] = [];
  if (needsJsonConverter) {
    // Use a plain string for typeof() since the converter is a nested class
    // in the same scope — no cross-file refkey resolution needed.
    attributes.push(
      <Attribute
        name={SystemTextJsonSerialization.JsonConverterAttribute}
        args={[`typeof(${converterName})`]}
      />,
    );
  }
  if (isAbstract) {
    attributes.push(
      <Attribute
        name={SystemClientModelPrimitives.PersistableModelProxyAttribute}
        args={[code`typeof(${unknownModelRefkey(props.type.__raw!)})`]}
      />,
    );
  }

  return (
    <SourceFile
      path={`src/Generated/Models/${modelName}.Serialization.cs`}
      using={additionalUsings}
    >
      {header}
      {"\n\n"}
      <Namespace name={effectiveNamespace}>
        <ClassDeclaration
          public={isPublic}
          internal={!isPublic}
          abstract={isAbstract}
          partial
          name={partialName as unknown as string}
          baseType={
            props.type.baseModel
              ? efCsharpRefkey(props.type.baseModel.__raw!)
              : undefined
          }
          interfaceTypes={getSerializationInterfaces(props.type, modelName)}
          attributes={attributes.length > 0 ? attributes : undefined}
        >
          {props.children}
          {needsJsonConverter && "\n\n"}
          {needsJsonConverter && (
            <SystemTextJsonConverterClass type={props.type} />
          )}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
