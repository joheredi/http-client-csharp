import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.Threading namespace.
 *
 * These are .NET BCL types used for thread-safe lazy initialization of
 * sub-client instances in generated client classes. Referencing these symbols
 * in Alloy JSX components automatically generates the correct
 * `using System.Threading;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.threading
 */
export const SystemThreading = createLibrary("System.Threading", {
  /**
   * Provides mechanisms for performing volatile memory operations.
   * Used in sub-client factory methods for thread-safe reads of the
   * cached sub-client field via `Volatile.Read(ref _cachedField)`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.threading.volatile
   */
  Volatile: {
    kind: "class",
    members: {},
  },

  /**
   * Provides atomic operations for variables shared between threads.
   * Used in sub-client factory methods for thread-safe lazy initialization
   * via `Interlocked.CompareExchange(ref _cachedField, new Instance(...), null)`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.threading.interlocked
   */
  Interlocked: {
    kind: "class",
    members: {},
  },
});
