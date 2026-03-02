import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.Xml.Linq namespace.
 *
 * These are .NET LINQ to XML types referenced by generated serialization code
 * for XML deserialization paths. Models that support XML content types use
 * `XElement.Load()` to parse response streams into XML elements for
 * deserialization.
 *
 * Referencing these symbols in Alloy JSX components automatically generates
 * the correct `using System.Xml.Linq;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.xml.linq
 */
export const SystemXmlLinq = createLibrary("System.Xml.Linq", {
  /**
   * Represents an XML element. Used in XML deserialization to parse
   * response content streams via `XElement.Load(stream, loadOptions)`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.xml.linq.xelement
   */
  XElement: {
    kind: "class",
    members: {},
  },

  /**
   * Specifies load options for XML parsing. The `PreserveWhitespace`
   * value is used when loading XML to maintain whitespace fidelity
   * during round-trip serialization.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.xml.linq.loadoptions
   */
  LoadOptions: {
    kind: "enum",
    members: {
      /** Preserves insignificant whitespace during XML parsing. */
      PreserveWhitespace: { kind: "field" },
    },
  },
});
