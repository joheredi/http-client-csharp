/**
 * Utility functions for converting API version strings to C# enum member names.
 *
 * The legacy C# generator uses `StringExtensions.ToApiVersionMemberName()` to
 * convert API version strings (e.g., "2024-07-16-preview") into valid C# enum
 * member names (e.g., "V2024_07_16_Preview"). This module provides the same
 * logic in TypeScript for the Alloy-based emitter.
 *
 * @see StringExtensions.cs in the legacy generator for the original implementation.
 */

/**
 * Converts an API version string to a valid C# enum member name.
 *
 * The conversion follows the legacy generator's `ToApiVersionMemberName()` logic:
 * 1. Prefix with "V" (skip existing leading "v"/"V")
 * 2. Replace dashes (`-`) and dots (`.`) with underscores (`_`)
 * 3. Title-case each segment after underscores
 *
 * @example
 * ```ts
 * toApiVersionMemberName("2024-07-16-preview") // → "V2024_07_16_Preview"
 * toApiVersionMemberName("v2.0")               // → "V2_0"
 * toApiVersionMemberName("2023-10-01-beta")    // → "V2023_10_01_Beta"
 * ```
 *
 * @param version - The raw API version string from the TypeSpec service definition.
 * @returns A valid C# enum member name prefixed with "V".
 */
export function toApiVersionMemberName(version: string): string {
  // Start with "V" prefix; skip existing leading "v" or "V"
  let result = "V";
  const startIndex =
    version.length > 0 && (version[0] === "v" || version[0] === "V") ? 1 : 0;

  for (let i = startIndex; i < version.length; i++) {
    const c = version[i];
    if (c === "-" || c === ".") {
      result += "_";
    } else {
      result += c;
    }
  }

  // Apply title-casing: capitalize the first letter after each underscore
  return toTitleCase(result);
}

/**
 * Capitalizes the first character and the character after each underscore.
 *
 * This matches the behavior of .NET's `TextInfo.ToTitleCase()` when applied
 * to underscore-delimited identifiers (the legacy generator's approach).
 *
 * @param value - The underscore-delimited string to title-case.
 * @returns The title-cased string.
 */
function toTitleCase(value: string): string {
  let result = "";
  let capitalizeNext = true;

  for (const c of value) {
    if (c === "_") {
      result += "_";
      capitalizeNext = true;
    } else if (capitalizeNext) {
      result += c.toUpperCase();
      capitalizeNext = false;
    } else {
      result += c;
    }
  }

  return result;
}
