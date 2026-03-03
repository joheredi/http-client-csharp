/**
 * React-style context for providing custom code information to components.
 *
 * The custom code model is scanned once at the start of `$onEmit` and provided
 * via this context so that any component in the tree can check whether a
 * generated type or member has been customized by user-written partial classes.
 *
 * @module
 */

import {
  type ComponentContext,
  createContext,
  useContext,
} from "@alloy-js/core";

import type { CustomCodeModel } from "../utils/custom-code-model.js";

/**
 * Alloy ComponentContext for custom code awareness.
 *
 * Provided by the root emitter component and consumed by model/serialization
 * components that need to filter or rename generated members based on
 * user-written customizations.
 */
export const CustomCodeContext: ComponentContext<CustomCodeModel> =
  createContext<CustomCodeModel>();

/**
 * Retrieves the custom code model from the component tree.
 *
 * Must be called inside a component rendered within the emitter tree that
 * provides a {@link CustomCodeContext}. Returns `undefined` if no context
 * is set (i.e., no custom code scanning was performed).
 *
 * @returns The current {@link CustomCodeModel}, or `undefined` if not provided.
 *
 * @example
 * ```tsx
 * function MyModelComponent(props: { typeName: string }) {
 *   const customCode = useCustomCode();
 *   const customType = customCode?.types.get(props.typeName);
 *   if (customType) {
 *     // Filter properties that have been customized
 *   }
 * }
 * ```
 */
export function useCustomCode(): CustomCodeModel | undefined {
  return useContext(CustomCodeContext);
}

/**
 * Checks whether a generated property should be suppressed because the user
 * has provided a custom implementation via `[CodeGenMember]` or
 * `[CodeGenSuppress]` attributes.
 *
 * @param customCode - The custom code model (may be undefined).
 * @param generatedTypeName - The name of the generated type.
 * @param generatedMemberName - The name of the generated member.
 * @returns `true` if the member should be skipped during generation.
 */
export function isMemberSuppressed(
  customCode: CustomCodeModel | undefined,
  generatedTypeName: string,
  generatedMemberName: string,
): boolean {
  if (!customCode) return false;

  const typeInfo = customCode.types.get(generatedTypeName);
  if (!typeInfo) return false;

  // Check CodeGenMember: if a custom member maps to this generated name,
  // the user is replacing it.
  for (const member of typeInfo.members) {
    if (member.originalName === generatedMemberName) {
      return true;
    }
  }

  // Check CodeGenSuppress: explicit suppression by member name.
  for (const suppressed of typeInfo.suppressedMembers) {
    if (suppressed.memberName === generatedMemberName) {
      return true;
    }
  }

  return false;
}
