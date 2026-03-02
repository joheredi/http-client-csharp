import { Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * Props for the {@link TypeFormattersFile} component.
 */
export interface TypeFormattersFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the `TypeFormatters.cs` internal static helper class.
 *
 * This class provides type-safe conversion and parsing methods used by
 * `ClientUriBuilder` (for path/query parameter formatting) and
 * `ModelSerializationExtensions` (for JSON/XML value formatting).
 *
 * Key responsibilities:
 * - `ToString` overloads for `DateTime`, `DateTimeOffset`, `TimeSpan`, `byte[]`
 * - `ConvertToString` generic dispatch for URI parameter serialization
 * - Base64/Base64URL encoding and decoding
 * - `ParseDateTimeOffset` / `ParseTimeSpan` for deserialization
 * - `ToFormatSpecifier` mapping from `SerializationFormat` enum to format strings
 *
 * The generated class matches the legacy emitter's output:
 * `src/Generated/Internal/TypeFormatters.cs`.
 */
export function TypeFormattersFile(props: TypeFormattersFileProps) {
  const header = getLicenseHeader(props.options);

  return (
    <SourceFile
      path="src/Generated/Internal/TypeFormatters.cs"
      using={[
        "System",
        "System.Collections.Generic",
        "System.Globalization",
        "System.Xml",
      ]}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        {code`
          internal static partial class TypeFormatters
          {
              private const string RoundtripZFormat = "yyyy-MM-ddTHH:mm:ss.fffffffZ";
              public const string DefaultNumberFormat = "G";

              public static string ToString(bool value) => value ? "true" : "false";

              public static string ToString(DateTime value, string format) => value.Kind switch
              {
                  DateTimeKind.Utc => ToString((DateTimeOffset)value, format),
                  _ => throw new NotSupportedException($"DateTime {value} has a Kind of {value.Kind}. Generated clients require it to be UTC. You can call DateTime.SpecifyKind to change Kind property value to DateTimeKind.Utc.")
              };

              public static string ToString(DateTimeOffset value, string format) => format switch
              {
                  "D" => value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                  "U" => value.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture),
                  "O" => value.ToUniversalTime().ToString(RoundtripZFormat, CultureInfo.InvariantCulture),
                  "o" => value.ToUniversalTime().ToString(RoundtripZFormat, CultureInfo.InvariantCulture),
                  "R" => value.ToString("r", CultureInfo.InvariantCulture),
                  _ => value.ToString(format, CultureInfo.InvariantCulture)
              };

              public static string ToString(TimeSpan value, string format) => format switch
              {
                  "P" => XmlConvert.ToString(value),
                  _ => value.ToString(format, CultureInfo.InvariantCulture)
              };

              public static string ToString(byte[] value, string format) => format switch
              {
                  "U" => ToBase64UrlString(value),
                  "D" => Convert.ToBase64String(value),
                  _ => throw new ArgumentException($"Format is not supported: '{format}'", nameof(format))
              };

              public static string ToBase64UrlString(byte[] value)
              {
                  int numWholeOrPartialInputBlocks = checked (value.Length + 2) / 3;
                  int size = checked (numWholeOrPartialInputBlocks * 4);
                  char[] output = new char[size];

                  int numBase64Chars = Convert.ToBase64CharArray(value, 0, value.Length, output, 0);

                  int i = 0;
                  for (; i < numBase64Chars; i++)
                  {
                      char ch = output[i];
                      if (ch == '+')
                      {
                          output[i] = '-';
                      }
                      else
                      {
                          if (ch == '/')
                          {
                              output[i] = '_';
                          }
                          else
                          {
                              if (ch == '=')
                              {
                                  break;
                              }
                          }
                      }
                  }

                  return new string(output, 0, i);
              }

              public static byte[] FromBase64UrlString(string value)
              {
                  int paddingCharsToAdd = (value.Length % 4) switch
                  {
                      0 => 0,
                      2 => 2,
                      3 => 1,
                      _ => throw new InvalidOperationException("Malformed input")
                  };
                  char[] output = new char[(value.Length + paddingCharsToAdd)];
                  int i = 0;
                  for (; i < value.Length; i++)
                  {
                      char ch = value[i];
                      if (ch == '-')
                      {
                          output[i] = '+';
                      }
                      else
                      {
                          if (ch == '_')
                          {
                              output[i] = '/';
                          }
                          else
                          {
                              output[i] = ch;
                          }
                      }
                  }

                  for (; i < output.Length; i++)
                  {
                      output[i] = '=';
                  }

                  return Convert.FromBase64CharArray(output, 0, output.Length);
              }

              public static DateTimeOffset ParseDateTimeOffset(string value, string format) => format switch
              {
                  "U" => DateTimeOffset.FromUnixTimeSeconds(long.Parse(value, CultureInfo.InvariantCulture)),
                  _ => DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal)
              };

              public static TimeSpan ParseTimeSpan(string value, string format) => format switch
              {
                  "P" => XmlConvert.ToTimeSpan(value),
                  _ => TimeSpan.ParseExact(value, format, CultureInfo.InvariantCulture)
              };

              public static string ToFormatSpecifier(SerializationFormat format) => format switch
              {
                  SerializationFormat.DateTime_RFC1123 => "R",
                  SerializationFormat.DateTime_RFC3339 => "O",
                  SerializationFormat.DateTime_RFC7231 => "R",
                  SerializationFormat.DateTime_ISO8601 => "O",
                  SerializationFormat.Date_ISO8601 => "D",
                  SerializationFormat.DateTime_Unix => "U",
                  SerializationFormat.Bytes_Base64Url => "U",
                  SerializationFormat.Bytes_Base64 => "D",
                  SerializationFormat.Duration_ISO8601 => "P",
                  SerializationFormat.Duration_Constant => "c",
                  SerializationFormat.Duration_Seconds => "%s",
                  SerializationFormat.Duration_Seconds_Float => "s\\\\.FFF",
                  SerializationFormat.Duration_Seconds_Double => "s\\\\.FFFFFF",
                  SerializationFormat.Time_ISO8601 => "T",
                  _ => null
              };

              public static string ConvertToString(object value, SerializationFormat format = SerializationFormat.Default)
              {
                  string formatSpecifier = ToFormatSpecifier(format);

                  return value switch
                  {
                      null => "null",
                      string s => s,
                      bool b => ToString(b),
                      int  or  float  or  double  or  long  or  decimal => ((IFormattable)value).ToString(DefaultNumberFormat, CultureInfo.InvariantCulture),
                      byte[] b0 when formatSpecifier != null => ToString(b0, formatSpecifier),
                      IEnumerable<string> s0 => string.Join(",", s0),
                      DateTimeOffset dateTime when formatSpecifier != null => ToString(dateTime, formatSpecifier),
                      TimeSpan timeSpan when format == SerializationFormat.Duration_Seconds => Convert.ToInt32(timeSpan.TotalSeconds).ToString(CultureInfo.InvariantCulture),
                      TimeSpan timeSpan0 when format == SerializationFormat.Duration_Seconds_Float || format == SerializationFormat.Duration_Seconds_Double => timeSpan0.TotalSeconds.ToString(CultureInfo.InvariantCulture),
                      TimeSpan timeSpan1 when format == SerializationFormat.Duration_Milliseconds => Convert.ToInt32(timeSpan1.TotalMilliseconds).ToString(CultureInfo.InvariantCulture),
                      TimeSpan timeSpan2 when format == SerializationFormat.Duration_Milliseconds_Float || format == SerializationFormat.Duration_Milliseconds_Double => timeSpan2.TotalMilliseconds.ToString(CultureInfo.InvariantCulture),
                      TimeSpan timeSpan3 when formatSpecifier != null => ToString(timeSpan3, formatSpecifier),
                      TimeSpan timeSpan4 => XmlConvert.ToString(timeSpan4),
                      Guid guid => guid.ToString(),
                      BinaryData binaryData => ConvertToString(binaryData.ToArray(), format),
                      _ => value.ToString()
                  };
              }
          }
        `}
      </Namespace>
    </SourceFile>
  );
}
