/**
 * Converts K&R-style namespace braces to Allman style in C# source files.
 *
 * The Alloy C# `Namespace` component renders the opening brace on the
 * same line as the namespace declaration (K&R style):
 *
 * ```csharp
 * namespace SampleTypeSpec {
 *     ...
 * }
 * ```
 *
 * The legacy emitter golden files use Allman style with the opening
 * brace on the next line:
 *
 * ```csharp
 * namespace SampleTypeSpec
 * {
 *     ...
 * }
 * ```
 *
 * This post-processing step converts K&R to Allman for namespace
 * declarations to match the golden file format.
 *
 * @param content - The rendered C# file content to fix.
 * @returns The content with Allman-style namespace braces.
 */
export function fixNamespaceBraceStyle(content: string): string {
  // Match lines like `namespace Foo.Bar {` and convert to
  // `namespace Foo.Bar\n{` preserving leading whitespace.
  // The regex captures:
  //   $1 = leading horizontal whitespace (spaces/tabs only, not newlines)
  //   $2 = `namespace <dotted-name>` (the declaration)
  // and replaces with the declaration on one line, then `{` on the next
  // at the same indentation level. Uses `[ \t]*` instead of `\s*` to
  // avoid capturing newlines (which would cause duplicate blank lines).
  return content.replace(
    /^([ \t]*)(namespace\s+[\w.]+)[ \t]*\{/gm,
    "$1$2\n$1{",
  );
}

/**
 * Walks an output directory tree and fixes namespace brace style in all .cs files.
 *
 * @param dir - The output directory tree from Alloy's `renderAsync`.
 */
export function fixAllNamespaceBraceStyles(
  dir: import("@alloy-js/core").OutputDirectory,
): void {
  for (const item of dir.contents) {
    if ("contents" in item) {
      if (Array.isArray(item.contents)) {
        // Subdirectory — recurse
        fixAllNamespaceBraceStyles(
          item as import("@alloy-js/core").OutputDirectory,
        );
      } else if (
        typeof item.contents === "string" &&
        item.path.endsWith(".cs")
      ) {
        // C# source file — fix namespace brace style
        (item as import("@alloy-js/core").ContentOutputFile).contents =
          fixNamespaceBraceStyle(item.contents);
      }
    }
  }
}
