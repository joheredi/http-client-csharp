/**
 * Type definitions for the custom code model.
 *
 * When users write partial classes alongside generated code, they can use
 * CodeGen attributes to rename, suppress, or override generated members.
 * These types represent the parsed result of scanning those custom .cs files.
 *
 * @module
 */

/**
 * Aggregated model of all user-written customizations found in the output
 * directory. Keyed by the **generated type name** (the original name the
 * emitter would produce), so that generation components can quickly look up
 * whether a particular type or member has been customized.
 */
export interface CustomCodeModel {
  /**
   * Map from generated type name → custom type info.
   * For types with `[CodeGenType("OriginalName")]`, the key is `OriginalName`.
   * For types without the attribute, the key is the class name itself.
   */
  types: Map<string, CustomTypeInfo>;
}

/**
 * Represents a single user-written partial class or struct and its
 * customizations (renamed members, suppressed members, serialization overrides).
 */
export interface CustomTypeInfo {
  /** The class/struct name as declared in the custom code file. */
  declaredName: string;

  /**
   * The original generated type name this custom type maps to.
   * Comes from `[CodeGenType("OriginalName")]`. If absent, equals `declaredName`.
   */
  originalName: string;

  /** The namespace declared in the custom code file, if any. */
  namespace?: string;

  /** Properties and fields declared in the custom code, with optional rename info. */
  members: CustomMemberInfo[];

  /**
   * Members explicitly suppressed via `[CodeGenSuppress("memberName", ...)]`.
   * The emitter should skip generating these members entirely.
   */
  suppressedMembers: SuppressedMemberInfo[];

  /**
   * Serialization overrides via `[CodeGenSerialization("propName", ...)]`.
   * These customize how specific properties are serialized/deserialized.
   */
  serializationOverrides: SerializationOverrideInfo[];
}

/**
 * A member (property or field) declared in a custom partial class.
 * When annotated with `[CodeGenMember("OriginalName")]`, it indicates
 * the user is replacing the generated member with their own implementation.
 */
export interface CustomMemberInfo {
  /** The member name as declared in the custom code. */
  declaredName: string;

  /**
   * The original generated member name this custom member replaces.
   * Comes from `[CodeGenMember("OriginalName")]`. If absent, the member
   * simply adds to the type (no suppression needed).
   */
  originalName?: string;
}

/**
 * Represents a `[CodeGenSuppress("member", typeof(Type1), ...)]` attribute
 * on a custom type. The emitter should skip generating the named member.
 */
export interface SuppressedMemberInfo {
  /** The name of the generated member to suppress. */
  memberName: string;

  /** Parameter types for disambiguating overloaded methods, if provided. */
  parameterTypes?: string[];
}

/**
 * Represents a `[CodeGenSerialization("propName", ...)]` attribute that
 * customizes serialization behavior for a specific property.
 */
export interface SerializationOverrideInfo {
  /** The property name this serialization override applies to. */
  propertyName: string;

  /** Custom JSON/XML property name to use during serialization. */
  serializationName?: string;

  /** Name of a custom method to call during serialization. */
  serializationValueHook?: string;

  /** Name of a custom method to call during deserialization. */
  deserializationValueHook?: string;
}

/**
 * Creates an empty custom code model with no customizations.
 * Used when no custom code is found or scanning is disabled.
 */
export function createEmptyCustomCodeModel(): CustomCodeModel {
  return { types: new Map() };
}
