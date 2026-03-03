import {
  ClassDeclaration,
  Namespace,
  SourceFile,
  StructDeclaration,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import { code, type Children, For } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import { System } from "../../builtins/system.js";
import {
  isMemberSuppressed,
  useCustomCode,
} from "../../contexts/custom-code-context.js";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { isModelStruct } from "../../utils/model.js";
import { efCsharpRefkey } from "../../utils/refkey.js";
import { DynamicModelMembers, isDynamicModel } from "./DynamicModel.js";
import {
  isBaseDiscriminatorOverride,
  isDerivedDiscriminatedModel,
  isModelAbstract,
  ModelConstructors,
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
      const propName = namePolicy.getName(p.name, "class-property");
      return !isMemberSuppressed(customCode, modelName, propName);
    });
  }

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

  const members = (
    <>
      {isRoot && isDynamic && (
        <>
          <DynamicModelMembers />
          {"\n\n"}
        </>
      )}
      {isRoot && !isDynamic && (
        <>
          {code`/// <summary> Keeps track of any properties unknown to the library. </summary>\n${fieldModifier} readonly ${SystemCollectionsGeneric.IDictionary}<string, ${System.BinaryData}> _additionalBinaryDataProperties;`}
          {"\n\n"}
        </>
      )}
      <ModelConstructors type={props.type} isStruct={isStruct} />
      {renderProperties.length > 0 ? "\n\n" : ""}
      <For each={renderProperties} hardline>
        {(p) => <ModelProperty property={p} modelUsage={props.type.usage} />}
      </For>
      {props.children}
    </>
  );

  return (
    <SourceFile path={`src/Generated/Models/${modelName}.cs`}>
      {header}
      {"\n\n"}
      <Namespace name={props.type.namespace}>
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
          >
            {members}
          </ClassDeclaration>
        )}
      </Namespace>
    </SourceFile>
  );
}
