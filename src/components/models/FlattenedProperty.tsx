/**
 * Flattened property component for ARM model generation.
 *
 * Renders computed C# properties that delegate to an internal backing
 * property. These are generated when a model property has `flatten: true`
 * (from `@flattenProperty`), promoting the nested model's properties
 * to the parent level.
 *
 * Two patterns are supported:
 *
 * 1. **Regular flatten** (multi-property inner model): getter checks for null
 *    and delegates, setter lazy-initializes the backing property.
 *    ```csharp
 *    public bool? Disabled
 *    {
 *        get { return Properties is null ? default : Properties.Disabled; }
 *        set { if (Properties is null) Properties = new T(); Properties.Disabled = value; }
 *    }
 *    ```
 *
 * 2. **Safe flatten** (single-property inner model): setter creates a new
 *    instance of the inner model.
 *    ```csharp
 *    public string InnerSelectionType
 *    {
 *        get { return Inner is null ? default : Inner.SelectionType; }
 *        set { Inner = new SafeFlattenInner(value); }
 *    }
 *    ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import type { Children } from "@alloy-js/core";
import { code } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import type { FlattenedPropertyInfo } from "../../utils/flatten.js";
import {
  isPropertyNullable,
  unwrapNullableType,
} from "../../utils/nullable.js";
import {
  isPropertyReadOnly,
  resolvePropertyName,
} from "../../utils/property.js";
import { efCsharpRefkey } from "../../utils/refkey.js";
import { renderCollectionPropertyType } from "../../utils/collection-type-expression.js";
import { isCollectionType } from "../../utils/nullable.js";
import { ensureTrailingPeriod } from "../../utils/doc.js";

/**
 * Props for the {@link FlattenedProperty} component.
 */
export interface FlattenedPropertyProps {
  /** Metadata about the flattened property to render. */
  info: FlattenedPropertyInfo;
  /** The raw TCGC name of the enclosing model, used for name collision detection. */
  modelName: string;
}

/**
 * Renders a computed C# property for a flattened (promoted) model property.
 *
 * The property delegates getter/setter to the internal backing property,
 * using null-safe access patterns. The generated C# matches the legacy
 * emitter's FlattenPropertyVisitor output.
 *
 * @example Generated output for a regular flatten:
 * ```csharp
 * /// <summary> The description. </summary>
 * public bool? Disabled
 * {
 *     get
 *     {
 *         return Properties is null ? default : Properties.Disabled;
 *     }
 *     set
 *     {
 *         if (Properties is null)
 *         {
 *             Properties = new MultiFlattenProperties();
 *         }
 *         Properties.Disabled = value.Value;
 *     }
 * }
 * ```
 */
export function FlattenedProperty(props: FlattenedPropertyProps): Children {
  const { info, modelName } = props;
  const { innerProperty, backingProperty, namePrefix, isSafeFlatten } = info;
  const namePolicy = useCSharpNamePolicy();

  // Compute the C# property name for the promoted property.
  // For safe-flatten: prefix + inner property name (e.g., "Inner" + "SelectionType")
  // For regular flatten: just the inner property name
  const rawName = namePrefix
    ? namePrefix + upperFirst(innerProperty.name)
    : innerProperty.name;
  const effectiveName = resolvePropertyName(rawName, modelName);
  const propName = namePolicy.getName(effectiveName, "class-property");

  // Backing property C# name
  const backingName = namePolicy.getName(
    resolvePropertyName(backingProperty.name, modelName),
    "class-property",
  );

  // Inner property C# name on the nested model
  const innerPropName = namePolicy.getName(
    resolvePropertyName(
      innerProperty.name,
      backingProperty.type.kind === "model"
        ? (backingProperty.type as SdkModelType).name
        : "",
    ),
    "class-property",
  );

  // Compute the C# type for this property
  const nullable = isPropertyNullable(innerProperty);
  const unwrappedType = unwrapNullableType(innerProperty.type);
  const isCollection = isCollectionType(innerProperty.type);
  const readOnly = isPropertyReadOnly(innerProperty);

  const typeExpr: Children = isCollection ? (
    renderCollectionPropertyType(unwrappedType, readOnly)
  ) : (
    <TypeExpression type={unwrappedType.__raw!} />
  );

  const typeWithNullable: Children = nullable ? <>{typeExpr}?</> : typeExpr;

  // Doc comment
  const doc = innerProperty.doc ?? innerProperty.summary;
  const formattedDoc = doc
    ? `/// <summary> ${ensureTrailingPeriod(doc)} </summary>`
    : `/// <summary> Gets or sets the ${propName}. </summary>`;

  // Build the backing model type name for the setter's lazy initialization
  const backingModelType =
    backingProperty.type.kind === "model"
      ? (backingProperty.type as SdkModelType)
      : undefined;
  const backingModelRefkey = backingModelType?.__raw
    ? efCsharpRefkey(backingModelType.__raw)
    : undefined;

  // Determine if the inner property needs .Value accessor for value types
  // When the property is nullable (bool?, int?, etc.) and the setter assigns
  // to a non-nullable backing property, we need .Value
  const innerIsNullable = isPropertyNullable(innerProperty);
  const needsValueAccessor =
    innerIsNullable && !isCollection && !isReferenceKind(unwrappedType.kind);

  if (isSafeFlatten) {
    return renderSafeFlattenProperty({
      propName,
      backingName,
      innerPropName,
      typeWithNullable,
      formattedDoc,
      backingModelRefkey,
    });
  }

  return renderRegularFlattenProperty({
    propName,
    backingName,
    innerPropName,
    typeWithNullable,
    formattedDoc,
    backingModelRefkey,
    needsValueAccessor,
    isCollection,
  });
}

/**
 * Renders a safe-flatten property (inner model has exactly one public property).
 *
 * The setter creates a new instance: `Inner = new SafeFlattenInner(value)`.
 * This is the simplest flatten pattern.
 */
function renderSafeFlattenProperty(opts: {
  propName: string;
  backingName: string;
  innerPropName: string;
  typeWithNullable: Children;
  formattedDoc: string;
  backingModelRefkey: Children | undefined;
}): Children {
  const {
    propName,
    backingName,
    innerPropName,
    typeWithNullable,
    formattedDoc,
    backingModelRefkey,
  } = opts;

  // Build lines explicitly to maintain correct indentation.
  // Use plain strings for structure and `code` only for refkey interpolation.
  return (
    <>
      {formattedDoc}
      {"\n"}
      {code`public ${typeWithNullable} ${propName}`}
      {"\n"}
      {"{\n"}
      {"    get\n"}
      {"    {\n"}
      {"        return "}
      {backingName}
      {" is null ? default : "}
      {backingName}
      {"."}
      {innerPropName}
      {";\n"}
      {"    }\n"}
      {"    set\n"}
      {"    {\n"}
      {"        "}
      {backingName}
      {" = new "}
      {backingModelRefkey}
      {"(value);\n"}
      {"    }\n"}
      {"}"}
    </>
  );
}

/**
 * Renders a regular flatten property (inner model has multiple public properties).
 *
 * The setter lazy-initializes the backing property and then assigns the inner
 * property value.
 */
function renderRegularFlattenProperty(opts: {
  propName: string;
  backingName: string;
  innerPropName: string;
  typeWithNullable: Children;
  formattedDoc: string;
  backingModelRefkey: Children | undefined;
  needsValueAccessor: boolean;
  isCollection: boolean;
}): Children {
  const {
    propName,
    backingName,
    innerPropName,
    typeWithNullable,
    formattedDoc,
    backingModelRefkey,
    needsValueAccessor,
    isCollection,
  } = opts;

  const getterBlock = (
    <>
      {"    get\n"}
      {"    {\n"}
      {"        return "}
      {backingName}
      {" is null ? default : "}
      {backingName}
      {"."}
      {innerPropName}
      {";\n"}
      {"    }"}
    </>
  );

  // For collection properties, render get-only (no setter)
  if (isCollection) {
    return (
      <>
        {formattedDoc}
        {"\n"}
        {code`public ${typeWithNullable} ${propName}`}
        {"\n"}
        {"{\n"}
        {getterBlock}
        {"\n"}
        {"}"}
      </>
    );
  }

  const valueExpr = needsValueAccessor ? "value.Value" : "value";

  return (
    <>
      {formattedDoc}
      {"\n"}
      {code`public ${typeWithNullable} ${propName}`}
      {"\n"}
      {"{\n"}
      {getterBlock}
      {"\n"}
      {"    set\n"}
      {"    {\n"}
      {"        if ("}
      {backingName}
      {" is null)\n"}
      {"        {\n"}
      {"            "}
      {backingName}
      {" = new "}
      {backingModelRefkey}
      {"();\n"}
      {"        }\n"}
      {"        "}
      {backingName}
      {"."}
      {innerPropName}
      {" = "}
      {valueExpr}
      {";\n"}
      {"    }\n"}
      {"}"}
    </>
  );
}

/**
 * Capitalizes the first character of a string.
 *
 * Used to build composed property names for safe-flatten
 * (e.g., "inner" + "SelectionType" → "InnerSelectionType").
 */
function upperFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Checks if a TCGC type kind maps to a C# reference type.
 * Reference types don't need .Value accessor when nullable.
 */
function isReferenceKind(kind: string): boolean {
  return ["string", "model", "bytes", "url", "unknown", "union"].includes(kind);
}
