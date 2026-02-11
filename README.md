# VCR Location SMS Service

kintoneのレコード追加時のWebhookを受け取り、位置情報（緯度・経度）に基づいてジオフェンス判定を行い、対象エリア内の場合にVonage SMS APIを使用して通知を送信するサービスです。
Vonage Cloud Runtime (VCR) 上で動作するように設計されています。

## システム構成図

```mermaid
graph TD
    User((ユーザー))
    Kintone[kintoneアプリ]
    VCR[VCR Location SMS Service]
    Vonage[Vonage SMS API]
    
    User -->|GPS位置情報を登録| Kintone
    Kintone -->|Webhook (lat, lon)| VCR
    
    subgraph VCR_Internal [Vonage Cloud Runtime]
        VCR -->|設定参照| State[(VCR State)]
        VCR -->|ジオフェンス判定| Logic{判定}
    end
    
    Logic -->|範囲内 & CoolDown OK| Vonage
    Vonage -->|SMS通知| User
```

## 機能

*   **Webhookレシーバー**: kintoneからのWebhook (`POST /webhook/location`) を受信します。
*   **ジオフェンス機能**: 受信した位置情報が設定されたターゲット地点の半径内にあるかを判定します。
*   **SMS通知**: ジオフェンス内の場合、事前に登録された電話番号にSMSを送信します。
*   **ユーザー管理 (Admin UI)**: kintoneのサブドメインごとに通知先の電話番号を管理するWebインターフェースを提供します。
*   **クールダウン機能**: 短時間での連続通知を防ぐためのクールダウンタイマーを実装しています。

## ジオフェンス判定仕様

本サービスでは、以下のロジックで通知可否を判定しています。

1.  **距離計算**:
    *   **Haversine formula (半正矢関数)** を使用して、地球を球体と見なした2点間（ターゲット地点と現在地）の直線距離をメートル単位で計算します。
    *   ターゲット地点は環境変数 `TARGET_LAT`, `TARGET_LON` で設定します。

2.  **エリア判定**:
    *   計算された距離が 環境変数 `RADIUS` (メートル) **以下** の場合、**エリア内**と判定します。

3.  **通知抑制 (クールダウン)**:
    *   エリア内であっても、同一ユーザー（サブドメイン）に対して前回の通知から `COOLDOWN_MIN` (分) が経過していない場合、通知は送信されません。
    *   これにより、境界付近での頻繁な通知（チャタリング）や、短時間での連続通知を防止しています。

## kintoneアプリのセットアップ

本サービスを利用するには、kintoneアプリ側で以下の設定が必要です。

### 1. アプリのフィールド設定

アプリに以下のフィールドコードを持つフィールドを作成してください。

| フィールド名 | フィールドタイプ | フィールドコード (必須) | 説明 |
| --- | --- | --- | --- |
| 緯度 | 数値 (または1行テキスト) | `lat` | GPSの緯度情報 |
| 経度 | 数値 (または1行テキスト) | `lon` | GPSの経度情報 |

※ その他のフィールド（日時やユーザー名など）は自由に追加して構いません。

### 2. Webhookの設定

アプリの設定 > Webhook から、以下の内容でWebhookを追加します。

*   **Webhook URL**: `https://<あなたのVCRインスタンスURL>/webhook/location`
    *   例: `https://neru-XXXXXXXX-vcr-location-sms-dev.apse1.runtime.vonage.cloud/webhook/location`
*   **通知のタイミング**:
    *   [x] レコードの追加
*   **有効化**: チェックを入れて保存します。

## 利用方法 (Admin UI)

VCRインスタンスのルートURL (`https://<あなたのVCRインスタンスURL>/`) にアクセスすると、管理者ダッシュボードが表示されます。

### ユーザーの登録

1.  **kintoneサブドメイン**を入力します。
    *   URLが `https://example.cybozu.com/k/123/` の場合、サブドメインは `example` です。
2.  **通知先電話番号**を入力します (国番号付き、例: `819012345678`)。
3.  `Active` にチェックが入っていることを確認し、「Save User」をクリックします。

### 設定の変更・削除

*   **編集**: リストの「Edit」ボタンをクリックすると、電話番号やステータス(Active/Inactive)を変更できます。
*   **削除**: ゴミ箱アイコンをクリックすると、登録を解除できます。

## 必要要件

*   Node.js v18以上
*   Vonage API アカウント (API Key, API Secret)
*   Vonage Cloud Runtime (VCR) CLI

## 環境変数 (vcr.yml)

| 変数名 | 説明 | デフォルト値 |
| --- | --- | --- |
| `VONAGE_API_KEY` | Vonage API Key | - |
| `VONAGE_API_SECRET` | Vonage API Secret | - |
| `VONAGE_FROM` | SMS送信元ID | `VonageSMS` |
| `TARGET_LAT` | ターゲット地点の緯度 | `35.681236` |
| `TARGET_LON` | ターゲット地点の経度 | `139.767125` |
| `RADIUS` | ジオフェンス半径 (メートル) | `300` |
| `COOLDOWN_MIN` | 通知のクールダウン時間 (分) | `20` |
| `MESSAGE_BODY` | SMS本文 | `Entered GeoFence` |
| `VONAGE_APPLICATION_ID` | Vonage Application ID | - |

## インストール & ローカル開発

```bash
npm install
npm start
```
ブラウザで `http://localhost:3000` にアクセスすると管理画面が表示されます。
※ ローカル環境ではVCR機能はモックとして動作し、SMSはコンソールログに出力されます。

## テスト

```bash
npm test
```

## デプロイ

```bash
vcr deploy
```
