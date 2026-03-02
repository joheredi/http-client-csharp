import {
  createTypeSpecLibrary,
  type DiagnosticDefinition,
  type DiagnosticMessages,
  paramMessage,
} from "@typespec/compiler";
import { CSharpEmitterOptionsSchema } from "./options.js";

/**
 * Maps each diagnostic code to its parameterized message signatures.
 * This type is used by the TypeSpec compiler to provide type-safe
 * diagnostic reporting via `reportDiagnostic` and `createDiagnostic`.
 */
export type DiagnosticMessagesMap = {
  [K in keyof typeof diags]: (typeof diags)[K]["messages"];
};

/**
 * Diagnostic definitions for the C# HTTP client emitter.
 *
 * Each entry defines a diagnostic code, its severity (error or warning),
 * and one or more parameterized message templates. These diagnostics are
 * reported during emit when the emitter encounters unsupported constructs
 * or configuration issues.
 */
const diags: { [code: string]: DiagnosticDefinition<DiagnosticMessages> } = {
  "no-apiVersion": {
    severity: "error",
    messages: {
      default: paramMessage`No APIVersion Provider for service ${"service"}`,
    },
  },
  "no-route": {
    severity: "error",
    messages: {
      default: paramMessage`No Route for service for service ${"service"}`,
    },
  },
  "general-warning": {
    severity: "warning",
    messages: {
      default: paramMessage`${"message"}`,
    },
  },
  "general-error": {
    severity: "error",
    messages: {
      default: paramMessage`${"message"}`,
    },
  },
  "unsupported-auth": {
    severity: "warning",
    messages: {
      default: paramMessage`${"message"}`,
      onlyUnsupportedAuthProvided: `No supported authentication methods were provided. No public client constructors will be generated. Please provide your own custom constructor for client instantiation.`,
    },
  },
  "client-namespace-conflict": {
    severity: "warning",
    messages: {
      default: paramMessage`${"message"}`,
    },
  },
  "unsupported-endpoint-url": {
    severity: "error",
    messages: {
      default: paramMessage`Unsupported server endpoint URL: ${"endpoint"}`,
    },
  },
  "unsupported-sdk-type": {
    severity: "error",
    messages: {
      default: paramMessage`Unsupported SDK type: ${"sdkType"}.`,
    },
  },
  "unsupported-default-value-type": {
    severity: "error",
    messages: {
      default: paramMessage`Unsupported default value type: ${"valueType"}.`,
    },
  },
  "unsupported-cookie-parameter": {
    severity: "error",
    messages: {
      default: paramMessage`Cookie parameter is not supported: ${"parameterName"}, found in operation ${"path"}`,
    },
  },
  "unsupported-parameter-kind": {
    severity: "warning",
    messages: {
      default: paramMessage`Unsupported parameter kind: ${"parameterKind"}.`,
    },
  },
  "unsupported-patch-convenience-method": {
    severity: "warning",
    messages: {
      default: paramMessage`Convenience method is not supported for PATCH method, it will be turned off. Please set the '@convenientAPI' to false for operation ${"methodCrossLanguageDefinitionId"}.`,
    },
  },
  "unsupported-service-method": {
    severity: "warning",
    messages: {
      default: paramMessage`Unsupported method kind: ${"methodKind"}.`,
    },
  },
  "unsupported-continuation-location": {
    severity: "error",
    messages: {
      default: paramMessage`Unsupported continuation location for operation ${"crossLanguageDefinitionId"}.`,
    },
  },
};

/**
 * The TypeSpec library definition for the C# HTTP client emitter.
 *
 * Registers the emitter name, diagnostic codes, and the emitter options
 * JSON schema with the TypeSpec compiler. The compiler uses this to
 * validate `tspconfig.yaml` and to power IDE auto-completion.
 */
export const $lib = createTypeSpecLibrary({
  name: "http-client-csharp",
  diagnostics: diags,
  emitter: {
    options: CSharpEmitterOptionsSchema,
  },
});

/** Reports a diagnostic using the library's diagnostic definitions. */
export const reportDiagnostic = $lib.reportDiagnostic;

/** Creates a diagnostic instance using the library's diagnostic definitions. */
export const createDiagnostic = $lib.createDiagnostic;

/** Gets a tracer scoped to this library for debug logging. */
export const getTracer = $lib.getTracer;
