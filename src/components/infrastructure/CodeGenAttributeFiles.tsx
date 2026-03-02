import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * The fixed namespace used by all CodeGen attribute classes.
 *
 * This namespace is hardcoded to `Microsoft.TypeSpec.Generator.Customizations`
 * matching the legacy emitter's `CodeModelGenerator.CustomizationAttributeNamespace`
 * constant. It does NOT vary with the package name.
 */
const CUSTOMIZATION_NAMESPACE = "Microsoft.TypeSpec.Generator.Customizations";

/**
 * Props for the {@link CodeGenAttributeFiles} component.
 */
export interface CodeGenAttributeFilesProps {
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates four C# attribute files used for customization support.
 *
 * These attributes allow users to annotate generated types with metadata
 * that controls code generation behavior (renaming types/members,
 * suppressing generated members, and customizing serialization).
 *
 * Generated files:
 * - `CodeGenTypeAttribute.cs` — Base attribute for marking types with original names
 * - `CodeGenMemberAttribute.cs` — Marks property/field members with original names
 * - `CodeGenSuppressAttribute.cs` — Suppresses specific generated members
 * - `CodeGenSerializationAttribute.cs` — Configures custom serialization hooks
 *
 * All files are placed in `src/Generated/Internal/` under the fixed namespace
 * `Microsoft.TypeSpec.Generator.Customizations`, matching the legacy emitter.
 */
export function CodeGenAttributeFiles(props: CodeGenAttributeFilesProps) {
  const header = getLicenseHeader(props.options);

  return (
    <>
      <CodeGenTypeAttributeFile header={header} />
      <CodeGenMemberAttributeFile header={header} />
      <CodeGenSuppressAttributeFile header={header} />
      <CodeGenSerializationAttributeFile header={header} />
    </>
  );
}

/**
 * Props shared by individual CodeGen attribute file components.
 */
interface CodeGenFileProps {
  /** The pre-rendered license header string. */
  header: string;
}

/**
 * Generates `CodeGenTypeAttribute.cs`.
 *
 * This is the base attribute that marks generated types with their original
 * TypeSpec name. It is used as the base class for {@link CodeGenMemberAttributeFile}.
 *
 * Targets: Class, Enum, Struct.
 */
function CodeGenTypeAttributeFile(props: CodeGenFileProps) {
  return (
    <SourceFile
      path="src/Generated/Internal/CodeGenTypeAttribute.cs"
      using={["System"]}
    >
      {props.header}
      {"\n\n"}
      <Namespace name={CUSTOMIZATION_NAMESPACE}>
        <ClassDeclaration
          internal
          partial
          name="CodeGenTypeAttribute"
          baseType="Attribute"
          attributes={[
            code`[AttributeUsage((AttributeTargets.Class | AttributeTargets.Enum | AttributeTargets.Struct))]`,
          ]}
        >
          {code`
            /// <param name="originalName"> The original name of the type. </param>
            public CodeGenTypeAttribute(string originalName)
            {
                OriginalName = originalName;
            }
          `}
          {"\n\n"}
          {code`
            /// <summary> Gets the OriginalName. </summary>
            public string OriginalName { get; }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

/**
 * Generates `CodeGenMemberAttribute.cs`.
 *
 * Marks property/field members with their original TypeSpec name.
 * Inherits from `CodeGenTypeAttribute`.
 *
 * Targets: Property, Field.
 */
function CodeGenMemberAttributeFile(props: CodeGenFileProps) {
  return (
    <SourceFile
      path="src/Generated/Internal/CodeGenMemberAttribute.cs"
      using={["System"]}
    >
      {props.header}
      {"\n\n"}
      <Namespace name={CUSTOMIZATION_NAMESPACE}>
        <ClassDeclaration
          internal
          partial
          name="CodeGenMemberAttribute"
          baseType="CodeGenTypeAttribute"
          attributes={[
            code`[AttributeUsage((AttributeTargets.Property | AttributeTargets.Field))]`,
          ]}
        >
          {code`
            /// <param name="originalName"> The original name of the member. </param>
            public CodeGenMemberAttribute(string originalName) : base(originalName)
            {
            }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

/**
 * Generates `CodeGenSuppressAttribute.cs`.
 *
 * Allows users to suppress specific generated members from a type.
 * Supports specifying parameter types to disambiguate overloaded members.
 *
 * Targets: Class, Enum, Struct (AllowMultiple = true).
 */
function CodeGenSuppressAttributeFile(props: CodeGenFileProps) {
  return (
    <SourceFile
      path="src/Generated/Internal/CodeGenSuppressAttribute.cs"
      using={["System"]}
    >
      {props.header}
      {"\n\n"}
      <Namespace name={CUSTOMIZATION_NAMESPACE}>
        <ClassDeclaration
          internal
          partial
          name="CodeGenSuppressAttribute"
          baseType="Attribute"
          attributes={[
            code`[AttributeUsage((AttributeTargets.Class | AttributeTargets.Enum | AttributeTargets.Struct), AllowMultiple = true)]`,
          ]}
        >
          {code`
            /// <param name="member"> The member to suppress. </param>
            /// <param name="parameters"> The types of the parameters of the member. </param>
            public CodeGenSuppressAttribute(string member, params Type[] parameters)
            {
                Member = member;
                Parameters = parameters;
            }
          `}
          {"\n\n"}
          {code`
            /// <summary> Gets the Member. </summary>
            public string Member { get; }
          `}
          {"\n\n"}
          {code`
            /// <summary> Gets the Parameters. </summary>
            public Type[] Parameters { get; }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

/**
 * Generates `CodeGenSerializationAttribute.cs`.
 *
 * Allows users to configure custom serialization and deserialization
 * behavior for specific properties of a model type.
 *
 * Supports setting:
 * - Custom serialization name for a property
 * - Serialization value hook method
 * - Deserialization value hook method
 *
 * Targets: Class, Struct (AllowMultiple = true, Inherited = true).
 */
function CodeGenSerializationAttributeFile(props: CodeGenFileProps) {
  return (
    <SourceFile
      path="src/Generated/Internal/CodeGenSerializationAttribute.cs"
      using={["System"]}
    >
      {props.header}
      {"\n\n"}
      <Namespace name={CUSTOMIZATION_NAMESPACE}>
        <ClassDeclaration
          internal
          partial
          name="CodeGenSerializationAttribute"
          baseType="Attribute"
          attributes={[
            code`[AttributeUsage((AttributeTargets.Class | AttributeTargets.Struct), AllowMultiple = true, Inherited = true)]`,
          ]}
        >
          {code`
            /// <param name="propertyName"> The property name which these hooks apply to. </param>
            public CodeGenSerializationAttribute(string propertyName)
            {
                PropertyName = propertyName;
            }
          `}
          {"\n\n"}
          {code`
            /// <param name="propertyName"> The property name which these hooks apply to. </param>
            /// <param name="serializationName"> The serialization name of the property. </param>
            public CodeGenSerializationAttribute(string propertyName, string serializationName)
            {
                PropertyName = propertyName;
                SerializationName = serializationName;
            }
          `}
          {"\n\n"}
          {code`
            /// <summary> Gets or sets the property name which these hooks should apply to. </summary>
            public string PropertyName { get; }
          `}
          {"\n\n"}
          {code`
            /// <summary> Gets or sets the serialization name of the property. </summary>
            public string SerializationName { get; set; }
          `}
          {"\n\n"}
          {code`
            /// <summary>
            /// Gets or sets the method name to use when serializing the property value (property name excluded).
            /// The signature of the serialization hook method must be or compatible with when invoking: private void SerializeHook(Utf8JsonWriter writer);
            /// </summary>
            public string SerializationValueHook { get; set; }
          `}
          {"\n\n"}
          {code`
            /// <summary>
            /// Gets or sets the method name to use when deserializing the property value from the JSON.
            /// private static void DeserializationHook(JsonProperty property, ref TypeOfTheProperty propertyValue); // if the property is required
            /// private static void DeserializationHook(JsonProperty property, ref Optional&lt;TypeOfTheProperty&gt; propertyValue); // if the property is optional
            /// </summary>
            public string DeserializationValueHook { get; set; }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
