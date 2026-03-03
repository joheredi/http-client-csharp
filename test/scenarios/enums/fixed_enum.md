# Should generate a fixed enum for DaysOfWeekEnum

Validates that the emitter generates a standard C# enum declaration for a
TypeSpec `enum` with doc comments on each member. This matches the Spector
`Type.Enum.Fixed` golden file pattern.

## TypeSpec

```tsp
@service
namespace Type.Enum.Fixed;

@doc("Days of the week")
enum DaysOfWeekEnum {
  @doc("Monday.")
  Monday,

  @doc("Tuesday.")
  Tuesday,

  @doc("Wednesday.")
  Wednesday,

  @doc("Thursday.")
  Thursday,

  @doc("Friday.")
  Friday,

  @doc("Saturday.")
  Saturday,

  @doc("Sunday.")
  Sunday,
}

@route("/string")
interface StringOp {
  @get
  @route("/known-value")
  getKnownValue(): {
    @header contentType: "application/json";
    @body body: DaysOfWeekEnum;
  };
}
```

## Models

Should generate a C# enum with XML doc comments for each member.

```csharp src/Generated/Models/DaysOfWeekEnum.cs enum DaysOfWeekEnum
public enum DaysOfWeekEnum
    {
        /// <summary> Monday. </summary>
        Monday,
        /// <summary> Tuesday. </summary>
        Tuesday,
        /// <summary> Wednesday. </summary>
        Wednesday,
        /// <summary> Thursday. </summary>
        Thursday,
        /// <summary> Friday. </summary>
        Friday,
        /// <summary> Saturday. </summary>
        Saturday,
        /// <summary> Sunday. </summary>
        Sunday
    }
```
