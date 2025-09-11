---
title: "【Blazor】Webカメラから画像を読み取ってAIにリクエストを投げる"
emoji: "🌍️"
type: "tech"
topics: ["dotnet", "blazor", "ai", "webcamera"]
published: false
---

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

// configure ai
IChatClient chatClient = new ChatClient(
    "Qwen/Qwen2-VL-7B-Instruct-AWQ",
    new ApiKeyCredential("test"),
    new OpenAIClientOptions() { Endpoint = new Uri("http://172.21.46.28:11600/v1") }
).AsIChatClient();
builder.Services.AddChatClient(chatClient).UseLogging();

//
services.AddSignalR(e =>
{
    e.MaximumReceiveMessageSize = 102400000;
});
```

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
<canvas  id="@idCanvas" width="320" height="240" />
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
        canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);

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
