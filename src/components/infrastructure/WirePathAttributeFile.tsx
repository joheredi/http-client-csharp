/**
 * WirePathAttribute file generator for ARM management-plane models.
 *
 * When the `enable-wire-path-attribute` emitter option is true, this component
 * generates an internal `WirePathAttribute` class used to annotate model
 * properties with their HTTP wire-format path. This is needed for ARM SDKs
 * that reflect on model properties at runtime to map them to JSON wire paths.
 *
 * The attribute class is generated per-project in `src/Generated/Internal/`
 * (not from a NuGet package). It matches the legacy emitter's
 * `WirePathAttributeDefinition.cs` output.
 *
 * @example Generated output:
 * ```csharp
 * [AttributeUsage(AttributeTargets.Property)]
 * internal partial class WirePathAttribute : Attribute
 * {
 *     private string _wirePath;
 *
 *     /// <param name="wirePath"> The wire path. </param>
 *     public WirePathAttribute(string wirePath)
 *     {
 *         _wirePath = wirePath;
 *     }
 * }
 * ```
 *
 * @module
 */

import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code, refkey } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * Stable refkey for the generated WirePathAttribute class.
 *
 * Referenced by {@link ModelProperty} and {@link FlattenedProperty} components
 * to emit `[WirePath("...")]` attributes on model properties. Alloy resolves
 * this refkey across files and automatically adds `using` directives when the
 * attribute is used in a different namespace (e.g., `.Models` sub-namespace).
 */
export const wirePathAttributeRefkey = refkey("WirePathAttribute");

/**
 * Props for the {@link WirePathAttributeFile} component.
 */
export interface WirePathAttributeFileProps {
  /** Root namespace for the generated library (e.g., "Azure.ResourceManager.Compute"). */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates `src/Generated/Internal/WirePathAttribute.cs`.
 *
 * This internal attribute class is applied to model properties to record their
 * wire-format JSON path. Non-flattened properties get their serialized name
 * (e.g., `[WirePath("properties")]`), while flattened properties get a
 * dot-notation path through the hierarchy (e.g., `[WirePath("properties.sku")]`).
 *
 * Only generated when the `enable-wire-path-attribute` emitter option is true.
 */
export function WirePathAttributeFile(props: WirePathAttributeFileProps) {
  const header = getLicenseHeader(props.options);

  return (
    <SourceFile path="src/Generated/Internal/WirePathAttribute.cs">
      {header}
      {"\n\nusing System;\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration
          internal
          partial
          name="WirePathAttribute"
          refkey={wirePathAttributeRefkey}
          baseType="Attribute"
          attributes={[code`[AttributeUsage(AttributeTargets.Property)]`]}
        >
          {code`
            private string _wirePath;
          `}
          {"\n\n"}
          {code`
            /// <param name="wirePath"> The wire path. </param>
            public WirePathAttribute(string wirePath)
            {
                _wirePath = wirePath;
            }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
