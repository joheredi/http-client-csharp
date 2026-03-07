import { Method, useCSharpNamePolicy } from "@alloy-js/csharp";
import { Block, code, namekey } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
import type {
  SdkArrayType,
  SdkBodyParameter,
  SdkClientType,
  SdkDictionaryType,
  SdkHeaderParameter,
  SdkHttpOperation,
  SdkLroServiceMethod,
  SdkPathParameter,
  SdkQueryParameter,
  SdkServiceMethod,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import type { FinalStateValue } from "@azure-tools/typespec-azure-core";
import { AzureCorePipeline } from "../../builtins/azure.js";
import { SystemClientModel } from "../../builtins/system-client-model.js";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import { System } from "../../builtins/system.js";
import { formatDocLines } from "../../utils/doc.js";
import { SystemThreadingTasks } from "../../builtins/system-threading.js";
import { isProtocolParamValueType } from "../../utils/nullable.js";
import { escapeCSharpKeyword } from "../../utils/csharp-keywords.js";
import {
  buildSiblingNameSet,
  cleanOperationName,
} from "../../utils/operation-naming.js";
import {
  getPipelineTypes,
  type PipelineTypes,
} from "../../utils/pipeline-types.js";
import { isSpecialHeaderParam } from "../../utils/special-headers.js";

/**
 * Metadata for a protocol method parameter, including optionality and type
 * classification needed for parameter validation and XML doc generation.
 */
export interface ProtocolParam {
  /** The camelCase parameter name as it appears in the C# method signature. */
  name: string;
  /** The C# type expression (keyword string or Alloy refkey). */
  type: Children;
  /** Whether the parameter is optional in the TypeSpec definition. */
  optional: boolean;
  /** Whether the parameter is a string-like type (uses AssertNotNullOrEmpty). */
  isStringType: boolean;
  /** Whether this is the body parameter (rendered as BinaryContent). */
  isBody: boolean;
  /**
   * Whether this parameter needs null/empty validation.
   * Defaults to true for required params, false for optional params.
   * Optional path params set this to false while keeping `optional: false`
   * (no `= default`) to avoid overload ambiguity with convenience methods.
   */
  needsValidation: boolean;
  /** Documentation string from the TypeSpec @doc decorator, if available. */
  doc?: string;
}

/**
 * Props for the {@link ProtocolMethods} component.
 */
export interface ProtocolMethodsProps {
  /** The TCGC SDK client type whose HTTP operations produce protocol method pairs. */
  client: SdkClientType<SdkHttpOperation>;
  /** The emitter flavor ("azure" or "unbranded") for selecting pipeline types. */
  flavor?: string;
}

/**
 * Generates protocol-level client methods for all HTTP operations on a client.
 *
 * For each HTTP operation, this component produces a sync/async method pair that:
 * 1. Validates required parameters via Argument.AssertNotNull[OrEmpty]
 * 2. Calls the corresponding Create{Op}Request method (from RestClientFile)
 * 3. Sends the request through Pipeline.ProcessMessage[Async]
 * 4. Returns ClientResult.FromResponse(...)
 *
 * Protocol methods expose the raw HTTP pipeline to advanced callers, taking
 * BinaryContent for request bodies and returning untyped ClientResult.
 * Convenience methods (task 3.5.1) will wrap these with typed parameters.
 *
 * XML docs include the `[Protocol Method]` tag and link to Azure SDK protocol
 * method documentation.
 *
 * @example Generated output:
 * ```csharp
 * /// <summary>
 * /// [Protocol Method] Gets an item.
 * /// <list type="bullet">
 * /// <item>
 * /// <description> This <see href="...">protocol method</see> allows ... </description>
 * /// </item>
 * /// </list>
 * /// </summary>
 * public virtual ClientResult GetItem(string id, RequestOptions options)
 * {
 *     Argument.AssertNotNullOrEmpty(id, nameof(id));
 *
 *     using PipelineMessage message = CreateGetItemRequest(id, options);
 *     return ClientResult.FromResponse(Pipeline.ProcessMessage(message, options));
 * }
 *
 * public virtual async Task<ClientResult> GetItemAsync(string id, RequestOptions options)
 * {
 *     Argument.AssertNotNullOrEmpty(id, nameof(id));
 *
 *     using PipelineMessage message = CreateGetItemRequest(id, options);
 *     return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
 * }
 * ```
 */
export function ProtocolMethods(props: ProtocolMethodsProps) {
  const { client, flavor } = props;
  const namePolicy = useCSharpNamePolicy();
  const siblingNames = buildSiblingNameSet(client.methods, (n) =>
    namePolicy.getName(n, "class"),
  );
  const pipelineTypes = getPipelineTypes(flavor ?? "unbranded");
  const isAzure = flavor === "azure";
  const clientName = namePolicy.getName(client.name, "class");

  const methods = client.methods.filter(
    (m): m is SdkServiceMethod<SdkHttpOperation> =>
      m.kind !== "paging" &&
      m.kind !== "lropaging" &&
      "operation" in m &&
      (m as SdkServiceMethod<SdkHttpOperation>).operation?.kind === "http",
  );

  if (methods.length === 0) return null;

  return (
    <>
      {methods.map((method) => {
        const operation = method.operation;
        const methodName = cleanOperationName(
          namePolicy.getName(method.name, "class"),
          siblingNames,
        );
        const access = method.access ?? "public";
        const description = method.doc ?? method.summary ?? "";

        const getParamName = (name: string) =>
          namePolicy.getName(name, "parameter");
        const params = buildProtocolParams(operation, getParamName, flavor);
        const validatedParams = params.filter((p) => p.needsValidation);

        // Detect Azure LRO methods — these get Operation<T> return types and
        // WaitUntil parameter instead of standard Response/ClientResult returns.
        const isLro = isAzure && method.kind === "lro";
        const isVoidLro =
          isLro &&
          (method.response.type === undefined || method.response.type === null);

        // Determine whether this operation will have a convenience method
        // counterpart. When no convenience method exists, the protocol method's
        // `options` parameter must default to `null` so callers can omit it.
        // When a convenience method DOES exist, protocol method parameters must
        // NOT have defaults to avoid CS0121 overload ambiguity with the
        // convenience overload (which has CancellationToken = default).
        const hasConvenienceMethod =
          method.generateConvenient === true &&
          !isJsonMergePatchProtocolMethod(method) &&
          !isMultipartProtocolMethod(method);

        // RequestOptions gets `= null` when:
        //   (a) no convenience method exists (protocol is the only API), OR
        //   (b) all params are body-only (BinaryContent is always a different
        //       type from the convenience method's typed model, so the compiler
        //       can unambiguously resolve overloads even with `= null`).
        // When non-body params exist (header/query), they share types with the
        // convenience overload (e.g., both use `string`), so any default on
        // RequestOptions would cause CS0121.
        const hasOnlyBodyParams =
          params.length > 0 && params.every((p) => p.isBody);
        const optionsDefault = !hasConvenienceMethod || hasOnlyBodyParams;

        // For LRO protocol methods, the CreateRequest call uses the same args
        // (without WaitUntil). The argList is the CreateRequest invocation args.
        const argList = [
          ...params.map((p) => escapeCSharpKeyword(p.name)),
          "options",
        ].join(", ");

        // Build <Method> parameter props. Protocol method parameters never
        // have defaults — even when the TypeSpec parameter is optional, the
        // protocol method lists it as required. This matches the legacy
        // emitter behaviour and prevents CS0121 ambiguity with the
        // convenience overload which *does* use defaults.
        const baseParams = [
          ...params.map((p) => ({
            name: p.name,
            type: p.type,
            ...(!hasConvenienceMethod && p.optional
              ? { default: "default" }
              : {}),
          })),
          {
            name: "options",
            type: pipelineTypes.requestOptions as Children,
            ...(optionsDefault ? { default: "null" } : {}),
          },
        ];

        // Azure LRO methods prepend WaitUntil as the first parameter.
        const methodParams = isLro
          ? [
              { name: "waitUntil", type: pipelineTypes.waitUntil as Children },
              ...baseParams,
            ]
          : baseParams;

        const accessProps =
          access === "internal"
            ? ({ internal: true } as const)
            : ({ public: true } as const);

        const xmlDoc = buildXmlDoc(description, params, validatedParams);
        const validation = buildValidation(validatedParams);

        // Determine return types and method bodies based on LRO vs standard.
        const { syncReturn, asyncReturn, syncBody, asyncBody } = isLro
          ? buildLroProtocolMethodParts(
              pipelineTypes,
              clientName,
              methodName,
              argList,
              validation,
              validatedParams,
              method as SdkLroServiceMethod<SdkHttpOperation>,
              isVoidLro,
            )
          : buildStandardProtocolMethodParts(
              pipelineTypes,
              isAzure,
              clientName,
              methodName,
              argList,
              validation,
              validatedParams,
            );

        return (
          <>
            {"\n\n"}
            {xmlDoc}
            {"\n"}
            <Method
              {...accessProps}
              virtual
              name={namekey(methodName, { ignoreNameConflict: true })}
              returns={syncReturn}
              parameters={methodParams}
            >
              {syncBody}
            </Method>
            {"\n\n"}
            {xmlDoc}
            {"\n"}
            <Method
              {...accessProps}
              virtual
              async
              name={namekey(`${methodName}Async`, { ignoreNameConflict: true })}
              returns={asyncReturn}
              parameters={methodParams}
            >
              {asyncBody}
            </Method>
          </>
        );
      })}
    </>
  );
}

/**
 * Builds the protocol method parameter list from an HTTP operation.
 *
 * Parameters are ordered following the legacy emitter convention:
 * 1. Path parameters (priority 0) — always required
 * 2. Required header/query parameters (priority 100)
 * 3. Body parameter as BinaryContent (priority 200 required, 300 optional)
 * 4. Optional header/query parameters (priority 400)
 *
 * Parameters that are constant values, client-level fields, or implicit
 * Content-Type headers are excluded from the signature.
 *
 * @remarks This mirrors the parameter ordering in RestClientFile's
 * buildMethodParams function. Changes to parameter ordering must be kept
 * in sync between both files.
 */
export function buildProtocolParams(
  operation: SdkHttpOperation,
  getParamName: (name: string) => string,
  flavor?: string,
): ProtocolParam[] {
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

  const params: Array<ProtocolParam & { priority: number; index: number }> = [];
  let index = 0;

  // Path parameters: required (priority 0), but optional path params skip validation
  for (const p of pathParams) {
    if (isConstantType(p.type) || p.onClient) continue;
    const typeInfo = getTypeInfo(p.type);
    params.push({
      name: getParamName(p.name),
      type: typeInfo.expression,
      optional: false,
      isStringType: typeInfo.isString,
      isBody: false,
      needsValidation: !p.optional,
      doc: p.doc ?? p.summary,
      priority: 0,
      index: index++,
    });
  }

  // Header parameters: required (priority 100), optional (priority 400)
  for (const p of headerParams) {
    if (isConstantType(p.type) || p.onClient) continue;
    if (isImplicitContentTypeHeader(p)) continue;
    if (isSpecialHeaderParam(p, flavor)) continue;
    const typeInfo = getTypeInfo(p.type);
    const typeExpr = maybeNullable(typeInfo.expression, p.type, p.optional);
    params.push({
      name: getParamName(p.name),
      type: typeExpr,
      optional: p.optional,
      isStringType: typeInfo.isString,
      isBody: false,
      needsValidation: !p.optional,
      doc: p.doc ?? p.summary,
      priority: p.optional ? 400 : 100,
      index: index++,
    });
  }

  // Query parameters: required (priority 100), optional (priority 400)
  for (const p of queryParams) {
    if (isConstantType(p.type) || p.onClient) continue;
    const typeInfo = getTypeInfo(p.type);
    const typeExpr = maybeNullable(typeInfo.expression, p.type, p.optional);
    params.push({
      name: getParamName(p.name),
      type: typeExpr,
      optional: p.optional,
      isStringType: typeInfo.isString,
      isBody: false,
      needsValidation: !p.optional,
      doc: p.doc ?? p.summary,
      priority: p.optional ? 400 : 100,
      index: index++,
    });
  }

  // Body parameter as BinaryContent (priority 200 required, 300 optional)
  if (bodyParam && !isConstantType(bodyParam.type)) {
    const priority = bodyParam.optional ? 300 : 200;
    params.push({
      name: "content",
      type: SystemClientModel.BinaryContent,
      optional: bodyParam.optional ?? false,
      isStringType: false,
      isBody: true,
      needsValidation: !(bodyParam.optional ?? false),
      doc: undefined,
      priority,
      index: index++,
    });

    // For multipart/form-data operations, add a contentType string parameter
    // immediately after the body parameter. The contentType includes the
    // boundary string (e.g., "multipart/form-data; boundary=...") and must
    // be passed dynamically rather than hardcoded.
    if (isMultipartFormData(bodyParam)) {
      params.push({
        name: "contentType",
        type: "string",
        optional: false,
        isStringType: true,
        isBody: false,
        needsValidation: true,
        doc: "The contentType to use which has the multipart/form-data boundary.",
        priority: priority + 1,
        index: index++,
      });
    }
  }

  // Sort by priority, then by original order for stability
  params.sort((a, b) => a.priority - b.priority || a.index - b.index);

  return params.map(({ priority: _priority, index: _index, ...rest }) => rest);
}

/**
 * Builds the XML documentation comment block for a protocol method.
 *
 * Produces the standard [Protocol Method] XML doc format matching the
 * legacy emitter's output, including:
 * - Summary with [Protocol Method] prefix and protocol method link
 * - Parameter descriptions (with special text for body and options params)
 * - ArgumentNullException for all required params
 * - ArgumentException for required string params (not null or empty)
 * - ClientResultException for non-success status codes
 * - Returns description
 *
 * @returns An array of strings suitable for rendering as JSX children.
 *   The first element has no leading newline; subsequent elements are
 *   prefixed with `\n` for proper line separation.
 */
export function buildXmlDoc(
  description: string,
  params: ProtocolParam[],
  requiredParams: ProtocolParam[],
): string[] {
  const lines: string[] = [];

  // Summary block with [Protocol Method] prefix
  lines.push(`/// <summary>`);
  lines.push(`/// [Protocol Method] ${formatDocLines(description)}`);
  lines.push(`/// <list type="bullet">`);
  lines.push(`/// <item>`);
  lines.push(
    `/// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>`,
  );
  lines.push(`/// </item>`);
  lines.push(`/// </list>`);
  lines.push(`/// </summary>`);

  // Parameter docs
  for (const p of params) {
    if (p.isBody) {
      lines.push(
        `/// <param name="content"> The content to send as the body of the request. </param>`,
      );
    } else {
      const docContent = p.doc ? ` ${formatDocLines(p.doc)} ` : "";
      lines.push(`/// <param name="${p.name}">${docContent}</param>`);
    }
  }
  lines.push(
    `/// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>`,
  );

  // Exception docs — ArgumentNullException for all required params
  if (requiredParams.length > 0) {
    const refs = requiredParams.map((p) => `<paramref name="${p.name}"/>`);
    lines.push(
      `/// <exception cref="ArgumentNullException"> ${joinWithOr(refs)} is null. </exception>`,
    );
  }

  // ArgumentException for required string params (empty string check)
  const requiredStringParams = requiredParams.filter((p) => p.isStringType);
  if (requiredStringParams.length > 0) {
    const refs = requiredStringParams.map(
      (p) => `<paramref name="${p.name}"/>`,
    );
    lines.push(
      `/// <exception cref="ArgumentException"> ${joinWithOr(refs)} is an empty string, and was expected to be non-empty. </exception>`,
    );
  }

  // ClientResultException — always present
  lines.push(
    `/// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>`,
  );
  lines.push(
    `/// <returns> The response returned from the service. </returns>`,
  );

  // First line has no leading \n; subsequent lines are prefixed with \n
  return lines.map((line, i) => (i === 0 ? line : `\n${line}`));
}

/**
 * Builds parameter validation statements for required parameters.
 *
 * String parameters use Argument.AssertNotNullOrEmpty (checks both null and
 * empty string), while other reference types use Argument.AssertNotNull.
 *
 * @returns An array of validation statement strings, or null if no validation
 *   is needed. The first element has no leading newline; subsequent elements
 *   are prefixed with `\n`.
 */
export function buildValidation(requiredParams: ProtocolParam[]): Children {
  if (requiredParams.length === 0) return null;

  return requiredParams.map((p, i) => {
    const assertFn = p.isStringType ? "AssertNotNullOrEmpty" : "AssertNotNull";
    const escapedName = escapeCSharpKeyword(p.name);
    const line = `Argument.${assertFn}(${escapedName}, nameof(${escapedName}));`;
    return i === 0 ? line : `\n${line}`;
  });
}

/**
 * Joins an array of strings with commas and "or" for the last element.
 *
 * - 1 item: "A"
 * - 2 items: "A or B"
 * - 3+ items: "A, B or C"
 *
 * Used for XML doc exception messages listing multiple parameter names.
 */
export function joinWithOr(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return items.slice(0, -1).join(", ") + " or " + items[items.length - 1];
}

/**
 * Collects type expression and string classification for a parameter type.
 *
 * The isString flag determines which Argument.Assert* method to use:
 * - true → AssertNotNullOrEmpty (string, or string-backed enum)
 * - false → AssertNotNull (other reference types)
 */
function getTypeInfo(type: SdkType): {
  expression: Children;
  isString: boolean;
} {
  const unwrapped = unwrapType(type);
  const isString =
    unwrapped.kind === "string" ||
    (unwrapped.kind === "enum" &&
      unwrapType(unwrapped.valueType).kind === "string") ||
    (unwrapped.kind === "enumvalue" &&
      unwrapType(unwrapped.enumType.valueType).kind === "string");

  return {
    expression: getProtocolTypeExpression(type),
    isString,
  };
}

/**
 * Gets the C# type expression for a protocol-level parameter.
 *
 * For protocol methods, enums are unwrapped to their underlying value type
 * (e.g., string enum → string) since protocol methods work with raw wire types.
 *
 * @remarks This duplicates RestClientFile's getProtocolTypeExpression.
 * Both must stay in sync to ensure protocol method parameter types match
 * the corresponding CreateRequest method signatures.
 */
function getProtocolTypeExpression(type: SdkType): Children {
  const unwrapped = unwrapType(type);

  switch (unwrapped.kind) {
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

    case "utcDateTime":
    case "offsetDateTime":
      return System.DateTimeOffset;
    case "duration":
      return System.TimeSpan;
    case "url":
      return System.Uri;
    case "bytes":
      return System.BinaryData;

    case "enum":
      return getProtocolTypeExpression(unwrapped.valueType);
    case "enumvalue":
      return getProtocolTypeExpression(unwrapped.enumType.valueType);

    // Array → IEnumerable<elementType> (broadest input interface for collection params)
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

    default:
      return "string";
  }
}

/**
 * Strips nullable and constant wrappers from a type to get the underlying
 * primitive type for type expression mapping.
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

/** Checks if a type is a constant literal value (hardcoded in request body). */
function isConstantType(type: SdkType): boolean {
  return type.kind === "constant";
}

/** Checks if a header parameter is the implicit Content-Type header. */
function isImplicitContentTypeHeader(param: SdkHeaderParameter): boolean {
  return param.serializedName.toLowerCase() === "content-type";
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
 *
 * Value types (int, bool, DateTimeOffset, etc.) need explicit `?` to become
 * `Nullable<T>` in C#. Reference types (string, model classes, etc.) don't need
 * this treatment since they are inherently nullable.
 *
 * @param typeExpr - The C# type expression (string keyword or Alloy refkey).
 * @param sdkType - The original SDK type from TCGC.
 * @param optional - Whether the parameter is optional.
 * @returns The type expression, with `?` appended if nullable value type.
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
 * Checks whether a service method uses application/merge-patch+json content type.
 *
 * JSON Merge Patch operations only have protocol methods (no convenience methods),
 * so the protocol method's `options` parameter should default to `null` to allow
 * callers to omit it.
 *
 * @param method - The SDK service method to check.
 * @returns `true` if the operation's body parameter is application/merge-patch+json.
 */
function isJsonMergePatchProtocolMethod(
  method: SdkServiceMethod<SdkHttpOperation>,
): boolean {
  return (
    method.operation?.bodyParam?.contentTypes?.includes(
      "application/merge-patch+json",
    ) ?? false
  );
}

/**
 * Checks whether a service method uses multipart/form-data content type.
 *
 * Multipart operations only have protocol methods (no convenience methods),
 * so the protocol method's `options` parameter should default to `null` to allow
 * callers to omit it.
 *
 * @param method - The SDK service method to check.
 * @returns `true` if the operation's body parameter is multipart/form-data.
 */
function isMultipartProtocolMethod(
  method: SdkServiceMethod<SdkHttpOperation>,
): boolean {
  return (
    method.operation?.bodyParam?.contentTypes?.includes(
      "multipart/form-data",
    ) ?? false
  );
}

/**
 * Maps a TCGC FinalStateValue to the corresponding C# `OperationFinalStateVia`
 * enum member expression. Used by Azure LRO protocol methods to tell
 * `ProtocolOperationHelpers` how to poll for the operation's final state.
 *
 * @param finalStateVia - The TCGC final state value from LRO metadata.
 * @param pipelineTypes - Pipeline type references for the Azure flavor.
 * @returns An Alloy `code` expression resolving to e.g.
 *   `OperationFinalStateVia.Location`.
 */
function mapFinalStateVia(
  finalStateVia: FinalStateValue,
  pipelineTypes: PipelineTypes,
): Children {
  const mapping: Record<string, string> = {
    "azure-async-operation": "AzureAsyncOperation",
    location: "Location",
    "original-uri": "OriginalUri",
    "operation-location": "OperationLocation",
    "custom-link": "OperationLocation",
    "custom-operation-reference": "OperationLocation",
  };

  const member = mapping[finalStateVia] ?? "OperationLocation";
  return code`${pipelineTypes.operationFinalStateVia}.${member}`;
}

/**
 * Builds return types and method bodies for standard (non-LRO) protocol methods.
 *
 * Azure protocol methods return `Response` directly from `Pipeline.ProcessMessage`
 * and wrap the body in a diagnostic scope for distributed tracing:
 * ```csharp
 * using DiagnosticScope scope = ClientDiagnostics.CreateScope("ClientName.MethodName");
 * scope.Start();
 * try { ... }
 * catch (Exception e) { scope.Failed(e); throw; }
 * ```
 *
 * Unbranded protocol methods wrap the result in `ClientResult.FromResponse()` with
 * no tracing support.
 *
 * @param pipelineTypes - Pipeline type references for the target flavor.
 * @param isAzure - Whether the emitter flavor is "azure".
 * @param clientName - The PascalCase client class name for tracing scope.
 * @param methodName - The PascalCase method name for tracing scope.
 * @param argList - Comma-separated argument list for CreateRequest call.
 * @param validation - Validation statements for required parameters.
 * @param validatedParams - Parameters that need validation (for spacing).
 */
function buildStandardProtocolMethodParts(
  pipelineTypes: PipelineTypes,
  isAzure: boolean,
  clientName: string,
  methodName: string,
  argList: string,
  validation: Children,
  validatedParams: ProtocolParam[],
): {
  syncReturn: Children;
  asyncReturn: Children;
  syncBody: Children[];
  asyncBody: Children[];
} {
  const syncReturn = pipelineTypes.clientResult;
  const asyncReturn = code`${SystemThreadingTasks.Task}<${pipelineTypes.clientResult}>`;

  // Inner body lines: validation + request creation + pipeline send.
  // These are the same for Azure and unbranded, except for the return expression.
  const innerSyncLines = [
    validation,
    validatedParams.length > 0 ? "\n\n" : "",
    code`using ${pipelineTypes.message} message = Create${methodName}Request(${argList});`,
    "\n",
    isAzure
      ? code`return Pipeline.ProcessMessage(message, options);`
      : code`return ${pipelineTypes.clientResult}.FromResponse(Pipeline.ProcessMessage(message, options));`,
  ];

  const innerAsyncLines = [
    validation,
    validatedParams.length > 0 ? "\n\n" : "",
    code`using ${pipelineTypes.message} message = Create${methodName}Request(${argList});`,
    "\n",
    isAzure
      ? code`return await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false);`
      : code`return ${pipelineTypes.clientResult}.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));`,
  ];

  if (!isAzure) {
    return {
      syncReturn,
      asyncReturn,
      syncBody: innerSyncLines,
      asyncBody: innerAsyncLines,
    };
  }

  // Azure: wrap with diagnostic scope try-catch for distributed tracing.
  // The scope name follows the "ClientName.MethodName" convention (without "Async").
  const scopeName = `${clientName}.${methodName}`;

  const catchBody = (
    <>
      {"scope.Failed(e);"}
      {"\n"}
      {"throw;"}
    </>
  );

  const syncBody: Children[] = [
    code`using ${AzureCorePipeline.DiagnosticScope} scope = ClientDiagnostics.CreateScope("${scopeName}");`,
    "\n",
    "scope.Start();",
    "\n",
    <>
      {"try"}
      <Block newline>{innerSyncLines}</Block>
    </>,
    "\n",
    <>
      {code`catch (${System.Exception} e)`}
      <Block newline>{catchBody}</Block>
    </>,
  ];

  const asyncBody: Children[] = [
    code`using ${AzureCorePipeline.DiagnosticScope} scope = ClientDiagnostics.CreateScope("${scopeName}");`,
    "\n",
    "scope.Start();",
    "\n",
    <>
      {"try"}
      <Block newline>{innerAsyncLines}</Block>
    </>,
    "\n",
    <>
      {code`catch (${System.Exception} e)`}
      <Block newline>{catchBody}</Block>
    </>,
  ];

  return { syncReturn, asyncReturn, syncBody, asyncBody };
}

/**
 * Builds return types and method bodies for Azure LRO protocol methods.
 *
 * LRO protocol methods return `Operation<BinaryData>` (or `Operation` for
 * void-returning operations) and delegate to
 * `ProtocolOperationHelpers.ProcessMessage[Async]()` which handles polling,
 * waiting, and operation state tracking.
 *
 * The scope name format `"ClientName.MethodName"` matches the legacy emitter's
 * distributed tracing convention.
 *
 * @param pipelineTypes - Pipeline type references for the Azure flavor.
 * @param clientName - The PascalCase client class name for tracing scope.
 * @param methodName - The PascalCase method name for tracing scope.
 * @param argList - Comma-separated argument list for CreateRequest call.
 * @param validation - Validation statements for required parameters.
 * @param validatedParams - Parameters that need validation (for spacing).
 * @param method - The TCGC LRO service method with lroMetadata.
 * @param isVoid - Whether the LRO operation has no response body.
 */
function buildLroProtocolMethodParts(
  pipelineTypes: PipelineTypes,
  clientName: string,
  methodName: string,
  argList: string,
  validation: Children,
  validatedParams: ProtocolParam[],
  method: SdkLroServiceMethod<SdkHttpOperation>,
  isVoid: boolean,
): {
  syncReturn: Children;
  asyncReturn: Children;
  syncBody: Children[];
  asyncBody: Children[];
} {
  const finalStateViaExpr = mapFinalStateVia(
    method.lroMetadata.finalStateVia,
    pipelineTypes,
  );
  const scopeName = `${clientName}.${methodName}`;

  // Void-returning LRO: Operation (non-generic) via ProcessMessageWithoutResponseValue
  // Typed LRO: Operation<BinaryData> via ProcessMessage
  const syncReturn = isVoid
    ? (pipelineTypes.operation as Children)
    : code`${pipelineTypes.operation}<${System.BinaryData}>`;
  const asyncReturn = isVoid
    ? code`${SystemThreadingTasks.Task}<${pipelineTypes.operation}>`
    : code`${SystemThreadingTasks.Task}<${pipelineTypes.operation}<${System.BinaryData}>>`;

  const processMethodSync = isVoid
    ? "ProcessMessageWithoutResponseValue"
    : "ProcessMessage";
  const processMethodAsync = isVoid
    ? "ProcessMessageWithoutResponseValueAsync"
    : "ProcessMessageAsync";

  const syncBody = [
    validation,
    validatedParams.length > 0 ? "\n\n" : "",
    code`using ${pipelineTypes.message} message = Create${methodName}Request(${argList});`,
    "\n",
    code`return ${pipelineTypes.protocolOperationHelpers}.${processMethodSync}(Pipeline, message, ClientDiagnostics, "${scopeName}", ${finalStateViaExpr}, options, waitUntil);`,
  ];

  const asyncBody = [
    validation,
    validatedParams.length > 0 ? "\n\n" : "",
    code`using ${pipelineTypes.message} message = Create${methodName}Request(${argList});`,
    "\n",
    code`return await ${pipelineTypes.protocolOperationHelpers}.${processMethodAsync}(Pipeline, message, ClientDiagnostics, "${scopeName}", ${finalStateViaExpr}, options, waitUntil).ConfigureAwait(false);`,
  ];

  return { syncReturn, asyncReturn, syncBody, asyncBody };
}
