/**
 * Generates `{Resource}Resource.cs` for each detected ARM resource.
 *
 * Each resource class extends `ArmResource` and contains:
 * - Static `ResourceType` field matching the ARM resource type string
 * - `HasData` / `Data` properties with lazy-load guard
 * - Two constructors: data-based and identifier-based
 * - Static `CreateResourceIdentifier` factory method
 * - `ValidateResourceId` debug assertion
 * - CRUD instance operations (Get, Update, Delete) with diagnostic scope
 *
 * The component maps ARM resource metadata (from resource detection) to TCGC
 * service methods to generate correct operation method bodies. Types referenced
 * from Azure.ResourceManager are resolved via the azure-arm.ts library definitions.
 *
 * @module
 */

import {
  ClassDeclaration,
  Namespace,
  SourceFile,
} from "@alloy-js/csharp";
import { code, refkey } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
import type {
  SdkClientType,
  SdkHttpOperation,
  SdkModelType,
  SdkServiceMethod,
} from "@azure-tools/typespec-client-generator-core";
import { Azure, AzureCore, AzureCorePipeline } from "../../builtins/azure.js";
import {
  AzureResourceManager,
} from "../../builtins/azure-arm.js";
import { System } from "../../builtins/system.js";
import { SystemDiagnostics } from "../../builtins/system-diagnostics.js";
import { SystemThreading } from "../../builtins/system-threading.js";
import { SystemThreadingTasks } from "../../builtins/system-threading.js";
import type {
  ArmResourceSchema,
  ResourceMethod,
} from "../../utils/resource-metadata.js";
import {
  ResourceOperationKind,
  ResourceScope,
} from "../../utils/resource-metadata.js";
import { useEmitterContext } from "../../contexts/emitter-context.js";
import { getLicenseHeader } from "../../utils/header.js";
import { efCsharpRefkey } from "../../utils/refkey.js";
import { getAllClients, getSimpleClientName } from "../../utils/clients.js";
import { isVariableSegment } from "../../utils/arm-path-utils.js";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ResourceFileProps {
  /** ARM resource schema from the resource detection pipeline. */
  resource: ArmResourceSchema;
}

// ─── Well-known refkey prefix for ARM resource classes ────────────────────────

/**
 * Symbol prefix for ARM resource class refkeys.
 * Used to create deterministic refkeys that Collection and Extension
 * components can reference without access to the Resource component instance.
 */
const ARM_RESOURCE_PREFIX = Symbol.for("arm-resource");

/**
 * Creates a refkey for an ARM resource class from its model ID.
 * This enables cross-file references from Collection, Extension, and
 * Mockable components to the resource class.
 */
export function armResourceRefkey(resourceModelId: string) {
  return refkey(ARM_RESOURCE_PREFIX, resourceModelId);
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Generates the `{Resource}Resource.cs` file for a single ARM resource.
 *
 * This is the primary component for ARM resource class generation. It reads
 * the ARM resource metadata and TCGC package to produce a complete C# class
 * extending `ArmResource` with CRUD operations, constructors, and properties.
 */
export function ResourceFile(props: ResourceFileProps) {
  const { resource } = props;
  const ctx = useEmitterContext();

  const { options, packageName, sdkPackage } = ctx;
  const { metadata } = resource;

  // ── Derive names ──────────────────────────────────────────────────────────

  const resourceName = metadata.resourceName;
  const className = `${resourceName}Resource`;

  // ── Locate TCGC model ─────────────────────────────────────────────────────

  const model = findModelByDefinitionId(
    sdkPackage.models,
    resource.resourceModelId,
  );
  if (!model) {
    return null;
  }
  const modelRef = efCsharpRefkey(model.__raw!);

  // ── Build method lookup and locate rest client ────────────────────────────

  const methodLookup = buildMethodLookup(sdkPackage);
  const restClientInfo = findRestClient(
    sdkPackage,
    metadata.methods,
    methodLookup,
  );
  if (!restClientInfo) {
    return null;
  }

  const { client: restClient } = restClientInfo;
  const clientRef = refkey(restClient);
  const clientSimpleName = getSimpleClientName(restClient.name);
  const fieldPrefix =
    clientSimpleName.charAt(0).toLowerCase() + clientSimpleName.slice(1);
  const diagnosticsFieldName = `_${fieldPrefix}ClientDiagnostics`;
  const restClientFieldName = `_${fieldPrefix}RestClient`;

  // ── API version ───────────────────────────────────────────────────────────

  const apiVersion = getDefaultApiVersion(sdkPackage);

  // ── Resource identity ─────────────────────────────────────────────────────

  const resourceType = metadata.resourceType;
  const variableSegments = extractVariableSegments(metadata.resourceIdPattern);
  const idAccessors = buildIdAccessorExpressions(metadata.resourceIdPattern);

  // ── Namespace from rest client ────────────────────────────────────────────

  const ns = restClient.namespace || packageName;

  // ── Namespace suffix for ARM operation wrapper ────────────────────────────
  // The ARM operation wrapper class uses the last namespace segment as prefix
  // e.g. "Azure.Generator.MgmtTypeSpec.Tests" → "TestsArmOperation"

  const nsParts = ns.split(".");
  const nsLastSegment = nsParts[nsParts.length - 1];
  const armOperationName = `${nsLastSegment}ArmOperation`;

  // ── Parent scope type for XML doc ─────────────────────────────────────────

  const parentScopeDesc = getParentScopeDescription(metadata.resourceScope);

  // ── Operation ID prefix (rest client name) ────────────────────────────────

  const operationIdPrefix = clientSimpleName;

  // ── License header ────────────────────────────────────────────────────────

  const header = getLicenseHeader(options);

  // ── Resource refkey for self-references ────────────────────────────────────

  const resourceRefkey = armResourceRefkey(resource.resourceModelId);

  // ── Build class body blocks ───────────────────────────────────────────────

  const fieldsBlock = buildFields(
    diagnosticsFieldName,
    restClientFieldName,
    clientRef,
    modelRef,
  );

  const resourceTypeField = buildResourceTypeField(resourceType);

  const constructorsBlock = buildConstructors(
    className,
    modelRef,
    diagnosticsFieldName,
    restClientFieldName,
    clientRef,
    ns,
    apiVersion,
    fieldPrefix,
  );

  const propertiesBlock = buildProperties(className, modelRef);

  const createResourceIdentifier = buildCreateResourceIdentifier(
    variableSegments,
    metadata.resourceIdPattern,
  );

  const validateResourceId = buildValidateResourceId(className);

  // ── Collect instance operations (exclude List, which goes on Collection) ──

  const instanceMethods = metadata.methods.filter(
    (m) =>
      m.kind !== ResourceOperationKind.List &&
      m.kind !== ResourceOperationKind.Create,
  );

  const operationsBlock = instanceMethods.map((method) => {
    const tcgcMethod = methodLookup.get(method.methodId);
    if (!tcgcMethod) return null;

    return buildOperation(
      method,
      tcgcMethod,
      className,
      resourceName,
      modelRef,
      diagnosticsFieldName,
      restClientFieldName,
      operationIdPrefix,
      idAccessors,
      apiVersion,
      armOperationName,
      metadata.resourceIdPattern,
    );
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SourceFile path={`src/Generated/${className}.cs`}>
      {header}
      <Namespace name={ns}>
        {buildClassXmlDoc(
          resourceName,
          className,
          parentScopeDesc,
          clientSimpleName,
        )}
        <ClassDeclaration
          public
          partial
          name={className}
          refkey={resourceRefkey}
          baseType={AzureResourceManager.ArmResource}
        >
          {fieldsBlock}
          {resourceTypeField}
          {constructorsBlock}
          {propertiesBlock}
          {createResourceIdentifier}
          {validateResourceId}
          {operationsBlock}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

// ─── Helper: Find TCGC model by crossLanguageDefinitionId ────────────────────

/**
 * Searches the TCGC model list for a model matching the given definition ID.
 */
export function findModelByDefinitionId(
  models: readonly SdkModelType[],
  definitionId: string,
): SdkModelType | undefined {
  return models.find((m) => m.crossLanguageDefinitionId === definitionId);
}

// ─── Helper: Build method lookup map ─────────────────────────────────────────

/**
 * Builds a map from crossLanguageDefinitionId to SdkServiceMethod,
 * scanning ALL clients and ALL method kinds (basic, lro, paging, lropaging).
 */
export function buildMethodLookup(sdkPackage: {
  clients: readonly SdkClientType<SdkHttpOperation>[];
}): Map<string, SdkServiceMethod<SdkHttpOperation>> {
  const map = new Map<string, SdkServiceMethod<SdkHttpOperation>>();
  const allClients = getAllClients(
    sdkPackage.clients as SdkClientType<SdkHttpOperation>[],
  );
  for (const client of allClients) {
    for (const method of client.methods) {
      if ("crossLanguageDefinitionId" in method) {
        map.set(
          method.crossLanguageDefinitionId,
          method as SdkServiceMethod<SdkHttpOperation>,
        );
      }
    }
  }
  return map;
}

// ─── Helper: Find the rest client for a resource ─────────────────────────────

/**
 * Finds the TCGC client that contains methods matching the ARM resource methods.
 * Returns the client and a map of matched methods.
 */
export function findRestClient(
  sdkPackage: { clients: readonly SdkClientType<SdkHttpOperation>[] },
  resourceMethods: readonly ResourceMethod[],
  methodLookup: Map<string, SdkServiceMethod<SdkHttpOperation>>,
): { client: SdkClientType<SdkHttpOperation> } | undefined {
  const allClients = getAllClients(
    sdkPackage.clients as SdkClientType<SdkHttpOperation>[],
  );

  // Find the first resource method's TCGC method, then find its client
  for (const rm of resourceMethods) {
    const tcgcMethod = methodLookup.get(rm.methodId);
    if (!tcgcMethod) continue;

    for (const client of allClients) {
      const hasMethod = client.methods.some(
        (m) =>
          "crossLanguageDefinitionId" in m &&
          m.crossLanguageDefinitionId === rm.methodId,
      );
      if (hasMethod) {
        return { client };
      }
    }
  }
  return undefined;
}

// ─── Helper: Get default API version ─────────────────────────────────────────

/**
 * Extracts the default API version from the TCGC package.
 * Falls back to "unknown" if no API version is found.
 */
export function getDefaultApiVersion(sdkPackage: {
  clients: readonly SdkClientType<SdkHttpOperation>[];
}): string {
  for (const client of sdkPackage.clients) {
    if (client.apiVersions?.length) {
      return client.apiVersions[client.apiVersions.length - 1];
    }
  }
  return "unknown";
}

// ─── Helper: Extract variable segments from resource ID pattern ──────────────

/**
 * Extracts variable segment names from the resource ID pattern.
 *
 * Example: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Foo/bars/{barName}"
 *   → ["subscriptionId", "rg", "barName"]
 */
export function extractVariableSegments(pattern: string): string[] {
  return pattern
    .split("/")
    .filter(isVariableSegment)
    .map((s) => s.replace(/[{}]/g, ""));
}

// ─── Helper: Build ID accessor expressions for request parameters ────────────

/**
 * Maps variable segments in the resource ID pattern to expressions that
 * extract the values from the `Id` property of `ArmResource`.
 *
 * Returns an array of C# expressions in the same order as the variable segments.
 */
export function buildIdAccessorExpressions(pattern: string): string[] {
  const segments = pattern.split("/").filter(Boolean);
  const variables = segments.filter(isVariableSegment);

  return variables.map((seg, index) => {
    const name = seg.replace(/[{}]/g, "");

    if (name === "subscriptionId" || name.toLowerCase() === "subscriptionid") {
      return "Guid.Parse(Id.SubscriptionId)";
    }
    if (
      name === "resourceGroupName" ||
      name.toLowerCase() === "resourcegroupname"
    ) {
      return "Id.ResourceGroupName";
    }

    // Last variable is the resource name
    if (index === variables.length - 1) {
      return "Id.Name";
    }

    // For child resources, traverse up via Id.Parent
    // Distance from end: variables.length - 1 - index
    const depth = variables.length - 1 - index;
    let accessor = "Id";
    for (let i = 0; i < depth; i++) {
      accessor += ".Parent";
    }
    return `${accessor}.Name`;
  });
}

// ─── Helper: Parent scope description for XML doc ────────────────────────────

/**
 * Returns the parent scope type name and collection method name
 * for use in the class XML doc comment.
 */
function getParentScopeDescription(scope: ResourceScope): {
  typeName: string;
  methodPrefix: string;
} {
  switch (scope) {
    case ResourceScope.ResourceGroup:
      return { typeName: "ResourceGroupResource", methodPrefix: "Get" };
    case ResourceScope.Subscription:
      return { typeName: "SubscriptionResource", methodPrefix: "Get" };
    case ResourceScope.Tenant:
      return { typeName: "TenantResource", methodPrefix: "Get" };
    case ResourceScope.Extension:
      return { typeName: "ArmResource", methodPrefix: "Get" };
    default:
      return { typeName: "ArmResource", methodPrefix: "Get" };
  }
}

// ─── Helper: Class XML doc ───────────────────────────────────────────────────

/**
 * Builds the XML doc comment for the resource class.
 */
function buildClassXmlDoc(
  resourceName: string,
  className: string,
  parentScope: { typeName: string; methodPrefix: string },
  clientSimpleName: string,
): Children {
  const collectionMethodName = `${parentScope.methodPrefix}${clientSimpleName}`;
  return code`/// <summary>
/// A class representing a ${resourceName} along with the instance operations that can be performed on it.
/// If you have a <see cref="ResourceIdentifier"/> you can construct a <see cref="${className}"/> from an instance of <see cref="ArmClient"/> using the GetResource method.
/// Otherwise you can get one from its parent resource <see cref="${parentScope.typeName}"/> using the ${collectionMethodName} method.
/// </summary>
`;
}

// ─── Helper: Build fields ────────────────────────────────────────────────────

function buildFields(
  diagnosticsFieldName: string,
  restClientFieldName: string,
  clientRef: Children,
  modelRef: Children,
): Children {
  return code`
private readonly ${AzureCorePipeline.ClientDiagnostics} ${diagnosticsFieldName};
private readonly ${clientRef} ${restClientFieldName};
private readonly ${modelRef} _data;`;
}

// ─── Helper: Build ResourceType field ────────────────────────────────────────

function buildResourceTypeField(resourceType: string): Children {
  return code`
/// <summary> Gets the resource type for the operations. </summary>
public static readonly ${AzureResourceManager.ResourceType} ResourceType = "${resourceType}";`;
}

// ─── Helper: Build constructors ──────────────────────────────────────────────

function buildConstructors(
  className: string,
  modelRef: Children,
  diagnosticsFieldName: string,
  restClientFieldName: string,
  clientRef: Children,
  namespace: string,
  apiVersion: string,
  fieldPrefix: string,
): Children {
  const apiVersionVar = `${fieldPrefix.charAt(0).toLowerCase()}${fieldPrefix.slice(1)}ApiVersion`;

  return code`

/// <summary> Initializes a new instance of ${className} for mocking. </summary>
protected ${className}()
{
}

/// <summary> Initializes a new instance of <see cref="${className}"/> class. </summary>
/// <param name="client"> The client parameters to use in these operations. </param>
/// <param name="data"> The resource that is the target of operations. </param>
internal ${className}(${AzureResourceManager.ArmClient} client, ${modelRef} data) : this(client, data.Id)
{
    HasData = true;
    _data = data;
}

/// <summary> Initializes a new instance of <see cref="${className}"/> class. </summary>
/// <param name="client"> The client parameters to use in these operations. </param>
/// <param name="id"> The identifier of the resource that is the target of operations. </param>
internal ${className}(${AzureResourceManager.ArmClient} client, ${AzureCore.ResourceIdentifier} id) : base(client, id)
{
    TryGetApiVersion(ResourceType, out string ${apiVersionVar});
    ${diagnosticsFieldName} = new ${AzureCorePipeline.ClientDiagnostics}("${namespace}", ResourceType.Namespace, Diagnostics);
    ${restClientFieldName} = new ${clientRef}(${diagnosticsFieldName}, Pipeline, Endpoint, ${apiVersionVar} ?? "${apiVersion}");
    ValidateResourceId(id);
}`;
}

// ─── Helper: Build properties ────────────────────────────────────────────────

function buildProperties(className: string, modelRef: Children): Children {
  return code`

/// <summary> Gets whether or not the current instance has data. </summary>
public virtual bool HasData { get; }

/// <summary> Gets the data representing this Feature. </summary>
public virtual ${modelRef} Data
{
    get
    {
        if (!HasData)
        {
            throw new ${System.InvalidOperationException}("The current instance does not have data, you must call Get first.");
        }
        return _data;
    }
}`;
}

// ─── Helper: Build CreateResourceIdentifier ──────────────────────────────────

function buildCreateResourceIdentifier(
  variableSegments: string[],
  resourceIdPattern: string,
): Children {
  const params = variableSegments.map((name) => `string ${name}`).join(", ");

  // Build param doc comments
  const paramDocs = variableSegments
    .map((name) => `/// <param name="${name}"> The ${name}. </param>`)
    .join("\n");

  // Build interpolated string for the resource ID
  const interpolatedId = resourceIdPattern.replace(
    /\{([^}]+)\}/g,
    (_, name) => `{${name}}`,
  );

  return code`

/// <summary> Generate the resource identifier for this resource. </summary>
${paramDocs}
public static ${AzureCore.ResourceIdentifier} CreateResourceIdentifier(${params})
{
    string resourceId = $"${interpolatedId}";
    return new ${AzureCore.ResourceIdentifier}(resourceId);
}`;
}

// ─── Helper: Build ValidateResourceId ────────────────────────────────────────

function buildValidateResourceId(_className: string): Children {
  return code`

/// <param name="id"></param>
[${SystemDiagnostics.ConditionalAttribute}("DEBUG")]
internal static void ValidateResourceId(${AzureCore.ResourceIdentifier} id)
{
    if (id.ResourceType != ResourceType)
    {
        throw new ${System.ArgumentException}(string.Format("Invalid resource type {0} expected {1}", id.ResourceType, ResourceType), id);
    }
}`;
}

// ─── Helper: Build operation XML doc ─────────────────────────────────────────

function buildOperationXmlDoc(
  summary: string,
  requestPath: string,
  operationId: string,
  apiVersion: string,
  className: string,
): string {
  return `/// <summary>
/// ${summary}
/// <list type="bullet">
/// <item>
/// <term> Request Path. </term>
/// <description> ${requestPath}. </description>
/// </item>
/// <item>
/// <term> Operation Id. </term>
/// <description> ${operationId}. </description>
/// </item>
/// <item>
/// <term> Default Api Version. </term>
/// <description> ${apiVersion}. </description>
/// </item>
/// <item>
/// <term> Resource. </term>
/// <description> <see cref="${className}"/>. </description>
/// </item>
/// </list>
/// </summary>`;
}

// ─── Helper: Build a single CRUD operation (async + sync pair) ───────────────

/**
 * Generates async and sync method pairs for a single ARM resource operation.
 *
 * The generated methods follow the ARM SDK pattern:
 * - Diagnostic scope wrapping for distributed tracing
 * - RequestContext with CancellationToken
 * - Rest client request creation via Create*Request methods
 * - Pipeline.ProcessMessage[Async] for HTTP execution
 * - LRO wrapping for Create/Update/Delete operations
 */
function buildOperation(
  resourceMethod: ResourceMethod,
  tcgcMethod: SdkServiceMethod<SdkHttpOperation>,
  className: string,
  resourceName: string,
  modelRef: Children,
  diagnosticsFieldName: string,
  restClientFieldName: string,
  operationIdPrefix: string,
  idAccessors: string[],
  apiVersion: string,
  armOperationName: string,
  _resourceIdPattern: string,
): Children {
  const methodName = getOperationMethodName(tcgcMethod.name);
  const operationId = `${operationIdPrefix}_${methodName}`;
  const scopeName = `${className}.${methodName}`;
  const requestPath = resourceMethod.operationPath;
  const summary = tcgcMethod.doc ?? `${methodName} a ${resourceName}`;

  const isLro = tcgcMethod.kind === "lro";
  const isDelete = resourceMethod.kind === ResourceOperationKind.Delete;
  const isUpdate = resourceMethod.kind === ResourceOperationKind.Update;
  const hasBody =
    isUpdate || resourceMethod.kind === ResourceOperationKind.Create;

  // Build request parameters (from Id accessors + optional body + context)
  const requestArgs = idAccessors.join(", ");

  const xmlDoc = buildOperationXmlDoc(
    summary,
    requestPath,
    operationId,
    apiVersion,
    className,
  );

  if (isLro) {
    return buildLroOperation(
      xmlDoc,
      methodName,
      className,
      modelRef,
      diagnosticsFieldName,
      restClientFieldName,
      scopeName,
      requestArgs,
      isDelete,
      hasBody,
      armOperationName,
      resourceName,
    );
  }

  // Standard (non-LRO) operation: Get
  return buildStandardOperation(
    xmlDoc,
    methodName,
    className,
    modelRef,
    diagnosticsFieldName,
    restClientFieldName,
    scopeName,
    requestArgs,
  );
}

// ─── Helper: Build standard (non-LRO) operation ─────────────────────────────

function buildStandardOperation(
  xmlDoc: string,
  methodName: string,
  className: string,
  modelRef: Children,
  diagnosticsFieldName: string,
  restClientFieldName: string,
  scopeName: string,
  requestArgs: string,
): Children {
  const createRequestMethod = `Create${methodName}Request`;

  // Async variant
  const asyncMethod = code`

${xmlDoc}
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual async ${SystemThreadingTasks.Task}<${Azure.Response}<${className}>> ${methodName}Async(${SystemThreading.CancellationToken} cancellationToken = default)
{
    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${scopeName}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${requestArgs}, context);
        ${Azure.Response} result = await Pipeline.ProcessMessageAsync(message, context).ConfigureAwait(false);
        ${Azure.Response}<${modelRef}> response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
        if (response.Value == null)
        {
            throw new ${Azure.RequestFailedException}(response.GetRawResponse());
        }
        return ${Azure.Response}.FromValue(new ${className}(Client, response.Value), response.GetRawResponse());
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  // Sync variant
  const syncMethod = code`

${xmlDoc}
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual ${Azure.Response}<${className}> ${methodName}(${SystemThreading.CancellationToken} cancellationToken = default)
{
    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${scopeName}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${requestArgs}, context);
        ${Azure.Response} result = Pipeline.ProcessMessage(message, context);
        ${Azure.Response}<${modelRef}> response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
        if (response.Value == null)
        {
            throw new ${Azure.RequestFailedException}(response.GetRawResponse());
        }
        return ${Azure.Response}.FromValue(new ${className}(Client, response.Value), response.GetRawResponse());
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  return code`${asyncMethod}${syncMethod}`;
}

// ─── Helper: Build LRO operation ─────────────────────────────────────────────

function buildLroOperation(
  xmlDoc: string,
  methodName: string,
  className: string,
  modelRef: Children,
  diagnosticsFieldName: string,
  restClientFieldName: string,
  scopeName: string,
  requestArgs: string,
  isDelete: boolean,
  hasBody: boolean,
  armOperationName: string,
  resourceName: string,
): Children {
  const createRequestMethod = `Create${methodName}Request`;
  const operationSourceName = `${resourceName}OperationSource`;

  // Determine return types
  const returnType = isDelete
    ? AzureResourceManager.ArmOperation
    : code`${AzureResourceManager.ArmOperation}<${className}>`;
  const asyncReturnType = isDelete
    ? code`${SystemThreadingTasks.Task}<${AzureResourceManager.ArmOperation}>`
    : code`${SystemThreadingTasks.Task}<${AzureResourceManager.ArmOperation}<${className}>>`;

  // Body parameter handling
  const bodyParamDecl = hasBody ? code`, ${modelRef} data` : code``;
  const bodyParamDoc = hasBody
    ? `\n/// <param name="data"> The resource properties to be updated. </param>`
    : "";
  const bodyParamAssertion = hasBody
    ? code`\n    ${AzureCore.Argument}.AssertNotNull(data, nameof(data));`
    : code``;
  const bodyParamException = hasBody
    ? `\n/// <exception cref="ArgumentNullException"> <paramref name="data"/> is null. </exception>`
    : "";
  const bodyArg = hasBody ? `, ${modelRef}.ToRequestContent(data)` : "";

  // LRO operation construction
  const waitUntilDoc = `/// <param name="waitUntil"> <see cref="WaitUntil.Completed"/> if the method should wait to return until the long-running operation has completed on the service; <see cref="WaitUntil.Started"/> if it should return after starting the operation. For more information on long-running operations, please see <see href="https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/core/Azure.Core/samples/LongRunningOperations.md"> Azure.Core Long-Running Operation samples</see>. </param>`;

  // Operation construction differs for typed vs void
  const operationConstruction = isDelete
    ? code`${armOperationName} operation = new ${armOperationName}(${diagnosticsFieldName}, Pipeline, message.Request, response, ${AzureCore.OperationFinalStateVia}.Location);`
    : code`${armOperationName}<${className}> operation = new ${armOperationName}<${className}>(
                    new ${operationSourceName}(Client),
                    ${diagnosticsFieldName},
                    Pipeline,
                    message.Request,
                    response,
                    ${AzureCore.OperationFinalStateVia}.Location);`;

  const waitForCompletion = isDelete
    ? "await operation.WaitForCompletionResponseAsync(cancellationToken).ConfigureAwait(false);"
    : "await operation.WaitForCompletionAsync(cancellationToken).ConfigureAwait(false);";

  const syncWaitForCompletion = isDelete
    ? "operation.WaitForCompletionResponse(cancellationToken);"
    : "operation.WaitForCompletion(cancellationToken);";

  // Async variant
  const asyncMethod = code`

${xmlDoc}
${waitUntilDoc}${bodyParamDoc}
/// <param name="cancellationToken"> The cancellation token to use. </param>${bodyParamException}
public virtual async ${asyncReturnType} ${methodName}Async(${Azure.WaitUntil} waitUntil${bodyParamDecl}, ${SystemThreading.CancellationToken} cancellationToken = default)
{${bodyParamAssertion}

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${scopeName}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${requestArgs}${bodyArg}, context);
        ${Azure.Response} response = await Pipeline.ProcessMessageAsync(message, context).ConfigureAwait(false);
        ${operationConstruction}
        if (waitUntil == ${Azure.WaitUntil}.Completed)
        {
            ${waitForCompletion}
        }
        return operation;
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  // Sync variant
  const syncOperationConstruction = isDelete
    ? code`${armOperationName} operation = new ${armOperationName}(${diagnosticsFieldName}, Pipeline, message.Request, response, ${AzureCore.OperationFinalStateVia}.Location);`
    : code`${armOperationName}<${className}> operation = new ${armOperationName}<${className}>(
                    new ${operationSourceName}(Client),
                    ${diagnosticsFieldName},
                    Pipeline,
                    message.Request,
                    response,
                    ${AzureCore.OperationFinalStateVia}.Location);`;

  const syncMethod = code`

${xmlDoc}
${waitUntilDoc}${bodyParamDoc}
/// <param name="cancellationToken"> The cancellation token to use. </param>${bodyParamException}
public virtual ${returnType} ${methodName}(${Azure.WaitUntil} waitUntil${bodyParamDecl}, ${SystemThreading.CancellationToken} cancellationToken = default)
{${bodyParamAssertion}

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${scopeName}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${requestArgs}${bodyArg}, context);
        ${Azure.Response} response = Pipeline.ProcessMessage(message, context);
        ${syncOperationConstruction}
        if (waitUntil == ${Azure.WaitUntil}.Completed)
        {
            ${syncWaitForCompletion}
        }
        return operation;
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  return code`${asyncMethod}${syncMethod}`;
}

// ─── Helper: Convert TCGC method name to PascalCase operation name ───────────

/**
 * Converts a TCGC method name (camelCase) to a PascalCase C# method name.
 */
export function getOperationMethodName(tcgcName: string): string {
  if (!tcgcName) return "Unknown";
  return tcgcName.charAt(0).toUpperCase() + tcgcName.slice(1);
}
