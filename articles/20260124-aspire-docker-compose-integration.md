---
title: "Aspire 13でdocker compose生成機能を試してみる"
emoji: "🚀"
type: "tech"
topics: ["csharp", "dotnet", "aspire", "docker", "docker-compose"]
published: true
---


.NET10の公開に合わせて、Aspire Ver 13がリリースされました。[^1]

[^1]: なんで9からいきなり13になったのか直接的な言及は見つけられませんでしたが、dotnetだけじゃないことを明確にするためとかそんなところでしょう。

それに伴い ~~AIが適当に作った感が満載の~~ [ドキュメントサイト](https://aspire.dev/)も公開されています。

適当に眺めていたら地味に欲しかったdocker-compose生成機能が追加されていたので、試してみました。

## 前段

今回は以下のようなアーキテクチャを想定しています。

![](/images/20260124/arch.drawio.svg)

特に言う事の無い[Web3層構成](https://www.softbank.jp/biz/blog/cloud-technology/articles/202206/web-3-tier-architecture/)ですが、ここに2つのWorkerServiceがくっついています。それぞれMigration処理と適当にデータを追記処理するBotとして動作します。

ベースとなるAspireのAppHost.csは以下のような感じです。
（各プロジェクトの詳細は割愛。別のことをやろうとしてたついでに試したので、雑です）

```csharp
// postgresql
var postgres = builder
    .AddPostgres("postgres")
    .WithImage("postgres:16-alpine")
    .WithPgWeb()
    .WithDataVolume();
var database = postgres.AddDatabase("appdb");

// migration worker
var dbMigration = builder
    .AddProject<Projects.DbMigration>("dbmigration")
    .WithReference(database)
    .WaitFor(database);

// 以後、マイグレーションが完了次第起動する
// bot worker
builder
    .AddProject<Projects.BotWorker>("botworker")
    .WithReference(database)
    .WaitForCompletion(dbMigration);

// API
var apiService = builder
    .AddProject<Projects.ApiService>("apiservice")
    .WithHttpHealthCheck("/health")
    .WithReference(database)
    .WaitForCompletion(dbMigration);

// Web Frontend
builder
    .AddProject<Projects.Web>("webfrontend")
    .WithExternalHttpEndpoints()
    .WithHttpHealthCheck("/health")
    .WithReference(apiService)
    .WithReference(database)
    .WaitFor(apiService);

builder.Build().Run();
```

## 下準備
### Aspire CLIのセットアップ
.NET10でAspireを使うのは地味に始めてだったので、変わってるポイントから抑えていきます。

まず、専用のCLIが提供されるようになりました。

https://aspire.dev/ja/reference/cli/overview/

というわけで早速これをインストールします。導入には.NET10 SDKが必要です。
今回はPowerShellを使ってインストールしました。

```powershell
irm https://aspire.dev/install.ps1 | iex
```

インストールが完了したらPowershellを再起動して、初期設定を行います。
```powershell
aspire init
```

実行すると `.aspire/settings.json` が生成されます。

```json
{
  "appHostPath": "../AppHost.csproj"
}
```

.NET9以前とはcsprojの記載が結構変わっています。詳細は[公式ドキュメント](https://learn.microsoft.com/ja-jp/dotnet/aspire/get-started/upgrade-to-aspire-13?tabs=bash&pivots=vscode#apphost-template-updates)を参照。

### Docker Integrationのインストール

https://aspire.dev/integrations/compute/docker/

これを導入して検証をしてみます。コードは[ここ](https://github.com/dotnet/aspire/tree/main/src/Aspire.Hosting.Docker)。

まずはインストールです。めちゃくちゃ簡単になりました。

```bash
aspire add docker
```

これだけでcsprojが更新されます。中身を見てみると、26/01/21時点でまだ[プレビュー版](https://www.nuget.org/packages/Aspire.Hosting.Docker#versions-body-tab)のようですね。[^2]

[^2]: 9.2のころからプレビューが公開されていたとは…知りませんでした。

```xml
<PackageReference Include="Aspire.Hosting.Docker" Version="13.1.0-preview.1.25616.3" />
```

## aspire publish
### docker-compose.ymlの生成

[ドキュメント](https://aspire.dev/integrations/compute/docker/)が微妙に嘘で悲しいのですが、有効化するだけなら以下の行を追加するだけでOKです。

```csharp
var builder = DistributedApplication.CreateBuilder(args);

// これだけ
var compose = builder.AddDockerComposeEnvironment("compose");

var cache = builder.AddRedis("cache")
    // これは要らない(というか引数が必要で動かせない)
    // .PublishAsDockerComposeService();
```

そして以下のコマンドを実行します。

```bash
aspire publish -o docker
```

`-o`はdocker composeファイルをどこに出力するか指定しています。
指定しないとAppHostフォルダ配下に出力されますが、起動スクリプトは専用のフォルダにあったほうが便利ですよね？

### ビルド結果の確認
ビルドが成功すると以下のようなファイルが生成されます。いつものファイル達ですね。

```plaintext
docker/
├── docker-compose.yml
└── .env
```

まずは`docker-compose.yml`を見てみましょう。長いので一部省略しています。

```yaml
services:
  # aspireのダッシュボードが標準で付属
  compose-dashboard:
    image: "mcr.microsoft.com/dotnet/nightly/aspire-dashboard:latest"
    ports:
      - "18888"
    expose:
      - "18889"
      - "18890"
    networks:
      - "aspire"
    restart: "always"
  # PostgreSQLコンテナ
  postgres:
    image: "docker.io/postgres:16-alpine"
    environment:
      POSTGRES_HOST_AUTH_METHOD: "scram-sha-256"
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --auth-local=scram-sha-256"
      POSTGRES_USER: "postgres"
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
    expose:
      - "5432"
    volumes:
      - type: "volume"
        target: "/var/lib/postgresql/data"
        source: "aspiresimpledbapp.apphost-785014c213-postgres-data"
        read_only: false
    networks:
      - "aspire"
  dbmigration:
    image: "${DBMIGRATION_IMAGE}"
    environment:
      # 一部略
      ConnectionStrings__appdb: "Host=postgres;Port=5432;Username=postgres;Password=${POSTGRES_PASSWORD};Database=appdb"
      APPDB_HOST: "postgres"
      APPDB_PORT: "5432"
      APPDB_USERNAME: "postgres"
      APPDB_PASSWORD: "${POSTGRES_PASSWORD}"
      APPDB_URI: "postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/appdb"
      APPDB_JDBCCONNECTIONSTRING: "jdbc:postgresql://postgres:5432/appdb"
      APPDB_DATABASENAME: "appdb"
    depends_on:
      postgres:
        condition: "service_started"
    networks:
      - "aspire"
  apiservice:
    image: "${APISERVICE_IMAGE}"
    expose:
      - "${APISERVICE_PORT}"
    # 略
  webfrontend:
    image: "${WEBFRONTEND_IMAGE}"
    ports:
      - "${WEBFRONTEND_PORT}"
    # 略
  botworker:
    image: "${BOTWORKER_IMAGE}"
    # 略
networks:
  aspire:
    driver: "bridge"
volumes:
  aspiresimpledbapp.apphost-785014c213-postgres-data:
    driver: "local"
```

要点を抑えてみましょう。

まず、ApiServerやDbMigrationには、コンテナを対象としたConnectionStringが正しく設定されています。
唯一パスワードだけは環境変数を参照する形になっています（正しいですね！）。

```yaml
ConnectionStrings__appdb: "Host=postgres;Port=5432;Username=postgres;Password=${POSTGRES_PASSWORD};Database=appdb"
```


また、ポート番号も環境変数参照になっています。
```yaml
ports:
- "${APISERVICE_PORT}"
```

その他、イメージ名は環境変数参照になっています。
```yaml
image: "${APISERVICE_IMAGE}"
```

また、aspireのいつものダッシュボードもついてますね。これはOffにもできます。[^3]

[^3]: `AddDockerComposeEnvironment().WithDashboard(false)`

```yml
compose-dashboard:
  image: "mcr.microsoft.com/dotnet/nightly/aspire-dashboard:latest"
```

## aspire deploy
さて、この状態だと`docker-compose.yml`は出来上がりましたが、環境変数が設定されていないため、そのままでは動きません。

そこで`aspire deploy`コマンドを使ってみます。
ちなみに、`aspire publish`と`aspire deploy`は以下のような違いがあります（名前もうちょっとどうにかしてほしいが）
![](/images/20260124/image.png)

```bash
aspire deploy -o docker
```

このコマンドを実行すると、コンテナビルドが開始され、`.env.Production`ファイルが生成されます。

```plaintext
docker/
├── docker-compose.yml
└── .env.Production
```

中身を見ると以下のようになっています。

```ini
# Container image name for apiservice
APISERVICE_IMAGE=apiservice:aspire-deploy-20260122151704

# Default container port for apiservice
APISERVICE_PORT=8080

# Container image name for botworker
BOTWORKER_IMAGE=botworker:aspire-deploy-20260122151704

# Container image name for dbmigration
DBMIGRATION_IMAGE=dbmigration:aspire-deploy-20260122151704

# Parameter postgres-password
POSTGRES_PASSWORD=jAptzTb7y_praPH++Rmpv{

# Container image name for webfrontend
WEBFRONTEND_IMAGE=webfrontend:aspire-deploy-20260122151704

# Default container port for webfrontend
WEBFRONTEND_PORT=8080
```

見ての通り、必要な変数がすべて設定されています。

また、必要なイメージもビルドされていることが確認できます。

```bash
$ docker images
REPOSITORY    TAG                           IMAGE ID       CREATED          SIZE
botworker     aspire-deploy-20260122153900  ae3c9011297b   13 minutes ago   240MB
webfrontend   aspire-deploy-20260122153900  60dfd6b90819   13 minutes ago   245MB
dbmigration   aspire-deploy-20260122153900  b8b96a6c3fea   13 minutes ago   241MB
apiservice    aspire-deploy-20260122153900  5e312cdb8aa7   14 minutes ago   241MB
```

最後にコンテナが起動します。
```bash
$ docker ps
docker ps
CONTAINER ID   IMAGE                                                      COMMAND                   CREATED         STATUS         PORTS                                             NAMES
25966369847b   webfrontend:aspire-deploy-20260122153900                   "dotnet /app/AspireS…"   7 minutes ago   Up 7 minutes   0.0.0.0:50213->8080/tcp, [::]:50213->8080/tcp     aspire-compose-a27a017f-webfrontend-1
63bcf5c13c95   apiservice:aspire-deploy-20260122153900                    "dotnet /app/AspireS…"   7 minutes ago   Up 7 minutes   8080/tcp                                          aspire-compose-a27a017f-apiservice-1
4d086229d29d   mcr.microsoft.com/dotnet/nightly/aspire-dashboard:latest   "dotnet /app/Aspire.…"   7 minutes ago   Up 7 minutes   0.0.0.0:51094->18888/tcp, [::]:51094->18888/tcp   aspire-compose-a27a017f-compose-dashboard-1
8bd797e3b9ff   postgres:16-alpine                                         "docker-entrypoint.s…"   7 minutes ago   Up 7 minutes   5432/tcp                                          aspire-compose-a27a017f-postgres-1
```

...のですが、素のままだと`db_migration`の起動条件が`db: service_started`になっているため、うまく動作しません！

## リモートにデプロイしたい
今のところAzureしか対応してません。
![](/images/20260124/image-1.png)

オンプレ環境でも何かしらで動かせると嬉しいですが、さすがにやってくれないですかね。。

## docker composeファイルのカスタマイズ
dockerなのでローカルで起動する(deploy)ことはあんまりしないですよね。
なので実際には`docker-compose.yml`をカスタマイズしてから運用することになると思います。

私は[Coolify](https://coolify.io/)を使っているので、素のcomposeからいくつか変更したいポイントがあります。
これがAspire上でどこまでできるのかを見てみます。

### ソースコードを見てみる

内部的には`Aspire.Hosting.Docker`の`DockerComposeServiceResource`クラスがdocker-compose.ymlを生成しています。

https://github.com/dotnet/aspire/blob/67de0c860b0b515c19f83387f31cf1b1c5f5ba35/src/Aspire.Hosting.Docker/DockerComposeServiceResource.cs#L112-L132

見てみるとカスタマイズの幅があまり無く、ちょっと残念な感じです。

#### `image`の代わりに`build`を使う
イメージを生成→それを参照するのではなく、直接ビルドする形にすることでStaging評価を楽にする目的。
`.PublishAsDockerFile`でいけるのかなと思いきや、compose側に反映されず。


#### 起動条件を`service_healthy`にする
DBの起動を待ってからMigrationを開始したい場合などは、service_healthyにしたい。
残念ながら26/01/24時点では利用できないようです。
https://github.com/dotnet/aspire/blob/67de0c860b0b515c19f83387f31cf1b1c5f5ba35/src/Aspire.Hosting.Docker/DockerComposeServiceResource.cs#L195-L202

#### `PORTS`の開放をやめる/ラベルを付与する/外部NWに所属させる
これらも簡易的に対応することはできず。。

### ではどうするのか
`PublishAsDockerComposeService`で素朴に調整します。

```csharp
// 全体に対する設定の場合
var compose = builder.AddDockerComposeEnvironment("compose")
    .ConfigureComposeFile(conf =>
    {
        // 全サービスのport開放をやめる
        foreach(var service in conf.Services.Values)
        {
            service.Ports = [];
        }
    });

// 例えばDbMigrationの場合
var dbMigration = builder
    .AddProject<Projects.AspireSimpleDbApp_DbMigration>("dbmigration")
    .WithReference(database)
    .WaitFor(database)
    // ここを追加
    .PublishAsDockerComposeService(
        (conf, service) =>
        {
            // build指定に変更
            service.Image = null;
            service.Build = new()
            {
                Context = "./",
                Dockerfile = "./DbMigration/Dockerfile",
            };
            // ラベルを追加
            service.Labels = new()
            {
                ["sampleLabel"] = "Sample",
            };
            // 既存のネットワークを使用
            service.Networks = ["external-network"];
            // 完了したら再起動しない
            service.Restart = "no";
            // 起動条件をservice_healthyに変更
            service.DependsOn = new()
            {
                // 起動対象リソース名はpostgresのNameプロパティを参照できる
                [postgres.Resource.Name] = new() {
                    Condition = "service_healthy"
                },
            };
        }
    );
```

うーん……
これなら最初から素のdocker-composeを書いたほうが良い気がします。

## まとめ
個人的にはまだまだ発展途上感が否めない雰囲気があります。もうちょっと様子見です。
