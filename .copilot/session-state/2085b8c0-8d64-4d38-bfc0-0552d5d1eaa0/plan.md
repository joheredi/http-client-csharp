# Task 1.1.1: Verify TypeExpression Coverage

## Goal

Audit the emitter-framework's `TypeExpression` component and document all gaps between it and the legacy emitter's type mappings. Create utility functions in `src/utils/type-mapping.ts`.

## Gaps Identified

### Scalar Type Gaps

| TypeSpec Scalar | TypeExpression (EF) | Legacy Emitter | Action Needed |
| --------------- | ------------------- | -------------- | ------------- |
| bytes           | byte[]              | BinaryData     | Override      |
| unknown         | object              | BinaryData     | Override      |
| integer         | int                 | long           | Override      |
| numeric         | decimal             | double         | Override      |
| float           | float               | double         | Override      |
| plainDate       | DateOnly            | DateTimeOffset | Override      |
| plainTime       | TimeOnly            | TimeSpan       | Override      |
| safeint         | int                 | long           | Override      |

### Non-Scalar Gaps

1. **Non-nullable unions**: EF throws for unnamed non-nullable unions. Legacy maps to `BinaryData`.
2. **BinaryData builtin**: Not declared in alloy-js/csharp. Needed for bytes/unknown overrides.
3. **Collections**: EF maps arrays to `T[]`. Legacy uses `IList<T>` or `IReadOnlyList<T>` depending on direction.

## Approach

- **Chosen**: Create pure audit + mapping constants in `src/utils/type-mapping.ts`
  - Document all gaps comprehensively
  - Provide constant maps and lookup utilities
  - Task 1.1.2 will use these to create the `CSharpTypeExpression` wrapper with `Experimental_ComponentOverrides`
- **Rejected**: Creating override config here
  - Reason: Overlaps with 1.1.2's scope. Clean separation of concerns.

## Files

- Create: `src/utils/type-mapping.ts`
- Create: `test/type-mapping.test.ts`
