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
import { getClientFileName } from "../../utils/clients.js";
import { buildProtocolParams } from "../clients/ProtocolMethod.js";
import {
  getPipelineTypes,
  type PipelineTypes,
} from "../../utils/pipeline-types.js";

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
  const pipelineTypes = getPipelineTypes(options.flavor ?? "unbranded");
  const isAzure = options.flavor === "azure";
  // Use the hierarchical client name to match the legacy emitter's naming
  // convention. For depth-2+ sub-clients, this produces names like
  // "PathParametersLabelExpansion" instead of just "LabelExpansion".
  const toClassName = (name: string) => namePolicy.getName(name, "class");
  const clientName = getClientFileName(client, toClassName);
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

  // Check if the next-link property is a string type (vs Uri).
  // Some specs use string next-link properties instead of url/Uri.
  // When the property is a string, we need to convert it to Uri for
  // the paging loop and GetContinuationToken method.
  const isNextLinkString = hasNextLink && isStringType(nextLinkSegments!);

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

  // Get all operation parameters. These are stored as fields and passed to
  // Create{Op}Request when building request messages. For continuation-token
  // paging, the token parameter is placed first (matching legacy emitter).
  // For next-link and single-page strategies, params keep their original order.
  const tokenParamName = hasContinuationToken
    ? continuationTokenParamSegments![
        continuationTokenParamSegments!.length - 1
      ].name
    : undefined;

  const getParamName = (name: string) => namePolicy.getName(name, "parameter");
  const operationParams = reorderTokenFirst(
    buildProtocolParams(method.operation, getParamName, options.flavor),
    tokenParamName,
  );

  // Base type: generic for convenience, non-generic for protocol
  const baseType =
    isConvenience && itemTypeExpr
      ? code`${baseTypeRef}<${itemTypeExpr}>`
      : baseTypeRef;

  // Method name and return type for GetRawPages/GetRawPagesAsync
  const getRawPagesName = isAsync ? "GetRawPagesAsync" : "GetRawPages";
  const returnType = isAsync
    ? code`${SystemCollectionsGeneric.IAsyncEnumerable}<${pipelineTypes.clientResult}>`
    : code`${SystemCollectionsGeneric.IEnumerable}<${pipelineTypes.clientResult}>`;

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
        operationParams,
        isNextLinkString,
        pipelineTypes,
        isAzure,
      )
    : hasContinuationToken
      ? isContinuationTokenHeader
        ? buildContinuationTokenHeaderGetRawPagesBody(
            isAsync,
            requestMethodName,
            operationParams,
            tokenParamName!,
            continuationTokenHeaderName!,
            pipelineTypes,
            isAzure,
          )
        : buildContinuationTokenBodyGetRawPagesBody(
            isAsync,
            requestMethodName,
            operationParams,
            tokenParamName!,
            responseTypeExpr!,
            continuationTokenPropertyPath!,
            pipelineTypes,
            isAzure,
          )
      : buildSinglePageGetRawPagesBody(
          isAsync,
          requestMethodName,
          operationParams,
          pipelineTypes,
          isAzure,
        );

  // Build GetContinuationToken method body.
  // Returns ContinuationToken from next-link URI, continuation token string,
  // or null depending on the paging strategy.
  const getContinuationTokenBody = hasNextLink
    ? buildNextLinkGetContinuationTokenBody(
        responseTypeExpr!,
        nextLinkPropertyPath!,
        scmContinuationToken,
        isNextLinkString,
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
            type={pipelineTypes.requestOptions}
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
                type: pipelineTypes.requestOptions as Children,
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
                type: pipelineTypes.clientResult as Children,
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
                    type: pipelineTypes.clientResult as Children,
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
 *
 * @param isAsync - Whether to generate async variant
 * @param requestMethodName - Name of the request factory method
 * @param params - All operation parameters to pass to the request factory
 */
function buildSinglePageGetRawPagesBody(
  isAsync: boolean,
  requestMethodName: string,
  params: { name: string }[],
  pipelineTypes?: PipelineTypes,
  isAzure?: boolean,
): Children[] {
  const requestArgs = buildStoredFieldArgs(params);
  const msgType =
    pipelineTypes?.message ?? SystemClientModelPrimitives.PipelineMessage;
  const resultType =
    pipelineTypes?.clientResult ?? SystemClientModel.ClientResult;

  if (isAsync) {
    const processExpr = `await _client.Pipeline.ProcessMessageAsync(message, _options).ConfigureAwait(false)`;
    const yieldExpr = isAzure
      ? code`yield return ${processExpr};`
      : code`yield return ${resultType}.FromResponse(${processExpr});`;
    return [
      code`${msgType} message = _client.${requestMethodName}(${requestArgs});`,
      "\n",
      yieldExpr,
    ];
  }
  const processExpr = `_client.Pipeline.ProcessMessage(message, _options)`;
  const yieldExpr = isAzure
    ? code`yield return ${processExpr};`
    : code`yield return ${resultType}.FromResponse(${processExpr});`;
  return [
    code`${msgType} message = _client.${requestMethodName}(${requestArgs});`,
    "\n",
    yieldExpr,
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
 * @param params - All operation parameters to pass to the initial request factory
 * @param isStringNextLink - Whether the next-link property is a string type (vs Uri)
 */
function buildNextLinkGetRawPagesBody(
  isAsync: boolean,
  requestMethodName: string,
  nextRequestMethodName: string,
  responseTypeExpr: Children,
  nextLinkPropertyPath: string,
  params: { name: string }[],
  isStringNextLink: boolean,
  pipelineTypes?: PipelineTypes,
  isAzure?: boolean,
): Children[] {
  const processMessage = isAsync
    ? code`await _client.Pipeline.ProcessMessageAsync(message, _options).ConfigureAwait(false)`
    : code`_client.Pipeline.ProcessMessage(message, _options)`;

  const requestArgs = buildStoredFieldArgs(params);
  const msgType =
    pipelineTypes?.message ?? SystemClientModelPrimitives.PipelineMessage;
  const resultType =
    pipelineTypes?.clientResult ?? SystemClientModel.ClientResult;

  // For string next-link properties, extract the string and convert to Uri.
  // For Uri next-link properties, assign directly.
  const nextLinkExtraction: Children[] = isStringNextLink
    ? [
        code`    string nextLink = ((${responseTypeExpr})result).${nextLinkPropertyPath};`,
        "\n",
        code`    nextPageUri = nextLink != null ? new ${System.Uri}(nextLink) : null;`,
      ]
    : [
        code`    nextPageUri = ((${responseTypeExpr})result).${nextLinkPropertyPath};`,
      ];

  // Azure: ProcessMessage returns Response directly (no FromResponse wrapper)
  const resultExpr = isAzure
    ? code`${resultType} result = ${processMessage};`
    : code`${resultType} result = ${resultType}.FromResponse(${processMessage});`;

  return [
    code`${msgType} message = _client.${requestMethodName}(${requestArgs});`,
    "\n",
    code`${System.Uri} nextPageUri = null;`,
    "\n",
    "while (true)",
    "\n",
    "{",
    "\n",
    "    ",
    resultExpr,
    "\n",
    "    yield return result;",
    "\n",
    "\n",
    ...nextLinkExtraction,
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
 * @param isStringNextLink - Whether the next-link property is a string type (vs Uri)
 */
function buildNextLinkGetContinuationTokenBody(
  responseTypeExpr: Children,
  nextLinkPropertyPath: string,
  scmContinuationToken: Children,
  isStringNextLink: boolean,
): Children[] {
  if (isStringNextLink) {
    // String next-link: extract string directly, check null/empty, and wrap in ContinuationToken
    return [
      code`string nextPage = ((${responseTypeExpr})page).${nextLinkPropertyPath};`,
      "\n",
      "if (!string.IsNullOrEmpty(nextPage))",
      "\n",
      "{",
      "\n",
      code`    return ${scmContinuationToken}.FromBytes(${System.BinaryData}.FromString(nextPage));`,
      "\n",
      "}",
      "\n",
      "return null;",
    ];
  }

  // Uri next-link: extract Uri, check null, serialize via IsAbsoluteUri
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
 * Maps each parameter to its stored field (e.g., `_paramName`) and appends `_options`.
 * Used by next-link and single-page strategies where no token replacement is needed.
 *
 * @param params - All operation parameters from buildProtocolParams
 * @returns Comma-separated argument string (e.g., "_maxPageSize, _options")
 */
function buildStoredFieldArgs(params: { name: string }[]): string {
  const args = params.map((p) => `_${p.name}`);
  args.push("_options");
  return args.join(", ");
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
  pipelineTypes?: PipelineTypes,
  isAzure?: boolean,
): Children[] {
  const processMessage = isAsync
    ? code`await _client.Pipeline.ProcessMessageAsync(message, _options).ConfigureAwait(false)`
    : code`_client.Pipeline.ProcessMessage(message, _options)`;

  const initialArgs = buildCreateRequestArgs(params, tokenParamName, false);
  const subsequentArgs = buildCreateRequestArgs(params, tokenParamName, true);
  const msgType =
    pipelineTypes?.message ?? SystemClientModelPrimitives.PipelineMessage;
  const resultType =
    pipelineTypes?.clientResult ?? SystemClientModel.ClientResult;

  const resultExpr = isAzure
    ? code`${resultType} result = ${processMessage};`
    : code`${resultType} result = ${resultType}.FromResponse(${processMessage});`;

  return [
    code`${msgType} message = _client.${requestMethodName}(${initialArgs});`,
    "\n",
    "string nextToken = null;",
    "\n",
    "while (true)",
    "\n",
    "{",
    "\n",
    "    ",
    resultExpr,
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
  pipelineTypes?: PipelineTypes,
  isAzure?: boolean,
): Children[] {
  const processMessage = isAsync
    ? code`await _client.Pipeline.ProcessMessageAsync(message, _options).ConfigureAwait(false)`
    : code`_client.Pipeline.ProcessMessage(message, _options)`;

  const initialArgs = buildCreateRequestArgs(params, tokenParamName, false);
  const subsequentArgs = buildCreateRequestArgs(params, tokenParamName, true);
  const msgType =
    pipelineTypes?.message ?? SystemClientModelPrimitives.PipelineMessage;
  const resultType =
    pipelineTypes?.clientResult ?? SystemClientModel.ClientResult;

  const resultExpr = isAzure
    ? code`${resultType} result = ${processMessage};`
    : code`${resultType} result = ${resultType}.FromResponse(${processMessage});`;

  // For Azure, result IS the Response — use it directly for header access.
  // For unbranded, need result.GetRawResponse() to access headers.
  const headerAccessExpr = isAzure
    ? `result.Headers.TryGetValue("${headerName}", out string value)`
    : `result.GetRawResponse().Headers.TryGetValue("${headerName}", out string value)`;

  return [
    code`${msgType} message = _client.${requestMethodName}(${initialArgs});`,
    "\n",
    "string nextToken = null;",
    "\n",
    "while (true)",
    "\n",
    "{",
    "\n",
    "    ",
    resultExpr,
    "\n",
    "    yield return result;",
    "\n",
    "\n",
    `    if (${headerAccessExpr} && !string.IsNullOrEmpty(value))`,
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

/**
 * Checks if the last segment of a next-link path is a string type (not a url/Uri).
 *
 * Some TypeSpec specs define next-link properties as `string` instead of `url`.
 * When the property is a string, the generated code needs to explicitly convert
 * the string value to a Uri for the paging loop.
 *
 * @param segments - The next-link segments from TCGC paging metadata
 * @returns True if the final segment's type is a string (not url/Uri)
 */
function isStringType(
  segments: (SdkServiceResponseHeader | SdkModelPropertyType)[],
): boolean {
  if (segments.length === 0) return false;
  const lastSegment = segments[segments.length - 1];
  // SdkModelPropertyType has a .type field with kind info
  if ("type" in lastSegment) {
    const sdkType = lastSegment.type;
    // TCGC "string" kind maps to C# string; "url" kind maps to C# Uri.
    // When the next-link property is string (not url), we need conversion.
    return sdkType.kind === "string";
  }
  return false;
}
