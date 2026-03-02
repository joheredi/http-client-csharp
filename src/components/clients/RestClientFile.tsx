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
  SdkBodyParameter,
  SdkClientType,
  SdkHeaderParameter,
  SdkHttpOperation,
  SdkHttpResponse,
  SdkPathParameter,
  SdkQueryParameter,
  SdkServiceMethod,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import {
  SystemClientModel,
  SystemClientModelPrimitives,
} from "../../builtins/system-client-model.js";
import { System } from "../../builtins/system.js";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { cleanOperationName } from "../../utils/operation-naming.js";

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
  const className = namePolicy.getName(client.name, "class");

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
    <SourceFile path={`src/Generated/${className}.RestClient.cs`}>
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
          <ClassifierDeclarations classifiers={classifiers} />
          {methods.map((method) => (
            <>
              {"\n\n"}
              <CreateRequestMethod method={method} classifiers={classifiers} />
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
}

/**
 * Generates static PipelineMessageClassifier fields and their lazy-initialized
 * property accessors.
 *
 * For each unique set of success status codes across all operations, this
 * produces a backing field and an expression-bodied property:
 * ```csharp
 * private static PipelineMessageClassifier _pipelineMessageClassifier200;
 *
 * private static PipelineMessageClassifier PipelineMessageClassifier200 =>
 *     _pipelineMessageClassifier200 ??=
 *         PipelineMessageClassifier.Create(stackalloc ushort[] { 200 });
 * ```
 *
 * The lazy initialization pattern ensures the classifier is only allocated
 * once and then reused for all subsequent requests with the same status codes.
 */
function ClassifierDeclarations(props: ClassifierDeclarationsProps) {
  const { classifiers } = props;
  const PMC = SystemClientModelPrimitives.PipelineMessageClassifier;

  return (
    <>
      {classifiers.map((c, i) => {
        const fieldName = `_pipelineMessageClassifier${c.suffix}`;
        const propName = `PipelineMessageClassifier${c.suffix}`;
        const codesList = c.codes.join(", ");

        return (
          <>
            {i > 0 && "\n"}
            {code`private static ${PMC} ${fieldName};`}
            {"\n\n"}
            {code`private static ${PMC} ${propName} => ${fieldName} ??= ${PMC}.Create(stackalloc ushort[] { ${codesList} });`}
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
  const { method } = props;
  const operation = method.operation;
  const namePolicy = useCSharpNamePolicy();

  // Method name: Create{PascalCaseName}Request
  const operationName = cleanOperationName(
    namePolicy.getName(method.name, "class"),
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
  const methodParams = buildMethodParams(
    pathParams,
    queryParams,
    headerParams,
    bodyParam,
  );

  // Build method body
  const body = buildRequestBody(
    operation,
    pathParams,
    queryParams,
    headerParams,
    bodyParam,
    httpVerb,
    classifierRef,
  );

  return (
    <Method
      internal
      name={methodName}
      returns={SystemClientModelPrimitives.PipelineMessage}
      parameters={methodParams}
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
  for (const p of headerParams) {
    if (isConstantType(p.type) || p.onClient) continue;
    if (isImplicitContentTypeHeader(p)) continue;
    const priority = p.optional ? 400 : 100;
    params.push({
      name: p.name,
      type: getProtocolTypeExpression(p.type),
      priority,
      index: index++,
    });
  }

  // Required query parameters (priority 100), then optional (priority 400)
  for (const p of queryParams) {
    if (isConstantType(p.type) || p.onClient) continue;
    const priority = p.optional ? 400 : 100;
    params.push({
      name: p.name,
      type: getProtocolTypeExpression(p.type),
      priority,
      index: index++,
    });
  }

  // Body parameter as BinaryContent (priority 200 if required, 300 if optional)
  if (bodyParam && !isConstantType(bodyParam.type)) {
    const priority = bodyParam.optional ? 300 : 200;
    params.push({
      name: "content",
      type: SystemClientModel.BinaryContent,
      priority,
      index: index++,
    });
  }

  // Sort by priority, then by original order for stability
  params.sort((a, b) => a.priority - b.priority || a.index - b.index);

  // Build final list: sorted params + RequestOptions
  const result = params.map(({ name, type }) => ({ name, type }));
  result.push({
    name: "options",
    type: SystemClientModelPrimitives.RequestOptions,
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
 * - utcDateTime/offsetDateTime → ToString("O") (ISO 8601)
 * - boolean → TypeFormatters.ConvertToString(value)
 * - numeric types → ToString()
 * - constant → literal value expression
 */
function getParamValueExpression(
  param: SdkPathParameter | SdkQueryParameter | SdkHeaderParameter,
): string {
  if (isConstantType(param.type)) {
    return getConstantValueExpression(param.type);
  }

  const type = unwrapType(param.type);
  const name = param.name;

  // String → use directly
  if (type.kind === "string") {
    return name;
  }

  // DateTime → format with ToString
  if (type.kind === "utcDateTime" || type.kind === "offsetDateTime") {
    return `${name}.ToString("O")`;
  }

  // Duration → TypeFormatters
  if (type.kind === "duration") {
    return `TypeFormatters.ConvertToString(${name}, SerializationFormat.Duration_ISO8601)`;
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
): Children {
  const SCP = SystemClientModelPrimitives;
  const parts: Children[] = [];

  // 1. URI builder initialization
  parts.push("ClientUriBuilder uri = new ClientUriBuilder();");
  parts.push("\nuri.Reset(_endpoint);");

  // 2. Path segments
  const pathSegments = parsePathTemplate(operation.path, pathParams);
  for (const segment of pathSegments) {
    if (segment.kind === "literal") {
      parts.push(`\nuri.AppendPath("${segment.value}", false);`);
    } else {
      const valueExpr = getParamValueExpression(segment.param);
      parts.push(`\nuri.AppendPath(${valueExpr}, true);`);
    }
  }

  // 3. Query parameters
  for (const param of queryParams) {
    if (param.onClient) {
      // Client-level params (e.g., apiVersion) are class fields
      const fieldName = `_${param.name}`;
      parts.push(
        `\nif (${fieldName} != null)\n{\n    uri.AppendQuery("${param.serializedName}", ${fieldName}, true);\n}`,
      );
      continue;
    }

    const valueExpr = getParamValueExpression(param);

    if (isConstantType(param.type)) {
      // Constant: always append
      parts.push(
        `\nuri.AppendQuery("${param.serializedName}", ${valueExpr}, true);`,
      );
    } else if (param.optional) {
      // Optional: null check
      parts.push(
        `\nif (${param.name} != null)\n{\n    uri.AppendQuery("${param.serializedName}", ${valueExpr}, true);\n}`,
      );
    } else {
      // Required: always append
      parts.push(
        `\nuri.AppendQuery("${param.serializedName}", ${valueExpr}, true);`,
      );
    }
  }

  // 4. Create PipelineMessage
  parts.push(
    code`\n${SCP.PipelineMessage} message = Pipeline.CreateMessage(uri.ToUri(), "${httpVerb}", ${classifierRef});`,
  );
  parts.push(code`\n${SCP.PipelineRequest} request = message.Request;`);

  // 5. Headers — custom headers first
  // Check if Accept is a variable header param (content negotiation)
  const acceptHeaderParam = headerParams.find(
    (p) =>
      p.serializedName.toLowerCase() === "accept" && !isConstantType(p.type),
  );

  for (const param of headerParams) {
    if (isImplicitContentTypeHeader(param)) continue;

    const valueExpr = getParamValueExpression(param);

    if (isConstantType(param.type)) {
      // Constant header: always set with literal value
      parts.push(
        `\nrequest.Headers.Set("${param.serializedName}", ${valueExpr});`,
      );
    } else if (param.optional) {
      // Optional header: null check
      parts.push(
        `\nif (${param.name} != null)\n{\n    request.Headers.Set("${param.serializedName}", ${valueExpr});\n}`,
      );
    } else {
      // Required header: always set
      parts.push(
        `\nrequest.Headers.Set("${param.serializedName}", ${valueExpr});`,
      );
    }
  }

  // Content-Type header (derived from body's defaultContentType)
  if (bodyParam) {
    const contentType = bodyParam.defaultContentType;
    if (contentType) {
      if (bodyParam.optional) {
        parts.push(
          `\nif (content != null)\n{\n    request.Headers.Set("Content-Type", "${contentType}");\n}`,
        );
      } else {
        parts.push(`\nrequest.Headers.Set("Content-Type", "${contentType}");`);
      }
    }
  }

  // Accept header (derived from response content types, unless it's a method param)
  if (!acceptHeaderParam) {
    const acceptValue = getAcceptHeaderValue(operation.responses);
    if (acceptValue) {
      parts.push(`\nrequest.Headers.Set("Accept", "${acceptValue}");`);
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
  parts.push("\nmessage.Apply(options);");
  parts.push("\nreturn message;");

  return parts;
}
