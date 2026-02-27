import { Output, render } from "@alloy-js/core";
import { ClassDeclaration, Property, SourceFile } from "@alloy-js/csharp";
import { describe, expect, it } from "vitest";
import {
  SystemClientModel,
  SystemClientModelPrimitives,
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
  });
});
