/**
 * Transforms subscriptionId parameters from client scope to method scope
 * for Azure management plane SDKs.
 *
 * TCGC puts subscriptionId in client initialization by default (marking
 * the operation-level path parameter with `onClient: true`). For management
 * plane, subscriptionId should be a method parameter on each operation that
 * uses it, not a client-level field.
 *
 * This transformation:
 * 1. Sets `onClient = false` on subscriptionId operation path parameters
 *    so downstream builders (buildProtocolParams, buildConvenienceParams,
 *    buildMethodParams) include it in method signatures.
 * 2. Removes subscriptionId from client initialization parameters so no
 *    `_subscriptionId` field is generated on client classes.
 * 3. Walks up the parent chain to remove from all ancestor clients.
 *
 * This must be called before the JSX component tree is rendered, as it
 * mutates the TCGC data in place. The legacy emitter has an equivalent
 * transformation in `subscription-id-transformer.ts` that runs before
 * other code model transformations.
 *
 * @module
 */

import type {
  SdkClientType,
  SdkHttpOperation,
  SdkPathParameter,
  SdkServiceMethod,
} from "@azure-tools/typespec-client-generator-core";
import { getAllClients } from "./clients.js";

/** The wire name used for subscription ID path parameters in ARM URLs. */
const SUBSCRIPTION_ID_SERIALIZED_NAME = "subscriptionId";

/**
 * Transforms subscriptionId parameters from client scope to method scope
 * for all clients in the SDK package.
 *
 * Iterates through every client (including nested sub-clients) and every
 * method's operation parameters. When a subscriptionId path parameter is
 * found with `onClient: true`, it is moved to method scope by:
 * - Setting `onClient = false` on the operation parameter
 * - Removing the corresponding entry from client initialization parameters
 *
 * This is safe to call when subscriptionId is already at method level
 * (e.g., via `@clientLocation` decorator) — the check for `onClient: true`
 * prevents double-processing.
 *
 * @param rootClients - The root-level clients from `sdkPackage.clients`.
 */
export function transformSubscriptionIdParameters(
  rootClients: SdkClientType<SdkHttpOperation>[],
): void {
  const allClients = getAllClients(rootClients);

  for (const client of allClients) {
    let subscriptionIdFound = false;

    for (const method of client.methods) {
      if (processMethodSubscriptionId(method)) {
        subscriptionIdFound = true;
      }
    }

    if (subscriptionIdFound) {
      removeSubscriptionIdFromClientChain(client);
    }
  }
}

/**
 * Checks a single method for a subscriptionId operation parameter that is
 * at client scope, and moves it to method scope if found.
 *
 * @param method - The SDK service method to inspect.
 * @returns `true` if subscriptionId was moved to method scope, `false` otherwise.
 */
function processMethodSubscriptionId(
  method: SdkServiceMethod<SdkHttpOperation>,
): boolean {
  // Only process methods that have an HTTP operation with parameters
  if (!("operation" in method) || !method.operation) {
    return false;
  }

  const operation = method.operation;

  // Find subscriptionId in operation parameters: must be a path parameter
  // with the serialized name "subscriptionId" and currently on the client
  const subscriptionIdParam = operation.parameters.find(
    (p): p is SdkPathParameter =>
      p.kind === "path" &&
      p.serializedName === SUBSCRIPTION_ID_SERIALIZED_NAME &&
      p.onClient,
  );

  if (!subscriptionIdParam) {
    return false;
  }

  // Move to method scope: downstream builders (buildProtocolParams, etc.)
  // check `p.onClient` to decide whether to include in method signatures.
  // Setting to false makes the parameter appear in all method signatures
  // and use the method parameter name directly in URL construction.
  subscriptionIdParam.onClient = false;

  return true;
}

/**
 * Removes subscriptionId from a client and all its parent clients'
 * initialization parameters.
 *
 * When subscriptionId is moved from client to method scope, it must be
 * removed from the entire client chain. TCGC may have placed it on the
 * root client and inherited it to child clients. Removing from all
 * ancestors ensures no client generates a `_subscriptionId` field.
 *
 * @param client - The client where subscriptionId was found in a method.
 */
function removeSubscriptionIdFromClientChain(
  client: SdkClientType<SdkHttpOperation>,
): void {
  let current: SdkClientType<SdkHttpOperation> | undefined = client;
  while (current) {
    removeSubscriptionIdFromClient(current);
    current = current.parent;
  }
}

/**
 * Removes subscriptionId from a single client's initialization parameters.
 *
 * Filters out any method parameter whose name matches "subscriptionId".
 * Uses `name` matching (not `serializedName`) because client initialization
 * parameters are `SdkMethodParameter` objects where `name` is the canonical
 * identifier.
 *
 * @param client - The client to remove subscriptionId from.
 */
function removeSubscriptionIdFromClient(
  client: SdkClientType<SdkHttpOperation>,
): void {
  if (!client.clientInitialization?.parameters) {
    return;
  }

  client.clientInitialization.parameters =
    client.clientInitialization.parameters.filter(
      (p) =>
        !(
          p.kind === "method" &&
          p.name === SUBSCRIPTION_ID_SERIALIZED_NAME
        ),
    );
}
