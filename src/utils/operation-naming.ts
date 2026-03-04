/**
 * Applies .NET naming conventions to C# operation names.
 *
 * In .NET SDKs, "List" operations follow the convention:
 * - "List" → "GetAll" (standalone list operation)
 * - "ListXxx" (e.g., "ListItems") → "GetXxx" (e.g., "GetItems")
 *
 * The input name must already be PascalCase (i.e., after applying the
 * C# naming policy). This matches the legacy emitter's
 * `GetCleanOperationName` logic in `ClientProvider.cs`, which applies
 * `ToIdentifierName()` before the List→Get transformation.
 *
 * When `siblingNames` is provided, the function checks whether the List→Get
 * transformation would produce a name that already exists among sibling
 * methods in the same client. If so, the transformation is skipped to avoid
 * CS0111 (duplicate method overloads differing only in return type). This
 * handles the ARM Singleton pattern where both `getByResourceGroup` (scalar)
 * and `listByResourceGroup` (paging) exist on the same client — without the
 * check, both would map to `GetByResourceGroup`.
 *
 * @param name - The PascalCase operation name (e.g., from `namePolicy.getName(method.name, "class")`).
 * @param siblingNames - Optional set of PascalCase method names for all methods in the same client
 *   (before cleaning). Used to detect and avoid naming collisions from the List→Get transformation.
 * @returns The cleaned operation name with .NET List→Get conventions applied,
 *   or the original name if the transformation would cause a collision.
 *
 * @example
 * cleanOperationName("List")       // → "GetAll"
 * cleanOperationName("ListItems")  // → "GetItems"
 * cleanOperationName("ListAll")    // → "GetAll" (note: replaces "List" prefix)
 * cleanOperationName("Listen")     // → "Listen" (no uppercase after "List")
 * cleanOperationName("GetItem")    // → "GetItem" (no change)
 *
 * // With siblingNames to avoid collisions:
 * cleanOperationName("ListByResourceGroup", new Set(["GetByResourceGroup", "ListByResourceGroup"]))
 *   // → "ListByResourceGroup" (skipped: "GetByResourceGroup" already exists)
 */
export function cleanOperationName(
  name: string,
  siblingNames?: Set<string>,
): string {
  let cleanedName: string;

  if (name === "List") {
    cleanedName = "GetAll";
  } else if (
    name.startsWith("List") &&
    name.length > 4 &&
    name[4] >= "A" &&
    name[4] <= "Z"
  ) {
    cleanedName = `Get${name.substring(4)}`;
  } else {
    return name;
  }

  // If the cleaned name would collide with an existing sibling method name,
  // skip the rename to avoid CS0111 (duplicate overloads differing only in
  // return type).
  if (siblingNames && cleanedName !== name && siblingNames.has(cleanedName)) {
    return name;
  }

  return cleanedName;
}

/**
 * Builds a set of PascalCase method names for all methods on a client.
 *
 * This set is passed to {@link cleanOperationName} as `siblingNames` so the
 * List→Get transformation can detect and avoid naming collisions. The set
 * contains names BEFORE the List→Get cleaning so that pre-existing "Get..."
 * methods are visible as potential collision targets.
 *
 * @param methods - The TCGC SDK service methods from the client.
 * @param getName - A function that applies the C# naming policy (typically
 *   `namePolicy.getName(name, "class")`).
 * @returns A Set of PascalCase method names.
 */
export function buildSiblingNameSet(
  methods: ReadonlyArray<{ name: string }>,
  getName: (name: string) => string,
): Set<string> {
  return new Set(methods.map((m) => getName(m.name)));
}
