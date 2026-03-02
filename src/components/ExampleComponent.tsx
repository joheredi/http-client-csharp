import { code } from "@alloy-js/core";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExampleComponentProps {}

export function ExampleComponent(_props: ExampleComponentProps) {
  return code`Hello world!`;
}
