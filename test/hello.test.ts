import { describe, it, expect } from "vitest";
import {Tester} from "./test-host.js"
describe("hello", () => {
  it("emit output.txt with content hello world", async () => {
    const [{ outputs }, diagnostics] = await Tester.compileAndDiagnose(`op test(): void;`);
    expect(outputs["output.txt"]).toBe("Hello world!\n");
  });
});
