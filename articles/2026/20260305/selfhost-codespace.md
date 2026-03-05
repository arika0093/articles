---
title: "GitHub Codespace(風)環境をセルフホストしてAgentを皆で使い倒す"
published: true
tags: ["devcontainers", "ai", "copilot"]
zenn:
  published: false
  emoji: "🌍️"
  type: "tech"
---

## 背景

* AIエージェントをようやく契約して使えるようになったが、開発環境がWindows(ノートパソコン)
* 会議等でノートパソコンを持ち運ぶとセッションが切れるのでAgentの動作が止まる
* また、スペックが非力なのでビルド等が重い(これは元々の課題)
* Windowsなので色々ツールが不便だったり。playwrightとかmcpとか準備がめんどい
* 管理者権限が必要になってめんどくさかったり

そういうわけなので強いLinuxマシンで、さくっと使える環境を用意するにはどうしたらよいかを調べた。

## 目標

* Linux環境上で一通りのAgent駆動開発ができること
* セッションが切れても問題なく動くようにする
* 環境構築オタク以外でも手軽に使えるようにすること(大事！！)

自分が使うだけならそこらへんの環境にSSHして勝手に使えばいいが、チームメンバーも使うことを考えるとその1段上の解決が必要
監査とかそういう小難しいものは(今は)いらないので、即席で動く開発環境をさくっと用意したい

## ほしいもの

* ユーザーが欲しいときにすぐインスタンスを作れる
* 使い捨てできる
* SSHで接続できる(vscodeで接続すればそれで十分)
* 開発に必要なものが諸々組み込まれていること
  * 特に設定がめんどくさいmcp系統(playwrightとか)があらかじめプリインされてると良い
* 一台の開発用PCで複数のインスタンスをさばける
  * 予算の都合だったり既存資産の兼ね合いで、でかいサーバー一台の上でいくつか動かせると安上がりで嬉しい

* インスタンスを作る時に以下の内容を渡すと勝手に環境セットアップしてくれる
  * gitのレポジトリURL
  * SSH公開鍵
  * dotfiles(オタク向け)

## 検討

* GitHub Codespace
  * 特に準備不要、使うのが簡単
  * 有料、従量課金なので(会社的に)説得がむずかしい、社内にしかないリソース(DB,file等)にアクセスできず不便
* Coder
  * 基本無料
  * 環境を作るのがめんどい。terraformベースなのでカスタマイズがむずかしい
* Devpod
  * 無料
  * 社内プロキシがあると動作が不安定
  * クラウドにインスタンスを立てて使うのが基本ぽい雰囲気をところどころ感じる。社内のベアメタルサーバーに何かするのには向いてなさそう

どれも微妙そう。。

## 自分で環境を作れば良いじゃない
### 概要

ということで、以下のアプローチを取ることにしました。

1. dockerが動く環境を用意する
1. Webで必要な情報を入力(gitレポジトリ, SSH公開鍵等)
1. あらかじめ用意したDockerfileをベースに必要なものを全部突っ込んで環境を払い出す
1. そこにSSH接続する

1はdockerが動いてさえいればいいので、そこまで難しくないと思います。プロキシ設定周りだけは注意。
2については色々方法があると思います。自分で必要な機能付きのシンプルなwebを作って`docker.sock`をマウントしても良いですし、coolifyやdokployのUIでやるようにしても良いでしょう。
4は単純なので割愛。

ということで、2をどのようにするかというのが課題です。

### 欲しいもの全て入りのイメージを作る

開発環境と一言でいっても必要なものは人によって様々です。
ので、極論では`Dockerfile`を都度作ってくれという話になってしまうのですが、それでは面倒ですし、目標の「環境構築オタク以外でも手軽に使えるようにすること」を達成できない。
なので、ある程度のものは全て入っててほしいわけです。
例えば`nodejs`, `python`, `dotnet`, `go`, ...。

最初はこれら全部入りのDockerfileを手で書こうとしましたが、途中で素晴らしいイメージがあることに気づきました。

`devcontainers/universal`です。

これはまさしくGitHub Codespacesのデフォイメージとして使われているものなので、おおよそ開発に必要そうなツールは大体入ってます！素晴らしい！
のでこいつをベースとして必要な改造を入れていけば良さそうです。

必要なものは概ね以下のあたりかなと思います。

* ユーザー設定・docker起動処理等
  * GitHub Codespaceでは`devcontainer.json`ベースなのでユーザーの設定やdockerの起動など必要な下準備は全部やってくれますが、今回は自前でやる必要があります。
* Webアプリ開発のデバッグ等も組み込みで行えるようにしておきたいので、`playwright`を導入してインストールまでやっておきます。
* 社内プロキシの設定も組み込んでおきます。
* セッションが切れても問題ないようにするため、`tmux`を入れておきます。
* SSH公開鍵やgitレポジトリのURLのセットアップ処理も入れときます。
* dotfilesのレポジトリもクローンして展開する処理も入れときます。

---

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
RUN if [ -n "$GIT_REPO" ]; then \
    git clone "$GIT_REPO" ~/workspace; \
    fi

# dotfiles
# install.sh, setup.sh, Makefileの順で探して、あれば実行
RUN if [ -n "$DOTFILE_REPO" ]; then \
    git clone "$DOTFILE_REPO" ~/dotfiles \
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
# sudo -Eで起動することで環境変数を引き継ぐ(後述)
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
```

あとはこれをビルドして、必要な引数を渡して起動すればOKです。

## カスタマイズ

実際のところ、最新版のランタイムでないものが必要だったり、特定のツールが必要だったりと、環境によって必要なものは様々だと思います。
Dockerfileを直接カスタマイズしてもよいですが、`nvm`や`sdkman`があらかじめ入っているのでそこで制御することもできます。

## 使った感想

**めっちゃ快適！**

まず、環境構築がめちゃくちゃ楽になりました。`universal`イメージのおかげで、必要なツールが最初から入っているので、すぐに開発を始めることができます。
また、クソ遅いwindowsマシンから、スペックの高いLinuxマシンに移行したことで、ビルドやテストの速度が格段に向上しました。
セッション問題も解決したので、帰宅前に重いタスクを投げといて、朝に確認するみたいな使い方もできるようになりました。

チームメンバーも同じ環境を使えるのも大きいです。

というわけで、ほぼGitHub Codespaceのような開発体験がローカルでも実現できます！
気になった方はぜひ試してみてください。

