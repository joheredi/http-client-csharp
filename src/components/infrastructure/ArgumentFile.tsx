import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { argumentRefkey } from "../../utils/refkey.js";

/**
 * Props for the {@link ArgumentFile} component.
 */
export interface ArgumentFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the `Argument.cs` internal helper class.
 *
 * This static utility class provides argument validation methods used by
 * model constructors and client methods to assert non-null, non-empty,
 * and in-range constraints on parameters at runtime.
 *
 * The generated class matches the legacy emitter's `ArgumentDefinition`
 * output: `src/Generated/Internal/Argument.cs`.
 *
 * @example Generated output:
 * ```csharp
 * internal static partial class Argument
 * {
 *     public static void AssertNotNull<T>(T value, string name) { ... }
 *     public static void AssertNotNull<T>(T? value, string name) where T : struct { ... }
 *     public static void AssertNotNullOrEmpty<T>(IEnumerable<T> value, string name) { ... }
 *     // ... more validation methods
 * }
 * ```
 */
export function ArgumentFile(props: ArgumentFileProps) {
  const header = getLicenseHeader(props.options);

  return (
    <SourceFile
      path="src/Generated/Internal/Argument.cs"
      using={["System", "System.Collections", "System.Collections.Generic"]}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration
          internal
          static
          partial
          name="Argument"
          refkey={argumentRefkey()}
        >
          {code`
            /// <param name="value"> The value. </param>
            /// <param name="name"> The name. </param>
            public static void AssertNotNull<T>(T value, string name)
            {
                if (value is null)
                {
                    throw new ArgumentNullException(name);
                }
            }
          `}
          {"\n\n"}
          {code`
            /// <param name="value"> The value. </param>
            /// <param name="name"> The name. </param>
            public static void AssertNotNull<T>(T? value, string name)
                where T : struct
            {
                if (!value.HasValue)
                {
                    throw new ArgumentNullException(name);
                }
            }
          `}
          {"\n\n"}
          {code`
            /// <param name="value"> The value. </param>
            /// <param name="name"> The name. </param>
            public static void AssertNotNullOrEmpty<T>(IEnumerable<T> value, string name)
            {
                if (value is null)
                {
                    throw new ArgumentNullException(name);
                }
                if (value is ICollection<T> collectionOfT && collectionOfT.Count == 0)
                {
                    throw new ArgumentException("Value cannot be an empty collection.", name);
                }
                if (value is ICollection collection && collection.Count == 0)
                {
                    throw new ArgumentException("Value cannot be an empty collection.", name);
                }
                using IEnumerator<T> e = value.GetEnumerator();
                if (!e.MoveNext())
                {
                    throw new ArgumentException("Value cannot be an empty collection.", name);
                }
            }
          `}
          {"\n\n"}
          {code`
            /// <param name="value"> The value. </param>
            /// <param name="name"> The name. </param>
            public static void AssertNotNullOrEmpty(string value, string name)
            {
                if (value is null)
                {
                    throw new ArgumentNullException(name);
                }
                if (value.Length == 0)
                {
                    throw new ArgumentException("Value cannot be an empty string.", name);
                }
            }
          `}
          {"\n\n"}
          {code`
            /// <param name="value"> The value. </param>
            /// <param name="name"> The name. </param>
            public static void AssertNotNullOrWhiteSpace(string value, string name)
            {
                if (value is null)
                {
                    throw new ArgumentNullException(name);
                }
                if (string.IsNullOrWhiteSpace(value))
                {
                    throw new ArgumentException("Value cannot be empty or contain only white-space characters.", name);
                }
            }
          `}
          {"\n\n"}
          {code`
            /// <param name="value"> The value. </param>
            /// <param name="minimum"> The minimum value. </param>
            /// <param name="maximum"> The maximum value. </param>
            /// <param name="name"> The name. </param>
            public static void AssertInRange<T>(T value, T minimum, T maximum, string name)
                where T : notnull, IComparable<T>
            {
                if (minimum.CompareTo(value) > 0)
                {
                    throw new ArgumentOutOfRangeException(name, "Value is less than the minimum allowed.");
                }
                if (maximum.CompareTo(value) < 0)
                {
                    throw new ArgumentOutOfRangeException(name, "Value is greater than the maximum allowed.");
                }
            }
          `}
          {"\n\n"}
          {code`
            /// <param name="value"> The value. </param>
            /// <param name="name"> The name. </param>
            public static string CheckNotNullOrEmpty(string value, string name)
            {
                AssertNotNullOrEmpty(value, name);
                return value;
            }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
