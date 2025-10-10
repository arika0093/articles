---
title: "【C#】File.Replaceはatomicに更新を行うのか？"
emoji: "🛠️"
type: "tech"
topics: ["csharp", "dotnet"]
published: true
---

`File.Replace`のファイル置き換えは果たしてatomicに行われるのかどうかを調べてみます。

## atomicとは

端的に言うと、更新中に何らかの障害（電源OFF、アプリ異常終了など）が発生しても、ファイルが壊れないようにすることです。
特にファイルの書き込み中に一部分だけ更新されていると不正なファイルになってしまうので、それを防ぐ処置を指します。  
上記を実現する更新のことを、この記事では「atomic更新」と呼ぶことにします。

## 一般的なatomic更新の方法
普通に書き込みを行うと障害時に破損する可能性があるため、以下のような手順を踏みます。

1. 新しい内容を一時ファイルに書き込む
2. 一時ファイルを本来のファイルに置き換える

まず、一時ファイルに書き込む時点では本来のファイルは変更されていないので、障害が発生しても大元は無事です。
次に、一時ファイルを本来のファイルに置き換える際に、OSの提供する「ファイル置き換え」APIを使います。
このAPIは（一般的には）ディレクトリのエントリを書き換える挙動をします。OSレベルでatomic性が保証されている場合は、こちらも置き換えが完了するか・完全に失敗するかのどちらかになります。

## C#でのatomic更新

さて、atomic更新の重要性が分かったところで、C#ではどうするのが正解なのか？という話です。
上記の手順を素直に書くとこのようなコードになります。（異常系は省略）

```csharp
var contents = "new content";
var original = "data.txt";
var backup = "data.txt.bak";
var temp = "data.txt.tmp";

// 1. 新しい内容を一時ファイルに書き込む
File.WriteAllText(temp, contents);
// 2. 一時ファイルを本来のファイルに置き換える
File.Replace(temp, original, backup);
// 置き換えに成功したら一時ファイルは不要なので削除
File.Delete(temp);
```

ここで`File.Replace`が期待通りの挙動をしていれば、上記のコードでatomic更新が実現できます。
で、実際のところどうなのか？ というのが今回の調査テーマです。

## File.Replaceの挙動を追う
dotnetのコードを追っていきます。

まず、`File.Replace`から。 そのまんま`System.IO`にいます。[^1]

[^1]: https://github.com/dotnet/runtime/blob/9fb66db5ab5baae0269a0e5e2a79ee0e6f6b8f81/src/libraries/System.Private.CoreLib/src/System/IO/File.cs#L1023-L1033

```csharp
// System.IO.File
public static void Replace(string sourceFileName, string destinationFileName, string? destinationBackupFileName, bool ignoreMetadataErrors)
{
    // 略
    FileSystem.ReplaceFile(
        Path.GetFullPath(sourceFileName),
        Path.GetFullPath(destinationFileName),
        destinationBackupFileName != null ? Path.GetFullPath(destinationBackupFileName) : null,
        ignoreMetadataErrors);
}
```

ここで呼んでいる`FileSystem.ReplaceFile`の中身がWindowsとUnixで分岐しています。

### Windowsの場合

`FileSystem.Windows.cs`にいます。[^2]

[^2]: https://github.com/dotnet/runtime/blob/9fb66db5ab5baae0269a0e5e2a79ee0e6f6b8f81/src/libraries/System.Private.CoreLib/src/System/IO/FileSystem.Windows.cs#L88-L96

```csharp
public static void ReplaceFile(string sourceFullPath, string destFullPath, string? destBackupFullPath, bool ignoreMetadataErrors)
{
    int flags = ignoreMetadataErrors ? Interop.Kernel32.REPLACEFILE_IGNORE_MERGE_ERRORS : 0;

    if (!Interop.Kernel32.ReplaceFile(destFullPath, sourceFullPath, destBackupFullPath, flags, IntPtr.Zero, IntPtr.Zero))
    {
        // 略
    }
}
```

ここで呼んでいる`Interop.Kernel32.ReplaceFile`でWindows APIの`ReplaceFile`を呼んでいます。

この`ReplaceFile`ですが、[公式ドキュメント](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilea)に特にatomicに関する記述はありません。が、[Transactional NTFS (TxF)のページ](https://learn.microsoft.com/ja-jp/windows/win32/fileio/deprecation-of-txf)に以下のような記述があります。

> (英語版ページ): Many applications which deal with "document-like" data tend to load the entire document into memory, operate on it, and then write it back out to save the changes. The needed atomicity here is that the changes either are **completely applied or not applied at all**, as an inconsistent state would render the file corrupt. A common approach is to write the document to a new file, then replace the original file with the new one. One method to do this is with the **ReplaceFile API.**

> (日本語版ページ): "ドキュメントに似た" データを扱う多くのアプリケーションでは、ドキュメント全体をメモリに読み込み、操作し、書き戻して変更を保存する傾向があります。 ここで必要な原子性は、一貫性のない状態ではファイルが破損するため、**変更が完全に適用されるか、まったく適用されない**ことです。 一般的な方法は、ドキュメントを新しいファイルに書き込み、元のファイルを新しいファイルに置き換える方法です。 これを行う方法の 1 つは、 **ReplaceFile API** です。

この記述から、WinAPIの`ReplaceFile`はatomic更新をサポートしていると解釈できそうです。

### Unixの場合
`FileSystem.Unix.cs`を見てみます。[^4]

[^4]: https://github.com/dotnet/runtime/blob/9fb66db5ab5baae0269a0e5e2a79ee0e6f6b8f81/src/libraries/System.Private.CoreLib/src/System/IO/FileSystem.Unix.cs#L122-L181

```csharp
public static void ReplaceFile(string sourceFullPath, string destFullPath, string? destBackupFullPath, bool ignoreMetadataErrors /* unused */)
{
    // 略
    if (destBackupFullPath != null)
    {
        if (Interop.Sys.Unlink(destBackupFullPath) != 0)
        {
            // エラー処理
        }
        LinkOrCopyFile(destFullPath, destBackupFullPath);
    }
    else
    {
        if (Interop.Sys.Stat(destFullPath, out _) != 0)
        {
            // エラー処理
        }
    }
    Interop.CheckIo(Interop.Sys.Rename(sourceFullPath, destFullPath));
}

private static void LinkOrCopyFile (string sourceFullPath, string destFullPath)
{
    if (Interop.Sys.Link(sourceFullPath, destFullPath) >= 0)
        return;
    Interop.ErrorInfo errorInfo = Interop.Sys.GetLastErrorInfo();
    if (/* 略 */)
    {
        CopyFile(sourceFullPath, destFullPath, overwrite: false);
    }
    else
    {
        // エラー処理
    }
}
```

主な流れとしては

* バックアップファイルが指定されていれば、既存のバックアップファイルを削除する
* 本来のファイルをバックアップファイルにコピーする(指定があれば)
* `rename`で一時ファイルを本来のファイルに置き換える

となっており、こちらもatomic更新が実現できているように見えます。

念の為更に掘り下げてみましょう。

`Interop.Sys.Rename`を見てみると、以下のようになっています。[^5]

[^5]: https://github.com/dotnet/runtime/blob/9fb66db5ab5baae0269a0e5e2a79ee0e6f6b8f81/src/libraries/Common/src/Interop/Unix/System.Native/Interop.Rename.cs#L20-L21

```csharp
[LibraryImport(Libraries.SystemNative, EntryPoint = "SystemNative_Rename", StringMarshalling = StringMarshalling.Utf8, SetLastError = true)]
internal static partial int Rename(string oldPath, string newPath);
```

ここで、`Libraries.SystemNative`は`libSystem.Native.so`を指しています。[^6]

[^6]: https://github.com/dotnet/runtime/blob/9fb66db5ab5baae0269a0e5e2a79ee0e6f6b8f81/src/libraries/Common/src/Interop/Unix/Interop.Libraries.cs#L11

```csharp
internal const string SystemNative = "libSystem.Native";
```

この`libSystem.Native.so`のコードももちろん公開されていて、[ここ](https://github.com/dotnet/runtime/tree/main/src/native/libs/System.Native)にいます。

この中の`pal_io.c`に`SystemNative_Rename`の実装があります。[^7]

[^7]: https://github.com/dotnet/runtime/blob/9fb66db5ab5baae0269a0e5e2a79ee0e6f6b8f81/src/native/libs/System.Native/pal_io.c

```c
int32_t SystemNative_Rename(const char* oldPath, const char* newPath)
{
    int32_t result;
    while ((result = rename(oldPath, newPath)) < 0 && errno == EINTR);
    return result;
}
```

そのまま、`rename`を呼んでいるだけです。`rename`はPOSIX標準の関数で、[こちら](https://pubs.opengroup.org/onlinepubs/9699919799/functions/rename.html)に仕様が書かれています。
この中に

> (原文): This rename() function is equivalent for regular files to that defined by the ISO C standard. Its inclusion here expands that definition to include actions on directories and specifies behavior when the new parameter names a file that already exists. That specification **requires that the action of the function be atomic**.

> (和訳): この rename() 関数は、通常のファイルに関しては ISO C 標準で定義されているものと同等です。ここでのその定義への追加は、ディレクトリに対する操作を含むようにし、新しいパラメータが既に存在するファイルの名前を指定する場合の動作を指定します。その仕様は、**関数の動作がアトミックであること**を要求しています。

とあるため、仕様上atomic更新が保証されていることが分かります。

## 結論

* `File.Replace`はWindowsでは`ReplaceFile`、Unixでは`rename`を使っている
* Windowsの場合は明言されていないが、TxFの代替手段としての記述からatomic更新がサポートされていると考えられる
* Unixの場合はPOSIX標準でatomic更新が保証されている
* よって、C#の`File.Replace`はatomic更新を行うと考えられる

## 補足
いくら調べてもstackoverflowの根拠がない回答ぐらいしか出てこず、出てくる記事も全体的に古かったので改めて調査しました。

## 参考文献
* https://yohhoy.hatenadiary.jp/entry/20151010/p1
* https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilea
* https://learn.microsoft.com/ja-jp/windows/win32/fileio/deprecation-of-txf
* https://heartbeats.jp/hbblog/2013/10/atomic01.html