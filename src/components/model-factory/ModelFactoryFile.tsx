/**
 * Model factory file component for C# code output.
 *
 * Generates `src/Generated/{PackageName}ModelFactory.cs` containing a
 * `public static partial class {PackageName}ModelFactory` with one static
 * factory method per public model. Factory methods create model instances
 * for testing/mocking by calling the internal serialization constructor
 * with `null` for the `additionalBinaryDataProperties` parameter.
 *
 * When `model-namespace` is enabled (Azure default), the factory class is
 * placed in the `.Models` sub-namespace (e.g., `MyService.Models`), matching
 * the legacy Azure emitter's `NamespaceVisitor` which moves the
 * `ModelFactoryProvider` into the Models namespace.
 *
 * When `model-namespace` is disabled (unbranded default), the factory class
 * is placed in the root namespace (the package name), matching the legacy
 * unbranded emitter's `ModelFactoryProvider.BuildNamespace()`.
 *
 * @example Generated output structure (model-namespace: false):
 * ```csharp
 * namespace SampleTypeSpec
 * {
 *     public static partial class SampleTypeSpecModelFactory
 *     {
 *         public static Widget Widget(string name = default, int count = default)
 *         {
 *             return new Widget(name, count, additionalBinaryDataProperties: null);
 *         }
 *     }
 * }
 * ```
 *
 * @example Generated output structure (model-namespace: true):
 * ```csharp
 * namespace MyService.Models
 * {
 *     public static partial class MyServiceModelFactory
 *     {
 *         public static Widget Widget(string name = default, int count = default)
 *         {
 *             return new Widget(name, count, additionalBinaryDataProperties: null);
 *         }
 *     }
 * }
 * ```
 *
 * @module
 */

import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { For } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { ModelFactoryMethod } from "./ModelFactoryMethod.js";

/**
 * Props for the {@link ModelFactoryFile} component.
 */
export interface ModelFactoryFileProps {
  /** All SDK model types from the TCGC package. Filtered internally to public models only. */
  models: SdkModelType[];
  /** The resolved package name, used for both the class name and root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the model factory C# source file.
 *
 * Filters the provided models to only include public models (internal models
 * are not exposed in the factory). If no public models exist, returns `false`
 * to suppress file generation.
 *
 * The factory class name follows the pattern `{PackageName}ModelFactory`
 * and the file is placed at `src/Generated/{PackageName}ModelFactory.cs`,
 * matching the legacy emitter's output structure.
 *
 * When `model-namespace` is enabled, the factory is placed in the `.Models`
 * sub-namespace alongside the model types it creates.
 *
 * @param props - The component props containing models, package name, and options.
 * @returns JSX element rendering the factory file, or `false` if no public models.
 */
export function ModelFactoryFile(props: ModelFactoryFileProps) {
  const header = getLicenseHeader(props.options);

  // Only public models get factory methods — internal models are not
  // exposed for testing/mocking purposes.
  const publicModels = props.models.filter((m) => m.access === "public");

  if (publicModels.length === 0) return false;

  // Strip dots from the package name to form a valid C# identifier.
  // E.g., "Authentication.ApiKey" → "AuthenticationApiKeyModelFactory"
  const factoryClassName = `${props.packageName.replace(/\./g, "")}ModelFactory`;

  // When model-namespace is enabled, place the factory in the .Models
  // sub-namespace alongside the model types it creates, matching the
  // legacy Azure emitter's NamespaceVisitor behavior.
  const factoryNamespace = props.options["model-namespace"]
    ? `${props.packageName}.Models`
    : props.packageName;

  return (
    <SourceFile
      path={`src/Generated/${factoryClassName}.cs`}
      using={["System.Collections.Generic", "System.Linq"]}
    >
      {header}
      {"\n\n"}
      <Namespace name={factoryNamespace}>
        <ClassDeclaration public static partial name={factoryClassName}>
          <For each={publicModels} doubleHardline>
            {(model) => <ModelFactoryMethod type={model} />}
          </For>
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
