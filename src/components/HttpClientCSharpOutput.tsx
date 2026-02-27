import { createCSharpNamePolicy } from "@alloy-js/csharp";
import { type Children } from "@alloy-js/core";
import { type Program } from "@typespec/compiler";
import { Output } from "@typespec/emitter-framework";

/**
 * Props for the root HttpClientCSharpOutput component.
 */
export interface HttpClientCSharpOutputProps {
  /** The TypeSpec compiler program instance. */
  program: Program;
  /** Optional children to render inside the output. */
  children?: Children;
}

/**
 * Root output component for the C# HTTP client emitter.
 *
 * Configures the Alloy rendering context with:
 * - TypeSpec program access via TspContext (provided by emitter-framework Output)
 * - C# name policy: PascalCase for types/public members, camelCase for parameters/variables
 * - Format options: 4-space indentation, 120-character print width
 *
 * All child components rendered inside this tree can use `useTsp()` to access
 * the TypeSpec program and `useCSharpNamePolicy()` for naming conventions.
 */
export function HttpClientCSharpOutput(props: HttpClientCSharpOutputProps) {
  return (
    <Output
      program={props.program}
      namePolicy={createCSharpNamePolicy()}
      tabWidth={4}
      printWidth={120}
    >
      {props.children}
    </Output>
  );
}
