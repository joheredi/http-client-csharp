/**
 * Deserialization constructor component for C# model serialization files.
 *
 * Generates a parameterless `internal` constructor in the `.Serialization.cs`
 * partial class. This constructor is required by the Model Reader/Writer (MRW)
 * framework to instantiate empty model instances during deserialization.
 *
 * The constructor is only generated when the model's public initialization
 * constructor has parameters — meaning no parameterless constructor already
 * exists. If the public ctor already has zero parameters, the deserialization
 * constructor is omitted to avoid a C# duplicate constructor error.
 *
 * @example Generated output:
 * ```csharp
 * /// <summary> Initializes a new instance of <see cref="Widget"/> for deserialization. </summary>
 * internal Widget()
 * {
 * }
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import {
  computePublicCtorParams,
  OverloadConstructor,
} from "../models/ModelConstructors.js";

/**
 * Props for the {@link DeserializationConstructor} component.
 */
export interface DeserializationConstructorProps {
  /** The TCGC SDK model type representing a TypeSpec model. */
  type: SdkModelType;
}

/**
 * Determines whether a model needs a parameterless deserialization constructor
 * in its serialization partial class.
 *
 * A model needs this constructor when its public initialization constructor has
 * one or more parameters, meaning no parameterless constructor exists for the
 * MRW framework to use during deserialization. If the public ctor has zero
 * parameters, it already serves as the framework's instantiation entry point.
 *
 * @param model - The TCGC SDK model type.
 * @returns `true` if the model needs a parameterless deserialization constructor.
 */
export function needsDeserializationConstructor(model: SdkModelType): boolean {
  return computePublicCtorParams(model).length > 0;
}

/**
 * Generates a parameterless `internal` constructor for deserialization.
 *
 * This constructor is placed in the `.Serialization.cs` partial class file,
 * separate from the model's public initialization and serialization constructors
 * (which live in the main `.cs` file). It enables the MRW deserialization
 * framework to create empty model instances before populating properties.
 *
 * Matches the legacy emitter's `MrwSerializationTypeDefinition.BuildEmptyConstructor()`
 * which generates `internal ModelName() { }` with an XML doc comment stating
 * the constructor is for deserialization.
 *
 * Returns `null` (renders nothing) when the model already has a parameterless
 * public constructor, avoiding a C# duplicate constructor compilation error.
 *
 * @param props - The component props containing the model type.
 * @returns The constructor JSX element, or `null` if not needed.
 */
export function DeserializationConstructor(
  props: DeserializationConstructorProps,
) {
  const namePolicy = useCSharpNamePolicy();

  if (!needsDeserializationConstructor(props.type)) {
    return null;
  }

  const modelName = namePolicy.getName(props.type.name, "class");

  return (
    <>
      {`/// <summary> Initializes a new instance of <see cref="${modelName}"/> for deserialization. </summary>`}
      {"\n"}
      <OverloadConstructor internal />
    </>
  );
}
