import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.Net namespace.
 *
 * These are .NET BCL types referenced by generated C# client code when
 * Azure.Core scalar types like `ipV4Address` and `ipV6Address` are mapped
 * to their C# equivalents. Referencing these symbols automatically generates
 * the correct `using System.Net;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.net
 */
export const SystemNet = createLibrary("System.Net", {
  /**
   * Provides an Internet Protocol (IP) address. Used as the C# type mapping
   * for both `Azure.Core.ipV4Address` and `Azure.Core.ipV6Address` TypeSpec
   * scalars when the emitter flavor is `"azure"`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.net.ipaddress
   */
  IPAddress: {
    kind: "class",
    members: {},
  },
});
