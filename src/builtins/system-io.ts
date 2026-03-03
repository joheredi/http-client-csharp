import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.IO namespace.
 *
 * These are .NET BCL types referenced by generated serialization code
 * for XML deserialization paths where response content is read as a stream.
 * Referencing these symbols in Alloy JSX components automatically generates
 * the correct `using System.IO;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.io
 */
export const SystemIO = createLibrary("System.IO", {
  /**
   * Provides a generic view of a sequence of bytes.
   * Used in XML deserialization to read `response.ContentStream` when
   * deserializing XML content via `XElement.Load()`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.io.stream
   */
  Stream: {
    kind: "class",
    members: {},
  },

  /**
   * Creates a stream whose backing store is memory.
   * Used in XML serialization to buffer the XmlWriter output before
   * converting it to BinaryData.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.io.memorystream
   */
  MemoryStream: {
    kind: "class",
    members: {},
  },
});
