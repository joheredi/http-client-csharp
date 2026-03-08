import {
  ClassDeclaration,
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
import { Azure, AzureCorePipeline } from "../../builtins/azure.js";
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
import { getPipelineTypes } from "../../utils/pipeline-types.js";
import { modelReaderWriterContextRefkey } from "../../utils/refkey.js";
import { OverloadConstructor } from "../models/ModelConstructors.js";

/**
 * Props for the {@link AzurePageableFiles} component.
 */
export interface AzurePageableFilesProps {
  /** The TCGC SDK client type that may contain paging operations. */
  client: SdkClientType<SdkHttpOperation>;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates Azure Pageable<T>/AsyncPageable<T> files for all paging operations on a client.
 *
 * Azure-flavored paging uses Azure.Core's `Pageable<T>` and `AsyncPageable<T>` base classes
 * instead of System.ClientModel's `CollectionResult` / `AsyncCollectionResult`. Each paging
 * operation produces 4 source files:
 * - Sync protocol: extends Pageable<BinaryData>
 * - Sync convenience: extends Pageable<T>
 * - Async protocol: extends AsyncPageable<BinaryData>
 * - Async convenience: extends AsyncPageable<T>
 *
 * These classes implement the `AsPages()` abstract method which yields `Page<T>` objects.
 * Each class also includes a private `GetNextResponse` / `GetNextResponseAsync` method
 * that handles the HTTP pipeline call with `DiagnosticScope` for tracing.
 *
 * Supports three paging strategies (same precedence as CollectionResultFile):
 * - Next-link: while(true) loop with URI extraction from response body
 * - Continuation-token: while(true) loop with token from response body or header
 * - Single-page: simple yield return of one page
 */
export function AzurePageableFiles(props: AzurePageableFilesProps) {
  const { client, options } = props;

  const pagingMethods = client.methods.filter(
    (m): m is PagingLikeMethod<SdkHttpOperation> =>
      m.kind === "paging" || m.kind === "lropaging",
  );

  if (pagingMethods.length === 0) return null;

  return (
    <>
      {pagingMethods.flatMap((method) => [
        <AzurePageableFile
          client={client}
          method={method}
          options={options}
          isAsync={false}
          isConvenience={false}
        />,
        <AzurePageableFile
          client={client}
          method={method}
          options={options}
          isAsync={false}
          isConvenience={true}
        />,
        <AzurePageableFile
          client={client}
          method={method}
          options={options}
          isAsync={true}
          isConvenience={false}
        />,
        <AzurePageableFile
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
 * Props for the internal {@link AzurePageableFile} component.
 */
interface AzurePageableFileProps {
  client: SdkClientType<SdkHttpOperation>;
  method: PagingLikeMethod<SdkHttpOperation>;
  options: ResolvedCSharpEmitterOptions;
  isAsync: boolean;
  isConvenience: boolean;
}

/**
 * Generates a single Azure Pageable source file for one paging operation variant.
 *
 * The generated class extends `Pageable<T>` (sync) or `AsyncPageable<T>` (async),
 * where T is `BinaryData` for protocol variants or a typed model for convenience variants.
 *
 * The class implements:
 * - `AsPages(string continuationToken, int? pageSizeHint)` — yields `Page<T>` objects
 * - `GetNextResponse` / `GetNextResponseAsync` — private method with DiagnosticScope
 *
 * The file is placed at src/Generated/CollectionResults/{ClassName}.cs.
 */
function AzurePageableFile(props: AzurePageableFileProps) {
  const { client, method, options, isAsync, isConvenience } = props;
  const namePolicy = useCSharpNamePolicy();
  const pipelineTypes = getPipelineTypes("azure");
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
  // Matches the same naming as CollectionResultFile for consistency
  let suffix = isAsync ? "AsyncCollectionResult" : "CollectionResult";
  if (isConvenience) suffix += "OfT";
  const className = `${clientName}${operationName}${suffix}`;

  // The original client name for DiagnosticScope (e.g., "BasicClient.GetAll")
  const clientTypeName = toClassName(client.name);
  const scopeName = `${clientTypeName}.${operationName}`;

  // Extract paging metadata
  const metadata = method.pagingMetadata;
  const itemSegments = metadata.pageItemsSegments;
  let itemTypeExpr: Children | undefined;
  let itemPropertyPath: string | undefined;

  // Response model type from the HTTP operation's success response
  const responseModelType = method.operation.responses.find(
    (r) => r.type,
  )?.type;
  let responseTypeExpr: Children | undefined;
  if (responseModelType?.__raw) {
    responseTypeExpr = <TypeExpression type={responseModelType.__raw} />;
  }

  if (itemSegments && itemSegments.length > 0) {
    const lastSegment = itemSegments[itemSegments.length - 1];
    const itemSdkType: SdkType =
      lastSegment.type.kind === "array"
        ? (lastSegment.type as SdkArrayType).valueType
        : lastSegment.type;

    if (itemSdkType.__raw) {
      itemTypeExpr = <TypeExpression type={itemSdkType.__raw} />;
    }

    itemPropertyPath = itemSegments
      .map((seg) => namePolicy.getName(seg.name, "class"))
      .join(".");
  }

  // Extract next-link metadata
  const nextLinkSegments = metadata.nextLinkSegments;
  const hasNextLink =
    nextLinkSegments !== undefined &&
    nextLinkSegments.length > 0 &&
    responseTypeExpr !== undefined;

  const nextLinkPropertyPath = hasNextLink
    ? buildResponsePropertyPath(nextLinkSegments!, namePolicy)
    : undefined;

  const isNextLinkString = hasNextLink && isStringType(nextLinkSegments!);

  // Extract continuation-token metadata (lower priority than next-link)
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

  const isContinuationTokenHeader =
    hasContinuationToken &&
    continuationTokenResponseSegments![0].kind === "responseheader";

  const continuationTokenHeaderName =
    isContinuationTokenHeader &&
    "serializedName" in continuationTokenResponseSegments![0]
      ? (
          continuationTokenResponseSegments![0] as SdkServiceResponseHeader & {
            serializedName: string;
          }
        ).serializedName
      : undefined;

  const continuationTokenPropertyPath =
    hasContinuationToken && !isContinuationTokenHeader
      ? buildResponsePropertyPath(
          continuationTokenResponseSegments!,
          namePolicy,
        )
      : undefined;

  // Get all operation parameters
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

  // Determine the generic type parameter for the Pageable base class:
  // - Protocol: BinaryData
  // - Convenience: the typed item model (e.g., User)
  const pageItemType =
    isConvenience && itemTypeExpr ? itemTypeExpr : System.BinaryData;

  // Base type: Pageable<T> or AsyncPageable<T>
  const baseTypeRef = isAsync ? Azure.AsyncPageable : Azure.Pageable;
  const baseType = code`${baseTypeRef}<${pageItemType}>`;

  // AsPages return type: IEnumerable<Page<T>> or IAsyncEnumerable<Page<T>>
  const asPagesReturnType = isAsync
    ? code`${SystemCollectionsGeneric.IAsyncEnumerable}<${Azure.Page}<${pageItemType}>>`
    : code`${SystemCollectionsGeneric.IEnumerable}<${Azure.Page}<${pageItemType}>>`;

  // Request factory method names
  const requestMethodName = `Create${operationName}Request`;
  const nextRequestMethodName = `CreateNext${operationName}Request`;

  // Build the GetNextResponse private method
  const getNextResponseMethod = buildGetNextResponseMethod(
    isAsync,
    hasNextLink,
    hasContinuationToken,
    requestMethodName,
    nextRequestMethodName,
    operationParams,
    tokenParamName,
    scopeName,
    client,
    pipelineTypes,
  );

  // Build the AsPages method body
  const asPagesBody = hasNextLink
    ? buildNextLinkAsPagesBody(
        isAsync,
        isConvenience,
        responseTypeExpr!,
        nextLinkPropertyPath!,
        isNextLinkString,
        pageItemType,
        itemPropertyPath,
        options,
      )
    : hasContinuationToken
      ? isContinuationTokenHeader
        ? buildContinuationTokenHeaderAsPagesBody(
            isAsync,
            isConvenience,
            pageItemType,
            continuationTokenHeaderName!,
            responseTypeExpr,
            itemPropertyPath,
            options,
          )
        : buildContinuationTokenBodyAsPagesBody(
            isAsync,
            isConvenience,
            responseTypeExpr!,
            continuationTokenPropertyPath!,
            pageItemType,
            itemPropertyPath,
            options,
            tokenParamName,
          )
      : buildSinglePageAsPagesBody(
          isAsync,
          isConvenience,
          responseTypeExpr,
          pageItemType,
          itemPropertyPath,
          options,
        );

  return (
    <SourceFile path={`src/Generated/CollectionResults/${className}.cs`}>
      {header}
      {"\n\n"}
      <Namespace name={client.namespace}>
        <ClassDeclaration
          internal
          partial
          name={className}
          baseType={baseType}
        >
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
            name="context"
            type={pipelineTypes.requestOptions}
          />
          {"\n\n"}
          {buildConstructorDoc(className, clientName, operationParams)}
          {"\n"}
          <OverloadConstructor
            public
            parameters={[
              { name: "client", type: refkey(client) },
              ...operationParams.map((p) => ({
                name: p.name,
                type: p.type as Children,
              })),
              {
                name: "context",
                type: pipelineTypes.requestOptions as Children,
              },
            ]}
            baseInitializer="context?.CancellationToken ?? default"
          >
            _client = client;
            {operationParams.map((p) => `\n_${p.name} = ${p.name};`)}
            {"\n"}
            _context = context;
          </OverloadConstructor>
          {"\n\n"}
          {buildAsPagesDoc()}
          {"\n"}
          <Method
            public
            override
            {...(isAsync ? { async: true } : {})}
            name="AsPages"
            returns={asPagesReturnType}
            parameters={[
              { name: "continuationToken", type: "string" as Children },
              {
                name: "pageSizeHint",
                type: "int?" as Children,
              },
            ]}
          >
            {asPagesBody}
          </Method>
          {"\n\n"}
          {getNextResponseMethod}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

// --- AsPages Body Builders ---

/**
 * Builds the AsPages body for the single-page paging strategy.
 *
 * Sends a single request, extracts items, and yields one Page<T>.
 * For protocol (BinaryData): serializes each item via ModelReaderWriter.
 * For convenience (typed T): casts the items list directly.
 */
function buildSinglePageAsPagesBody(
  isAsync: boolean,
  isConvenience: boolean,
  responseTypeExpr: Children | undefined,
  pageItemType: Children,
  itemPropertyPath: string | undefined,
  options: ResolvedCSharpEmitterOptions,
): Children[] {
  const getResponse = isAsync
    ? code`${Azure.Response} response = await GetNextResponseAsync(pageSizeHint, null).ConfigureAwait(false);`
    : code`${Azure.Response} response = GetNextResponse(pageSizeHint, null);`;

  const itemsExtraction = buildItemsExtraction(
    isConvenience,
    responseTypeExpr,
    pageItemType,
    itemPropertyPath,
    options,
  );

  return [
    getResponse,
    "\n",
    ...itemsExtraction,
  ];
}

/**
 * Builds the AsPages body for the next-link paging strategy.
 *
 * Generates a while(true) loop that:
 * 1. Calls GetNextResponse with pageSizeHint and nextPage URI
 * 2. Extracts items from the response and yields a Page<T>
 * 3. Extracts next-link URI from the response
 * 4. Terminates when next-link is null
 */
function buildNextLinkAsPagesBody(
  isAsync: boolean,
  isConvenience: boolean,
  responseTypeExpr: Children,
  nextLinkPropertyPath: string,
  isStringNextLink: boolean,
  pageItemType: Children,
  itemPropertyPath: string | undefined,
  options: ResolvedCSharpEmitterOptions,
): Children[] {
  const getResponse = isAsync
    ? code`${Azure.Response} response = await GetNextResponseAsync(pageSizeHint, nextPage).ConfigureAwait(false);`
    : code`${Azure.Response} response = GetNextResponse(pageSizeHint, nextPage);`;

  // Extract the next-link value from the response
  const nextLinkExtraction: Children[] = isStringNextLink
    ? [
        code`    string nextPageString = ((${responseTypeExpr})response).${nextLinkPropertyPath};`,
        "\n",
        "    if (string.IsNullOrEmpty(nextPageString))",
        "\n",
        "    {",
        "\n",
        "        yield break;",
        "\n",
        "    }",
        "\n",
        code`    nextPage = new ${System.Uri}(nextPageString, UriKind.RelativeOrAbsolute);`,
      ]
    : [
        code`    nextPage = ((${responseTypeExpr})response).${nextLinkPropertyPath};`,
        "\n",
        "    if (nextPage == null)",
        "\n",
        "    {",
        "\n",
        "        yield break;",
        "\n",
        "    }",
      ];

  const itemsExtraction = buildItemsExtractionInLoop(
    isConvenience,
    responseTypeExpr,
    pageItemType,
    itemPropertyPath,
    options,
    isStringNextLink,
  );

  return [
    code`${System.Uri} nextPage = continuationToken != null ? new ${System.Uri}(continuationToken) : null;`,
    "\n",
    "while (true)",
    "\n",
    "{",
    "\n",
    "    ",
    getResponse,
    "\n",
    "    if (response is null)",
    "\n",
    "    {",
    "\n",
    "        yield break;",
    "\n",
    "    }",
    "\n",
    ...itemsExtraction,
    "\n",
    ...nextLinkExtraction,
    "\n",
    "}",
  ];
}

/**
 * Builds the AsPages body for the body-based continuation-token paging strategy.
 *
 * Generates a while(true) loop that sends requests with a token parameter,
 * extracts items and the next token from the response body, and terminates
 * when the token is null/empty.
 */
function buildContinuationTokenBodyAsPagesBody(
  isAsync: boolean,
  isConvenience: boolean,
  responseTypeExpr: Children,
  tokenPropertyPath: string,
  pageItemType: Children,
  itemPropertyPath: string | undefined,
  options: ResolvedCSharpEmitterOptions,
  tokenParamName?: string,
): Children[] {
  const getResponse = isAsync
    ? code`${Azure.Response} response = await GetNextResponseAsync(pageSizeHint, nextPage).ConfigureAwait(false);`
    : code`${Azure.Response} response = GetNextResponse(pageSizeHint, nextPage);`;

  const itemsExtraction = buildItemsExtractionInLoop(
    isConvenience,
    responseTypeExpr,
    pageItemType,
    itemPropertyPath,
    options,
    false,
    true,
  );

  // The initial token value falls back to the stored field from the constructor
  const tokenField = tokenParamName ? `_${tokenParamName}` : "null";

  return [
    `string nextPage = continuationToken ?? ${tokenField};`,
    "\n",
    "while (true)",
    "\n",
    "{",
    "\n",
    "    ",
    getResponse,
    "\n",
    "    if (response is null)",
    "\n",
    "    {",
    "\n",
    "        yield break;",
    "\n",
    "    }",
    "\n",
    ...itemsExtraction,
    "\n",
    code`    nextPage = ((${responseTypeExpr})response).${tokenPropertyPath};`,
    "\n",
    "    if (string.IsNullOrEmpty(nextPage))",
    "\n",
    "    {",
    "\n",
    "        yield break;",
    "\n",
    "    }",
    "\n",
    "}",
  ];
}

/**
 * Builds the AsPages body for the header-based continuation-token paging strategy.
 *
 * Extracts the continuation token from a response HTTP header, creates pages,
 * and terminates when the header is absent or empty.
 */
function buildContinuationTokenHeaderAsPagesBody(
  isAsync: boolean,
  isConvenience: boolean,
  pageItemType: Children,
  headerName: string,
  responseTypeExpr: Children | undefined,
  itemPropertyPath: string | undefined,
  options: ResolvedCSharpEmitterOptions,
): Children[] {
  const getResponse = isAsync
    ? code`${Azure.Response} response = await GetNextResponseAsync(pageSizeHint, nextPage).ConfigureAwait(false);`
    : code`${Azure.Response} response = GetNextResponse(pageSizeHint, nextPage);`;

  const itemsExtraction = buildItemsExtractionInLoop(
    isConvenience,
    responseTypeExpr,
    pageItemType,
    itemPropertyPath,
    options,
    false,
    true,
  );

  return [
    "string nextPage = continuationToken;",
    "\n",
    "while (true)",
    "\n",
    "{",
    "\n",
    "    ",
    getResponse,
    "\n",
    "    if (response is null)",
    "\n",
    "    {",
    "\n",
    "        yield break;",
    "\n",
    "    }",
    "\n",
    ...itemsExtraction,
    "\n",
    `    if (response.Headers.TryGetValue("${headerName}", out string value) && !string.IsNullOrEmpty(value))`,
    "\n",
    "    {",
    "\n",
    code`        nextPage = value;`,
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
    "}",
  ];
}

// --- Items Extraction Helpers ---

/**
 * Builds the items extraction and Page<T>.FromValues yield for single-page strategy.
 *
 * For protocol (BinaryData): serializes each item via ModelReaderWriter.Write.
 * For convenience (typed T): casts the items list from the response model.
 */
function buildItemsExtraction(
  isConvenience: boolean,
  responseTypeExpr: Children | undefined,
  pageItemType: Children,
  itemPropertyPath: string | undefined,
  options: ResolvedCSharpEmitterOptions,
): Children[] {
  if (isConvenience && responseTypeExpr && itemPropertyPath) {
    // Convenience: cast items directly
    return [
      code`${responseTypeExpr} result = (${responseTypeExpr})response;`,
      "\n",
      code`yield return ${Azure.Page}<${pageItemType}>.FromValues((${SystemCollectionsGeneric.IReadOnlyList}<${pageItemType}>)result.${itemPropertyPath}, null, response);`,
    ];
  }

  // Protocol (BinaryData): serialize items
  if (responseTypeExpr && itemPropertyPath) {
    return [
      code`${responseTypeExpr} result = (${responseTypeExpr})response;`,
      "\n",
      code`${SystemCollectionsGeneric.List}<${System.BinaryData}> items = new ${SystemCollectionsGeneric.List}<${System.BinaryData}>();`,
      "\n",
      `foreach (var item in result.${itemPropertyPath})`,
      "\n",
      "{",
      "\n",
      code`    items.Add(${SystemClientModelPrimitives.ModelReaderWriter}.Write(item, ModelSerializationExtensions.WireOptions, ${modelReaderWriterContextRefkey()}.Default));`,
      "\n",
      "}",
      "\n",
      code`yield return ${Azure.Page}<${System.BinaryData}>.FromValues(items, null, response);`,
    ];
  }

  // Fallback: yield empty page
  return [
    code`yield return ${Azure.Page}<${pageItemType}>.FromValues(new ${SystemCollectionsGeneric.List}<${pageItemType}>(), null, response);`,
  ];
}

/**
 * Builds items extraction inside a while(true) paging loop.
 * Used by next-link and continuation-token strategies.
 *
 * For protocol (BinaryData): serializes items via ModelReaderWriter and includes
 * the continuation token in the Page.FromValues call.
 * For convenience (typed T): casts items directly.
 */
function buildItemsExtractionInLoop(
  isConvenience: boolean,
  responseTypeExpr: Children | undefined,
  pageItemType: Children,
  itemPropertyPath: string | undefined,
  options: ResolvedCSharpEmitterOptions,
  isNextLink: boolean,
  isContinuationToken?: boolean,
): Children[] {
  // Determine the continuation token expression for Page.FromValues
  const continuationTokenExpr = isNextLink
    ? "nextPage?.IsAbsoluteUri == true ? nextPage.AbsoluteUri : nextPage?.OriginalString"
    : isContinuationToken
      ? "nextPage"
      : "null";

  if (isConvenience && responseTypeExpr && itemPropertyPath) {
    return [
      code`    ${responseTypeExpr} result = (${responseTypeExpr})response;`,
      "\n",
      code`    yield return ${Azure.Page}<${pageItemType}>.FromValues((${SystemCollectionsGeneric.IReadOnlyList}<${pageItemType}>)result.${itemPropertyPath}, ${continuationTokenExpr}, response);`,
    ];
  }

  if (responseTypeExpr && itemPropertyPath) {
    return [
      code`    ${responseTypeExpr} result = (${responseTypeExpr})response;`,
      "\n",
      code`    ${SystemCollectionsGeneric.List}<${System.BinaryData}> items = new ${SystemCollectionsGeneric.List}<${System.BinaryData}>();`,
      "\n",
      `    foreach (var item in result.${itemPropertyPath})`,
      "\n",
      "    {",
      "\n",
      code`        items.Add(${SystemClientModelPrimitives.ModelReaderWriter}.Write(item, ModelSerializationExtensions.WireOptions, ${modelReaderWriterContextRefkey()}.Default));`,
      "\n",
      "    }",
      "\n",
      code`    yield return ${Azure.Page}<${System.BinaryData}>.FromValues(items, ${continuationTokenExpr}, response);`,
    ];
  }

  return [
    code`    yield return ${Azure.Page}<${pageItemType}>.FromValues(new ${SystemCollectionsGeneric.List}<${pageItemType}>(), ${continuationTokenExpr}, response);`,
  ];
}

// --- GetNextResponse Method Builder ---

/**
 * Builds the private GetNextResponse / GetNextResponseAsync method.
 *
 * This method handles:
 * 1. Creating the HTTP message via the client's Create{Op}Request method
 * 2. Wrapping the pipeline call in a DiagnosticScope for distributed tracing
 * 3. Returning the raw Azure.Response
 *
 * The method signature varies by paging strategy:
 * - Next-link: `(int? pageSizeHint, Uri nextLink)` — first call uses null nextLink
 * - Continuation-token: `(int? pageSizeHint, string continuationToken)` — token substituted
 * - Single-page: `(int? pageSizeHint, object _)` — placeholder second param
 */
function buildGetNextResponseMethod(
  isAsync: boolean,
  hasNextLink: boolean,
  hasContinuationToken: boolean,
  requestMethodName: string,
  nextRequestMethodName: string,
  operationParams: { name: string; type: Children }[],
  tokenParamName: string | undefined,
  scopeName: string,
  client: SdkClientType<SdkHttpOperation>,
  pipelineTypes: ReturnType<typeof getPipelineTypes>,
): Children {
  const methodName = isAsync ? "GetNextResponseAsync" : "GetNextResponse";
  const returnType = isAsync
    ? code`${SystemThreadingTasks.ValueTask}<${Azure.Response}>`
    : Azure.Response;

  // Build message creation expression based on strategy
  let messageCreation: Children;
  let secondParamName: string;
  let secondParamType: Children;

  if (hasNextLink) {
    secondParamName = "nextLink";
    secondParamType = System.Uri as Children;
    const requestArgs = buildStoredFieldArgs(operationParams);
    messageCreation = code`${pipelineTypes.message} message = ${secondParamName} != null ? _client.${nextRequestMethodName}(${secondParamName}, _context) : _client.${requestMethodName}(${requestArgs});`;
  } else if (hasContinuationToken && tokenParamName) {
    secondParamName = "continuationToken";
    secondParamType = "string" as Children;
    // Build args with token param replaced by local continuationToken variable
    const args = operationParams.map((p) =>
      p.name === tokenParamName ? "continuationToken" : `_${p.name}`,
    );
    args.push("_context");
    messageCreation = code`${pipelineTypes.message} message = _client.${requestMethodName}(${args.join(", ")});`;
  } else {
    // Single-page: no meaningful second param
    secondParamName = "_";
    secondParamType = "object" as Children;
    const requestArgs = buildStoredFieldArgs(operationParams);
    messageCreation = code`${pipelineTypes.message} message = _client.${requestMethodName}(${requestArgs});`;
  }

  const processExpr = isAsync
    ? `return await _client.Pipeline.ProcessMessageAsync(message, _context).ConfigureAwait(false);`
    : `return _client.Pipeline.ProcessMessage(message, _context);`;

  return (
    <>
      {"/// <summary> Gets the next response from the service. </summary>"}
      {"\n"}
      <Method
        private
        {...(isAsync ? { async: true } : {})}
        name={methodName}
        returns={returnType}
        parameters={[
          { name: "pageSizeHint", type: "int?" as Children },
          { name: secondParamName, type: secondParamType },
        ]}
      >
        {messageCreation}
        {"\n"}
        {code`using ${AzureCorePipeline.DiagnosticScope} scope = _client.ClientDiagnostics.CreateScope("${scopeName}");`}
        {"\n"}
        {"scope.Start();"}
        {"\n"}
        {"try"}
        {"\n"}
        {"{"}
        {"\n"}
        {`    ${processExpr}`}
        {"\n"}
        {"}"}
        {"\n"}
        {code`catch (${System.Exception} e)`}
        {"\n"}
        {"{"}
        {"\n"}
        {"    scope.Failed(e);"}
        {"\n"}
        {"    throw;"}
        {"\n"}
        {"}"}
      </Method>
    </>
  );
}

// --- Shared Helpers ---

/**
 * Builds stored field args for the request factory method.
 * Maps each param to its stored field (_paramName) and appends _context.
 */
function buildStoredFieldArgs(params: { name: string }[]): string {
  const args = params.map((p) => `_${p.name}`);
  args.push("_context");
  return args.join(", ");
}

/**
 * Builds a C# property path for accessing a value from a response model.
 * Converts paging metadata segments into a dotted property path with
 * null-conditional operators for intermediate segments.
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

/**
 * Checks if the last segment of a next-link path is a string type (not url/Uri).
 */
function isStringType(
  segments: (SdkServiceResponseHeader | SdkModelPropertyType)[],
): boolean {
  if (segments.length === 0) return false;
  const lastSegment = segments[segments.length - 1];
  if ("type" in lastSegment) {
    const sdkType = lastSegment.type;
    return sdkType.kind === "string";
  }
  return false;
}

// --- XML Doc Comment Builders ---

/**
 * Builds XML doc comments for the collection result constructor.
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
    `\n/// <param name="context"> The request context, which can override default behaviors of the client pipeline on a per-call basis. </param>`,
  );

  return result;
}

/**
 * Builds XML doc comments for the AsPages method.
 */
function buildAsPagesDoc(): string[] {
  return [
    `/// <summary> Gets the pages of the collection. </summary>`,
    `\n/// <param name="continuationToken"> A continuation token from a previous call, if resuming pagination. </param>`,
    `\n/// <param name="pageSizeHint"> A hint for the number of items per page. </param>`,
    `\n/// <returns> The pages of the collection. </returns>`,
  ];
}
