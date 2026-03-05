import {
  ClassDeclaration,
  Field,
  Method,
  Namespace,
  Property,
  SourceFile,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import { code, refkey } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
import type {
  SdkClientType,
  SdkHttpOperation,
  SdkMethodParameter,
} from "@azure-tools/typespec-client-generator-core";
import {
  SystemClientModel,
  SystemClientModelPrimitives,
} from "../../builtins/system-client-model.js";
import { SystemThreading } from "../../builtins/system-threading.js";
import { System } from "../../builtins/system.js";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import {
  type ApiKeyAuthInfo,
  type OAuth2AuthInfo,
  getAuthInfo,
  getClientMethodParameters,
  getFieldTypeForParam,
} from "../../utils/client-params.js";
import { getClientFileName, getSimpleClientName } from "../../utils/clients.js";
import { formatDocLines } from "../../utils/doc.js";
import { getLicenseHeader } from "../../utils/header.js";
import { OverloadConstructor } from "../models/ModelConstructors.js";
import { clientNeedsLinq, ConvenienceMethods } from "./ConvenienceMethod.js";
import { PagingMethods } from "./PagingMethods.js";
import { ProtocolMethods } from "./ProtocolMethod.js";

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
 * - For root clients: auth credential fields (ApiKeyCredential, AuthenticationTokenProvider)
 * - Additional client parameter fields (_apiVersion, _subscriptionId, etc.)
 * - Sub-client caching fields for lazy child client instantiation
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
 * @example Generated output for a root client with API key auth:
 * ```csharp
 * public partial class TestServiceClient
 * {
 *     private readonly Uri _endpoint;
 *     private readonly ApiKeyCredential _keyCredential;
 *     private const string AuthorizationHeader = "x-api-key";
 *     private readonly string _apiVersion;
 *     private PetOperations _cachedPetOperations;
 *
 *     protected TestServiceClient()
 *     {
 *     }
 *
 *     public ClientPipeline Pipeline { get; }
 * }
 * ```
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
  const className = namePolicy.getName(getSimpleClientName(client.name), "class");
  const fileName = getClientFileName(client, (name) =>
    namePolicy.getName(name, "class"),
  );
  const isSubClient = client.parent !== undefined;

  // Extract auth info for root clients only.
  // Sub-clients inherit authentication through the pipeline created by the parent.
  const authInfos = isSubClient ? [] : getAuthInfo(client);
  const apiKeyAuth = authInfos.find(
    (a): a is ApiKeyAuthInfo => a.kind === "apiKey",
  );
  const oauth2Auth = authInfos.find(
    (a): a is OAuth2AuthInfo => a.kind === "oauth2",
  );

  // Additional client-level method parameters (apiVersion, subscriptionId, etc.)
  const methodParams = getClientMethodParameters(client);

  // Child clients for sub-client caching fields
  const children = client.children ?? [];

  // Root clients use their doc/summary from the TypeSpec @doc decorator;
  // sub-clients use a standard "The {Name} sub-client." pattern.
  const docComment = isSubClient
    ? `/// <summary> The ${className} sub-client. </summary>`
    : (client.doc ?? client.summary)
      ? `/// <summary> ${formatDocLines(client.doc ?? client.summary!)} </summary>`
      : `/// <summary> The ${className}. </summary>`;

  // Constructor setup for root clients.
  // API version params are assigned from options.Version, not passed as constructor params.
  const hasApiVersions = !isSubClient && client.apiVersions.length > 0;
  const optionsClassName = `${className}Options`;
  const apiVersionParams = methodParams.filter((p) => p.isApiVersionParam);
  const nonApiVersionParams = methodParams.filter((p) => !p.isApiVersionParam);

  // Add System.Linq when convenience methods use .ToList() for collection params
  // in spread body constructions (e.g., IEnumerable<T> → IList<T> conversion).
  // Add System.Collections.Generic when OAuth2 auth requires Dictionary<string, object>[] _flows.
  const additionalUsings: string[] = [];
  if (clientNeedsLinq(client)) {
    additionalUsings.push("System.Linq");
  }
  if (oauth2Auth) {
    additionalUsings.push("System.Collections.Generic");
  }

  return (
    <SourceFile
      path={`src/Generated/${fileName}.cs`}
      using={additionalUsings.length > 0 ? additionalUsings : undefined}
    >
      {header}
      {"\n\n"}
      <Namespace name={client.namespace}>
        {docComment}
        {"\n"}
        <ClassDeclaration
          public
          partial
          name={className}
          refkey={refkey(client)}
        >
          <Field private readonly name="endpoint" type={System.Uri} />
          {apiKeyAuth && (
            <>
              {"\n"}
              {`/// <summary> A credential used to authenticate to the service. </summary>`}
              {"\n"}
              <Field
                private
                readonly
                name="keyCredential"
                type={SystemClientModel.ApiKeyCredential}
              />
              {"\n"}
              {`private const string AuthorizationHeader = "${apiKeyAuth.headerName}";`}
              {apiKeyAuth.prefix && (
                <>
                  {"\n"}
                  {`private const string AuthorizationApiKeyPrefix = "${apiKeyAuth.prefix}";`}
                </>
              )}
            </>
          )}
          {oauth2Auth && (
            <>
              {"\n"}
              {`/// <summary> A credential provider used to authenticate to the service. </summary>`}
              {"\n"}
              <Field
                private
                readonly
                name="tokenProvider"
                type={SystemClientModel.AuthenticationTokenProvider}
              />
              {"\n"}
              {`/// <summary> The OAuth2 flows supported by the service. </summary>`}
              {"\n"}
              {buildFlowsFieldDeclaration(oauth2Auth)}
            </>
          )}
          {methodParams.map((param) => (
            <>
              {"\n"}
              <Field
                private
                readonly
                name={param.name}
                type={getFieldTypeForParam(param)}
              />
            </>
          ))}
          {children.map((child) => {
            const childName = namePolicy.getName(child.name, "class");
            return (
              <>
                {"\n"}
                <Field
                  private
                  name={`cached${childName}`}
                  type={refkey(child)}
                />
              </>
            );
          })}
          {"\n\n"}
          {`/// <summary> Initializes a new instance of ${className} for mocking. </summary>`}
          {"\n"}
          <OverloadConstructor protected />
          {!isSubClient && (
            <RootClientConstructors
              client={client}
              className={className}
              apiKeyAuth={apiKeyAuth}
              oauth2Auth={oauth2Auth}
              nonApiVersionParams={nonApiVersionParams}
              apiVersionParams={apiVersionParams}
              hasApiVersions={hasApiVersions}
              optionsClassName={optionsClassName}
            />
          )}
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
          <ConvenienceMethods client={client} />
          <ProtocolMethods client={client} />
          <PagingMethods client={client} />
          <SubClientFactoryMethods children={children} />
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

/**
 * Props for the {@link RootClientConstructors} component.
 */
interface RootClientConstructorsProps {
  /** The TCGC SDK client type. */
  client: SdkClientType<SdkHttpOperation>;
  /** The resolved C# class name for the client. */
  className: string;
  /** API key auth info, if present. */
  apiKeyAuth?: ApiKeyAuthInfo;
  /** OAuth2 auth info, if present. */
  oauth2Auth?: OAuth2AuthInfo;
  /** Non-API-version method parameters that become constructor params. */
  nonApiVersionParams: SdkMethodParameter[];
  /** API version parameters assigned from options.Version. */
  apiVersionParams: SdkMethodParameter[];
  /** Whether the client has API versions (determines options class). */
  hasApiVersions: boolean;
  /** The generated options class name (e.g., "TestServiceClientOptions"). */
  optionsClassName: string;
}

/**
 * Generates constructors for a root client, with separate constructors per auth scheme.
 *
 * The legacy emitter generates one constructor per auth scheme rather than a single
 * combined constructor. For each auth scheme:
 * - The **first** auth scheme gets a secondary (convenience) constructor without options
 *   that delegates to its primary constructor with default options.
 * - Every auth scheme gets a primary constructor with its own body that validates
 *   parameters, assigns only its own auth credential field, and creates a pipeline
 *   with only its own auth policy.
 *
 * When there is no auth, a single secondary + primary pair is generated (no auth params).
 *
 * This matches the golden SampleTypeSpecClient.cs pattern where ApiKey and OAuth2
 * each have their own full constructor with independent pipeline creation.
 */
function RootClientConstructors(props: RootClientConstructorsProps) {
  const {
    client,
    className,
    apiKeyAuth,
    oauth2Auth,
    nonApiVersionParams,
    apiVersionParams,
    hasApiVersions,
    optionsClassName,
  } = props;

  // Non-API-version method params become constructor parameters
  const methodCtorParams = nonApiVersionParams.map((p) => ({
    name: p.name,
    type: getFieldTypeForParam(p),
  }));

  const endpointParam = { name: "endpoint", type: System.Uri };
  const optionsParam = hasApiVersions
    ? { name: "options", type: optionsClassName }
    : {
        name: "options",
        type: SystemClientModelPrimitives.ClientPipelineOptions,
      };

  const optionsDefault = hasApiVersions
    ? `new ${optionsClassName}()`
    : "new ClientPipelineOptions()";

  const methodDocParams = nonApiVersionParams.map(
    (p) =>
      `/// <param name="${p.name}"> ${formatDocLines(p.doc ?? p.summary ?? `The ${p.name}.`)} </param>`,
  );

  // Build per-auth-scheme descriptors. Each descriptor has the auth param,
  // its doc comment, field assignment, and pipeline creation line.
  // When there is no auth at all, we use a single descriptor with no auth param.
  interface AuthSchemeDescriptor {
    authParam?: { name: string; type: Children };
    authDoc?: string;
    fieldAssignment?: string;
    pipelineLine: Children;
  }

  const authSchemes: AuthSchemeDescriptor[] = [];

  if (apiKeyAuth) {
    authSchemes.push({
      authParam: {
        name: "credential",
        type: SystemClientModel.ApiKeyCredential,
      },
      authDoc: `/// <param name="credential"> A credential used to authenticate to the service. </param>`,
      fieldAssignment: `_keyCredential = credential;`,
      pipelineLine: buildPipelineCreateLine(client, apiKeyAuth, undefined),
    });
  }

  if (oauth2Auth) {
    authSchemes.push({
      authParam: {
        name: "tokenProvider",
        type: SystemClientModel.AuthenticationTokenProvider,
      },
      authDoc: `/// <param name="tokenProvider"> A token provider used to authenticate to the service. </param>`,
      fieldAssignment: `_tokenProvider = tokenProvider;`,
      pipelineLine: buildPipelineCreateLine(client, undefined, oauth2Auth),
    });
  }

  // If no auth schemes, generate a single pair with no auth parameters
  if (authSchemes.length === 0) {
    authSchemes.push({
      pipelineLine: buildPipelineCreateLine(client, undefined, undefined),
    });
  }

  /**
   * Renders the primary (full) constructor body for a given auth scheme.
   * Validates all parameters, assigns fields, creates pipeline, and assigns API version.
   */
  function renderPrimaryBody(scheme: AuthSchemeDescriptor): Children {
    return (
      <>
        {`Argument.AssertNotNull(endpoint, nameof(endpoint));`}
        {scheme.authParam &&
          `\nArgument.AssertNotNull(${scheme.authParam.name}, nameof(${scheme.authParam.name}));`}
        {nonApiVersionParams.map(
          (p) => `\nArgument.AssertNotNull(${p.name}, nameof(${p.name}));`,
        )}
        {"\n\n"}
        {hasApiVersions
          ? `options ??= new ${optionsClassName}();`
          : code`options ??= new ${SystemClientModelPrimitives.ClientPipelineOptions}();`}
        {"\n\n"}
        {`_endpoint = endpoint;`}
        {scheme.fieldAssignment && `\n${scheme.fieldAssignment}`}
        {nonApiVersionParams.map((p) => `\n_${p.name} = ${p.name};`)}
        {"\n"}
        {scheme.pipelineLine}
        {apiVersionParams.map((p) => `\n_${p.name} = options.Version;`)}
      </>
    );
  }

  return (
    <>
      {authSchemes.map((scheme, index) => {
        const authParams = scheme.authParam ? [scheme.authParam] : [];
        const authDocLines = scheme.authDoc ? [scheme.authDoc] : [];

        const secondaryParams = [
          endpointParam,
          ...authParams,
          ...methodCtorParams,
        ];
        const primaryParams = [...secondaryParams, optionsParam];

        const secondaryArgList = secondaryParams.map((p) => p.name).join(", ");
        const thisInitializer = `${secondaryArgList}, ${optionsDefault}`;

        // Only the first auth scheme gets a secondary (convenience) constructor
        const isFirst = index === 0;

        // Build exception doc tag listing all AssertNotNull'd parameters
        const assertableParamNames = [
          "endpoint",
          ...(scheme.authParam ? [scheme.authParam.name] : []),
          ...nonApiVersionParams.map((p) => p.name),
        ];
        const exceptionDoc = buildExceptionDoc(assertableParamNames);

        return (
          <>
            {isFirst && (
              <>
                {"\n\n"}
                {`/// <summary> Initializes a new instance of ${className}. </summary>`}
                {"\n"}
                {`/// <param name="endpoint"> Service endpoint. </param>`}
                {authDocLines.map((doc) => (
                  <>
                    {"\n"}
                    {doc}
                  </>
                ))}
                {methodDocParams.map((doc) => (
                  <>
                    {"\n"}
                    {doc}
                  </>
                ))}
                {exceptionDoc && (
                  <>
                    {"\n"}
                    {exceptionDoc}
                  </>
                )}
                {"\n"}
                <OverloadConstructor
                  public
                  parameters={secondaryParams}
                  thisInitializer={thisInitializer}
                />
              </>
            )}
            {"\n\n"}
            {`/// <summary> Initializes a new instance of ${className}. </summary>`}
            {"\n"}
            {`/// <param name="endpoint"> Service endpoint. </param>`}
            {authDocLines.map((doc) => (
              <>
                {"\n"}
                {doc}
              </>
            ))}
            {methodDocParams.map((doc) => (
              <>
                {"\n"}
                {doc}
              </>
            ))}
            {"\n"}
            {`/// <param name="options"> The options for configuring the client. </param>`}
            {exceptionDoc && (
              <>
                {"\n"}
                {exceptionDoc}
              </>
            )}
            {"\n"}
            <OverloadConstructor public parameters={primaryParams}>
              {renderPrimaryBody(scheme)}
            </OverloadConstructor>
          </>
        );
      })}
    </>
  );
}

/**
 * Builds an `<exception cref="ArgumentNullException">` XML doc tag listing the
 * given parameter names. Returns an empty string if no names are provided.
 *
 * Each parameter is wrapped in `<paramref name="..." />` and joined with " or ".
 * This matches the golden file pattern:
 * ```xml
 * /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> or <paramref name="credential"/> is null. </exception>
 * ```
 *
 * @param paramNames - Names of parameters that are validated with Argument.AssertNotNull.
 * @returns The formatted exception doc comment string, or empty string if no params.
 */
function buildExceptionDoc(paramNames: string[]): string {
  if (paramNames.length === 0) return "";
  const refs = paramNames.map((n) => `<paramref name="${n}"/>`).join(" or ");
  return `/// <exception cref="ArgumentNullException"> ${refs} is null. </exception>`;
}

/**
 * Builds the ClientPipeline.Create(...) expression for the primary constructor body.
 *
 * The pipeline is created with:
 * - The client options (for pipeline configuration)
 * - Empty per-call policies
 * - Per-retry policies containing UserAgentPolicy and an optional auth policy
 * - Empty before-transport policies
 *
 * @param client - The TCGC client type (used for typeof reference in UserAgentPolicy)
 * @param apiKeyAuth - API key auth info, if present
 * @param oauth2Auth - OAuth2 auth info, if present
 * @returns A code template rendering the complete Pipeline assignment statement
 */
function buildPipelineCreateLine(
  client: SdkClientType<SdkHttpOperation>,
  apiKeyAuth?: ApiKeyAuthInfo,
  oauth2Auth?: OAuth2AuthInfo,
): Children {
  const SCP = SystemClientModelPrimitives;
  const clientRef = refkey(client);

  const userAgent = code`new ${SCP.UserAgentPolicy}(typeof(${clientRef}).Assembly)`;

  if (apiKeyAuth) {
    return code`Pipeline = ${SCP.ClientPipeline}.Create(options, Array.Empty<${SCP.PipelinePolicy}>(), new ${SCP.PipelinePolicy}[] { ${userAgent}, ${SCP.ApiKeyAuthenticationPolicy}.CreateHeaderApiKeyPolicy(_keyCredential, AuthorizationHeader) }, Array.Empty<${SCP.PipelinePolicy}>());`;
  }

  if (oauth2Auth) {
    return code`Pipeline = ${SCP.ClientPipeline}.Create(options, Array.Empty<${SCP.PipelinePolicy}>(), new ${SCP.PipelinePolicy}[] { ${userAgent}, new ${SCP.BearerTokenPolicy}(_tokenProvider, _flows) }, Array.Empty<${SCP.PipelinePolicy}>());`;
  }

  return code`Pipeline = ${SCP.ClientPipeline}.Create(options, Array.Empty<${SCP.PipelinePolicy}>(), new ${SCP.PipelinePolicy}[] { ${userAgent} }, Array.Empty<${SCP.PipelinePolicy}>());`;
}

/**
 * Builds the `_flows` field declaration for OAuth2 authentication.
 *
 * Generates a `private readonly Dictionary<string, object>[]` field initialized
 * with one dictionary per OAuth2 flow. Each dictionary contains `GetTokenOptions`
 * property name keys mapping to scopes, authorization URL, token URL, and/or
 * refresh URL as defined by the TypeSpec OAuth2 flow model.
 *
 * This matches the legacy emitter's `BuildTokenCredentialFlowsField` pattern
 * from `ClientProvider.cs`.
 *
 * @param oauth2Auth - The extracted OAuth2 auth info with flow metadata.
 * @returns JSX children rendering the complete `_flows` field declaration.
 */
function buildFlowsFieldDeclaration(oauth2Auth: OAuth2AuthInfo): Children {
  const SCP = SystemClientModelPrimitives;
  const parts: Children[] = [];

  parts.push(
    code`private readonly Dictionary<string, object>[] _flows = new Dictionary<string, object>[] `,
  );
  parts.push("\n{\n");

  for (let fi = 0; fi < oauth2Auth.flows.length; fi++) {
    const flow = oauth2Auth.flows[fi];
    parts.push("new Dictionary<string, object>\n{\n");

    // Always add scopes entry
    const scopesList = flow.scopes.map((s) => `"${s}"`).join(", ");
    parts.push(
      code`{ ${SCP.GetTokenOptions}.ScopesPropertyName, new string[] { ${scopesList} } }`,
    );

    // Conditionally add URL entries (only when present in the flow)
    if (flow.authorizationUrl) {
      parts.push(",\n");
      parts.push(
        code`{ ${SCP.GetTokenOptions}.AuthorizationUrlPropertyName, "${flow.authorizationUrl}" }`,
      );
    }
    if (flow.tokenUrl) {
      parts.push(",\n");
      parts.push(
        code`{ ${SCP.GetTokenOptions}.TokenUrlPropertyName, "${flow.tokenUrl}" }`,
      );
    }
    if (flow.refreshUrl) {
      parts.push(",\n");
      parts.push(
        code`{ ${SCP.GetTokenOptions}.RefreshUrlPropertyName, "${flow.refreshUrl}" }`,
      );
    }

    parts.push("\n}");
    if (fi < oauth2Auth.flows.length - 1) {
      parts.push(",\n");
    }
  }

  parts.push("\n};");

  return <>{parts}</>;
}
interface SubClientFactoryMethodsProps {
  /** The child clients for which to generate factory accessor methods. */
  children: SdkClientType<SdkHttpOperation>[];
}

/**
 * Generates thread-safe lazy sub-client factory methods.
 *
 * For each child client, produces a `public virtual` method following the pattern:
 * ```csharp
 * public virtual PetOperations GetPetOperationsClient()
 * {
 *     return Volatile.Read(ref _cachedPetOperations)
 *         ?? Interlocked.CompareExchange(ref _cachedPetOperations,
 *              new PetOperations(Pipeline, _endpoint), null)
 *         ?? _cachedPetOperations;
 * }
 * ```
 *
 * The method name follows the legacy emitter's naming convention:
 * - If the child class name ends with "Client": `Get{Name}` (avoids "GetXxxClientClient")
 * - Otherwise: `Get{Name}Client`
 *
 * Thread safety is achieved via `Volatile.Read` + `Interlocked.CompareExchange`:
 * 1. `Volatile.Read` checks if the cached field is already set (fast path)
 * 2. `CompareExchange` atomically creates and caches a new instance if null
 * 3. Fall through to the cached field handles the race condition where another
 *    thread won the CompareExchange
 *
 * @see ClientProvider.BuildMethods in the legacy emitter (lines 844-927)
 */
function SubClientFactoryMethods(props: SubClientFactoryMethodsProps) {
  const namePolicy = useCSharpNamePolicy();
  const { children } = props;

  if (children.length === 0) {
    return null;
  }

  return (
    <>
      {children.map((child) => {
        const childName = namePolicy.getName(child.name, "class");
        const methodName = childName.toLowerCase().endsWith("client")
          ? `Get${childName}`
          : `Get${childName}Client`;
        const cachedFieldName = `_cached${childName}`;
        const childRef = refkey(child);

        return (
          <>
            {"\n\n"}
            {`/// <summary> Initializes a new instance of ${childName}. </summary>`}
            {"\n"}
            <Method public virtual name={methodName} returns={childRef}>
              {code`return ${SystemThreading.Volatile}.Read(ref ${cachedFieldName}) ?? ${SystemThreading.Interlocked}.CompareExchange(ref ${cachedFieldName}, new ${childRef}(Pipeline, _endpoint), null) ?? ${cachedFieldName};`}
            </Method>
          </>
        );
      })}
    </>
  );
}
