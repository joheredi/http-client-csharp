/**
 * Minimal Azure Resource Manager (ARM) TypeSpec fixture for smoke testing.
 *
 * Defines a simple singleton extension resource (HciVmInstance) to validate that
 * the emitter can handle ARM resource patterns and that the generated C# code
 * compiles with the Azure.ResourceManager NuGet package.
 *
 * Based on the hcivm.tsp test fixture from the legacy mgmt test suite.
 */
import "@azure-tools/typespec-azure-core";
import "@azure-tools/typespec-azure-resource-manager";
import "@typespec/rest";

using TypeSpec.Rest;
using TypeSpec.Http;
using TypeSpec.Versioning;
using Azure.ResourceManager;

@armProviderNamespace
@service(#{
  title: "MgmtSmokeTest",
})
@versioned(Versions)
namespace MgmtSmokeTest;

/** The available API versions. */
enum Versions {
  v2024_01_01: "2024-01-01",
}

interface Operations extends Azure.ResourceManager.Operations {}

@doc("The virtual machine instance resource definition.")
@singleton("default")
model HciVmInstance
  is ExtensionResource<HciVmInstanceProperties> {
    ...ResourceNameParameter<HciVmInstance, SegmentName = "virtualMachineInstances">;
}

model HciVmInstanceProperties {
    sku: string;
}

@armResourceOperations
interface HciVmInstances {
  @doc("Gets a virtual machine instance")
  get is ArmResourceRead<HciVmInstance>;
}
