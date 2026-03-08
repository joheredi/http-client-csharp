import { Method, useCSharpNamePolicy } from "@alloy-js/csharp";
import { code, namekey } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
import {
  type SdkArrayType,
  type SdkBodyParameter,
  type SdkClientType,
  type SdkDictionaryType,
  type SdkEnumType,
  type SdkHeaderParameter,
  type SdkHttpOperation,
  type SdkLroServiceMethod,
  type SdkModelType,
  type SdkPathParameter,
  type SdkQueryParameter,
  type SdkServiceMethod,
  type SdkType,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import { formatDocLines } from "../../utils/doc.js";
import {
  SystemThreading,
  SystemThreadingTasks,
} from "../../builtins/system-threading.js";
import { System } from "../../builtins/system.js";
import { SystemTextJson } from "../../builtins/system-text-json.js";
import { isConvenienceParamValueType } from "../../utils/nullable.js";
import { escapeCSharpKeyword } from "../../utils/csharp-keywords.js";
import { modelNeedsSerialization } from "../serialization/index.js";
import {
  buildSiblingNameSet,
  cleanOperationName,
} from "../../utils/operation-naming.js";
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
 * Metadata for a convenience method parameter, including the type expression,
 * assertion requirements, and the expression to use when calling the protocol method.
 */
export interface ConvenienceParam {
  /** The camelCase parameter name as it appears in the C# method signature. */
  name: string;
  /** The C# type expression (keyword string, Alloy refkey, or JSX element). */
  type: Children;
  /** Whether the parameter is optional in the TypeSpec definition. */
  optional: boolean;
  /** Whether this is the body parameter. */
  isBody: boolean;
  /** Whether the parameter requires an Argument.Assert* call (reference types only). */
  needsAssertion: boolean;
  /** Whether the parameter is a string type (uses AssertNotNullOrEmpty). */
  isStringType: boolean;
  /** Documentation string from the TypeSpec @doc decorator, if available. */
  doc?: string;
  /** The expression to pass for this param when calling the protocol method. */
  protocolCallArg: string;
  /**
   * For array/list body params in spread bodies, the element type expression.
   * When set, `buildSpreadProtocolCallExpr` generates a `.ToList()` conversion
   * instead of passing the param name directly, matching the golden output pattern:
   * `paramName?.ToList() as IList<T> ?? new ChangeTrackingList<T>()`.
   */
  collectionElementExpr?: Children;
}

/**
 * Props for the {@link ConvenienceMethods} component.
 */
export interface ConvenienceMethodsProps {
  /** The TCGC SDK client type whose HTTP operations produce convenience method pairs. */
  client: SdkClientType<SdkHttpOperation>;
  /** The emitter flavor ("azure" or "unbranded") for selecting pipeline types. */
  flavor?: string;
}

/**
 * Generates convenience-level client methods for all HTTP operations on a client.
 *
 * For each HTTP operation where `generateConvenient` is true, this component
 * produces a sync/async method pair that:
 * 1. Validates required reference-type parameters via Argument.AssertNotNull[OrEmpty]
 * 2. Delegates to the corresponding protocol method with type conversions
 * 3. Wraps the protocol result in a typed ClientResult{T} (if response has a body)
 *
 * Convenience methods provide a higher-level API with typed parameters and
 * return types. Body parameters use implicit conversion to BinaryContent.
 * Enum parameters are converted to their wire type (e.g., `.ToString()` for
 * string-backed enums). CancellationToken is converted to RequestOptions
 * via the `.ToRequestOptions()` extension method.
 *
 * @example Generated output for a method with model body and response:
 * ```csharp
 * /// <summary> Update a pet. </summary>
 * /// <param name="pet"></param>
 * /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
 * /// <exception cref="ArgumentNullException"> <paramref name="pet"/> is null. </exception>
 * /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
 * public virtual ClientResult<Pet> UpdatePet(Pet pet, CancellationToken cancellationToken = default)
 * {
 *     Argument.AssertNotNull(pet, nameof(pet));
 *
 *     ClientResult result = UpdatePet(pet, cancellationToken.ToRequestOptions());
 *     return ClientResult.FromValue((Pet)result, result.GetRawResponse());
 * }
 *
 * public virtual async Task<ClientResult<Pet>> UpdatePetAsync(Pet pet, CancellationToken cancellationToken = default)
 * {
 *     Argument.AssertNotNull(pet, nameof(pet));
 *
 *     ClientResult result = await UpdatePetAsync(pet, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
 *     return ClientResult.FromValue((Pet)result, result.GetRawResponse());
 * }
 * ```
 */
export function ConvenienceMethods(props: ConvenienceMethodsProps) {
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
      m.generateConvenient === true &&
      (m as SdkServiceMethod<SdkHttpOperation>).operation?.kind === "http" &&
      // Skip convenience methods for multipart/form-data operations.
      // The legacy emitter does not generate convenience methods for multipart
      // operations — only protocol methods with BinaryContent parameters.
      !isMultipartOperation(m as SdkServiceMethod<SdkHttpOperation>) &&
      // Skip convenience methods for JSON Merge Patch operations.
      // The legacy emitter does not generate convenience methods for
      // merge-patch operations — only protocol methods with BinaryContent
      // parameters, because merge-patch semantics require explicit null
      // values that typed model parameters cannot easily express.
      !isJsonMergePatchOperation(m as SdkServiceMethod<SdkHttpOperation>),
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
        const responseType = method.response.type;

        const getParamName = (name: string) =>
          namePolicy.getName(name, "parameter");
        const params = buildConvenienceParams(operation, getParamName, flavor);
        const requiredParams = params.params.filter((p) => !p.optional);
        const assertableParams = requiredParams.filter((p) => p.needsAssertion);

        // Detect Azure LRO methods — these get Operation<T> return types and
        // WaitUntil parameter instead of standard ClientResult<T> returns.
        const isLro = isAzure && method.kind === "lro";
        const isVoidLro =
          isLro && (responseType === undefined || responseType === null);

        // Resolve CancellationToken parameter name, avoiding collision with
        // user-defined parameters. When a user parameter is named
        // "cancellationToken" (e.g., SpecialWords spec), append a numeric
        // suffix matching the legacy emitter's convention (cancellationToken0).
        const ctParamName = resolveCancellationTokenParamName(params.params);

        // Build protocol method call argument list.
        // When the body is spread, replace individual body params with
        // a model constructor call: new BodyType(param1, param2, ...).
        // For Azure LRO, we prepend "waitUntil" to the protocol call args.
        const baseProtocolCallExpr: Children = params.spreadBodyType
          ? buildSpreadProtocolCallExpr(
              params.params,
              params.spreadBodyType,
              params.spreadBodyParamsInOrder!,
              ctParamName,
              isTextPlainBody(operation.bodyParam),
            )
          : [
              ...params.params.map((p) => p.protocolCallArg),
              `${ctParamName}.ToRequestOptions()`,
            ].join(", ");

        // For LRO, prepend "waitUntil, " to the protocol call expression.
        // The convenience method forwards the WaitUntil value to the protocol method.
        const protocolCallExpr: Children = isLro
          ? code`waitUntil, ${baseProtocolCallExpr}`
          : baseProtocolCallExpr;

        // Build <Method> parameter props
        const baseMethodParams = [
          ...params.params.map((p) => ({
            name: p.name,
            type: p.type,
            ...(p.optional ? { default: "default" } : {}),
          })),
          {
            name: ctParamName,
            type: SystemThreading.CancellationToken as Children,
            default: "default",
          },
        ];

        // Azure LRO methods prepend WaitUntil as the first parameter.
        const methodParams = isLro
          ? [
              { name: "waitUntil", type: pipelineTypes.waitUntil as Children },
              ...baseMethodParams,
            ]
          : baseMethodParams;

        const accessProps =
          access === "internal"
            ? ({ internal: true } as const)
            : ({ public: true } as const);

        // Build response type expression and deserialization logic.
        // Model types use the explicit operator cast. Bytes/unknown types
        // return BinaryData from the raw response content. Scalars, arrays,
        // dicts, and enums use ToObjectFromJson<T>() for typed deserialization.
        // Text/plain string responses use .ToString() instead of JSON deserialization.
        const responseInfo = buildResponseInfo(
          responseType,
          namePolicy,
          isAzure,
          hasTextPlainResponse(operation),
        );

        const xmlDoc = buildConvenienceXmlDoc(
          description,
          params.params,
          assertableParams,
          ctParamName,
        );
        const validation = buildConvenienceValidation(assertableParams);

        // Determine return types and method bodies based on LRO vs standard.
        const { syncReturn, asyncReturn, syncBody, asyncBody } = isLro
          ? buildLroConvenienceMethodParts(
              pipelineTypes,
              clientName,
              methodName,
              protocolCallExpr,
              validation,
              assertableParams,
              responseInfo ?? undefined,
              isVoidLro,
              method as SdkLroServiceMethod<SdkHttpOperation>,
              namePolicy,
            )
          : buildStandardConvenienceMethodParts(
              pipelineTypes,
              isAzure,
              methodName,
              protocolCallExpr,
              validation,
              assertableParams,
              responseInfo ?? undefined,
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
 * Result of building convenience method parameters, including optional
 * spread body metadata for constructing the body model in the protocol call.
 */
export interface ConvenienceParamsResult {
  /** The ordered convenience method parameters. */
  params: ConvenienceParam[];
  /**
   * When non-null, the body parameter was spread into individual convenience
   * params and the protocol call must construct the model via
   * `new SpreadBodyType(param1, param2, ...)`.
   */
  spreadBodyType: SdkType | null;
  /**
   * Body params in model property order (matching the serialization constructor
   * parameter order). Only set when `spreadBodyType` is non-null. This ordering
   * differs from `params` which is sorted by required/optional priority for the
   * method signature.
   */
  spreadBodyParamsInOrder?: ConvenienceParam[];
}

/**
 * Builds the convenience method parameter list from an HTTP operation.
 *
 * Parameters follow the same ordering as protocol methods:
 * 1. Path parameters (priority 0)
 * 2. Required header/query parameters (priority 100)
 * 3. Body parameter as typed model (priority 200 required, 300 optional)
 * 4. Optional header/query parameters (priority 400)
 *
 * Unlike protocol methods, convenience methods preserve the original types
 * (e.g., enums are not unwrapped to their wire type). Body parameters use
 * the model type instead of BinaryContent.
 *
 * When the body is implicit or spread (no `@body` decorator, or `...Model`
 * syntax), the body model's properties are exposed as individual parameters
 * instead of the wrapper model type. The `spreadBodyType` field in the
 * result indicates this case.
 *
 * @remarks This mirrors the parameter ordering in ProtocolMethod's
 * buildProtocolParams function. Changes to parameter ordering must be
 * kept in sync between both files.
 */
export function buildConvenienceParams(
  operation: SdkHttpOperation,
  getParamName: (name: string) => string,
  flavor?: string,
): ConvenienceParamsResult {
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

  const params: Array<ConvenienceParam & { priority: number; index: number }> =
    [];
  let index = 0;

  // Path parameters: required (priority 0), optional (priority 400)
  for (const p of pathParams) {
    if (isConstantType(p.type) || p.onClient) continue;
    const convInfo = getConvenienceTypeInfo(p.type);
    const csharpName = getParamName(p.name);
    params.push({
      name: csharpName,
      type: convInfo.expression,
      optional: p.optional,
      isBody: false,
      needsAssertion: convInfo.needsAssertion,
      isStringType: convInfo.isString,
      doc: p.doc ?? p.summary,
      protocolCallArg: getProtocolCallArg(csharpName, p.type),
      priority: p.optional ? 400 : 0,
      index: index++,
    });
  }

  // Header parameters: required (priority 100), optional (priority 400)
  // For Azure flavor, conditional headers are grouped into a single parameter.
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
        const typeExpr =
          conditionalGrouping.type === "etag"
            ? code`${conditionalGrouping.paramType}?`
            : conditionalGrouping.paramType;
        const csharpName = getParamName(conditionalGrouping.paramName);
        params.push({
          name: csharpName,
          type: typeExpr,
          optional: true,
          isBody: false,
          needsAssertion: false,
          isStringType: false,
          doc: undefined,
          protocolCallArg: csharpName,
          priority: 400,
          index: index++,
        });
      }
      continue;
    }

    const convInfo = getConvenienceTypeInfo(p.type);
    const typeExpr = maybeNullable(convInfo.expression, p.type, p.optional);
    const csharpName = getParamName(p.name);
    params.push({
      name: csharpName,
      type: typeExpr,
      optional: p.optional,
      isBody: false,
      needsAssertion: convInfo.needsAssertion,
      isStringType: convInfo.isString,
      doc: p.doc ?? p.summary,
      protocolCallArg: getProtocolCallArg(csharpName, p.type),
      priority: p.optional ? 400 : 100,
      index: index++,
    });
  }

  // Query parameters: required (priority 100), optional (priority 400)
  for (const p of queryParams) {
    if (isConstantType(p.type) || p.onClient) continue;
    const convInfo = getConvenienceTypeInfo(p.type);
    const typeExpr = maybeNullable(convInfo.expression, p.type, p.optional);
    const csharpName = getParamName(p.name);
    params.push({
      name: csharpName,
      type: typeExpr,
      optional: p.optional,
      isBody: false,
      needsAssertion: convInfo.needsAssertion,
      isStringType: convInfo.isString,
      doc: p.doc ?? p.summary,
      protocolCallArg: getProtocolCallArg(csharpName, p.type),
      priority: p.optional ? 400 : 100,
      index: index++,
    });
  }

  // Body parameter as typed model (priority 200 required, 300 optional)
  // When the body is spread (implicit or ...Model), expose individual
  // properties instead of the wrapper model type.
  let spreadBodyType: SdkType | null = null;
  if (bodyParam && !isConstantType(bodyParam.type)) {
    if (isSpreadBody(bodyParam)) {
      // Spread body: expose each model property as an individual parameter.
      spreadBodyType = bodyParam.type;
      for (const mp of bodyParam.correspondingMethodParams) {
        const convInfo = getConvenienceTypeInfo(mp.type);
        const mpOptional = mp.optional ?? false;
        const typeExpr = maybeNullable(
          convInfo.expression,
          mp.type,
          mpOptional,
        );

        // Detect array params for .ToList() conversion in spread body construction.
        // When the convenience method accepts IEnumerable<T> but the model stores
        // IList<T>, the spread body must convert via .ToList().
        const unwrappedMpType = unwrapType(mp.type);
        let collectionElementExpr: Children | undefined;
        if (unwrappedMpType.kind === "array") {
          const elementInfo = getConvenienceTypeInfo(
            (unwrappedMpType as SdkArrayType).valueType,
          );
          collectionElementExpr = elementInfo.expression;
        }

        params.push({
          name: getParamName(mp.name),
          type: typeExpr,
          optional: mpOptional,
          isBody: true,
          needsAssertion: convInfo.needsAssertion,
          isStringType: convInfo.isString,
          doc: mp.doc ?? mp.summary,
          protocolCallArg: getProtocolCallArg(getParamName(mp.name), mp.type),
          collectionElementExpr,
          priority: mp.optional ? 300 : 200,
          index: index++,
        });
      }
    } else {
      // Non-spread body: single typed model parameter.
      const priority = bodyParam.optional ? 300 : 200;
      const bodyName = getParamName(getBodyParamName(bodyParam));
      const convInfo = getConvenienceTypeInfo(bodyParam.type);
      const bodyOptional = bodyParam.optional ?? false;
      const typeExpr = maybeNullable(
        convInfo.expression,
        bodyParam.type,
        bodyOptional,
      );
      params.push({
        name: bodyName,
        type: typeExpr,
        optional: bodyOptional,
        isBody: true,
        needsAssertion: convInfo.needsAssertion,
        isStringType: convInfo.isString,
        doc: bodyParam.doc ?? bodyParam.summary,
        protocolCallArg: getBodyProtocolCallArg(
          bodyName,
          bodyParam.type,
          isTextPlainBody(bodyParam),
        ),
        priority,
        index: index++,
      });
    }
  }

  // Sort by priority, then by original order for stability
  params.sort((a, b) => a.priority - b.priority || a.index - b.index);

  return {
    params: params.map(
      ({ priority: _priority, index: _index, ...rest }) => rest,
    ),
    spreadBodyType,
    // Body params re-sorted by original index to recover model property order
    // (matching the serialization constructor parameter order). The priority sort
    // reorders required before optional, but the constructor expects definition order.
    spreadBodyParamsInOrder: spreadBodyType
      ? params
          .filter((p) => p.isBody)
          .sort((a, b) => a.index - b.index)
          .map(({ priority: _p, index: _i, ...rest }) => rest)
      : undefined,
  };
}

/**
 * Builds the protocol call argument expression for spread body operations.
 *
 * Instead of passing a single model parameter (which would use implicit
 * BinaryContent conversion), this constructs the model from the individual
 * spread parameters: `new BodyType(param1, param2, ...)`.
 *
 * Arguments are ordered to match the model's serialization constructor
 * parameter order (model property definition order + additionalBinaryDataProperties),
 * NOT the convenience method's priority-sorted parameter order. The serialization
 * constructor is targeted because it accepts all properties (required + optional),
 * unlike the public constructor which only accepts required properties.
 *
 * Collection (array) parameters are converted from `IEnumerable<T>` to
 * `IList<T>` via `.ToList()`, matching the golden output pattern:
 * `paramName?.ToList() as IList<T> ?? new ChangeTrackingList<T>()`.
 *
 * Maintains parameter ordering: non-body args at their original positions,
 * the body construction at the first body param's position, and
 * `cancellationToken.ToRequestOptions()` at the end.
 *
 * @param ctParamName - The resolved CancellationToken parameter name (may be
 * suffixed to avoid collision with user parameters).
 */
function buildSpreadProtocolCallExpr(
  params: ConvenienceParam[],
  spreadBodyType: SdkType,
  bodyParamsInModelOrder: ConvenienceParam[],
  ctParamName: string,
  isTextPlain: boolean = false,
): Children {
  // For non-model spread body types (scalars like bool, decimal, string),
  // pass the value directly to BinaryContentHelper.FromObject instead of
  // wrapping in a constructor call. Primitive types don't have constructors
  // that accept a single value (e.g., `new bool(value)` is invalid C#).
  // Exception: bytes (BinaryData) uses BinaryContent.Create() to avoid
  // JSON-parsing raw binary data (e.g., PNG, octet-stream).
  // Exception: text/plain strings use BinaryContent.Create(BinaryData.FromString())
  // to send raw text without JSON serialization (which would wrap in quotes).
  if (spreadBodyType.kind !== "model") {
    const parts: Children[] = [];
    let bodyInserted = false;
    for (const p of params) {
      if (p.isBody) {
        if (!bodyInserted) {
          if (parts.length > 0) parts.push(", ");
          const bodyParamName = escapeCSharpKeyword(
            bodyParamsInModelOrder[0].name,
          );
          if (spreadBodyType.kind === "bytes") {
            parts.push(`BinaryContent.Create(${bodyParamName})`);
          } else if (isTextPlain && spreadBodyType.kind === "string") {
            parts.push(
              `BinaryContent.Create(BinaryData.FromString(${bodyParamName}))`,
            );
          } else {
            parts.push(`BinaryContentHelper.FromObject(${bodyParamName})`);
          }
          bodyInserted = true;
        }
      } else {
        if (parts.length > 0) parts.push(", ");
        parts.push(p.protocolCallArg);
      }
    }
    parts.push(`, ${ctParamName}.ToRequestOptions()`);
    return parts;
  }

  const bodyTypeExpr = <TypeExpression type={spreadBodyType.__raw!} />;

  // Build argument expressions for body params in MODEL PROPERTY ORDER,
  // matching the serialization constructor parameter order.
  const spreadArgs: Children[] = [];
  for (let i = 0; i < bodyParamsInModelOrder.length; i++) {
    if (i > 0) spreadArgs.push(", ");
    const bp = bodyParamsInModelOrder[i];
    const escapedName = escapeCSharpKeyword(bp.name);
    if (bp.collectionElementExpr) {
      // Collection param: convert IEnumerable<T> → IList<T> with null-safety.
      // Pattern: paramName?.ToList() as IList<T> ?? new ChangeTrackingList<T>()
      spreadArgs.push(
        code`${escapedName}?.ToList() as ${SystemCollectionsGeneric.IList}<${bp.collectionElementExpr}> ?? new ChangeTrackingList<${bp.collectionElementExpr}>()`,
      );
    } else {
      spreadArgs.push(escapedName);
    }
  }
  // Model types have serialization constructors with an additionalBinaryDataProperties
  // (or patch for dynamic models) trailing parameter.
  spreadArgs.push(", default");

  // Determine whether the spread body model needs explicit BinaryContent conversion.
  // Models with UsageFlags.Input have an implicit operator BinaryContent.
  // Models without it (typically internal spread-only models) need wrapping via
  // BinaryContentHelper.FromObject, which uses WriteObjectValue → IPersistableModel.
  const needsExplicitConversion = !hasImplicitBinaryContentOperator(
    spreadBodyType as SdkModelType,
  );

  const parts: Children[] = [];
  let bodyInserted = false;
  for (const p of params) {
    if (p.isBody) {
      if (!bodyInserted) {
        if (parts.length > 0) parts.push(", ");
        if (needsExplicitConversion) {
          parts.push(
            code`BinaryContentHelper.FromObject(new ${bodyTypeExpr}(${spreadArgs}))`,
          );
        } else {
          parts.push(code`new ${bodyTypeExpr}(${spreadArgs})`);
        }
        bodyInserted = true;
      }
      // Skip remaining body params — they're combined in the constructor
    } else {
      if (parts.length > 0) parts.push(", ");
      parts.push(p.protocolCallArg);
    }
  }
  parts.push(`, ${ctParamName}.ToRequestOptions()`);

  return parts;
}

/**
 * Resolves the CancellationToken parameter name for a convenience method,
 * avoiding collisions with user-defined parameter names.
 *
 * When a user parameter is named `cancellationToken` (e.g., the SpecialWords
 * spec has an operation with a `cancellationToken: string` parameter), the
 * CancellationToken parameter name is suffixed with a numeric index to avoid
 * ambiguity. This matches the legacy emitter's convention of using
 * `cancellationToken0`, `cancellationToken1`, etc.
 *
 * The resolved name is used consistently in the method parameter list and
 * the `.ToRequestOptions()` call in the method body. Without this, the
 * body would call `.ToRequestOptions()` on the user's string parameter
 * instead of the CancellationToken, causing CS1929 at compile time.
 *
 * @param params - The user-defined convenience method parameters.
 * @returns The collision-free CancellationToken parameter name.
 */
function resolveCancellationTokenParamName(params: ConvenienceParam[]): string {
  const userNames = new Set(params.map((p) => p.name));
  let name = "cancellationToken";
  if (userNames.has(name)) {
    let suffix = 0;
    while (userNames.has(`${name}${suffix}`)) {
      suffix++;
    }
    name = `${name}${suffix}`;
  }
  return name;
}

/**
 * Determines the convenience method parameter name for a body parameter.
 *
 * Uses the first corresponding method parameter name if available (from TCGC's
 * correspondingMethodParams mapping), falling back to the body parameter's
 * own name.
 */
function getBodyParamName(bodyParam: SdkBodyParameter): string {
  const firstSegment = bodyParam.correspondingMethodParams?.[0];
  if (firstSegment && "name" in firstSegment) {
    return firstSegment.name;
  }
  return bodyParam.name;
}

/**
 * Determines whether a body parameter should be spread into individual
 * convenience method parameters.
 *
 * A body is considered "spread" when the body model type differs from the
 * first corresponding method parameter's type. This occurs with:
 * - Implicit body operations (no `@body` decorator, e.g. `op simple(name: string)`)
 * - Spread syntax (`...Model`)
 *
 * Explicit `@body` parameters pass through as-is because the body type matches
 * the corresponding method parameter type.
 *
 * This mirrors the legacy emitter's detection logic in `getParameterScope`.
 */
function isSpreadBody(bodyParam: SdkBodyParameter): boolean {
  const correspondingParams = bodyParam.correspondingMethodParams;
  if (!correspondingParams || correspondingParams.length === 0) return false;
  return bodyParam.type !== correspondingParams[0].type;
}

/**
 * Gets the C# type expression and metadata for a convenience method parameter.
 *
 * Unlike protocol methods which unwrap enums to wire types, convenience methods
 * preserve the original types. Models and enums use TypeExpression for
 * automatic using directive management. Primitive types use keyword mappings.
 *
 * @returns Object containing:
 *   - expression: The C# type expression (keyword, refkey, or JSX element)
 *   - needsAssertion: Whether the type requires Argument.Assert* validation
 *   - isString: Whether the type is string-like (for AssertNotNullOrEmpty)
 */
function getConvenienceTypeInfo(type: SdkType): {
  expression: Children;
  needsAssertion: boolean;
  isString: boolean;
} {
  const unwrapped = unwrapType(type);

  switch (unwrapped.kind) {
    // Primitive keywords — value types (no assertion needed)
    case "int32":
      return { expression: "int", needsAssertion: false, isString: false };
    case "int64":
      return { expression: "long", needsAssertion: false, isString: false };
    case "float32":
      return { expression: "float", needsAssertion: false, isString: false };
    case "float64":
      return { expression: "double", needsAssertion: false, isString: false };
    case "boolean":
      return { expression: "bool", needsAssertion: false, isString: false };
    case "int8":
      return { expression: "sbyte", needsAssertion: false, isString: false };
    case "uint8":
      return { expression: "byte", needsAssertion: false, isString: false };
    case "int16":
      return { expression: "short", needsAssertion: false, isString: false };
    case "uint16":
      return { expression: "ushort", needsAssertion: false, isString: false };
    case "uint32":
      return { expression: "uint", needsAssertion: false, isString: false };
    case "uint64":
      return { expression: "ulong", needsAssertion: false, isString: false };
    case "decimal":
    case "decimal128":
      return { expression: "decimal", needsAssertion: false, isString: false };

    // String — reference type
    case "string":
      return { expression: "string", needsAssertion: true, isString: true };

    // BCL struct types — value types (no assertion)
    case "utcDateTime":
    case "offsetDateTime":
      return {
        expression: System.DateTimeOffset,
        needsAssertion: false,
        isString: false,
      };
    case "duration":
      return {
        expression: System.TimeSpan,
        needsAssertion: false,
        isString: false,
      };

    // BCL reference types — need assertion
    case "url":
      return { expression: System.Uri, needsAssertion: true, isString: false };
    case "bytes":
    case "unknown":
    case "union":
      return {
        expression: System.BinaryData,
        needsAssertion: true,
        isString: false,
      };

    // Enum — value type (struct for extensible, enum for fixed)
    case "enum":
      return {
        expression: <TypeExpression type={unwrapped.__raw!} />,
        needsAssertion: false,
        isString: false,
      };
    case "enumvalue":
      return {
        expression: <TypeExpression type={unwrapped.enumType.__raw!} />,
        needsAssertion: false,
        isString: false,
      };

    // Model — reference type (class)
    case "model":
      // Models without JSON/XML serialization (e.g., file types with binary content types)
      // are not generated as C# classes. Use BinaryData instead.
      if (!modelNeedsSerialization(unwrapped as SdkModelType)) {
        return {
          expression: System.BinaryData,
          needsAssertion: true,
          isString: false,
        };
      }
      return {
        expression: <TypeExpression type={unwrapped.__raw!} />,
        needsAssertion: true,
        isString: false,
      };

    // Array → IEnumerable<elementType> (broadest input interface for collection params)
    // Preserves nullable element types (e.g., IEnumerable<float?> for float32 | null arrays).
    case "array": {
      const elementType = (unwrapped as SdkArrayType).valueType;
      const elementInfo = getConvenienceTypeInfo(elementType);
      // Check for nullable wrapper on the element type (before unwrapping).
      // Value types like float, int, bool need explicit ? for nullable.
      const isNullableElement =
        elementType.kind === "nullable" &&
        isConvenienceParamValueType(elementType);
      const elementExpr = isNullableElement
        ? typeof elementInfo.expression === "string"
          ? `${elementInfo.expression}?`
          : code`${elementInfo.expression}?`
        : elementInfo.expression;
      return {
        expression: code`${SystemCollectionsGeneric.IEnumerable}<${elementExpr}>`,
        needsAssertion: true,
        isString: false,
      };
    }

    // Dictionary — reference type, use IDictionary refkey for using directive.
    // Preserves nullable value types (e.g., IDictionary<string, float?> for nullable dicts).
    case "dict": {
      const valueType = (unwrapped as SdkDictionaryType).valueType;
      const valueInfo = getConvenienceTypeInfo(valueType);
      // Check for nullable wrapper on the value type.
      const isNullableValue =
        valueType.kind === "nullable" && isConvenienceParamValueType(valueType);
      const valueExpr = isNullableValue
        ? typeof valueInfo.expression === "string"
          ? `${valueInfo.expression}?`
          : code`${valueInfo.expression}?`
        : valueInfo.expression;
      return {
        expression: code`${SystemCollectionsGeneric.IDictionary}<string, ${valueExpr}>`,
        needsAssertion: true,
        isString: false,
      };
    }

    default:
      return { expression: "string", needsAssertion: true, isString: true };
  }
}

/**
 * Determines the expression to use for a parameter when calling the protocol method.
 *
 * For most types, the parameter is passed as-is. Enum types require conversion:
 * - String-backed enums: `.ToString()` to get the wire string value
 * - Int-backed enums: cast to the underlying integer type
 *
 * Model body parameters are passed directly — C# implicit operators handle
 * the conversion from the model type to BinaryContent.
 */
export function getProtocolCallArg(name: string, type: SdkType): string {
  const escaped = escapeCSharpKeyword(name);
  const unwrapped = unwrapType(type);

  if (unwrapped.kind === "enum") {
    const valueKind = unwrapType(unwrapped.valueType).kind;
    if (valueKind === "string") {
      return `${escaped}.ToString()`;
    }
    // For integer-backed enums, cast to the underlying type
    return `(${getIntegerKeyword(valueKind)})${escaped}`;
  }

  if (unwrapped.kind === "enumvalue") {
    return getProtocolCallArg(name, unwrapped.enumType);
  }

  return escaped;
}

/**
 * Maps an SdkType kind to its C# integer keyword for enum cast expressions.
 */
function getIntegerKeyword(kind: string): string {
  switch (kind) {
    case "int32":
      return "int";
    case "int64":
      return "long";
    case "float32":
      return "float";
    case "float64":
      return "double";
    default:
      return "int";
  }
}

/**
 * Information about a typed convenience method response, including the C#
 * return type expression and the deserialization expression to extract the
 * typed value from a `ClientResult` variable named "result".
 */
interface ResponseInfo {
  /** The C# type expression for the ClientResult<T> generic parameter. */
  typeExpr: Children;
  /** The C# expression to extract the typed value from a ClientResult named "result". */
  deserializeExpr: Children;
  /**
   * Optional C# statements to emit between the protocol call and the return statement.
   * Used for complex collection deserialization that requires JsonDocument parsing and
   * per-element iteration (e.g., arrays/dicts of models, TimeSpan, BinaryData).
   */
  preReturnStatements?: Children;
}

/**
 * Builds the return type and deserialization expression for a convenience method's
 * response type.
 *
 * This is the core function that enables typed `ClientResult<T>` returns for all
 * response types, not just models. Each response type category uses a different
 * deserialization pattern:
 *
 * - **Model**: `(ModelType)result` — uses the explicit operator generated in the
 *   model's serialization file.
 * - **Bytes/Unknown**: `result.GetRawResponse().Content` — returns BinaryData directly.
 * - **Scalar** (string, int, bool, etc.): `result.GetRawResponse().Content.ToObjectFromJson<T>()` —
 *   uses System.Text.Json deserialization.
 * - **Array (simple elements)**: `result.GetRawResponse().Content.ToObjectFromJson<IReadOnlyList<T>>()` —
 *   deserializes JSON array to a read-only list via System.Text.Json.
 * - **Array (complex elements)**: `JsonDocument.Parse()` + `foreach` with per-element
 *   deserialization. Used for Model, TimeSpan, and BinaryData element types that
 *   JsonSerializer.Deserialize cannot handle (internal ctors, ISO 8601 duration, non-serializable).
 * - **Dictionary (simple values)**: `result.GetRawResponse().Content.ToObjectFromJson<IReadOnlyDictionary<string, T>>()` —
 *   deserializes JSON object to a read-only dictionary via System.Text.Json.
 * - **Dictionary (complex values)**: `JsonDocument.Parse()` + `foreach` with per-property
 *   deserialization. Same complex type handling as arrays.
 * - **Extensible enum**: `new EnumType(result.GetRawResponse().Content.ToObjectFromJson<string>())` —
 *   constructs the readonly struct from the deserialized string.
 * - **Fixed enum**: `result.GetRawResponse().Content.ToObjectFromJson<string>().ToEnumName()` —
 *   uses the generated extension method for string-to-enum conversion.
 *
 * @param responseType - The TCGC SDK type of the method's response body, or undefined for void.
 * @param namePolicy - The C# naming policy for generating enum method names.
 * @returns ResponseInfo with type expression and deserialization expression, or null for void responses.
 */
function buildResponseInfo(
  responseType: SdkType | undefined,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
  isAzure: boolean = false,
  isTextPlain: boolean = false,
): ResponseInfo | null {
  if (!responseType) return null;

  // For Azure flavor, Response has .Content directly; for unbranded, use .GetRawResponse().Content
  const contentExpr = isAzure ? "result.Content" : "result.GetRawResponse().Content";

  const unwrapped = unwrapType(responseType);

  switch (unwrapped.kind) {
    // Model types: use explicit operator cast (ModelType)result
    case "model":
      // Models without JSON/XML serialization are not generated as C# classes.
      // Return BinaryData from response content instead.
      if (!modelNeedsSerialization(unwrapped as SdkModelType)) {
        return {
          typeExpr: System.BinaryData,
          deserializeExpr: contentExpr,
        };
      }
      return {
        typeExpr: <TypeExpression type={unwrapped.__raw!} />,
        deserializeExpr: code`(${(<TypeExpression type={unwrapped.__raw!} />)})result`,
      };

    // Bytes and unknown: return BinaryData from response content
    case "bytes":
    case "unknown":
      return {
        typeExpr: System.BinaryData,
        deserializeExpr: contentExpr,
      };

    // Scalar primitive types: use ToObjectFromJson<T>()
    case "int32":
      return buildScalarResponseInfo("int", contentExpr);
    case "int64":
      return buildScalarResponseInfo("long", contentExpr);
    case "float32":
      return buildScalarResponseInfo("float", contentExpr);
    case "float64":
      return buildScalarResponseInfo("double", contentExpr);
    case "boolean":
      return buildScalarResponseInfo("bool", contentExpr);
    case "int8":
      return buildScalarResponseInfo("sbyte", contentExpr);
    case "uint8":
      return buildScalarResponseInfo("byte", contentExpr);
    case "int16":
      return buildScalarResponseInfo("short", contentExpr);
    case "uint16":
      return buildScalarResponseInfo("ushort", contentExpr);
    case "uint32":
      return buildScalarResponseInfo("uint", contentExpr);
    case "uint64":
      return buildScalarResponseInfo("ulong", contentExpr);
    case "decimal":
    case "decimal128":
      return buildScalarResponseInfo("decimal", contentExpr);
    case "string":
      // Text/plain responses: use .ToString() to read raw text content.
      // JSON responses: use .ToObjectFromJson<string>() for proper JSON deserialization.
      if (isTextPlain) {
        return {
          typeExpr: "string",
          deserializeExpr: `${contentExpr}.ToString()`,
        };
      }
      return buildScalarResponseInfo("string", contentExpr);

    // BCL struct types
    case "utcDateTime":
    case "offsetDateTime":
      return {
        typeExpr: System.DateTimeOffset,
        deserializeExpr: code`${contentExpr}.ToObjectFromJson<${System.DateTimeOffset}>()`,
      };
    case "duration":
      return {
        typeExpr: System.TimeSpan,
        deserializeExpr: code`${contentExpr}.ToObjectFromJson<${System.TimeSpan}>()`,
      };
    case "url":
      return {
        typeExpr: System.Uri,
        deserializeExpr: code`${contentExpr}.ToObjectFromJson<${System.Uri}>()`,
      };

    // Array: IReadOnlyList<T> — uses JsonDocument + per-element deserialization for complex
    // element types (model, TimeSpan, BinaryData), falls back to ToObjectFromJson for simple types.
    case "array": {
      const elementType = (unwrapped as SdkArrayType).valueType;
      const elementExpr = getResponseElementTypeExpr(elementType, namePolicy);
      const typeExpr = code`${SystemCollectionsGeneric.IReadOnlyList}<${elementExpr}>`;

      if (isComplexCollectionElementType(elementType)) {
        // BinaryData (bytes/unknown) needs null checking unconditionally because
        // JSON null is always a valid value for unknown types, regardless of
        // whether the TCGC type has a nullable wrapper.
        const unwrappedElement = unwrapType(elementType);
        const isNullableElement =
          elementType.kind === "nullable" ||
          unwrappedElement.kind === "bytes" ||
          unwrappedElement.kind === "unknown";
        const elementDeserExpr = getElementDeserializeExpr(
          elementType,
          namePolicy,
          "item",
        );
        return {
          typeExpr,
          preReturnStatements: buildComplexArrayDeserializationStatements(
            contentExpr,
            elementExpr,
            elementDeserExpr,
            isNullableElement,
          ),
          deserializeExpr: code`(${typeExpr})items`,
        };
      }

      return {
        typeExpr,
        deserializeExpr: code`${contentExpr}.ToObjectFromJson<${typeExpr}>()`,
      };
    }

    // Dictionary: IReadOnlyDictionary<string, T> — uses JsonDocument + per-property deserialization
    // for complex value types (model, TimeSpan, BinaryData), falls back to ToObjectFromJson for simple types.
    case "dict": {
      const valueType = (unwrapped as SdkDictionaryType).valueType;
      const valueExpr = getResponseElementTypeExpr(valueType, namePolicy);
      const typeExpr = code`${SystemCollectionsGeneric.IReadOnlyDictionary}<string, ${valueExpr}>`;

      if (isComplexCollectionElementType(valueType)) {
        // BinaryData (bytes/unknown) needs null checking unconditionally because
        // JSON null is always a valid value for unknown types.
        const unwrappedValue = unwrapType(valueType);
        const isNullableValue =
          valueType.kind === "nullable" ||
          unwrappedValue.kind === "bytes" ||
          unwrappedValue.kind === "unknown";
        const valueDeserExpr = getElementDeserializeExpr(
          valueType,
          namePolicy,
          "property.Value",
        );
        return {
          typeExpr,
          preReturnStatements: buildComplexDictDeserializationStatements(
            contentExpr,
            valueExpr,
            valueDeserExpr,
            isNullableValue,
          ),
          deserializeExpr: code`(${typeExpr})items`,
        };
      }

      return {
        typeExpr,
        deserializeExpr: code`${contentExpr}.ToObjectFromJson<${typeExpr}>()`,
      };
    }

    // Enum types: fixed enums use extension method, extensible use constructor
    case "enum": {
      const enumType = unwrapped as SdkEnumType;
      const enumExpr = <TypeExpression type={unwrapped.__raw!} />;
      if (enumType.isFixed) {
        // Fixed enum: string → ToEnumName() extension method
        const enumName = namePolicy.getName(enumType.name, "enum");
        return {
          typeExpr: enumExpr,
          deserializeExpr: code`${contentExpr}.ToObjectFromJson<string>().To${enumName}()`,
        };
      } else {
        // Extensible enum: construct from string
        return {
          typeExpr: enumExpr,
          deserializeExpr: code`new ${enumExpr}(${contentExpr}.ToObjectFromJson<string>())`,
        };
      }
    }
    case "enumvalue": {
      const parentEnum = unwrapped.enumType;
      return buildResponseInfo(parentEnum, namePolicy, isAzure, isTextPlain);
    }

    default:
      return null;
  }
}

/**
 * Builds a ResponseInfo for a scalar C# type using ToObjectFromJson<T>().
 *
 * @param keyword - The C# type keyword (e.g., "int", "string", "decimal").
 */
function buildScalarResponseInfo(keyword: string, contentExpr: string): ResponseInfo {
  return {
    typeExpr: keyword,
    deserializeExpr: `${contentExpr}.ToObjectFromJson<${keyword}>()`,
  };
}

/**
 * Checks whether a collection element type requires JsonDocument-based deserialization
 * instead of the simpler ToObjectFromJson<T>().
 *
 * Complex types are those that System.Text.Json.JsonSerializer cannot deserialize
 * with default options:
 * - **model**: Internal parameterless constructor is not accessible to JsonSerializer.
 * - **duration** (TimeSpan): ISO 8601 duration format ("P123DT22H14M12.011S") is not
 *   supported by the default JSON serializer.
 * - **bytes/unknown** (BinaryData): BinaryData is not JSON-serializable by default.
 *
 * @param type - The TCGC SDK type of the collection element/value (may be nullable-wrapped).
 * @returns true if per-element deserialization via JsonDocument is required.
 */
function isComplexCollectionElementType(type: SdkType): boolean {
  const unwrapped = unwrapType(type);
  switch (unwrapped.kind) {
    case "model":
    case "duration":
    case "bytes":
    case "unknown":
      return true;
    default:
      return false;
  }
}

/**
 * Gets the C# expression to deserialize a single JSON element to a complex type.
 *
 * - **Model**: `TypeName.DeserializeTypeName(accessor, ModelSerializationExtensions.WireOptions)`
 *   Uses the model's static Deserialize method which handles internal constructors and
 *   the IJsonModel<T> contract.
 * - **Duration** (TimeSpan): `accessor.GetTimeSpan("P")`
 *   Uses the GetTimeSpan extension method from ModelSerializationExtensions for ISO 8601 parsing.
 * - **Bytes/Unknown** (BinaryData): `BinaryData.FromString(accessor.GetRawText())`
 *   Captures the raw JSON text for any value kind (number, string, object, etc.).
 *
 * @param type - The TCGC SDK type of the element (may be nullable-wrapped).
 * @param namePolicy - C# naming policy for constructing deserialization method names.
 * @param accessor - C# expression that accesses the JsonElement (e.g., "item" or "property.Value").
 * @returns A `code` expression for deserializing one element.
 */
function getElementDeserializeExpr(
  type: SdkType,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
  accessor: string,
): Children {
  const unwrapped = unwrapType(type);
  switch (unwrapped.kind) {
    case "model": {
      const modelType = unwrapped as SdkModelType;
      // Models without serialization infrastructure are treated as BinaryData
      if (!modelNeedsSerialization(modelType)) {
        return code`${System.BinaryData}.FromString(${accessor}.GetRawText())`;
      }
      const modelName = namePolicy.getName(modelType.name, "class");
      const typeExpr = <TypeExpression type={unwrapped.__raw!} />;
      return code`${typeExpr}.Deserialize${modelName}(${accessor}, ModelSerializationExtensions.WireOptions)`;
    }
    case "duration":
      return code`${accessor}.GetTimeSpan("P")`;
    case "bytes":
    case "unknown":
      return code`${System.BinaryData}.FromString(${accessor}.GetRawText())`;
    default:
      throw new Error(
        `getElementDeserializeExpr called with non-complex type: ${unwrapped.kind}`,
      );
  }
}

/**
 * Builds the C# statements for deserializing an array response with complex element types.
 * Generates a JsonDocument.Parse + foreach EnumerateArray loop.
 *
 * For non-nullable elements:
 * ```csharp
 * using JsonDocument document = JsonDocument.Parse(content);
 * List<T> items = new List<T>();
 * foreach (JsonElement item in document.RootElement.EnumerateArray())
 * {
 *     items.Add(<elementDeserExpr>);
 * }
 * ```
 *
 * For nullable elements, adds a null check inside the loop.
 */
function buildComplexArrayDeserializationStatements(
  contentExpr: string,
  elementTypeExpr: Children,
  elementDeserExpr: Children,
  isNullable: boolean,
): Children {
  const loopBody = isNullable
    ? [
        "\n",
        "    if (item.ValueKind == JsonValueKind.Null)\n    {\n        items.Add(null);\n    }\n    else\n    {\n        ",
        code`items.Add(${elementDeserExpr});`,
        "\n    }",
      ]
    : ["\n    ", code`items.Add(${elementDeserExpr});`];

  return [
    code`using ${SystemTextJson.JsonDocument} document = ${SystemTextJson.JsonDocument}.Parse(${contentExpr});`,
    "\n",
    code`${SystemCollectionsGeneric.List}<${elementTypeExpr}> items = new ${SystemCollectionsGeneric.List}<${elementTypeExpr}>();`,
    "\n",
    code`foreach (${SystemTextJson.JsonElement} item in document.RootElement.EnumerateArray())`,
    "\n{",
    ...loopBody,
    "\n}",
  ];
}

/**
 * Builds the C# statements for deserializing a dictionary response with complex value types.
 * Generates a JsonDocument.Parse + foreach EnumerateObject loop.
 *
 * For non-nullable values:
 * ```csharp
 * using JsonDocument document = JsonDocument.Parse(content);
 * Dictionary<string, T> items = new Dictionary<string, T>();
 * foreach (JsonProperty property in document.RootElement.EnumerateObject())
 * {
 *     items.Add(property.Name, <valueDeserExpr>);
 * }
 * ```
 *
 * For nullable values, adds a null check inside the loop.
 */
function buildComplexDictDeserializationStatements(
  contentExpr: string,
  valueTypeExpr: Children,
  valueDeserExpr: Children,
  isNullable: boolean,
): Children {
  const loopBody = isNullable
    ? [
        "\n",
        "    if (property.Value.ValueKind == JsonValueKind.Null)\n    {\n        items.Add(property.Name, null);\n    }\n    else\n    {\n        ",
        code`items.Add(property.Name, ${valueDeserExpr});`,
        "\n    }",
      ]
    : ["\n    ", code`items.Add(property.Name, ${valueDeserExpr});`];

  return [
    code`using ${SystemTextJson.JsonDocument} document = ${SystemTextJson.JsonDocument}.Parse(${contentExpr});`,
    "\n",
    code`${SystemCollectionsGeneric.Dictionary}<string, ${valueTypeExpr}> items = new ${SystemCollectionsGeneric.Dictionary}<string, ${valueTypeExpr}>();`,
    "\n",
    "foreach (JsonProperty property in document.RootElement.EnumerateObject())",
    "\n{",
    ...loopBody,
    "\n}",
  ];
}

/**
 * Gets the C# type expression for an element type within a collection response
 * (array or dictionary). Handles nullable element types by appending "?" for
 * value types.
 *
 * This is distinct from `getConvenienceTypeInfo` which is used for input parameters.
 * Response element types preserve nullability to match the legacy emitter's API
 * surface (e.g., `IReadOnlyList<float?>` for nullable float arrays).
 *
 * @param type - The TCGC SDK type of the collection element/value.
 * @param namePolicy - The C# naming policy for enum names.
 * @returns A C# type expression suitable for use in generic type parameters.
 */
function getResponseElementTypeExpr(
  type: SdkType,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): Children {
  // Check for nullable wrapper BEFORE unwrapping
  const isNullable =
    type.kind === "nullable" && isConvenienceParamValueType(type);
  const unwrapped = unwrapType(type);

  let baseExpr: Children;
  switch (unwrapped.kind) {
    case "int32":
      baseExpr = "int";
      break;
    case "int64":
      baseExpr = "long";
      break;
    case "float32":
      baseExpr = "float";
      break;
    case "float64":
      baseExpr = "double";
      break;
    case "boolean":
      baseExpr = "bool";
      break;
    case "int8":
      baseExpr = "sbyte";
      break;
    case "uint8":
      baseExpr = "byte";
      break;
    case "int16":
      baseExpr = "short";
      break;
    case "uint16":
      baseExpr = "ushort";
      break;
    case "uint32":
      baseExpr = "uint";
      break;
    case "uint64":
      baseExpr = "ulong";
      break;
    case "decimal":
    case "decimal128":
      baseExpr = "decimal";
      break;
    case "string":
      baseExpr = "string";
      break;
    case "bytes":
    case "unknown":
      baseExpr = System.BinaryData;
      break;
    case "utcDateTime":
    case "offsetDateTime":
      baseExpr = System.DateTimeOffset;
      break;
    case "duration":
      baseExpr = System.TimeSpan;
      break;
    case "url":
      baseExpr = System.Uri;
      break;
    case "model":
      baseExpr = <TypeExpression type={unwrapped.__raw!} />;
      break;
    case "enum":
      baseExpr = <TypeExpression type={unwrapped.__raw!} />;
      break;
    case "enumvalue":
      baseExpr = <TypeExpression type={unwrapped.enumType.__raw!} />;
      break;
    case "array": {
      const innerElem = getResponseElementTypeExpr(
        (unwrapped as SdkArrayType).valueType,
        namePolicy,
      );
      baseExpr = code`${SystemCollectionsGeneric.IReadOnlyList}<${innerElem}>`;
      break;
    }
    case "dict": {
      const innerVal = getResponseElementTypeExpr(
        (unwrapped as SdkDictionaryType).valueType,
        namePolicy,
      );
      baseExpr = code`${SystemCollectionsGeneric.IReadOnlyDictionary}<string, ${innerVal}>`;
      break;
    }
    default:
      baseExpr = "object";
      break;
  }

  // Append ? for nullable value types (e.g., float? for float32 | null)
  if (isNullable) {
    return typeof baseExpr === "string" ? `${baseExpr}?` : code`${baseExpr}?`;
  }
  return baseExpr;
}

/**
 * Determines whether a model type has the `implicit operator BinaryContent`
 * generated in its serialization file.
 *
 * The operator is generated for models with `UsageFlags.Input` set (see
 * {@link ImplicitBinaryContentOperator} in CastOperators.tsx). Models without
 * this flag (e.g., internal spread-only models) do not have implicit conversion
 * and need explicit BinaryContent wrapping in convenience method bodies.
 */
function hasImplicitBinaryContentOperator(type: SdkModelType): boolean {
  return (type.usage & UsageFlags.Input) !== 0 && modelNeedsSerialization(type);
}

/**
 * Determines the protocol call argument expression for a non-spread body parameter.
 *
 * For model types that have an `implicit operator BinaryContent` (models with
 * `UsageFlags.Input`), the body parameter is passed directly — C# resolves the
 * implicit conversion. For all other types (enums, scalars, arrays, strings,
 * BinaryData, internal models), the body must be explicitly serialized to
 * `BinaryContent` via `BinaryContentHelper` to ensure C# overload resolution
 * picks the protocol method overload `(BinaryContent, RequestOptions)` instead
 * of the convenience method overload `(TypedBody, CancellationToken)`.
 *
 * Type-specific conversions:
 * - **Enum (string-backed)**: `BinaryContentHelper.FromObject(body.ToString())`
 * - **Enum (int-backed)**: `BinaryContentHelper.FromObject((int)body)`
 * - **Array**: `BinaryContentHelper.FromEnumerable(body)`
 * - **Dictionary**: `BinaryContentHelper.FromDictionary(body)`
 * - **Model without Input flag**: `BinaryContentHelper.FromObject(body)` (uses IPersistableModel)
 * - **Bytes (BinaryData)**: `BinaryContent.Create(body)` (raw binary passthrough)
 * - **Text/plain string**: `BinaryContent.Create(BinaryData.FromString(body))` (raw text passthrough)
 * - **Other (string, scalar)**: `BinaryContentHelper.FromObject(body)`
 *
 * @param name - The camelCase parameter name in C#.
 * @param type - The TCGC SDK type of the body parameter.
 * @param isTextPlain - Whether the body uses text/plain content type.
 * @returns A string expression to use as the body argument in the protocol call.
 */
function getBodyProtocolCallArg(
  name: string,
  type: SdkType,
  isTextPlain: boolean = false,
): string {
  const escaped = escapeCSharpKeyword(name);
  const unwrapped = unwrapType(type);

  // Model types with implicit BinaryContent operator: pass directly.
  if (
    unwrapped.kind === "model" &&
    hasImplicitBinaryContentOperator(unwrapped as SdkModelType)
  ) {
    return escaped;
  }

  // Enum types: convert to wire representation then wrap.
  if (unwrapped.kind === "enum") {
    const valueKind = unwrapType(unwrapped.valueType).kind;
    if (valueKind === "string") {
      return `BinaryContentHelper.FromObject(${escaped}.ToString())`;
    }
    return `BinaryContentHelper.FromObject((${getIntegerKeyword(valueKind)})${escaped})`;
  }

  if (unwrapped.kind === "enumvalue") {
    return getBodyProtocolCallArg(name, unwrapped.enumType, isTextPlain);
  }

  // Array types: use FromEnumerable for proper JSON array serialization.
  if (unwrapped.kind === "array") {
    return `BinaryContentHelper.FromEnumerable(${escaped})`;
  }

  // Dictionary types: use FromDictionary for proper JSON object serialization.
  // FromObject delegates to WriteObjectValue which doesn't handle Dictionary<string, T>;
  // FromDictionary iterates key-value pairs and writes them as JSON properties.
  if (unwrapped.kind === "dict") {
    return `BinaryContentHelper.FromDictionary(${escaped})`;
  }

  // Bytes types: use BinaryContent.Create() to pass raw binary data through
  // without JSON wrapping. BinaryContentHelper.FromObject(BinaryData) would attempt
  // to JSON-parse the binary content (via WriteRawValue/JsonDocument.Parse), which
  // fails for non-JSON payloads like application/octet-stream or image/png.
  // BinaryContent.Create(BinaryData) wraps the raw bytes directly.
  if (unwrapped.kind === "bytes") {
    return `BinaryContent.Create(${escaped})`;
  }

  // Text/plain string body: use BinaryContent.Create(BinaryData.FromString()) to send
  // the string as raw text. BinaryContentHelper.FromObject() would JSON-serialize it
  // (wrapping in quotes), which corrupts the payload for text/plain content types.
  if (isTextPlain && unwrapped.kind === "string") {
    return `BinaryContent.Create(BinaryData.FromString(${escaped}))`;
  }

  // All other types (string, model without Input, scalar, etc.):
  // use FromObject which delegates to WriteObjectValue for correct serialization.
  return `BinaryContentHelper.FromObject(${escaped})`;
}

/**
 * Builds the XML documentation comment block for a convenience method.
 *
 * Produces the standard convenience method XML doc format, including:
 * - Summary description
 * - Parameter descriptions (with standard CancellationToken text)
 * - ArgumentNullException for required reference-type params
 * - ArgumentException for required string params (empty string check)
 * - ClientResultException for non-success status codes
 *
 * @returns An array of strings suitable for rendering as JSX children.
 */
export function buildConvenienceXmlDoc(
  description: string,
  params: ConvenienceParam[],
  assertableParams: ConvenienceParam[],
  ctParamName: string = "cancellationToken",
): string[] {
  const lines: string[] = [];

  // Summary
  lines.push(`/// <summary> ${formatDocLines(description)} </summary>`);

  // Parameter docs
  for (const p of params) {
    const docContent = p.doc ? ` ${formatDocLines(p.doc)} ` : "";
    lines.push(`/// <param name="${p.name}">${docContent}</param>`);
  }
  lines.push(
    `/// <param name="${ctParamName}"> The cancellation token that can be used to cancel the operation. </param>`,
  );

  // Exception docs — ArgumentNullException for required reference-type params
  if (assertableParams.length > 0) {
    const refs = assertableParams.map((p) => `<paramref name="${p.name}"/>`);
    lines.push(
      `/// <exception cref="ArgumentNullException"> ${joinWithOr(refs)} is null. </exception>`,
    );
  }

  // ArgumentException for required string params (empty string check)
  const requiredStringParams = assertableParams.filter((p) => p.isStringType);
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

  // First line has no leading \n; subsequent lines are prefixed with \n
  return lines.map((line, i) => (i === 0 ? line : `\n${line}`));
}

/**
 * Builds parameter validation statements for required reference-type parameters.
 *
 * String parameters use Argument.AssertNotNullOrEmpty (checks both null and
 * empty string), while other reference types use Argument.AssertNotNull.
 * Value types (enums, integers, etc.) do not need validation.
 *
 * @returns An array of validation statement strings, or null if no validation
 *   is needed.
 */
export function buildConvenienceValidation(
  assertableParams: ConvenienceParam[],
): Children {
  if (assertableParams.length === 0) return null;

  return assertableParams.map((p, i) => {
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
function joinWithOr(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return items.slice(0, -1).join(", ") + " or " + items[items.length - 1];
}

/**
 * Strips nullable and constant wrappers from a type to get the underlying type.
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

/** Checks if a type is a constant literal value. */
function isConstantType(type: SdkType): boolean {
  return type.kind === "constant";
}

/** Checks if a header parameter is the implicit Content-Type header. */
function isImplicitContentTypeHeader(param: SdkHeaderParameter): boolean {
  return param.serializedName.toLowerCase() === "content-type";
}

/**
 * Makes a type expression nullable by appending `?` when the parameter is optional
 * and the underlying type is a C# value type.
 *
 * Value types (int, bool, DateTimeOffset, enums, etc.) need explicit `?` to become
 * `Nullable<T>` in C#. Reference types (string, model classes, etc.) don't need
 * this treatment since they are inherently nullable.
 */
function maybeNullable(
  typeExpr: Children,
  sdkType: SdkType,
  optional: boolean,
): Children {
  if (!optional || !isConvenienceParamValueType(sdkType)) return typeExpr;
  return typeof typeExpr === "string" ? `${typeExpr}?` : code`${typeExpr}?`;
}

/**
 * Determines whether a client needs `using System.Linq` in its source file.
 *
 * Returns true when any convenience method has a spread body containing array
 * (collection) parameters, which generates `.ToList()` conversion expressions.
 * This check is used by {@link ClientFile} to conditionally add the using directive.
 */
export function clientNeedsLinq(
  client: SdkClientType<SdkHttpOperation>,
): boolean {
  const methods = client.methods.filter(
    (m): m is SdkServiceMethod<SdkHttpOperation> =>
      m.kind !== "paging" &&
      m.kind !== "lropaging" &&
      "operation" in m &&
      m.generateConvenient === true &&
      (m as SdkServiceMethod<SdkHttpOperation>).operation?.kind === "http" &&
      !isMultipartOperation(m as SdkServiceMethod<SdkHttpOperation>) &&
      !isJsonMergePatchOperation(m as SdkServiceMethod<SdkHttpOperation>),
  );

  for (const method of methods) {
    const operation = method.operation;
    const bodyParam = operation.bodyParam;
    if (!bodyParam || isConstantType(bodyParam.type)) continue;
    if (!isSpreadBody(bodyParam)) continue;

    // Check if any spread body param is an array type
    for (const mp of bodyParam.correspondingMethodParams) {
      const unwrapped = unwrapType(mp.type);
      if (unwrapped.kind === "array") {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks whether a service method uses multipart/form-data content type.
 *
 * Multipart operations in the legacy emitter only have protocol methods
 * (taking `BinaryContent` + `contentType` string). Convenience methods
 * that would reference multipart model types are not generated because
 * those model types are not emitted as C# classes.
 *
 * @param method - The SDK service method to check.
 * @returns `true` if the operation's body parameter is multipart/form-data.
 */
function isMultipartOperation(
  method: SdkServiceMethod<SdkHttpOperation>,
): boolean {
  return (
    method.operation?.bodyParam?.contentTypes?.includes(
      "multipart/form-data",
    ) ?? false
  );
}

/**
 * Checks whether a service method uses application/merge-patch+json content type.
 *
 * JSON Merge Patch operations in the legacy emitter only have protocol methods
 * (taking `BinaryContent`). Convenience methods are not generated because
 * merge-patch semantics require explicit null values to signal property removal,
 * which cannot be naturally expressed through typed model parameters.
 *
 * @param method - The SDK service method to check.
 * @returns `true` if the operation's body parameter is application/merge-patch+json.
 */
function isJsonMergePatchOperation(
  method: SdkServiceMethod<SdkHttpOperation>,
): boolean {
  return (
    method.operation?.bodyParam?.contentTypes?.includes(
      "application/merge-patch+json",
    ) ?? false
  );
}

/**
 * Checks whether a body parameter uses text/plain content type.
 *
 * Text/plain bodies must use raw string encoding (`BinaryData.FromString`)
 * rather than JSON serialization (`BinaryContentHelper.FromObject`), which
 * would wrap the string in quotes and corrupt the payload.
 *
 * @param bodyParam - The body parameter to check, or undefined if no body.
 * @returns `true` if the body parameter's content types include text/plain.
 */
function isTextPlainBody(bodyParam: SdkBodyParameter | undefined): boolean {
  return bodyParam?.contentTypes?.includes("text/plain") ?? false;
}

/**
 * Checks whether any success response of an HTTP operation EXPLICITLY uses text/plain
 * content type via `@header contentType: "text/plain"`.
 *
 * TCGC defaults all string response bodies to `contentTypes: ["text/plain"]`, even when
 * no content type is explicitly annotated (e.g., `@get op getName(): string;`). The legacy
 * emitter uses `ToObjectFromJson<string>()` for these implicit cases. To distinguish
 * explicit text/plain from TCGC's default, we check that the response also has an
 * explicit content-type header (present only when `@header contentType: ...` is annotated).
 *
 * @param operation - The HTTP operation to check.
 * @returns `true` if any non-error response explicitly declares text/plain content type.
 */
function hasTextPlainResponse(operation: SdkHttpOperation): boolean {
  return operation.responses.some(
    (r) =>
      r.contentTypes?.includes("text/plain") &&
      r.headers?.some((h) => h.serializedName === "content-type"),
  );
}

/**
 * Builds return types and method bodies for standard (non-LRO) convenience methods.
 *
 * Typed responses call the protocol method, deserialize the result, and wrap
 * in `ClientResult.FromValue()` (unbranded) or `Response.FromValue()` (Azure).
 * Void responses simply delegate to the protocol method.
 */
function buildStandardConvenienceMethodParts(
  pipelineTypes: PipelineTypes,
  isAzure: boolean,
  methodName: string,
  protocolCallExpr: Children,
  validation: Children,
  assertableParams: ConvenienceParam[],
  responseInfo: ResponseInfo | undefined,
): {
  syncReturn: Children;
  asyncReturn: Children;
  syncBody: Children[];
  asyncBody: Children[];
} {
  const syncReturn = responseInfo
    ? code`${pipelineTypes.clientResult}<${responseInfo.typeExpr}>`
    : pipelineTypes.clientResult;
  const asyncReturn = responseInfo
    ? code`${SystemThreadingTasks.Task}<${pipelineTypes.clientResult}<${responseInfo.typeExpr}>>`
    : code`${SystemThreadingTasks.Task}<${pipelineTypes.clientResult}>`;

  const rawResponseExpr = isAzure ? "result" : "result.GetRawResponse()";

  // When complex collection deserialization is needed, preReturnStatements contains
  // the JsonDocument parsing and foreach loop that populates a local variable.
  const preStatements = responseInfo?.preReturnStatements
    ? [responseInfo.preReturnStatements, "\n"]
    : [];

  const syncBody = responseInfo
    ? [
        validation,
        assertableParams.length > 0 ? "\n\n" : "",
        code`${pipelineTypes.clientResult} result = ${methodName}(${protocolCallExpr});`,
        "\n",
        ...preStatements,
        code`return ${pipelineTypes.clientResult}.FromValue(${responseInfo.deserializeExpr}, ${rawResponseExpr});`,
      ]
    : [
        validation,
        assertableParams.length > 0 ? "\n\n" : "",
        code`return ${methodName}(${protocolCallExpr});`,
      ];

  const asyncBody = responseInfo
    ? [
        validation,
        assertableParams.length > 0 ? "\n\n" : "",
        code`${pipelineTypes.clientResult} result = await ${methodName}Async(${protocolCallExpr}).ConfigureAwait(false);`,
        "\n",
        ...preStatements,
        code`return ${pipelineTypes.clientResult}.FromValue(${responseInfo.deserializeExpr}, ${rawResponseExpr});`,
      ]
    : [
        validation,
        assertableParams.length > 0 ? "\n\n" : "",
        code`return await ${methodName}Async(${protocolCallExpr}).ConfigureAwait(false);`,
      ];

  return { syncReturn, asyncReturn, syncBody, asyncBody };
}

/**
 * Builds return types and method bodies for Azure LRO convenience methods.
 *
 * Non-void LRO convenience methods:
 * 1. Call the protocol method (which returns `Operation<BinaryData>`)
 * 2. Use `ProtocolOperationHelpers.Convert()` to transform it to `Operation<T>`
 *    with a deserialization lambda that extracts the typed result from the response.
 *
 * Void-returning LRO convenience methods simply delegate to the protocol method
 * (which returns `Operation`).
 *
 * The conversion lambda handles two cases:
 * - **No resultPath** (standard resource LRO): uses the explicit operator cast
 *   `(ModelType)response` — the Azure explicit operator takes `Response`.
 * - **With resultPath** (RPC envelope LRO): navigates the JSON document to the
 *   result property and deserializes from there.
 *
 * @param pipelineTypes - Pipeline type references for the Azure flavor.
 * @param clientName - The PascalCase client class name for tracing scope.
 * @param methodName - The PascalCase method name for tracing scope.
 * @param protocolCallExpr - The protocol method invocation expression (includes waitUntil).
 * @param validation - Validation statements for required parameters.
 * @param assertableParams - Parameters requiring assertions (for spacing).
 * @param responseInfo - Response type/deserialization info, or undefined for void.
 * @param isVoid - Whether the LRO operation has no response body.
 * @param method - The TCGC LRO service method with lroMetadata.
 * @param namePolicy - C# naming policy for model name resolution.
 */
function buildLroConvenienceMethodParts(
  pipelineTypes: PipelineTypes,
  clientName: string,
  methodName: string,
  protocolCallExpr: Children,
  validation: Children,
  assertableParams: ConvenienceParam[],
  responseInfo: ResponseInfo | undefined,
  isVoid: boolean,
  method: SdkLroServiceMethod<SdkHttpOperation>,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): {
  syncReturn: Children;
  asyncReturn: Children;
  syncBody: Children[];
  asyncBody: Children[];
} {
  const scopeName = `${clientName}.${methodName}`;

  if (isVoid || !responseInfo) {
    // Void-returning LRO: delegate directly to the protocol method
    // which returns Operation (non-generic).
    const syncReturn = pipelineTypes.operation as Children;
    const asyncReturn = code`${SystemThreadingTasks.Task}<${pipelineTypes.operation}>`;

    const syncBody = [
      validation,
      assertableParams.length > 0 ? "\n\n" : "",
      code`return ${methodName}(${protocolCallExpr});`,
    ];

    const asyncBody = [
      validation,
      assertableParams.length > 0 ? "\n\n" : "",
      code`return await ${methodName}Async(${protocolCallExpr}).ConfigureAwait(false);`,
    ];

    return { syncReturn, asyncReturn, syncBody, asyncBody };
  }

  // Non-void LRO: call protocol method then convert Operation<BinaryData>
  // to Operation<T> using ProtocolOperationHelpers.Convert().
  const syncReturn = code`${pipelineTypes.operation}<${responseInfo.typeExpr}>`;
  const asyncReturn = code`${SystemThreadingTasks.Task}<${pipelineTypes.operation}<${responseInfo.typeExpr}>>`;

  // Build the conversion lambda body based on whether the LRO result
  // needs to be extracted from a nested path in the response envelope.
  const convertExpr = buildLroConvertExpr(responseInfo, method, namePolicy);

  const syncBody = [
    validation,
    assertableParams.length > 0 ? "\n\n" : "",
    code`${pipelineTypes.operation}<${System.BinaryData}> operation = ${methodName}(${protocolCallExpr});`,
    "\n",
    code`return ${pipelineTypes.protocolOperationHelpers}.Convert(operation, ${convertExpr}, ClientDiagnostics, "${scopeName}");`,
  ];

  const asyncBody = [
    validation,
    assertableParams.length > 0 ? "\n\n" : "",
    code`${pipelineTypes.operation}<${System.BinaryData}> operation = await ${methodName}Async(${protocolCallExpr}).ConfigureAwait(false);`,
    "\n",
    code`return ${pipelineTypes.protocolOperationHelpers}.Convert(operation, ${convertExpr}, ClientDiagnostics, "${scopeName}");`,
  ];

  return { syncReturn, asyncReturn, syncBody, asyncBody };
}

/**
 * Builds the conversion lambda expression for `ProtocolOperationHelpers.Convert()`.
 *
 * The lambda receives an `Azure.Response` and must return the typed result `T`.
 * Two patterns are used based on the LRO metadata:
 *
 * - **No resultPath** (standard resource LRO): `response => (ModelType)response`
 *   Uses the model's explicit operator that takes `Response` and deserializes
 *   from the root of the JSON document.
 *
 * - **With resultPath** (RPC envelope LRO): `response => ModelType.DeserializeModelType(...)`
 *   Parses the JSON response, navigates to the result property via
 *   `GetProperty("path")`, and deserializes from that sub-element.
 *
 * @param responseInfo - The type expression and deserialize info for the response model.
 * @param method - The TCGC LRO service method with lroMetadata (for resultPath).
 * @param namePolicy - C# naming policy for generating deserialization method names.
 * @returns An Alloy `code` expression for the conversion lambda.
 */
function buildLroConvertExpr(
  responseInfo: ResponseInfo,
  method: SdkLroServiceMethod<SdkHttpOperation>,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): Children {
  const resultPath = method.lroMetadata.finalResultPath;

  if (!resultPath) {
    // Standard resource LRO: the final response body IS the result.
    // Use the model's explicit operator cast: (ModelType)response
    return code`response => (${responseInfo.typeExpr})response`;
  }

  // RPC envelope LRO: the result is nested inside the response at resultPath.
  // Generate inline deserialization that navigates to the nested property.
  // The response type in LRO is always a model type when resultPath is set.
  const responseType = method.response.type;
  if (responseType && responseType.kind === "model") {
    const modelName = namePolicy.getName(responseType.name, "class");
    return code`response => ${responseInfo.typeExpr}.Deserialize${modelName}(${SystemTextJson.JsonDocument}.Parse(response.Content, ModelSerializationExtensions.JsonDocumentOptions).RootElement.GetProperty("${resultPath}"), ModelSerializationExtensions.WireOptions)`;
  }

  // Fallback: use explicit operator cast (best effort for non-model types)
  return code`response => (${responseInfo.typeExpr})response`;
}
