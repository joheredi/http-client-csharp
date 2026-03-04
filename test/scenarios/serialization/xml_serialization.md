# Should generate XML serialization for models used with application/xml content type

Validates that models used as XML request/response bodies get correct XML serialization:

- `XmlModelWriteCore` protected virtual method for writing properties via XmlWriter
- `WriteXml` private method that wraps content with root element tags
- `DeserializeXxx` static method for parsing XElement input
- `PersistableModelWriteCore` with `case "X":` for XML format dispatch
- `PersistableModelCreateCore` with `case "X":` for XML format dispatch
- `GetFormatFromOptions` returning `"X"` for XML-only models
- `IPersistableModel<T>` interface implementation (not IJsonModel)
- Implicit/explicit cast operators for BinaryContent and ClientResult
- Optional property guards with `Optional.IsDefined()`
- Dual-format support (JSON + XML) for models used in both contexts

## TypeSpec

```tsp
@service
namespace TestNamespace;

model SimpleXmlModel {
  name: string;
  age: int32;
}

model XmlModelWithOptionalField {
  item: string;
  value?: int32;
}

model DualFormatModel {
  title: string;
}

@route("/xml/simple")
@put op putSimple(@header("content-type") contentType: "application/xml", @body body: SimpleXmlModel): void;

@route("/xml/simple")
@get op getSimple(): { @header("content-type") contentType: "application/xml"; @body body: SimpleXmlModel; };

@route("/xml/optional")
@put op putOptional(@header("content-type") contentType: "application/xml", @body body: XmlModelWithOptionalField): void;

@route("/json/dual")
@post op postJsonDual(@body body: DualFormatModel): DualFormatModel;

@route("/xml/dual")
@put op putXmlDual(@header("content-type") contentType: "application/xml", @body body: DualFormatModel): void;
```

## Models

Should generate SimpleXmlModel class with public constructor and properties

```csharp src/Generated/Models/SimpleXmlModel.cs class SimpleXmlModel
public partial class SimpleXmlModel
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="SimpleXmlModel"/>. </summary>
        /// <param name="name"></param>
        /// <param name="age"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> is null. </exception>
        public SimpleXmlModel(string name, int age)
        {
            Argument.AssertNotNull(name, nameof(name));

            Name = name;
            Age = age;
        }

        /// <summary> Initializes a new instance of <see cref="SimpleXmlModel"/>. </summary>
        /// <param name="name"></param>
        /// <param name="age"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal SimpleXmlModel(string name, int age, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Name = name;
            Age = age;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string Name { get; set; }
        public int Age { get; set; }
    }
```

Should generate SimpleXmlModel serialization with XML-specific methods (IPersistableModel only, no IJsonModel)

```csharp src/Generated/Models/SimpleXmlModel.Serialization.cs class SimpleXmlModel
public partial class SimpleXmlModel : IPersistableModel<SimpleXmlModel>
    {
        /// <summary> Initializes a new instance of <see cref="SimpleXmlModel"/> for deserialization. </summary>
        internal SimpleXmlModel()
        {
        }

        /// <param name="data"> The data to parse. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        protected virtual SimpleXmlModel PersistableModelCreateCore(BinaryData data, ModelReaderWriterOptions options)
        {
            string format = options.Format == "W" ? ((IPersistableModel<SimpleXmlModel>)this).GetFormatFromOptions(options) : options.Format;
            switch (format)
            {
                case "X":
                    using (Stream dataStream = data.ToStream())
                    {
                        return DeserializeSimpleXmlModel(XElement.Load(dataStream, LoadOptions.PreserveWhitespace), options);
                    }
                default:
                    throw new FormatException($"The model {nameof(SimpleXmlModel)} does not support reading '{options.Format}' format.");
            }
        }

        /// <param name="options"> The client options for reading and writing models. </param>
        protected virtual BinaryData PersistableModelWriteCore(ModelReaderWriterOptions options)
        {
            string format = options.Format == "W" ? ((IPersistableModel<SimpleXmlModel>)this).GetFormatFromOptions(options) : options.Format;
            switch (format)
            {
                case "X":
                    using (MemoryStream stream = new MemoryStream(256))
                    {
                        using (XmlWriter writer = XmlWriter.Create(stream, ModelSerializationExtensions.XmlWriterSettings))
                        {
                            WriteXml(writer, options, "SimpleXmlModel");
                        }
                        if (stream.Position > int.MaxValue)
                        {
                            return BinaryData.FromStream(stream);
                        }
                        else
                        {
                            return new BinaryData(stream.GetBuffer().AsMemory(0, (int)stream.Position));
                        }
                    }
                default:
                    throw new FormatException($"The model {nameof(SimpleXmlModel)} does not support writing '{options.Format}' format.");
            }
        }

        /// <param name="options"> The client options for reading and writing models. </param>
        BinaryData IPersistableModel<SimpleXmlModel>.Write(ModelReaderWriterOptions options) => PersistableModelWriteCore(options);

        /// <param name="data"> The data to parse. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        SimpleXmlModel IPersistableModel<SimpleXmlModel>.Create(BinaryData data, ModelReaderWriterOptions options) => PersistableModelCreateCore(data, options);

        /// <param name="options"> The client options for reading and writing models. </param>
        string IPersistableModel<SimpleXmlModel>.GetFormatFromOptions(ModelReaderWriterOptions options) => "X";

        /// <param name="simpleXmlModel"> The <see cref="SimpleXmlModel"/> to serialize into <see cref="BinaryContent"/>. </param>
        public static implicit operator BinaryContent(SimpleXmlModel simpleXmlModel)
        {
            if (simpleXmlModel == null)
            {
                return null;
            }
            return BinaryContent.Create(simpleXmlModel, ModelSerializationExtensions.WireOptions);
        }

        /// <param name="result"> The <see cref="ClientResult"/> to deserialize the <see cref="SimpleXmlModel"/> from. </param>
        public static explicit operator SimpleXmlModel(ClientResult result)
        {
            using PipelineResponse response = result.GetRawResponse();
            using Stream stream = response.ContentStream;
            if ((stream == null))
            {
                return default;
            }

            return SimpleXmlModel.DeserializeSimpleXmlModel(XElement.Load(stream, LoadOptions.PreserveWhitespace), ModelSerializationExtensions.WireOptions);
        }

        /// <param name="writer"> The XML writer. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        /// <param name="nameHint"> An optional name hint. </param>
        private void WriteXml(XmlWriter writer, ModelReaderWriterOptions options, string nameHint)
        {
            if (nameHint != null)
            {
                writer.WriteStartElement(nameHint);
            }

            XmlModelWriteCore(writer, options);

            if (nameHint != null)
            {
                writer.WriteEndElement();
            }
        }

        /// <param name="writer"> The XML writer. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        protected virtual void XmlModelWriteCore(XmlWriter writer, ModelReaderWriterOptions options)
        {
            string format = options.Format == "W" ? ((IPersistableModel<SimpleXmlModel>)this).GetFormatFromOptions(options) : options.Format;
            if (format != "X")
            {
                throw new FormatException($"The model {nameof(SimpleXmlModel)} does not support writing '{format}' format.");
            }

            writer.WriteStartElement("name");
            writer.WriteValue(Name);
            writer.WriteEndElement();
            writer.WriteStartElement("age");
            writer.WriteValue(Age);
            writer.WriteEndElement();
        }

        /// <param name="element"> The xml element to deserialize. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        internal static SimpleXmlModel DeserializeSimpleXmlModel(XElement element, ModelReaderWriterOptions options)
        {
            if (element == null)
            {
                return null;
            }
            string name = default;
            int age = default;
            IDictionary<string, BinaryData> additionalBinaryDataProperties = new ChangeTrackingDictionary<string, BinaryData>();

            foreach (var child in element.Elements())
            {
                string localName = child.Name.LocalName;
                if (localName == "name")
                {
                    name = (string)child;
                    continue;
                }
                if (localName == "age")
                {
                    age = (int)child;
                    continue;
                }
            }
            return new SimpleXmlModel(name, age, additionalBinaryDataProperties);
        }
    }
```

Should generate XmlModelWithOptionalField class with optional property

```csharp src/Generated/Models/XmlModelWithOptionalField.cs class XmlModelWithOptionalField
public partial class XmlModelWithOptionalField
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="XmlModelWithOptionalField"/>. </summary>
        /// <param name="item"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="item"/> is null. </exception>
        public XmlModelWithOptionalField(string item)
        {
            Argument.AssertNotNull(item, nameof(item));

            Item = item;
        }

        /// <summary> Initializes a new instance of <see cref="XmlModelWithOptionalField"/>. </summary>
        /// <param name="item"></param>
        /// <param name="value"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal XmlModelWithOptionalField(
            string item,
            int? value,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Item = item;
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string Item { get; }
        public int? Value { get; set; }
    }
```

Should generate XmlModelWithOptionalField serialization with Optional.IsDefined guards

```csharp src/Generated/Models/XmlModelWithOptionalField.Serialization.cs class XmlModelWithOptionalField
public partial class XmlModelWithOptionalField : IPersistableModel<XmlModelWithOptionalField>
    {
        /// <summary> Initializes a new instance of <see cref="XmlModelWithOptionalField"/> for deserialization. </summary>
        internal XmlModelWithOptionalField()
        {
        }

        /// <param name="data"> The data to parse. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        protected virtual XmlModelWithOptionalField PersistableModelCreateCore(BinaryData data, ModelReaderWriterOptions options)
        {
            string format = options.Format == "W" ? ((IPersistableModel<XmlModelWithOptionalField>)this).GetFormatFromOptions(options) : options.Format;
            switch (format)
            {
                case "X":
                    using (Stream dataStream = data.ToStream())
                    {
                        return DeserializeXmlModelWithOptionalField(XElement.Load(dataStream, LoadOptions.PreserveWhitespace), options);
                    }
                default:
                    throw new FormatException($"The model {nameof(XmlModelWithOptionalField)} does not support reading '{options.Format}' format.");
            }
        }

        /// <param name="options"> The client options for reading and writing models. </param>
        protected virtual BinaryData PersistableModelWriteCore(ModelReaderWriterOptions options)
        {
            string format = options.Format == "W" ? ((IPersistableModel<XmlModelWithOptionalField>)this).GetFormatFromOptions(options) : options.Format;
            switch (format)
            {
                case "X":
                    using (MemoryStream stream = new MemoryStream(256))
                    {
                        using (XmlWriter writer = XmlWriter.Create(stream, ModelSerializationExtensions.XmlWriterSettings))
                        {
                            WriteXml(writer, options, "XmlModelWithOptionalField");
                        }
                        if (stream.Position > int.MaxValue)
                        {
                            return BinaryData.FromStream(stream);
                        }
                        else
                        {
                            return new BinaryData(stream.GetBuffer().AsMemory(0, (int)stream.Position));
                        }
                    }
                default:
                    throw new FormatException($"The model {nameof(XmlModelWithOptionalField)} does not support writing '{options.Format}' format.");
            }
        }

        /// <param name="options"> The client options for reading and writing models. </param>
        BinaryData IPersistableModel<XmlModelWithOptionalField>.Write(ModelReaderWriterOptions options) => PersistableModelWriteCore(options);

        /// <param name="data"> The data to parse. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        XmlModelWithOptionalField IPersistableModel<XmlModelWithOptionalField>.Create(BinaryData data, ModelReaderWriterOptions options) => PersistableModelCreateCore(data, options);

        /// <param name="options"> The client options for reading and writing models. </param>
        string IPersistableModel<XmlModelWithOptionalField>.GetFormatFromOptions(ModelReaderWriterOptions options) => "X";

        /// <param name="xmlModelWithOptionalField"> The <see cref="XmlModelWithOptionalField"/> to serialize into <see cref="BinaryContent"/>. </param>
        public static implicit operator BinaryContent(XmlModelWithOptionalField xmlModelWithOptionalField)
        {
            if (xmlModelWithOptionalField == null)
            {
                return null;
            }
            return BinaryContent.Create(xmlModelWithOptionalField, ModelSerializationExtensions.WireOptions);
        }



        /// <param name="writer"> The XML writer. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        /// <param name="nameHint"> An optional name hint. </param>
        private void WriteXml(XmlWriter writer, ModelReaderWriterOptions options, string nameHint)
        {
            if (nameHint != null)
            {
                writer.WriteStartElement(nameHint);
            }

            XmlModelWriteCore(writer, options);

            if (nameHint != null)
            {
                writer.WriteEndElement();
            }
        }

        /// <param name="writer"> The XML writer. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        protected virtual void XmlModelWriteCore(XmlWriter writer, ModelReaderWriterOptions options)
        {
            string format = options.Format == "W" ? ((IPersistableModel<XmlModelWithOptionalField>)this).GetFormatFromOptions(options) : options.Format;
            if (format != "X")
            {
                throw new FormatException($"The model {nameof(XmlModelWithOptionalField)} does not support writing '{format}' format.");
            }

            writer.WriteStartElement("item");
            writer.WriteValue(Item);
            writer.WriteEndElement();
            if (Optional.IsDefined(Value))
            {
                writer.WriteStartElement("value");
                writer.WriteValue(Value.Value);
                writer.WriteEndElement();
            }
        }

        /// <param name="element"> The xml element to deserialize. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        internal static XmlModelWithOptionalField DeserializeXmlModelWithOptionalField(XElement element, ModelReaderWriterOptions options)
        {
            if (element == null)
            {
                return null;
            }
            string item = default;
            int? value = default;
            IDictionary<string, BinaryData> additionalBinaryDataProperties = new ChangeTrackingDictionary<string, BinaryData>();

            foreach (var child in element.Elements())
            {
                string localName = child.Name.LocalName;
                if (localName == "item")
                {
                    item = (string)child;
                    continue;
                }
                if (localName == "value")
                {
                    value = (int)child;
                    continue;
                }
            }
            return new XmlModelWithOptionalField(item, value, additionalBinaryDataProperties);
        }
    }
```

Should generate DualFormatModel class

```csharp src/Generated/Models/DualFormatModel.cs class DualFormatModel
public partial class DualFormatModel
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="DualFormatModel"/>. </summary>
        /// <param name="title"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="title"/> is null. </exception>
        public DualFormatModel(string title)
        {
            Argument.AssertNotNull(title, nameof(title));

            Title = title;
        }

        /// <summary> Initializes a new instance of <see cref="DualFormatModel"/>. </summary>
        /// <param name="title"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal DualFormatModel(string title, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Title = title;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string Title { get; set; }
    }
```

Should generate DualFormatModel serialization with both JSON and XML format support

```csharp src/Generated/Models/DualFormatModel.Serialization.cs class DualFormatModel
public partial class DualFormatModel : IJsonModel<DualFormatModel>
    {
        /// <summary> Initializes a new instance of <see cref="DualFormatModel"/> for deserialization. </summary>
        internal DualFormatModel()
        {
        }

        /// <param name="data"> The data to parse. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        protected virtual DualFormatModel PersistableModelCreateCore(BinaryData data, ModelReaderWriterOptions options)
        {
            string format = options.Format == "W" ? ((IPersistableModel<DualFormatModel>)this).GetFormatFromOptions(options) : options.Format;
            switch (format)
            {
                case "J":
                    using (JsonDocument document = JsonDocument.Parse(data))
                    {
                        return DeserializeDualFormatModel(document.RootElement, options);
                    }
                case "X":
                    using (Stream dataStream = data.ToStream())
                    {
                        return DeserializeDualFormatModel(XElement.Load(dataStream, LoadOptions.PreserveWhitespace), options);
                    }
                default:
                    throw new FormatException($"The model {nameof(DualFormatModel)} does not support reading '{options.Format}' format.");
            }
        }

        /// <param name="options"> The client options for reading and writing models. </param>
        protected virtual BinaryData PersistableModelWriteCore(ModelReaderWriterOptions options)
        {
            string format = options.Format == "W" ? ((IPersistableModel<DualFormatModel>)this).GetFormatFromOptions(options) : options.Format;
            switch (format)
            {
                case "J":
                    return ModelReaderWriter.Write(this, options, TestNamespaceContext.Default);
                case "X":
                    using (MemoryStream stream = new MemoryStream(256))
                    {
                        using (XmlWriter writer = XmlWriter.Create(stream, ModelSerializationExtensions.XmlWriterSettings))
                        {
                            WriteXml(writer, options, "DualFormatModel");
                        }
                        if (stream.Position > int.MaxValue)
                        {
                            return BinaryData.FromStream(stream);
                        }
                        else
                        {
                            return new BinaryData(stream.GetBuffer().AsMemory(0, (int)stream.Position));
                        }
                    }
                default:
                    throw new FormatException($"The model {nameof(DualFormatModel)} does not support writing '{options.Format}' format.");
            }
        }

        /// <param name="options"> The client options for reading and writing models. </param>
        BinaryData IPersistableModel<DualFormatModel>.Write(ModelReaderWriterOptions options) => PersistableModelWriteCore(options);

        /// <param name="data"> The data to parse. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        DualFormatModel IPersistableModel<DualFormatModel>.Create(BinaryData data, ModelReaderWriterOptions options) => PersistableModelCreateCore(data, options);

        /// <param name="options"> The client options for reading and writing models. </param>
        string IPersistableModel<DualFormatModel>.GetFormatFromOptions(ModelReaderWriterOptions options) => "J";

        /// <param name="dualFormatModel"> The <see cref="DualFormatModel"/> to serialize into <see cref="BinaryContent"/>. </param>
        public static implicit operator BinaryContent(DualFormatModel dualFormatModel)
        {
            if (dualFormatModel == null)
            {
                return null;
            }
            return BinaryContent.Create(dualFormatModel, ModelSerializationExtensions.WireOptions);
        }

        /// <param name="result"> The <see cref="ClientResult"/> to deserialize the <see cref="DualFormatModel"/> from. </param>
        public static explicit operator DualFormatModel(ClientResult result)
        {
            using PipelineResponse response = result.GetRawResponse();

            if ((response.Headers.TryGetValue("Content-Type", out string value) && value.StartsWith("application/json", StringComparison.OrdinalIgnoreCase)))
            {
                using JsonDocument document = JsonDocument.Parse(response.Content, ModelSerializationExtensions.JsonDocumentOptions);
                return DualFormatModel.DeserializeDualFormatModel(document.RootElement, ModelSerializationExtensions.WireOptions);
            }

            using Stream stream = response.ContentStream;
            if ((stream == null))
            {
                return default;
            }

            return DualFormatModel.DeserializeDualFormatModel(XElement.Load(stream, LoadOptions.PreserveWhitespace), ModelSerializationExtensions.WireOptions);
        }

        /// <param name="writer"> The JSON writer. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        void IJsonModel<DualFormatModel>.Write(Utf8JsonWriter writer, ModelReaderWriterOptions options)
        {
            writer.WriteStartObject();
            JsonModelWriteCore(writer, options);
            writer.WriteEndObject();
        }

        /// <param name="writer"> The JSON writer. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        protected virtual void JsonModelWriteCore(Utf8JsonWriter writer, ModelReaderWriterOptions options)
        {
            string format = options.Format == "W" ? ((IPersistableModel<DualFormatModel>)this).GetFormatFromOptions(options) : options.Format;
            if (format != "J")
            {
                throw new FormatException($"The model {nameof(DualFormatModel)} does not support writing '{format}' format.");
            }
            writer.WritePropertyName("title"u8);
            writer.WriteStringValue(Title);
            if (((options.Format != "W") && (_additionalBinaryDataProperties != null)))
            {
                foreach (var item in _additionalBinaryDataProperties)
                {
                    writer.WritePropertyName(item.Key);
        #if NET6_0_OR_GREATER
                    writer.WriteRawValue(item.Value);
        #else
                    using (JsonDocument document = JsonDocument.Parse(item.Value))
                    {
                        JsonSerializer.Serialize(writer, document.RootElement);
                    }
        #endif
                }
            }
        }

        /// <param name="reader"> The JSON reader. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        DualFormatModel IJsonModel<DualFormatModel>.Create(ref Utf8JsonReader reader, ModelReaderWriterOptions options) => JsonModelCreateCore(ref reader, options);

        /// <param name="reader"> The JSON reader. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        protected virtual DualFormatModel JsonModelCreateCore(ref Utf8JsonReader reader, ModelReaderWriterOptions options)
        {
            string format = options.Format == "W" ? ((IPersistableModel<DualFormatModel>)this).GetFormatFromOptions(options) : options.Format;
            if (format != "J")
            {
                throw new FormatException($"The model {nameof(DualFormatModel)} does not support reading '{format}' format.");
            }
            using JsonDocument document = JsonDocument.ParseValue(ref reader);
            return DeserializeDualFormatModel(document.RootElement, options);
        }

        /// <param name="element"> The JSON element to deserialize. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        internal static DualFormatModel DeserializeDualFormatModel(JsonElement element, ModelReaderWriterOptions options)
        {
            if (element.ValueKind == JsonValueKind.Null)
            {
                return null;
            }
            string title = default;
            IDictionary<string, BinaryData> additionalBinaryDataProperties = new ChangeTrackingDictionary<string, BinaryData>();
            foreach (var prop in element.EnumerateObject())
            {
                if (prop.NameEquals("title"u8))
                {
                    title = prop.Value.GetString();
                    continue;
                }
                if (options.Format != "W")
                {additionalBinaryDataProperties.Add(prop.Name, BinaryData.FromString(prop.Value.GetRawText()));
                }
            }
            return new DualFormatModel(title, additionalBinaryDataProperties);
        }

        /// <summary> Converts the model to BinaryContent using the specified format. </summary>
        /// <param name="format"> The format to use for serialization. </param>
        internal BinaryContent ToBinaryContent(string format)
        {
        ModelReaderWriterOptions options = new ModelReaderWriterOptions(format);
            return BinaryContent.Create(this, options);
        }

        /// <param name="writer"> The XML writer. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        /// <param name="nameHint"> An optional name hint. </param>
        private void WriteXml(XmlWriter writer, ModelReaderWriterOptions options, string nameHint)
        {
            if (nameHint != null)
            {
                writer.WriteStartElement(nameHint);
            }

            XmlModelWriteCore(writer, options);

            if (nameHint != null)
            {
                writer.WriteEndElement();
            }
        }

        /// <param name="writer"> The XML writer. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        protected virtual void XmlModelWriteCore(XmlWriter writer, ModelReaderWriterOptions options)
        {
            string format = options.Format == "W" ? ((IPersistableModel<DualFormatModel>)this).GetFormatFromOptions(options) : options.Format;
            if (format != "X")
            {
                throw new FormatException($"The model {nameof(DualFormatModel)} does not support writing '{format}' format.");
            }

            writer.WriteStartElement("title");
            writer.WriteValue(Title);
            writer.WriteEndElement();
        }

        /// <param name="element"> The xml element to deserialize. </param>
        /// <param name="options"> The client options for reading and writing models. </param>
        internal static DualFormatModel DeserializeDualFormatModel(XElement element, ModelReaderWriterOptions options)
        {
            if (element == null)
            {
                return null;
            }
            string title = default;
            IDictionary<string, BinaryData> additionalBinaryDataProperties = new ChangeTrackingDictionary<string, BinaryData>();

            foreach (var child in element.Elements())
            {
                string localName = child.Name.LocalName;
                if (localName == "title")
                {
                    title = (string)child;
                    continue;
                }
            }
            return new DualFormatModel(title, additionalBinaryDataProperties);
        }
    }
```
