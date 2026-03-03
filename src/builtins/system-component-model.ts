import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.ComponentModel namespace.
 *
 * These types provide design-time and runtime metadata for .NET components.
 * Referencing these symbols in Alloy JSX components automatically generates
 * the correct `using System.ComponentModel;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.componentmodel
 */
export const SystemComponentModel = createLibrary("System.ComponentModel", {
  /**
   * Specifies whether a property or event should be displayed in a Properties
   * window. Applied to dynamic model Patch properties with
   * `EditorBrowsableState.Never` to hide them from IntelliSense.
   *
   * @example `[EditorBrowsable(EditorBrowsableState.Never)]`
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.componentmodel.editorbrowsableattribute
   */
  EditorBrowsableAttribute: {
    kind: "class",
    members: {},
  },

  /**
   * Specifies the browsable state of a property or method from within an editor.
   * The `Never` member hides the property from IntelliSense and property grids.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.componentmodel.editorbrowsablestate
   */
  EditorBrowsableState: {
    kind: "enum",
    members: {
      /** The property or method is never browsable from within an editor. */
      Never: { kind: "field" },
    },
  },
});
