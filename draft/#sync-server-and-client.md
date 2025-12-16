
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


## Standard API + Refit + Refitter

### Server Side (TestServerApp)

普通にAPI組む。
このとき、`JsonStringEnumConverter`を使っておくと後が楽。
https://zenn.dev/jtechjapan_pub/articles/ceacea6d9322bd

```csharp
builder
    .Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "API", Version = "v1" });
});

// 略
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "API v1");
    c.RoutePrefix = "api/docs";
});

// this is a bug of Swashbuckle,
// see: https://github.com/domaindrivendev/Swashbuckle.AspNetCore/issues/3584
app.MapStaticAssets($"TestServerApp.staticwebassets.endpoints.json");

await app.RunAsync();
```

で、`swashbuckle.aspnetcore.cli`を導入。
https://github.com/domaindrivendev/Swashbuckle.AspNetCore/blob/master/docs/configure-and-customize-cli.md

```bash
dotnet new tool-manifest
dotnet tool install Swashbuckle.AspNetCore.Cli
```

csprojに以下の内容を追記。

```xml
  <!-- Generate OpenAPI specification -->
  <Target Name="GenerateOpenApi" AfterTargets="Build">
    <Exec Command="dotnet swagger tofile --output $(ProjectDir)OpenAPI/v1.json $(TargetPath) v1" />
  </Target>
```

これでビルドすると`TestServerApp/OpenAPI/v1.json`がビルドするたびに生える。
注意点として、CI環境でも同じように`swashbuckle.aspnetcore.cli`がないとビルドできなくなってるので必要に応じて追記。

### ApiClient (TestApiClient)

https://github.com/reactiveui/refit
https://github.com/christianhelle/refitter


実際に使用するプロジェクトの他に、クライアントを生やすためだけのプロジェクトを作る。

まずプロジェクト定義。必要なパッケージを突っ込む + ビルド順を制御するためにサーバー側へ参照を生やす。中身は使わない(入ってきたら困る)ので`ReferenceOutputAssembly=false`.

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.DependencyInjection.Abstractions" Version="9.0.9" />
    <PackageReference Include="Refit.HttpClientFactory" Version="8.0.0" />
    <PackageReference Include="Refitter.MSBuild" Version="1.6.3" />
  </ItemGroup>
  <!-- ビルド順の制御だけ -->
  <ItemGroup>
    <ProjectReference Include="..\TestServerApp\TestServerApp.csproj">
      <ReferenceOutputAssembly>false</ReferenceOutputAssembly>
    </ProjectReference>
  </ItemGroup>
</Project>
```

で、`.rifitter`ファイルを生成。

```jsonc
// https://github.com/christianhelle/refitter#refitter-file-format
{
  "openApiPath": "../FooBar.Server/OpenAPI/v1.json",
  "namespace": "FooBar.Client",
  "naming": {
    "useOpenApiTitle": false,
    "interfaceName": "FooBarApiClient"
  },
  "outputFolder": "./",
  "multipleInterfaces": "ByTag",
  "codeGeneratorSettings": {
    "generateNullableReferenceTypes": true
  },
  "dependencyInjectionSettings": {
    "baseUrl": "http://web-factory"
  }
}
```

### Client (TestClientApp)

あとは普通に使えばOK。


