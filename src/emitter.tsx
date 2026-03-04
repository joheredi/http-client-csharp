import {
  createSdkContext,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";
import { existsSync } from "fs";
import { type EmitContext, resolvePath } from "@typespec/compiler";
import { writeOutput } from "@typespec/emitter-framework";
import { ClientOptionsFile } from "./components/client-options/ClientOptionsFile.js";
import { ClientFile } from "./components/clients/ClientFile.js";
import { RestClientFile } from "./components/clients/RestClientFile.js";
import { CollectionResultFiles } from "./components/collection-results/CollectionResultFile.js";
import { CSharpScalarOverrides } from "./components/CSharpTypeExpression.js";
import { ExtensibleEnumFile } from "./components/enums/ExtensibleEnumFile.js";
import { ExtensibleEnumSerializationFile } from "./components/enums/ExtensibleEnumSerializationFile.js";
import { FixedEnumFile } from "./components/enums/FixedEnumFile.js";
import { FixedEnumSerializationFile } from "./components/enums/FixedEnumSerializationFile.js";
import { HttpClientCSharpOutput } from "./components/HttpClientCSharpOutput.js";
import { ArgumentFile } from "./components/infrastructure/ArgumentFile.js";
import { CancellationTokenExtensionsFile } from "./components/infrastructure/CancellationTokenExtensionsFile.js";
import { ChangeTrackingDictionaryFile } from "./components/infrastructure/ChangeTrackingDictionaryFile.js";
import { ChangeTrackingListFile } from "./components/infrastructure/ChangeTrackingListFile.js";
import { ClientPipelineExtensionsFile } from "./components/infrastructure/ClientPipelineExtensionsFile.js";
import { ClientUriBuilderFile } from "./components/infrastructure/ClientUriBuilderFile.js";
import { CodeGenAttributeFiles } from "./components/infrastructure/CodeGenAttributeFiles.js";
import { ErrorResultFile } from "./components/infrastructure/ErrorResultFile.js";
import { ModelReaderWriterContextFile } from "./components/infrastructure/ModelReaderWriterContextFile.js";
import { ModelSerializationExtensionsFile } from "./components/infrastructure/ModelSerializationExtensionsFile.js";
import { OptionalFile } from "./components/infrastructure/OptionalFile.js";
import { ProjectFile } from "./components/infrastructure/ProjectFile.js";
import { SerializationFormatFile } from "./components/infrastructure/SerializationFormatFile.js";
import { SolutionFile } from "./components/infrastructure/SolutionFile.js";
import { TypeFormattersFile } from "./components/infrastructure/TypeFormattersFile.js";
import { Utf8JsonBinaryContentFile } from "./components/infrastructure/Utf8JsonBinaryContentFile.js";
import { BinaryContentHelperFile } from "./components/infrastructure/BinaryContentHelperFile.js";
import { MultiPartFormDataBinaryContentFile } from "./components/infrastructure/MultiPartFormDataBinaryContentFile.js";
import { PipelineRequestHeadersExtensionsFile } from "./components/infrastructure/PipelineRequestHeadersExtensionsFile.js";
import { ModelFactoryFile } from "./components/model-factory/ModelFactoryFile.js";
import { hasDiscriminatedSubtypes } from "./components/models/ModelConstructors.js";
import {
  isDynamicModel,
  DynamicModelPropagators,
} from "./components/models/DynamicModel.js";
import { ModelFile } from "./components/models/ModelFile.js";
import { UnknownDiscriminatorModelFile } from "./components/models/UnknownDiscriminatorModel.js";
import { AdditionalBinaryDataRead } from "./components/serialization/AdditionalBinaryDataRead.js";
import { AdditionalBinaryDataWrite } from "./components/serialization/AdditionalBinaryDataWrite.js";
import { DynamicPatchRead } from "./components/serialization/DynamicPatchRead.js";
import {
  ExplicitClientResultOperator,
  ImplicitBinaryContentOperator,
} from "./components/serialization/CastOperators.js";
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
import { XmlDeserialize } from "./components/serialization/XmlDeserialize.js";
import { XmlModelWriteCore } from "./components/serialization/XmlModelWriteCore.js";
import { XmlWriteXml } from "./components/serialization/XmlWriteXml.js";
import { ToBinaryContent } from "./components/serialization/ToBinaryContent.js";
import { $lib } from "./lib.js";
import { type CSharpEmitterOptions, resolveOptions } from "./options.js";
import { getAllClients } from "./utils/clients.js";
import { scanCustomCode } from "./utils/custom-code-scanner.js";
import {
  resolvePackageName,
  resolveRootNamespace,
} from "./utils/package-name.js";
import { applyUnreferencedTypeHandling } from "./utils/unreferenced-types.js";

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
  const clients = sdkContext.sdkPackage.clients;

  // Apply unreferenced-types-handling option to filter or internalize
  // types that are not reachable from any client operation signature
  const { models, enums } = applyUnreferencedTypeHandling(
    sdkContext.sdkPackage.models,
    sdkContext.sdkPackage.enums,
    clients,
    options["unreferenced-types-handling"],
  );
  const fixedEnums = enums.filter((e) => e.isFixed);
  const extensibleEnums = enums.filter((e) => !e.isFixed);
  const allClients = getAllClients(clients);

  // Resolve the package name for the generated library
  const packageName = resolvePackageName(sdkContext, options["package-name"]);

  // Resolve the root namespace for generated code. This is derived from TCGC
  // and ignores the explicit package-name option, ensuring infrastructure files
  // share the same namespace as client code (important for versioned projects
  // where package-name includes a version suffix that clients don't use).
  const rootNamespace = resolveRootNamespace(sdkContext);

  // Determine whether to generate project scaffolding (.csproj, .sln).
  // Skip if the .csproj already exists and user hasn't set new-project: true.
  const csprojPath = resolvePath(
    context.emitterOutputDir,
    "src",
    `${packageName}.csproj`,
  );
  const shouldGenerateProject =
    options["new-project"] || !existsSync(csprojPath);

  // Scan for user-written custom partial classes in the output directory.
  // Custom code files live under src/ but outside the Generated/ subdirectory.
  // When found, their CodeGen attributes inform member filtering/renaming.
  const customCode = await scanCustomCode(context.emitterOutputDir);

  const output = (
    <HttpClientCSharpOutput
      program={context.program}
      options={options}
      sdkContext={sdkContext}
      packageName={packageName}
      customCode={customCode}
    >
      {shouldGenerateProject && (
        <ProjectFile packageName={packageName} options={options} />
      )}
      {shouldGenerateProject && <SolutionFile packageName={packageName} />}
      <ArgumentFile packageName={rootNamespace} options={options} />
      <OptionalFile packageName={rootNamespace} options={options} />
      <ChangeTrackingListFile packageName={rootNamespace} options={options} />
      <ChangeTrackingDictionaryFile
        packageName={rootNamespace}
        options={options}
      />
      <CancellationTokenExtensionsFile
        packageName={rootNamespace}
        options={options}
      />
      <ErrorResultFile packageName={rootNamespace} options={options} />
      <SerializationFormatFile packageName={rootNamespace} options={options} />
      <TypeFormattersFile packageName={rootNamespace} options={options} />
      <ClientUriBuilderFile packageName={rootNamespace} options={options} />
      <ModelSerializationExtensionsFile
        packageName={rootNamespace}
        options={options}
        hasDynamicModels={models.some((m) => isDynamicModel(m))}
      />
      <ClientPipelineExtensionsFile
        packageName={rootNamespace}
        options={options}
      />
      <Utf8JsonBinaryContentFile packageName={rootNamespace} options={options} />
      <BinaryContentHelperFile packageName={rootNamespace} options={options} />
      <MultiPartFormDataBinaryContentFile packageName={rootNamespace} />
      <PipelineRequestHeadersExtensionsFile
        packageName={rootNamespace}
        options={options}
      />
      <CodeGenAttributeFiles options={options} />
      <CSharpScalarOverrides>
        {clients.map((c) => (
          <ClientOptionsFile client={c} options={options} />
        ))}
        {allClients.map((c) => (
          <ClientFile client={c} options={options} />
        ))}
        {allClients.map((c) => (
          <RestClientFile client={c} options={options} />
        ))}
        {allClients.map((c) => (
          <CollectionResultFiles client={c} options={options} />
        ))}
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
        {models.map((m) => {
          const supportsJson = (m.usage & UsageFlags.Json) !== 0;
          const supportsXml = (m.usage & UsageFlags.Xml) !== 0;
          return (
            <ModelSerializationFile type={m} options={options}>
              {supportsJson && <JsonModelInterfaceWrite type={m} />}
              {supportsJson && "\n\n"}
              {supportsJson && (
                <JsonModelWriteCore type={m}>
                  {!m.baseModel && !isDynamicModel(m) && (
                    <AdditionalBinaryDataWrite />
                  )}
                </JsonModelWriteCore>
              )}
              {supportsJson && "\n\n"}
              <PersistableModelWriteCore type={m} />
              {"\n\n"}
              <PersistableModelCreateCore type={m} />
              {"\n\n"}
              <PersistableModelInterfaceMethods type={m} />
              {supportsJson && "\n\n"}
              {supportsJson && <JsonModelInterfaceCreate type={m} />}
              {supportsJson && "\n\n"}
              {supportsJson && <JsonModelCreateCore type={m} />}
              {supportsJson && "\n\n"}
              {supportsJson && <DeserializationConstructor type={m} />}
              {!supportsJson && supportsXml && "\n\n"}
              {!supportsJson && supportsXml && (
                <DeserializationConstructor type={m} />
              )}
              {supportsJson && "\n\n"}
              {supportsJson && (
                <JsonDeserialize type={m}>
                  <DeserializeVariableDeclarations type={m} />
                  <PropertyMatchingLoop type={m}>
                    {isDynamicModel(m) ? (
                      <DynamicPatchRead />
                    ) : (
                      <AdditionalBinaryDataRead />
                    )}
                  </PropertyMatchingLoop>
                  <DeserializeReturnStatement type={m} />
                </JsonDeserialize>
              )}
              {"\n\n"}
              <ImplicitBinaryContentOperator type={m} />
              {"\n\n"}
              <ExplicitClientResultOperator type={m} />
              {supportsJson && supportsXml && "\n\n"}
              {supportsJson && supportsXml && <ToBinaryContent type={m} />}
              {supportsXml && "\n\n"}
              {supportsXml && <XmlWriteXml type={m} />}
              {supportsXml && "\n\n"}
              {supportsXml && <XmlModelWriteCore type={m} />}
              {supportsXml && "\n\n"}
              {supportsXml && <XmlDeserialize type={m} />}
              {isDynamicModel(m) && "\n\n"}
              {isDynamicModel(m) && <DynamicModelPropagators type={m} />}
            </ModelSerializationFile>
          );
        })}
        <ModelFactoryFile
          models={models}
          packageName={rootNamespace}
          options={options}
        />
        <ModelReaderWriterContextFile
          models={models}
          packageName={rootNamespace}
          options={options}
        />
      </CSharpScalarOverrides>
    </HttpClientCSharpOutput>
  );

  await writeOutput(context.program, output, context.emitterOutputDir);
}
