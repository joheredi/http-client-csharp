/**
 * Generates `{Resource}Collection.cs` for each detected ARM resource.
 *
 * Each collection class extends `ArmCollection` and contains:
 * - CreateOrUpdate with LRO support (WaitUntil, ArmOperation<Resource>)
 * - Get by resource name
 * - GetAll with paging (AsyncPageable/Pageable via PageableWrapper)
 * - Exists (bool check via Pipeline.Send with 200/404 switch)
 * - GetIfExists (NullableResponse via Pipeline.Send with 200/404 switch)
 * - IEnumerable<Resource> and IAsyncEnumerable<Resource> implementations
 * - Diagnostic scoping for all operations except GetAll
 *
 * The component maps ARM resource metadata (from resource detection) to TCGC
 * service methods to generate correct operation method bodies. Types referenced
 * from Azure.ResourceManager are resolved via the azure-arm.ts library definitions.
 *
 * @module
 */

import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code, refkey } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
import type {
  SdkHttpOperation,
  SdkServiceMethod,
} from "@azure-tools/typespec-client-generator-core";
import { Azure, AzureCore, AzureCorePipeline } from "../../builtins/azure.js";
import {
  AzureResourceManager,
  AzureResourceManagerResources,
} from "../../builtins/azure-arm.js";
import { System } from "../../builtins/system.js";
import { SystemDiagnostics } from "../../builtins/system-diagnostics.js";
import { SystemThreading } from "../../builtins/system-threading.js";
import { SystemThreadingTasks } from "../../builtins/system-threading.js";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
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
import { getSimpleClientName } from "../../utils/clients.js";
import {
  armResourceRefkey,
  findModelByDefinitionId,
  buildMethodLookup,
  findRestClient,
  getDefaultApiVersion,
  extractVariableSegments,
  buildIdAccessorExpressions,
  getOperationMethodName,
} from "./ResourceFile.js";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface CollectionFileProps {
  /** ARM resource schema from the resource detection pipeline. */
  resource: ArmResourceSchema;
}

// ─── Well-known refkey prefix for ARM collection classes ─────────────────────

/**
 * Symbol prefix for ARM collection class refkeys.
 * Used to create deterministic refkeys that Extension and Mockable
 * components can reference without access to the Collection component instance.
 */
const ARM_COLLECTION_PREFIX = Symbol.for("arm-collection");

/**
 * Creates a refkey for an ARM collection class from its model ID.
 * This enables cross-file references from Extension and Mockable
 * components to the collection class.
 */
export function armCollectionRefkey(resourceModelId: string) {
  return refkey(ARM_COLLECTION_PREFIX, resourceModelId);
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Generates the `{Resource}Collection.cs` file for a single ARM resource.
 *
 * This is the primary component for ARM collection class generation. It reads
 * the ARM resource metadata and TCGC package to produce a complete C# class
 * extending `ArmCollection` with CRUD, list, exists, and enumerator operations.
 */
export function CollectionFile(props: CollectionFileProps) {
  const { resource } = props;
  const ctx = useEmitterContext();

  const { options, packageName, sdkPackage } = ctx;
  const { metadata } = resource;

  // ── Derive names ──────────────────────────────────────────────────────────

  const resourceName = metadata.resourceName;
  const collectionClassName = `${resourceName}Collection`;
  const resourceClassName = `${resourceName}Resource`;

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

  const variableSegments = extractVariableSegments(metadata.resourceIdPattern);
  const allIdAccessors = buildIdAccessorExpressions(metadata.resourceIdPattern);

  // Parent scope accessors (all except last, which is the resource name param)
  const parentIdAccessors = allIdAccessors.slice(0, -1);
  const resourceNameParam = variableSegments[variableSegments.length - 1];

  // ── Namespace from rest client ────────────────────────────────────────────

  const ns = restClient.namespace || packageName;

  // ── Namespace suffix for ARM operation wrapper ────────────────────────────

  const nsParts = ns.split(".");
  const nsLastSegment = nsParts[nsParts.length - 1];
  const armOperationName = `${nsLastSegment}ArmOperation`;

  // ── Parent scope type ─────────────────────────────────────────────────────

  const parentScopeTypeRef = getParentScopeTypeRef(metadata.resourceScope);
  const parentScopeDesc = getParentScopeDescription(metadata.resourceScope);

  // ── Operation ID prefix (rest client name) ────────────────────────────────

  const operationIdPrefix = clientSimpleName;

  // ── License header ────────────────────────────────────────────────────────

  const header = getLicenseHeader(options);

  // ── Refkeys ───────────────────────────────────────────────────────────────

  const collectionRefkey = armCollectionRefkey(resource.resourceModelId);
  const resourceClassRef = armResourceRefkey(resource.resourceModelId);

  // ── API version variable ──────────────────────────────────────────────────
  // Derive from resource name (e.g., "Baz" → "bazApiVersion") to match
  // the legacy emitter's naming convention.

  const apiVersionVar = `${resourceName.charAt(0).toLowerCase()}${resourceName.slice(1)}ApiVersion`;

  // ── Locate specific methods from resource metadata ────────────────────────

  const createMethod = metadata.methods.find(
    (m) => m.kind === ResourceOperationKind.Create,
  );
  const readMethod = metadata.methods.find(
    (m) => m.kind === ResourceOperationKind.Read,
  );
  const listMethod = metadata.methods.find(
    (m) => m.kind === ResourceOperationKind.List,
  );

  // ── Build request args strings ────────────────────────────────────────────

  const parentRequestArgs = parentIdAccessors.join(", ");
  const instanceRequestArgs = [...parentIdAccessors, resourceNameParam].join(
    ", ",
  );

  // ── Build class body blocks ───────────────────────────────────────────────

  const fieldsBlock = buildCollectionFields(
    diagnosticsFieldName,
    restClientFieldName,
    clientRef,
  );

  const constructorsBlock = buildCollectionConstructors(
    collectionClassName,
    resourceClassRef,
    diagnosticsFieldName,
    restClientFieldName,
    clientRef,
    ns,
    apiVersion,
    apiVersionVar,
    parentScopeTypeRef,
  );

  const validateBlock = parentScopeTypeRef
    ? buildCollectionValidateResourceId(parentScopeTypeRef)
    : null;

  // ── Build operation blocks ────────────────────────────────────────────────

  let createOrUpdateBlock: Children = null;
  if (createMethod) {
    const tcgcMethod = methodLookup.get(createMethod.methodId);
    if (tcgcMethod) {
      createOrUpdateBlock = buildCollectionCreateOrUpdate(
        createMethod,
        tcgcMethod,
        collectionClassName,
        resourceClassName,
        resourceName,
        modelRef,
        diagnosticsFieldName,
        restClientFieldName,
        operationIdPrefix,
        instanceRequestArgs,
        apiVersion,
        armOperationName,
        resourceNameParam,
      );
    }
  }

  let getBlock: Children = null;
  if (readMethod) {
    const tcgcMethod = methodLookup.get(readMethod.methodId);
    if (tcgcMethod) {
      getBlock = buildCollectionGet(
        readMethod,
        tcgcMethod,
        collectionClassName,
        resourceClassName,
        modelRef,
        diagnosticsFieldName,
        restClientFieldName,
        operationIdPrefix,
        instanceRequestArgs,
        apiVersion,
        resourceNameParam,
        resourceName,
      );
    }
  }

  let getAllBlock: Children = null;
  if (listMethod) {
    const tcgcMethod = methodLookup.get(listMethod.methodId);
    if (tcgcMethod) {
      getAllBlock = buildCollectionGetAll(
        listMethod,
        tcgcMethod,
        collectionClassName,
        resourceClassName,
        modelRef,
        clientSimpleName,
        restClientFieldName,
        operationIdPrefix,
        parentRequestArgs,
        apiVersion,
      );
    }
  }

  let existsBlock: Children = null;
  if (readMethod) {
    const tcgcMethod = methodLookup.get(readMethod.methodId);
    if (tcgcMethod) {
      existsBlock = buildCollectionExists(
        readMethod,
        collectionClassName,
        modelRef,
        diagnosticsFieldName,
        restClientFieldName,
        operationIdPrefix,
        instanceRequestArgs,
        apiVersion,
        resourceNameParam,
        resourceName,
      );
    }
  }

  let getIfExistsBlock: Children = null;
  if (readMethod) {
    const tcgcMethod = methodLookup.get(readMethod.methodId);
    if (tcgcMethod) {
      getIfExistsBlock = buildCollectionGetIfExists(
        readMethod,
        collectionClassName,
        resourceClassName,
        modelRef,
        diagnosticsFieldName,
        restClientFieldName,
        operationIdPrefix,
        instanceRequestArgs,
        apiVersion,
        resourceNameParam,
        resourceName,
      );
    }
  }

  const enumeratorsBlock = buildCollectionEnumerators(resourceClassName);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SourceFile
      path={`src/Generated/${collectionClassName}.cs`}
      using={["System.Collections"]}
    >
      {header}
      <Namespace name={ns}>
        {buildCollectionClassXmlDoc(
          resourceName,
          resourceClassName,
          collectionClassName,
          parentScopeDesc,
          clientSimpleName,
        )}
        <ClassDeclaration
          public
          partial
          name={collectionClassName}
          refkey={collectionRefkey}
          baseType={AzureResourceManager.ArmCollection}
          interfaceTypes={[
            code`${SystemCollectionsGeneric.IEnumerable}<${resourceClassRef}>`,
            code`${SystemCollectionsGeneric.IAsyncEnumerable}<${resourceClassRef}>`,
          ]}
        >
          {fieldsBlock}
          {constructorsBlock}
          {validateBlock}
          {createOrUpdateBlock}
          {getBlock}
          {getAllBlock}
          {existsBlock}
          {getIfExistsBlock}
          {enumeratorsBlock}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

// ─── Helper: Parent scope type reference ─────────────────────────────────────

/**
 * Returns the Alloy library reference for the parent scope type
 * based on the resource's deployment scope.
 * Extension resources don't validate parent ID, so return undefined.
 */
function getParentScopeTypeRef(scope: ResourceScope): Children | undefined {
  switch (scope) {
    case ResourceScope.ResourceGroup:
      return AzureResourceManagerResources.ResourceGroupResource;
    case ResourceScope.Subscription:
      return AzureResourceManagerResources.SubscriptionResource;
    case ResourceScope.Tenant:
      return AzureResourceManagerResources.TenantResource;
    default:
      return undefined;
  }
}

// ─── Helper: Parent scope description for XML doc ────────────────────────────

/**
 * Returns the parent scope type name and collection method name
 * for use in the collection class XML doc comment.
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
 * Builds the XML doc comment for the collection class, describing
 * its purpose, parent scope, and how to obtain an instance.
 */
function buildCollectionClassXmlDoc(
  resourceName: string,
  resourceClassName: string,
  collectionClassName: string,
  parentScope: { typeName: string; methodPrefix: string },
  clientSimpleName: string,
): Children {
  const collectionMethodName = `${parentScope.methodPrefix}${clientSimpleName}`;
  return code`/// <summary>
/// A class representing a collection of <see cref="${resourceClassName}"/> and their operations.
/// Each <see cref="${resourceClassName}"/> in the collection will belong to the same instance of <see cref="${parentScope.typeName}"/>.
/// To get a <see cref="${collectionClassName}"/> instance call the ${collectionMethodName} method from an instance of <see cref="${parentScope.typeName}"/>.
/// </summary>
`;
}

// ─── Helper: Build fields ────────────────────────────────────────────────────

/**
 * Generates the private readonly fields for diagnostics and REST client.
 */
function buildCollectionFields(
  diagnosticsFieldName: string,
  restClientFieldName: string,
  clientRef: Children,
): Children {
  return code`
private readonly ${AzureCorePipeline.ClientDiagnostics} ${diagnosticsFieldName};
private readonly ${clientRef} ${restClientFieldName};`;
}

// ─── Helper: Build constructors ──────────────────────────────────────────────

/**
 * Generates the mock (protected) and main (internal) constructors.
 * The main constructor initializes diagnostics, REST client, and validates
 * the parent resource ID.
 */
function buildCollectionConstructors(
  className: string,
  resourceClassRef: Children,
  diagnosticsFieldName: string,
  restClientFieldName: string,
  clientRef: Children,
  namespace: string,
  apiVersion: string,
  apiVersionVar: string,
  parentScopeTypeRef: Children | undefined,
): Children {
  const validateCall = parentScopeTypeRef
    ? `\n    ValidateResourceId(id);`
    : "";

  return code`

/// <summary> Initializes a new instance of ${className} for mocking. </summary>
protected ${className}()
{
}

/// <summary> Initializes a new instance of <see cref="${className}"/> class. </summary>
/// <param name="client"> The client parameters to use in these operations. </param>
/// <param name="id"> The identifier of the resource that is the target of operations. </param>
internal ${className}(${AzureResourceManager.ArmClient} client, ${AzureCore.ResourceIdentifier} id) : base(client, id)
{
    TryGetApiVersion(${resourceClassRef}.ResourceType, out string ${apiVersionVar});
    ${diagnosticsFieldName} = new ${AzureCorePipeline.ClientDiagnostics}("${namespace}", ${resourceClassRef}.ResourceType.Namespace, Diagnostics);
    ${restClientFieldName} = new ${clientRef}(${diagnosticsFieldName}, Pipeline, Endpoint, ${apiVersionVar} ?? "${apiVersion}");${validateCall}
}`;
}

// ─── Helper: Build ValidateResourceId ────────────────────────────────────────

/**
 * Generates the debug-only ValidateResourceId method that checks the
 * parent resource identifier matches the expected parent scope type.
 */
function buildCollectionValidateResourceId(
  parentScopeTypeRef: Children,
): Children {
  return code`

/// <param name="id"></param>
[${SystemDiagnostics.ConditionalAttribute}("DEBUG")]
internal static void ValidateResourceId(${AzureCore.ResourceIdentifier} id)
{
    if (id.ResourceType != ${parentScopeTypeRef}.ResourceType)
    {
        throw new ${System.ArgumentException}(string.Format("Invalid resource type {0} expected {1}", id.ResourceType, ${parentScopeTypeRef}.ResourceType), id);
    }
}`;
}

// ─── Helper: Build operation XML doc (3-item: path, id, version) ─────────────

/**
 * Builds the XML doc comment for a collection operation with request path,
 * operation ID, and API version metadata. Collection methods do NOT include
 * the Resource reference item that ResourceFile methods include.
 */
function buildCollectionOperationXmlDoc(
  summary: string,
  requestPath: string,
  operationId: string,
  apiVersion: string,
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
/// </list>
/// </summary>`;
}

// ─── Helper: Build CreateOrUpdate (LRO) ──────────────────────────────────────

/**
 * Generates the async and sync CreateOrUpdate methods for the collection.
 * These are LRO operations that return ArmOperation<Resource>.
 * Uses OperationFinalStateVia.AzureAsyncOperation (ARM create convention).
 */
function buildCollectionCreateOrUpdate(
  resourceMethod: ResourceMethod,
  tcgcMethod: SdkServiceMethod<SdkHttpOperation>,
  collectionClassName: string,
  resourceClassName: string,
  resourceName: string,
  modelRef: Children,
  diagnosticsFieldName: string,
  restClientFieldName: string,
  operationIdPrefix: string,
  instanceRequestArgs: string,
  apiVersion: string,
  armOperationName: string,
  resourceNameParam: string,
): Children {
  const methodName = getOperationMethodName(tcgcMethod.name);
  const operationId = `${operationIdPrefix}_${methodName}`;
  const scopeName = `${collectionClassName}.${methodName}`;
  const requestPath = resourceMethod.operationPath;
  const summary = tcgcMethod.doc ?? `Create a ${resourceName}`;
  const operationSourceName = `${resourceName}OperationSource`;
  const createRequestMethod = `Create${methodName}Request`;

  const waitUntilDoc = `/// <param name="waitUntil"> <see cref="WaitUntil.Completed"/> if the method should wait to return until the long-running operation has completed on the service; <see cref="WaitUntil.Started"/> if it should return after starting the operation. For more information on long-running operations, please see <see href="https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/core/Azure.Core/samples/LongRunningOperations.md"> Azure.Core Long-Running Operation samples</see>. </param>`;

  const xmlDoc = buildCollectionOperationXmlDoc(
    summary,
    requestPath,
    operationId,
    apiVersion,
  );

  const asyncMethod = code`

${xmlDoc}
${waitUntilDoc}
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="data"> Resource create parameters. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> or <paramref name="data"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
public virtual async ${SystemThreadingTasks.Task}<${AzureResourceManager.ArmOperation}<${resourceClassName}>> ${methodName}Async(${Azure.WaitUntil} waitUntil, string ${resourceNameParam}, ${modelRef} data, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));
    ${AzureCore.Argument}.AssertNotNull(data, nameof(data));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${scopeName}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${instanceRequestArgs}, ${modelRef}.ToRequestContent(data), context);
        ${Azure.Response} response = await Pipeline.ProcessMessageAsync(message, context).ConfigureAwait(false);
        ${armOperationName}<${resourceClassName}> operation = new ${armOperationName}<${resourceClassName}>(
                    new ${operationSourceName}(Client),
                    ${diagnosticsFieldName},
                    Pipeline,
                    message.Request,
                    response,
                    ${AzureCore.OperationFinalStateVia}.AzureAsyncOperation);
        if (waitUntil == ${Azure.WaitUntil}.Completed)
        {
            await operation.WaitForCompletionAsync(cancellationToken).ConfigureAwait(false);
        }
        return operation;
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  const syncMethod = code`

${xmlDoc}
${waitUntilDoc}
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="data"> Resource create parameters. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> or <paramref name="data"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
public virtual ${AzureResourceManager.ArmOperation}<${resourceClassName}> ${methodName}(${Azure.WaitUntil} waitUntil, string ${resourceNameParam}, ${modelRef} data, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));
    ${AzureCore.Argument}.AssertNotNull(data, nameof(data));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${scopeName}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${instanceRequestArgs}, ${modelRef}.ToRequestContent(data), context);
        ${Azure.Response} response = Pipeline.ProcessMessage(message, context);
        ${armOperationName}<${resourceClassName}> operation = new ${armOperationName}<${resourceClassName}>(
                    new ${operationSourceName}(Client),
                    ${diagnosticsFieldName},
                    Pipeline,
                    message.Request,
                    response,
                    ${AzureCore.OperationFinalStateVia}.AzureAsyncOperation);
        if (waitUntil == ${Azure.WaitUntil}.Completed)
        {
            operation.WaitForCompletion(cancellationToken);
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

// ─── Helper: Build Get (standard) ────────────────────────────────────────────

/**
 * Generates the async and sync Get methods for the collection.
 * Takes a resource name parameter and returns Response<Resource>.
 */
function buildCollectionGet(
  resourceMethod: ResourceMethod,
  tcgcMethod: SdkServiceMethod<SdkHttpOperation>,
  collectionClassName: string,
  resourceClassName: string,
  modelRef: Children,
  diagnosticsFieldName: string,
  restClientFieldName: string,
  operationIdPrefix: string,
  instanceRequestArgs: string,
  apiVersion: string,
  resourceNameParam: string,
  resourceName: string,
): Children {
  const methodName = getOperationMethodName(tcgcMethod.name);
  const operationId = `${operationIdPrefix}_${methodName}`;
  const scopeName = `${collectionClassName}.${methodName}`;
  const requestPath = resourceMethod.operationPath;
  const summary = tcgcMethod.doc ?? `Get a ${resourceName}`;
  const createRequestMethod = `Create${methodName}Request`;

  const xmlDoc = buildCollectionOperationXmlDoc(
    summary,
    requestPath,
    operationId,
    apiVersion,
  );

  const asyncMethod = code`

${xmlDoc}
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
public virtual async ${SystemThreadingTasks.Task}<${Azure.Response}<${resourceClassName}>> ${methodName}Async(string ${resourceNameParam}, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${scopeName}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${instanceRequestArgs}, context);
        ${Azure.Response} result = await Pipeline.ProcessMessageAsync(message, context).ConfigureAwait(false);
        ${Azure.Response}<${modelRef}> response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
        if (response.Value == null)
        {
            throw new ${Azure.RequestFailedException}(response.GetRawResponse());
        }
        return ${Azure.Response}.FromValue(new ${resourceClassName}(Client, response.Value), response.GetRawResponse());
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  const syncMethod = code`

${xmlDoc}
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
public virtual ${Azure.Response}<${resourceClassName}> ${methodName}(string ${resourceNameParam}, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${scopeName}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${instanceRequestArgs}, context);
        ${Azure.Response} result = Pipeline.ProcessMessage(message, context);
        ${Azure.Response}<${modelRef}> response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
        if (response.Value == null)
        {
            throw new ${Azure.RequestFailedException}(response.GetRawResponse());
        }
        return ${Azure.Response}.FromValue(new ${resourceClassName}(Client, response.Value), response.GetRawResponse());
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  return code`${asyncMethod}${syncMethod}`;
}

// ─── Helper: Build GetAll (pageable) ─────────────────────────────────────────

/**
 * Generates the async and sync GetAll methods for the collection.
 * These wrap collection result classes in AsyncPageableWrapper/PageableWrapper
 * and return AsyncPageable<Resource>/Pageable<Resource>.
 * GetAll has no diagnostic scope — paging is lazy and diagnostics are
 * handled within the collection result's iteration methods.
 */
function buildCollectionGetAll(
  resourceMethod: ResourceMethod,
  tcgcMethod: SdkServiceMethod<SdkHttpOperation>,
  _collectionClassName: string,
  resourceClassName: string,
  modelRef: Children,
  clientSimpleName: string,
  restClientFieldName: string,
  operationIdPrefix: string,
  parentRequestArgs: string,
  apiVersion: string,
): Children {
  const methodName = getOperationMethodName(tcgcMethod.name);
  const operationId = `${operationIdPrefix}_${methodName}`;
  const requestPath = resourceMethod.operationPath;
  const summary = tcgcMethod.doc ?? `List resources`;

  // Collection result class names (generated by CollectionResultFiles component)
  const asyncCollectionResultName = `${clientSimpleName}${methodName}AsyncCollectionResultOfT`;
  const syncCollectionResultName = `${clientSimpleName}${methodName}CollectionResultOfT`;

  const xmlDoc = buildCollectionOperationXmlDoc(
    summary,
    requestPath,
    operationId,
    apiVersion,
  );

  const asyncMethod = code`

${xmlDoc}
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <returns> A collection of <see cref="${resourceClassName}"/> that may take multiple service requests to iterate over. </returns>
public virtual ${Azure.AsyncPageable}<${resourceClassName}> GetAllAsync(${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${Azure.RequestContext} context = new ${Azure.RequestContext}
    {
        CancellationToken = cancellationToken
    };
    return new AsyncPageableWrapper<${modelRef}, ${resourceClassName}>(new ${asyncCollectionResultName}(${restClientFieldName}, ${parentRequestArgs}, context), data => new ${resourceClassName}(Client, data));
}`;

  const syncMethod = code`

${xmlDoc}
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <returns> A collection of <see cref="${resourceClassName}"/> that may take multiple service requests to iterate over. </returns>
public virtual ${Azure.Pageable}<${resourceClassName}> GetAll(${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${Azure.RequestContext} context = new ${Azure.RequestContext}
    {
        CancellationToken = cancellationToken
    };
    return new PageableWrapper<${modelRef}, ${resourceClassName}>(new ${syncCollectionResultName}(${restClientFieldName}, ${parentRequestArgs}, context), data => new ${resourceClassName}(Client, data));
}`;

  return code`${asyncMethod}${syncMethod}`;
}

// ─── Helper: Build Exists ────────────────────────────────────────────────────

/**
 * Generates the async and sync Exists methods for the collection.
 * Uses Pipeline.SendAsync/Send directly (not ProcessMessageAsync) and
 * manually switches on status codes (200/404/default).
 * Returns Response<bool>.
 */
function buildCollectionExists(
  resourceMethod: ResourceMethod,
  collectionClassName: string,
  modelRef: Children,
  diagnosticsFieldName: string,
  restClientFieldName: string,
  operationIdPrefix: string,
  instanceRequestArgs: string,
  apiVersion: string,
  resourceNameParam: string,
  resourceName: string,
): Children {
  // Exists uses the Get operation's metadata
  const getMethodName = "Get";
  const operationId = `${operationIdPrefix}_${getMethodName}`;
  const requestPath = resourceMethod.operationPath;
  const createRequestMethod = `Create${getMethodName}Request`;

  const xmlDoc = buildCollectionOperationXmlDoc(
    "Checks to see if the resource exists in azure.",
    requestPath,
    operationId,
    apiVersion,
  );

  const asyncMethod = code`

${xmlDoc}
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
public virtual async ${SystemThreadingTasks.Task}<${Azure.Response}<bool>> ExistsAsync(string ${resourceNameParam}, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${collectionClassName}.Exists");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${instanceRequestArgs}, context);
        await Pipeline.SendAsync(message, context.CancellationToken).ConfigureAwait(false);
        ${Azure.Response} result = message.Response;
        ${Azure.Response}<${modelRef}> response = default;
        switch (result.Status)
        {
            case 200:
                response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
                break;
            case 404:
                response = ${Azure.Response}.FromValue((${modelRef})null, result);
                break;
            default:
                throw new ${Azure.RequestFailedException}(result);
        }
        return ${Azure.Response}.FromValue(response.Value != null, response.GetRawResponse());
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  const syncMethod = code`

${xmlDoc}
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
public virtual ${Azure.Response}<bool> Exists(string ${resourceNameParam}, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${collectionClassName}.Exists");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${instanceRequestArgs}, context);
        Pipeline.Send(message, context.CancellationToken);
        ${Azure.Response} result = message.Response;
        ${Azure.Response}<${modelRef}> response = default;
        switch (result.Status)
        {
            case 200:
                response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
                break;
            case 404:
                response = ${Azure.Response}.FromValue((${modelRef})null, result);
                break;
            default:
                throw new ${Azure.RequestFailedException}(result);
        }
        return ${Azure.Response}.FromValue(response.Value != null, response.GetRawResponse());
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  return code`${asyncMethod}${syncMethod}`;
}

// ─── Helper: Build GetIfExists ───────────────────────────────────────────────

/**
 * Generates the async and sync GetIfExists methods for the collection.
 * Uses Pipeline.SendAsync/Send directly and manually switches on status codes.
 * Returns NullableResponse<Resource> (or NoValueResponse<Resource> for 404).
 */
function buildCollectionGetIfExists(
  resourceMethod: ResourceMethod,
  collectionClassName: string,
  resourceClassName: string,
  modelRef: Children,
  diagnosticsFieldName: string,
  restClientFieldName: string,
  operationIdPrefix: string,
  instanceRequestArgs: string,
  apiVersion: string,
  resourceNameParam: string,
  resourceName: string,
): Children {
  const getMethodName = "Get";
  const operationId = `${operationIdPrefix}_${getMethodName}`;
  const requestPath = resourceMethod.operationPath;
  const createRequestMethod = `Create${getMethodName}Request`;

  const xmlDoc = buildCollectionOperationXmlDoc(
    "Tries to get details for this resource from the service.",
    requestPath,
    operationId,
    apiVersion,
  );

  const asyncMethod = code`

${xmlDoc}
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
public virtual async ${SystemThreadingTasks.Task}<${Azure.NullableResponse}<${resourceClassName}>> GetIfExistsAsync(string ${resourceNameParam}, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${collectionClassName}.GetIfExists");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${instanceRequestArgs}, context);
        await Pipeline.SendAsync(message, context.CancellationToken).ConfigureAwait(false);
        ${Azure.Response} result = message.Response;
        ${Azure.Response}<${modelRef}> response = default;
        switch (result.Status)
        {
            case 200:
                response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
                break;
            case 404:
                response = ${Azure.Response}.FromValue((${modelRef})null, result);
                break;
            default:
                throw new ${Azure.RequestFailedException}(result);
        }
        if (response.Value == null)
        {
            return new ${Azure.NoValueResponse}<${resourceClassName}>(response.GetRawResponse());
        }
        return ${Azure.Response}.FromValue(new ${resourceClassName}(Client, response.Value), response.GetRawResponse());
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  const syncMethod = code`

${xmlDoc}
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
public virtual ${Azure.NullableResponse}<${resourceClassName}> GetIfExists(string ${resourceNameParam}, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${collectionClassName}.GetIfExists");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restClientFieldName}.${createRequestMethod}(${instanceRequestArgs}, context);
        Pipeline.Send(message, context.CancellationToken);
        ${Azure.Response} result = message.Response;
        ${Azure.Response}<${modelRef}> response = default;
        switch (result.Status)
        {
            case 200:
                response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
                break;
            case 404:
                response = ${Azure.Response}.FromValue((${modelRef})null, result);
                break;
            default:
                throw new ${Azure.RequestFailedException}(result);
        }
        if (response.Value == null)
        {
            return new ${Azure.NoValueResponse}<${resourceClassName}>(response.GetRawResponse());
        }
        return ${Azure.Response}.FromValue(new ${resourceClassName}(Client, response.Value), response.GetRawResponse());
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  return code`${asyncMethod}${syncMethod}`;
}

// ─── Helper: Build enumerator implementations ────────────────────────────────

/**
 * Generates the IEnumerable<T>, IEnumerable, and IAsyncEnumerable<T>
 * explicit interface implementations. These delegate to GetAll/GetAllAsync.
 */
function buildCollectionEnumerators(resourceClassName: string): Children {
  return code`

IEnumerator<${resourceClassName}> IEnumerable<${resourceClassName}>.GetEnumerator()
{
    return GetAll().GetEnumerator();
}

IEnumerator IEnumerable.GetEnumerator()
{
    return GetAll().GetEnumerator();
}

/// <param name="cancellationToken"> The cancellation token to use. </param>
IAsyncEnumerator<${resourceClassName}> IAsyncEnumerable<${resourceClassName}>.GetAsyncEnumerator(${SystemThreading.CancellationToken} cancellationToken)
{
    return GetAllAsync(cancellationToken: cancellationToken).GetAsyncEnumerator(cancellationToken);
}`;
}
