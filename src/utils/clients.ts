import type {
  SdkClientType,
  SdkHttpOperation,
} from "@azure-tools/typespec-client-generator-core";

/**
 * Collects all clients from the SDK package client tree using breadth-first traversal.
 *
 * The `sdkPackage.clients` array contains only root-level (first-level) clients.
 * Sub-clients are accessible via each client's `children` property. This utility
 * flattens the hierarchy into a single array containing root clients followed by
 * all nested sub-clients, preserving breadth-first order.
 *
 * @param rootClients - The root-level clients from `sdkPackage.clients`.
 * @returns A flat array of all clients in the tree (root + sub-clients).
 */
export function getAllClients(
  rootClients: SdkClientType<SdkHttpOperation>[],
): SdkClientType<SdkHttpOperation>[] {
  const result: SdkClientType<SdkHttpOperation>[] = [];
  const queue = [...rootClients];
  while (queue.length > 0) {
    const client = queue.shift()!;
    result.push(client);
    if (client.children) {
      queue.push(...client.children);
    }
  }
  return result;
}
