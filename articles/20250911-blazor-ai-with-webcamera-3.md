---
title: "【C#】タブレットのカメラで画像を読み取ってAIにOCRしてもらう(カメラ編)"
emoji: "🌍️"
type: "tech"
topics: ["dotnet", "csharp", "blazor", "ai", "ocr"]
published: true
---



前回・前々回の記事の続きです。
https://zenn.dev/arika/articles/20250911-blazor-ai-with-webcamera-1
https://zenn.dev/arika/articles/20250911-blazor-ai-with-webcamera-2


## WebカメラをBlazorから使う

ラベルスキャンアプリをWebアプリとして公開するケースを想定します。
WPFやWinFormsのような形で展開すれば今回のような苦労はしなくて良いのですが、Webアプリとして公開したいですよね！
各端末ごとにアプリを更新したりするのは辛いですし、何よりWebで提供できればAndroid端末でも動かせます。
基本的にAndroidのほうが安いので、これは見逃せません。

## セットアップ
### HTTPSで公開
まずWebサイトを**HTTPS**で公開する必要があります。これはWebカメラを使うためのブラウザの制約です。~~邪魔~~
といっても証明書は自己署名で良いので、いうほど面倒ではないです。例えばtraefik等でホストしてれば勝手にHTTPS化してくれます。
ユーザーに警告画面が出ますが、無視して進んでもらえばOK。[^1]

[^1]: ところで、イントラネットのHTTPS化ってどうしたらいいんでしょうか。理屈的には社内CAを用意してあれこれすればいいんですが、結局ルート証明書を各端末に入れないといけないのであまり現実的ではない気がします。このあたり良い方法があればよいのですが。

### SignalRのセットアップ
（普段意識することはありませんが）Blazor ServerはSignalRを使ってJavaScriptと通信します。
ただし、SignalRは画像データのような大きなデータを送ることを想定していないため、デフォルトではサイズ制限がかかっています。
というわけでこいつを解除します。

```cs
// Program.cs
builder.Services.AddSignalR(options => {
    options.MaximumReceiveMessageSize = 10 * 1024 * 1024; // 10 MB
}); 
```

## コンポーネントを作る

カメラから画像を読み取るコンポーネントを作ります。
例によってJavaScriptを使う必要があるので、ごちゃごちゃしています。。

```razor
/* WebCamera.razor */
@using System.IO.Compression
<div>
    @* カメラデバイスを選択してもらう欄 *@
    <select @onchange="Selected">
        <option value="">--- select camera device ---</option>
        @foreach (var device in devices)
        {
            <option value="@device.deviceId">@device.label</option>
        }
    </select>
    <br />
    @* 選択したカメラを再生する画面 *@
    <video id="@idVideo" width="@VideoWidth" height="@VideoHeight" />
    @* キャプチャ画面を転記する&結果をユーザーに見せる欄 *@
    <canvas style="@(IsCaptured ? null : "display:none;")" id="@idCanvas" width="@VideoWidth" height="@VideoHeight" />
    <br />

    <button @onclick="CaptureFrame">Capture Frame</button>
</div>

@inject IJSRuntime JS
@implements IDisposable
@code {
    [Parameter]
    public EventCallback<byte[]> OnCapture { get; set; }

    // ここはコンポーネントファイルの設置場所に応じて変える
    const string ComponentDir = "./Components/";
    const string JSNamespace = "WebCameraActions";
    const int VideoWidth = 480;
    const int VideoHeight = 360;
    private string idVideo = Guid.NewGuid().ToString();
    private string idCanvas = Guid.NewGuid().ToString();
    private bool IsCaptured = false;
    private bool IsVideoNotAvailable = false;

    private IJSObjectReference module = default!;
    private VideoDevices[] devices = [];

    [JSInvokable]
    public void RecieveImage(byte[] data)
    {
        IsCaptured = true;
        OnCapture.InvokeAsync(data);
        StateHasChanged();
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            // 初回読み込み時にJavaScriptを読み込んでデバイス一覧を取得
            module = await JS.InvokeAsync<IJSObjectReference>("import", $"{ComponentDir}/{nameof(WebCamera)}.razor.js");
            devices = await module.InvokeAsync<VideoDevices[]>($"{JSNamespace}.getDevices");
            if(devices.Length > 0)
            {
                // 結果が返ってきているなら、最初の1つを選択する
                SelectedDeviceId = devices[0].deviceId;
                await PlayStart(SelectedDeviceId);
            }
            else
            {
                IsVideoNotAvailable = true;
            }
            StateHasChanged();
        }
    }

    private async Task Selected(ChangeEventArgs args)
    {
        // デバイスが選択されたら再生開始する
        var device = args.Value as string;
        SelectedDeviceId = device;
        await PlayStart(device);
    }

    private async Task PlayStart(string? device)
    {
        if(string.IsNullOrWhiteSpace(device))
        {
            return;
        }
        try
        {
            await module.InvokeVoidAsync($"{JSNamespace}.startVideo", idVideo, device);
            IsVideoNotAvailable = false;
        }
        catch
        {
            // cannot play
            IsVideoNotAvailable = true;
        }
    }

    // 他のコンポーネントからも呼び出せるようにpublic
    public async Task CaptureFrame()
    {
        // ボタンが押されたらJS側のgetFrameを呼び出す
        // (JS側でRecieveImageが呼び出される)
        await module.InvokeAsync<String>($"{JSNamespace}.getFrame",
             DotNetObjectReference.Create(this),
            idVideo, idCanvas, VideoWidth, VideoHeight
        );
    }

    public void Dispose()
    {
        module.InvokeVoidAsync($"{JSNamespace}.stopVideo", idVideo);
    }

    internal record VideoDevices(string label, string deviceId);
}
```

JavaScript側は以下のようになります。

```js
// WebCamera.razor.js
export class WebCameraActions {
    // 再生中のStream(ID: Stream)
    static Streams = {};
    // デバイス一覧を取得
    static getDevices = async () => {
        try {
            await navigator.mediaDevices.getUserMedia({
                // リアカメラだけを取得する。縛りをいれない場合は video: true だけでOK
                video: { facingMode: "environment" }
            });
            var rsts = await navigator.mediaDevices.enumerateDevices();
            return rsts.filter(d => d.kind === 'videoinput').map(device => {
                return {
                    label: device.label,
                    deviceId: device.deviceId,
                }
            });
        }
        catch (e) {
            // カメラの権限がない場合など→再生できないので空配列を返す
            return [];
        }
    }
    // 再生開始する
    static startVideo = async(id, device) => {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const video = document.getElementById(id);
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: device }, },
            })
            // 再生中一覧に追加しておく(停止するときに使う)
            WebCameraActions.Streams[id] = stream;
            if ("srcObject" in video) {
                video.srcObject = stream;
            } else {
                video.src = window.URL.createObjectURL(stream);
            }
            video.onloadedmetadata = function (e) {
                video.play();
            };
        }
    }
    // 再生を止める
    static stopVideo = async (id) => {
        const video = document.getElementById(id);
        video.pause();
        video.src = "";
        var playStream = WebCameraActions.Streams[id];
        if (playStream !== null) {
            playStream.getVideoTracks().forEach(val => val.stop())
            playStream.getAudioTracks().forEach(val => val.stop())
        }
    }
    // 現在のフレームをBlazor側に投げる
    static getFrame = async(dotNetHelper, src, dest, width, height) => {
        let video = document.getElementById(src);
        let canvas = document.getElementById(dest);
        canvas.getContext('2d').drawImage(video, 0, 0, width, height);

        let dataUrl = canvas.toDataURL("image/png");
        let dataBase64 = dataUrl.split(',')[1]; // base64部分を取得
        let binaryUint8 = Uint8Array.fromBase64(dataBase64)
        dotNetHelper.invokeMethodAsync('RecieveImage', binaryUint8);
    }
}
```

最後に、前回の`Hoge.razor`に以下の内容を追加します。

```razor
@page "/"

/* 省略 * /
<WebCamera OnCapture="TryOcrFromCamera" />
/* 省略 * /

@code {
    private async Task TryOcrFromCamera(byte[] bytes)
    {
        ResultLotNo = await OcrService.TryOcr(bytes);
        IsParsed = true;
        await InvokeAsync(StateHasChanged);
    }
    // 省略
}
```

## 動かしてみる
まともなWebカメラを持っていないのでピントが合っていませんが、こんな感じで動きます。

![](https://i.imgur.com/WVBmzWp.gif)
（ていうかこの画質で読めるのすごい。人間よりすごいんじゃないか）

## まとめ
以上、BlazorからWebカメラを使って画像を読み取り、AIにOCRしてもらう方法でした。
意外と簡単にできたのではないでしょうか。


ここまでのコードはGitHubに置いてあります。
https://github.com/arika0093/BlazorOcrWithAI

