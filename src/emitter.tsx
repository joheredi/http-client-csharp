import { createSdkContext } from "@azure-tools/typespec-client-generator-core";
import { type EmitContext } from "@typespec/compiler";
import { writeOutput } from "@typespec/emitter-framework";
import { ExtensibleEnumFile } from "./components/enums/ExtensibleEnumFile.js";
import { FixedEnumFile } from "./components/enums/FixedEnumFile.js";
import { FixedEnumSerializationFile } from "./components/enums/FixedEnumSerializationFile.js";
import { HttpClientCSharpOutput } from "./components/HttpClientCSharpOutput.js";
import { $lib } from "./lib.js";
import { type CSharpEmitterOptions, resolveOptions } from "./options.js";

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

  const output = (
    <HttpClientCSharpOutput
      program={context.program}
      options={options}
      sdkContext={sdkContext}
    >
      {fixedEnums.map((e) => (
        <FixedEnumFile type={e} options={options} />
      ))}
      {fixedEnums.map((e) => (
        <FixedEnumSerializationFile type={e} options={options} />
      ))}
      {extensibleEnums.map((e) => (
        <ExtensibleEnumFile type={e} options={options} />
      ))}
    </HttpClientCSharpOutput>
  );

  await writeOutput(context.program, output, context.emitterOutputDir);
}
