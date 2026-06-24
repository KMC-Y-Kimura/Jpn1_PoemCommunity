# 詩コミュニティサイト

Firebase 向けの詩コミュニティサイトです。

## 実装済み機能

- 詩の一覧表示
- 題名・本文・タグ・投稿者名での検索
- タグ絞り込み
- ジャンル絞り込み
- 新着順 / 古い順 / 人気順ソート
- 作品詳細モーダル
- いいね
- コメント
- マイページ
- 自作品の編集 / 削除
- デモモード
- Firebase Authentication のメールアドレス登録 / ログイン
- Firebase Hosting の `web.app` 公開前提

## ファイル構成

- `index.html`: 本体
- `styles.css`: デザイン
- `config.js`: サイト名と Firebase 接続設定
- `js/app.js`: UI ロジック
- `js/data-service.js`: デモ / Firebase 両対応のデータ層
- `js/demo-data.js`: デモデータ
- `firebase.json`: Hosting と Firestore の設定
- `firestore.rules`: Firestore セキュリティルール
- `firestore.indexes.json`: Firestore インデックス

## すぐ試す方法

1. このフォルダでローカルサーバを起動

```bash
cd （ディレクトリ）
python3 -m http.server 8000
```

2. ブラウザで `http://localhost:8000` を開く
3. `config.js` が空のままなので、最初はデモモードで動く

ポート `8000` が使用中で `OSError: [Errno 48] Address already in use` が出る場合:

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

そのポートを使っているプロセスを止めるか、別ポートで起動してください。

```bash
python3 -m http.server 8001
```

その場合は `http://localhost:8001` を開きます。

## 今すぐ無料公開する方法

### 1. Firebase プロジェクトを作る

- Firebase Console で新規プロジェクトを作る
- Web アプリを追加する
- 表示された Firebase 設定オブジェクトを控える

### 2. Authentication を有効化する

- Firebase Console
- `Authentication`
- `Sign-in method`
- `Email/Password` を有効化

### 3. Firestore Database を作る

- Firebase Console
- `Firestore Database`
- データベースを作成
- ロケーションは近い地域を選ぶ

### 4. `config.js` を編集する

```js
export const SITE_CONFIG = {
  siteName: "余白に詩を",
  siteTagline: "言葉を置いて、誰かの余白に届かせるための詩のコミュニティ",
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    appId: "YOUR_APP_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
  },
  enableComments: true,
  maxPoems: 100,
};
```

注意:

- `apiKey` はフロントエンドに置く想定の公開用キーです。
- ただし、保護は `firestore.rules` で行うので、ルールを未反映のまま公開しないでください。

### 5. Firebase へログインする

グローバルインストールを避けるなら `npx` で十分です。

```bash
npx firebase-tools login
```

### 6. プロジェクトをこのフォルダへ紐づける

```bash
npx firebase-tools use --add
```

指示に従って Firebase プロジェクトを選びます。

### 7. ルール・インデックス・Hosting をデプロイする

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,hosting
```

完了後、`https://PROJECT_ID.web.app` が公開URLになります。

## 客観的な補足

この実装は「今すぐ無料で公開する」ことを優先しています。
そのため、次の意味で本格運営向けの防御はまだ弱いです。

- 通報機能なし
- 管理者画面なし
- NG ワード判定なし
- レート制限なし
- Bot 対策なし

つまり、小規模公開や授業用には十分ですが、完全公開の実運用としては追加対策が必要です。

## 先に追加したほうがよいもの

1. App Check または CAPTCHA 系の導入
2. 通報テーブルと管理者削除フロー
3. 投稿ガイドラインの明示
4. コメント削除機能

## 仕様上の前提

- 誰でも閲覧可能
- 投稿・コメント・いいねはログイン後
- アカウントはメールアドレス + パスワード
- 管理者機能は未実装
- デザインは静かな文芸サイト寄り

仕様を変えたい場合、次はすぐ差し替えできます。

- 匿名投稿にする
- コメントを消す
- 学内限定向けにする
- 投稿を下書き制にする
- 短歌 / 俳句 / 自由詩で投稿フォームを分ける
