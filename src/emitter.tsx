import { createSdkContext } from "@azure-tools/typespec-client-generator-core";
import { existsSync } from "fs";
import { type EmitContext, resolvePath } from "@typespec/compiler";
import { writeOutput } from "@typespec/emitter-framework";
import { CSharpScalarOverrides } from "./components/CSharpTypeExpression.js";
import { ExtensibleEnumFile } from "./components/enums/ExtensibleEnumFile.js";
import { ExtensibleEnumSerializationFile } from "./components/enums/ExtensibleEnumSerializationFile.js";
import { FixedEnumFile } from "./components/enums/FixedEnumFile.js";
import { FixedEnumSerializationFile } from "./components/enums/FixedEnumSerializationFile.js";
import { HttpClientCSharpOutput } from "./components/HttpClientCSharpOutput.js";
import { ProjectFile } from "./components/infrastructure/ProjectFile.js";
import { SolutionFile } from "./components/infrastructure/SolutionFile.js";
import { ModelFactoryFile } from "./components/model-factory/ModelFactoryFile.js";
import {
  hasDiscriminatedSubtypes,
  isModelAbstract,
} from "./components/models/ModelConstructors.js";
import { ModelFile } from "./components/models/ModelFile.js";
import { UnknownDiscriminatorModelFile } from "./components/models/UnknownDiscriminatorModel.js";
import { ImplicitBinaryContentOperator } from "./components/serialization/CastOperators.js";
import { ModelSerializationFile } from "./components/serialization/ModelSerializationFile.js";
import { DeserializationConstructor } from "./components/serialization/DeserializationConstructor.js";
import { DeserializeReturnStatement } from "./components/serialization/DeserializeReturnStatement.js";
import { DeserializeVariableDeclarations } from "./components/serialization/DeserializeVariableDeclarations.js";
import { JsonDeserialize } from "./components/serialization/JsonDeserialize.js";
import { JsonModelCreateCore } from "./components/serialization/JsonModelCreateCore.js";
import { JsonModelInterfaceCreate } from "./components/serialization/JsonModelInterfaceCreate.js";
import { JsonModelInterfaceWrite } from "./components/serialization/JsonModelInterfaceWrite.js";
import { JsonModelWriteCore } from "./components/serialization/JsonModelWriteCore.js";
import { PersistableModelCreateCore } from "./components/serialization/PersistableModelCreateCore.js";
import { PersistableModelInterfaceMethods } from "./components/serialization/PersistableModelInterfaceMethods.js";
import { PersistableModelWriteCore } from "./components/serialization/PersistableModelWriteCore.js";
import { PropertyMatchingLoop } from "./components/serialization/PropertyMatchingLoop.js";
import { $lib } from "./lib.js";
import { type CSharpEmitterOptions, resolveOptions } from "./options.js";
import { resolvePackageName } from "./utils/package-name.js";

/**
 * TypeSpec emitter entry point for the C# HTTP client generator.
 *
 * This function is called by the TypeSpec compiler when the user runs
 * `tsp compile` with the `http-client-csharp` emitter configured.
 *
 * Unlike the legacy two-phase pipeline which serialized to JSON and invoked
 * a separate C# generator process, this emitter directly renders C# source
 * files using Alloy's JSX-based code generation model.
 *
 * @param context - The TypeSpec emit context containing the compiled program,
 *   emitter options, and output directory.
 */
export async function $onEmit(context: EmitContext<CSharpEmitterOptions>) {
  // Bail out if the compiler was invoked with --no-emit
  if (context.program.compilerOptions.noEmit) {
    return;
  }

  // Resolve emitter options, applying defaults for unspecified values
  const options = resolveOptions(context);

  // Create the TCGC SDK context which processes the TypeSpec program into
  // a client-oriented model (SdkPackage) with clients, models, and enums
  const sdkContext = await createSdkContext(context, $lib.name);

  // Surface any TCGC diagnostics to the TypeSpec program so they appear
  // in compiler output alongside TypeSpec's own diagnostics
  for (const diagnostic of sdkContext.diagnostics) {
    context.program.reportDiagnostic(diagnostic);
  }

  // Render the JSX component tree and write generated C# files to disk
  const fixedEnums = sdkContext.sdkPackage.enums.filter((e) => e.isFixed);
  const extensibleEnums = sdkContext.sdkPackage.enums.filter((e) => !e.isFixed);
  const models = sdkContext.sdkPackage.models;

  // Resolve the package name for the generated library
  const packageName = resolvePackageName(sdkContext, options["package-name"]);

  // Determine whether to generate project scaffolding (.csproj, .sln).
  // Skip if the .csproj already exists and user hasn't set new-project: true.
  const csprojPath = resolvePath(
    context.emitterOutputDir,
    "src",
    `${packageName}.csproj`,
  );
  const shouldGenerateProject =
    options["new-project"] || !existsSync(csprojPath);

  const output = (
    <HttpClientCSharpOutput
      program={context.program}
      options={options}
      sdkContext={sdkContext}
    >
      {shouldGenerateProject && (
        <ProjectFile packageName={packageName} options={options} />
      )}
      {shouldGenerateProject && <SolutionFile packageName={packageName} />}
      <CSharpScalarOverrides>
        {fixedEnums.map((e) => (
          <FixedEnumFile type={e} options={options} />
        ))}
        {fixedEnums.map((e) => (
          <FixedEnumSerializationFile type={e} options={options} />
        ))}
        {extensibleEnums.map((e) => (
          <ExtensibleEnumFile type={e} options={options} />
        ))}
        {extensibleEnums
          .filter((e) => e.valueType.kind !== "string")
          .map((e) => (
            <ExtensibleEnumSerializationFile type={e} options={options} />
          ))}
        {models.map((m) => (
          <ModelFile type={m} options={options} />
        ))}
        {models
          .filter((m) => hasDiscriminatedSubtypes(m))
          .map((m) => (
            <UnknownDiscriminatorModelFile type={m} options={options} />
          ))}
        {models.map((m) => (
          <ModelSerializationFile type={m} options={options}>
            <JsonModelInterfaceWrite type={m} />
            {"\n\n"}
            <JsonModelWriteCore type={m} />
            {"\n\n"}
            <PersistableModelWriteCore type={m} />
            {"\n\n"}
            <PersistableModelCreateCore type={m} />
            {"\n\n"}
            <PersistableModelInterfaceMethods type={m} />
            {"\n\n"}
            <JsonModelInterfaceCreate type={m} />
            {"\n\n"}
            <JsonModelCreateCore type={m} />
            {"\n\n"}
            <DeserializationConstructor type={m} />
            {"\n\n"}
            <JsonDeserialize type={m}>
              <DeserializeVariableDeclarations type={m} />
              <PropertyMatchingLoop type={m} />
              <DeserializeReturnStatement type={m} />
            </JsonDeserialize>
            {"\n\n"}
            <ImplicitBinaryContentOperator type={m} />
          </ModelSerializationFile>
        ))}
        <ModelFactoryFile
          models={models}
          packageName={packageName}
          options={options}
        />
      </CSharpScalarOverrides>
    </HttpClientCSharpOutput>
  );

  await writeOutput(context.program, output, context.emitterOutputDir);
}
