---
title: "GitHubCopilot(VSCode/CLI)でローカルLLMを使う"
pubDatetime: 2026-05-20T12:41:21+09:00
modDatetime: 2026-05-20T13:17:22+09:00
published: true
tags: ["github-copilot", "llm"]
zenn:
  published: true
  emoji: "🤖"
  type: "tech"
---

[6/1からの値上げ](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)に備えるための備忘録。

## できること

GitHub Copilotの[BYOK機能](https://github.blog/changelog/2026-04-07-copilot-cli-now-supports-byok-and-local-models/)を使うことで、従来通りAI使い放題(？)を実現できる。
BYOKの概要の説明をしてる記事は いくつかあったものの、詳細なHow-toまで解説してる記事があまりなかったので作成。

## 方法

### ローカルモデルを稼働させる

今回は[ollama](https://ollama.com/)を使用した。
[GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-byok-models)側の書き方的にはopenai API互換なら何でも良さそうに見えるが、以前[vLLM](https://vllm.ai/)を使用したときはうまくいって無さそうだった。原因は不明。

とりあえず、ollamaをdocker-composeで立てる。

```yaml
services:
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
    restart: always
    environment:
      OLLAMA_HOST: 0.0.0.0:11434

volumes:
  ollama:
```

立てた後、`docker compose exec ollama bash`でコンテナの中に入って`ollama pull (モデル名)`でモデルを利用可能にする。

利用可能なモデル一覧は[ここ](https://ollama.com/search)から参照できる。
注意点として、`cloud`タグがついているやつはその名の通りローカルLLMではないので、それらは除外すること。
また、GH Copilotはツール呼び出しを多用するのでモデル側で対応している必要がある。

今回は[glm-4.7-flash](https://ollama.com/library/glm-4.7-flash)を採用した。

### GitHubCopilot側から接続する(VSCode)

1. チャット欄のモデル一覧の右上にある歯車マークで設定画面に移動。
2. 画面右上の「モデルを追加」から「Ollama」を選択
3. グループ名を適当に入力し、URLを「http://(your-server-ip):11434」にする

これで一覧にローカルモデルが生えてくるので、後はそれを選んでクエリを投げれば良い。

> 一覧にはOpenAIもあるが、残念ながらOpenAI互換のサーバーに接続することはできない様子。

### GitHubCopilot側から接続する(CLI)

CLIの場合、[環境変数](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-byok-models)でそのあたりの挙動を制御できる。最低限以下の変数があれば良い。

```bash
# 接続先URL。注意点として、 /v1まで指定する必要あり
COPILOT_PROVIDER_BASE_URL=http://(your-server-ip):11434/v1 \
# API種別
COPILOT_PROVIDER_TYPE=openai \
# 使用モデル
COPILOT_MODEL=glm-4.7-flash:latest \
# -- 最大トークン数を指定する場合
# COPILOT_PROVIDER_MAX_PROMPT_TOKEN=100000 \
# COPILOT_PROVIDER_MAX_OUTPUT_TOKEN=100000 \
# -- API KEYが必要な場所なら↓をCO
# COPILOT_PROVIDER_API_KEY=your-api-key \
# -- Copilotが提供するモデルをそもそも使わない場合CO
# COPILOT_OFFLINE=true \
copilot
```

接続は問題なくできるが、ツール呼び出しの関係で[バグ](https://github.com/pydantic/pydantic-ai/issues/5206)がある。2026/05/20時点ではまだ直っていない。

```
> このプロジェクトの概要を教えて

・プロジェクトの概要を把握するために、主要なファイルを読み込みます。
・Read README.md
    80 lines read
・Read docker-compose.yml
    32 lines read
(ここでセッションが切れる)

> continue
・Request failed (transient_bad_request). Retrying...
・Request failed (transient_bad_request). Retrying...
× 400 invalid message content type: <nil>
```


## Q. ローカルLLMでエージェント呼び出しできる？

A. できる。

frontmatterの`model`にローカルモデル名を指定すれば良い。

```md
---
name: your-skill-name
description: your-skill-description
model: glm-4.7-flash:latest
tools: [vscode, execute, read, agent, edit, search, web]
---

(your-prompt)
```

あとは普通にskills経由で呼び出してやるだけで、ローカルLLMを参照してagent起動してくれる。
都度指定してやる手間こそあるが、ここまでやれば遜色なく(？)使うこともできそうな雰囲気。

## note

```
$ date -Iseconds
2026-05-20T03:33:08+00:00

$ copilot --version
GitHub Copilot CLI 1.0.49.
Run 'copilot update' to check for updates.

# ollama --version
ollama version is 0.24.0
```
