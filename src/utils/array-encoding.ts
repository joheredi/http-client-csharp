/**
 * Utility for mapping TCGC `ArrayKnownEncoding` values to C# delimiter strings.
 *
 * When a model property has `@encode(ArrayEncoding.*)` in TypeSpec, TCGC sets the
 * `property.encode` field to one of `"commaDelimited" | "spaceDelimited" |
 * "pipeDelimited" | "newlineDelimited"`. This indicates that the array should be
 * serialized as a single delimited string in JSON rather than a JSON array.
 *
 * Example: `@encode(ArrayEncoding.commaDelimited) value: string[]`
 * - Serialize: `["blue","red","green"]` → `"blue,red,green"`
 * - Deserialize: `"blue,red,green"` → `["blue","red","green"]`
 *
 * @module
 */

/**
 * Delimiter info for array encoding, containing both string and char forms
 * for use in C# `string.Join()` and `string.Split()` respectively.
 */
export interface ArrayEncodingDelimiter {
  /** The delimiter string for C# `string.Join(delimiter, ...)` (e.g., `","`, `"|"`) */
  joinDelimiter: string;
  /** The delimiter char literal for C# `string.Split(char)` (e.g., `','`, `'|'`) */
  splitChar: string;
}

/**
 * Maps a TCGC `ArrayKnownEncoding` value to the corresponding C# delimiter strings.
 *
 * Returns `undefined` if the encode value is not an array encoding, allowing callers
 * to distinguish between array-encoded properties and non-encoded ones.
 *
 * @param encode - The `property.encode` value from TCGC (e.g., `"commaDelimited"`).
 * @returns Delimiter info for code generation, or `undefined` if not an array encoding.
 */
export function getArrayEncodingDelimiter(
  encode?: string,
): ArrayEncodingDelimiter | undefined {
  if (!encode) return undefined;

  switch (encode) {
    case "commaDelimited":
      return { joinDelimiter: ",", splitChar: "','" };
    case "spaceDelimited":
      return { joinDelimiter: " ", splitChar: "' '" };
    case "pipeDelimited":
      return { joinDelimiter: "|", splitChar: "'|'" };
    case "newlineDelimited":
      // In C# source code, '\n' is the newline character
      return { joinDelimiter: "\\n", splitChar: "'\\n'" };
    default:
      return undefined;
  }
}

/**
 * Checks whether a model property has an array encoding that requires
 * `System.Linq` for serialization/deserialization.
 *
 * String-element arrays use `string.Join`/`string.Split` directly (no Linq needed).
 * Enum and extensible enum elements require `.Select()` from `System.Linq` to
 * convert between wire string values and typed enum values.
 *
 * @param encode - The property's `encode` value from TCGC.
 * @param elementKind - The `kind` of the array's element type (after unwrapping nullable).
 * @returns `true` if the property needs `System.Linq` for its encoded array handling.
 */
export function encodedArrayNeedsLinq(
  encode: string | undefined,
  elementKind: string,
): boolean {
  if (!encode || !getArrayEncodingDelimiter(encode)) return false;
  // String elements don't need Linq — string.Join and Split work directly
  return elementKind === "enum" || elementKind === "enumvalue";
}
