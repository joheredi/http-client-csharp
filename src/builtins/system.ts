import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System namespace.
 *
 * These are core .NET BCL types referenced by generated serialization code.
 * Referencing these symbols in Alloy JSX components automatically generates
 * the correct `using System;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system
 */
export const System = createLibrary("System", {
  /**
   * Exception thrown when the format of an argument is invalid.
   * Used in serialization methods to reject unsupported wire formats
   * (e.g., when a JSON-only model receives a non-JSON format request).
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.formatexception
   */
  FormatException: {
    kind: "class",
    members: {},
  },

  /**
   * Represents a type using a string representation.
   * Used in serialization for BinaryData and model conversion methods.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.binarydata
   */
  BinaryData: {
    kind: "class",
    members: {},
  },
});
