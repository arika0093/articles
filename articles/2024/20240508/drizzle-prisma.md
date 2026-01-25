---
title: "drizzleでできることをprismaと比較しながら確認する"
pubDatetime: 2025-06-22T21:55:31+09:00
modDatetime: 2026-01-25T23:20:04+09:00
published: false
tags: []
zenn:
  published: false
  emoji: "😎"
  type: "tech"
  topics: []
---


drizzleを使っていきます。
https://orm.drizzle.team/

## drizzleとは
一言で言えば型安全なSQLといった感触。
ORM(prismaとか)を使うと
* 複雑なJOIN(例えば`t1.datetime >= t2.datetime`)ができない/やりにくい
* 循環参照するクエリを書きにくい(グラフみたいな親・子を持つデータとか)
* 凝ったクエリを書けない(例として:特定列を除外する、SQL関数をかませる、etc)

といった課題に悩まされ、かたやSQLを素で書くと
* （ファイルを分離しない場合）syntax highlightが効かず読みにくい
* 型で守られない

という悲しみがある。
そういった課題をかなり高水準で解決できそうな良さがあるのでメモ。

## drizzle-orm/kitの使い分け
* `drizzle-orm`: DB取得操作・型定義・マイグレーション。
* `drizzle-kit`: SQL生成・DBプッシュ・instrospect(既存DBからの型生成)。

基本的に`drizzle-orm`だけで簡潔する。
ただしSQLファイルを生成してmigration管理をする場合は`drizzle-kit`も使う。
わかりにくいがmigrationだけは`drizzle-orm`を使う。
（たぶんSQLの反映だけがコア機能で、そのSQL自動生成がkit側に分離されてるような感じ。分かれてる理由は謎）

## prismaとの差
prismaみたいな感じかと思いきや結構違う。

### スキーマ定義
prismaの場合は`schema.prisma`という専用のテーブル定義ファイルからDBおよび型定義を生成する。どのDBを使うかなどの情報はschemaにそのまま書かれる。
```prisma
model Todo {
	id        Int      @id @default(autoincrement())
	title     String
}
```

drizzleの場合はtypescriptファイル `schema.ts` に型定義を書いて、それをコネクタ経由(次で説明)で読ませる。
ここでテーブル定義情報がtypescriptで書かれていることがポイント。
```typescript
export const todo = pgTable("todo", {
	id: serial("id").primaryKey(),
	title: text("title"),
});
```

### 接続
prismaの場合は`PrismaClient`経由で接続する。接続先情報等は`schema.prisma`に書かれている。
```ts
const prisma = new PrismaClient();
await prisma.todo.findMany({});
```

drizzleの場合はコネクタに上記のスキーマ情報を読ませて接続する。
接続先情報は接続するコネクタ側で参照する。
```ts
import { drizzle } from 'drizzle-orm/postgres-js'; // これがdrizzleのコネクタ
import postgres from 'postgres'; // これが実際のDB接続
import * as schema from '~/db/schema'; // スキーマをこんな感じで参照する

// 最初に接続情報でclientを生成し
const queryClient = postgres(process.env.LOCAL_DATABASE_URL);
// そのclient+schemaをdrizzleに渡す
const db = drizzle(queryClient, { schema });
// そのdbを使ってクエリを書く
const todos = await db.query.todo.findMany();
```

コネクタの中間層が入ることで、複数のDBに接続できたり、schemaに型情報が入っているので今後の取り回しが良かったりする。  
ただし、postgresと一言で言っても色々コネクタがあるので、そのあたりの取り回しが手間といえば手間。柔軟性が高いとも言う。
```
schema.ts -> postgres.ts (普通に接続する)
          -> neon.ts (neonを使ってserverless接続する)
```

### generate
prismaの場合は`prisma generate`で型定義ファイルを生成する。
drizzleの場合は`schema.ts`をそのまま流用できるのでこの操作はいらない（`generate`は別のコマンドになっている。後述）
型定義が欲しい場合は
```ts
// todoというテーブル定義があったとして
const todo = pgTable("todo", {
	id: serial("id").primaryKey(),
	title: text("title"),
});
// これだけで良い
type Todotype = typeof todo.$inferSelect;
// {
//    id: number;
//    title: string | null;
// }
```

zod schemaがほしい場合は
```ts
// npm i drizzle-zod
import { createInsertSchema } from 'drizzle-zod';
export const TodoSchema = createInsertSchema(todo)
// {
//     id: z.ZodNumber;
//     title: z.ZodOptional<z.ZodNullable<z.ZodString>>;
// }
```
すごいなこれ。。。



### migration
prismaの場合はコマンドラインから`prisma migrate dev`でSQLファイル生成&マイグレーション。
ローカル開発のときは`prisma db push`。

drizzleの場合はちょっとややこしくて
1. `drizzle-kit generate:pg`でSQLやメタ情報ファイルを生成
2. (drizzle-ormを使う場合)`migrate.ts`のようなtypescriptファイル経由でマイグレーションする。
prismaでいうところの`migrate dev --create-only`が1.に相当する。
都度SQLを確認したいことも多いだろうし、そもそもdrizzle-orm必須というわけでもないのでこっちのほうが良いと感じるが、初見ではちょっと困惑した。

2.のtypescriptファイルでSQLクエリの出力先やその他オプションを定義する。
実際行うときは`tsx migrate.ts`みたいな感じ。ここはprismaのほうがわかりやすい。
なお、ローカルに直反映させるときは`drizzle-kit push:pg`でいい。

### テーブル定義
基本的にはそれぞれで似たようなことはできる。
詳細を書くと長くなってしまうのでそれぞれのドキュメントを見たほうが早いが、大雑把に言えば**Prismaは簡潔明快、drizzleは柔軟**といった感じ。
個人的にはdrizzleのほうが良い。書くのがだるいのは面倒なだけだが、できないことがある(それも割と頻出)場合に困るのは致命的。
素のクエリを書く手もあるが、その場合ORMの恩恵がかなり弱くなってしまうので。。。

* prisma側の利点
	* 基本的に記法がシンプル わかりやすい
		* 凝ったことはやりにくい裏返しでもある
	* `@relation`でリレーションを定義できる
		* drizzleでもできるが、prismaのほうが記法が簡潔
			* 凝ったことはやりにくい
	* `@default`でデフォルト値を簡単に定義できる
		* drizzleでもできるが、prismaのほうがシンプルかな？
		* `autoincrement`とか`updatedAt`とかのよく使う系のsyntaxがあるのが良い
	* 各DBごとの違いを吸収してくれる
		* drizzleはDBごとに使う型が違うので、DBを変えるときにちょい手間。そんな機会そうそうないと思うけど。

* drizzle側の利点
	* `timestamp`においてtimezoneの設定が簡単。
		* `timestamp("created_at", { withTimezone: true })`と書くだけ
		* タイムゾーンがないtimestampは微妙すぎるので、これはかなりありがたい
	* `json`や`jsonb`の型指定を簡単にかける
		* `json("data").$type<DataType>()`のように書く。
			* もちろんこの`DataType`は`zod`のスキーマから`z.infer`で生成できる
		* `select`,`query`,`insert`などのメソッドで型が保証される（すごい！）
		* prismaの場合は外付けプラグインで無理やり対処しないといけない
	* `relation`と`references`の使い分け
		* `relation`は`join`時に使う。
			* テーブル間の関係をdrizzle-ormに教える用
		* `references`は`foreign key`を定義するときに使う。
			* 要するに値制約。drizzle-kitに教える用
		* relationだけ定義することで、foreign keyがなくても仮想的にJOINできる。

* knexなどの素SQLライブラリと比較した利点
	* 型定義を（二重に）書かなくても良い
		* フルスタックで作るときはもとより、他人のDBを参照するときも`instrospect`で型定義を生成できる
		* これはprisma/drizzle共通だが、複数スキーマを参照するときにはdrizzleのほうが楽

* sqlalchemyなどの（よくある）ORMライブラリと比較した利点
	* ちゃんと使ったこと無いのでエアプではあるのですが
	* N+1問題が起きにくい
		* drizzleの場合は単一SQLとして発行される
	* テーブル定義が明確
		* 個人的には`schema`ファイルにまとまってるのが見通しよくてありがたい

## プラスアルファの機能
### graphql
なんかちゃっかり1行でgraphqlサーバーを生成できたりする。後で試してみたい。
https://orm.drizzle.team/docs/graphql


## わかりにくい点
ドキュメントをよく読めば書いてあるのだが、初見だとわかりにくい。。

### `id`列のautoincrement
`serial`を使って、`id: serial("id").primaryKey()`のように書く。

### indexの引き方
pgTableの第二引数で指定する。
```ts
export const user = pgTable("user", {
	id: serial("id").primaryKey(),
	name: text("name"),
	email: text("email").unique(),
	password: text("password"),
}, (users) => {
	return {
		userNameIndex: index("user_name").on(users.name), // ここ
	}
});
```
ここで複合PrimaryKey/UniqueKeyなども指定する。
https://orm.drizzle.team/docs/indexes-constraints

### relationとreferenceの使い分け
TL;DR: `select`しか使わないならreferenceだけ、`query`でJOINするならrelationとreference**両方**書く。
https://orm.drizzle.team/docs/rqb


### [migrate]空のSQLファイルを生成する
`npx drizzle-kit generate:pg --custom`で生成。
prismaでいうところの`prisma migrate dev --create-only`に相当。
これで生成してからVIEW定義を書くのが現状のやり方になるかな。

### [migrate]migrateを取り消す
`drizzle-kit drop`
CLI上でどのmigrateを消すか選べる。**手動でファイルを消さないこと**


## できないこと
* viewの定義
	* 参照はできるが、テーブル定義の生成ができない
		* 手でクエリを書くしかない
		* [Pull-Requestはある](https://github.com/drizzle-team/drizzle-orm/pull/1778)ので今後に期待

## バグ等
### `serial`列でエラーが出る
`error: type "serial" does not exist`のような出力。  
一度integerでpushしたあとにserialに変更するとエラーが出る様子。
解決策としてはスキーマファイルを全てCOしてpush→もとに戻して再度push。
https://github.com/drizzle-team/drizzle-orm/issues/663


## その他
**便利Tips集**
https://orm.drizzle.team/docs/goodies
