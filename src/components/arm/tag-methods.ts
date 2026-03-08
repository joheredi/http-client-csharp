/**
 * Generates tag manipulation methods (AddTag, RemoveTag, SetTags) for ARM
 * resources that support tags.
 *
 * Each tagged resource gets 6 methods (3 async + 3 sync) following the ARM SDK
 * dual-path pattern:
 * - Primary path: Uses the TagResource API when CanUseTagResource() returns true
 * - Secondary path: Falls back to resource Update when TagResource is unavailable
 *
 * The secondary path handles both PUT-style (modify data directly) and PATCH-style
 * (construct a separate patch object) update semantics, depending on whether the
 * resource's Update method takes the full data type or a separate patch type.
 *
 * @module
 */

import { code } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
import type {
  SdkDictionaryType,
  SdkHttpOperation,
  SdkModelType,
  SdkServiceMethod,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { Azure, AzureCore, AzureCorePipeline } from "../../builtins/azure.js";
import {
  AzureResourceManager,
  AzureResourceManagerResources,
} from "../../builtins/azure-arm.js";
import { System } from "../../builtins/system.js";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import { SystemThreading } from "../../builtins/system-threading.js";
import { SystemThreadingTasks } from "../../builtins/system-threading.js";
import type { ResourceMetadata } from "../../utils/resource-metadata.js";
import { ResourceOperationKind } from "../../utils/resource-metadata.js";
import { efCsharpRefkey } from "../../utils/refkey.js";
import { unwrapNullableType } from "../../utils/nullable.js";
import { getOperationMethodName } from "./ResourceFile.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Information about the resource's Update method needed for tag operations.
 * Extracted from the TCGC method metadata to determine the secondary path
 * code generation strategy.
 */
export interface UpdateMethodInfo {
  /** The TCGC method name, PascalCase (e.g., "Update") */
  methodName: string;
  /** Whether the Update is a long-running operation */
  isLro: boolean;
  /** Whether the Update takes a patch type vs the full data type */
  isPatch: boolean;
  /** Refkey for the patch type (only set when isPatch is true) */
  patchTypeRef?: Children;
}

/**
 * Parameters needed to generate tag operations for a resource.
 */
export interface TagOperationParams {
  /** The resource class name (e.g., "FooResource") */
  className: string;
  /** Refkey for the resource data model (e.g., FooData) */
  modelRef: Children;
  /** Diagnostics field name (e.g., "_foosClientDiagnostics") */
  diagnosticsFieldName: string;
  /** Rest client field name (e.g., "_foosRestClient") */
  restClientFieldName: string;
  /** Comma-separated ID accessor expressions for CreateGetRequest */
  requestArgs: string;
  /** Update method info (from getUpdateMethodInfo) */
  updateInfo: UpdateMethodInfo;
}

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Checks whether an ARM resource model supports tags by walking the
 * inheritance chain and looking for a `tags` property of type
 * `Dictionary<string, string>`.
 *
 * Only resources extending TrackedResource (or models with an explicit tags
 * property) will return true. ProxyResource and other non-tagged resources
 * return false.
 */
export function resourceSupportsTags(model: SdkModelType): boolean {
  let current: SdkModelType | undefined = model;
  while (current) {
    for (const prop of current.properties) {
      if (prop.serializedName === "tags" && isStringDictionary(prop.type)) {
        return true;
      }
    }
    current = current.baseModel;
  }
  return false;
}

/**
 * Checks if a type represents Dictionary<string, string>.
 * Handles nullable wrapping around the dictionary type.
 */
function isStringDictionary(type: SdkType): boolean {
  const unwrapped = unwrapNullableType(type);
  if (unwrapped.kind !== "dict") return false;
  const dict = unwrapped as SdkDictionaryType;
  const valueType = dict.valueType;
  if (!valueType) return false;
  const unwrappedValue = unwrapNullableType(valueType);
  return unwrappedValue.kind === "string";
}

/**
 * Finds the Update method for a resource and determines whether it uses
 * PATCH (separate patch type) or PUT (full resource data type) semantics.
 *
 * Returns undefined if the resource has no Update method, which means
 * tag methods should not be generated.
 */
export function getUpdateMethodInfo(
  metadata: ResourceMetadata,
  methodLookup: Map<string, SdkServiceMethod<SdkHttpOperation>>,
  model: SdkModelType,
): UpdateMethodInfo | undefined {
  const updateMethod = metadata.methods.find(
    (m) => m.kind === ResourceOperationKind.Update,
  );
  if (!updateMethod) return undefined;

  const tcgcMethod = methodLookup.get(updateMethod.methodId);
  if (!tcgcMethod) return undefined;

  const methodName = getOperationMethodName(tcgcMethod.name);
  const isLro = tcgcMethod.kind === "lro" || tcgcMethod.kind === "lropaging";

  // Determine isPatch by comparing body param type with resource model type.
  // If the body type differs from the resource model, the Update uses a
  // separate patch type (PATCH semantics). If same, it's PUT semantics.
  const bodyParam = tcgcMethod.operation.bodyParam;
  let isPatch = false;
  let patchTypeRef: Children | undefined;

  if (bodyParam) {
    const bodyType = unwrapNullableType(bodyParam.type);
    if (bodyType.kind === "model") {
      const bodyModel = bodyType as SdkModelType;
      isPatch =
        bodyModel.crossLanguageDefinitionId !== model.crossLanguageDefinitionId;
      if (isPatch && bodyModel.__raw) {
        patchTypeRef = efCsharpRefkey(bodyModel.__raw);
      }
    }
  }

  return { methodName, isLro, isPatch, patchTypeRef };
}

/**
 * Checks whether a resource has a Read method in its metadata.
 * Tag methods require a Read method to re-fetch the resource after
 * modifying tags via the TagResource API.
 */
export function hasReadMethod(metadata: ResourceMetadata): boolean {
  return metadata.methods.some((m) => m.kind === ResourceOperationKind.Read);
}

// ─── Code Generation ─────────────────────────────────────────────────────────

/**
 * Generates all 6 tag methods (AddTag, SetTags, RemoveTag × async/sync)
 * for a resource that supports tags.
 *
 * The methods follow the ARM SDK dual-path pattern:
 * 1. Primary: CanUseTagResource → GetTagResource API → re-fetch resource
 * 2. Secondary: Get resource data → modify tags → Update resource
 */
export function buildTagOperations(params: TagOperationParams): Children {
  return [
    buildAddTagMethod(true, params),
    buildAddTagMethod(false, params),
    buildSetTagsMethod(true, params),
    buildSetTagsMethod(false, params),
    buildRemoveTagMethod(true, params),
    buildRemoveTagMethod(false, params),
  ];
}

// ─── AddTag ──────────────────────────────────────────────────────────────────

/**
 * Generates the AddTag method (async or sync variant).
 *
 * AddTag sets a single tag key/value pair on the resource. In the primary
 * path, it modifies TagValues[key] = value via the TagResource API. In the
 * secondary path, it modifies current.Tags[key] = value on the resource data.
 */
function buildAddTagMethod(
  isAsync: boolean,
  params: TagOperationParams,
): Children {
  const {
    className,
    modelRef,
    diagnosticsFieldName,
    restClientFieldName,
    requestArgs,
    updateInfo,
  } = params;
  const secondary =
    updateInfo.isPatch && updateInfo.patchTypeRef
      ? buildPatchAddTag(isAsync, className, modelRef, updateInfo)
      : buildPutAddTag(isAsync, modelRef, className, updateInfo);

  if (isAsync) {
    return code`

/// <summary>
/// Add a tag to the current resource.
/// </summary>
/// <param name="key"> The key for the tag. </param>
/// <param name="value"> The value for the tag. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual async ${SystemThreadingTasks.Task}<${Azure.Response}<${className}>> AddTagAsync(string key, string value, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(key, nameof(key));
    ${AzureCore.Argument}.AssertNotNull(value, nameof(value));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${className}.AddTag");
    scope.Start();
    try
    {
        if (await CanUseTagResourceAsync(cancellationToken).ConfigureAwait(false))
        {
            ${Azure.Response}<${AzureResourceManagerResources.TagResource}> originalTags = await GetTagResource().GetAsync(cancellationToken).ConfigureAwait(false);
            originalTags.Value.Data.TagValues[key] = value;
            await GetTagResource().CreateOrUpdateAsync(${Azure.WaitUntil}.Completed, originalTags.Value.Data, cancellationToken).ConfigureAwait(false);
            ${Azure.RequestContext} context = new ${Azure.RequestContext}
            {
                CancellationToken = cancellationToken
            };
            ${AzureCore.HttpMessage} message = ${restClientFieldName}.CreateGetRequest(${requestArgs}, context);
            ${Azure.Response} result = await Pipeline.ProcessMessageAsync(message, context).ConfigureAwait(false);
            ${Azure.Response}<${modelRef}> response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
            return ${Azure.Response}.FromValue(new ${className}(Client, response.Value), response.GetRawResponse());
        }
        else
        {
${secondary}
        }
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;
  }

  return code`

/// <summary>
/// Add a tag to the current resource.
/// </summary>
/// <param name="key"> The key for the tag. </param>
/// <param name="value"> The value for the tag. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual ${Azure.Response}<${className}> AddTag(string key, string value, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(key, nameof(key));
    ${AzureCore.Argument}.AssertNotNull(value, nameof(value));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${className}.AddTag");
    scope.Start();
    try
    {
        if (CanUseTagResource(cancellationToken))
        {
            ${Azure.Response}<${AzureResourceManagerResources.TagResource}> originalTags = GetTagResource().Get(cancellationToken);
            originalTags.Value.Data.TagValues[key] = value;
            GetTagResource().CreateOrUpdate(${Azure.WaitUntil}.Completed, originalTags.Value.Data, cancellationToken);
            ${Azure.RequestContext} context = new ${Azure.RequestContext}
            {
                CancellationToken = cancellationToken
            };
            ${AzureCore.HttpMessage} message = ${restClientFieldName}.CreateGetRequest(${requestArgs}, context);
            ${Azure.Response} result = Pipeline.ProcessMessage(message, context);
            ${Azure.Response}<${modelRef}> response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
            return ${Azure.Response}.FromValue(new ${className}(Client, response.Value), response.GetRawResponse());
        }
        else
        {
${secondary}
        }
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;
}

// ─── SetTags ─────────────────────────────────────────────────────────────────

/**
 * Generates the SetTags method (async or sync variant).
 *
 * SetTags replaces all tags on the resource. In the primary path, it first
 * deletes existing tags via GetTagResource().Delete, then re-creates with
 * ReplaceWith(). In the secondary path, it replaces current.Tags.
 */
function buildSetTagsMethod(
  isAsync: boolean,
  params: TagOperationParams,
): Children {
  const {
    className,
    modelRef,
    diagnosticsFieldName,
    restClientFieldName,
    requestArgs,
    updateInfo,
  } = params;
  const secondary =
    updateInfo.isPatch && updateInfo.patchTypeRef
      ? buildPatchSetTags(isAsync, modelRef, className, updateInfo)
      : buildPutSetTags(isAsync, modelRef, className, updateInfo);

  if (isAsync) {
    return code`

/// <summary>
/// Replace the tags on the resource with the given set.
/// </summary>
/// <param name="tags"> The set of tags to use as replacement. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual async ${SystemThreadingTasks.Task}<${Azure.Response}<${className}>> SetTagsAsync(${SystemCollectionsGeneric.IDictionary}<string, string> tags, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(tags, nameof(tags));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${className}.SetTags");
    scope.Start();
    try
    {
        if (await CanUseTagResourceAsync(cancellationToken).ConfigureAwait(false))
        {
            await GetTagResource().DeleteAsync(${Azure.WaitUntil}.Completed, cancellationToken).ConfigureAwait(false);
            ${Azure.Response}<${AzureResourceManagerResources.TagResource}> originalTags = await GetTagResource().GetAsync(cancellationToken).ConfigureAwait(false);
            originalTags.Value.Data.TagValues.ReplaceWith(tags);
            await GetTagResource().CreateOrUpdateAsync(${Azure.WaitUntil}.Completed, originalTags.Value.Data, cancellationToken).ConfigureAwait(false);
            ${Azure.RequestContext} context = new ${Azure.RequestContext}
            {
                CancellationToken = cancellationToken
            };
            ${AzureCore.HttpMessage} message = ${restClientFieldName}.CreateGetRequest(${requestArgs}, context);
            ${Azure.Response} result = await Pipeline.ProcessMessageAsync(message, context).ConfigureAwait(false);
            ${Azure.Response}<${modelRef}> response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
            return ${Azure.Response}.FromValue(new ${className}(Client, response.Value), response.GetRawResponse());
        }
        else
        {
${secondary}
        }
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;
  }

  return code`

/// <summary>
/// Replace the tags on the resource with the given set.
/// </summary>
/// <param name="tags"> The set of tags to use as replacement. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual ${Azure.Response}<${className}> SetTags(${SystemCollectionsGeneric.IDictionary}<string, string> tags, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(tags, nameof(tags));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${className}.SetTags");
    scope.Start();
    try
    {
        if (CanUseTagResource(cancellationToken))
        {
            GetTagResource().Delete(${Azure.WaitUntil}.Completed, cancellationToken);
            ${Azure.Response}<${AzureResourceManagerResources.TagResource}> originalTags = GetTagResource().Get(cancellationToken);
            originalTags.Value.Data.TagValues.ReplaceWith(tags);
            GetTagResource().CreateOrUpdate(${Azure.WaitUntil}.Completed, originalTags.Value.Data, cancellationToken);
            ${Azure.RequestContext} context = new ${Azure.RequestContext}
            {
                CancellationToken = cancellationToken
            };
            ${AzureCore.HttpMessage} message = ${restClientFieldName}.CreateGetRequest(${requestArgs}, context);
            ${Azure.Response} result = Pipeline.ProcessMessage(message, context);
            ${Azure.Response}<${modelRef}> response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
            return ${Azure.Response}.FromValue(new ${className}(Client, response.Value), response.GetRawResponse());
        }
        else
        {
${secondary}
        }
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;
}

// ─── RemoveTag ───────────────────────────────────────────────────────────────

/**
 * Generates the RemoveTag method (async or sync variant).
 *
 * RemoveTag removes a single tag by key. In the primary path, it calls
 * TagValues.Remove(key). In the secondary path, it modifies current.Tags.
 */
function buildRemoveTagMethod(
  isAsync: boolean,
  params: TagOperationParams,
): Children {
  const {
    className,
    modelRef,
    diagnosticsFieldName,
    restClientFieldName,
    requestArgs,
    updateInfo,
  } = params;
  const secondary =
    updateInfo.isPatch && updateInfo.patchTypeRef
      ? buildPatchRemoveTag(isAsync, className, modelRef, updateInfo)
      : buildPutRemoveTag(isAsync, modelRef, className, updateInfo);

  if (isAsync) {
    return code`

/// <summary>
/// Removes a tag by key from the resource.
/// </summary>
/// <param name="key"> The key for the tag. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual async ${SystemThreadingTasks.Task}<${Azure.Response}<${className}>> RemoveTagAsync(string key, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(key, nameof(key));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${className}.RemoveTag");
    scope.Start();
    try
    {
        if (await CanUseTagResourceAsync(cancellationToken).ConfigureAwait(false))
        {
            ${Azure.Response}<${AzureResourceManagerResources.TagResource}> originalTags = await GetTagResource().GetAsync(cancellationToken).ConfigureAwait(false);
            originalTags.Value.Data.TagValues.Remove(key);
            await GetTagResource().CreateOrUpdateAsync(${Azure.WaitUntil}.Completed, originalTags.Value.Data, cancellationToken).ConfigureAwait(false);
            ${Azure.RequestContext} context = new ${Azure.RequestContext}
            {
                CancellationToken = cancellationToken
            };
            ${AzureCore.HttpMessage} message = ${restClientFieldName}.CreateGetRequest(${requestArgs}, context);
            ${Azure.Response} result = await Pipeline.ProcessMessageAsync(message, context).ConfigureAwait(false);
            ${Azure.Response}<${modelRef}> response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
            return ${Azure.Response}.FromValue(new ${className}(Client, response.Value), response.GetRawResponse());
        }
        else
        {
${secondary}
        }
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;
  }

  return code`

/// <summary>
/// Removes a tag by key from the resource.
/// </summary>
/// <param name="key"> The key for the tag. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual ${Azure.Response}<${className}> RemoveTag(string key, ${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(key, nameof(key));

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagnosticsFieldName}.CreateScope("${className}.RemoveTag");
    scope.Start();
    try
    {
        if (CanUseTagResource(cancellationToken))
        {
            ${Azure.Response}<${AzureResourceManagerResources.TagResource}> originalTags = GetTagResource().Get(cancellationToken);
            originalTags.Value.Data.TagValues.Remove(key);
            GetTagResource().CreateOrUpdate(${Azure.WaitUntil}.Completed, originalTags.Value.Data, cancellationToken);
            ${Azure.RequestContext} context = new ${Azure.RequestContext}
            {
                CancellationToken = cancellationToken
            };
            ${AzureCore.HttpMessage} message = ${restClientFieldName}.CreateGetRequest(${requestArgs}, context);
            ${Azure.Response} result = Pipeline.ProcessMessage(message, context);
            ${Azure.Response}<${modelRef}> response = ${Azure.Response}.FromValue(${modelRef}.FromResponse(result), result);
            return ${Azure.Response}.FromValue(new ${className}(Client, response.Value), response.GetRawResponse());
        }
        else
        {
${secondary}
        }
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;
}

// ─── PUT Secondary Paths ─────────────────────────────────────────────────────

/** PUT secondary path for AddTag: modify tags directly on resource data. */
function buildPutAddTag(
  isAsync: boolean,
  modelRef: Children,
  className: string,
  ui: UpdateMethodInfo,
): Children {
  const s = isAsync ? "Async" : "";
  const aw = isAsync ? "await " : "";
  const ca = isAsync ? ".ConfigureAwait(false)" : "";
  const w = ui.isLro ? code`${Azure.WaitUntil}.Completed, ` : null;
  const rt = ui.isLro
    ? code`${AzureResourceManager.ArmOperation}<${className}>`
    : code`${Azure.Response}<${className}>`;
  return code`            ${modelRef} current = (${aw}Get${s}(cancellationToken: cancellationToken)${ca}).Value.Data;
            current.Tags[key] = value;
            ${rt} result = ${aw}${ui.methodName}${s}(${w}current, cancellationToken: cancellationToken)${ca};
            return ${Azure.Response}.FromValue(result.Value, result.GetRawResponse());`;
}

/** PUT secondary path for SetTags: replace all tags on resource data. */
function buildPutSetTags(
  isAsync: boolean,
  modelRef: Children,
  className: string,
  ui: UpdateMethodInfo,
): Children {
  const s = isAsync ? "Async" : "";
  const aw = isAsync ? "await " : "";
  const ca = isAsync ? ".ConfigureAwait(false)" : "";
  const w = ui.isLro ? code`${Azure.WaitUntil}.Completed, ` : null;
  const rt = ui.isLro
    ? code`${AzureResourceManager.ArmOperation}<${className}>`
    : code`${Azure.Response}<${className}>`;
  return code`            ${modelRef} current = (${aw}Get${s}(cancellationToken: cancellationToken)${ca}).Value.Data;
            current.Tags.ReplaceWith(tags);
            ${rt} result = ${aw}${ui.methodName}${s}(${w}current, cancellationToken: cancellationToken)${ca};
            return ${Azure.Response}.FromValue(result.Value, result.GetRawResponse());`;
}

/** PUT secondary path for RemoveTag: remove a tag key from resource data. */
function buildPutRemoveTag(
  isAsync: boolean,
  modelRef: Children,
  className: string,
  ui: UpdateMethodInfo,
): Children {
  const s = isAsync ? "Async" : "";
  const aw = isAsync ? "await " : "";
  const ca = isAsync ? ".ConfigureAwait(false)" : "";
  const w = ui.isLro ? code`${Azure.WaitUntil}.Completed, ` : null;
  const rt = ui.isLro
    ? code`${AzureResourceManager.ArmOperation}<${className}>`
    : code`${Azure.Response}<${className}>`;
  return code`            ${modelRef} current = (${aw}Get${s}(cancellationToken: cancellationToken)${ca}).Value.Data;
            current.Tags.Remove(key);
            ${rt} result = ${aw}${ui.methodName}${s}(${w}current, cancellationToken: cancellationToken)${ca};
            return ${Azure.Response}.FromValue(result.Value, result.GetRawResponse());`;
}

// ─── PATCH Secondary Paths ───────────────────────────────────────────────────

/** PATCH secondary path for AddTag: create patch, copy tags, set key/value. */
function buildPatchAddTag(
  isAsync: boolean,
  className: string,
  modelRef: Children,
  ui: UpdateMethodInfo,
): Children {
  const s = isAsync ? "Async" : "";
  const aw = isAsync ? "await " : "";
  const ca = isAsync ? ".ConfigureAwait(false)" : "";
  const w = ui.isLro ? code`${Azure.WaitUntil}.Completed, ` : null;
  const rt = ui.isLro
    ? code`${AzureResourceManager.ArmOperation}<${className}>`
    : code`${Azure.Response}<${className}>`;
  const p = ui.patchTypeRef!;
  return code`            ${modelRef} current = (${aw}Get${s}(cancellationToken: cancellationToken)${ca}).Value.Data;
            ${p} patch = new ${p}();
            foreach (${SystemCollectionsGeneric.KeyValuePair}<string, string> tag in current.Tags)
            {
                patch.Tags.Add(tag);
            }
            patch.Tags[key] = value;
            ${rt} result = ${aw}${ui.methodName}${s}(${w}patch, cancellationToken: cancellationToken)${ca};
            return ${Azure.Response}.FromValue(result.Value, result.GetRawResponse());`;
}

/** PATCH secondary path for SetTags: create patch, replace all tags. */
function buildPatchSetTags(
  isAsync: boolean,
  modelRef: Children,
  className: string,
  ui: UpdateMethodInfo,
): Children {
  const s = isAsync ? "Async" : "";
  const aw = isAsync ? "await " : "";
  const ca = isAsync ? ".ConfigureAwait(false)" : "";
  const w = ui.isLro ? code`${Azure.WaitUntil}.Completed, ` : null;
  const rt = ui.isLro
    ? code`${AzureResourceManager.ArmOperation}<${className}>`
    : code`${Azure.Response}<${className}>`;
  const p = ui.patchTypeRef!;
  return code`            ${modelRef} current = (${aw}Get${s}(cancellationToken: cancellationToken)${ca}).Value.Data;
            ${p} patch = new ${p}();
            patch.Tags.ReplaceWith(tags);
            ${rt} result = ${aw}${ui.methodName}${s}(${w}patch, cancellationToken: cancellationToken)${ca};
            return ${Azure.Response}.FromValue(result.Value, result.GetRawResponse());`;
}

/** PATCH secondary path for RemoveTag: create patch, copy tags, remove key. */
function buildPatchRemoveTag(
  isAsync: boolean,
  className: string,
  modelRef: Children,
  ui: UpdateMethodInfo,
): Children {
  const s = isAsync ? "Async" : "";
  const aw = isAsync ? "await " : "";
  const ca = isAsync ? ".ConfigureAwait(false)" : "";
  const w = ui.isLro ? code`${Azure.WaitUntil}.Completed, ` : null;
  const rt = ui.isLro
    ? code`${AzureResourceManager.ArmOperation}<${className}>`
    : code`${Azure.Response}<${className}>`;
  const p = ui.patchTypeRef!;
  return code`            ${modelRef} current = (${aw}Get${s}(cancellationToken: cancellationToken)${ca}).Value.Data;
            ${p} patch = new ${p}();
            foreach (${SystemCollectionsGeneric.KeyValuePair}<string, string> tag in current.Tags)
            {
                patch.Tags.Add(tag);
            }
            patch.Tags.Remove(key);
            ${rt} result = ${aw}${ui.methodName}${s}(${w}patch, cancellationToken: cancellationToken)${ca};
            return ${Azure.Response}.FromValue(result.Value, result.GetRawResponse());`;
}
