import type {
  SdkClientType,
  SdkCredentialParameter,
  SdkCredentialType,
  SdkEndpointParameter,
  SdkHttpOperation,
  SdkMethodParameter,
  SdkType,
  SdkUnionType,
} from "@azure-tools/typespec-client-generator-core";
import type { ApiKeyAuth, HttpAuth, Oauth2Auth } from "@typespec/http";

/**
 * Information about API key authentication extracted from TCGC credential parameters.
 *
 * Used by ClientFile to generate the `_keyCredential`, `AuthorizationHeader`,
 * and optionally `AuthorizationApiKeyPrefix` fields on root client classes.
 */
export interface ApiKeyAuthInfo {
  kind: "apiKey";
  /** The HTTP header name where the API key is sent (e.g., "x-api-key"). */
  headerName: string;
  /** Optional prefix prepended to the key value (e.g., "Bearer"). */
  prefix?: string;
}

/**
 * Information about OAuth2 authentication extracted from TCGC credential parameters.
 *
 * Used by ClientFile to generate the `_tokenProvider` and `AuthorizationScopes`
 * fields on root client classes.
 */
export interface OAuth2AuthInfo {
  kind: "oauth2";
  /** The authorization scopes required by the service. */
  scopes: string[];
}

/** Union type representing the supported authentication schemes. */
export type AuthInfo = ApiKeyAuthInfo | OAuth2AuthInfo;

/**
 * Extracts authentication scheme information from a client's credential parameters.
 *
 * Inspects the `clientInitialization.parameters` array for credential parameters
 * and maps their TCGC `HttpAuth` schemes to structured `AuthInfo` objects.
 *
 * Only root clients (those without a parent) should use auth fields; sub-clients
 * inherit authentication through the pipeline passed by the parent.
 *
 * @param client - The TCGC SDK client type to inspect.
 * @returns An array of `AuthInfo` objects describing each auth scheme, empty if none.
 */
export function getAuthInfo(
  client: SdkClientType<SdkHttpOperation>,
): AuthInfo[] {
  const credentialParams = client.clientInitialization.parameters.filter(
    (p): p is SdkCredentialParameter => p.kind === "credential",
  );

  const authInfos: AuthInfo[] = [];

  for (const param of credentialParams) {
    const credType = param.type;

    if (credType.kind === "credential") {
      const info = extractAuthFromScheme(credType.scheme);
      if (info) {
        authInfos.push(info);
      }
    } else if (credType.kind === "union") {
      // Union of credential types (e.g., ApiKey | OAuth2)
      const unionType = credType as SdkUnionType<SdkCredentialType>;
      for (const variant of unionType.variantTypes) {
        const info = extractAuthFromScheme(variant.scheme);
        if (info) {
          authInfos.push(info);
        }
      }
    }
  }

  return authInfos;
}

/**
 * Extracts a single AuthInfo from an HttpAuth scheme definition.
 *
 * Maps TypeSpec HTTP auth schemes to the structured AuthInfo types used by
 * field generation. Currently supports API key and OAuth2 schemes.
 *
 * @param scheme - The HttpAuth scheme from TCGC.
 * @returns The corresponding AuthInfo, or undefined for unsupported schemes.
 */
function extractAuthFromScheme(scheme: HttpAuth): AuthInfo | undefined {
  switch (scheme.type) {
    case "apiKey": {
      const apiKeyScheme = scheme as ApiKeyAuth<any, any>;
      return {
        kind: "apiKey",
        headerName: apiKeyScheme.name,
        prefix: undefined, // TCGC doesn't expose prefix directly; set by convention
      };
    }
    case "oauth2": {
      const oauth2Scheme = scheme as Oauth2Auth<any>;
      const scopes: string[] = [];
      // Collect scopes from all flows
      for (const flow of oauth2Scheme.flows) {
        if (flow.scopes) {
          for (const scope of flow.scopes) {
            if (!scopes.includes(scope.value)) {
              scopes.push(scope.value);
            }
          }
        }
      }
      return {
        kind: "oauth2",
        scopes,
      };
    }
    case "http": {
      // Bearer token auth maps to OAuth2-style token provider
      if ("scheme" in scheme && (scheme as any).scheme === "bearer") {
        return {
          kind: "oauth2",
          scopes: [],
        };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Returns non-endpoint, non-credential method parameters from the client's
 * initialization parameters.
 *
 * These are additional client-level parameters such as `apiVersion`,
 * `subscriptionId`, or other service-specific configuration that becomes
 * private readonly fields on the client class.
 *
 * @param client - The TCGC SDK client type to inspect.
 * @returns Array of method parameters for field generation.
 */
export function getClientMethodParameters(
  client: SdkClientType<SdkHttpOperation>,
): SdkMethodParameter[] {
  return client.clientInitialization.parameters.filter(
    (p): p is SdkMethodParameter => p.kind === "method",
  );
}

/**
 * Returns the endpoint parameter from the client's initialization parameters.
 *
 * Every client has exactly one endpoint parameter. This utility extracts it
 * for use in constructor generation (task 3.2.3).
 *
 * @param client - The TCGC SDK client type to inspect.
 * @returns The endpoint parameter, or undefined if not found.
 */
export function getEndpointParameter(
  client: SdkClientType<SdkHttpOperation>,
): SdkEndpointParameter | undefined {
  return client.clientInitialization.parameters.find(
    (p): p is SdkEndpointParameter => p.kind === "endpoint",
  );
}

/**
 * Returns the C# type name for a client method parameter's field declaration.
 *
 * API version parameters always map to `string` regardless of their TCGC type,
 * matching the legacy emitter behavior where enum-typed API versions use the
 * enum's value type (string) for the field.
 *
 * Other parameters are mapped from their TCGC SDK type kind to the corresponding
 * C# primitive type name. This covers the common client-level parameter types
 * (string, int, long, bool, etc.).
 *
 * @param param - The TCGC method parameter to get the field type for.
 * @returns A C# type name string suitable for use as a Field component's `type` prop.
 */
export function getFieldTypeForParam(param: SdkMethodParameter): string {
  // API version fields are always string in the legacy emitter,
  // even when TCGC models them as enum types.
  if (param.isApiVersionParam) return "string";

  return mapSdkTypeToFieldType(param.type);
}

/**
 * Maps an TCGC SDK type to its C# primitive type name.
 *
 * This is used for client-level field declarations where the type is typically
 * a simple scalar. For complex types (models, enums), this falls back to "string".
 *
 * @param sdkType - The TCGC SDK type to map.
 * @returns The C# type name string.
 */
function mapSdkTypeToFieldType(sdkType: SdkType): string {
  switch (sdkType.kind) {
    case "string":
    case "url":
      return "string";
    case "boolean":
      return "bool";
    case "int8":
      return "sbyte";
    case "int16":
      return "short";
    case "int32":
      return "int";
    case "int64":
    case "safeint":
    case "integer":
      return "long";
    case "uint8":
      return "byte";
    case "uint16":
      return "ushort";
    case "uint32":
      return "uint";
    case "uint64":
      return "ulong";
    case "float32":
      return "float";
    case "float64":
    case "numeric":
    case "float":
      return "double";
    case "decimal":
    case "decimal128":
      return "decimal";
    default:
      return "string";
  }
}
