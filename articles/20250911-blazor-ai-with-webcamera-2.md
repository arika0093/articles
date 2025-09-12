---
title: "Webカメラで画像を読み取ってAIにOCRしてもらう(OCR編)"
emoji: "🌍️"
type: "tech"
topics: ["dotnet", "csharp", "blazor", "ai", "ocr"]
published: false
---


## C#側の実装


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
    }
).AsIChatClient();

builder.Services.AddChatClient(chatClient).UseLogging();
```

## Webカメラから画像を読み取る

```cs
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
