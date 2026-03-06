import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for duration parameter encoding in REST client code generation.
 *
 * These tests verify that the emitter generates the correct `SerializationFormat`
 * enum values for duration (TimeSpan) parameters in header and query parameter
 * serialization. The legacy C# generator maps duration encodings to specific format
 * values (Duration_Seconds, Duration_Milliseconds, etc.) but the new emitter
 * previously hardcoded Duration_ISO8601 for all durations.
 *
 * Why these tests matter:
 * - Duration encoding determines how TimeSpan values are serialized on the wire.
 *   ISO8601 produces "PT36S" while seconds encoding produces "36".
 * - The Spector mock server validates the exact wire format, so incorrect encoding
 *   causes ClientResultException at runtime (20+ e2e test failures).
 * - The encoding type comes from TCGC's resolution of @encode decorators in TypeSpec.
 * - Array (collection) durations must also use the correct format in
 *   AppendQueryDelimited and SetDelimited calls.
 */
describe("duration parameter encoding", () => {
  /**
   * Validates that a duration header parameter with @encode("seconds", int32)
   * generates SerializationFormat.Duration_Seconds (not Duration_ISO8601).
   * This is the most common non-ISO8601 encoding and affects integer second values.
   */
  it("uses Duration_Seconds for int32-seconds header", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @route("/test")
      @get op test(@header @encode("seconds", int32) duration: duration): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const restClientFile = Object.keys(outputs).find((k) =>
      k.includes("RestClient.cs"),
    );
    expect(restClientFile).toBeDefined();

    const content = outputs[restClientFile!];
    expect(content).toContain("SerializationFormat.Duration_Seconds");
    expect(content).not.toContain("SerializationFormat.Duration_ISO8601");
  });

  /**
   * Validates float32-seconds encoding maps to Duration_Seconds_Float.
   * Float seconds allow fractional values like 35.625, which must not be
   * truncated by Convert.ToInt32().
   */
  it("uses Duration_Seconds_Float for float32-seconds header", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @route("/test")
      @get op test(@header @encode("seconds", float32) duration: duration): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const restClientFile = Object.keys(outputs).find((k) =>
      k.includes("RestClient.cs"),
    );
    expect(restClientFile).toBeDefined();

    const content = outputs[restClientFile!];
    expect(content).toContain("SerializationFormat.Duration_Seconds_Float");
  });

  /**
   * Validates float64-seconds encoding maps to Duration_Seconds_Double.
   * This is the highest precision seconds encoding.
   */
  it("uses Duration_Seconds_Double for float64-seconds header", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @route("/test")
      @get op test(@header @encode("seconds", float64) duration: duration): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const restClientFile = Object.keys(outputs).find((k) =>
      k.includes("RestClient.cs"),
    );
    expect(restClientFile).toBeDefined();

    const content = outputs[restClientFile!];
    expect(content).toContain("SerializationFormat.Duration_Seconds_Double");
  });

  /**
   * Validates int32-milliseconds encoding maps to Duration_Milliseconds.
   * Millisecond encoding converts via Convert.ToInt32(TotalMilliseconds).
   */
  it("uses Duration_Milliseconds for int32-milliseconds query", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @route("/test")
      @get op test(@query @encode("milliseconds", int32) duration: duration): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const restClientFile = Object.keys(outputs).find((k) =>
      k.includes("RestClient.cs"),
    );
    expect(restClientFile).toBeDefined();

    const content = outputs[restClientFile!];
    expect(content).toContain("SerializationFormat.Duration_Milliseconds");
    expect(content).not.toContain("SerializationFormat.Duration_ISO8601");
  });

  /**
   * Validates that explicit ISO8601 encoding still works correctly.
   * This is the default and should produce Duration_ISO8601 format,
   * which delegates to XmlConvert.ToString() at runtime.
   */
  it("uses Duration_ISO8601 for ISO8601-encoded duration", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @route("/test")
      @get op test(@header @encode("ISO8601") duration: duration): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const restClientFile = Object.keys(outputs).find((k) =>
      k.includes("RestClient.cs"),
    );
    expect(restClientFile).toBeDefined();

    const content = outputs[restClientFile!];
    expect(content).toContain("SerializationFormat.Duration_ISO8601");
  });

  /**
   * Validates that a duration query parameter array with int32-seconds encoding
   * passes the correct SerializationFormat to AppendQueryDelimited.
   * Without this, array elements would be formatted with Default format
   * instead of Duration_Seconds, causing wire format mismatches.
   */
  it("uses correct format for int32-seconds query array", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @encode("seconds", int32)
      scalar secondsDuration extends duration;

      @route("/test")
      @get op test(@query duration: secondsDuration[]): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const restClientFile = Object.keys(outputs).find((k) =>
      k.includes("RestClient.cs"),
    );
    expect(restClientFile).toBeDefined();

    const content = outputs[restClientFile!];
    expect(content).toContain("SerializationFormat.Duration_Seconds");
    expect(content).toContain("AppendQueryDelimited");
  });

  /**
   * Validates that a duration header array with int32-milliseconds encoding
   * uses SetDelimited with the correct format. This ensures the
   * PipelineRequestHeadersExtensions.SetDelimited method is called with
   * the Duration_Milliseconds format, not just string.Join without formatting.
   */
  it("uses SetDelimited with format for int32-milliseconds header array", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @encode("milliseconds", int32)
      scalar millisDuration extends duration;

      @route("/test")
      @get op test(@header duration: millisDuration[]): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const restClientFile = Object.keys(outputs).find((k) =>
      k.includes("RestClient.cs"),
    );
    expect(restClientFile).toBeDefined();

    const content = outputs[restClientFile!];
    expect(content).toContain("SetDelimited");
    expect(content).toContain("SerializationFormat.Duration_Milliseconds");
  });

  /**
   * Validates float32-milliseconds encoding maps to Duration_Milliseconds_Float.
   */
  it("uses Duration_Milliseconds_Float for float32-milliseconds", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @route("/test")
      @get op test(@query @encode("milliseconds", float32) duration: duration): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const restClientFile = Object.keys(outputs).find((k) =>
      k.includes("RestClient.cs"),
    );
    expect(restClientFile).toBeDefined();

    const content = outputs[restClientFile!];
    expect(content).toContain(
      "SerializationFormat.Duration_Milliseconds_Float",
    );
  });

  /**
   * Validates float64-milliseconds encoding maps to Duration_Milliseconds_Double.
   */
  it("uses Duration_Milliseconds_Double for float64-milliseconds", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @route("/test")
      @get op test(@query @encode("milliseconds", float64) duration: duration): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const restClientFile = Object.keys(outputs).find((k) =>
      k.includes("RestClient.cs"),
    );
    expect(restClientFile).toBeDefined();

    const content = outputs[restClientFile!];
    expect(content).toContain(
      "SerializationFormat.Duration_Milliseconds_Double",
    );
  });
});
