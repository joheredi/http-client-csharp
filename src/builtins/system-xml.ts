import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.Xml namespace.
 *
 * These are .NET XML types referenced by generated serialization code
 * for XML write paths. Models that support XML content types use
 * `XmlWriter` to serialize properties as XML attributes and elements.
 *
 * Referencing these symbols in Alloy JSX components automatically generates
 * the correct `using System.Xml;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.xml
 */
export const SystemXml = createLibrary("System.Xml", {
  /**
   * Represents a writer that provides a fast, non-cached, forward-only way
   * to generate streams or files that contain XML data.
   * Used in XML serialization to write model properties as XML attributes
   * and elements via `WriteStartElement`, `WriteStartAttribute`, `WriteValue`, etc.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.xml.xmlwriter
   */
  XmlWriter: {
    kind: "class",
    members: {},
  },
});
