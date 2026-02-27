import { EmitContext, emitFile, resolvePath } from "@typespec/compiler";
import { writeOutput } from "@typespec/emitter-framework";
import { ExampleComponent } from "./components/ExampleComponent.js";
import { Output, SourceDirectory, SourceFile } from "@alloy-js/core";

export async function $onEmit(context: EmitContext) {
  const output = (
    <Output>
      <SourceDirectory path=".">
        <SourceFile path="output.txt" filetype="txt">
          <ExampleComponent />
        </SourceFile>
      </SourceDirectory>
    </Output>
  );
  writeOutput(context.program, output, context.emitterOutputDir);
}
