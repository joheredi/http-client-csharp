import {
  type CSharpElements,
  ClassDeclaration,
  Namespace,
  SourceFile,
  StructDeclaration,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import { code, type Children, For } from "@alloy-js/core";
import type { NamePolicy } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import { System } from "../../builtins/system.js";
import {
  getCustomNamespace,
  isMemberSuppressed,
  useCustomCode,
} from "../../contexts/custom-code-context.js";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { ensureTrailingPeriod } from "../../utils/doc.js";
import { getLicenseHeader } from "../../utils/header.js";
import { isModelStruct } from "../../utils/model.js";
import { resolvePropertyName } from "../../utils/property.js";
import {
  ADDITIONAL_PROPERTIES_PROP_NAME,
  hasAdditionalProperties,
  renderAdditionalPropertiesValueType,
} from "../../utils/additional-properties.js";
import { efCsharpRefkey } from "../../utils/refkey.js";
import {
  collectFlattenedProperties,
  isFlattenedProperty,
} from "../../utils/flatten.js";
import { DynamicModelMembers, isDynamicModel } from "./DynamicModel.js";
import { FlattenedProperty } from "./FlattenedProperty.js";
import {
  isBaseDiscriminatorOverride,
  isDerivedDiscriminatedModel,
  isModelAbstract,
  ModelConstructors,
  modelNeedsLinqImport,
} from "./ModelConstructors.js";
import { ModelProperty } from "./ModelProperty.js";

/**
 * Props for the {@link ModelFile} component.
 */
export interface ModelFileProps {
  /** The TCGC SDK model type representing a TypeSpec model. */
  type: SdkModelType;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
  /** Optional children rendered inside the class body. */
  children?: Children;
}

/**
 * Generates a C# source file containing a model type declaration.
 *
 * This component produces the file-level skeleton for a model: the license
 * header, namespace, and either a `partial class` or `readonly partial struct`
 * declaration. The choice depends on the `modelAsStruct` flag on the TCGC
 * model type (see {@link isModelStruct}).
 *
 * Struct models use `StructDeclaration` with `readonly` and `partial`
 * modifiers. They cannot be abstract and cannot have base types (C# structs
 * don't support inheritance). All non-readonly properties become constructor
 * parameters (not just required ones).
 *
 * The generated file follows the legacy emitter's golden file format.
 *
 * @example Generated output for a struct model:
 * ```csharp
 * public readonly partial struct Point
 * {
 *     public Point(double x, double y)
 *     {
 *         X = x;
 *         Y = y;
 *     }
 *
 *     public double X { get; }
 *     public double Y { get; }
 * }
 * ```
 */
export function ModelFile(props: ModelFileProps) {
  const header = getLicenseHeader(props.options);
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const isPublic = props.type.access === "public";

  const isStruct = isModelStruct(props.type);
  // Structs cannot be abstract in C#; ignore the abstract flag for structs.
  const isAbstract = !isStruct && isModelAbstract(props.type);

  // Build XML doc comment for the class declaration. Abstract base models
  // include a "Please note" text with <see cref> references to derived classes.
  const classDoc = buildAbstractModelDoc(
    props.type,
    modelName,
    isAbstract,
    namePolicy,
  );

  // For derived discriminated models, filter out base discriminator override
  // properties (e.g., kind: "eagle") — they're inherited from the base class.
  // Keep the model's own discriminator property (e.g., Shark's sharktype: string).
  const isDerived = isDerivedDiscriminatedModel(props.type);
  let renderProperties = isDerived
    ? props.type.properties.filter((p) => !isBaseDiscriminatorOverride(p))
    : [...props.type.properties];

  // Filter out properties that are suppressed by user-written custom code.
  // Custom partial classes can use [CodeGenMember("Name")] to replace a
  // generated property, or [CodeGenSuppress("Name")] to remove it entirely.
  const customCode = useCustomCode();
  if (customCode) {
    renderProperties = renderProperties.filter((p) => {
      const propName = namePolicy.getName(
        resolvePropertyName(p.name, props.type.name),
        "class-property",
      );
      return !isMemberSuppressed(customCode, modelName, propName);
    });
  }

  // Collect flattened property metadata. Properties with `flatten: true`
  // become internal backing fields, and their inner model's public properties
  // get promoted as computed getter/setter properties on this model.
  const flattenedInfos = collectFlattenedProperties(props.type);
  const flattenedBackingSet = new Set(
    flattenedInfos.map((fi) => fi.backingProperty),
  );

  // When custom code declares a partial class in a different namespace
  // (e.g., [CodeGenType("Friend")] in SampleTypeSpec.Models.Custom),
  // the generated model must adopt that namespace so both partials merge.
  const effectiveNamespace =
    getCustomNamespace(customCode, modelName) ?? props.type.namespace;

  // Only root models (no base model) declare the _additionalBinaryDataProperties
  // field. Derived models inherit it from their base class. The access modifier
  // is `private protected` for classes (allowing derived class access) and
  // `private` for structs (which cannot be inherited).
  //
  // Dynamic models (JsonMergePatch usage) replace _additionalBinaryDataProperties
  // with _patch field and Patch property for tracking partial updates.
  const isRoot = props.type.baseModel === undefined;
  const isDynamic = isDynamicModel(props.type);
  const fieldModifier = isStruct ? "private" : "private protected";

  // When the public constructor converts IEnumerable<T> parameters to
  // IList<T> via .ToList(), the model file needs `using System.Linq;`.
  const needsLinq = modelNeedsLinqImport(props.type, isStruct);
  const additionalUsings = needsLinq ? ["System.Linq"] : undefined;

  // Determine whether this model has typed additional properties (from
  // extends/spread Record<T>). When present, the typed AdditionalProperties
  // property replaces the raw _additionalBinaryDataProperties field.
  const hasTypedAdditionalProps = hasAdditionalProperties(props.type);

  const members = (
    <>
      {isRoot && isDynamic && (
        <>
          <DynamicModelMembers />
          {"\n\n"}
        </>
      )}
      {isRoot && !isDynamic && !hasTypedAdditionalProps && (
        <>
          {code`/// <summary> Keeps track of any properties unknown to the library. </summary>\n${fieldModifier} readonly ${SystemCollectionsGeneric.IDictionary}<string, ${System.BinaryData}> _additionalBinaryDataProperties;`}
          {"\n\n"}
        </>
      )}
      <ModelConstructors type={props.type} isStruct={isStruct} />
      {renderProperties.length > 0 ? "\n\n" : ""}
      <For each={renderProperties} hardline>
        {(p) => (
          <ModelProperty
            property={p}
            modelUsage={props.type.usage}
            modelName={props.type.name}
            forceInternal={flattenedBackingSet.has(p)}
            wirePathValue={
              props.options["enable-wire-path-attribute"]
                ? p.serializedName
                : undefined
            }
          />
        )}
      </For>
      {flattenedInfos.length > 0 && (
        <>
          {renderProperties.length > 0 ? "\n\n" : "\n\n"}
          <For each={flattenedInfos} hardline>
            {(fi) => (
              <FlattenedProperty
                info={fi}
                modelName={props.type.name}
                enableWirePath={props.options["enable-wire-path-attribute"]}
              />
            )}
          </For>
        </>
      )}
      {hasTypedAdditionalProps && (
        <>
          {renderProperties.length > 0 ? "\n\n" : "\n\n"}
          {code`/// <summary> Additional properties that are not explicitly defined in the model schema. </summary>\npublic ${SystemCollectionsGeneric.IDictionary}<string, ${renderAdditionalPropertiesValueType(props.type.additionalProperties!)}> ${ADDITIONAL_PROPERTIES_PROP_NAME} { get; }`}
        </>
      )}
      {props.children}
    </>
  );

  return (
    <SourceFile
      path={`src/Generated/Models/${modelName}.cs`}
      using={additionalUsings}
    >
      {header}
      {"\n\n"}
      <Namespace name={effectiveNamespace}>
        {isStruct ? (
          <StructDeclaration
            public={isPublic}
            internal={!isPublic}
            readonly
            partial
            name={modelName}
            refkey={efCsharpRefkey(props.type.__raw!)}
          >
            {members}
          </StructDeclaration>
        ) : (
          <ClassDeclaration
            public={isPublic}
            internal={!isPublic}
            abstract={isAbstract}
            partial
            name={modelName}
            refkey={efCsharpRefkey(props.type.__raw!)}
            baseType={
              props.type.baseModel
                ? efCsharpRefkey(props.type.baseModel.__raw!)
                : undefined
            }
            doc={classDoc}
          >
            {members}
          </ClassDeclaration>
        )}
      </Namespace>
    </SourceFile>
  );
}

/**
 * Builds the XML doc comment for an abstract base model class declaration.
 *
 * Abstract base models (discriminated union roots) get a multi-line summary
 * that includes the model's description followed by a "Please note this is
 * the abstract base class" note listing all public derived classes with
 * `<see cref>` references. This matches the legacy emitter's ModelProvider
 * BuildDescription() output.
 *
 * Non-abstract models return `undefined` — they do not get a class-level doc
 * comment from this function.
 *
 * @returns The formatted doc string for the `doc` prop, or `undefined`.
 *
 * @example For Animal with derived Pet and Dog:
 * ```xml
 * <summary>
 * Base animal with discriminator
 * Please note this is the abstract base class. The derived classes available
 * for instantiation are: <see cref="Pet"/> and <see cref="Dog"/>.
 * </summary>
 * ```
 */
function buildAbstractModelDoc(
  model: SdkModelType,
  modelName: string,
  isAbstract: boolean,
  namePolicy: NamePolicy<CSharpElements>,
): string | undefined {
  if (!isAbstract || !model.discriminatedSubtypes) {
    return undefined;
  }

  const description = model.doc ?? model.summary ?? `The ${modelName}.`;

  // Get public derived classes from discriminated subtypes.
  // Internal models (e.g., Unknown* fallback variants) are excluded.
  const publicDerived = Object.values(model.discriminatedSubtypes).filter(
    (m) => m.access === "public",
  );

  if (publicDerived.length === 0) {
    return `<summary> ${ensureTrailingPeriod(description)} </summary>`;
  }

  const derivedText = formatDerivedClassesText(publicDerived, namePolicy);
  return `<summary>\n${description}\n${derivedText}\n</summary>`;
}

/**
 * Formats the "Please note this is the abstract base class…" text with
 * `<see cref>` references to all derived classes.
 *
 * Grammar rules match the legacy emitter's ModelProvider:
 * - 1 class:   `<see cref="X"/>.`
 * - 2 classes:  `<see cref="X"/> and <see cref="Y"/>.`
 * - 3+ classes: `<see cref="X"/>, <see cref="Y"/>, and <see cref="Z"/>.`
 */
function formatDerivedClassesText(
  derivedModels: SdkModelType[],
  namePolicy: NamePolicy<CSharpElements>,
): string {
  const prefix =
    "Please note this is the abstract base class. The derived classes available for instantiation are: ";
  const addComma = derivedModels.length > 2;
  let refs = "";

  for (let i = 0; i < derivedModels.length; i++) {
    const name = namePolicy.getName(derivedModels[i].name, "class");
    const isLast = i === derivedModels.length - 1;

    if (isLast) {
      refs += `${i > 0 ? "and " : ""}<see cref="${name}"/>.`;
    } else {
      refs += `<see cref="${name}"/>${addComma ? ", " : " "}`;
    }
  }

  return prefix + refs;
}
