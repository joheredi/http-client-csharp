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
 * @param name - The PascalCase operation name (e.g., from `namePolicy.getName(method.name, "class")`).
 * @returns The cleaned operation name with .NET List→Get conventions applied.
 *
 * @example
 * cleanOperationName("List")       // → "GetAll"
 * cleanOperationName("ListItems")  // → "GetItems"
 * cleanOperationName("ListAll")    // → "GetAll" (note: replaces "List" prefix)
 * cleanOperationName("Listen")     // → "Listen" (no uppercase after "List")
 * cleanOperationName("GetItem")    // → "GetItem" (no change)
 */
export function cleanOperationName(name: string): string {
  if (name === "List") {
    return "GetAll";
  }

  if (
    name.startsWith("List") &&
    name.length > 4 &&
    name[4] >= "A" &&
    name[4] <= "Z"
  ) {
    return `Get${name.substring(4)}`;
  }

  return name;
}
