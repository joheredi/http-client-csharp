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

    /**
     * Generic mutable list interface.
     * Used as the property type for writable array properties on model classes
     * (e.g., `IList<string>` for `tags: string[]` on an input model).
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.ilist-1
     */
    IList: {
      kind: "interface",
      members: {},
    },

    /**
     * Generic read-only list interface.
     * Used as the property type for read-only array properties on model classes
     * (e.g., `IReadOnlyList<string>` for output-only list properties).
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.ireadonlylist-1
     */
    IReadOnlyList: {
      kind: "interface",
      members: {},
    },

    /**
     * Generic read-only dictionary interface.
     * Used as the property type for read-only dictionary properties on model classes
     * (e.g., `IReadOnlyDictionary<string, T>` for output-only dict properties).
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.ireadonlydictionary-2
     */
    IReadOnlyDictionary: {
      kind: "interface",
      members: {},
    },

    /**
     * Generic interface for asynchronous iteration over a collection of elements.
     * Used as the return type for async paging methods (GetRawPagesAsync,
     * GetValuesFromPageAsync) in generated collection result classes.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.iasyncenumerable-1
     */
    IAsyncEnumerable: {
      kind: "interface",
      members: {},
    },

    /**
     * Concrete generic list class.
     * Used in deserialization code to construct mutable lists that accumulate
     * elements from JSON arrays (e.g., `List<T> array0 = new List<T>()`).
     * Referencing this symbol auto-generates `using System.Collections.Generic;`.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.list-1
     */
    List: {
      kind: "class",
      members: {},
    },

    /**
     * Concrete generic dictionary class.
     * Used in deserialization code to construct mutable dictionaries that
     * accumulate entries from JSON objects (e.g., `Dictionary<string, T> dict0 = new Dictionary<string, T>()`).
     * Referencing this symbol auto-generates `using System.Collections.Generic;`.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.dictionary-2
     */
    Dictionary: {
      kind: "class",
      members: {},
    },
  },
);
