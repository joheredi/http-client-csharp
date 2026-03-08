// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// Local adapted copy of the legacy OptionalityTests.cs.
// The legacy test references API shapes that don't match the new emitter output:
// - Sub-client method casing (GetPlaindateClient → GetPlainDateClient)
// - Model types (legacy CollectionsModel model → StringProperty in collections)
// - Literal values and enum member names updated per current TypeSpec spec
// - Bytes/PlainDate/PlainTime values updated per current spec

using System;
using System.Threading.Tasks;
using System.Xml;
using _Type.Property.Optional;
using NUnit.Framework;

namespace TestProjects.Spector.Tests.Http._Type.Property.Optionality
{
    internal class OptionalityTests : SpectorTestBase
    {
        // ===== BooleanLiteral =====

        [SpectorTest]
        public Task BooleanLiteralGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetBooleanLiteralClient().GetAllAsync();
            Assert.AreEqual(true, response.Value.Property);
        });

        [SpectorTest]
        public Task BooleanLiteralGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetBooleanLiteralClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task BooleanLiteralPutAll() => Test(async (host) =>
        {
            BooleanLiteralProperty data = new()
            {
                Property = true
            };
            var response = await new OptionalClient(host, null).GetBooleanLiteralClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task BooleanLiteralPutDefault() => Test(async (host) =>
        {
            // Explicitly set Property to null — the generated model initializes it to the
            // literal value (true), but the putDefault scenario expects an empty body {}.
            var data = new BooleanLiteralProperty();
            data.Property = null;
            var response = await new OptionalClient(host, null).GetBooleanLiteralClient().PutDefaultAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== String =====

        [SpectorTest]
        public Task StringGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetStringClient().GetAllAsync();
            Assert.AreEqual("hello", response.Value.Property);
        });

        [SpectorTest]
        public Task StringGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetStringClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task StringPutAll() => Test(async (host) =>
        {
            StringProperty data = new()
            {
                Property = "hello"
            };
            var response = await new OptionalClient(host, null).GetStringClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task StringPutDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetStringClient().PutDefaultAsync(new StringProperty());
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== Bytes =====

        [SpectorTest]
        public Task BytesGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetBytesClient().GetAllAsync();
            Assert.AreEqual("hello, world!", response.Value.Property.ToString());
        });

        [SpectorTest]
        public Task BytesGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetBytesClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task BytesPutAll() => Test(async (host) =>
        {
            BytesProperty data = new()
            {
                Property = BinaryData.FromBytes(Convert.FromBase64String("aGVsbG8sIHdvcmxkIQ=="))
            };
            var response = await new OptionalClient(host, null).GetBytesClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task BytesPutDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetBytesClient().PutDefaultAsync(new BytesProperty());
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== Datetime =====

        [SpectorTest]
        public Task DatetimeGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetDatetimeClient().GetAllAsync();
            Assert.AreEqual(DateTimeOffset.Parse("2022-08-26T18:38:00Z"), response.Value.Property);
        });

        [SpectorTest]
        public Task DatetimeGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetDatetimeClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task DatetimePutAll() => Test(async (host) =>
        {
            DatetimeProperty data = new()
            {
                Property = DateTimeOffset.Parse("2022-08-26T18:38:00Z")
            };
            var response = await new OptionalClient(host, null).GetDatetimeClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task DatetimePutDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetDatetimeClient().PutDefaultAsync(new DatetimeProperty());
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== PlainDate (note: GetPlainDateClient, not GetPlaindateClient) =====

        [SpectorTest]
        public Task PlaindateGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetPlainDateClient().GetAllAsync();
            Assert.AreEqual(DateTimeOffset.Parse("2022-12-12"), response.Value.Property);
        });

        [SpectorTest]
        public Task PlaindateGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetPlainDateClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task PlaindatePutAll() => Test(async (host) =>
        {
            PlainDateProperty data = new()
            {
                Property = DateTimeOffset.Parse("2022-12-12")
            };
            var response = await new OptionalClient(host, null).GetPlainDateClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task PlaindatePutDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetPlainDateClient().PutDefaultAsync(new PlainDateProperty());
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== PlainTime (note: GetPlainTimeClient, not GetPlaintimeClient) =====

        [SpectorTest]
        public Task PlaintimeGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetPlainTimeClient().GetAllAsync();
            Assert.AreEqual(TimeSpan.Parse("13:06:12"), response.Value.Property);
        });

        [SpectorTest]
        public Task PlaintimeGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetPlainTimeClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task PlaintimePutAll() => Test(async (host) =>
        {
            PlainTimeProperty data = new()
            {
                Property = TimeSpan.Parse("13:06:12")
            };
            var response = await new OptionalClient(host, null).GetPlainTimeClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task PlaintimePutDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetPlainTimeClient().PutDefaultAsync(new PlainTimeProperty());
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== Duration =====

        [SpectorTest]
        public Task DurationGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetDurationClient().GetAllAsync();
            Assert.AreEqual(XmlConvert.ToTimeSpan("P123DT22H14M12.011S"), response.Value.Property);
        });

        [SpectorTest]
        public Task DurationGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetDurationClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task DurationPutAll() => Test(async (host) =>
        {
            DurationProperty data = new()
            {
                Property = XmlConvert.ToTimeSpan("P123DT22H14M12.011S")
            };
            var response = await new OptionalClient(host, null).GetDurationClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task DurationPutDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetDurationClient().PutDefaultAsync(new DurationProperty());
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== CollectionsByte =====

        [SpectorTest]
        public Task CollectionsByteGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetCollectionsByteClient().GetAllAsync();
            Assert.AreEqual(2, response.Value.Property.Count);
            Assert.AreEqual("hello, world!", response.Value.Property[0].ToString());
            Assert.AreEqual("hello, world!", response.Value.Property[1].ToString());
        });

        [SpectorTest]
        public Task CollectionsByteGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetCollectionsByteClient().GetDefaultAsync();
            // The new emitter returns an empty ChangeTrackingList for absent collection
            // properties instead of null (Azure SDK convention).
            Assert.AreEqual(0, response.Value.Property.Count);
        });

        [SpectorTest]
        public Task CollectionsBytePutAll() => Test(async (host) =>
        {
            CollectionsByteProperty data = new();
            data.Property.Add(BinaryData.FromBytes(Convert.FromBase64String("aGVsbG8sIHdvcmxkIQ==")));
            data.Property.Add(BinaryData.FromBytes(Convert.FromBase64String("aGVsbG8sIHdvcmxkIQ==")));
            var response = await new OptionalClient(host, null).GetCollectionsByteClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task CollectionsBytePutDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetCollectionsByteClient().PutDefaultAsync(new CollectionsByteProperty());
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== CollectionsModel =====
        // Note: CollectionsModelProperty.Property is IList<StringProperty> (not CollectionsModel)

        [SpectorTest]
        public Task CollectionsModelGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetCollectionsModelClient().GetAllAsync();
            Assert.AreEqual(2, response.Value.Property.Count);
            Assert.AreEqual("hello", response.Value.Property[0].Property);
            Assert.AreEqual("world", response.Value.Property[1].Property);
        });

        [SpectorTest]
        public Task CollectionsModelGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetCollectionsModelClient().GetDefaultAsync();
            // The new emitter returns an empty ChangeTrackingList for absent collection
            // properties instead of null (Azure SDK convention).
            Assert.AreEqual(0, response.Value.Property.Count);
        });

        [SpectorTest]
        public Task CollectionsModelPutAll() => Test(async (host) =>
        {
            CollectionsModelProperty data = new();
            data.Property.Add(new StringProperty { Property = "hello" });
            data.Property.Add(new StringProperty { Property = "world" });
            var response = await new OptionalClient(host, null).GetCollectionsModelClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task CollectionsModelPutDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetCollectionsModelClient().PutDefaultAsync(new CollectionsModelProperty());
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== RequiredAndOptional =====

        [SpectorTest]
        public Task RequiredAndOptionalGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetRequiredAndOptionalClient().GetAllAsync();
            var result = response.Value;
            Assert.AreEqual("hello", result.OptionalProperty);
            Assert.AreEqual(42, result.RequiredProperty);
        });

        [SpectorTest]
        public Task RequiredAndOptionalGetRequiredOnly() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetRequiredAndOptionalClient().GetRequiredOnlyAsync();
            var result = response.Value;
            Assert.AreEqual(null, result.OptionalProperty);
            Assert.AreEqual(42, result.RequiredProperty);
        });

        [SpectorTest]
        public Task RequiredAndOptionalPutAll() => Test(async (host) =>
        {
            var content = new RequiredAndOptionalProperty(42)
            {
                OptionalProperty = "hello"
            };

            var response = await new OptionalClient(host, null).GetRequiredAndOptionalClient().PutAllAsync(content);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task RequiredAndOptionalPutRequiredOnly() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetRequiredAndOptionalClient().PutRequiredOnlyAsync(new RequiredAndOptionalProperty(42));
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== FloatLiteral =====
        // Property type: FloatLiteralPropertyProperty? (wrapper struct with implicit conversion from float)

        [SpectorTest]
        public Task FloatLiteralGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetFloatLiteralClient().GetAllAsync();
            Assert.AreEqual(FloatLiteralPropertyProperty.V125, response.Value.Property);
        });

        [SpectorTest]
        public Task FloatLiteralGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetFloatLiteralClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task FloatLiteralPutAll() => Test(async (host) =>
        {
            FloatLiteralProperty data = new()
            {
                Property = FloatLiteralPropertyProperty.V125
            };
            var response = await new OptionalClient(host, null).GetFloatLiteralClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task FloatLiteralPutDefault() => Test(async (host) =>
        {
            // Explicitly set Property to null — the generated model initializes it to the
            // literal value (1.25), but the putDefault scenario expects an empty body {}.
            var data = new FloatLiteralProperty();
            data.Property = null;
            var response = await new OptionalClient(host, null).GetFloatLiteralClient().PutDefaultAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== IntLiteral =====
        // Property type: IntLiteralPropertyProperty? (wrapper struct with implicit conversion from int)
        // Spec literal value: 1

        [SpectorTest]
        public Task IntLiteralGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetIntLiteralClient().GetAllAsync();
            Assert.AreEqual(IntLiteralPropertyProperty.V1, response.Value.Property);
        });

        [SpectorTest]
        public Task IntLiteralGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetIntLiteralClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task IntLiteralPutAll() => Test(async (host) =>
        {
            IntLiteralProperty data = new()
            {
                Property = IntLiteralPropertyProperty.V1
            };
            var response = await new OptionalClient(host, null).GetIntLiteralClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task IntLiteralPutDefault() => Test(async (host) =>
        {
            // Explicitly set Property to null — the generated model initializes it to the
            // literal value (1), but the putDefault scenario expects an empty body {}.
            var data = new IntLiteralProperty();
            data.Property = null;
            var response = await new OptionalClient(host, null).GetIntLiteralClient().PutDefaultAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== StringLiteral =====
        // Property type: StringLiteralPropertyProperty? (wrapper struct)
        // Spec literal value: "hello"

        [SpectorTest]
        public Task StringLiteralGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetStringLiteralClient().GetAllAsync();
            Assert.AreEqual(StringLiteralPropertyProperty.Hello, response.Value.Property);
        });

        [SpectorTest]
        public Task StringLiteralGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetStringLiteralClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task StringLiteralPutAll() => Test(async (host) =>
        {
            StringLiteralProperty data = new()
            {
                Property = StringLiteralPropertyProperty.Hello,
            };
            var response = await new OptionalClient(host, null).GetStringLiteralClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task StringLiteralPutDefault() => Test(async (host) =>
        {
            // Explicitly set Property to null — the generated model initializes it to the
            // literal value ("hello"), but the putDefault scenario expects an empty body {}.
            var data = new StringLiteralProperty();
            data.Property = null;
            var response = await new OptionalClient(host, null).GetStringLiteralClient().PutDefaultAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== UnionFloatLiteral =====
        // Spec values: 1.25 | 2.375; getAll/putAll use 2.375

        [SpectorTest]
        public Task UnionFloatLiteralGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetUnionFloatLiteralClient().GetAllAsync();
            Assert.AreEqual(UnionFloatLiteralPropertyProperty._2375, response.Value.Property);
        });

        [SpectorTest]
        public Task UnionFloatLiteralGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetUnionFloatLiteralClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task UnionFloatLiteralPutAll() => Test(async (host) =>
        {
            UnionFloatLiteralProperty data = new()
            {
                Property = UnionFloatLiteralPropertyProperty._2375,
            };
            var response = await new OptionalClient(host, null).GetUnionFloatLiteralClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task UnionFloatLiteralPutDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetUnionFloatLiteralClient().PutDefaultAsync(new UnionFloatLiteralProperty());
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== UnionIntLiteral =====
        // Spec values: 1 | 2; getAll/putAll use 2

        [SpectorTest]
        public Task UnionIntLiteralGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetUnionIntLiteralClient().GetAllAsync();
            Assert.AreEqual(UnionIntLiteralPropertyProperty._2, response.Value.Property);
        });

        [SpectorTest]
        public Task UnionIntLiteralGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetUnionIntLiteralClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task UnionIntLiteralPutAll() => Test(async (host) =>
        {
            UnionIntLiteralProperty data = new()
            {
                Property = UnionIntLiteralPropertyProperty._2,
            };
            var response = await new OptionalClient(host, null).GetUnionIntLiteralClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task UnionIntLiteralPutDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetUnionIntLiteralClient().PutDefaultAsync(new UnionIntLiteralProperty());
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        // ===== UnionStringLiteral =====
        // Spec values: "hello" | "world"; getAll/putAll use "world"

        [SpectorTest]
        public Task UnionStringLiteralGetAll() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetUnionStringLiteralClient().GetAllAsync();
            Assert.AreEqual(UnionStringLiteralPropertyProperty.World, response.Value.Property);
        });

        [SpectorTest]
        public Task UnionStringLiteralGetDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetUnionStringLiteralClient().GetDefaultAsync();
            Assert.AreEqual(null, response.Value.Property);
        });

        [SpectorTest]
        public Task UnionStringLiteralPutAll() => Test(async (host) =>
        {
            UnionStringLiteralProperty data = new()
            {
                Property = UnionStringLiteralPropertyProperty.World,
            };
            var response = await new OptionalClient(host, null).GetUnionStringLiteralClient().PutAllAsync(data);
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });

        [SpectorTest]
        public Task UnionStringLiteralPutDefault() => Test(async (host) =>
        {
            var response = await new OptionalClient(host, null).GetUnionStringLiteralClient().PutDefaultAsync(new UnionStringLiteralProperty());
            Assert.AreEqual(204, response.GetRawResponse().Status);
        });
    }
}
