import type {
  SdkClientType,
  SdkCredentialParameter,
  SdkCredentialType,
  SdkEndpointParameter,
  SdkEndpointType,
  SdkHttpOperation,
  SdkMethodParameter,
  SdkPathParameter,
  SdkType,
  SdkUnionType,
} from "@azure-tools/typespec-client-generator-core";
import type {
  ApiKeyAuth,
  HttpAuth,
  OAuth2Flow,
  Oauth2Auth,
} from "@typespec/http";

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
 * Information about a single OAuth2 flow extracted from TypeSpec.
 *
 * Each flow captures the scopes and optional URLs (authorization, token, refresh)
 * defined on the TypeSpec OAuth2 flow model. These are used to generate the
 * `_flows` dictionary entries with `GetTokenOptions` property name keys.
 */
export interface OAuth2FlowInfo {
  /** The authorization scopes required by this flow. */
  scopes: string[];
  /** The authorization endpoint URL, if defined by the flow type. */
  authorizationUrl?: string;
  /** The token endpoint URL, if defined by the flow type. */
  tokenUrl?: string;
  /** The refresh token endpoint URL, if defined by the flow type. */
  refreshUrl?: string;
}

/**
 * Information about OAuth2 authentication extracted from TCGC credential parameters.
 *
 * Used by ClientFile to generate the `_tokenProvider` and `_flows`
 * fields on root client classes. Each flow entry becomes a
 * `Dictionary<string, object>` in the `_flows` array with
 * `GetTokenOptions` property name keys for scopes and URLs.
 */
export interface OAuth2AuthInfo {
  kind: "oauth2";
  /** The OAuth2 flows defined by the service, each with scopes and optional URLs. */
  flows: OAuth2FlowInfo[];
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
      const apiKeyScheme = scheme as ApiKeyAuth<
        "header" | "query" | "cookie",
        string
      >;
      return {
        kind: "apiKey",
        headerName: apiKeyScheme.name,
        prefix: undefined, // TCGC doesn't expose prefix directly; set by convention
      };
    }
    case "oauth2": {
      const oauth2Scheme = scheme as Oauth2Auth<OAuth2Flow[]>;
      const flows: OAuth2FlowInfo[] = [];
      // Collect flow metadata from all OAuth2 flows
      for (const flow of oauth2Scheme.flows) {
        const scopes: string[] = [];
        if (flow.scopes) {
          for (const scope of flow.scopes) {
            if (!scopes.includes(scope.value)) {
              scopes.push(scope.value);
            }
          }
        }
        flows.push({
          scopes,
          authorizationUrl:
            "authorizationUrl" in flow
              ? (flow.authorizationUrl as string)
              : undefined,
          tokenUrl: "tokenUrl" in flow ? (flow.tokenUrl as string) : undefined,
          refreshUrl:
            "refreshUrl" in flow ? (flow.refreshUrl as string) : undefined,
        });
      }
      return {
        kind: "oauth2",
        flows,
      };
    }
    case "http": {
      // Bearer token auth maps to OAuth2-style token provider
      if (
        "scheme" in scheme &&
        (scheme as unknown as Record<string, unknown>).scheme === "bearer"
      ) {
        return {
          kind: "oauth2",
          flows: [{ scopes: [] }],
        };
      }
      // Custom HTTP auth schemes (e.g., "SharedAccessKey") map to
      // ApiKeyCredential with the Authorization header. The scheme
      // name becomes a prefix so the header value is sent as
      // `Authorization: <scheme> <key>`.
      const httpScheme = (scheme as unknown as Record<string, unknown>)
        .scheme as string | undefined;
      return {
        kind: "apiKey",
        headerName: "Authorization",
        prefix: httpScheme,
      };
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

/**
 * Returns server URL template parameters that should become constructor parameters.
 *
 * These are non-primary, non-api-version endpoint template arguments that need
 * user-provided values at client construction time. For example, in the
 * `@server("{endpoint}/client/structure/{client}", ...)` decorator, the `client`
 * parameter of type `ClientType` (enum) becomes a required constructor parameter.
 *
 * A template argument needs a constructor parameter when it:
 * - Is NOT the primary endpoint (type.kind !== "url")
 * - Is NOT an api-version parameter
 * - Does NOT have a constant type value
 * - Does NOT have a clientDefaultValue
 *
 * @param client - The TCGC SDK client type to inspect.
 * @returns Array of SdkPathParameter objects that should become constructor params.
 */
export function getServerTemplateConstructorParams(
  client: SdkClientType<SdkHttpOperation>,
): SdkPathParameter[] {
  const segments = getServerPathSegments(client);
  return segments
    .filter(
      (s): s is ServerPathSegment & { param: SdkPathParameter } =>
        s.kind === "parameter" && s.param !== undefined,
    )
    .map((s) => s.param)
    .filter((p) => {
      // Skip the primary endpoint (url type)
      if (p.type.kind === "url") return false;
      // Skip api-version params (handled separately via options.Version)
      if (p.isApiVersionParam) return false;
      // Skip constant-type params (value is hardcoded in the template)
      if (p.type.kind === "constant" && p.type.value !== null) return false;
      // Skip params with default values (value is known at codegen time)
      if (
        p.clientDefaultValue !== undefined &&
        p.clientDefaultValue !== null
      )
        return false;
      return true;
    });
}

/**
 * Represents a segment of a parsed server URL template path.
 * Used to generate endpoint URI construction code in the client constructor
 * when the server URL template includes path segments beyond the endpoint placeholder.
 */
export interface ServerPathSegment {
  kind: "literal" | "parameter";
  /** For literal segments, the literal text. */
  value?: string;
  /** For parameter segments, the TCGC path parameter from the template arguments. */
  param?: SdkPathParameter;
}

/**
 * Parses the server URL template from the endpoint parameter to extract
 * path segments that appear after the endpoint placeholder.
 *
 * For versioned specs with server templates like
 * `"{endpoint}/versioning/added/api-version:{version}"`,
 * this returns the segments representing `/versioning/added/api-version:` (literal)
 * and `{version}` (parameter with isApiVersionParam=true).
 *
 * TCGC may provide the endpoint type as either a single `SdkEndpointType` or a
 * `SdkUnionType<SdkEndpointType>` with multiple variants (e.g., versioned +
 * unversioned). When a union is present, we select the variant with the most
 * template arguments, which is the one containing the version placeholder.
 *
 * Returns an empty array if the server URL template has no extra path segments
 * beyond the endpoint placeholder (e.g., `"{endpoint}"`).
 *
 * @param client - The TCGC SDK client type to inspect.
 * @returns Array of path segments for endpoint URI construction.
 */
export function getServerPathSegments(
  client: SdkClientType<SdkHttpOperation>,
): ServerPathSegment[] {
  const endpointParam = getEndpointParameter(client);
  if (!endpointParam) return [];

  // Resolve the endpoint type, handling both single and union types.
  // When TCGC provides a union (multiple @server variants), select the variant
  // with the most template arguments — this is the one with version placeholders.
  const resolvedEndpoint = resolveEndpointType(endpointParam.type);
  if (!resolvedEndpoint) return [];

  return parseServerUrlSegments(
    resolvedEndpoint.serverUrl,
    resolvedEndpoint.templateArguments,
  );
}

/**
 * Resolves an endpoint type that may be a single SdkEndpointType or a union.
 * For unions, selects the variant with the most template arguments (the one
 * containing version or other path parameters).
 */
function resolveEndpointType(
  type: SdkEndpointType | SdkUnionType<SdkEndpointType>,
): SdkEndpointType | undefined {
  if (type.kind === "endpoint") {
    return type;
  }

  if (type.kind === "union") {
    // The union's variantTypes contains the different @server alternatives.
    // Select the variant with the most template arguments — this is the one
    // that includes version or other path template parameters.
    const variants = (type as SdkUnionType<SdkEndpointType>).variantTypes;
    if (!variants || variants.length === 0) return undefined;

    let best: SdkEndpointType | undefined;
    for (const variant of variants) {
      if (variant.kind === "endpoint") {
        if (
          !best ||
          variant.templateArguments.length > best.templateArguments.length
        ) {
          best = variant;
        }
      }
    }
    return best;
  }

  return undefined;
}

/**
 * Parses a server URL template string into path segments after the endpoint placeholder.
 */
function parseServerUrlSegments(
  serverUrl: string,
  templateArgs: SdkPathParameter[],
): ServerPathSegment[] {
  if (!serverUrl || templateArgs.length <= 1) return [];

  // Find the endpoint placeholder (the one whose type is url or named "endpoint")
  const endpointArg = templateArgs.find(
    (a) => a.type.kind === "url" || a.name === "endpoint",
  );
  if (!endpointArg) return [];

  // Extract path after the endpoint placeholder
  const endpointPlaceholder = `{${endpointArg.serializedName}}`;
  const placeholderIndex = serverUrl.indexOf(endpointPlaceholder);
  if (placeholderIndex === -1) return [];

  const pathAfterEndpoint = serverUrl.slice(
    placeholderIndex + endpointPlaceholder.length,
  );
  if (!pathAfterEndpoint) return [];

  // Build a map of template arguments by serialized name for lookup
  const paramMap = new Map(templateArgs.map((a) => [a.serializedName, a]));

  // Parse path segments using regex to find {param} placeholders
  const segments: ServerPathSegment[] = [];
  const regex = /\{([^}]+)\}/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(pathAfterEndpoint)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        kind: "literal",
        value: pathAfterEndpoint.slice(lastIndex, match.index),
      });
    }
    const paramName = match[1];
    const param = paramMap.get(paramName);
    if (param) {
      segments.push({ kind: "parameter", param });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < pathAfterEndpoint.length) {
    segments.push({
      kind: "literal",
      value: pathAfterEndpoint.slice(lastIndex),
    });
  }

  return segments;
}
