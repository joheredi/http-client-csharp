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

  /**
   * Exception thrown when a method is invoked with an argument value that
   * is not supported. Used in the ClientOptions constructor switch expression
   * to reject unrecognized ServiceVersion values.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.notsupportedexception
   */
  NotSupportedException: {
    kind: "class",
    members: {},
  },

  /**
   * Represents a Uniform Resource Identifier (URI).
   * Used as the type for the `_endpoint` field in generated client classes
   * and as a constructor parameter for service endpoints.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.uri
   */
  Uri: {
    kind: "class",
    members: {},
  },
});
