/**
 * Discriminator deserialization dispatch component for C# code output.
 *
 * For models with discriminated subtypes (abstract base models and intermediate
 * models in a polymorphic hierarchy), the `DeserializeXxx` method body does NOT
 * iterate over properties. Instead, it peeks at the discriminator property,
 * dispatches to the correct derived type's deserializer via a switch statement,
 * and falls back to the Unknown variant for unrecognized discriminator values.
 *
 * This replaces the standard deserialization body (variable declarations +
 * property matching loop + constructor return) for models where
 * `hasDiscriminatedSubtypes()` returns true.
 *
 * @example Generated output for an abstract base model:
 * ```csharp
 * if (element.TryGetProperty("kind"u8, out JsonElement discriminator))
 * {
 *     switch (discriminator.GetString())
 *     {
 *         case "dog":
 *             return Dog.DeserializeDog(element, options);
 *     }
 * }
 * return UnknownPet.DeserializeUnknownPet(element, options);
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";

/**
 * Props for the {@link DiscriminatorDeserialization} component.
 */
export interface DiscriminatorDeserializationProps {
  /** The TCGC SDK model type that has discriminated subtypes. */
  type: SdkModelType;
}

/**
 * Generates the discriminator dispatch block for a model's deserialization method.
 *
 * For models with discriminated subtypes, this component generates:
 * 1. **Discriminator peek**: `if (element.TryGetProperty("kind"u8, out JsonElement discriminator))`
 *    — attempts to read the discriminator property from the JSON element.
 * 2. **Switch dispatch**: `switch (discriminator.GetString()) { case "x": return X.DeserializeX(...); }`
 *    — dispatches to the correct derived type's static deserialization method.
 * 3. **Unknown fallback**: `return UnknownBase.DeserializeUnknownBase(element, options);`
 *    — handles unrecognized discriminator values by delegating to the Unknown variant.
 *
 * The `discriminatedSubtypes` map from TCGC provides a flat mapping of all
 * discriminator values to their corresponding model types, including types at
 * any depth in the hierarchy.
 *
 * @param props - Component props containing the model type with discriminated subtypes.
 * @returns JSX fragment rendering the discriminator dispatch block.
 */
export function DiscriminatorDeserialization(
  props: DiscriminatorDeserializationProps,
) {
  const namePolicy = useCSharpNamePolicy();
  const discriminatorSerializedName =
    props.type.discriminatorProperty!.serializedName;
  const subtypes = props.type.discriminatedSubtypes!;
  const baseName = namePolicy.getName(props.type.name, "class");
  const unknownName = `Unknown${baseName}`;

  return (
    <>
      {`\n    if (element.TryGetProperty("${discriminatorSerializedName}"u8, out JsonElement discriminator))`}
      {"\n    {"}
      {"\n        switch (discriminator.GetString())"}
      {"\n        {"}
      {Object.entries(subtypes).map(([discriminatorValue, subtype]) => {
        const subtypeName = namePolicy.getName(subtype.name, "class");
        return (
          <>
            {`\n            case "${discriminatorValue}":`}
            {`\n                return ${subtypeName}.Deserialize${subtypeName}(element, options);`}
          </>
        );
      })}
      {"\n        }"}
      {"\n    }"}
      {`\n    return ${unknownName}.Deserialize${unknownName}(element, options);`}
    </>
  );
}
