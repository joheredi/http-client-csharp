import { Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * Props for the {@link SerializationFormatFile} component.
 */
export interface SerializationFormatFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the `SerializationFormat.cs` internal enum.
 *
 * This enum defines all supported serialization format types for date-time,
 * duration, time, and bytes values. It is used by serialization infrastructure
 * (TypeFormatters, ModelSerializationExtensions) to select the correct
 * format when reading or writing values during JSON/XML serialization.
 *
 * The generated enum matches the legacy emitter's output:
 * `src/Generated/Internal/SerializationFormat.cs`.
 *
 * @example Generated output:
 * ```csharp
 * internal enum SerializationFormat
 * {
 *     Default = 0,
 *     DateTime_RFC1123 = 1,
 *     DateTime_RFC3339 = 2,
 *     // ... etc
 * }
 * ```
 */
export function SerializationFormatFile(props: SerializationFormatFileProps) {
  const header = getLicenseHeader(props.options);

  return (
    <SourceFile path="src/Generated/Internal/SerializationFormat.cs">
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        {code`
          internal enum SerializationFormat
          {
              /// <summary> The default serialization format. </summary>
              Default = 0,
              /// <summary> The RFC1123 date time format. </summary>
              DateTime_RFC1123 = 1,
              /// <summary> The RFC3339 date time format. </summary>
              DateTime_RFC3339 = 2,
              /// <summary> The RFC7231 date time format. </summary>
              DateTime_RFC7231 = 3,
              /// <summary> The ISO8601 date time format. </summary>
              DateTime_ISO8601 = 4,
              /// <summary> The Unix date time format. </summary>
              DateTime_Unix = 5,
              /// <summary> The ISO8601 date format. </summary>
              Date_ISO8601 = 6,
              /// <summary> The ISO8601 duration format. </summary>
              Duration_ISO8601 = 7,
              /// <summary> The constant duration format. </summary>
              Duration_Constant = 8,
              /// <summary> The seconds duration format. </summary>
              Duration_Seconds = 9,
              /// <summary> The seconds duration format with float precision. </summary>
              Duration_Seconds_Float = 10,
              /// <summary> The seconds duration format with double precision. </summary>
              Duration_Seconds_Double = 11,
              /// <summary> The milliseconds duration format. </summary>
              Duration_Milliseconds = 12,
              /// <summary> The milliseconds duration format with float precision. </summary>
              Duration_Milliseconds_Float = 13,
              /// <summary> The milliseconds duration format with double precision. </summary>
              Duration_Milliseconds_Double = 14,
              /// <summary> The ISO8601 time format. </summary>
              Time_ISO8601 = 15,
              /// <summary> The Base64Url bytes format. </summary>
              Bytes_Base64Url = 16,
              /// <summary> The Base64 bytes format. </summary>
              Bytes_Base64 = 17
          }
        `}
      </Namespace>
    </SourceFile>
  );
}
