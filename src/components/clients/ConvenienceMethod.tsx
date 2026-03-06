import { Method, useCSharpNamePolicy } from "@alloy-js/csharp";
import { code, namekey } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
import {
  type SdkArrayType,
  type SdkBodyParameter,
  type SdkClientType,
  type SdkDictionaryType,
  type SdkHeaderParameter,
  type SdkHttpOperation,
  type SdkModelType,
  type SdkPathParameter,
  type SdkQueryParameter,
  type SdkServiceMethod,
  type SdkType,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { SystemClientModel } from "../../builtins/system-client-model.js";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import { formatDocLines } from "../../utils/doc.js";
import {
  SystemThreading,
  SystemThreadingTasks,
} from "../../builtins/system-threading.js";
import { System } from "../../builtins/system.js";
import { isConvenienceParamValueType } from "../../utils/nullable.js";
import { escapeCSharpKeyword } from "../../utils/csharp-keywords.js";
import {
  buildSiblingNameSet,
  cleanOperationName,
} from "../../utils/operation-naming.js";

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
  const { client } = props;
  const namePolicy = useCSharpNamePolicy();
  const siblingNames = buildSiblingNameSet(client.methods, (n) =>
    namePolicy.getName(n, "class"),
  );

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
        const params = buildConvenienceParams(operation, getParamName);
        const requiredParams = params.params.filter((p) => !p.optional);
        const assertableParams = requiredParams.filter((p) => p.needsAssertion);

        // Resolve CancellationToken parameter name, avoiding collision with
        // user-defined parameters. When a user parameter is named
        // "cancellationToken" (e.g., SpecialWords spec), append a numeric
        // suffix matching the legacy emitter's convention (cancellationToken0).
        const ctParamName = resolveCancellationTokenParamName(params.params);

        // Build protocol method call argument list.
        // When the body is spread, replace individual body params with
        // a model constructor call: new BodyType(param1, param2, ...).
        const protocolCallExpr: Children = params.spreadBodyType
          ? buildSpreadProtocolCallExpr(
              params.params,
              params.spreadBodyType,
              params.spreadBodyParamsInOrder!,
              ctParamName,
            )
          : [
              ...params.params.map((p) => p.protocolCallArg),
              `${ctParamName}.ToRequestOptions()`,
            ].join(", ");

        // Build <Method> parameter props
        const methodParams = [
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

        const accessProps =
          access === "internal"
            ? ({ internal: true } as const)
            : ({ public: true } as const);

        // Build response type expression (used for return type and cast).
        // Only model types have the explicit operator from ClientResult needed
        // for the cast pattern. Arrays, scalars, and other non-model response
        // types fall back to untyped ClientResult.
        const isModelResponse = responseType?.kind === "model";
        const responseTypeExpr =
          responseType && isModelResponse ? (
            <TypeExpression type={responseType.__raw!} />
          ) : null;

        // Build return types
        const syncReturn = responseTypeExpr
          ? code`${SystemClientModel.ClientResult}<${responseTypeExpr}>`
          : SystemClientModel.ClientResult;
        const asyncReturn = responseTypeExpr
          ? code`${SystemThreadingTasks.Task}<${SystemClientModel.ClientResult}<${responseTypeExpr}>>`
          : code`${SystemThreadingTasks.Task}<${SystemClientModel.ClientResult}>`;

        const xmlDoc = buildConvenienceXmlDoc(
          description,
          params.params,
          assertableParams,
          ctParamName,
        );
        const validation = buildConvenienceValidation(assertableParams);

        // Sync method body — use code template for all cases to support
        // spread body Children expressions in protocolCallExpr.
        const syncBody = responseTypeExpr
          ? [
              validation,
              assertableParams.length > 0 ? "\n\n" : "",
              code`${SystemClientModel.ClientResult} result = ${methodName}(${protocolCallExpr});`,
              "\n",
              code`return ${SystemClientModel.ClientResult}.FromValue((${responseTypeExpr})result, result.GetRawResponse());`,
            ]
          : [
              validation,
              assertableParams.length > 0 ? "\n\n" : "",
              code`return ${methodName}(${protocolCallExpr});`,
            ];

        // Async method body
        const asyncBody = responseTypeExpr
          ? [
              validation,
              assertableParams.length > 0 ? "\n\n" : "",
              code`${SystemClientModel.ClientResult} result = await ${methodName}Async(${protocolCallExpr}).ConfigureAwait(false);`,
              "\n",
              code`return ${SystemClientModel.ClientResult}.FromValue((${responseTypeExpr})result, result.GetRawResponse());`,
            ]
          : [
              validation,
              assertableParams.length > 0 ? "\n\n" : "",
              code`return await ${methodName}Async(${protocolCallExpr}).ConfigureAwait(false);`,
            ];

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
  for (const p of headerParams) {
    if (isConstantType(p.type) || p.onClient) continue;
    if (isImplicitContentTypeHeader(p)) continue;
    if (isSpecialHeaderParam(p)) continue;
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
        protocolCallArg: getBodyProtocolCallArg(bodyName, bodyParam.type),
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
): Children {
  // For non-model spread body types (scalars like bool, decimal, string),
  // pass the value directly to BinaryContentHelper.FromObject instead of
  // wrapping in a constructor call. Primitive types don't have constructors
  // that accept a single value (e.g., `new bool(value)` is invalid C#).
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
          parts.push(`BinaryContentHelper.FromObject(${bodyParamName})`);
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
function resolveCancellationTokenParamName(
  params: ConvenienceParam[],
): string {
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
      return {
        expression: <TypeExpression type={unwrapped.__raw!} />,
        needsAssertion: true,
        isString: false,
      };

    // Array → IEnumerable<elementType> (broadest input interface for collection params)
    case "array": {
      const elementType = (unwrapped as SdkArrayType).valueType;
      const elementInfo = getConvenienceTypeInfo(elementType);
      return {
        expression: code`${SystemCollectionsGeneric.IEnumerable}<${elementInfo.expression}>`,
        needsAssertion: true,
        isString: false,
      };
    }

    // Dictionary — reference type, use IDictionary refkey for using directive
    case "dict": {
      const valueType = (unwrapped as SdkDictionaryType).valueType;
      const valueInfo = getConvenienceTypeInfo(valueType);
      return {
        expression: code`${SystemCollectionsGeneric.IDictionary}<string, ${valueInfo.expression}>`,
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
 * Determines whether a model type has the `implicit operator BinaryContent`
 * generated in its serialization file.
 *
 * The operator is generated for models with `UsageFlags.Input` set (see
 * {@link ImplicitBinaryContentOperator} in CastOperators.tsx). Models without
 * this flag (e.g., internal spread-only models) do not have implicit conversion
 * and need explicit BinaryContent wrapping in convenience method bodies.
 */
function hasImplicitBinaryContentOperator(type: SdkModelType): boolean {
  return (type.usage & UsageFlags.Input) !== 0;
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
 * - **Model without Input flag**: `BinaryContentHelper.FromObject(body)` (uses IPersistableModel)
 * - **Other (string, BinaryData, scalar)**: `BinaryContentHelper.FromObject(body)`
 *
 * @param name - The camelCase parameter name in C#.
 * @param type - The TCGC SDK type of the body parameter.
 * @returns A string expression to use as the body argument in the protocol call.
 */
function getBodyProtocolCallArg(name: string, type: SdkType): string {
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
    return getBodyProtocolCallArg(name, unwrapped.enumType);
  }

  // Array types: use FromEnumerable for proper JSON array serialization.
  if (unwrapped.kind === "array") {
    return `BinaryContentHelper.FromEnumerable(${escaped})`;
  }

  // All other types (string, BinaryData, model without Input, scalar, dict, etc.):
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
 * Known header names that are auto-populated at runtime and should not appear
 * in public method signatures. See RestClientFile.tsx for where the values
 * are generated in the request creation method.
 */
const specialHeaderNames = new Set([
  "repeatability-request-id",
  "repeatability-first-sent",
]);

/**
 * Checks if a header parameter is a "special" header that is auto-populated
 * at runtime rather than exposed as a method parameter.
 */
function isSpecialHeaderParam(param: SdkHeaderParameter): boolean {
  return specialHeaderNames.has(param.serializedName.toLowerCase());
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
