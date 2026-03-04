import {
  ClassDeclaration,
  Constructor,
  Field,
  Method,
  Namespace,
  SourceFile,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import { code, refkey } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
import type {
  SdkArrayType,
  SdkClientType,
  SdkHttpOperation,
  SdkLroPagingServiceMethod,
  SdkModelPropertyType,
  SdkPagingServiceMethod,
  SdkServiceResponseHeader,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";

/**
 * Union type for methods that produce paginated results.
 * Both `SdkPagingServiceMethod` (kind "paging") and `SdkLroPagingServiceMethod`
 * (kind "lropaging") share `pagingMetadata` via `SdkPagingServiceMethodOptions`.
 * For System.ClientModel, LRO does not affect collection result generation, so
 * both kinds produce identical iterator classes.
 */
type PagingLikeMethod<
  T extends
    import("@azure-tools/typespec-client-generator-core").SdkServiceOperation,
> = SdkPagingServiceMethod<T> | SdkLroPagingServiceMethod<T>;
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { System } from "../../builtins/system.js";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import {
  SystemClientModel,
  SystemClientModelPrimitives,
} from "../../builtins/system-client-model.js";
import { SystemThreadingTasks } from "../../builtins/system-threading.js";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import {
  buildSiblingNameSet,
  cleanOperationName,
} from "../../utils/operation-naming.js";
import { reorderTokenFirst } from "../../utils/parameter-ordering.js";
import { buildProtocolParams } from "../clients/ProtocolMethod.js";

/**
 * Props for the {@link CollectionResultFiles} component.
 */
export interface CollectionResultFilesProps {
  /** The TCGC SDK client type that may contain paging operations. */
  client: SdkClientType<SdkHttpOperation>;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates collection result files for all paging operations on a client.
 *
 * Each paging operation produces 4 source files:
 * - Sync protocol: extends CollectionResult
 * - Sync convenience: extends CollectionResult{T} with GetValuesFromPage
 * - Async protocol: extends AsyncCollectionResult
 * - Async convenience: extends AsyncCollectionResult{T} with GetValuesFromPageAsync
 *
 * These classes implement the iterator pattern for paginated API responses,
 * storing the client reference and request options, then yielding pages via
 * GetRawPages/GetRawPagesAsync.
 *
 * Supports three paging strategies:
 * - Single-page: simple yield return (no nextLinkSegments or continuationToken)
 * - Next-link: while(true) loop with URI extraction and CreateNext{Op}Request
 * - Continuation-token: while(true) loop with token extraction from response
 *   body or header, and same Create{Op}Request re-invocation with updated token
 */
export function CollectionResultFiles(props: CollectionResultFilesProps) {
  const { client, options } = props;

  const pagingMethods = client.methods.filter(
    (m): m is PagingLikeMethod<SdkHttpOperation> =>
      m.kind === "paging" || m.kind === "lropaging",
  );

  if (pagingMethods.length === 0) return null;

  return (
    <>
      {pagingMethods.flatMap((method) => [
        <CollectionResultFile
          client={client}
          method={method}
          options={options}
          isAsync={false}
          isConvenience={false}
        />,
        <CollectionResultFile
          client={client}
          method={method}
          options={options}
          isAsync={false}
          isConvenience={true}
        />,
        <CollectionResultFile
          client={client}
          method={method}
          options={options}
          isAsync={true}
          isConvenience={false}
        />,
        <CollectionResultFile
          client={client}
          method={method}
          options={options}
          isAsync={true}
          isConvenience={true}
        />,
      ])}
    </>
  );
}

/**
 * Props for the internal {@link CollectionResultFile} component.
 */
interface CollectionResultFileProps {
  client: SdkClientType<SdkHttpOperation>;
  method: PagingLikeMethod<SdkHttpOperation>;
  options: ResolvedCSharpEmitterOptions;
  isAsync: boolean;
  isConvenience: boolean;
}

/**
 * Generates a single collection result source file for one paging operation variant.
 *
 * The generated class extends CollectionResult (sync) or AsyncCollectionResult (async),
 * optionally generic over the item type T for convenience variants. It contains:
 * - Private fields for the client and request options
 * - A public constructor
 * - GetRawPages/GetRawPagesAsync with yield-return of a single page
 * - GetContinuationToken returning null (single-page strategy)
 * - GetValuesFromPage/GetValuesFromPageAsync for convenience variants
 *
 * The file is placed at src/Generated/CollectionResults/{ClassName}.cs.
 */
function CollectionResultFile(props: CollectionResultFileProps) {
  const { client, method, options, isAsync, isConvenience } = props;
  const namePolicy = useCSharpNamePolicy();
  // Use the immediate client name (not the full hierarchy) to match
  // PagingMethods.tsx naming. Since collection result classes are internal
  // and scoped to the client's own namespace, the parent names are redundant.
  const clientName = namePolicy.getName(client.name, "class");
  const siblingNames = buildSiblingNameSet(client.methods, (n) =>
    namePolicy.getName(n, "class"),
  );
  const operationName = cleanOperationName(
    namePolicy.getName(method.name, "class"),
    siblingNames,
  );
  const header = getLicenseHeader(options);

  // Build class name: {ClientName}{OperationName}{Suffix}
  let suffix = isAsync ? "AsyncCollectionResult" : "CollectionResult";
  if (isConvenience) suffix += "OfT";
  const className = `${clientName}${operationName}${suffix}`;

  // When the client is named "ContinuationToken", the unqualified name
  // collides with System.ClientModel.ContinuationToken (used as the return
  // type of GetContinuationToken and in ContinuationToken.FromBytes calls).
  // Use the fully-qualified name to avoid the ambiguity.
  const scmContinuationToken: Children =
    clientName === "ContinuationToken"
      ? "global::System.ClientModel.ContinuationToken"
      : SystemClientModel.ContinuationToken;

  // Determine base type reference (sync or async)
  const baseTypeRef = isAsync
    ? SystemClientModel.AsyncCollectionResult
    : SystemClientModel.CollectionResult;

  // Extract paging metadata for convenience variants
  const metadata = method.pagingMetadata;
  const itemSegments = metadata.pageItemsSegments;
  let itemTypeExpr: Children | undefined;
  let itemPropertyPath: string | undefined;

  // Response model type from the HTTP operation's success response
  // Needed for: next-link extraction casts AND convenience GetValuesFromPage casts
  const responseModelType = method.operation.responses.find(
    (r) => r.type,
  )?.type;
  let responseTypeExpr: Children | undefined;
  if (responseModelType?.__raw) {
    responseTypeExpr = <TypeExpression type={responseModelType.__raw} />;
  }

  if (itemSegments && itemSegments.length > 0) {
    // Item type: element type of the last segment's array type
    const lastSegment = itemSegments[itemSegments.length - 1];
    const itemSdkType: SdkType =
      lastSegment.type.kind === "array"
        ? (lastSegment.type as SdkArrayType).valueType
        : lastSegment.type;

    if (itemSdkType.__raw) {
      itemTypeExpr = <TypeExpression type={itemSdkType.__raw} />;
    }

    // Property path from response model to items (e.g., "Items" or "Data.Items")
    itemPropertyPath = itemSegments
      .map((seg) => namePolicy.getName(seg.name, "class"))
      .join(".");
  }

  // Extract next-link metadata for multi-page paging
  const nextLinkSegments = metadata.nextLinkSegments;
  const hasNextLink =
    nextLinkSegments !== undefined &&
    nextLinkSegments.length > 0 &&
    responseTypeExpr !== undefined;

  // Build the C# property path from the response model to the next-link value.
  // For nested paths, intermediate segments use ?. (null-conditional operator):
  //   Simple (1 segment): "NextLink"
  //   Nested (2+ segments): "Nested?.NextLink"
  const nextLinkPropertyPath = hasNextLink
    ? buildResponsePropertyPath(nextLinkSegments!, namePolicy)
    : undefined;

  // Extract continuation-token metadata for multi-page paging.
  // Continuation-token takes effect only when next-link is absent (matching
  // the legacy emitter's precedence: nextLink > continuationToken > single-page).
  const continuationTokenResponseSegments =
    metadata.continuationTokenResponseSegments;
  const continuationTokenParamSegments =
    metadata.continuationTokenParameterSegments;
  const hasContinuationToken =
    !hasNextLink &&
    continuationTokenResponseSegments !== undefined &&
    continuationTokenResponseSegments.length > 0 &&
    continuationTokenParamSegments !== undefined &&
    continuationTokenParamSegments.length > 0;

  // Determine if the continuation token is extracted from a response header
  // (kind "responseheader") vs a response body property (kind "property").
  const isContinuationTokenHeader =
    hasContinuationToken &&
    continuationTokenResponseSegments![0].kind === "responseheader";

  // For header-based extraction, get the serialized HTTP header name
  // (e.g., "next-token") from the response header segment.
  const continuationTokenHeaderName =
    isContinuationTokenHeader &&
    "serializedName" in continuationTokenResponseSegments![0]
      ? (
          continuationTokenResponseSegments![0] as SdkServiceResponseHeader & {
            serializedName: string;
          }
        ).serializedName
      : undefined;

  // For body-based extraction, build the property path from the response model
  // to the continuation token value (e.g., "NextToken" or "Nested?.NextToken").
  const continuationTokenPropertyPath =
    hasContinuationToken && !isContinuationTokenHeader
      ? buildResponsePropertyPath(
          continuationTokenResponseSegments!,
          namePolicy,
        )
      : undefined;

  // Get all operation parameters for continuation-token operations.
  // These are stored as fields and passed to Create{Op}Request on each iteration.
  // Identify which operation parameter is the continuation token by matching
  // against the last segment in continuationTokenParameterSegments.
  const tokenParamName = hasContinuationToken
    ? continuationTokenParamSegments![
        continuationTokenParamSegments!.length - 1
      ].name
    : undefined;

  // Reorder params to put the continuation token first (matching legacy emitter).
  const operationParams = hasContinuationToken
    ? reorderTokenFirst(buildProtocolParams(method.operation), tokenParamName)
    : [];

  // Base type: generic for convenience, non-generic for protocol
  const baseType =
    isConvenience && itemTypeExpr
      ? code`${baseTypeRef}<${itemTypeExpr}>`
      : baseTypeRef;

  // Method name and return type for GetRawPages/GetRawPagesAsync
  const getRawPagesName = isAsync ? "GetRawPagesAsync" : "GetRawPages";
  const returnType = isAsync
    ? code`${SystemCollectionsGeneric.IAsyncEnumerable}<${SystemClientModel.ClientResult}>`
    : code`${SystemCollectionsGeneric.IEnumerable}<${SystemClientModel.ClientResult}>`;

  // Request factory method name (matches RestClientFile's Create{Op}Request pattern)
  const requestMethodName = `Create${operationName}Request`;
  // Next-link request factory method name (e.g., CreateNextListThingsRequest)
  const nextRequestMethodName = `CreateNext${operationName}Request`;

  // Build GetRawPages/GetRawPagesAsync method body.
  // Dispatch order: next-link > continuation-token > single-page.
  const getRawPagesBody = hasNextLink
    ? buildNextLinkGetRawPagesBody(
        isAsync,
        requestMethodName,
        nextRequestMethodName,
        responseTypeExpr!,
        nextLinkPropertyPath!,
      )
    : hasContinuationToken
      ? isContinuationTokenHeader
        ? buildContinuationTokenHeaderGetRawPagesBody(
            isAsync,
            requestMethodName,
            operationParams,
            tokenParamName!,
            continuationTokenHeaderName!,
          )
        : buildContinuationTokenBodyGetRawPagesBody(
            isAsync,
            requestMethodName,
            operationParams,
            tokenParamName!,
            responseTypeExpr!,
            continuationTokenPropertyPath!,
          )
      : buildSinglePageGetRawPagesBody(isAsync, requestMethodName);

  // Build GetContinuationToken method body.
  // Returns ContinuationToken from next-link URI, continuation token string,
  // or null depending on the paging strategy.
  const getContinuationTokenBody = hasNextLink
    ? buildNextLinkGetContinuationTokenBody(
        responseTypeExpr!,
        nextLinkPropertyPath!,
        scmContinuationToken,
      )
    : hasContinuationToken
      ? isContinuationTokenHeader
        ? buildContinuationTokenHeaderGetContinuationTokenBody(
            continuationTokenHeaderName!,
            scmContinuationToken,
          )
        : buildContinuationTokenBodyGetContinuationTokenBody(
            responseTypeExpr!,
            continuationTokenPropertyPath!,
            scmContinuationToken,
          )
      : ["return null;"];

  // Whether to render convenience methods
  const hasConvenienceInfo =
    isConvenience && responseTypeExpr && itemTypeExpr && itemPropertyPath;

  return (
    <SourceFile path={`src/Generated/CollectionResults/${className}.cs`}>
      {header}
      {"\n\n"}
      <Namespace name={client.namespace}>
        <ClassDeclaration internal partial name={className} baseType={baseType}>
          <Field private readonly name="client" type={refkey(client)} />
          {"\n"}
          {operationParams.map((p) => (
            <>
              <Field private readonly name={p.name} type={p.type} />
              {"\n"}
            </>
          ))}
          <Field
            private
            readonly
            name="options"
            type={SystemClientModelPrimitives.RequestOptions}
          />
          {"\n\n"}
          {buildConstructorDoc(className, clientName, operationParams)}
          {"\n"}
          <Constructor
            public
            parameters={[
              { name: "client", type: refkey(client) },
              ...operationParams.map((p) => ({
                name: p.name,
                type: p.type as Children,
              })),
              {
                name: "options",
                type: SystemClientModelPrimitives.RequestOptions as Children,
              },
            ]}
          >
            _client = client;
            {operationParams.map((p) => `\n_${p.name} = ${p.name};`)}
            {"\n"}
            _options = options;
          </Constructor>
          {"\n\n"}
          {buildGetRawPagesDoc()}
          {"\n"}
          <Method
            public
            override
            {...(isAsync ? { async: true } : {})}
            name={getRawPagesName}
            returns={returnType}
          >
            {getRawPagesBody}
          </Method>
          {"\n\n"}
          {buildGetContinuationTokenDoc()}
          {"\n"}
          <Method
            public
            override
            name="GetContinuationToken"
            returns={scmContinuationToken}
            parameters={[
              {
                name: "page",
                type: SystemClientModel.ClientResult as Children,
              },
            ]}
          >
            {getContinuationTokenBody}
          </Method>
          {hasConvenienceInfo && (
            <>
              {"\n\n"}
              {buildGetValuesFromPageDoc()}
              {"\n"}
              <Method
                protected
                override
                {...(isAsync ? { async: true } : {})}
                name={isAsync ? "GetValuesFromPageAsync" : "GetValuesFromPage"}
                returns={
                  isAsync
                    ? code`${SystemCollectionsGeneric.IAsyncEnumerable}<${itemTypeExpr}>`
                    : code`${SystemCollectionsGeneric.IEnumerable}<${itemTypeExpr}>`
                }
                parameters={[
                  {
                    name: "page",
                    type: SystemClientModel.ClientResult as Children,
                  },
                ]}
              >
                {isAsync
                  ? buildAsyncGetValuesBody(
                      responseTypeExpr!,
                      itemTypeExpr!,
                      itemPropertyPath!,
                    )
                  : buildSyncGetValuesBody(
                      responseTypeExpr!,
                      itemPropertyPath!,
                    )}
              </Method>
            </>
          )}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

/**
 * Builds the sync GetValuesFromPage method body.
 * Generates: return ((ResponseType)page).PropertyPath;
 */
function buildSyncGetValuesBody(
  responseTypeExpr: Children,
  itemPropertyPath: string,
): Children[] {
  return [code`return ((${responseTypeExpr})page).${itemPropertyPath};`];
}

/**
 * Builds the async GetValuesFromPageAsync method body.
 * Generates a foreach loop with yield return and await Task.Yield().
 */
function buildAsyncGetValuesBody(
  responseTypeExpr: Children,
  itemTypeExpr: Children,
  itemPropertyPath: string,
): Children[] {
  return [
    code`foreach (${itemTypeExpr} item in ((${responseTypeExpr})page).${itemPropertyPath})`,
    "\n",
    "{",
    "\n",
    "    yield return item;",
    "\n",
    code`    await ${SystemThreadingTasks.Task}.Yield();`,
    "\n",
    "}",
  ];
}

/**
 * Builds the GetRawPages/GetRawPagesAsync body for the single-page paging strategy.
 *
 * Generates a simple yield return of one processed message.
 * Used when no nextLinkSegments or continuationToken are present.
 */
function buildSinglePageGetRawPagesBody(
  isAsync: boolean,
  requestMethodName: string,
): Children[] {
  if (isAsync) {
    return [
      code`${SystemClientModelPrimitives.PipelineMessage} message = _client.${requestMethodName}(_options);`,
      "\n",
      code`yield return ${SystemClientModel.ClientResult}.FromResponse(await _client.Pipeline.ProcessMessageAsync(message, _options).ConfigureAwait(false));`,
    ];
  }
  return [
    code`${SystemClientModelPrimitives.PipelineMessage} message = _client.${requestMethodName}(_options);`,
    "\n",
    code`yield return ${SystemClientModel.ClientResult}.FromResponse(_client.Pipeline.ProcessMessage(message, _options));`,
  ];
}

/**
 * Builds the GetRawPages/GetRawPagesAsync body for the next-link paging strategy.
 *
 * Generates a while(true) loop that:
 * 1. Sends the request and yields the response as a ClientResult page
 * 2. Extracts the next-link URI from the response body via a cast to the response model type
 * 3. Checks if the next-link URI is null (terminates with yield break)
 * 4. Creates a new request message using CreateNext{Op}Request with the extracted URI
 *
 * @param isAsync - Whether to generate async variant (ProcessMessageAsync, await, ConfigureAwait)
 * @param requestMethodName - Name of the initial request factory method (e.g., "CreateListThingsRequest")
 * @param nextRequestMethodName - Name of the next-page request factory method (e.g., "CreateNextListThingsRequest")
 * @param responseTypeExpr - JSX expression for the response model type (used for casting)
 * @param nextLinkPropertyPath - C# property path to the next-link value (e.g., "NextLink" or "Nested?.NextLink")
 */
function buildNextLinkGetRawPagesBody(
  isAsync: boolean,
  requestMethodName: string,
  nextRequestMethodName: string,
  responseTypeExpr: Children,
  nextLinkPropertyPath: string,
): Children[] {
  const processMessage = isAsync
    ? code`await _client.Pipeline.ProcessMessageAsync(message, _options).ConfigureAwait(false)`
    : code`_client.Pipeline.ProcessMessage(message, _options)`;

  return [
    code`${SystemClientModelPrimitives.PipelineMessage} message = _client.${requestMethodName}(_options);`,
    "\n",
    code`${System.Uri} nextPageUri = null;`,
    "\n",
    "while (true)",
    "\n",
    "{",
    "\n",
    // Indentation is separated from code templates to avoid whitespace-only
    // first template chunks being stripped by the code tag.
    "    ",
    code`${SystemClientModel.ClientResult} result = ${SystemClientModel.ClientResult}.FromResponse(${processMessage});`,
    "\n",
    "    yield return result;",
    "\n",
    "\n",
    code`    nextPageUri = ((${responseTypeExpr})result).${nextLinkPropertyPath};`,
    "\n",
    "    if (nextPageUri == null)",
    "\n",
    "    {",
    "\n",
    "        yield break;",
    "\n",
    "    }",
    "\n",
    code`    message = _client.${nextRequestMethodName}(nextPageUri, _options);`,
    "\n",
    "}",
  ];
}

/**
 * Builds the GetContinuationToken method body for the next-link paging strategy.
 *
 * Generates code that extracts the next-link URI from the response, and if non-null,
 * wraps it in a ContinuationToken via ContinuationToken.FromBytes(BinaryData.FromString(...)).
 * The URI is serialized using IsAbsoluteUri ? AbsoluteUri : OriginalString to preserve
 * the original form (absolute or relative).
 *
 * @param responseTypeExpr - JSX expression for the response model type (used for casting)
 * @param nextLinkPropertyPath - C# property path to the next-link value
 */
function buildNextLinkGetContinuationTokenBody(
  responseTypeExpr: Children,
  nextLinkPropertyPath: string,
  scmContinuationToken: Children,
): Children[] {
  return [
    code`${System.Uri} nextPage = ((${responseTypeExpr})page).${nextLinkPropertyPath};`,
    "\n",
    "if (nextPage != null)",
    "\n",
    "{",
    "\n",
    code`    return ${scmContinuationToken}.FromBytes(${System.BinaryData}.FromString(nextPage.IsAbsoluteUri ? nextPage.AbsoluteUri : nextPage.OriginalString));`,
    "\n",
    "}",
    "\n",
    "return null;",
  ];
}

/**
 * Builds a Create{Op}Request argument list from stored operation parameter fields.
 *
 * For the initial request, all params use their stored field value (e.g., `_token`).
 * For subsequent requests, the token parameter is replaced with `nextToken` (the local
 * variable holding the extracted continuation token from the previous response).
 *
 * @param params - All operation parameters from buildProtocolParams
 * @param tokenParamName - Name of the continuation token parameter to replace
 * @param useNextToken - If true, replaces the token param with `nextToken`
 */
function buildCreateRequestArgs(
  params: { name: string }[],
  tokenParamName: string,
  useNextToken: boolean,
): string {
  const args = params.map((p) =>
    p.name === tokenParamName
      ? useNextToken
        ? "nextToken"
        : `_${p.name}`
      : `_${p.name}`,
  );
  args.push("_options");
  return args.join(", ");
}

/**
 * Builds the GetRawPages/GetRawPagesAsync body for the body-based continuation-token
 * paging strategy.
 *
 * Generates a while(true) loop that:
 * 1. Sends the request with stored params and yields the response
 * 2. Extracts the continuation token from a response body property via a cast
 * 3. Checks if the token is null/empty (terminates with yield break)
 * 4. Re-creates the request using the same Create{Op}Request with the new token
 *
 * Unlike next-link which uses a separate CreateNext{Op}Request, continuation-token
 * re-invokes the same Create{Op}Request with the updated token value.
 *
 * @param isAsync - Whether to generate async variant
 * @param requestMethodName - Name of the request factory method
 * @param params - All operation parameters from buildProtocolParams
 * @param tokenParamName - Name of the continuation token parameter
 * @param responseTypeExpr - JSX expression for the response model type (used for casting)
 * @param tokenPropertyPath - C# property path to the token value in the response model
 */
function buildContinuationTokenBodyGetRawPagesBody(
  isAsync: boolean,
  requestMethodName: string,
  params: { name: string }[],
  tokenParamName: string,
  responseTypeExpr: Children,
  tokenPropertyPath: string,
): Children[] {
  const processMessage = isAsync
    ? code`await _client.Pipeline.ProcessMessageAsync(message, _options).ConfigureAwait(false)`
    : code`_client.Pipeline.ProcessMessage(message, _options)`;

  const initialArgs = buildCreateRequestArgs(params, tokenParamName, false);
  const subsequentArgs = buildCreateRequestArgs(params, tokenParamName, true);

  return [
    code`${SystemClientModelPrimitives.PipelineMessage} message = _client.${requestMethodName}(${initialArgs});`,
    "\n",
    "string nextToken = null;",
    "\n",
    "while (true)",
    "\n",
    "{",
    "\n",
    "    ",
    code`${SystemClientModel.ClientResult} result = ${SystemClientModel.ClientResult}.FromResponse(${processMessage});`,
    "\n",
    "    yield return result;",
    "\n",
    "\n",
    code`    nextToken = ((${responseTypeExpr})result).${tokenPropertyPath};`,
    "\n",
    "    if (string.IsNullOrEmpty(nextToken))",
    "\n",
    "    {",
    "\n",
    "        yield break;",
    "\n",
    "    }",
    "\n",
    `    message = _client.${requestMethodName}(${subsequentArgs});`,
    "\n",
    "}",
  ];
}

/**
 * Builds the GetRawPages/GetRawPagesAsync body for the header-based continuation-token
 * paging strategy.
 *
 * Similar to body-based, but extracts the token from a response header using
 * GetRawResponse().Headers.TryGetValue() instead of a response model property cast.
 * The extraction and termination check are combined into a single if/else block.
 *
 * @param isAsync - Whether to generate async variant
 * @param requestMethodName - Name of the request factory method
 * @param params - All operation parameters from buildProtocolParams
 * @param tokenParamName - Name of the continuation token parameter
 * @param headerName - The serialized HTTP header name (e.g., "next-token")
 */
function buildContinuationTokenHeaderGetRawPagesBody(
  isAsync: boolean,
  requestMethodName: string,
  params: { name: string }[],
  tokenParamName: string,
  headerName: string,
): Children[] {
  const processMessage = isAsync
    ? code`await _client.Pipeline.ProcessMessageAsync(message, _options).ConfigureAwait(false)`
    : code`_client.Pipeline.ProcessMessage(message, _options)`;

  const initialArgs = buildCreateRequestArgs(params, tokenParamName, false);
  const subsequentArgs = buildCreateRequestArgs(params, tokenParamName, true);

  return [
    code`${SystemClientModelPrimitives.PipelineMessage} message = _client.${requestMethodName}(${initialArgs});`,
    "\n",
    "string nextToken = null;",
    "\n",
    "while (true)",
    "\n",
    "{",
    "\n",
    "    ",
    code`${SystemClientModel.ClientResult} result = ${SystemClientModel.ClientResult}.FromResponse(${processMessage});`,
    "\n",
    "    yield return result;",
    "\n",
    "\n",
    `    if (result.GetRawResponse().Headers.TryGetValue("${headerName}", out string value) && !string.IsNullOrEmpty(value))`,
    "\n",
    "    {",
    "\n",
    "        nextToken = value;",
    "\n",
    "    }",
    "\n",
    "    else",
    "\n",
    "    {",
    "\n",
    "        yield break;",
    "\n",
    "    }",
    "\n",
    `    message = _client.${requestMethodName}(${subsequentArgs});`,
    "\n",
    "}",
  ];
}

/**
 * Builds the GetContinuationToken method body for body-based continuation-token paging.
 *
 * Extracts the token string from the response body via a cast to the response model type
 * and a property path access. If the token is non-empty, wraps it in a ContinuationToken
 * via ContinuationToken.FromBytes(BinaryData.FromString(...)). Otherwise returns null.
 *
 * @param responseTypeExpr - JSX expression for the response model type (used for casting)
 * @param tokenPropertyPath - C# property path to the token value in the response model
 */
function buildContinuationTokenBodyGetContinuationTokenBody(
  responseTypeExpr: Children,
  tokenPropertyPath: string,
  scmContinuationToken: Children,
): Children[] {
  return [
    code`string nextPage = ((${responseTypeExpr})page).${tokenPropertyPath};`,
    "\n",
    "if (!string.IsNullOrEmpty(nextPage))",
    "\n",
    "{",
    "\n",
    code`    return ${scmContinuationToken}.FromBytes(${System.BinaryData}.FromString(nextPage));`,
    "\n",
    "}",
    "\n",
    "else",
    "\n",
    "{",
    "\n",
    "    return null;",
    "\n",
    "}",
  ];
}

/**
 * Builds the GetContinuationToken method body for header-based continuation-token paging.
 *
 * Extracts the token string from the response header using
 * GetRawResponse().Headers.TryGetValue(). If the header is present and non-empty,
 * wraps it in a ContinuationToken. Otherwise returns null.
 *
 * @param headerName - The serialized HTTP header name (e.g., "next-token")
 */
function buildContinuationTokenHeaderGetContinuationTokenBody(
  headerName: string,
  scmContinuationToken: Children,
): Children[] {
  return [
    `if (page.GetRawResponse().Headers.TryGetValue("${headerName}", out string value) && !string.IsNullOrEmpty(value))`,
    "\n",
    "{",
    "\n",
    code`    return ${scmContinuationToken}.FromBytes(${System.BinaryData}.FromString(value));`,
    "\n",
    "}",
    "\n",
    "else",
    "\n",
    "{",
    "\n",
    "    return null;",
    "\n",
    "}",
  ];
}

/**
 * Builds a C# property path for accessing a value from a response model.
 *
 * Converts paging metadata segments into a dotted property path with null-conditional
 * operators for intermediate segments. The first segment uses direct property access (.Name)
 * while subsequent segments use null-conditional access (?.Name).
 *
 * Used for both next-link URI paths and continuation-token body property paths.
 *
 * Examples:
 * - Single segment ["nextLink"] → "NextLink"
 * - Nested segments ["nested", "nextLink"] → "Nested?.NextLink"
 *
 * @param segments - The response segments from TCGC paging metadata
 * @param namePolicy - C# name policy for converting segment names to PascalCase
 */
function buildResponsePropertyPath(
  segments: (SdkServiceResponseHeader | SdkModelPropertyType)[],
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): string {
  return segments
    .map((seg, i) => {
      const name = namePolicy.getName(seg.name, "class");
      return i === 0 ? name : `?.${name}`;
    })
    .join("");
}

// --- XML Doc Comment Builders ---

/**
 * Builds XML doc comments for the collection result constructor.
 * Includes param docs for all operation parameters when present.
 */
function buildConstructorDoc(
  className: string,
  clientName: string,
  operationParams: { name: string; doc?: string }[] = [],
): string[] {
  const result = [
    `/// <summary> Initializes a new instance of ${className}, which is used to iterate over the pages of a collection. </summary>`,
    `\n/// <param name="client"> The ${clientName} client used to send requests. </param>`,
  ];

  for (const p of operationParams) {
    result.push(`\n/// <param name="${p.name}"></param>`);
  }

  result.push(
    `\n/// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>`,
  );

  return result;
}

/**
 * Builds XML doc comments for the GetRawPages/GetRawPagesAsync method.
 */
function buildGetRawPagesDoc(): string[] {
  return [
    `/// <summary> Gets the raw pages of the collection. </summary>`,
    `\n/// <returns> The raw pages of the collection. </returns>`,
  ];
}

/**
 * Builds XML doc comments for the GetContinuationToken method.
 */
function buildGetContinuationTokenDoc(): string[] {
  return [
    `/// <summary> Gets the continuation token from the specified page. </summary>`,
    `\n/// <param name="page"></param>`,
    `\n/// <returns> The continuation token for the specified page. </returns>`,
  ];
}

/**
 * Builds XML doc comments for the GetValuesFromPage/GetValuesFromPageAsync method.
 */
function buildGetValuesFromPageDoc(): string[] {
  return [
    `/// <summary> Gets the values from the specified page. </summary>`,
    `\n/// <param name="page"></param>`,
    `\n/// <returns> The values from the specified page. </returns>`,
  ];
}
