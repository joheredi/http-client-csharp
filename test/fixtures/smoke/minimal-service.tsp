import "@typespec/http";

using TypeSpec.Http;

@service
namespace SmokeTest;

model Widget {
  name: string;
  count: int32;
}
