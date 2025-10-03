
## WebAPI + NSwag

## MagicOnion

* gRPC + MessagePack

* shared class has some issue.

## FastEndpoints + Kiota
https://fast-endpoints.com/

https://fast-endpoints.com/docs/swagger-support

```csharp


```

https://github.com/FastEndpoints/FastEndpoints/issues/677

https://github.com/microsoft/kiota
https://github.com/microsoft/kiota/issues/3911


## FastEndpoints + Refit/Refitter

https://github.com/reactiveui/refit
https://github.com/christianhelle/refitter

```csharp

// FastEndpoints
builder.Services.AddFastEndpoints().SwaggerDocument(o => {
    // for generate api client
    o.DocumentSettings = s => {
        s.DocumentName = "v1";
    };
    // use short name 
    o.ShortSchemaNames = true;
    o.SerializerSettings = so => {
        // support string to enum
        so.Converters.Add(new JsonStringEnumConverter());
    };
});

var app = builder.Build();
app.UseDefaultExceptionHandler()
    .UseFastEndpoints(c => c.Endpoints.ShortNames = true)
    .UseSwaggerGen();

await app.ExportSwaggerJsonAndExitAsync(
    documentName: "v1",
    destinationPath: "./OpenAPI"
);
// generated: ./OpenAPI/v1.json
```

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Refit" Version="8.0.0" />
    <PackageReference Include="Refitter.MSBuild" Version="1.6.3" />
  </ItemGroup>
</Project>
```



https://github.com/RicoSuter/NSwag/issues/4503

