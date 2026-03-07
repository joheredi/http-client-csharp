import {
  ClassDeclaration,
  Method,
  Namespace,
  SourceFile,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import { code, namekey } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
import type {
  CollectionFormat,
  SdkArrayType,
  SdkBodyParameter,
  SdkBuiltInType,
  SdkClientType,
  SdkDateTimeType,
  SdkDictionaryType,
  SdkDurationType,
  SdkHeaderParameter,
  SdkHttpOperation,
  SdkHttpResponse,
  SdkLroPagingServiceMethod,
  SdkPagingServiceMethod,
  SdkPathParameter,
  SdkQueryParameter,
  SdkServiceMethod,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { AzureCore } from "../../builtins/azure.js";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import {
  SystemClientModel,
  SystemClientModelPrimitives,
} from "../../builtins/system-client-model.js";
import { System } from "../../builtins/system.js";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getClientFileName } from "../../utils/clients.js";
import { getLicenseHeader } from "../../utils/header.js";
import { isProtocolParamValueType } from "../../utils/nullable.js";
import {
  buildSiblingNameSet,
  cleanOperationName,
} from "../../utils/operation-naming.js";
import {
  getContinuationTokenParamName,
  reorderTokenFirst,
} from "../../utils/parameter-ordering.js";
import {
  getPipelineTypes,
  type PipelineTypes,
} from "../../utils/pipeline-types.js";
import { isSpecialHeaderParam } from "../../utils/special-headers.js";
import {
  getConditionalHeaderGrouping,
  isConditionalHeaderParam,
} from "../../utils/conditional-headers.js";

/**
 * A unique set of success status codes that needs a PipelineMessageClassifier.
 */
interface ClassifierInfo {
  /** Sorted status codes (e.g., [200] or [200, 204]). */
  codes: number[];
  /** Suffix for the field/property name (e.g., "200" or "200204"). */
  suffix: string;
}

/**
 * A parsed segment of an HTTP operation path template.
 */
type PathSegment =
  | { kind: "literal"; value: string }
  | { kind: "parameter"; param: SdkPathParameter };

/**
 * Props for the {@link RestClientFile} component.
 */
export interface RestClientFileProps {
  /** The TCGC SDK client type representing a TypeSpec client or operation group. */
  client: SdkClientType<SdkHttpOperation>;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates a {ClassName}.RestClient.cs file containing the low-level HTTP
 * request factory methods for a client.
 *
 * This produces a partial class with the same name as the client, containing:
 * - Static PipelineMessageClassifier fields with lazy initialization
 * - Internal Create{Op}Request methods that build PipelineMessage instances
 *
 * Each request method constructs a URI with path and query parameters, creates
 * a PipelineMessage with the appropriate HTTP method and status classifier,
 * sets request headers (Content-Type, Accept, custom), attaches body content,
 * and applies per-request options.
 *
 * These methods are called by the protocol and convenience methods in the main
 * client file (generated separately).
 *
 * @example Generated output for a client with a GET and POST operation:
 * ```csharp
 * public partial class TestServiceClient
 * {
 *     private static PipelineMessageClassifier _pipelineMessageClassifier200;
 *
 *     private static PipelineMessageClassifier PipelineMessageClassifier200 =>
 *         _pipelineMessageClassifier200 ??=
 *             PipelineMessageClassifier.Create(stackalloc ushort[] { 200 });
 *
 *     internal PipelineMessage CreateGetThingRequest(string id, RequestOptions options)
 *     {
 *         ClientUriBuilder uri = new ClientUriBuilder();
 *         uri.Reset(_endpoint);
 *         uri.AppendPath("/things/", false);
 *         uri.AppendPath(id, true);
 *         PipelineMessage message = Pipeline.CreateMessage(
 *             uri.ToUri(), "GET", PipelineMessageClassifier200);
 *         PipelineRequest request = message.Request;
 *         request.Headers.Set("Accept", "application/json");
 *         message.Apply(options);
 *         return message;
 *     }
 * }
 * ```
 */
export function RestClientFile(props: RestClientFileProps) {
  const { client, options } = props;
  const header = getLicenseHeader(options);
  const namePolicy = useCSharpNamePolicy();
  const toClassName = (name: string) => namePolicy.getName(name, "class");
  // Use getClientFileName for both the class name and file name. For sub-clients
  // at depth 2+, this produces hierarchical names (e.g., "PathParametersReservedExpansion")
  // matching the legacy emitter convention.
  const className = getClientFileName(client, toClassName);
  const fileName = className;
  const siblingNames = buildSiblingNameSet(client.methods, (n) =>
    namePolicy.getName(n, "class"),
  );
  const pipelineTypes = getPipelineTypes(options.flavor ?? "unbranded");

  // Get service methods that have HTTP operations.
  // Filter to methods with an HTTP operation (basic, paging, lro, lropaging).
  const methods = client.methods.filter(
    (m): m is SdkServiceMethod<SdkHttpOperation> =>
      "operation" in m &&
      (m as SdkServiceMethod<SdkHttpOperation>).operation?.kind === "http",
  );

  // Skip if client has no operations — sub-clients without operations
  // (pure grouping nodes) don't need a RestClient file.
  if (methods.length === 0) return null;

  // Collect unique classifier status code sets across all operations
  const classifiers = getUniqueClassifiers(methods);

  // Use namekey with ignoreNameConflict since the canonical class declaration
  // lives in ClientFile.tsx. Without this flag, Alloy would rename this second
  // partial declaration with a "_2" suffix.
  const partialName = namekey(className, { ignoreNameConflict: true });

  return (
    <SourceFile path={`src/Generated/${fileName}.RestClient.cs`}>
      {header}
      {"\n\n"}
      <Namespace name={client.namespace}>
        {"/// <summary></summary>"}
        {"\n"}
        <ClassDeclaration
          public
          partial
          name={partialName as unknown as string}
        >
          <ClassifierDeclarations
            classifiers={classifiers}
            pipelineTypes={pipelineTypes}
          />
          {methods.map((method) => (
            <>
              {"\n\n"}
              <CreateRequestMethod
                method={method}
                classifiers={classifiers}
                siblingNames={siblingNames}
                pipelineTypes={pipelineTypes}
                flavor={options.flavor}
              />
            </>
          ))}
          {methods.filter(isPagingWithNextLink).map((method) => (
            <>
              {"\n\n"}
              <CreateNextRequestMethod
                method={
                  method as SdkServiceMethod<SdkHttpOperation> &
                    (
                      | SdkPagingServiceMethod<SdkHttpOperation>
                      | SdkLroPagingServiceMethod<SdkHttpOperation>
                    )
                }
                classifiers={classifiers}
                siblingNames={siblingNames}
                pipelineTypes={pipelineTypes}
                flavor={options.flavor}
              />
            </>
          ))}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

// =============================================================================
// Helper component: ClassifierDeclarations
// =============================================================================

interface ClassifierDeclarationsProps {
  classifiers: ClassifierInfo[];
  /** Flavor-resolved pipeline type references for classifier types. */
  pipelineTypes: PipelineTypes;
}

/**
 * Generates static response classifier fields and their lazy-initialized
 * property accessors.
 *
 * For unbranded flavor:
 * ```csharp
 * private static PipelineMessageClassifier _pipelineMessageClassifier200;
 * private static PipelineMessageClassifier PipelineMessageClassifier200 =>
 *     _pipelineMessageClassifier200 ??=
 *         PipelineMessageClassifier.Create(stackalloc ushort[] { 200 });
 * ```
 *
 * For Azure flavor:
 * ```csharp
 * private static ResponseClassifier _pipelineMessageClassifier200;
 * private static ResponseClassifier PipelineMessageClassifier200 =>
 *     _pipelineMessageClassifier200 ??=
 *         new StatusCodeClassifier(stackalloc ushort[] { 200 });
 * ```
 *
 * The lazy initialization pattern ensures the classifier is only allocated
 * once and then reused for all subsequent requests with the same status codes.
 */
function ClassifierDeclarations(props: ClassifierDeclarationsProps) {
  const { classifiers, pipelineTypes } = props;
  const classifierBase = pipelineTypes.classifierBase;
  const isAzure = !!pipelineTypes.uriBuilder; // Azure has uriBuilder set

  return (
    <>
      {classifiers.map((c, i) => {
        const fieldName = `_pipelineMessageClassifier${c.suffix}`;
        const propName = `PipelineMessageClassifier${c.suffix}`;
        const codesList = c.codes.join(", ");

        return (
          <>
            {i > 0 && "\n"}
            {code`private static ${classifierBase} ${fieldName};`}
            {"\n\n"}
            {isAzure
              ? code`private static ${classifierBase} ${propName} => ${fieldName} ??= new ${AzureCore.StatusCodeClassifier}(stackalloc ushort[] { ${codesList} });`
              : code`private static ${classifierBase} ${propName} => ${fieldName} ??= ${classifierBase}.Create(stackalloc ushort[] { ${codesList} });`}
          </>
        );
      })}
    </>
  );
}

// =============================================================================
// Helper component: CreateRequestMethod
// =============================================================================

interface CreateRequestMethodProps {
  method: SdkServiceMethod<SdkHttpOperation>;
  classifiers: ClassifierInfo[];
  /** PascalCase names of all sibling methods, used to avoid List→Get naming collisions. */
  siblingNames: Set<string>;
  /** Flavor-resolved pipeline type references for HttpMessage/Request/RequestOptions. */
  pipelineTypes: PipelineTypes;
  /** The emitter flavor ("azure" or "unbranded") for flavor-conditional header handling. */
  flavor?: string;
}

/**
 * Generates an internal Create{Name}Request method that builds a PipelineMessage
 * for a single HTTP operation.
 *
 * The method body follows the System.ClientModel request building pattern:
 * 1. Create and configure a ClientUriBuilder with path and query parameters
 * 2. Create a PipelineMessage with URI, HTTP method, and status classifier
 * 3. Set request headers (custom headers, Content-Type, Accept)
 * 4. Attach request body content (if applicable)
 * 5. Apply per-request options
 * 6. Return the configured message
 */
function CreateRequestMethod(props: CreateRequestMethodProps) {
  const { method, siblingNames, pipelineTypes, flavor } = props;
  const operation = method.operation;
  const namePolicy = useCSharpNamePolicy();

  // Method name: Create{PascalCaseName}Request
  const operationName = cleanOperationName(
    namePolicy.getName(method.name, "class"),
    siblingNames,
  );
  const methodName = `Create${operationName}Request`;

  // HTTP method (uppercase): "get" → "GET"
  const httpVerb = operation.verb.toUpperCase();

  // Get the classifier for this operation's success status codes
  const statusCodes = getSuccessStatusCodes(method);
  const classifierSuffix = statusCodes.join("");
  const classifierRef = `PipelineMessageClassifier${classifierSuffix}`;

  // Separate HTTP parameters by kind
  const pathParams = operation.parameters.filter(
    (p): p is SdkPathParameter => p.kind === "path",
  );
  const queryParams = operation.parameters.filter(
    (p): p is SdkQueryParameter => p.kind === "query",
  );
  const headerParams = operation.parameters.filter(
    (p): p is SdkHeaderParameter => p.kind === "header",
  );
  const bodyParam = operation.bodyParam;

  // Build method parameter list (sorted by convention)
  let methodParams = buildMethodParams(
    pathParams,
    queryParams,
    headerParams,
    bodyParam,
    pipelineTypes,
    flavor,
  );

  // For paging methods with continuation tokens, reorder params so the
  // token comes first in the CreateRequest signature (matching legacy emitter).
  if (method.kind === "paging" || method.kind === "lropaging") {
    const pagingMethod = method as
      | SdkPagingServiceMethod<SdkHttpOperation>
      | SdkLroPagingServiceMethod<SdkHttpOperation>;
    const tokenParamName = getContinuationTokenParamName(
      pagingMethod.pagingMetadata,
    );
    methodParams = reorderTokenFirst(methodParams, tokenParamName);
  }

  // Build a function that converts TypeSpec parameter names to valid C#
  // identifiers using the name policy (e.g., "new-parameter" → "newParameter").
  // This must match the transformation applied by the <Method> component to
  // parameter declarations, so that body code references match the signature.
  const getParamName = (name: string) => namePolicy.getName(name, "parameter");

  // Build method body
  const body = buildRequestBody(
    operation,
    pathParams,
    queryParams,
    headerParams,
    bodyParam,
    httpVerb,
    classifierRef,
    getParamName,
    pipelineTypes,
    flavor,
  );

  return (
    <Method
      internal
      name={namekey(methodName, { ignoreNameConflict: true })}
      returns={pipelineTypes.message}
      parameters={methodParams}
    >
      {body}
    </Method>
  );
}

/**
 * Checks if a service method is a paging method with next-link segments.
 * These methods need an additional `CreateNext{Op}Request` method
 * that builds the request from a next-page URI.
 */
function isPagingWithNextLink(
  method: SdkServiceMethod<SdkHttpOperation>,
): boolean {
  if (method.kind !== "paging" && method.kind !== "lropaging") return false;
  const pagingMethod = method as
    | SdkPagingServiceMethod<SdkHttpOperation>
    | SdkLroPagingServiceMethod<SdkHttpOperation>;
  const nextLinkSegments = pagingMethod.pagingMetadata.nextLinkSegments;
  return nextLinkSegments !== undefined && nextLinkSegments.length > 0;
}

/**
 * Props for the {@link CreateNextRequestMethod} component.
 */
interface CreateNextRequestMethodProps {
  method: SdkServiceMethod<SdkHttpOperation> &
    (
      | SdkPagingServiceMethod<SdkHttpOperation>
      | SdkLroPagingServiceMethod<SdkHttpOperation>
    );
  classifiers: ClassifierInfo[];
  siblingNames: Set<string>;
  /** Flavor-resolved pipeline type references for HttpMessage/Request/RequestOptions. */
  pipelineTypes: PipelineTypes;
  /** The emitter flavor ("azure" or "unbranded") for flavor-conditional patterns. */
  flavor?: string;
}

/**
 * Generates a `CreateNext{Op}Request(Uri nextPage, RequestOptions options)` method
 * for paging operations that use next-link pagination.
 *
 * This method creates an HTTP request from a next-page URI extracted from a
 * previous response. It handles both absolute and relative URIs, combining
 * relative URIs with the client's base endpoint.
 */
function CreateNextRequestMethod(props: CreateNextRequestMethodProps) {
  const { method, siblingNames, pipelineTypes, flavor } = props;
  const isAzure = flavor === "azure";
  const operation = method.operation;
  const namePolicy = useCSharpNamePolicy();

  const operationName = cleanOperationName(
    namePolicy.getName(method.name, "class"),
    siblingNames,
  );
  const methodName = `CreateNext${operationName}Request`;

  // HTTP method (uppercase): "get" → "GET"
  const httpVerb = operation.verb.toUpperCase();

  // Get the classifier for this operation's success status codes
  const statusCodes = getSuccessStatusCodes(method);
  const classifierSuffix = statusCodes.join("");
  const classifierRef = `PipelineMessageClassifier${classifierSuffix}`;

  // Accept header from operation responses
  const acceptHeader = getAcceptHeaderValue(operation.responses);
  const headerSetMethod = isAzure ? "SetValue" : "Set";

  // Build method body: URI handling + message creation + headers + options
  const body: Children[] = [];

  if (isAzure) {
    body.push(
      code`${AzureCore.RawRequestUriBuilder} uri = new ${AzureCore.RawRequestUriBuilder}();`,
    );
  } else {
    body.push("ClientUriBuilder uri = new ClientUriBuilder();");
  }

  body.push(
    "\n",
    "if (nextPage.IsAbsoluteUri)",
    "\n",
    "{",
    "\n",
    "    uri.Reset(nextPage);",
    "\n",
    "}",
    "\n",
    "else",
    "\n",
    "{",
    "\n",
    code`    uri.Reset(new ${System.Uri}(_endpoint, nextPage));`,
    "\n",
    "}",
  );

  if (isAzure) {
    body.push(
      "\n",
      code`${pipelineTypes.message} message = Pipeline.CreateMessage(options, ${classifierRef});`,
      "\n",
      code`${pipelineTypes.request} request = message.Request;`,
      "\nrequest.Uri = uri;",
    );
    const requestMethodProp = getAzureRequestMethodProperty(httpVerb);
    body.push(
      "\n",
      code`request.Method = ${AzureCore.RequestMethod}.${requestMethodProp};`,
    );
  } else {
    body.push(
      "\n",
      code`${pipelineTypes.message} message = Pipeline.CreateMessage(uri.ToUri(), "${httpVerb}", ${classifierRef});`,
      "\n",
      code`${pipelineTypes.request} request = message.Request;`,
    );
  }

  // Add Accept header if the operation specifies one
  if (acceptHeader) {
    body.push(
      "\n",
      `request.Headers.${headerSetMethod}("Accept", "${acceptHeader}");`,
    );
  }

  if (!isAzure) {
    body.push("\n", "message.Apply(options);");
  }
  body.push("\n", "return message;");

  return (
    <Method
      internal
      name={namekey(methodName, { ignoreNameConflict: true })}
      returns={pipelineTypes.message}
      parameters={[
        { name: "nextPage", type: System.Uri as Children },
        {
          name: "options",
          type: pipelineTypes.requestOptions as Children,
        },
      ]}
    >
      {body}
    </Method>
  );
}

// =============================================================================
// Utility functions
// =============================================================================

/**
 * Extracts unique sets of success status codes across all methods.
 * Each unique set gets a PipelineMessageClassifier field/property pair.
 */
function getUniqueClassifiers(
  methods: SdkServiceMethod<SdkHttpOperation>[],
): ClassifierInfo[] {
  const seen = new Map<string, ClassifierInfo>();

  for (const method of methods) {
    const codes = getSuccessStatusCodes(method);
    const suffix = codes.join("");
    if (!seen.has(suffix)) {
      seen.set(suffix, { codes, suffix });
    }
  }

  return Array.from(seen.values());
}

/**
 * Extracts success response status codes from an operation's responses.
 * Only includes non-error responses (the `responses` array, not `exceptions`).
 * Returns sorted unique status codes.
 */
function getSuccessStatusCodes(
  method: SdkServiceMethod<SdkHttpOperation>,
): number[] {
  const codes = new Set<number>();

  for (const response of method.operation.responses) {
    if (typeof response.statusCodes === "number") {
      codes.add(response.statusCodes);
    } else {
      // HttpStatusCodeRange: expand the range
      for (
        let i = response.statusCodes.start;
        i <= response.statusCodes.end;
        i++
      ) {
        codes.add(i);
      }
    }
  }

  return Array.from(codes).sort((a, b) => a - b);
}

/**
 * Checks if a type is a constant (literal value) type.
 */
function isConstantType(type: SdkType): boolean {
  return type.kind === "constant";
}

/**
 * Gets the literal value expression for a constant type as a C# code string.
 * Handles string, boolean, and numeric constant values.
 */
function getConstantValueExpression(type: SdkType): string {
  if (type.kind !== "constant") return "";

  const value = type.value;

  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "boolean") {
    return `TypeFormatters.ConvertToString(${value})`;
  }
  if (typeof value === "number") {
    return `${value}.ToString()`;
  }

  return `"${value}"`;
}

/**
 * Gets the C# type expression for a protocol-level parameter.
 *
 * For protocol methods (CreateRequest), enums are unwrapped to their
 * underlying value type (e.g., string enum → string) since protocol
 * methods work with raw wire types.
 *
 * Returns either a string (for C# keywords like "string", "int") or
 * a refkey (for types needing using directives like DateTimeOffset, Uri).
 */
function getProtocolTypeExpression(type: SdkType): Children {
  const unwrapped = unwrapType(type);

  switch (unwrapped.kind) {
    // C# keyword types — no using directive needed
    case "string":
      return "string";
    case "int32":
      return "int";
    case "int64":
      return "long";
    case "float32":
      return "float";
    case "float64":
      return "double";
    case "boolean":
      return "bool";
    case "int8":
      return "sbyte";
    case "uint8":
      return "byte";
    case "int16":
      return "short";
    case "uint16":
      return "ushort";
    case "uint32":
      return "uint";
    case "uint64":
      return "ulong";
    case "decimal":
    case "decimal128":
      return "decimal";

    // Types needing using System; — use refkeys
    case "utcDateTime":
    case "offsetDateTime":
      return System.DateTimeOffset;
    case "duration":
      return System.TimeSpan;
    case "url":
      return System.Uri;
    case "bytes":
      return System.BinaryData;

    // Enum → unwrap to underlying value type
    case "enum":
      return getProtocolTypeExpression(unwrapped.valueType);
    case "enumvalue":
      return getProtocolTypeExpression(unwrapped.enumType.valueType);

    // Array → IEnumerable<elementType>
    case "array": {
      const elementTypeExpr = getProtocolTypeExpression(
        (unwrapped as SdkArrayType).valueType,
      );
      return code`${SystemCollectionsGeneric.IEnumerable}<${elementTypeExpr}>`;
    }

    // Dict → IDictionary<string, valueType> for record-style path/query params
    case "dict": {
      const valueTypeExpr = getProtocolTypeExpression(
        (unwrapped as SdkDictionaryType).valueType,
      );
      return code`${SystemCollectionsGeneric.IDictionary}<string, ${valueTypeExpr}>`;
    }

    // Default fallback for complex types
    default:
      return "string";
  }
}

/**
 * Builds the method parameter list for a CreateRequest method.
 *
 * Parameters are ordered following the legacy emitter convention:
 * 1. Path parameters (priority 0)
 * 2. Required header/query parameters (priority 100)
 * 3. Body parameter as BinaryContent (priority 200/300)
 * 4. Optional header/query parameters (priority 400)
 * 5. RequestOptions (always last)
 *
 * Parameters that are constant (literal values), client-level fields,
 * or implicit Content-Type headers are excluded from the signature.
 */
function buildMethodParams(
  pathParams: SdkPathParameter[],
  queryParams: SdkQueryParameter[],
  headerParams: SdkHeaderParameter[],
  bodyParam?: SdkBodyParameter,
  pipelineTypes?: PipelineTypes,
  flavor?: string,
): Array<{ name: string; type: Children }> {
  const params: Array<{
    name: string;
    type: Children;
    priority: number;
    index: number;
  }> = [];
  let index = 0;

  // Path parameters (priority 0)
  for (const p of pathParams) {
    if (isConstantType(p.type) || p.onClient) continue;
    params.push({
      name: p.name,
      type: getProtocolTypeExpression(p.type),
      priority: 0,
      index: index++,
    });
  }

  // Required header parameters (priority 100), then optional (priority 400)
  // For Azure flavor, conditional headers (If-Match, If-None-Match,
  // If-Modified-Since, If-Unmodified-Since) are grouped into a single
  // parameter (ETag?, MatchConditions, or RequestConditions).
  const conditionalGrouping = getConditionalHeaderGrouping(
    headerParams,
    flavor,
  );
  let conditionalParamAdded = false;

  for (const p of headerParams) {
    if (isConstantType(p.type) || p.onClient) continue;
    if (isImplicitContentTypeHeader(p)) continue;
    if (isSpecialHeaderParam(p, flavor)) continue;

    // Azure conditional header grouping: skip individual params,
    // add the grouped param once at the position of the first conditional header.
    if (conditionalGrouping.type !== "none" && isConditionalHeaderParam(p)) {
      if (!conditionalParamAdded) {
        conditionalParamAdded = true;
        // Grouped conditions are always optional (priority 400)
        const typeExpr =
          conditionalGrouping.type === "etag"
            ? code`${conditionalGrouping.paramType}?`
            : conditionalGrouping.paramType;
        params.push({
          name: conditionalGrouping.paramName,
          type: typeExpr,
          priority: 400,
          index: index++,
        });
      }
      continue;
    }

    const priority = p.optional ? 400 : 100;
    const typeExpr = maybeNullable(
      getProtocolTypeExpression(p.type),
      p.type,
      p.optional,
    );
    params.push({
      name: p.name,
      type: typeExpr,
      priority,
      index: index++,
    });
  }

  // Required query parameters (priority 100), then optional (priority 400)
  for (const p of queryParams) {
    if (isConstantType(p.type) || p.onClient) continue;
    const priority = p.optional ? 400 : 100;
    const typeExpr = maybeNullable(
      getProtocolTypeExpression(p.type),
      p.type,
      p.optional,
    );
    params.push({
      name: p.name,
      type: typeExpr,
      priority,
      index: index++,
    });
  }

  // Body parameter as BinaryContent (priority 200 if required, 300 if optional)
  if (bodyParam && !isConstantType(bodyParam.type)) {
    const priority = bodyParam.optional ? 300 : 200;
    params.push({
      name: "content",
      type: pipelineTypes?.binaryContent ?? SystemClientModel.BinaryContent,
      priority,
      index: index++,
    });

    // For multipart/form-data operations, add a contentType string parameter
    // immediately after the body parameter. The contentType includes the
    // boundary string and must be passed dynamically.
    if (isMultipartFormData(bodyParam)) {
      params.push({
        name: "contentType",
        type: "string",
        priority: priority + 1,
        index: index++,
      });
    }
  }

  // Sort by priority, then by original order for stability
  params.sort((a, b) => a.priority - b.priority || a.index - b.index);

  // Build final list: sorted params + RequestOptions
  const result = params.map(({ name, type }) => ({ name, type }));
  result.push({
    name: "options",
    type:
      pipelineTypes?.requestOptions ??
      SystemClientModelPrimitives.RequestOptions,
  });

  return result;
}

/**
 * Checks if a header parameter is the Content-Type header that should be
 * derived from the body parameter's content type rather than passed as
 * a method parameter.
 */
function isImplicitContentTypeHeader(param: SdkHeaderParameter): boolean {
  return param.serializedName.toLowerCase() === "content-type";
}

/**
 * Checks if a header parameter is a constant-valued Accept header.
 * Constant Accept headers are skipped in the regular header loop because
 * Accept is handled separately (after Content-Type) to ensure correct
 * header ordering in the generated request method.
 */
function isConstantAcceptHeader(param: SdkHeaderParameter): boolean {
  return (
    param.serializedName.toLowerCase() === "accept" &&
    isConstantType(param.type)
  );
}

/**
 * Checks if a body parameter uses multipart/form-data content type.
 * Multipart operations require a dynamic contentType parameter (with boundary)
 * instead of a hardcoded Content-Type header.
 */
function isMultipartFormData(bodyParam: SdkBodyParameter): boolean {
  return bodyParam.contentTypes?.includes("multipart/form-data") ?? false;
}

/**
 * Makes a type expression nullable by appending `?` when the parameter is optional
 * and the underlying type is a C# value type.
 */
function maybeNullable(
  typeExpr: Children,
  sdkType: SdkType,
  optional: boolean,
): Children {
  if (!optional || !isProtocolParamValueType(sdkType)) return typeExpr;
  return typeof typeExpr === "string" ? `${typeExpr}?` : code`${typeExpr}?`;
}

/**
 * Parses a path template string into segments of literal text and
 * parameter references.
 *
 * For example, `/things/{id}/details` produces:
 * - literal: `/things/`
 * - parameter: `id` (linked to its SdkPathParameter)
 * - literal: `/details`
 */
function parsePathTemplate(
  path: string,
  pathParams: SdkPathParameter[],
): PathSegment[] {
  const paramMap = new Map(pathParams.map((p) => [p.serializedName, p]));
  const segments: PathSegment[] = [];
  const regex = /\{([^}]+)\}/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(path)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        kind: "literal",
        value: path.slice(lastIndex, match.index),
      });
    }
    const paramName = match[1];
    const param = paramMap.get(paramName);
    if (param) {
      segments.push({ kind: "parameter", param });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < path.length) {
    segments.push({ kind: "literal", value: path.slice(lastIndex) });
  }

  return segments;
}

/**
 * Gets the Accept header value from an operation's success responses.
 * Returns null if no content types are specified (void responses like 204).
 */
function getAcceptHeaderValue(responses: SdkHttpResponse[]): string | null {
  const contentTypes = new Set<string>();

  for (const response of responses) {
    if (response.defaultContentType) {
      contentTypes.add(response.defaultContentType);
    } else if (response.contentTypes) {
      for (const ct of response.contentTypes) {
        contentTypes.add(ct);
      }
    }
  }

  if (contentTypes.size === 0) return null;
  return Array.from(contentTypes).join(", ");
}

/**
 * Renders the value expression for appending a parameter value to the URI
 * or a header. Handles type-specific formatting:
 * - string → used directly
 * - bytes → TypeFormatters.ConvertToString(value, SerializationFormat.Bytes_Base64|Base64Url)
 * - utcDateTime/offsetDateTime → TypeFormatters.ConvertToString(value, SerializationFormat.DateTime_*)
 *   with encoding-specific format (RFC3339, RFC7231, or Unix)
 * - boolean → TypeFormatters.ConvertToString(value)
 * - numeric types → ToString()
 * - constant → literal value expression
 */
function getParamValueExpression(
  param: SdkPathParameter | SdkQueryParameter | SdkHeaderParameter,
  getParamName: (name: string) => string,
  nameOverride?: string,
): string {
  if (isConstantType(param.type)) {
    return getConstantValueExpression(param.type);
  }

  const type = unwrapType(param.type);
  const name = nameOverride ?? getParamName(param.name);

  // String → use directly
  if (type.kind === "string") {
    return name;
  }

  // Bytes (BinaryData) → TypeFormatters.ConvertToString with encoding format
  if (type.kind === "bytes") {
    const format = getBytesSerializationFormat(type as SdkBuiltInType);
    return `TypeFormatters.ConvertToString(${name}, ${format})`;
  }

  // DateTime → TypeFormatters.ConvertToString for nullable-safe formatting.
  // DateTimeOffset?.ToString("O") fails because Nullable<T> lacks the format overload.
  // The encoding (rfc3339, rfc7231, unixTimestamp) determines the SerializationFormat.
  if (type.kind === "utcDateTime" || type.kind === "offsetDateTime") {
    const format = getDateTimeSerializationFormat(type as SdkDateTimeType);
    return `TypeFormatters.ConvertToString(${name}, ${format})`;
  }

  // Duration → TypeFormatters with encoding-specific format
  if (type.kind === "duration") {
    const format = getDurationSerializationFormat(type as SdkDurationType);
    return `TypeFormatters.ConvertToString(${name}, ${format})`;
  }

  // Boolean → TypeFormatters.ConvertToString
  if (type.kind === "boolean") {
    return `TypeFormatters.ConvertToString(${name})`;
  }

  // Numeric → ToString()
  if (isNumericKind(type.kind)) {
    return `${name}.ToString()`;
  }

  // Enum → use the name directly (enum serialization handled in 3.3.3)
  if (type.kind === "enum" || type.kind === "enumvalue") {
    return name;
  }

  // Default: use directly (most common for string)
  return name;
}

/**
 * Unwraps nullable and constant type wrappers to get the underlying type.
 */
function unwrapType(type: SdkType): SdkType {
  if (type.kind === "nullable") {
    return unwrapType(type.type);
  }
  if (type.kind === "constant") {
    return type.valueType;
  }
  return type;
}

/**
 * Checks if an SdkType kind is a numeric scalar type.
 */
function isNumericKind(kind: string): boolean {
  return [
    "int8",
    "uint8",
    "int16",
    "uint16",
    "int32",
    "uint32",
    "int64",
    "uint64",
    "float32",
    "float64",
    "float",
    "decimal",
  ].includes(kind);
}

/**
 * Checks if an SdkType represents a collection (array) type after unwrapping
 * nullable/constant wrappers.
 */
function isCollectionType(type: SdkType): boolean {
  return unwrapType(type).kind === "array";
}

/**
 * Checks if an SdkType represents a dictionary type after unwrapping
 * nullable/constant wrappers.
 */
function isDictType(type: SdkType): boolean {
  return unwrapType(type).kind === "dict";
}

/**
 * Returns the C# `SerializationFormat` enum value for a bytes type based on
 * its encoding. TCGC always sets the encoding — base64 is the default.
 *
 * @param type - An `SdkBuiltInType` with `kind: "bytes"`.
 * @returns The `SerializationFormat` enum reference string
 *   (e.g., `"SerializationFormat.Bytes_Base64Url"`).
 */
function getBytesSerializationFormat(type: SdkBuiltInType): string {
  return type.encode === "base64url"
    ? "SerializationFormat.Bytes_Base64Url"
    : "SerializationFormat.Bytes_Base64";
}

/**
 * Returns the C# `SerializationFormat` enum value for a datetime type based on
 * its encoding. Maps the TypeSpec `@encode` decorator to the runtime format
 * used by `TypeFormatters.ConvertToString()` for header/query/path parameters.
 *
 * - `"rfc3339"` (default) → ISO 8601 round-trip (`"O"` format at runtime)
 * - `"rfc7231"` → HTTP-date (`"R"` format at runtime)
 * - `"unixTimestamp"` → seconds since epoch (`"U"` format at runtime)
 *
 * @param type - An `SdkDateTimeType` with encoding resolved by TCGC.
 * @returns The `SerializationFormat` enum reference string.
 */
function getDateTimeSerializationFormat(type: SdkDateTimeType): string {
  switch (type.encode) {
    case "rfc7231":
      return "SerializationFormat.DateTime_RFC7231";
    case "unixTimestamp":
      return "SerializationFormat.DateTime_Unix";
    case "rfc3339":
    default:
      return "SerializationFormat.DateTime_RFC3339";
  }
}

/**
 * Integer SDK type kinds used to determine whether a numeric duration
 * encoding maps to the integer SerializationFormat variant.
 *
 * When a duration is encoded as seconds or milliseconds with an integer
 * wire type, the value is formatted via `Convert.ToInt32()` at runtime
 * (in TypeFormatters.ConvertToString). Float/double wire types use the
 * raw TotalSeconds or TotalMilliseconds value instead.
 */
const DURATION_INTEGER_KINDS = new Set([
  "int8",
  "int16",
  "int32",
  "int64",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "safeint",
  "integer",
]);

/**
 * Returns the C# `SerializationFormat` enum value for a duration type based on
 * its encoding and wire type. Mirrors the legacy C# generator's TypeFactory.cs
 * mapping (lines 360-378).
 *
 * Duration (TimeSpan) supports these encoding strategies:
 * - `"ISO8601"` (default) → `Duration_ISO8601` — uses `XmlConvert.ToString()`
 * - `"seconds"` → integer wire types get `Duration_Seconds`, float32 gets
 *   `Duration_Seconds_Float`, float64/other gets `Duration_Seconds_Double`
 * - `"milliseconds"` → same pattern with `Duration_Milliseconds` variants
 *
 * @param type - An `SdkDurationType` with encoding and wireType resolved by TCGC.
 * @returns The `SerializationFormat` enum reference string.
 */
function getDurationSerializationFormat(type: SdkDurationType): string {
  switch (type.encode) {
    case "seconds":
      if (DURATION_INTEGER_KINDS.has(type.wireType.kind)) {
        return "SerializationFormat.Duration_Seconds";
      }
      if (type.wireType.kind === "float32") {
        return "SerializationFormat.Duration_Seconds_Float";
      }
      return "SerializationFormat.Duration_Seconds_Double";

    case "milliseconds":
      if (DURATION_INTEGER_KINDS.has(type.wireType.kind)) {
        return "SerializationFormat.Duration_Milliseconds";
      }
      if (type.wireType.kind === "float32") {
        return "SerializationFormat.Duration_Milliseconds_Float";
      }
      return "SerializationFormat.Duration_Milliseconds_Double";

    case "ISO8601":
    default:
      return "SerializationFormat.Duration_ISO8601";
  }
}

/**
 * Returns the C# `SerializationFormat` for a collection parameter's element type,
 * or null if no format is needed (non-bytes, non-duration, non-datetime elements).
 *
 * Used to generate the correct format argument for `AppendQueryDelimited` and
 * `SetDelimited` calls when the collection contains bytes (BinaryData),
 * duration (TimeSpan), or datetime (DateTimeOffset) values that require
 * encoding-specific formatting.
 */
function getCollectionElementFormat(type: SdkType): string | null {
  const unwrapped = unwrapType(type);
  if (unwrapped.kind !== "array") return null;
  const elementType = unwrapType((unwrapped as SdkArrayType).valueType);
  if (elementType.kind === "bytes") {
    return getBytesSerializationFormat(elementType as SdkBuiltInType);
  }
  if (elementType.kind === "duration") {
    return getDurationSerializationFormat(elementType as SdkDurationType);
  }
  if (
    elementType.kind === "utcDateTime" ||
    elementType.kind === "offsetDateTime"
  ) {
    return getDateTimeSerializationFormat(elementType as SdkDateTimeType);
  }
  return null;
}

/**
 * Resolves the correct client field name for an onClient HTTP parameter.
 *
 * When a parameter uses `@paramAlias`, the operation-level parameter name is
 * the alias (e.g., "blob"), but the client field is named after the client
 * initialization parameter (e.g., "blobName" → field "_blobName"). This
 * function uses `correspondingMethodParams` to find the correct field name.
 *
 * @param param - The HTTP parameter with `onClient: true`
 * @param getParamName - Name policy transformation function
 * @returns The prefixed field name (e.g., "_blobName")
 */
function getOnClientFieldName(
  param: SdkPathParameter | SdkQueryParameter | SdkHeaderParameter,
  getParamName: (name: string) => string,
): string {
  const methodParam = param.correspondingMethodParams?.[0];
  const name = methodParam?.name ?? param.name;
  return `_${getParamName(name)}`;
}

/**
 * Maps a TCGC CollectionFormat to the delimiter string used in
 * AppendQueryDelimited / AppendPathDelimited / SetHeaderDelimited calls.
 *
 * Returns null for "multi" format, which requires exploded serialization
 * (foreach loop) instead of delimited serialization.
 *
 * @see CollectionFormat in @azure-tools/typespec-client-generator-core
 */
function getCollectionDelimiter(
  format: CollectionFormat | undefined,
): string | null {
  switch (format) {
    case "csv":
    case "simple":
    case "form":
      return ",";
    case "ssv":
      return " ";
    case "tsv":
      return "\t";
    case "pipes":
      return "|";
    case "multi":
      return null; // Exploded: use foreach loop
    default:
      return ","; // Default to CSV
  }
}

/**
 * Determines whether a query parameter should use exploded serialization
 * (one query param per collection element) vs. delimited serialization
 * (all elements joined into a single value).
 *
 * Exploded serialization is used when:
 * - The `explode` flag is true, OR
 * - The `collectionFormat` is "multi"
 */
function isExplodedQueryParam(param: SdkQueryParameter): boolean {
  return param.explode || param.collectionFormat === "multi";
}

/**
 * Builds the C# statement(s) for appending a single query parameter
 * to the URI builder. Handles both scalar and collection types.
 *
 * For scalar parameters:
 *   `uri.AppendQuery("name", value, true);`
 *
 * For collection parameters with explode/multi:
 *   ```csharp
 *   foreach (var param0 in values)
 *   {
 *       uri.AppendQuery("name", param0, true);
 *   }
 *   ```
 *
 * For collection parameters with delimiter (CSV/SSV/pipes):
 *   `uri.AppendQueryDelimited("name", values, ",", SerializationFormat.Default, true);`
 */
function buildQueryParamStatement(
  param: SdkQueryParameter,
  getParamName: (name: string) => string,
): string {
  const serializedName = param.serializedName;
  const name = getParamName(param.name);

  if (isConstantType(param.type)) {
    const valueExpr = getConstantValueExpression(param.type);
    return `uri.AppendQuery("${serializedName}", ${valueExpr}, true);`;
  }

  if (param.onClient) {
    const fieldName = getOnClientFieldName(param, getParamName);
    return `if (${fieldName} != null)\n{\n    uri.AppendQuery("${serializedName}", ${fieldName}, true);\n}`;
  }

  // Collection parameter handling
  if (isCollectionType(param.type)) {
    if (isExplodedQueryParam(param)) {
      // Exploded: foreach loop, one query param per element
      const inner = `foreach (var param0 in ${name})\n    {\n        uri.AppendQuery("${serializedName}", param0, true);\n    }`;
      if (param.optional) {
        return `if (${name} != null)\n{\n    ${inner}\n}`;
      }
      return inner;
    } else {
      // Delimited: join all elements with delimiter
      const delimiter = getCollectionDelimiter(param.collectionFormat) ?? ",";
      const elementFormat = getCollectionElementFormat(param.type);
      const formatArg = elementFormat ?? "SerializationFormat.Default";
      const stmt = `uri.AppendQueryDelimited("${serializedName}", ${name}, "${delimiter}", ${formatArg}, true);`;
      if (param.optional) {
        return `if (${name} != null)\n{\n    ${stmt}\n}`;
      }
      return stmt;
    }
  }

  // Dictionary (record) parameter handling
  if (isDictType(param.type)) {
    if (isExplodedQueryParam(param)) {
      // Exploded dict: each key-value pair becomes a separate query parameter
      const inner = `foreach (var param0 in ${name})\n    {\n        uri.AppendQuery(param0.Key, TypeFormatters.ConvertToString(param0.Value), true);\n    }`;
      if (param.optional) {
        return `if (${name} != null)\n{\n    ${inner}\n}`;
      }
      return inner;
    } else {
      // Non-exploded dict: interleave keys and values with delimiter
      const delimiter = getCollectionDelimiter(param.collectionFormat) ?? ",";
      const stmt = `uri.AppendQueryDelimited("${serializedName}", ${name}, "${delimiter}", SerializationFormat.Default, true);`;
      if (param.optional) {
        return `if (${name} != null)\n{\n    ${stmt}\n}`;
      }
      return stmt;
    }
  }

  // Scalar parameter
  const valueExpr = getParamValueExpression(param, getParamName);
  if (param.optional) {
    return `if (${name} != null)\n{\n    uri.AppendQuery("${serializedName}", ${valueExpr}, true);\n}`;
  }
  return `uri.AppendQuery("${serializedName}", ${valueExpr}, true);`;
}

/**
 * Builds the C# statement for appending a path parameter segment
 * to the URI builder. Handles scalar, collection (array), and
 * dictionary (record) path params.
 *
 * For scalar parameters:
 *   `uri.AppendPath(value, escape);`
 *   where escape is `!allowReserved` (default true)
 *
 * For collection (array) parameters:
 *   `uri.AppendPathDelimited(values, ",", escape: escape);`
 *
 * For dictionary (record) parameters:
 *   `uri.AppendPathDelimited(values, ",", escape: escape);`
 */
function buildPathParamStatement(
  param: SdkPathParameter,
  getParamName: (name: string) => string,
): string {
  // allowReserved means reserved characters should NOT be escaped
  const escape = !param.allowReserved;

  // onClient params (e.g., api-version) are stored as client fields (_name).
  // Uses correspondingMethodParams to resolve param aliases correctly.
  const effectiveName = param.onClient
    ? getOnClientFieldName(param, getParamName)
    : getParamName(param.name);

  if (isCollectionType(param.type) || isDictType(param.type)) {
    // Collection/dict path parameter: use delimited serialization
    // Path params use "simple" style by default → comma-delimited
    // Named `escape:` parameter avoids positional conflict with SerializationFormat
    return `uri.AppendPathDelimited(${effectiveName}, ",", escape: ${escape});`;
  }

  // Scalar path parameter
  const valueExpr = getParamValueExpression(
    param,
    getParamName,
    param.onClient ? effectiveName : undefined,
  );
  return `uri.AppendPath(${valueExpr}, ${escape});`;
}

/**
 * Builds the C# statement for setting a header parameter on the request.
 * Handles both scalar and collection header params.
 *
 * For scalar parameters:
 *   `request.Headers.Set("name", value);` (unbranded)
 *   `request.Headers.SetValue("name", value);` (Azure)
 *
 * For collection parameters:
 *   `request.Headers.Set("name", string.Join(",", values));` (unbranded)
 *   `request.Headers.SetValue("name", string.Join(",", values));` (Azure)
 */
function buildHeaderParamStatement(
  param: SdkHeaderParameter,
  getParamName: (name: string) => string,
  headerSetMethod: string = "Set",
): string {
  const serializedName = param.serializedName;
  const name = getParamName(param.name);

  if (isConstantType(param.type)) {
    const valueExpr = getConstantValueExpression(param.type);
    return `request.Headers.${headerSetMethod}("${serializedName}", ${valueExpr});`;
  }

  // onClient params are stored as client fields (_name).
  // Uses correspondingMethodParams to resolve param aliases correctly.
  if (param.onClient) {
    const fieldName = getOnClientFieldName(param, getParamName);
    if (param.optional) {
      return `if (${fieldName} != null)\n{\n    request.Headers.${headerSetMethod}("${serializedName}", ${fieldName});\n}`;
    }
    return `request.Headers.${headerSetMethod}("${serializedName}", ${fieldName});`;
  }

  if (isCollectionType(param.type)) {
    // Collection header: join values with delimiter.
    // Use SetDelimited with SerializationFormat when elements need encoding-specific
    // formatting (e.g., duration, bytes). Otherwise fall back to string.Join.
    const delimiter = getCollectionDelimiter(param.collectionFormat) ?? ",";
    const elementFormat = getCollectionElementFormat(param.type);
    let stmt: string;
    if (elementFormat) {
      stmt = `request.Headers.SetDelimited("${serializedName}", ${name}, "${delimiter}", ${elementFormat});`;
    } else {
      stmt = `request.Headers.${headerSetMethod}("${serializedName}", string.Join("${delimiter}", ${name}));`;
    }
    if (param.optional) {
      return `if (${name} != null)\n{\n    ${stmt}\n}`;
    }
    return stmt;
  }

  // Scalar header
  const valueExpr = getParamValueExpression(param, getParamName);
  if (param.optional) {
    return `if (${name} != null)\n{\n    request.Headers.${headerSetMethod}("${serializedName}", ${valueExpr});\n}`;
  }
  return `request.Headers.${headerSetMethod}("${serializedName}", ${valueExpr});`;
}

/**
 * Builds the complete method body for a CreateRequest method.
 *
 * The body follows the System.ClientModel request building pattern:
 * 1. ClientUriBuilder initialization and endpoint reset
 * 2. Path segment appending (literals + parameters)
 * 3. Query parameter appending (with null checks for optional params)
 * 4. PipelineMessage creation with HTTP method and classifier
 * 5. Header setting (custom headers, Content-Type from body, Accept from response)
 * 6. Body content assignment (if applicable)
 * 7. Options application and return
 */
function buildRequestBody(
  operation: SdkHttpOperation,
  pathParams: SdkPathParameter[],
  queryParams: SdkQueryParameter[],
  headerParams: SdkHeaderParameter[],
  bodyParam: SdkBodyParameter | undefined,
  httpVerb: string,
  classifierRef: string,
  getParamName: (name: string) => string,
  pipelineTypes?: PipelineTypes,
  flavor?: string,
): Children {
  const isAzure = flavor === "azure";
  const msgType =
    pipelineTypes?.message ?? SystemClientModelPrimitives.PipelineMessage;
  const reqType =
    pipelineTypes?.request ?? SystemClientModelPrimitives.PipelineRequest;
  // Azure uses SetValue for headers; unbranded uses Set
  const headerSetMethod = isAzure ? "SetValue" : "Set";
  const parts: Children[] = [];

  // 1. URI builder initialization
  // Azure uses RawRequestUriBuilder (from shared source); unbranded uses generated ClientUriBuilder.
  if (isAzure) {
    parts.push(
      code`${AzureCore.RawRequestUriBuilder} uri = new ${AzureCore.RawRequestUriBuilder}();`,
    );
  } else {
    parts.push("ClientUriBuilder uri = new ClientUriBuilder();");
  }
  parts.push("\nuri.Reset(_endpoint);");

  // 2. Path segments
  const pathSegments = parsePathTemplate(operation.path, pathParams);
  for (const segment of pathSegments) {
    if (segment.kind === "literal") {
      parts.push(`\nuri.AppendPath("${segment.value}", false);`);
    } else if (segment.param.optional) {
      // Optional path params (RFC 6570 {/name} expansion): only append when
      // the value is non-null, prefixed with "/" to form the path segment.
      const paramName = segment.param.onClient
        ? getOnClientFieldName(segment.param, getParamName)
        : getParamName(segment.param.name);
      parts.push(`\nif (${paramName} != null)\n{`);
      parts.push(`\n    uri.AppendPath("/", false);`);
      parts.push(
        `\n    ${buildPathParamStatement(segment.param, getParamName)}`,
      );
      parts.push(`\n}`);
    } else {
      parts.push(`\n${buildPathParamStatement(segment.param, getParamName)}`);
    }
  }

  // 3. Query parameters
  for (const param of queryParams) {
    parts.push(`\n${buildQueryParamStatement(param, getParamName)}`);
  }

  // 4. Create message
  // Azure pattern: Pipeline.CreateMessage(context, classifier) + set Uri/Method separately
  // Unbranded pattern: Pipeline.CreateMessage(uri.ToUri(), "VERB", classifier)
  if (isAzure) {
    parts.push(
      "\n",
      code`${msgType} message = Pipeline.CreateMessage(options, ${classifierRef});`,
    );
    parts.push("\n", code`${reqType} request = message.Request;`);
    parts.push("\nrequest.Uri = uri;");
    // Map HTTP verb string to Azure.Core.RequestMethod static property
    const requestMethodProp = getAzureRequestMethodProperty(httpVerb);
    parts.push(
      "\n",
      code`request.Method = ${AzureCore.RequestMethod}.${requestMethodProp};`,
    );
  } else {
    // Note: \n must be a separate plain string — the code`` template tag strips leading \n.
    parts.push(
      "\n",
      code`${msgType} message = Pipeline.CreateMessage(uri.ToUri(), "${httpVerb}", ${classifierRef});`,
    );
    parts.push("\n", code`${reqType} request = message.Request;`);
  }

  // 5. Headers — custom headers first
  // Check if Accept is a variable header param (content negotiation)
  const acceptHeaderParam = headerParams.find(
    (p) =>
      p.serializedName.toLowerCase() === "accept" && !isConstantType(p.type),
  );

  // Detect conditional header grouping for Azure flavor
  const conditionalGrouping = getConditionalHeaderGrouping(
    headerParams,
    flavor,
  );

  for (const param of headerParams) {
    if (isImplicitContentTypeHeader(param)) continue;
    if (isSpecialHeaderParam(param, flavor)) continue;
    // Skip constant Accept headers — they are handled by the auto-derived Accept
    // logic below (after Content-Type) to ensure correct header ordering.
    if (isConstantAcceptHeader(param)) continue;
    // Skip conditional headers when they're grouped — handled below.
    if (
      conditionalGrouping.type !== "none" &&
      isConditionalHeaderParam(param)
    ) {
      continue;
    }
    parts.push(
      `\n${buildHeaderParamStatement(param, getParamName, headerSetMethod)}`,
    );
  }

  // Emit grouped conditional header statement for Azure flavor.
  // For ETag: if (ifMatch != null) { request.Headers.SetValue("If-Match", ifMatch.Value.ToString()); }
  // For MatchConditions/RequestConditions: if (conditions != null) { request.Headers.Add(conditions); }
  if (conditionalGrouping.type !== "none") {
    const condParamName = getParamName(conditionalGrouping.paramName);
    if (conditionalGrouping.type === "etag") {
      // Single ETag header: extract .Value from nullable ETag and set directly
      const headerParam = conditionalGrouping.conditionalParams[0];
      parts.push(
        `\nif (${condParamName} != null)\n{\n    request.Headers.${headerSetMethod}("${headerParam.serializedName}", ${condParamName}.Value.ToString());\n}`,
      );
    } else {
      // MatchConditions or RequestConditions: use request.Headers.Add(conditions)
      parts.push(
        `\nif (${condParamName} != null)\n{\n    request.Headers.Add(${condParamName});\n}`,
      );
    }
  }

  // Auto-populate special headers (repeatability headers) with runtime values.
  // These are not exposed as method parameters — they are generated
  // automatically per the OASIS repeatability specification.
  // Using code`...` with Alloy builtin references ensures `using System;` is emitted.
  for (const param of headerParams) {
    if (!isSpecialHeaderParam(param, flavor)) continue;
    const sn = param.serializedName.toLowerCase();
    if (sn === "repeatability-request-id") {
      parts.push(
        "\n",
        code`request.Headers.${headerSetMethod}("${param.serializedName}", ${System.Guid}.NewGuid().ToString());`,
      );
    } else if (sn === "repeatability-first-sent") {
      parts.push(
        "\n",
        code`request.Headers.${headerSetMethod}("${param.serializedName}", ${System.DateTimeOffset}.Now.ToString("R"));`,
      );
    }
  }

  // Content-Type header (derived from body's defaultContentType)
  // For multipart/form-data operations, the contentType is passed as a method
  // parameter (includes the boundary) rather than being hardcoded.
  if (bodyParam) {
    const multipart = isMultipartFormData(bodyParam);
    const contentType = bodyParam.defaultContentType;
    if (multipart) {
      if (bodyParam.optional) {
        parts.push(
          `\nif (content != null)\n{\n    request.Headers.${headerSetMethod}("Content-Type", contentType);\n}`,
        );
      } else {
        parts.push(
          `\nrequest.Headers.${headerSetMethod}("Content-Type", contentType);`,
        );
      }
    } else if (contentType) {
      if (bodyParam.optional) {
        parts.push(
          `\nif (content != null)\n{\n    request.Headers.${headerSetMethod}("Content-Type", "${contentType}");\n}`,
        );
      } else {
        parts.push(
          `\nrequest.Headers.${headerSetMethod}("Content-Type", "${contentType}");`,
        );
      }
    }
  }

  // Accept header (derived from response content types, unless it's a method param)
  if (!acceptHeaderParam) {
    const acceptValue = getAcceptHeaderValue(operation.responses);
    if (acceptValue) {
      parts.push(
        `\nrequest.Headers.${headerSetMethod}("Accept", "${acceptValue}");`,
      );
    }
  }

  // 6. Body content
  if (bodyParam && !isConstantType(bodyParam.type)) {
    if (bodyParam.optional) {
      parts.push(
        `\nif (content != null)\n{\n    request.Content = content;\n}`,
      );
    } else {
      parts.push("\nrequest.Content = content;");
    }
  }

  // 7. Apply options and return
  // Azure: context is already passed to CreateMessage, no Apply needed.
  // Unbranded: message.Apply(options) applies per-request options.
  if (!isAzure) {
    parts.push("\nmessage.Apply(options);");
  }
  parts.push("\nreturn message;");

  return parts;
}

/**
 * Maps an HTTP verb string (uppercase) to the corresponding
 * `Azure.Core.RequestMethod` static property name.
 *
 * Azure.Core uses `RequestMethod.Get` (PascalCase) rather than string literals.
 *
 * @param httpVerb - The uppercase HTTP verb (e.g., "GET", "POST").
 * @returns The PascalCase property name (e.g., "Get", "Post").
 */
function getAzureRequestMethodProperty(httpVerb: string): string {
  const map: Record<string, string> = {
    GET: "Get",
    POST: "Post",
    PUT: "Put",
    PATCH: "Patch",
    DELETE: "Delete",
    HEAD: "Head",
    OPTIONS: "Options",
    TRACE: "Trace",
  };
  return map[httpVerb] ?? httpVerb;
}
