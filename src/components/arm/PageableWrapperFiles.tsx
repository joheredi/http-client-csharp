/**
 * Generates the `AsyncPageableWrapper.cs` and `PageableWrapper.cs` infrastructure
 * files for ARM management-plane projects.
 *
 * These wrapper classes convert `AsyncPageable<TModel>` / `Pageable<TModel>` to
 * `AsyncPageable<TResource>` / `Pageable<TResource>` using a converter function.
 * ARM collection classes use them to wrap collection result pagination classes
 * into the resource-typed paging interfaces.
 *
 * Generated files are placed in `src/Generated/Internal/`.
 *
 * @module
 */

import { Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
import { useEmitterContext } from "../../contexts/emitter-context.js";
import { getLicenseHeader } from "../../utils/header.js";

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Generates both AsyncPageableWrapper and PageableWrapper infrastructure files.
 * These are only needed for management-plane (ARM) projects.
 */
export function PageableWrapperFiles() {
  const ctx = useEmitterContext();
  const { options, packageName } = ctx;
  const header = getLicenseHeader(options);

  // Use the root namespace from the REST client
  const ns = packageName;

  return (
    <>
      <AsyncPageableWrapperFile header={header} ns={ns} />
      <PageableWrapperFile header={header} ns={ns} />
    </>
  );
}

// ─── AsyncPageableWrapper File ───────────────────────────────────────────────

interface WrapperFileProps {
  header: Children;
  ns: string;
}

/**
 * Generates `AsyncPageableWrapper<T, U>` which wraps an `AsyncPageable<T>`
 * and converts items from type T to type U during async iteration.
 */
function AsyncPageableWrapperFile(props: WrapperFileProps) {
  const { header, ns } = props;

  return (
    <SourceFile
      path="src/Generated/Internal/AsyncPageableWrapper.cs"
      using={[
        "System",
        "System.Collections.Generic",
        "System.Threading.Tasks",
        "Azure",
      ]}
    >
      {header}
      {"\n\n"}
      <Namespace name={ns}>
        {code`internal partial class AsyncPageableWrapper<T, U> : AsyncPageable<U>
{
    /// <summary> The source async pageable value of type AsyncPageable&lt;T&gt;. </summary>
    private AsyncPageable<T> _source;
    /// <summary> The converter function from T to U. </summary>
    private Func<T, U> _converter;

    /// <summary> Initializes a new instance of the AsyncPageableWrapper class. </summary>
    /// <param name="source"> The source async pageable value of type AsyncPageable&lt;T&gt;. </param>
    /// <param name="converter"> The converter function from T to U. </param>
    public AsyncPageableWrapper(AsyncPageable<T> source, Func<T, U> converter)
    {
        _source = source;
        _converter = converter;
    }

    /// <summary> Converts the pages from AsyncPageable to Page. </summary>
    /// <param name="continuationToken"> A continuation token from a previous response. </param>
    /// <param name="pageSizeHint"> An optional hint to specify the desired size of each page. </param>
    /// <returns> An enumerable of pages containing converted items of type U. </returns>
    public override async IAsyncEnumerable<Page<U>> AsPages(string continuationToken, int? pageSizeHint)
    {
        await foreach (Page<T> page in _source.AsPages(continuationToken, pageSizeHint).ConfigureAwait(false))
        {
            List<U> convertedItems = new List<U>();
            foreach (T item in page.Values)
            {
                convertedItems.Add(_converter.Invoke(item));
            }
            yield return Page<U>.FromValues(convertedItems, page.ContinuationToken, page.GetRawResponse());
        }
    }
}`}
      </Namespace>
    </SourceFile>
  );
}

// ─── PageableWrapper File ────────────────────────────────────────────────────

/**
 * Generates `PageableWrapper<T, U>` which wraps a `Pageable<T>`
 * and converts items from type T to type U during sync iteration.
 */
function PageableWrapperFile(props: WrapperFileProps) {
  const { header, ns } = props;

  return (
    <SourceFile
      path="src/Generated/Internal/PageableWrapper.cs"
      using={["System", "System.Collections.Generic", "Azure"]}
    >
      {header}
      {"\n\n"}
      <Namespace name={ns}>
        {code`internal partial class PageableWrapper<T, U> : Pageable<U>
{
    /// <summary> The source pageable value of type Pageable&lt;T&gt;. </summary>
    private Pageable<T> _source;
    /// <summary> The converter function from T to U. </summary>
    private Func<T, U> _converter;

    /// <summary> Initializes a new instance of the PageableWrapper class. </summary>
    /// <param name="source"> The source pageable value of type Pageable&lt;T&gt;. </param>
    /// <param name="converter"> The converter function from T to U. </param>
    public PageableWrapper(Pageable<T> source, Func<T, U> converter)
    {
        _source = source;
        _converter = converter;
    }

    /// <summary> Converts the pages from Pageable to Page. </summary>
    /// <param name="continuationToken"> A continuation token from a previous response. </param>
    /// <param name="pageSizeHint"> An optional hint to specify the desired size of each page. </param>
    /// <returns> An enumerable of pages containing converted items of type U. </returns>
    public override IEnumerable<Page<U>> AsPages(string continuationToken, int? pageSizeHint)
    {
        foreach (Page<T> page in _source.AsPages(continuationToken, pageSizeHint))
        {
            List<U> convertedItems = new List<U>();
            foreach (T item in page.Values)
            {
                convertedItems.Add(_converter.Invoke(item));
            }
            yield return Page<U>.FromValues(convertedItems, page.ContinuationToken, page.GetRawResponse());
        }
    }
}`}
      </Namespace>
    </SourceFile>
  );
}
