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

  /**
   * Propagates notification that operations should be canceled.
   * Used as the last parameter of convenience methods in generated client
   * classes, and converted to RequestOptions via the ToRequestOptions()
   * extension method when delegating to protocol methods.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.threading.cancellationtoken
   */
  CancellationToken: {
    kind: "class",
    members: {},
  },
});

/**
 * Alloy library declaration for types in the System.Threading.Tasks namespace.
 *
 * Provides the Task type used as the return type wrapper for async protocol
 * and convenience methods. Referencing these symbols in Alloy JSX components
 * automatically generates the correct `using System.Threading.Tasks;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks
 */
export const SystemThreadingTasks = createLibrary("System.Threading.Tasks", {
  /**
   * Represents an asynchronous operation that returns a value.
   * Used as the return type for async protocol methods (Task{ClientResult})
   * and async convenience methods (Task{T}).
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task-1
   */
  Task: {
    kind: "class",
    members: {},
  },

  /**
   * Represents an asynchronous operation that provides a value with less
   * overhead than Task{T}. Used as the return type for private async helpers
   * like GetNextResponseAsync in Azure paging implementations.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.valuetask-1
   */
  ValueTask: {
    kind: "struct",
    members: {},
  },
});
