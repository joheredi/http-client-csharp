import { type EmitContext } from "@typespec/compiler";
import { writeOutput } from "@typespec/emitter-framework";
import { HttpClientCSharpOutput } from "./components/HttpClientCSharpOutput.js";

export async function $onEmit(context: EmitContext) {
  const output = <HttpClientCSharpOutput program={context.program} />;
  await writeOutput(context.program, output, context.emitterOutputDir);
}
