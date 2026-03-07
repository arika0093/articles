---
title: "GitHub Codespace(風)環境をセルフホストしてAgentを使い倒す"
emoji: "🌍️"
type: "tech"
topics: ["devcontainers", "ai", "copilot"]
published: true
---

:::message
この記事は[ブログ](https://eclairs.cc/posts/2026/20260305/selfhost-codespace)でも公開しています。
:::

## 背景

最近はやりのAgent駆動開発を試してみたくて社内のプロジェクトでちょこちょこ触ってみているのですが、開発環境がWindowsのノートパソコンというのがいくつかの問題を引き起こしていました。

一番困っていたのがセッションの問題です。会議のたびにノートパソコンを持ち運ぶのですが、その間にスリープが入るとセッションが切れてしまい、動作が止まってしまいます。単純に時間がもったいないし、「continue」を送りつけるだけなのにGitHub Copilotのプレミアムリクエストを無駄に消費するのも嫌なポイントです。

次にスペックの問題。(大体の会社でそうだと思いますが)裏でウイルススキャン等がゴリゴリに動いている関係でビルドやテストが遅く、Agentにコードを生成させても、その後のコンパイルや動作確認で待ち時間がかさんでしまいます。

さらにはツール準備の煩雑さもあります。playwrightやMCPサーバーなどはWindows環境だと素直に動かないケースが多く、セットアップに時間がかかるのもストレスでした。

そこで、スペックの高いLinuxマシン上でさくっと使える開発環境を用意できないか調べることにしました。

## 目標

自分一人が使うだけであれば、適当なLinuxサーバーにSSHして手元で設定すれば済む話です。しかしチームメンバーも使うことを考えると、もう一段上の解決が必要になります。今回は「即席で動く開発環境をさくっと用意できること」を目標にしました。

具体的には次の3点です。

1. Linux環境上で一通りのAgent駆動開発ができること
2. セッションが切れても問題なく動き続けること
3. **環境構築に詳しくないメンバーでも手軽に使えること**

最後の点が特に重要で、どれだけ良い環境を作っても使い方が複雑だと結局誰も使わなくなってしまいます。
逆に、簡単に使える環境があれば、Agentを活用した開発がチーム全体に広がっていくはずです。

## ほしいもの

### インスタンスの払い出しと破棄

欲しいときにすぐインスタンスが作れて、使い終わったら気軽に捨てられるというのが基本の要件です。
接続はSSHで十分で、VSCodeのRemote SSH拡張を使えばそれだけで快適なエディタ環境が整います。

### プリインストール済みのツール群

開発に必要なツールは最初から入っているのが理想です。
特にセットアップが面倒なMCP系（playwrightなど）があらかじめインストール済みになっていると、ユーザーが自分で準備する手間を省けます。
db込みのテストやaspire等を使うことを考えると、dockerも組み込みで使える必要があります。

### 一台のサーバーで複数インスタンスを稼働

専用クラウドを契約するよりも、手元にある開発用サーバーを有効活用できる方が予算的に都合が良いです。
一台の上で複数のインスタンスを並行して動かせれば、チームメンバー全員が同時に利用できます。

### セットアップの自動化

インスタンス作成時にgitリポジトリURL・SSH公開鍵・dotfiles（オタク向け）を渡すだけで、あとは環境が自動で整うと便利そうです。
単純にたくさんインスタンスを立てることを考えると、手動セットアップは面倒なので。。。

## 検討

### GitHub Codespace

まず候補として上がるのが[GitHub Codespace](https://github.com/features/codespaces)です。準備不要で使い始められ、devcontainerエコシステムとの相性も抜群です。
ただし有料の従量課金のため、会社として予算承認を取るのが難しいという問題があります。
また、社内にしか存在しないDBやファイルなどのリソースへアクセスできないのも難点です。まあそのあたりはモックを都度使えばよいのですが、密結合してるやつらもぼちぼちいるので置き換えコストがややかかります。

### Coder

次に[Coder](https://coder.com/)を検討しました。基本無料なのは魅力ですが、環境を作るためにTerraformベースのテンプレートを書く必要があります。
カスタマイズの自由度はあるものの、覚えることが多く「手軽に使えること」という目標との相性がイマイチです。

### Devpod

[Devpod](https://devpod.sh/)も試してみました。発想としてはとても良いと思いましたが、社内プロキシがある環境だと動作が不安定で、うまく動かないケースが続出しました。
設計上クラウドへのインスタンス作成を前提としているように見え、社内のベアメタルサーバーをそのまま活用するには向いていない印象を受けました。

## 自分で環境を作れば良いじゃない
### 概要

ということで、以下のアプローチを取ることにしました。

1. dockerが動く環境を用意する
1. Webで必要な情報を入力(gitレポジトリ, SSH公開鍵等)
1. あらかじめ用意したDockerfileをベースに必要なものを全部突っ込んで環境を払い出す
1. そこにSSH接続する

1はdockerさえ動いていれば問題なく、そこまで難しくありません。社内プロキシがある環境では設定周りに注意が必要な程度です。
2については様々なアプローチが考えられます。自分で`docker.sock`をマウントしたシンプルなWebアプリを作る方法もありますし、[coolify](https://coolify.io/)や[dokploy](https://dokploy.com/)といった既存のデプロイUIを活用する方法もあります。
4は単純なので割愛します。

ということで、3の実装をどうするかが実質的な課題になります。

### 欲しいもの全て入りのイメージを作る

開発環境と一言でいっても、必要なものは人によって様々です。
`Dockerfile`を都度作ってくれという話でもありますが、それでは面倒ですし、目標の「環境構築に詳しくないメンバーでも手軽に使えること」を達成できません。
`nodejs`、`python`、`dotnet`、`go`など主要なランタイムは最初から使える状態にしておきたいところです。

最初はこれら全部入りのDockerfileを手で書こうとしていたのですが、途中で素晴らしいイメージがあることに気づきました。

[devcontainers/universal](https://hub.docker.com/r/microsoft/devcontainers-universal)です。

これはGitHub Codespacesのデフォルトイメージとして使われているもので、開発に必要なツールがひと通り入っています。素晴らしい！
これをベースにして必要な改造を加えれば良さそうです。

追加で必要なものは以下のあたりです。

1. GitHub Codespaceでは`devcontainer.json`でユーザー設定やDockerの起動といった下準備を全部やってくれますが、今回はそのあたりを自前で対応する必要があります。
2. Webアプリ開発のデバッグが組み込みでできるよう[playwright](https://playwright.dev/)（+MCPツール）もインストールしておきます。
3. 社内プロキシの設定も組み込み済みにして、ユーザーが意識しなくて良い状態にしておきます。
4. セッションが切れても安心なように`tmux`も入れておきます。
5. SSH公開鍵・gitリポジトリURLのセットアップ処理と、dotfilesのリポジトリをクローン・展開する処理も合わせて用意しておきます。


これらを考慮したDockerfileは以下のようになります。カスタマイズは好きにやってください
(例えば`git config --global user.name`を設定できるようにするとか)。

```dockerfile
# これをベースに必要なツールを追加していく
FROM mcr.microsoft.com/devcontainers/universal:latest

# SSH公開鍵 + レポ情報を受け取る
# 指定無しでもとりあえず動くようにする
ARG SSH_PUBLIC_KEY=""
ARG GIT_REPO_URL=""
ARG DOTFILES_REPO_URL=""
ARG PROXY_URL=""

# プロキシ設定する
# 本来は資格情報をコンテナに焼き付けるのはあまり良くないですが、開発環境なのでそこは割り切り
ENV HTTP_PROXY=${PROXY_URL} \
    HTTPS_PROXY=${PROXY_URL} \
    http_proxy=${PROXY_URL} \
    https_proxy=${PROXY_URL} \
    NO_PROXY=localhost,127.0.0.1,::1 \
    no_proxy=localhost,127.0.0.1,::1

# ----------------------
# tools
# ----------------------
# playwright (with mcp)
RUN npm install -g \
    playwright \
    @playwright/mcp \
    && playwright install chrome --with-deps
# tmuxと、ついでに日本語フォント
RUN apt update && apt install -y \
    tmux \
    fonts-ipafont-gothic 

# ----------------------
# エントリポイント設定
# ----------------------
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# ----------------------
# 色々設定
# ----------------------
# ユーザー作成 & 権限付与
RUN id codespace 2>/dev/null || useradd -m -s /bin/bash codespace
RUN echo "codespace ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
RUN usermod -aG docker codespace

USER codespace
WORKDIR /home/codespace

# SSH公開鍵
RUN if [ -n "$SSH_PUBLIC_KEY" ]; then \
    mkdir -p ~/.ssh \
    && chmod 700 ~/.ssh \
    && echo "$SSH_PUBLIC_KEY" >> ~/.ssh/authorized_keys \
    && chmod 600 ~/.ssh/authorized_keys; \
    fi

# git clone
RUN if [ -n "$GIT_REPO_URL" ]; then \
    git clone "$GIT_REPO_URL" ~/workspace; \
    fi

# dotfiles
# install.sh, setup.sh, Makefileの順で探して、あれば実行
RUN if [ -n "$DOTFILES_REPO_URL" ]; then \
    git clone "$DOTFILES_REPO_URL" ~/dotfiles \
    && cd ~/dotfiles \
    && if [ -f install.sh ];  then bash install.sh; \
    elif  [ -f setup.sh ];    then bash setup.sh; \
    elif  [ -f Makefile ];    then make install; \
    fi; \
    fi

# proxyの設定を毎回入れるのが面倒なので、.bashrcに吐き出す
RUN if [ -n "$PROXY_URL" ]; then \
    echo "export HTTP_PROXY=${PROXY_URL}" >> ~/.bashrc && \
    echo "export HTTPS_PROXY=${PROXY_URL}" >> ~/.bashrc && \
    echo "export http_proxy=${PROXY_URL}" >> ~/.bashrc && \
    echo "export https_proxy=${PROXY_URL}" >> ~/.bashrc && \
    echo "export NO_PROXY=localhost,127.0.0.1,::1" >> ~/.bashrc && \
    echo "export no_proxy=localhost,127.0.0.1,::1" >> ~/.bashrc; \
    fi

# 起動
# devcontainers/universalはport2222でSSHの設定がされているので、そこに合わせる
EXPOSE 2222
# sudo -Eで起動することで環境変数を引き継ぐ
ENTRYPOINT ["sudo", "-E", "/usr/local/bin/entrypoint.sh"]
CMD ["sleep", "infinity"]
```

Dockerfileだけだと常駐系のプロセスがないので、`entrypoint.sh`で`sshd`と`dockerd`を起動するようにします。
dockerデーモンの方は`docker pull`とかをする際にプロキシ設定が必要なので、`sudo -E`で環境変数を引き継いで起動します。

```bash
# run sshd
/usr/sbin/sshd
# run dockerd
nohup dockerd > /var/log/dockerd.log 2>&1 &

exec "$@"
```

あとはこれをビルドして、必要な引数を渡して起動すればOKです。
内部でdockerを起動する都合上、`--privileged`オプションを付ける必要がある点には注意してください。[^1]

[^1]: 起動方法はdocker-in-docker(DinD)とdocker-out-of-docker(DooD)の2つがありますが、DinDをおすすめします。port5432が外に公開されたりとか、他人が使ってて起動できないとかでつらいので。

## TIPS
### AGENTS.mdの設定

プロキシ環境下で動かしている場合、web検索等をAgentが行う時に接続できないと怒られるため、その手引をAGENTS.mdに書いておきます。単純に`source ~/.bashrc`してくれと書いておくだけです。


## 使った感想

**めちゃくちゃ快適です。**

`universal`イメージのおかげで必要なツールが最初から入っているため、環境構築にほとんど時間をかけずに開発を始められます。
スペックの高いLinuxマシンに移行したことでビルドやテストの速度も格段に向上し、Agentが生成したコードをすぐ試せる軽快さが嬉しいです。

セッションが途中で切れる問題も解消しました。帰宅前に重いタスクを投げておいて、翌朝に続きを確認するような使い方もできるようになりました。


というわけで、ほぼGitHub Codespaceと同等の開発体験がオンプレミスでも実現できます。ぜひ試してみてください。

