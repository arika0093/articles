---
title: "【C#】Prismaのような書き心地をEFCoreでも実現！Linqraftの紹介"
emoji: "📖"
type: "tech"
topics: ["csharp", "dotnet", "interceptor", "source-generator"]
published: true
---

先日、[Linqraft](https://arika0093.github.io/Linqraft/)というC#のライブラリを公開しました！この記事ではその紹介をしたいと思います。
![ちょっと頑張って作ったトップページ](image-1.png)

## 動機
C#は[素晴らしい言語](https://blog.neno.dev/entry/2025/04/14/130323)です。強力な型安全性、分厚い標準ライブラリ、GUIアプリの開発からWEB構築まで、おおよそあらゆる用途に対応できて素晴らしい言語だと思っています。

そんなC#ですが、私が日頃からフラストレーションを感じていることがあります。



それは「**クラス定義がめんどくさい！**」そして「**Selectクエリを書くのがめんどくさい！**」ということです。


C#は静的型付け言語なので、基本的に使用したいクラスはすべて定義しなければなりません。それ自体はある程度しょうがないのですが、派生クラスの定義についても都度行わなければならないのが非常に面倒です。
特にORM(Object-Relational Mapping)を使用してDBアクセスを行う場合、欲しいデータの形は毎回**DTO**(Data Transfer Object)として定義しなければならず、同じようなクラス定義を何度も書くことになります。

TypescriptのORMである[Prisma](https://www.prisma.io/)と比較してみましょう。Prismaでは以下のように書けます。

```typescript
// userの型はスキーマファイルから自動生成される
const users = await prisma.user.findMany({
  // 欲しいデータの内容をselectで指定する
  select: {
    id: true,
    name: true,
    posts: {
      // 関連テーブルのデータも同様にselectで指定できる
      select: {
        title: true,
      },
    },
  },
});

// usersの型は自動的に以下のようになる (自動でやってくれる！)
// この型を再利用するのも簡単にできる
type Users = {
  id: number;
  name: string;
  posts: {
    title: string;
  }[];
}[];
```

同じことをC#のEFCoreでやろうとすると、以下のようになります。

```csharp
// Usersの型は別ファイルで定義されているものとする
var users = dbContext.Users
    // Selectで欲しいデータを指定するのは一緒
    .Select(u => new UserWithPostDto
    {
        Id = u.Id,
        Name = u.Name,
        // 子クラスも同じようにSelectで指定
        Posts = u.Posts.Select(p => new PostDto { Title = p.Title }).ToList()
    })
    .ToList();

// DTOクラスを自分で定義しなければならない！
public class UserWithPostDto
{
    public int Id { get; set; }
    public string Name { get; set; }
    public List<PostDto> Posts { get; set; }
}
// 子クラスも同様
public class PostDto
{
    public string Title { get; set; }
}
// Userクラスがあるのだから、そこから自動生成できてもよさそうだけど……
```

これに関しては明確にPrismaのほうが楽で便利だなあと感じます。そもそもUsers型自体をクラスとして定義しているのに[^1]、なんでわざわざ派生型のDTOクラスまで自分で定義しなきゃいけないんだ、という感じです。

[^1]: prismaでいうところのスキーマをC#ではクラスで定義しているイメージです。ここはそんなに苦ではない。

上記ぐらいの規模程度ならまだ我慢できるのですが、もっと複雑なケースになるとさらに辛くなります。

```csharp
var result = dbContext.Orders
    .Select(o => new OrderDto
    {
        Id = o.Id,
        Customer = new CustomerDto
        {
            CustomerId = o.Customer.Id,
            CustomerName = o.Customer.Name,
            // めんどくさいポイント
            CustomerAddress = o.Customer.Address != null
                ? o.Customer.Address.Location
                : null,
            // 毎回チェックしたくないのでまた別のDTOにまとめたり
            AdditionalInfo = o.Customer.AdditionalInfo != null
                ? new CustomerAdditionalInfoDto
                {
                    InfoDetail = o.Customer.AdditionalInfo.InfoDetail,
                    CreatedAt = o.Customer.AdditionalInfo.CreatedAt
                }
                : null
        },
        Items = o.Items.Select(i => new OrderItemDto
        {
            ProductId = i.ProductId,
            Quantity = i.Quantity,
            // 配列の場合も同様。読みにくい……
            ProductComments = i.CommentInfo != null
                ? i.CommentInfo.Comments.Select(c => new ProductCommentDto
                {
                    CommentText = c.CommentText,
                    CreatedBy = c.CreatedBy
                }).ToList()
                : new List<ProductCommentDto>()
        }).ToList()
    })
    .ToList();

// わざわざ書かないが、上記で使われているDTOクラス群もすべて定義が必要
```

そもそも上記だけでDTOの数が5個もあってその時点で面倒極まりないのですが、さらにめんどくさい要素として「nullチェック」があります。
まず、EFCoreのSelect式内部では **`?.`(null条件演算子)が使えません** 。具体的には`Expression<...>`内部では使用できない仕様となっています。
そのため、上記のように三項演算子を使ってnullチェックを行い、nullでなければその下のメンバーにアクセスする、というコードを書くことになります。

子クラスだけならシンプルに`o.A != null ? o.A.B : null`とすればよいのですが、これが孫クラス、曾孫クラスと深くなっていくと、nullチェックのコードがどんどん増えていき、非常に読みにくくなります。

```csharp
// 信じられないほど読みにくい
Property = o.A != null && o.A.B != null && o.A.B.C != null
    ? o.A.B.C.D
    : null
```

子クラス(null可能性あり)内の配列の値を拾う時とかも同様で、かったるいコードを書く必要があります。

```csharp
// 勘弁してほしい
Items = o.Child != null
    ? o.Child.Items.Select(i => new ItemDto{ /* ... */ }).ToList()
    : new List<ItemDto>()
```

どうでしょうか。自分はめちゃくちゃ嫌です。

## 欲しいもの

改めて上記のPrismaの例を見てみると、おおよそ以下のような機能を保持しています（Typescriptの言語機能も活用して、ですが）

* クエリを一回書くと対応する型が生成される
* クエリ内でnullチェックを気にせずに`?.`などをそのまま書ける

色々と考えた結果、**匿名型**・**ソースジェネレーター**・**インターセプター**を組み合わせれば、これらの機能を実現できるのでは？と思い至りました。

## 実装に挑戦
### 匿名型を使う

皆さんはC#の匿名型をご存知でしょうか？以下のように`new { ... }`と書くとコンパイラが自動的に対応するクラスを生成してくれる機能です。

```csharp
// newの後ろに型名を書かない
var anon = new
{
    Id = 1,
    Name = "Alice",
    IsActive = true
};
```

あまり使ったことがない方もいるかと思いますが、これは`Select`クエリ内で使い捨てのクラスを定義するのに非常に便利です。

```csharp
var users = dbContext.Users
    .Select(u => new
    {
        Id = u.Id,
        Name = u.Name,
        Posts = u.Posts.Select(p => new { Title = p.Title }).ToList()
    })
    .ToList();

// 普通にアクセスして使える
var user = users[0];
Console.WriteLine(user.Name);
foreach(var post in user.Posts)
{
    Console.WriteLine(post.Title);
}
```

ただし、「匿名」型と呼ばれるように実際の型名が存在しないため、メソッドの**引数や戻り値として使うことができません**。この制約が結構つらいので意外と活躍の機会は多くありません。

### 対応するクラスを自動生成する
ということは、匿名型で定義した内容をもとに**対応するクラスを自動生成してくれるソースジェネレーター**を作ればよいのでは？となるのは自然な流れです。Linqraftではまさにこれを実現しています。

具体的には、特定のメソッド名(`SelectExpr`)をフックポイントとして、その引数として渡された**匿名型をベースにクラス定義を自動生成**します。
この際、生成されるクラス名を指定できないと不便なので、Genericsの型引数としてクラス名を指定できるようにしています。

```csharp
var users = dbContext.Users
    // この場合、UserDtoというクラスを自動生成する
    .SelectExpr<User,UserDto>(u => new
    {
        Id = u.Id,
        Name = u.Name,
        Posts = u.Posts.Select(p => new { Title = p.Title }).ToList()
    })
    .ToList();

// ---
// こんな感じのクラスが自動生成される
public class UserDto
{
    public int Id { get; set; }
    public string Name { get; set; }
    public List<PostDto_Hash1234> Posts { get; set; }
}
// 子クラスも同様に自動生成される
// 名前が被らないようにハッシュ値を自動付与
public class PostDto_Hash1234
{
    public string Title { get; set; }
}
```

渡された匿名型の要素を見て、RoslynAPIを使って対応するクラス定義を生成していくだけ（結構大変だけど！）です。シンプルですね。

この時点でクラス自動生成を実現できましたが、呼び出される`SelectExpr`の挙動を差し替えて普通の`Select`のように動作させる必要があります。
ここでインターセプターの出番です。

### インターセプターで処理を差し替える
C#にはインターセプターという機能が存在しているのをご存知でしょうか？
あまりにニッチな領域なので知っている方は少ないかと思いますが、特定のメソッド呼び出しをフックして任意の処理に差し替えることができる機能です。
.NET 8でプレビューリリース・.NET 9で安定版になっています。

と言われてもイメージが湧きにくいと思うので、以下のようなコードを考えてみましょう。

```csharp
// めちゃくちゃ時間のかかる処理を定数値で呼び出してるパターン
var result1 = "42".ComputeSomething();   // case 1
var result2 = "420".ComputeSomething();  // case 2
var result3 = "4200".ComputeSomething(); // case 3
```

定数値で呼び出しているので、コンパイル時に結果を計算することができそうです。こういった場合に、ソースジェネレーターと組み合わせてインターセプターを事前実装することで、以下のように呼び出しを差し替えることができます。

```csharp
// このクラスをSource Generatorで自動生成するイメージ。
// 公開レベルはfileでOK
file static class PreExecutedInterceptor
{
    // Roslyn APIで呼び出し元のHash値を取得して、InterceptsLocationAttributeを付与する
    [global::System.Runtime.CompilerServices.InterceptsLocationAttribute(1, "(hash of case1)")]
    // 関数名はランダムでOK。引数と戻り値は元の関数と同じにする
    public static int ComputeSomething_Case1(this string value)
    {
        // case 1の結果を事前に計算しておいて返す
        return 84;
    }

    // case 2, 3も同様
    [global::System.Runtime.CompilerServices.InterceptsLocationAttribute(1, "(hash of case2)")]
    public static int ComputeSomething_Case2(this string value) => 168;

    [global::System.Runtime.CompilerServices.InterceptsLocationAttribute(1, "(hash of case3)")]
    public static int ComputeSomething_Case3(this string value) => 336;
}
``` 

普通の拡張メソッドとして定義すると定義の重複が発生するところ、インターセプターを使うことで**呼び出し元ごとに異なる処理を差し替える**ことができます。

Linqraftではこの仕組みを使い、`SelectExpr`の呼び出しをインターセプトして普通の`Select`に差し替えるようにしています。

```csharp
// こんな呼び出しがあったとする
var orders = dbContext.Orders
    .SelectExpr<Order,OrderDto>(o => new
    {
        Id = o.Id,
        CustomerName = o.Customer?.Name,
        CustomerAddress = o.Customer?.Address?.Location,
    })
    .ToList();
```

```csharp
// 生成されたコード例
file static partial class GeneratedExpression
{
    [global::System.Runtime.CompilerServices.InterceptsLocationAttribute(1, "hash of SelectExpr call")]
    // ベースとなる匿名型の変換クエリをそのまま残す必要があるので、selectorも引数に取る（実際には使わない）
    public static IQueryable<TResult> SelectExpr_0ED9215A_7FE9B5FF<TIn, TResult>(
        this IQueryable<TIn> query,
        Func<TIn, object> selector)
    {
        // 仕様上<TIn>でしか受け取れないが、実際には元の型を知っているのでキャストする
        var matchedQuery = query as object as IQueryable<global::Order>;
        // 書かれたクエリもどきを普通のSelectに変換する
        // 先ほど作成した自動生成DTOのクラスにマッピングする
        var converted = matchedQuery.Select(s => new global::OrderDto
        {
            Id = s.Id,
            // null条件演算子を普通の三項演算子チェックに機械的に置き換え
            CustomerName = s.Customer != null ? s.Customer.Name : null,
            CustomerAddress = s.Customer != null && s.Customer.Address != null
                ? s.Customer.Address.Location
                : null,
        });
        // 仕様上<TResult>でしか返せないのでまたキャストする
        return converted as object as IQueryable<TResult>;
    }
}
```

これにより、使い手は普通の`Select`感覚で手軽にクエリを書けるようになっています！

## 既存コード置き換えのAnalyzer
さて、ここまでの話を聞いて早速試してみたい！と思った方もいるかもしれません。
そんな方のために、Linqraftでは**既存の`Select`クエリを自動的に`SelectExpr`に置き換えるRoslyn Analyzer**も提供しています。
使うのは非常に簡単で、Selectクエリの部分で右クリック→クイックアクションから一発で置き換えが可能です。
![](https://raw.githubusercontent.com/arika0093/Linqraft/refs/heads/main/assets/replace-codefix-sample.gif)

## まとめ
というわけで、Linqraftを使うと以下のようにシンプルにクエリを書くだけで、
* 対応するDTOクラスが自動生成され、
* nullチェックも気にせずに書けるようになります。

```csharp
var orders = dbContext.Orders
    .SelectExpr<Order, OrderDto>(o => new
    {
        Id = o.Id,
        // nullチェックを気にせずに?.で書ける！
        CustomerName = o.Customer?.Name,
        CustomerAddress = o.Customer?.Address?.Location,
    })
    .ToList();
// OrderDtoクラスとその中身が自動生成される！
```

自分で言うのもなんですが、かなり便利なライブラリができたのではないかと思っています。
ぜひ使ってみてください！気に入ったならスターをお願いします。
https://github.com/arika0093/Linqraft

## 余談
紹介Webページもちょっと頑張ってみました。具体的にはWebページ上で動作確認ができるようになってます！
Roslynで解読したToken情報をMonaco Editorに流し込んで色分けする機能も実装してあります。

![Playground画面](image.png)

こちらも合わせて見てみてください。
https://arika0093.github.io/Linqraft/

