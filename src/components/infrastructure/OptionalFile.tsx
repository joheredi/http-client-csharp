import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * Props for the {@link OptionalFile} component.
 */
export interface OptionalFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the `Optional.cs` internal helper class.
 *
 * This static utility class provides methods to check whether optional
 * properties and collections have been explicitly set. It is used in
 * JSON serialization code to distinguish between "undefined" (not set)
 * and "null" (explicitly set to null) values.
 *
 * Collections use `ChangeTrackingList<T>` / `ChangeTrackingDictionary<TKey, TValue>`
 * for "undefined" semantics — `IsCollectionDefined` checks whether the
 * collection is still in its uninitialized tracking state.
 *
 * The generated class matches the legacy emitter's `OptionalDefinition`
 * output: `src/Generated/Internal/Optional.cs`.
 */
export function OptionalFile(props: OptionalFileProps) {
  const header = getLicenseHeader(props.options);

  return (
    <SourceFile
      path="src/Generated/Internal/Optional.cs"
      using={["System.Collections.Generic", "System.Text.Json"]}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration internal static partial name="Optional">
          {code`
            public static bool IsCollectionDefined<T>(IEnumerable<T> collection)
            {
                return !(collection is ChangeTrackingList<T> changeTrackingList && changeTrackingList.IsUndefined);
            }
          `}
          {"\n\n"}
          {code`
            public static bool IsCollectionDefined<TKey, TValue>(IDictionary<TKey, TValue> collection)
            {
                return !(collection is ChangeTrackingDictionary<TKey, TValue> changeTrackingDictionary && changeTrackingDictionary.IsUndefined);
            }
          `}
          {"\n\n"}
          {code`
            public static bool IsCollectionDefined<TKey, TValue>(IReadOnlyDictionary<TKey, TValue> collection)
            {
                return !(collection is ChangeTrackingDictionary<TKey, TValue> changeTrackingDictionary && changeTrackingDictionary.IsUndefined);
            }
          `}
          {"\n\n"}
          {code`
            public static bool IsDefined<T>(T? value)
                where T : struct
            {
                return value.HasValue;
            }
          `}
          {"\n\n"}
          {code`
            public static bool IsDefined(object value)
            {
                return value != null;
            }
          `}
          {"\n\n"}
          {code`
            public static bool IsDefined(string value)
            {
                return value != null;
            }
          `}
          {"\n\n"}
          {code`
            public static bool IsDefined(JsonElement value)
            {
                return value.ValueKind != JsonValueKind.Undefined;
            }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
