import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.Collections.Generic namespace.
 *
 * These are generic collection interfaces referenced by generated model code
 * (e.g., the `_additionalBinaryDataProperties` field and serialization
 * constructor parameter). Referencing these symbols in Alloy JSX components
 * automatically generates the correct `using System.Collections.Generic;`
 * directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic
 */
export const SystemCollectionsGeneric = createLibrary(
  "System.Collections.Generic",
  {
    /**
     * Generic interface for a collection of key/value pairs.
     * Used as the type of `_additionalBinaryDataProperties` on model classes
     * and as the serialization constructor parameter type.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.idictionary-2
     */
    IDictionary: {
      kind: "interface",
      members: {},
    },

    /**
     * Generic interface for iterating over a collection of elements.
     * Used as the parameter type for collection parameters in protocol
     * method signatures (e.g., `IEnumerable<string>` for array query/path/header params).
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.ienumerable-1
     */
    IEnumerable: {
      kind: "interface",
      members: {},
    },
  },
);
