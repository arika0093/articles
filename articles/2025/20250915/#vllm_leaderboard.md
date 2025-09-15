---
title: "C#"
emoji: "🤖"
type: "tech"
topics: ["zenn", "csharp"]
published: false
---

https://huggingface.co/spaces/opencompass/open_vlm_leaderboard

20B未満かつオープンなモデルを探したいので、検索条件のModel Sizeで20B以上のものとUnknownを外す

![alt text](image.png)

1位は`InternVL3-14B`だったので、これを使ってみる。
今回は日本語性能とかいらないので、単純に上位のものが良いだろうという判断。

https://huggingface.co/OpenGVLab/InternVL3-14B

Aspireをセットアップする。

```csharp
// add VLLM service
var vllm = builder
  .AddContainer("vllm", "vllm/vllm-openai")
  .WithHttpEndpoint(targetPort: 8000)
  .WithVolume("vllm_cache", "/workspace/.cache")
  .WithHttpHealthCheck("/health")
  .WithLifetime(ContainerLifetime.Persistent)
  .WithContainerRuntimeArgs("--gpus=all")
  .WithArgs("--model", "OpenGVLab/InternVL3-14B", "--trust-remote-code");
```

`ContainerLifetime.Persistent`でいちいち起動し直さなくて済む。
裏でdocker-compose up -dしてるようなイメージ

GPUを使うので`WithContainerRuntimeArgs("--gpus=all")`が必要。
最後にWithArgsでvllmの引数を指定。今回のモデルでは`--trust-remote-code`が必要。

`HealthCheck`でvllmの起動確認を行うことで、起動待ちができる。

