import { describe, expect, it } from "vitest";
import { ApiTester, HttpTester } from "./test-host.js";

const HttpTesterDisableXmlDocs = ApiTester.emit("http-client-csharp", {
  "disable-xml-docs": true,
}).importLibraries();

const HttpTesterCustomPackage = ApiTester.emit("http-client-csharp", {
  "package-name": "MyCustomName",
}).importLibraries();

describe("ProjectFile", () => {
  it("generates a .csproj with correct structure", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toBeDefined();
    expect(csprojKey).toContain("src/TestService.csproj");

    const csproj = outputs[csprojKey!];
    expect(csproj).toContain('<Project Sdk="Microsoft.NET.Sdk">');
    expect(csproj).toContain("<TargetFrameworks>netstandard2.0;net8.0</TargetFrameworks>");
    expect(csproj).toContain("<LangVersion>latest</LangVersion>");
    expect(csproj).toContain("<Version>1.0.0-beta.1</Version>");
    expect(csproj).toContain('<PackageReference Include="System.ClientModel" Version="1.9.0" />');
  });

  it("includes package metadata from package name", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace MyLibrary;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toContain("src/MyLibrary.csproj");

    const csproj = outputs[csprojKey!];
    expect(csproj).toContain("This is the MyLibrary client library");
    expect(csproj).toContain("SDK Code Generation MyLibrary");
    expect(csproj).toContain("<PackageTags>MyLibrary</PackageTags>");
  });

  it("includes GenerateDocumentationFile by default", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    const csproj = outputs[csprojKey!];
    expect(csproj).toContain("<GenerateDocumentationFile>true</GenerateDocumentationFile>");
  });

  it("omits GenerateDocumentationFile when disable-xml-docs is true", async () => {
    const [{ outputs }] = await HttpTesterDisableXmlDocs.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    const csproj = outputs[csprojKey!];
    expect(csproj).not.toContain("GenerateDocumentationFile");
  });

  it("uses explicit package-name option for csproj filename", async () => {
    const [{ outputs }] = await HttpTesterCustomPackage.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toContain("src/MyCustomName.csproj");

    const csproj = outputs[csprojKey!];
    expect(csproj).toContain("This is the MyCustomName client library");
  });
});

describe("SolutionFile", () => {
  it("generates a .sln file", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const slnKey = Object.keys(outputs).find((k) => k.endsWith(".sln"));
    expect(slnKey).toBeDefined();
    expect(slnKey).toBe("TestService.sln");

    const sln = outputs[slnKey!];
    expect(sln).toContain("Microsoft Visual Studio Solution File, Format Version 12.00");
    expect(sln).toContain("# Visual Studio Version 17");
  });

  it("references the correct .csproj in the .sln", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace MyLibrary;
    `);

    const slnKey = Object.keys(outputs).find((k) => k.endsWith(".sln"));
    const sln = outputs[slnKey!];
    expect(sln).toContain(`"MyLibrary", "src\\MyLibrary.csproj"`);
  });

  it("includes Debug and Release configurations", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const slnKey = Object.keys(outputs).find((k) => k.endsWith(".sln"));
    const sln = outputs[slnKey!];
    expect(sln).toContain("Debug|Any CPU = Debug|Any CPU");
    expect(sln).toContain("Release|Any CPU = Release|Any CPU");
  });

  it("uses explicit package-name option for sln filename", async () => {
    const [{ outputs }] = await HttpTesterCustomPackage.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const slnKey = Object.keys(outputs).find((k) => k.endsWith(".sln"));
    expect(slnKey).toBe("MyCustomName.sln");
  });
});
