import "@typespec/http";

using TypeSpec.Http;

@service
namespace SmokeTest;

enum Color {
  Red,
  Green,
  Blue,
}

union Priority {
  low: "low",
  medium: "medium",
  high: "high",
  string,
}

model Item {
  color: Color;
  priority: Priority;
}
