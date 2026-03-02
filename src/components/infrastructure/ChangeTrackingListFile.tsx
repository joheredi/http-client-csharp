import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * Props for the {@link ChangeTrackingListFile} component.
 */
export interface ChangeTrackingListFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the `ChangeTrackingList.cs` internal helper class.
 *
 * This generic collection wrapper implements `IList<T>` and `IReadOnlyList<T>`
 * with lazy initialization and "undefined" state tracking. It is used in
 * deserialization code to distinguish between a collection that was never set
 * (undefined/absent from JSON) and an explicitly empty collection.
 *
 * Key behavior:
 * - `IsUndefined` returns `true` when the inner list has not been initialized
 * - Operations on an undefined list return safe defaults (0, false, -1)
 * - `EnsureList()` lazily initializes the inner list on first mutation
 * - `Reset()` clears the inner list back to the undefined state
 *
 * The generated class matches the legacy emitter's `ChangeTrackingListDefinition`
 * output: `src/Generated/Internal/ChangeTrackingList.cs`.
 */
export function ChangeTrackingListFile(props: ChangeTrackingListFileProps) {
  const header = getLicenseHeader(props.options);

  return (
    <SourceFile
      path="src/Generated/Internal/ChangeTrackingList.cs"
      using={[
        "System",
        "System.Collections",
        "System.Collections.Generic",
        "System.Linq",
      ]}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration
          internal
          partial
          name="ChangeTrackingList"
          typeParameters={["T"]}
          interfaceTypes={["IList<T>", "IReadOnlyList<T>"]}
        >
          {code`
            private IList<T> _innerList;

            public ChangeTrackingList()
            {
            }

            /// <param name="innerList"> The inner list. </param>
            public ChangeTrackingList(IList<T> innerList)
            {
                if (innerList != null)
                {
                    _innerList = innerList;
                }
            }

            /// <param name="innerList"> The inner list. </param>
            public ChangeTrackingList(IReadOnlyList<T> innerList)
            {
                if (innerList != null)
                {
                    _innerList = innerList.ToList();
                }
            }

            /// <summary> Gets the IsUndefined. </summary>
            public bool IsUndefined => _innerList == null;

            /// <summary> Gets the Count. </summary>
            public int Count => IsUndefined ? 0 : EnsureList().Count;

            /// <summary> Gets the IsReadOnly. </summary>
            public bool IsReadOnly => IsUndefined ? false : EnsureList().IsReadOnly;

            /// <summary> Gets or sets the value associated with the specified key. </summary>
            public T this[int index]
            {
                get
                {
                    if (IsUndefined)
                    {
                        throw new ArgumentOutOfRangeException(nameof(index));
                    }
                    return EnsureList()[index];
                }
                set
                {
                    if (IsUndefined)
                    {
                        throw new ArgumentOutOfRangeException(nameof(index));
                    }
                    EnsureList()[index] = value;
                }
            }

            public void Reset()
            {
                _innerList = null;
            }

            public IEnumerator<T> GetEnumerator()
            {
                if (IsUndefined)
                {
                    IEnumerator<T> enumerateEmpty()
                    {
                        yield break;
                    }
                    return enumerateEmpty();
                }
                return EnsureList().GetEnumerator();
            }

            IEnumerator IEnumerable.GetEnumerator()
            {
                return GetEnumerator();
            }

            /// <param name="item"> The item to add. </param>
            public void Add(T item)
            {
                EnsureList().Add(item);
            }

            public void Clear()
            {
                EnsureList().Clear();
            }

            /// <param name="item"> The item. </param>
            public bool Contains(T item)
            {
                if (IsUndefined)
                {
                    return false;
                }
                return EnsureList().Contains(item);
            }

            /// <param name="array"> The array to copy to. </param>
            /// <param name="arrayIndex"> The array index. </param>
            public void CopyTo(T[] array, int arrayIndex)
            {
                if (IsUndefined)
                {
                    return;
                }
                EnsureList().CopyTo(array, arrayIndex);
            }

            /// <param name="item"> The item. </param>
            public bool Remove(T item)
            {
                if (IsUndefined)
                {
                    return false;
                }
                return EnsureList().Remove(item);
            }

            /// <param name="item"> The item. </param>
            public int IndexOf(T item)
            {
                if (IsUndefined)
                {
                    return -1;
                }
                return EnsureList().IndexOf(item);
            }

            /// <param name="index"> The inner list. </param>
            /// <param name="item"> The item. </param>
            public void Insert(int index, T item)
            {
                EnsureList().Insert(index, item);
            }

            /// <param name="index"> The inner list. </param>
            public void RemoveAt(int index)
            {
                if (IsUndefined)
                {
                    throw new ArgumentOutOfRangeException(nameof(index));
                }
                EnsureList().RemoveAt(index);
            }

            public IList<T> EnsureList()
            {
                return _innerList ??= new List<T>();
            }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
