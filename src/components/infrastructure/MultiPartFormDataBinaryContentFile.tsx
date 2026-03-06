import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { useEmitterContext } from "../../contexts/emitter-context.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * Props for the {@link MultiPartFormDataBinaryContentFile} component.
 */
export interface MultiPartFormDataBinaryContentFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
}

/**
 * Conditionally generates the `MultiPartFormDataBinaryContent.cs` internal class.
 *
 * This class wraps `System.Net.Http.MultipartFormDataContent` behind the
 * `System.ClientModel.BinaryContent` abstraction so that multipart/form-data
 * request bodies can flow through the standard `ClientPipeline` send path.
 *
 * Generated only when the SDK package contains at least one operation whose
 * body uses `multipart/form-data` content type, as detected by
 * `EmitterContext.hasMultipartOperations`.
 *
 * The class provides:
 * - A constructor that creates a `MultipartFormDataContent` with a random boundary
 * - Overloaded `Add()` methods for string, int, long, float, double, decimal,
 *   bool, Stream, byte[], and BinaryData content types
 * - `ContentType` property returning the full multipart content-type header
 * - `TryComputeLength`, `WriteTo`, `WriteToAsync`, and `Dispose` overrides
 * - A static `AddContentTypeHeader` helper for setting content-type on parts
 *
 * The generated class matches the legacy emitter's `MultiPartFormDataBinaryContentDefinition`.
 */
export function MultiPartFormDataBinaryContentFile(
  props: MultiPartFormDataBinaryContentFileProps,
) {
  const ctx = useEmitterContext();

  // Only generate this file when multipart operations exist
  if (!ctx.hasMultipartOperations) {
    return false;
  }

  const header = getLicenseHeader(ctx.options);

  // WriteTo and WriteToAsync use #if preprocessor directives, which require
  // plain string blocks to avoid Alloy's indentation engine merging lines.
  // See knowledge.md: "Preprocessor directives in infrastructure files".
  const writeToMethod = `
public override void WriteTo(Stream stream, CancellationToken cancellationToken = default)
{
#if NET6_0_OR_GREATER
    _multipartContent.CopyTo(stream, null, cancellationToken);
#else
    _multipartContent.CopyToAsync(stream).GetAwaiter().GetResult();
#endif
}`;

  const writeToAsyncMethod = `
public override async Task WriteToAsync(Stream stream, CancellationToken cancellationToken = default)
{
#if NET6_0_OR_GREATER
    await _multipartContent.CopyToAsync(stream, cancellationToken).ConfigureAwait(false);
#else
    await _multipartContent.CopyToAsync(stream).ConfigureAwait(false);
#endif
}`;

  const classBody = `private readonly MultipartFormDataContent _multipartContent;
private static readonly Random _random = new Random();
private static readonly char[] _boundaryValues = "0123456789=ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz".ToCharArray();

public string ContentType => _multipartContent.Headers.ContentType.ToString();

internal HttpContent HttpContent => _multipartContent;

public MultiPartFormDataBinaryContent()
{
    _multipartContent = new MultipartFormDataContent(CreateBoundary());
}

private static string CreateBoundary()
{
    Span<char> chars = new char[70];
    byte[] random = new byte[70];
    _random.NextBytes(random);
    int mask = 255 >> 2;
    for (int i = 0; i < 70; i++)
    {
        chars[i] = _boundaryValues[random[i] & mask];
    }
    return chars.ToString();
}

public void Add(string content, string name, string filename = default, string contentType = default)
{
    Argument.AssertNotNull(content, nameof(content));
    Argument.AssertNotNullOrEmpty(name, nameof(name));

    Add(new StringContent(content), name, filename, contentType);
}

public void Add(int content, string name, string filename = default, string contentType = default)
{
    Argument.AssertNotNull(content, nameof(content));
    Argument.AssertNotNullOrEmpty(name, nameof(name));

    string value = content.ToString("G", CultureInfo.InvariantCulture);
    Add(new StringContent(value), name, filename, contentType);
}

public void Add(long content, string name, string filename = default, string contentType = default)
{
    Argument.AssertNotNull(content, nameof(content));
    Argument.AssertNotNullOrEmpty(name, nameof(name));

    string value = content.ToString("G", CultureInfo.InvariantCulture);
    Add(new StringContent(value), name, filename, contentType);
}

public void Add(float content, string name, string filename = default, string contentType = default)
{
    Argument.AssertNotNull(content, nameof(content));
    Argument.AssertNotNullOrEmpty(name, nameof(name));

    string value = content.ToString("G", CultureInfo.InvariantCulture);
    Add(new StringContent(value), name, filename, contentType);
}

public void Add(double content, string name, string filename = default, string contentType = default)
{
    Argument.AssertNotNull(content, nameof(content));
    Argument.AssertNotNullOrEmpty(name, nameof(name));

    string value = content.ToString("G", CultureInfo.InvariantCulture);
    Add(new StringContent(value), name, filename, contentType);
}

public void Add(decimal content, string name, string filename = default, string contentType = default)
{
    Argument.AssertNotNull(content, nameof(content));
    Argument.AssertNotNullOrEmpty(name, nameof(name));

    string value = content.ToString("G", CultureInfo.InvariantCulture);
    Add(new StringContent(value), name, filename, contentType);
}

public void Add(bool content, string name, string filename = default, string contentType = default)
{
    Argument.AssertNotNull(content, nameof(content));
    Argument.AssertNotNullOrEmpty(name, nameof(name));

    string value = content ? "true" : "false";
    Add(new StringContent(value), name, filename, contentType);
}

public void Add(Stream content, string name, string filename = default, string contentType = default)
{
    Argument.AssertNotNull(content, nameof(content));
    Argument.AssertNotNullOrEmpty(name, nameof(name));

    Add(new StreamContent(content), name, filename, contentType);
}

public void Add(byte[] content, string name, string filename = default, string contentType = default)
{
    Argument.AssertNotNull(content, nameof(content));
    Argument.AssertNotNullOrEmpty(name, nameof(name));

    Add(new ByteArrayContent(content), name, filename, contentType);
}

public void Add(BinaryData content, string name, string filename = default, string contentType = default)
{
    Argument.AssertNotNull(content, nameof(content));
    Argument.AssertNotNullOrEmpty(name, nameof(name));

    Add(new ByteArrayContent(content.ToArray()), name, filename, contentType);
}

private void Add(HttpContent content, string name, string filename, string contentType)
{
    if (contentType != null)
    {
        Argument.AssertNotNullOrEmpty(contentType, nameof(contentType));
        AddContentTypeHeader(content, contentType);
    }
    if (filename != null)
    {
        Argument.AssertNotNullOrEmpty(filename, nameof(filename));
        _multipartContent.Add(content, name, filename);
    }
    else
    {
        _multipartContent.Add(content, name);
    }
}

public static void AddContentTypeHeader(HttpContent content, string contentType)
{
    MediaTypeHeaderValue header = new MediaTypeHeaderValue(contentType);
    content.Headers.ContentType = header;
}

public override bool TryComputeLength(out long length)
{
    if (_multipartContent.Headers.ContentLength is long contentLength)
    {
        length = contentLength;
        return true;
    }
    length = 0;
    return false;
}`;

  return (
    <SourceFile
      path="src/Generated/Internal/MultiPartFormDataBinaryContent.cs"
      using={[
        "System",
        "System.ClientModel",
        "System.Globalization",
        "System.IO",
        "System.Net.Http",
        "System.Net.Http.Headers",
        "System.Threading",
        "System.Threading.Tasks",
      ]}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration
          internal
          partial
          name="MultiPartFormDataBinaryContent"
          baseType="BinaryContent"
        >
          {classBody}
          {"\n\n"}
          {writeToMethod}
          {"\n\n"}
          {writeToAsyncMethod}
          {"\n\n"}
          {`public override void Dispose()\n{\n    _multipartContent.Dispose();\n}`}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
