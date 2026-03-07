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
   * The base class for all exceptions in .NET.
   * Used in diagnostic scope catch blocks for distributed tracing:
   * `catch (Exception e) { scope.Failed(e); throw; }`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.exception
   */
  Exception: {
    kind: "class",
    members: {},
  },

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

  /**
   * Represents a globally unique identifier (GUID).
   * Used to auto-generate Repeatability-Request-ID values for OASIS
   * repeatability headers in generated REST client request methods.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.guid
   */
  Guid: {
    kind: "struct",
    members: {},
  },

  /**
   * Represents a point in time relative to UTC, used for date-time
   * parameters in generated REST client request methods.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.datetimeoffset
   */
  DateTimeOffset: {
    kind: "struct",
    members: {},
  },

  /**
   * Represents a time interval, used for duration parameters in
   * generated REST client request methods.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.timespan
   */
  TimeSpan: {
    kind: "struct",
    members: {},
  },

  /**
   * Specifies the culture, case, and sort rules for string comparisons.
   * Used in Content-Type sniffing for dual-format (JSON+XML) models to
   * perform case-insensitive header value comparison.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.stringcomparison
   */
  StringComparison: {
    kind: "enum",
    members: {
      /** Compares strings using ordinal sort rules, ignoring case. */
      OrdinalIgnoreCase: { kind: "field" },
    },
  },
});
