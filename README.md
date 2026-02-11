# VCR Location SMS Service

kintoneのレコード追加/更新時のWebhookを受け取り、位置情報（緯度・経度）に基づいてジオフェンス判定を行い、対象エリア内の場合にVonage SMS APIを使用して通知を送信するサービスです。
Vonage Cloud Runtime (VCR) 上で動作するように設計されています。

## 機能

*   **Webhookレシーバー**: kintoneからのWebhook (`POST /webhook/location`) を受信します。
*   **ジオフェンス機能**: 受信した位置情報が設定されたターゲット地点の半径内にあるかを判定します。
*   **SMS通知**: ジオフェンス内の場合、事前に登録された電話番号にSMSを送信します。
*   **ユーザー管理 (Admin UI)**: kintoneのサブドメインごとに通知先の電話番号を管理するWebインターフェースを提供します。
*   **クールダウン機能**: 短時間での連続通知を防ぐためのクールダウンタイマーを実装しています。

## 必要要件

*   Node.js v18以上
*   Vonage API アカウント (API Key, API Secret)
*   Vonage Cloud Runtime (VCR) CLI

## インストール

```bash
npm install
```

## ローカル開発

ローカル環境ではVCRの機能をモックして動作します。SMS送信はコンソールログに出力されます。

```bash
npm start
```

ブラウザで `http://localhost:3000` にアクセスすると管理画面が表示されます。

## テスト

Jestを使用したユニットテスト/統合テストが含まれています。

```bash
# テストの実行
npm test

# VCRポートを模倣して実行する場合（モックロジックの一部が変わります）
VCR_PORT=3000 npm test
```

## デプロイ

VCRへのデプロイは以下のコマンドで行います。設定は `vcr.yml` に記述されています。

```bash
# 事前にVCR CLIのセットアップが必要です
vcr deploy
```

`vcr.yml` 内の環境変数は、実際のデプロイ時にVCRのダッシュボードまたはCLI設定と一致させてください。

## 環境変数 (vcr.yml)

| 変数名 | 説明 | デフォルト値 |
| --- | --- | --- |
| `VONAGE_API_KEY` | Vonage API Key | - |
| `VONAGE_API_SECRET` | Vonage API Secret | - |
| `VONAGE_FROM` | SMS送信元ID | `VONAGE_SMS` |
| `TARGET_LAT` | ターゲット地点の緯度 | `35.681236` |
| `TARGET_LON` | ターゲット地点の経度 | `139.767125` |
| `RADIUS` | ジオフェンス半径 (メートル) | `100` |
| `COOLDOWN_MIN` | 通知のクールダウン時間 (分) | `60` |
| `MESSAGE_BODY` | SMS本文 | `Entered GeoFence` |
| `VONAGE_APPLICATION_ID` | Vonage Application ID | - |

## API エンドポイント

### Webhook
*   **POST** `/webhook/location`
    *   kintoneからのWebhookペイロードを受け取ります。
    *   Body: `{ "url": "...", "record": { "lat": { "value": "..." }, "lon": { "value": "..." } } }`

### User Management API
*   **GET** `/api/users`: 登録ユーザー一覧を取得
*   **POST** `/api/users`: ユーザー登録/更新
    *   Body: `{ "subdomain": "example", "phoneNumber": "8190...", "isActive": true }`
*   **DELETE** `/api/users/:subdomain`: ユーザー削除

## プロジェクト構成

*   `index.js`: エントリーポイント、APIサーバーロジック
*   `public/`: 静的ファイル (Admin UIのHTML, CSS, JS)
*   `tests/`: テストコード
*   `vcr.yml`: VCRデプロイ設定
