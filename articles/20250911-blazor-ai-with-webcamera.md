---
title: "【Blazor】Webカメラから画像を読み取ってAIにOCRしてもらう"
emoji: "🌍️"
type: "tech"
topics: ["dotnet", "blazor", "ai", "webcamera", "ocr"]
published: false
---

## AIサーバーを立てる

今回は`Qwen/Qwen2-VL-7B-Instruct-AWQ`を使った。

docker-compose.yml

```yml
services:
  vllm:
    image: 'vllm/vllm-openai'
    deploy:
      resources:
        reservations:
          devices:
          - capabilities: [gpu]
            device_ids: ['2'] # 適当に指定する
            driver: nvidia
    volumes:
      - './cache:/workspace/.cache'
    command: '--model Qwen/Qwen2-VL-7B-Instruct-AWQ'
    ports:
      - '(port):8000'
```

## C#側の実装

```xml
<PackageReference Include="Microsoft.Extensions.AI" Version="9.8.0" />
<PackageReference Include="Microsoft.Extensions.AI.OpenAI" Version="9.8.0-preview.1.25412.6" />
```

```csharp
// Program.cs
using Microsoft.Extensions.AI;
using OpenAI;
using OpenAI.Chat;
using System.ClientModel;

// AI設定
IChatClient chatClient = new ChatClient(
    "Qwen/Qwen2-VL-7B-Instruct-AWQ",
    new ApiKeyCredential("test"),
    new OpenAIClientOptions() {
        Endpoint = new Uri("http://(self-hosting-url)/v1"),
        NetworkTimeout = TimeSpan.FromMinutes(1),
        //ClientLoggingOptions = new()
        //{
        //    EnableLogging = true,
        //    LoggerFactory = LoggerFactory.Create(loggingBuilder =>
        //    {
        //        loggingBuilder.AddConsole();
        //        loggingBuilder.SetMinimumLevel(LogLevel.Debug);
        //    }),
        //}
    }
).AsIChatClient();

builder.Services.AddChatClient(chatClient).UseLogging();

// JavascriptからBlazor側に画像データを投げられるようにする
services.AddSignalR(e =>
{
    e.MaximumReceiveMessageSize = 102400000;
});
```

## Webカメラから画像を読み取る

```razor
<select @onchange="Selected">
    <option value="">--- select camera device ---</option>
    @foreach(var device in devices)
    {
        <option value="@device.deviceId">@device.label</option>
    }
</select>
<br />

<video id="@idVideo" width="480" height="360" />
<canvas style="display:none;" id="@idCanvas" width="480" height="360" />
<br />

<button @onclick="CaptureFrame">Capture Frame</button>

<script>
    async function getDevices()
    {
        await navigator.mediaDevices.getUserMedia({video: true});
        var rsts = await navigator.mediaDevices.enumerateDevices();
        return rsts.filter(d => d.kind === 'videoinput').map(device => {
            return {
                label: device.label,
                deviceId: device.deviceId,
            }
        });
    }

    function startVideo(id, device) {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({
                  video: {
                    deviceId: {exact: device},
                    //facingMode: { exact: "environment" },
                  },
            }).then(function (stream) {
                let video = document.getElementById(id);
                if ("srcObject" in video) {
                    video.srcObject = stream;
                } else {
                    video.src = window.URL.createObjectURL(stream);
                }
                video.onloadedmetadata = function (e) {
                    video.play();
                };
            });
        }
    }

    function getFrame(src, dest, dotNetHelper) {
        debugger;
        let video = document.getElementById(src);
        let canvas = document.getElementById(dest);
        canvas.getContext('2d').drawImage(video, 0, 0, 480, 360);

        let dataUrl = canvas.toDataURL("image/png");
        dotNetHelper.invokeMethodAsync('RecieveImage', dataUrl);
    }
</script>

@inject IJSRuntime JS
@code {
    [Parameter]
    public EventCallback<byte[]> OnCapture { get; set; }

    private VideoDevices[] devices = [];

    [JSInvokable]
    public void RecieveImage(string imageUrl)
    {
        // data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...
        var imageBase64 = imageUrl.Split(',')[1].Replace('-', '+').Replace('_', '/');
        // padding
        for(int i = 0; i < (imageBase64.Length % 4); i++)
        {
            imageBase64 += "=";
        }
        var imageData = Convert.FromBase64String(imageBase64);
        OnCapture.InvokeAsync(imageData);
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            devices = await JS.InvokeAsync<VideoDevices[]>("getDevices", idVideo);
            StateHasChanged();
        }
    }

    private async Task Selected(ChangeEventArgs args)
    {
        var device = args.Value as string;
        if (string.IsNullOrWhiteSpace(device))
        {
            return; 
        }
        await JS.InvokeVoidAsync("startVideo", idVideo, device);
    }

    private async Task CaptureFrame()
    {
        var rst = await JS.InvokeAsync<String>("getFrame", idVideo, idCanvas, DotNetObjectReference.Create(this));
    }

    private string idVideo = Guid.NewGuid().ToString();
    private string idCanvas = Guid.NewGuid().ToString();

    internal record VideoDevices(string label, string deviceId);
}
```


```razor
public partial class Home : ComponentBase
{
    [Inject]
    public IChatClient ChatClient { get; set; } = default!;

    // アップロードする画像のサイズ上限
    int MaxImageUploadSize = 1024;

    // サムネイルのサイズ
    int ThumbnailSize = 400;

    // AIに指示出しを行うためのプロンプト
    /* 日本語訳:
    提供された画像からロット番号と有効期限に対応する文字列を抽出し、次のJSON形式で応答してください。
    { "lotno": "(ロット番号に対応する文字列)", "expiration": "(有効期限、yyyy-mm-dd形式で出力)" }
    適切な情報が画像内に存在しない場合、または自信がない場合は、テキストを生成する代わりにnullを適用してください。
    再掲: 画像からロット番号と有効期限を抽出してください。
    */
    string OcrSystemPrompt { get; set; } = """
            Extract the strings corresponding to the lot number and expiration date from the provided image and respond in the following JSON format:
            { "lotno": "(String corresponding to lot number)", "expiration": "(Expiration date, output in yyyy-mm-dd format)" }
            If the appropriate information does not exist within the image, or if you are not confident, apply null instead of generating text.
            REMINDER: Extract the lot number and expiration date from the image.
            """;

    // AIにサンプルを提供するためのプロンプト
    string OcrSampleExport = """
        {"lotno": "SAMPLE123", "expiration": null}
        """;

    // アップロードした画像のBase64形式
    string? UploadImageBase64 { get; set; }

    // OCRの読み取り中かどうか
    bool IsOcrLoading { get; set; } = false;

    // OCRの結果(生文字列)
    string? OcrResponseMessage { get; set; }

    // OCRの結果(JSONパースできたかどうか)
    bool? TryOcrResultParseResult { get; set; }

    // 画像ファイルをアップロードする
    private async Task UploadFiles(IBrowserFile file)
    {
        // 以下のタスクを並列で実行する。
        // 1. OCRを試行して、その後結果をパースしてみる
        // 2. サムネイルを作成する
        await Task.WhenAll(
            [
                Task.Run(async () =>
                {
                    await TryOcr(file);
                    TryOcrResultParse();
                }),
                CreateThumbnailAsync(file),
            ]
        );
    }

    // AIを使用してOCRを試行する
    private async Task TryOcr(IBrowserFile file)
    {
        IsOcrLoading = true;
        TryOcrResultParseResult = null;
        // そのまま読み込ませると落ちるので、縮小して利用する
        var largeFile = await file.RequestImageFileAsync(
            "image/png",
            MaxImageUploadSize,
            MaxImageUploadSize
        );
        var bufferLarge = await LoadImageFromFileAsync(largeFile);
        await TryOcr(bufferLarge);
    }

    private async Task TryOcr(byte[] bufferLarge)
    {
        // AIにクエリを投げる。
        // 1. システムプロンプト(振る舞い)
        // 2. ユーザー入力とその応答をサンプルとして提供(出力を安定させるため)
        // 3. ユーザー入力(実際の入力)
        // 3のタイミングで、縮小させた画像を添付する。
        var systemPrompt = new ChatMessage(ChatRole.System, OcrSystemPrompt);
        var sampleUserPrompt = new ChatMessage(ChatRole.User, "Extract the lot number.");
        var sampleAssistPrompt = new ChatMessage(ChatRole.Assistant, OcrSampleExport);
        var userPrompt = new ChatMessage(ChatRole.User, "Extract the lot number.");
        userPrompt.Contents.Add(new DataContent(bufferLarge, "image/png"));
        // AIにクエリを投げる
        try
        {
            var response = await ChatClient.GetResponseAsync(
                [systemPrompt, sampleUserPrompt, sampleAssistPrompt, userPrompt],
                new() { Seed = 42, ResponseFormat = ChatResponseFormat.Json  }
            );
            OcrResponseMessage = response.Text;
        }
        catch (Exception ex)
        {
            OcrResponseMessage = ex.Message;
        }
        finally
        {
            IsOcrLoading = false;
            await InvokeAsync(StateHasChanged);
        }
    }

    // OCR結果をパースできるか試す
    private void TryOcrResultParse()
    {
        // 結果を正常にパースできるかを確認する。
        var resultMessage = OcrResponseMessage;
        if (resultMessage is null)
        {
            return;
        }
        try
        {
            var result = JsonSerializer.Deserialize<OcrResult>(resultMessage);
            TryOcrResultParseResult = result is not null;
        }
        catch
        {
            TryOcrResultParseResult = false;
        }
    }

    // サムネイルを作成する
    private async Task CreateThumbnailAsync(IBrowserFile file)
    {
        var smallFile = await file.RequestImageFileAsync("image/png", ThumbnailSize, ThumbnailSize);
        var bufferSmall = await LoadImageFromFileAsync(smallFile);
        UploadImageBase64 = $"data:image/png;base64,{Convert.ToBase64String(bufferSmall)}";
        await InvokeAsync(StateHasChanged);
    }

    // IBrowserFileからbyte[]に変換する
    private async Task<byte[]> LoadImageFromFileAsync(IBrowserFile file)
    {
        const long MaxFileSize = 1024 * 1024 * 500;
        var readStream = file.OpenReadStream(MaxFileSize);
        var buf = new byte[readStream.Length];
        var ms = new MemoryStream(buf);
        await readStream.CopyToAsync(ms);
        var buffer = ms.ToArray();
        return buffer;
    }
}

public record OcrResult(string? LotNo, string? Expiration);
```
