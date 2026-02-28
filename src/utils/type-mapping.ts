/**
 * Type Mapping Audit: TypeExpression (emitter-framework/csharp) vs Legacy Emitter
 *
 * This module documents the gaps between the emitter-framework's
 * {@link https://github.com/microsoft/typespec/blob/main/packages/emitter-framework/src/csharp/components/type-expression.tsx | TypeExpression}
 * component and the legacy HTTP client C# emitter's type mappings, and provides
 * utilities to bridge those gaps.
 *
 * ## Background
 *
 * The emitter-framework's `TypeExpression` component maps TypeSpec scalar types
 * to C# types using an internal `intrinsicNameToCSharpType` map. However, several
 * mappings differ from what the legacy emitter produces. This module identifies
 * those gaps and provides the correct mappings for the HTTP client emitter.
 *
 * ## Scalar Type Gaps
 *
 * | TypeSpec Scalar | TypeExpression Maps To | Legacy Emitter Maps To | Gap? |
 * |-----------------|------------------------|------------------------|------|
 * | `string`        | `string`               | `string`               | No   |
 * | `boolean`       | `bool`                 | `bool`                 | No   |
 * | `int8`          | `sbyte`                | `sbyte`                | No   |
 * | `uint8`         | `byte`                 | `byte`                 | No   |
 * | `int16`         | `short`                | `short`                | No   |
 * | `uint16`        | `ushort`               | `ushort`               | No   |
 * | `int32`         | `int`                  | `int`                  | No   |
 * | `uint32`        | `uint`                 | `uint`                 | No   |
 * | `int64`         | `long`                 | `long`                 | No   |
 * | `uint64`        | `ulong`                | `ulong`                | No   |
 * | `float32`       | `float`                | `float`                | No   |
 * | `float64`       | `double`               | `double`               | No   |
 * | `decimal`       | `decimal`              | `decimal`              | No   |
 * | `decimal128`    | `decimal`              | `decimal`              | No   |
 * | `utcDateTime`   | `DateTimeOffset`       | `DateTimeOffset`       | No   |
 * | `offsetDateTime`| `DateTimeOffset`       | `DateTimeOffset`       | No   |
 * | `duration`      | `TimeSpan`             | `TimeSpan`             | No   |
 * | `url`           | `Uri`                  | `Uri`                  | No   |
 * | `bytes`         | `byte[]`               | `BinaryData`           | YES  |
 * | `unknown`       | `object`               | `BinaryData`           | YES  |
 * | `integer`       | `int`                  | `long`                 | YES  |
 * | `numeric`       | `decimal`              | `double`               | YES  |
 * | `float`         | `float`                | `double`               | YES  |
 * | `plainDate`     | `DateOnly`             | `DateTimeOffset`       | YES  |
 * | `plainTime`     | `TimeOnly`             | `TimeSpan`             | YES  |
 * | `safeint`       | `int`                  | `long`                 | YES  |
 *
 * ## Non-Scalar Gaps
 *
 * 1. **Arrays**: TypeExpression maps to `T[]`. The legacy emitter uses `IList<T>` for
 *    input model properties and `IReadOnlyList<T>` for output model properties.
 *    Task 1.1.3 will address collection type direction.
 *
 * 2. **Records/Dicts**: TypeExpression maps to `IDictionary<string, T>`. The legacy
 *    emitter uses `IDictionary<string, T>` for input and `IReadOnlyDictionary<string, T>`
 *    for output. Task 1.1.3 will address this.
 *
 * 3. **Non-nullable unions**: TypeExpression handles nullable unions as `T?` but throws
 *    for unnamed non-nullable unions. The legacy emitter maps these to `BinaryData`.
 *    Task 1.1.2 will address this in the CSharpTypeExpression wrapper.
 *
 * 4. **BinaryData**: Not declared in alloy-js/csharp builtins. Needed for `bytes` and
 *    `unknown` override mappings. Must be created as a custom library declaration.
 *
 * 5. **Stream**: Not handled by TypeExpression. The legacy emitter maps `Stream` to
 *    `System.IO.Stream`. Available in alloy-js/csharp builtins via `@alloy-js/csharp/global/System`.
 *
 * @module
 */

/**
 * Scalars where the emitter-framework's TypeExpression maps to a different C# type
 * than the legacy HTTP client emitter expects.
 *
 * Each entry maps a TypeSpec scalar name to the correct C# type name for the
 * HTTP client emitter. These overrides will be consumed by task 1.1.2 to create
 * a `CSharpTypeExpression` wrapper component that corrects these mappings via
 * `Experimental_ComponentOverrides`.
 *
 * @remarks
 * The rationale for each override:
 * - `bytes` → `BinaryData`: The legacy emitter uses `BinaryData` (from System namespace)
 *   rather than raw `byte[]` for binary content.
 * - `unknown` → `BinaryData`: Unknown types are represented as `BinaryData` for
 *   flexible serialization support.
 * - `integer` → `long`: The base `integer` type (no size specified) maps to `long`
 *   (64-bit) for safety, not `int` (32-bit).
 * - `numeric` → `double`: The base `numeric` type maps to `double` for broad
 *   compatibility, not `decimal`.
 * - `float` → `double`: The base `float` type (no size specified) maps to `double`
 *   (64-bit) for safety, matching the legacy emitter.
 * - `plainDate` → `DateTimeOffset`: The legacy emitter does not use `DateOnly` (.NET 6+)
 *   for plain dates; it uses `DateTimeOffset` for backward compatibility.
 * - `plainTime` → `TimeSpan`: The legacy emitter does not use `TimeOnly` (.NET 6+)
 *   for plain times; it uses `TimeSpan` for backward compatibility.
 * - `safeint` → `long`: Safe integers (values that can be exactly represented in
 *   IEEE 754 double) map to `long` in the legacy emitter.
 */
export const SCALAR_TYPE_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ["bytes", "BinaryData"],
  ["unknown", "BinaryData"],
  ["integer", "long"],
  ["numeric", "double"],
  ["float", "double"],
  ["plainDate", "DateTimeOffset"],
  ["plainTime", "TimeSpan"],
  ["safeint", "long"],
]);

/**
 * The emitter-framework's default scalar type mappings (from `intrinsicNameToCSharpType`).
 *
 * This map documents what TypeExpression currently produces for each TypeSpec scalar.
 * It is used for auditing and testing purposes — to verify that the emitter-framework's
 * defaults haven't changed unexpectedly.
 */
export const EMITTER_FRAMEWORK_SCALAR_MAP: ReadonlyMap<string, string> =
  new Map([
    ["unknown", "object"],
    ["string", "string"],
    ["boolean", "bool"],
    ["null", "null"],
    ["void", "void"],
    ["bytes", "byte[]"],
    ["numeric", "decimal"],
    ["integer", "int"],
    ["float", "float"],
    ["decimal", "decimal"],
    ["decimal128", "decimal"],
    ["int64", "long"],
    ["int32", "int"],
    ["int16", "short"],
    ["int8", "sbyte"],
    ["safeint", "int"],
    ["uint64", "ulong"],
    ["uint32", "uint"],
    ["uint16", "ushort"],
    ["uint8", "byte"],
    ["float32", "float"],
    ["float64", "double"],
    ["plainDate", "DateOnly"],
    ["plainTime", "TimeOnly"],
    ["utcDateTime", "DateTimeOffset"],
    ["offsetDateTime", "DateTimeOffset"],
    ["duration", "TimeSpan"],
    ["url", "Uri"],
  ]);

/**
 * Complete mapping of TypeSpec scalar names to the correct C# type for the
 * HTTP client emitter.
 *
 * This is the union of the emitter-framework's correct mappings and our overrides.
 * For scalars without an override, the emitter-framework default is used.
 * For scalars with an override, the legacy emitter's mapping is used.
 *
 * Excludes `null`, `void`, and `never` as they are not regular value types.
 */
export const SCALAR_TO_CSHARP: ReadonlyMap<string, string> = new Map([
  // Correct in emitter-framework (no override needed)
  ["string", "string"],
  ["boolean", "bool"],
  ["int8", "sbyte"],
  ["uint8", "byte"],
  ["int16", "short"],
  ["uint16", "ushort"],
  ["int32", "int"],
  ["uint32", "uint"],
  ["int64", "long"],
  ["uint64", "ulong"],
  ["float32", "float"],
  ["float64", "double"],
  ["decimal", "decimal"],
  ["decimal128", "decimal"],
  ["utcDateTime", "DateTimeOffset"],
  ["offsetDateTime", "DateTimeOffset"],
  ["duration", "TimeSpan"],
  ["url", "Uri"],

  // Overridden from emitter-framework defaults to match legacy emitter
  ["bytes", "BinaryData"],
  ["unknown", "BinaryData"],
  ["integer", "long"],
  ["numeric", "double"],
  ["float", "double"],
  ["plainDate", "DateTimeOffset"],
  ["plainTime", "TimeSpan"],
  ["safeint", "long"],
]);

/**
 * Returns the C# type name that the legacy emitter expects for a given TypeSpec
 * scalar, but only if it differs from what TypeExpression produces by default.
 *
 * Returns `undefined` when the emitter-framework's default mapping is already correct.
 *
 * @param scalarName - The TypeSpec scalar's standard base name (e.g., "bytes", "int32")
 * @returns The correct C# type name override, or `undefined` if no override is needed
 *
 * @example
 * ```ts
 * getScalarOverride("bytes");     // "BinaryData"
 * getScalarOverride("int32");     // undefined (emitter-framework is correct)
 * getScalarOverride("plainDate"); // "DateTimeOffset"
 * ```
 */
export function getScalarOverride(scalarName: string): string | undefined {
  return SCALAR_TYPE_OVERRIDES.get(scalarName);
}

/**
 * Returns the correct C# type name for a TypeSpec scalar in the HTTP client emitter.
 *
 * This function returns the final, correct mapping that should appear in generated
 * C# code, combining emitter-framework defaults (where correct) with our overrides.
 *
 * Returns `undefined` for scalars not in the known mapping table (e.g., custom scalars).
 *
 * @param scalarName - The TypeSpec scalar's standard base name (e.g., "string", "int32")
 * @returns The C# type name, or `undefined` for unknown scalars
 *
 * @example
 * ```ts
 * getCSharpType("string");    // "string"
 * getCSharpType("bytes");     // "BinaryData"
 * getCSharpType("plainDate"); // "DateTimeOffset"
 * getCSharpType("custom");    // undefined
 * ```
 */
export function getCSharpType(scalarName: string): string | undefined {
  return SCALAR_TO_CSHARP.get(scalarName);
}

/**
 * Returns `true` if the given TypeSpec scalar name requires an override from
 * the emitter-framework's default TypeExpression mapping.
 *
 * Use this to determine whether a scalar needs special handling in the
 * CSharpTypeExpression wrapper component (task 1.1.2).
 *
 * @param scalarName - The TypeSpec scalar's standard base name
 * @returns `true` if the scalar needs an override, `false` otherwise
 *
 * @example
 * ```ts
 * isOverriddenScalar("bytes");   // true
 * isOverriddenScalar("int32");   // false
 * isOverriddenScalar("unknown"); // true
 * ```
 */
export function isOverriddenScalar(scalarName: string): boolean {
  return SCALAR_TYPE_OVERRIDES.has(scalarName);
}
