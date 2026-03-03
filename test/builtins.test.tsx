import { Output, render } from "@alloy-js/core";
import { ClassDeclaration, Property, SourceFile } from "@alloy-js/csharp";
import { describe, expect, it } from "vitest";
import {
  SystemClientModel,
  SystemClientModelPrimitives,
  SystemDiagnosticsCodeAnalysis,
} from "../src/builtins/index.js";

/**
 * Tests for the System.ClientModel Alloy library declarations.
 *
 * These tests verify that the builtin library declarations are structurally
 * correct and that referencing them in Alloy JSX components produces the
 * correct C# `using` directives. This is critical because:
 *
 * 1. Missing types would cause Unresolved Symbol errors in generated code.
 * 2. Missing members would prevent generated code from calling SCM APIs.
 * 3. Incorrect namespace registration would produce wrong `using` statements.
 */
describe("System.ClientModel builtins", () => {
  /**
   * Verifies that all core types in the System.ClientModel namespace are
   * declared and accessible as library symbols. These types are the public
   * API surface of the System.ClientModel NuGet package.
   */
  describe("SystemClientModel library", () => {
    it("declares ClientResult with expected members", () => {
      expect(SystemClientModel.ClientResult).toBeDefined();
      expect(SystemClientModel.ClientResult.FromValue).toBeDefined();
      expect(SystemClientModel.ClientResult.FromResponse).toBeDefined();
    });

    it("declares BinaryContent with expected members", () => {
      expect(SystemClientModel.BinaryContent).toBeDefined();
      expect(SystemClientModel.BinaryContent.Create).toBeDefined();
    });

    /**
     * Verifies that ClientResultException is declared with its Status property.
     * This type is referenced in generated XML documentation comments on protocol
     * methods (<exception cref="ClientResultException">) and in error handling code.
     */
    it("declares ClientResultException with expected members", () => {
      expect(SystemClientModel.ClientResultException).toBeDefined();
      expect(SystemClientModel.ClientResultException.Status).toBeDefined();
    });

    /**
     * Verifies that ApiKeyCredential is declared as a library symbol.
     * This type is used as a constructor parameter and private field type
     * in generated client classes for API key authentication.
     */
    it("declares ApiKeyCredential", () => {
      expect(SystemClientModel.ApiKeyCredential).toBeDefined();
    });

    /**
     * Verifies that CollectionResult is declared with its GetContinuationToken method.
     * Generated paging collection classes extend CollectionResult (sync, non-generic)
     * or CollectionResult<T> (sync, generic) and override GetContinuationToken to
     * extract pagination tokens from service responses.
     */
    it("declares CollectionResult with expected members", () => {
      expect(SystemClientModel.CollectionResult).toBeDefined();
      expect(
        SystemClientModel.CollectionResult.GetContinuationToken,
      ).toBeDefined();
    });

    /**
     * Verifies that AsyncCollectionResult is declared with its GetContinuationToken method.
     * Generated paging collection classes extend AsyncCollectionResult (async, non-generic)
     * or AsyncCollectionResult<T> (async, generic) and override GetContinuationToken to
     * extract pagination tokens from service responses.
     */
    it("declares AsyncCollectionResult with expected members", () => {
      expect(SystemClientModel.AsyncCollectionResult).toBeDefined();
      expect(
        SystemClientModel.AsyncCollectionResult.GetContinuationToken,
      ).toBeDefined();
    });

    /**
     * Verifies that ContinuationToken is declared with its static FromBytes factory.
     * Generated GetContinuationToken methods call ContinuationToken.FromBytes(BinaryData)
     * to create tokens from next-link URLs or token strings extracted from responses.
     */
    it("declares ContinuationToken with expected members", () => {
      expect(SystemClientModel.ContinuationToken).toBeDefined();
      expect(SystemClientModel.ContinuationToken.FromBytes).toBeDefined();
    });
  });

  /**
   * Verifies that all pipeline and transport types in the
   * System.ClientModel.Primitives namespace are declared and accessible.
   * These types are the internal machinery of the HTTP client pipeline.
   */
  describe("SystemClientModelPrimitives library", () => {
    it("declares ClientPipeline with expected members", () => {
      expect(SystemClientModelPrimitives.ClientPipeline).toBeDefined();
      expect(SystemClientModelPrimitives.ClientPipeline.Create).toBeDefined();
      expect(
        SystemClientModelPrimitives.ClientPipeline.CreateMessage,
      ).toBeDefined();
      expect(SystemClientModelPrimitives.ClientPipeline.Send).toBeDefined();
      expect(
        SystemClientModelPrimitives.ClientPipeline.SendAsync,
      ).toBeDefined();
    });

    it("declares PipelineMessage with expected members", () => {
      expect(SystemClientModelPrimitives.PipelineMessage).toBeDefined();
      expect(SystemClientModelPrimitives.PipelineMessage.Request).toBeDefined();
      expect(
        SystemClientModelPrimitives.PipelineMessage.Response,
      ).toBeDefined();
      expect(
        SystemClientModelPrimitives.PipelineMessage.BufferResponse,
      ).toBeDefined();
      expect(
        SystemClientModelPrimitives.PipelineMessage.ExtractResponse,
      ).toBeDefined();
      expect(SystemClientModelPrimitives.PipelineMessage.Apply).toBeDefined();
    });

    it("declares PipelineRequest with expected members", () => {
      expect(SystemClientModelPrimitives.PipelineRequest).toBeDefined();
      expect(SystemClientModelPrimitives.PipelineRequest.Headers).toBeDefined();
      expect(SystemClientModelPrimitives.PipelineRequest.Content).toBeDefined();
      expect(SystemClientModelPrimitives.PipelineRequest.Uri).toBeDefined();
    });

    it("declares PipelineResponse with expected members", () => {
      expect(SystemClientModelPrimitives.PipelineResponse).toBeDefined();
      expect(SystemClientModelPrimitives.PipelineResponse.Status).toBeDefined();
      expect(
        SystemClientModelPrimitives.PipelineResponse.Content,
      ).toBeDefined();
      expect(
        SystemClientModelPrimitives.PipelineResponse.ContentStream,
      ).toBeDefined();
      expect(
        SystemClientModelPrimitives.PipelineResponse.Headers,
      ).toBeDefined();
      expect(
        SystemClientModelPrimitives.PipelineResponse.IsError,
      ).toBeDefined();
    });

    it("declares PipelinePolicy", () => {
      expect(SystemClientModelPrimitives.PipelinePolicy).toBeDefined();
    });

    it("declares PipelineMessageClassifier with expected members", () => {
      expect(
        SystemClientModelPrimitives.PipelineMessageClassifier,
      ).toBeDefined();
      expect(
        SystemClientModelPrimitives.PipelineMessageClassifier.Create,
      ).toBeDefined();
    });

    /**
     * Verifies that ClientPipelineOptions is declared as a library symbol.
     * Generated client options classes (e.g., {ServiceName}ClientOptions)
     * inherit from this type to provide service-specific configuration.
     */
    it("declares ClientPipelineOptions", () => {
      expect(SystemClientModelPrimitives.ClientPipelineOptions).toBeDefined();
    });

    /**
     * Verifies that RequestOptions is declared with ErrorOptions and
     * CancellationToken members. This type appears as an optional parameter
     * in every generated protocol method signature.
     */
    it("declares RequestOptions with expected members", () => {
      expect(SystemClientModelPrimitives.RequestOptions).toBeDefined();
      expect(
        SystemClientModelPrimitives.RequestOptions.ErrorOptions,
      ).toBeDefined();
      expect(
        SystemClientModelPrimitives.RequestOptions.CancellationToken,
      ).toBeDefined();
    });

    /**
     * Verifies that ApiKeyAuthenticationPolicy is declared with its
     * CreateHeaderApiKeyPolicy static factory method. This method is called
     * in generated client constructors to set up API key authentication
     * in the HTTP pipeline.
     */
    it("declares ApiKeyAuthenticationPolicy with expected members", () => {
      expect(
        SystemClientModelPrimitives.ApiKeyAuthenticationPolicy,
      ).toBeDefined();
      expect(
        SystemClientModelPrimitives.ApiKeyAuthenticationPolicy
          .CreateHeaderApiKeyPolicy,
      ).toBeDefined();
    });

    /**
     * Verifies that ClientErrorBehaviors is declared as an enum with the
     * NoThrow member. This enum is used in pipeline error handling to
     * suppress automatic exception throwing on non-success responses.
     */
    it("declares ClientErrorBehaviors with expected members", () => {
      expect(SystemClientModelPrimitives.ClientErrorBehaviors).toBeDefined();
      expect(
        SystemClientModelPrimitives.ClientErrorBehaviors.NoThrow,
      ).toBeDefined();
    });

    /**
     * Verifies that ModelReaderWriterOptions is declared with its Format
     * property. This type is passed to every IJsonModel and IPersistableModel
     * method to specify the wire format (e.g., "J" for JSON).
     */
    it("declares ModelReaderWriterOptions with expected members", () => {
      expect(
        SystemClientModelPrimitives.ModelReaderWriterOptions,
      ).toBeDefined();
      expect(
        SystemClientModelPrimitives.ModelReaderWriterOptions.Format,
      ).toBeDefined();
    });

    /**
     * Verifies that ModelReaderWriterContext is declared as a library symbol.
     * Generated libraries produce a context class that inherits from this type
     * and registers all serializable models via attributes.
     */
    it("declares ModelReaderWriterContext", () => {
      expect(
        SystemClientModelPrimitives.ModelReaderWriterContext,
      ).toBeDefined();
    });

    /**
     * Verifies that ModelReaderWriter is declared with its static Write method.
     * Generated serialization code calls ModelReaderWriter.Write(this, options, context)
     * in PersistableModelWriteCore implementations.
     */
    it("declares ModelReaderWriter with expected members", () => {
      expect(SystemClientModelPrimitives.ModelReaderWriter).toBeDefined();
      expect(SystemClientModelPrimitives.ModelReaderWriter.Write).toBeDefined();
    });

    /**
     * Verifies that IJsonModel is declared with Write and Create methods.
     * Generated .Serialization.cs classes implement IJsonModel<T> to provide
     * Utf8JsonWriter-based serialization and Utf8JsonReader-based deserialization.
     */
    it("declares IJsonModel with expected members", () => {
      expect(SystemClientModelPrimitives.IJsonModel).toBeDefined();
      expect(SystemClientModelPrimitives.IJsonModel.Write).toBeDefined();
      expect(SystemClientModelPrimitives.IJsonModel.Create).toBeDefined();
    });

    /**
     * Verifies that IPersistableModel is declared with Write, Create, and
     * GetFormatFromOptions methods. Generated serialization classes implement
     * IPersistableModel<T> for format-agnostic binary serialization support.
     */
    it("declares IPersistableModel with expected members", () => {
      expect(SystemClientModelPrimitives.IPersistableModel).toBeDefined();
      expect(SystemClientModelPrimitives.IPersistableModel.Write).toBeDefined();
      expect(
        SystemClientModelPrimitives.IPersistableModel.Create,
      ).toBeDefined();
      expect(
        SystemClientModelPrimitives.IPersistableModel.GetFormatFromOptions,
      ).toBeDefined();
    });

    /**
     * Verifies that PersistableModelProxyAttribute is declared. This attribute
     * is applied to abstract models with discriminators to specify the unknown
     * variant type for fallback deserialization.
     */
    it("declares PersistableModelProxyAttribute", () => {
      expect(
        SystemClientModelPrimitives.PersistableModelProxyAttribute,
      ).toBeDefined();
    });

    /**
     * Verifies that ModelReaderWriterBuildableAttribute is declared. This
     * attribute registers model types as buildable in the ModelReaderWriterContext,
     * enabling the serialization framework to discover all serializable types.
     */
    it("declares ModelReaderWriterBuildableAttribute", () => {
      expect(
        SystemClientModelPrimitives.ModelReaderWriterBuildableAttribute,
      ).toBeDefined();
    });

    /**
     * Verifies that JsonPatch is declared with all its methods.
     * JsonPatch tracks JSON Merge Patch (RFC 7386) changes on dynamic models.
     * It is stored as a private field on models with the JsonMergePatch usage flag
     * and used during serialization to write only changed properties.
     * Missing any of these methods would break merge-patch serialization in phase 7.
     */
    it("declares JsonPatch with expected members", () => {
      expect(SystemClientModelPrimitives.JsonPatch).toBeDefined();
      expect(SystemClientModelPrimitives.JsonPatch.TryGetJson).toBeDefined();
      expect(SystemClientModelPrimitives.JsonPatch.GetJson).toBeDefined();
      expect(
        SystemClientModelPrimitives.JsonPatch.TryGetEncodedValue,
      ).toBeDefined();
      expect(SystemClientModelPrimitives.JsonPatch.Contains).toBeDefined();
      expect(SystemClientModelPrimitives.JsonPatch.IsRemoved).toBeDefined();
      expect(SystemClientModelPrimitives.JsonPatch.Set).toBeDefined();
      expect(
        SystemClientModelPrimitives.JsonPatch.SetPropagators,
      ).toBeDefined();
      expect(SystemClientModelPrimitives.JsonPatch.WriteTo).toBeDefined();
      expect(SystemClientModelPrimitives.JsonPatch.GetRemainder).toBeDefined();
      expect(
        SystemClientModelPrimitives.JsonPatch.GetFirstPropertyName,
      ).toBeDefined();
    });
  });

  /**
   * Verifies that diagnostic attribute types in the
   * System.Diagnostics.CodeAnalysis namespace are declared and accessible.
   * These attributes are applied to experimental merge-patch fields and properties.
   */
  describe("SystemDiagnosticsCodeAnalysis library", () => {
    /**
     * Verifies that ExperimentalAttribute is declared. This attribute is applied
     * to JsonPatch fields and properties on dynamic models with diagnostic ID
     * "SCME0001" to indicate the API is under evaluation. Without this builtin,
     * generated [Experimental("SCME0001")] attributes would produce unresolved
     * symbol errors.
     */
    it("declares ExperimentalAttribute", () => {
      expect(
        SystemDiagnosticsCodeAnalysis.ExperimentalAttribute,
      ).toBeDefined();
    });
  });

  /**
   * Verifies that referencing SystemClientModel types in a C# SourceFile
   * produces the correct `using System.ClientModel;` directive. This is
   * the primary integration test — it exercises the full Alloy binder
   * and namespace resolution pipeline.
   */
  describe("using statement generation", () => {
    it("produces 'using System.ClientModel;' when referencing core types", () => {
      const result = render(
        <Output>
          <SourceFile path="Test.cs">
            <ClassDeclaration name="TestClass">
              <Property
                name="Result"
                type={SystemClientModel.ClientResult}
                get
                set
              />
            </ClassDeclaration>
          </SourceFile>
        </Output>,
      );

      const content = (result.contents[0] as { contents: string }).contents;
      expect(content).toContain("using System.ClientModel;");
      expect(content).toContain("ClientResult");
    });

    it("produces 'using System.ClientModel.Primitives;' when referencing pipeline types", () => {
      const result = render(
        <Output>
          <SourceFile path="Test.cs">
            <ClassDeclaration name="TestClass">
              <Property
                name="Pipeline"
                type={SystemClientModelPrimitives.ClientPipeline}
                get
                set
              />
            </ClassDeclaration>
          </SourceFile>
        </Output>,
      );

      const content = (result.contents[0] as { contents: string }).contents;
      expect(content).toContain("using System.ClientModel.Primitives;");
      expect(content).toContain("ClientPipeline");
    });

    it("produces both using statements when referencing types from both namespaces", () => {
      const result = render(
        <Output>
          <SourceFile path="Test.cs">
            <ClassDeclaration name="TestClass">
              <Property
                name="Result"
                type={SystemClientModel.ClientResult}
                get
                set
              />
              <Property
                name="Pipeline"
                type={SystemClientModelPrimitives.ClientPipeline}
                get
                set
              />
            </ClassDeclaration>
          </SourceFile>
        </Output>,
      );

      const content = (result.contents[0] as { contents: string }).contents;
      expect(content).toContain("using System.ClientModel;");
      expect(content).toContain("using System.ClientModel.Primitives;");
    });

    /**
     * Verifies that referencing auth types (ApiKeyCredential from System.ClientModel
     * and ApiKeyAuthenticationPolicy from System.ClientModel.Primitives) produces
     * the correct using directives. This is important because these types live in
     * different namespaces and both are referenced in generated client constructors.
     */
    it("produces correct using statements for auth types", () => {
      const result = render(
        <Output>
          <SourceFile path="Test.cs">
            <ClassDeclaration name="TestClient">
              <Property
                name="Credential"
                type={SystemClientModel.ApiKeyCredential}
                get
                set
              />
              <Property
                name="Options"
                type={SystemClientModelPrimitives.RequestOptions}
                get
                set
              />
            </ClassDeclaration>
          </SourceFile>
        </Output>,
      );

      const content = (result.contents[0] as { contents: string }).contents;
      expect(content).toContain("using System.ClientModel;");
      expect(content).toContain("using System.ClientModel.Primitives;");
      expect(content).toContain("ApiKeyCredential");
      expect(content).toContain("RequestOptions");
    });

    /**
     * Verifies that referencing serialization types (ModelReaderWriterOptions,
     * IJsonModel, IPersistableModel) produces the correct using directive for
     * System.ClientModel.Primitives. These types are used in generated
     * .Serialization.cs files and ModelReaderWriterContext classes.
     */
    it("produces correct using statements for serialization types", () => {
      const result = render(
        <Output>
          <SourceFile path="Test.Serialization.cs">
            <ClassDeclaration name="TestModel">
              <Property
                name="Options"
                type={SystemClientModelPrimitives.ModelReaderWriterOptions}
                get
                set
              />
              <Property
                name="Context"
                type={SystemClientModelPrimitives.ModelReaderWriterContext}
                get
                set
              />
            </ClassDeclaration>
          </SourceFile>
        </Output>,
      );

      const content = (result.contents[0] as { contents: string }).contents;
      expect(content).toContain("using System.ClientModel.Primitives;");
      expect(content).toContain("ModelReaderWriterOptions");
      expect(content).toContain("ModelReaderWriterContext");
    });

    /**
     * Verifies that referencing paging types (CollectionResult, AsyncCollectionResult,
     * ContinuationToken) produces the correct `using System.ClientModel;` directive.
     * These types are used in generated collection result classes as base types
     * and in GetContinuationToken method return types.
     */
    it("produces 'using System.ClientModel;' when referencing paging types", () => {
      const result = render(
        <Output>
          <SourceFile path="TestCollectionResult.cs">
            <ClassDeclaration name="TestCollectionResult">
              <Property
                name="SyncResult"
                type={SystemClientModel.CollectionResult}
                get
                set
              />
              <Property
                name="AsyncResult"
                type={SystemClientModel.AsyncCollectionResult}
                get
                set
              />
              <Property
                name="Token"
                type={SystemClientModel.ContinuationToken}
                get
                set
              />
            </ClassDeclaration>
          </SourceFile>
        </Output>,
      );

      const content = (result.contents[0] as { contents: string }).contents;
      expect(content).toContain("using System.ClientModel;");
      expect(content).toContain("CollectionResult");
      expect(content).toContain("AsyncCollectionResult");
      expect(content).toContain("ContinuationToken");
    });

    /**
     * Verifies that referencing JsonPatch produces the correct
     * `using System.ClientModel.Primitives;` directive. JsonPatch is used
     * as a private field type on dynamic models for merge-patch support.
     * This test ensures the namespace resolution works for this new type.
     */
    it("produces 'using System.ClientModel.Primitives;' when referencing JsonPatch", () => {
      const result = render(
        <Output>
          <SourceFile path="TestDynamicModel.cs">
            <ClassDeclaration name="TestDynamicModel">
              <Property
                name="Patch"
                type={SystemClientModelPrimitives.JsonPatch}
                get
                set
              />
            </ClassDeclaration>
          </SourceFile>
        </Output>,
      );

      const content = (result.contents[0] as { contents: string }).contents;
      expect(content).toContain("using System.ClientModel.Primitives;");
      expect(content).toContain("JsonPatch");
    });

    /**
     * Verifies that referencing ExperimentalAttribute produces the correct
     * `using System.Diagnostics.CodeAnalysis;` directive. This attribute is
     * applied to JsonPatch fields/properties with diagnostic ID "SCME0001".
     * Without correct namespace resolution, the generated code would fail to compile.
     */
    it("produces 'using System.Diagnostics.CodeAnalysis;' when referencing ExperimentalAttribute", () => {
      const result = render(
        <Output>
          <SourceFile path="TestExperimental.cs">
            <ClassDeclaration name="TestExperimental">
              <Property
                name="Attr"
                type={SystemDiagnosticsCodeAnalysis.ExperimentalAttribute}
                get
                set
              />
            </ClassDeclaration>
          </SourceFile>
        </Output>,
      );

      const content = (result.contents[0] as { contents: string }).contents;
      expect(content).toContain("using System.Diagnostics.CodeAnalysis;");
      expect(content).toContain("ExperimentalAttribute");
    });
  });
});
