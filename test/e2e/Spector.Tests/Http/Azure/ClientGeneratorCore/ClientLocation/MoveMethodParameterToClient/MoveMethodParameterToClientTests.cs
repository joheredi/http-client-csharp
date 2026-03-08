
using NUnit.Framework;
using System.Threading.Tasks;
using MoveMethodParameterToClientClass = _Specs_.Azure.ClientGenerator.Core.ClientLocation._MoveMethodParameterToClient.MoveMethodParameterToClient;
using MoveMethodParameterToClientOptions = _Specs_.Azure.ClientGenerator.Core.ClientLocation._MoveMethodParameterToClient.MoveMethodParameterToClientOptions;

namespace TestProjects.Spector.Tests.Http.Azure.ClientGeneratorCore.ClientLocation.MoveMethodParameterToClient
{
    public class MoveMethodParameterToClientTests : SpectorTestBase
    {
        [SpectorTest]
        public Task Azure_ClientGenerator_Core_ClientLocation_MoveMethodParameterToClient() => Test(async (host) =>
        {
            var response = await new MoveMethodParameterToClientClass(host, "testaccount", new MoveMethodParameterToClientOptions()).GetBlobOperationsClient().GetBlobAsync("testcontainer", "testblob.txt");
            Assert.AreEqual(200, response.GetRawResponse().Status);

            var blob = response.Value;
            Assert.IsNotNull(blob);
        });
    }
}
