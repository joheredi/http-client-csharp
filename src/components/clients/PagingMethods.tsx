import { Method, useCSharpNamePolicy } from "@alloy-js/csharp";
import { code, namekey } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
import type {
  SdkArrayType,
  SdkClientType,
  SdkHttpOperation,
  SdkLroPagingServiceMethod,
  SdkPagingServiceMethod,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";

/**
 * Union type for methods that produce paginated results.
 * Both `SdkPagingServiceMethod` (kind "paging") and `SdkLroPagingServiceMethod`
 * (kind "lropaging") share `pagingMetadata` via `SdkPagingServiceMethodOptions`.
 * For System.ClientModel, LRO does not affect method signatures, so both kinds
 * generate identical collection-result-based methods.
 */
type PagingLikeMethod<
  T extends
    import("@azure-tools/typespec-client-generator-core").SdkServiceOperation,
> = SdkPagingServiceMethod<T> | SdkLroPagingServiceMethod<T>;
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import {
  SystemClientModel,
  SystemClientModelPrimitives,
} from "../../builtins/system-client-model.js";
import { SystemThreading } from "../../builtins/system-threading.js";
import {
  buildSiblingNameSet,
  cleanOperationName,
} from "../../utils/operation-naming.js";
import { getClientFileName } from "../../utils/clients.js";
import {
  getContinuationTokenParamName,
  reorderTokenFirst,
} from "../../utils/parameter-ordering.js";
import { getPipelineTypes } from "../../utils/pipeline-types.js";
import {
  buildProtocolParams,
  buildXmlDoc as buildProtocolXmlDoc,
} from "./ProtocolMethod.js";
import {
  buildConvenienceParams,
  buildConvenienceXmlDoc,
} from "./ConvenienceMethod.js";

/**
 * Props for the {@link PagingMethods} component.
 */
export interface PagingMethodsProps {
  /** The TCGC SDK client type whose paging operations produce paging method sets. */
  client: SdkClientType<SdkHttpOperation>;
  /** The emitter flavor ("azure" or "unbranded") for selecting pipeline types. */
  flavor?: string;
}

/**
 * Generates paging-level client methods for all paging operations on a client.
 *
 * For each paging operation, this component produces up to 4 methods:
 * - Protocol sync:  `CollectionResult Method(params, RequestOptions options)`
 * - Protocol async: `AsyncCollectionResult MethodAsync(params, RequestOptions options)`
 * - Convenience sync:  `CollectionResult<T> Method(params, CancellationToken ct = default)`
 * - Convenience async: `AsyncCollectionResult<T> MethodAsync(params, CancellationToken ct = default)`
 *
 * Unlike regular protocol/convenience methods which call Pipeline.ProcessMessage,
 * paging methods instantiate a collection result class that handles iteration
 * over paginated responses internally.
 *
 * The collection result class names follow the pattern:
 * `{ClientName}{OperationName}{CollectionResult|AsyncCollectionResult|CollectionResultOfT|AsyncCollectionResultOfT}`
 *
 * @example Generated output for a simple paging operation:
 * ```csharp
 * public virtual CollectionResult GetItems(RequestOptions options)
 * {
 *     return new MyClientGetItemsCollectionResult(this, options);
 * }
 *
 * public virtual AsyncCollectionResult GetItemsAsync(RequestOptions options)
 * {
 *     return new MyClientGetItemsAsyncCollectionResult(this, options);
 * }
 *
 * public virtual CollectionResult<Item> GetItems(CancellationToken cancellationToken = default)
 * {
 *     return new MyClientGetItemsCollectionResultOfT(this, cancellationToken.ToRequestOptions());
 * }
 *
 * public virtual AsyncCollectionResult<Item> GetItemsAsync(CancellationToken cancellationToken = default)
 * {
 *     return new MyClientGetItemsAsyncCollectionResultOfT(this, cancellationToken.ToRequestOptions());
 * }
 * ```
 */
export function PagingMethods(props: PagingMethodsProps) {
  const { client, flavor } = props;
  const namePolicy = useCSharpNamePolicy();
  const toClassName = (name: string) => namePolicy.getName(name, "class");
  const clientName = getClientFileName(client, toClassName);
  const siblingNames = buildSiblingNameSet(client.methods, (n) =>
    namePolicy.getName(n, "class"),
  );
  const pipelineTypes = getPipelineTypes(flavor ?? "unbranded");

  const methods = client.methods.filter(
    (m): m is PagingLikeMethod<SdkHttpOperation> =>
      m.kind === "paging" || m.kind === "lropaging",
  );

  if (methods.length === 0) return null;

  return (
    <>
      {methods.flatMap((method) => {
        const operation = method.operation;
        const methodName = cleanOperationName(
          namePolicy.getName(method.name, "class"),
          siblingNames,
        );
        const access = method.access ?? "public";
        const description = method.doc ?? method.summary ?? "";

        const accessProps =
          access === "internal"
            ? ({ internal: true } as const)
            : ({ public: true } as const);

        // Collection result class name base (matching CollectionResultFile naming)
        const classNameBase = `${clientName}${methodName}`;

        // Extract item type for convenience methods from paging metadata
        const metadata = method.pagingMetadata;
        const itemSegments = metadata.pageItemsSegments;
        let itemTypeExpr: Children | undefined;

        // Identify the continuation token parameter name so it can be
        // placed first in the method signature (matching legacy emitter).
        const tokenParamName = getContinuationTokenParamName(metadata);

        if (itemSegments && itemSegments.length > 0) {
          const lastSegment = itemSegments[itemSegments.length - 1];
          const itemSdkType: SdkType =
            lastSegment.type.kind === "array"
              ? (lastSegment.type as SdkArrayType).valueType
              : lastSegment.type;

          if (itemSdkType.__raw) {
            itemTypeExpr = <TypeExpression type={itemSdkType.__raw} />;
          }
        }

        const getParamName = (name: string) =>
          namePolicy.getName(name, "parameter");
        const result: Children[] = [];

        // Protocol methods (sync + async)
        result.push(
          ...renderProtocolPagingMethods(
            method,
            methodName,
            classNameBase,
            accessProps,
            description,
            operation,
            tokenParamName,
            getParamName,
            pipelineTypes,
          ),
        );

        // Convenience methods (sync + async) — only if generateConvenient and item type is known
        if (method.generateConvenient && itemTypeExpr) {
          result.push(
            ...renderConveniencePagingMethods(
              method,
              methodName,
              classNameBase,
              accessProps,
              description,
              operation,
              itemTypeExpr,
              tokenParamName,
              getParamName,
              pipelineTypes,
            ),
          );
        }

        return result;
      })}
    </>
  );
}

/**
 * Renders protocol-level paging methods (sync + async pair).
 *
 * Protocol paging methods accept the same parameters as regular protocol methods
 * (wire types for enums, BinaryContent for bodies, RequestOptions) but return
 * CollectionResult/AsyncCollectionResult and instantiate the collection result class.
 */
function renderProtocolPagingMethods(
  method: PagingLikeMethod<SdkHttpOperation>,
  methodName: string,
  classNameBase: string,
  accessProps: { internal: true } | { public: true },
  description: string,
  operation: SdkHttpOperation,
  tokenParamName: string | undefined,
  getParamName: (name: string) => string,
  pipelineTypes?: import("../../utils/pipeline-types.js").PipelineTypes,
): Children[] {
  const params = reorderTokenFirst(
    buildProtocolParams(operation, getParamName),
    tokenParamName,
  );
  const hasOptionalParams = params.some((p) => p.optional);
  const requiredParams = params.filter((p) => !p.optional);

  // Build argument list to pass to collection result constructor: this, ...params, options
  const constructorArgs = [
    "this",
    ...params.map((p) => p.name),
    "options",
  ].join(", ");

  // Build <Method> parameter props
  const reqOpts =
    pipelineTypes?.requestOptions ?? SystemClientModelPrimitives.RequestOptions;
  const methodParams = [
    ...params.map((p) => ({
      name: p.name,
      type: p.type,
      ...(p.optional ? { default: "default" } : {}),
    })),
    {
      name: "options",
      type: reqOpts as Children,
      ...(hasOptionalParams ? { default: "null" } : {}),
    },
  ];

  const xmlDoc = buildProtocolXmlDoc(description, params, requiredParams);

  // Sync protocol method
  const syncClassName = `${classNameBase}CollectionResult`;
  const syncBody = `return new ${syncClassName}(${constructorArgs});`;

  // Async protocol method
  const asyncClassName = `${classNameBase}AsyncCollectionResult`;
  const asyncBody = `return new ${asyncClassName}(${constructorArgs});`;

  return [
    "\n\n",
    ...xmlDoc,
    "\n",
    <Method
      {...accessProps}
      virtual
      name={namekey(methodName, { ignoreNameConflict: true })}
      returns={SystemClientModel.CollectionResult}
      parameters={methodParams}
    >
      {syncBody}
    </Method>,
    "\n\n",
    ...xmlDoc,
    "\n",
    <Method
      {...accessProps}
      virtual
      name={namekey(`${methodName}Async`, { ignoreNameConflict: true })}
      returns={SystemClientModel.AsyncCollectionResult}
      parameters={methodParams}
    >
      {asyncBody}
    </Method>,
  ];
}

/**
 * Renders convenience-level paging methods (sync + async pair).
 *
 * Convenience paging methods accept typed parameters (original model types,
 * not wire types) and a CancellationToken. They return CollectionResult{T}
 * or AsyncCollectionResult{T} and instantiate the typed collection result class.
 *
 * Parameters are converted to protocol form when passed to the constructor
 * (e.g., enum values are converted via .ToString() or integer casts).
 */
function renderConveniencePagingMethods(
  method: PagingLikeMethod<SdkHttpOperation>,
  methodName: string,
  classNameBase: string,
  accessProps: { internal: true } | { public: true },
  description: string,
  operation: SdkHttpOperation,
  itemTypeExpr: Children,
  tokenParamName: string | undefined,
  getParamName: (name: string) => string,
  _pipelineTypes?: import("../../utils/pipeline-types.js").PipelineTypes,
): Children[] {
  const { params } = buildConvenienceParams(operation, getParamName);
  const reorderedParams = reorderTokenFirst(params, tokenParamName);

  // Build constructor args: this, ...convertedParams, cancellationToken.ToRequestOptions()
  const convertedArgs = reorderedParams.map((p) => p.protocolCallArg);
  const constructorArgs = [
    "this",
    ...convertedArgs,
    "cancellationToken.ToRequestOptions()",
  ].join(", ");

  // Build <Method> parameter props
  const methodParams = [
    ...reorderedParams.map((p) => ({
      name: p.name,
      type: p.type,
      ...(p.optional ? { default: "default" } : {}),
    })),
    {
      name: "cancellationToken",
      type: SystemThreading.CancellationToken as Children,
      default: "default",
    },
  ];

  const xmlDoc = buildConvenienceXmlDoc(description, reorderedParams, []);

  // Return types with generic item type
  const syncReturn = code`${SystemClientModel.CollectionResult}<${itemTypeExpr}>`;
  const asyncReturn = code`${SystemClientModel.AsyncCollectionResult}<${itemTypeExpr}>`;

  // Sync convenience method
  const syncClassName = `${classNameBase}CollectionResultOfT`;
  const syncBody = `return new ${syncClassName}(${constructorArgs});`;

  // Async convenience method
  const asyncClassName = `${classNameBase}AsyncCollectionResultOfT`;
  const asyncBody = `return new ${asyncClassName}(${constructorArgs});`;

  return [
    "\n\n",
    ...xmlDoc,
    "\n",
    <Method
      {...accessProps}
      virtual
      name={namekey(methodName, { ignoreNameConflict: true })}
      returns={syncReturn}
      parameters={methodParams}
    >
      {syncBody}
    </Method>,
    "\n\n",
    ...xmlDoc,
    "\n",
    <Method
      {...accessProps}
      virtual
      name={namekey(`${methodName}Async`, { ignoreNameConflict: true })}
      returns={asyncReturn}
      parameters={methodParams}
    >
      {asyncBody}
    </Method>,
  ];
}
