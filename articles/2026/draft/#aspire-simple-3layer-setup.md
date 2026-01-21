---
title: "【C#】Aspireで単純な3層アーキテクチャを構築する（With 便利機能）"
published: false
tags: ["csharp", "dotnet", "aspire", "architecture"]
zenn:
  published: false
  emoji: "🏗️"
  type: "tech"
---

## メモ
* AspireのWebテンプレートから始める
* クラスライブラリとしてDatabaseを追加
  * AppDbContext
  * AppDbContextExtensions
  * AppDbContextFactory
* マイグレーション用のWorker追加
* AppHostの起動処理を修正
  * マイグレーション完了→API→Webの順で起動
* API側改修
  * 標準のWeatherForecastを削除
  * SwaggerUI設定(`Swashbuckle.AspNetCore.SwaggerUI`追加)
    * 起動URL修正(`launchSettings.json`の`launchUrl`を`swagger`に)
  * APIドキュメント自動生成されるように
    * `Microsoft.Extensions.ApiDescription.Server`追加
    * `<OpenApiDocumentsDirectory>./OpenAPI</OpenApiDocumentsDirectory>`をAPIプロジェクトのcsprojに追加
  * 作ったAppDbContextExtensionsを使ってDbContext登録
  * Linqraft導入
    * DBモデルをそのまま返さずにDTOに変換するための便利ライブラリ
* Web側改修
  * 標準のWeatherApiClientを削除
  * `Refit.HttpClientFactory`と`Refitter.MSBuild`導入
  * `.refitter`ファイル追加
  * `<RefitterSkipValidation>true</RefitterSkipValidation>`追加
    * OpenAPI3.1の対応
    * https://github.com/christianhelle/refitter/issues/328
  * `builder.Services.ConfigureRefitClients();`

## 微妙
* `<OpenApiGenerateDocumentsOptions>--openapi-version OpenApi3_0</OpenApiGenerateDocumentsOptions>`で3.0形式を吐き出すようにする
  * int/decimal等のスキーマがobjectになってしまう


https://github.com/arika0093/AspireSimpleDbApp