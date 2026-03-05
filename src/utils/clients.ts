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

/**
 * Extracts the simple client name from a potentially namespace-qualified name.
 *
 * TCGC may provide client names with namespace prefixes (e.g., "SubNamespace.SecondClient").
 * C# class names cannot contain dots, so this function strips the namespace prefix
 * and returns just the last segment (e.g., "SecondClient").
 *
 * @param name - The raw client name from TCGC.
 * @returns The simple class name without namespace prefix.
 */
export function getSimpleClientName(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.substring(dotIndex + 1) : name;
}

/**
 * Computes a unique filename prefix for a client based on its position in the
 * hierarchy. This prevents filename collisions when multiple sub-clients share
 * the same short name (e.g., "Standard", "Explode") at different levels.
 *
 * Root clients use their class name directly (e.g., "RoutesClient").
 * Sub-clients concatenate all non-root ancestor names with their own name
 * (e.g., "PathParametersLabelExpansionStandard"), matching the legacy emitter's
 * filename convention.
 *
 * For single-level hierarchies (root > child), the result equals the short
 * class name since there is only one non-root ancestor (the child itself).
 *
 * @param client - The TCGC SDK client type.
 * @param toClassName - A function that converts a raw client name to a C# class
 *   name (typically `(name) => namePolicy.getName(name, "class")`).
 * @returns A unique filename prefix for the client.
 */
export function getClientFileName(
  client: SdkClientType<SdkHttpOperation>,
  toClassName: (name: string) => string,
): string {
  // Root clients: just use the class name directly
  if (!client.parent) {
    return toClassName(getSimpleClientName(client.name));
  }

  // Sub-clients: walk up the parent chain and concatenate all non-root names.
  // Stop at the root (parent === undefined) to exclude the root client name.
  const parts: string[] = [];
  let current: SdkClientType<SdkHttpOperation> | undefined = client;
  while (current && current.parent !== undefined) {
    parts.unshift(toClassName(getSimpleClientName(current.name)));
    current = current.parent;
  }
  return parts.join("");
}
