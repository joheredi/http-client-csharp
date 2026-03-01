import {
  ClassDeclaration,
  Field,
  Namespace,
  Property,
  SourceFile,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import type { Children } from "@alloy-js/core";
import type {
  SdkClientType,
  SdkHttpOperation,
} from "@azure-tools/typespec-client-generator-core";
import { System } from "../../builtins/system.js";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { OverloadConstructor } from "../models/ModelConstructors.js";

/**
 * Props for the {@link ClientFile} component.
 */
export interface ClientFileProps {
  /** The TCGC SDK client type representing a TypeSpec client or operation group. */
  client: SdkClientType<SdkHttpOperation>;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
  /** Optional children rendered inside the class body (e.g., operation methods, factory methods). */
  children?: Children;
}

/**
 * Generates a C# source file containing a client partial class.
 *
 * This component produces the file-level skeleton for a client class: the
 * license header, namespace, and `partial class` declaration. The generated
 * class includes:
 *
 * - A private `_endpoint` field (Uri) for the service endpoint
 * - A protected parameterless constructor for mocking/testing
 * - A `Pipeline` property exposing the HTTP pipeline
 * - For sub-clients: an internal constructor accepting pipeline and endpoint
 *
 * Root clients (no parent) get only the mocking constructor here; their
 * primary constructors with auth parameters are added by task 3.2.3.
 * Sub-clients (with a parent) get an internal constructor that receives
 * the pipeline and endpoint from the parent client's factory method.
 *
 * The generated file is placed at `src/Generated/{ClassName}.cs`, matching
 * the legacy emitter's `ClientProvider` output format.
 *
 * @example Generated output for a sub-client:
 * ```csharp
 * public partial class PetOperations
 * {
 *     private readonly Uri _endpoint;
 *
 *     protected PetOperations()
 *     {
 *     }
 *
 *     internal PetOperations(ClientPipeline pipeline, Uri endpoint)
 *     {
 *         _endpoint = endpoint;
 *         Pipeline = pipeline;
 *     }
 *
 *     public ClientPipeline Pipeline { get; }
 * }
 * ```
 */
export function ClientFile(props: ClientFileProps) {
  const { client, options } = props;
  const header = getLicenseHeader(options);
  const namePolicy = useCSharpNamePolicy();
  const className = namePolicy.getName(client.name, "class");
  const isSubClient = client.parent !== undefined;

  // Root clients use their doc/summary from the TypeSpec @doc decorator;
  // sub-clients use a standard "The {Name} sub-client." pattern.
  const docComment = isSubClient
    ? `/// <summary> The ${className} sub-client. </summary>`
    : (client.doc ?? client.summary)
      ? `/// <summary> ${client.doc ?? client.summary} </summary>`
      : `/// <summary> The ${className}. </summary>`;

  return (
    <SourceFile path={`src/Generated/${className}.cs`}>
      {header}
      {"\n\n"}
      <Namespace name={client.namespace}>
        {docComment}
        {"\n"}
        <ClassDeclaration public partial name={className}>
          <Field private readonly name="endpoint" type={System.Uri} />
          {"\n\n"}
          {`/// <summary> Initializes a new instance of ${className} for mocking. </summary>`}
          {"\n"}
          <OverloadConstructor protected />
          {isSubClient && (
            <>
              {"\n\n"}
              {`/// <summary> Initializes a new instance of ${className}. </summary>`}
              {"\n"}
              {`/// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>`}
              {"\n"}
              {`/// <param name="endpoint"> Service endpoint. </param>`}
              {"\n"}
              <OverloadConstructor
                internal
                parameters={[
                  {
                    name: "pipeline",
                    type: SystemClientModelPrimitives.ClientPipeline,
                  },
                  { name: "endpoint", type: System.Uri },
                ]}
              >
                {`_endpoint = endpoint;\nPipeline = pipeline;`}
              </OverloadConstructor>
            </>
          )}
          {"\n\n"}
          {`/// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>`}
          {"\n"}
          <Property
            public
            name="Pipeline"
            type={SystemClientModelPrimitives.ClientPipeline}
            get
          />
          {props.children}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
