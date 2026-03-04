import type {
  SdkClientType,
  SdkEnumType,
  SdkHttpOperation,
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";

/**
 * The strategy for handling types not referenced by any client operation.
 */
export type UnreferencedTypesHandling =
  | "removeOrInternalize"
  | "internalize"
  | "keepAll";

/**
 * Result of applying unreferenced type handling to a set of models and enums.
 */
export interface UnreferencedTypeResult {
  models: SdkModelType[];
  enums: SdkEnumType[];
}

/**
 * Extracts all SdkModelType and SdkEnumType instances from a compound SdkType,
 * unwrapping container types (arrays, dictionaries, nullables, unions).
 * Does NOT recurse into model properties — only unwraps type wrappers.
 *
 * This is used to extract the "leaf" model/enum types from complex type
 * expressions like `string[]`, `Record<string, Widget>`, or `Widget | null`.
 *
 * @param type - The SdkType to extract model/enum types from.
 * @returns An array of model and enum types found within the type.
 */
export function extractModelOrEnumTypes(
  type: SdkType,
): (SdkModelType | SdkEnumType)[] {
  switch (type.kind) {
    case "model":
      return [type];
    case "enum":
      return [type];
    case "enumvalue":
      return [type.enumType];
    case "array":
      return extractModelOrEnumTypes(type.valueType);
    case "dict":
      return [
        ...extractModelOrEnumTypes(type.keyType),
        ...extractModelOrEnumTypes(type.valueType),
      ];
    case "nullable":
      return extractModelOrEnumTypes(type.type);
    case "union":
      return type.variantTypes.flatMap((v) => extractModelOrEnumTypes(v));
    default:
      return [];
  }
}

/**
 * Gets all model and enum types directly referenced by a model type.
 * Includes references from properties, base model, discriminated subtypes,
 * and additional properties. Does NOT recurse — returns only immediate
 * references from the given model.
 *
 * @param model - The model to get direct references from.
 * @returns An array of directly referenced model and enum types.
 */
export function getDirectReferences(
  model: SdkModelType,
): (SdkModelType | SdkEnumType)[] {
  const refs: (SdkModelType | SdkEnumType)[] = [];

  for (const prop of model.properties) {
    refs.push(...extractModelOrEnumTypes(prop.type));
  }

  if (model.baseModel) {
    refs.push(model.baseModel);
  }

  if (model.discriminatedSubtypes) {
    refs.push(...Object.values(model.discriminatedSubtypes));
  }

  if (model.additionalProperties) {
    refs.push(...extractModelOrEnumTypes(model.additionalProperties));
  }

  return refs;
}

/**
 * Collects all model and enum types directly used in client operation
 * signatures (parameters, responses, exceptions). These are the "root"
 * types for the reference graph — any type not reachable from these roots
 * is considered unreferenced.
 *
 * Recursively processes child clients (sub-clients) to collect all types
 * across the entire client hierarchy.
 *
 * @param clients - The top-level clients from the TCGC SdkPackage.
 * @returns A set of all root model and enum types.
 */
export function collectRootTypes(
  clients: SdkClientType<SdkHttpOperation>[],
): Set<SdkModelType | SdkEnumType> {
  const roots = new Set<SdkModelType | SdkEnumType>();

  function processClient(client: SdkClientType<SdkHttpOperation>) {
    for (const method of client.methods) {
      // Collect types from method-level parameters
      for (const param of method.parameters) {
        for (const t of extractModelOrEnumTypes(param.type)) {
          roots.add(t);
        }
      }

      // Collect types from method-level response (for paging, this is the item type)
      if (method.response?.type) {
        for (const t of extractModelOrEnumTypes(method.response.type)) {
          roots.add(t);
        }
      }

      if (method.exception?.type) {
        for (const t of extractModelOrEnumTypes(method.exception.type)) {
          roots.add(t);
        }
      }

      // Collect types from operation-level responses and exceptions.
      // This is necessary because for paging methods, the method-level
      // response type is the item type, but the page wrapper model is
      // only accessible through the operation-level responses.
      const operation = method.operation;
      if (operation.bodyParam?.type) {
        for (const t of extractModelOrEnumTypes(operation.bodyParam.type)) {
          roots.add(t);
        }
      }
      for (const response of operation.responses) {
        if (response.type) {
          for (const t of extractModelOrEnumTypes(response.type)) {
            roots.add(t);
          }
        }
      }
      for (const exception of operation.exceptions) {
        if (exception.type) {
          for (const t of extractModelOrEnumTypes(exception.type)) {
            roots.add(t);
          }
        }
      }
    }

    if (client.children) {
      for (const child of client.children) {
        processClient(child);
      }
    }
  }

  for (const client of clients) {
    processClient(client);
  }

  return roots;
}

/**
 * BFS from root types through the type reference graph to find all
 * reachable model and enum types. A type is reachable if it can be
 * reached from a root type through property types, base models,
 * discriminated subtypes, or additional properties.
 *
 * Enum types are leaf nodes — they don't reference other model/enum types,
 * so the BFS doesn't expand through them.
 *
 * @param roots - The root types to start the BFS from.
 * @returns A set of all reachable model and enum types.
 */
export function findReachableTypes(
  roots: Set<SdkModelType | SdkEnumType>,
): Set<SdkModelType | SdkEnumType> {
  const reachable = new Set<SdkModelType | SdkEnumType>();
  const queue = [...roots];

  while (queue.length > 0) {
    const type = queue.shift()!;
    if (reachable.has(type)) continue;
    reachable.add(type);

    if (type.kind === "model") {
      for (const ref of getDirectReferences(type)) {
        if (!reachable.has(ref)) {
          queue.push(ref);
        }
      }
    }
    // Enums don't reference other model/enum types — no expansion needed
  }

  return reachable;
}

/**
 * Applies the unreferenced-types-handling option to a set of models and enums.
 *
 * Builds a reference graph from TCGC types and walks it from operation
 * signature types (root types) to determine which types are reachable.
 * Unreachable types are handled according to the specified option:
 *
 * - `"keepAll"` — no changes, all types emitted as-is
 * - `"internalize"` — unreachable public types have their access set to "internal"
 * - `"removeOrInternalize"` — unreachable types are removed entirely
 *
 * In the legacy emitter, `removeOrInternalize` performed two phases:
 * internalize first, then remove types with zero references. In TCGC,
 * all type references are equivalent (no public/private member distinction),
 * so the reachable set is the same for both phases — unreachable types
 * are simply removed.
 *
 * @param models - All models from the TCGC SdkPackage.
 * @param enums - All enums from the TCGC SdkPackage.
 * @param clients - All clients from the TCGC SdkPackage.
 * @param option - The handling strategy to apply.
 * @returns The filtered/modified models and enums.
 */
export function applyUnreferencedTypeHandling(
  models: SdkModelType[],
  enums: SdkEnumType[],
  clients: SdkClientType<SdkHttpOperation>[],
  option: UnreferencedTypesHandling,
): UnreferencedTypeResult {
  if (option === "keepAll") {
    return { models, enums };
  }

  const roots = collectRootTypes(clients);
  const reachable = findReachableTypes(roots);

  if (option === "internalize") {
    // Set access to "internal" for unreachable public types, but keep them in output
    for (const model of models) {
      if (!reachable.has(model) && model.access === "public") {
        (model as { access: string }).access = "internal";
      }
    }
    for (const e of enums) {
      if (!reachable.has(e) && e.access === "public") {
        (e as { access: string }).access = "internal";
      }
    }
    return { models, enums };
  }

  // removeOrInternalize: remove unreachable types entirely
  return {
    models: models.filter((m) => reachable.has(m)),
    enums: enums.filter((e) => reachable.has(e)),
  };
}
