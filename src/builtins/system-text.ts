import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.Text namespace.
 *
 * Contains text encoding types used by dynamic model serialization code
 * to convert dictionary keys to UTF-8 bytes for patch path construction.
 * Referencing these symbols automatically generates `using System.Text;`.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.text
 */
export const SystemText = createLibrary("System.Text", {
  /**
   * Represents a character encoding. Used via `Encoding.UTF8.GetBytes()`
   * to convert string dictionary keys to byte arrays for JSON Merge Patch
   * path comparison in dynamic model serialization.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.encoding
   */
  Encoding: {
    kind: "class",
    members: {},
  },
});
