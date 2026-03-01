import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";
import { createSdkContext } from "@azure-tools/typespec-client-generator-core";
import { $lib } from "../src/lib.js";

describe("debug", () => {
  it("prints model access", async () => {
    const [result, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        count: int32;
      }

      @route("/test")
      op test(): Widget;
    `);

    // Let's look at what the emitter sees
    // We need to call createSdkContext like the emitter does
    // Actually, we can't do that from here since we don't have the context
    // Let me instead add logging to the factory component
    
    // For now, just check which keys exist
    console.log("Keys:", Object.keys(result.outputs));
    expect(true).toBe(true);
  });
});
