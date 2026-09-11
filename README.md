# りっくく — 九九特訓

九九（かけ算）をランダム出題で特訓する、スマホ向けの PWA（Progressive Web App）です。1 回 25 問を解き、点数に応じて「ハンコ」がもらえます。過去の成績はカレンダーに記録され、連続日数（れんぞく）も表示されます。

ビルド工程のない素の HTML / CSS / JavaScript で作られており、`serve` などの静的サーバでそのまま配信できます。

## 特長

- **ランダム出題**: 2〜9 の段からランダムに 25 問を出題（1 問 4 点・100 点満点）。
- **ハンコ評価**: 100 点=「よくできました」、90〜99 点=「あとすこし」、90 点未満=「がんばりましょう」。
- **成績カレンダー**: 直近 4 週間（月曜始まり）の成績をハンコで表示。同じ日は高い方の点数を保存。
- **連続日数**: 毎日つづけた「◯日れんぞく！」を表示。
- **自動エンター**: 桁数分を入力すると自動で回答が確定するトグル（ON/OFF を記憶）。
- **効果音**: Web Audio API による正解／不正解・結果の効果音。
- **オフライン対応**: Service Worker によるキャッシュでオフラインでも起動可能。ホーム画面に追加してアプリのように使えます。
- **成績の保存**: `localStorage` に保存（サーバ不要・端末内で完結）。

## 技術スタック

- 素の HTML / CSS / JavaScript（フレームワーク・ビルド工程なし）
- PWA（Web App Manifest + Service Worker）
- Web Audio API（効果音）
- `localStorage`（成績・設定の保存）

## ディレクトリ構成

```
.
├── index.html            # 画面のマークアップ（スタート／出題／結果）
├── app.js                # 出題・採点・カレンダー・効果音などのロジック
├── styles.css            # スタイル
├── sw.js                 # Service Worker（キャッシュ戦略）
├── sw-register.js        # Service Worker の登録・更新制御
├── manifest.webmanifest  # PWA マニフェスト
├── version.json          # 公開中バージョン（更新検知に使用）
├── serve.json            # 静的サーバ（serve）用のヘッダ設定
├── icons/                # アイコン（192 / 512）
├── package.json          # 開発用スクリプトと serve の依存
└── .cursor/              # Cloud Agent 開発環境設定
```

## 開発環境のセットアップ

Node.js（v22 系で確認済み）が必要です。

```bash
# 依存（serve）をインストール
npm install

# 開発サーバを起動（http://localhost:3000）
npm run dev
```

`npm run dev` は `serve --config serve.json --listen 3000 .` を実行します。`serve.json` により `sw.js` / `version.json` などにキャッシュ無効化ヘッダが付与されるため、Service Worker の更新確認が正しく動作します。

ブラウザで <http://localhost:3000> を開いて動作を確認できます。

> メモ: `npm start` も `npm run dev` と同じコマンド（ポート 3000）です。

## バージョンの更新方法

バージョン番号は複数箇所に埋め込まれているため、更新時は次をすべて揃えてください。

- `version.json` の `version`
- `app.js` の `APP_VERSION`
- `sw.js` の `APP_VERSION`
- `sw-register.js` の `LOCAL_VERSION`
- `index.html` の `<meta name="rikkuku-version">`、冒頭スクリプトの `LOCAL` 定数、各アセットのクエリ文字列（`?v=...`）

`version.json` を公開版に上げると、古い Service Worker キャッシュに閉じ込められた端末でも `index.html` 冒頭のスクリプトが差分を検知し、キャッシュ削除と再読み込みを行って最新版に更新します。

## 遊び方

1. スタート画面の「はじめる」を押す。
2. 表示された「◯ × ◯」の答えを入力する（自動エンター ON なら桁数入力で自動確定）。
3. 25 問終わると点数とハンコが表示される。
4. 「トップに戻る」でスタート画面へ戻り、その日のハンコがカレンダーに記録される。
