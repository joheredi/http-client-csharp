import "@typespec/http";

using TypeSpec.Http;

@service
namespace SmokeTest;

model Address {
  street: string;
  city: string;
  zip?: string;
}

model Person {
  name: string;
  age?: int32;
  address: Address;
  tags: string[];
}

@route("/people")
op getPerson(): Person;
