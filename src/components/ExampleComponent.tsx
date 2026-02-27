import { code } from "@alloy-js/core";

export interface ExampleComponentProps {}

export function ExampleComponent(props: ExampleComponentProps) {
  return code`Hello world!`;
}
