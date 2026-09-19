# OSM Infrastructure Viewerの開発ガイド

## 概要

Day011の静的Webツールです。OpenStreetMapの21種別のインフラをLeafletで表示し、Overpass APIで検索します。地名検索にはNominatimを使います。
古典スクリプトを使用し、file://でも操作できます。実サービスの利用時はRefererを送れるHTTP配信を推奨します。

## ファイル構成

- `osm-logic.js`: DOM・Leaflet・通信・現在時刻に依存しない純粋ロジック
- `script.js`: DOM構築、Leaflet操作、fetch、状態・タイマー・テーマの管理
- `index.html`: 操作パネル、21個のチェックボックス、地図、2個のdialog
- `style.css`: ライト／ダーク、2カラムとモバイルのレイアウト
- `test/`: node:testとnode:assert/strictによるオフラインテスト
- `.github/workflows/test.yml`: pushとpull_requestでNode 22のテスト
- `assets/`: ファビコンと画面画像。旧screenshot.pngは保管
- `package.json`: npm testのみ。依存パッケージなし

## 公開する定数と関数

`globalThis.OsmInfraLogic`とCommonJSの両方で公開します。ES moduleにはしません。

- 定数: CATEGORIES、OBJECT_TYPES
- 検索: normalizeBbox、buildOverpassQuery、classify、elementLatLon
- 場所: parseCoordinates、buildNominatimUrl、zoomCategory
- 応答: interpretOverpassResponse
- 表示モデル: osmRef、formatDate、buildPopupModel、buildSummary
- 出力: toGeoJSON、escapeXml、toKML、exportFileName

## 種別を追加・変更するとき

OBJECT_TYPESを正として、index.htmlのチェックボックスとREADMEの表を同期します。カテゴリー・順序・ラベル・OSMタグの食い違いはテストで検出します。
現在の契約は6カテゴリー・21種別・25タグです。依頼のない種別追加やタグ変更は行いません。
検索後にチェックが変わっても、分類はlastSearchのselectedIdsを使います。座標なしの要素は集計・描画・出力から除外します。

## 開発コマンド

```sh
npm test
python -m http.server 8000 --bind 127.0.0.1
```

テストにはNode 22以上が必要です。npm installは不要です。画面の検証ではHTTPとfile://の両方を確認します。
APIの正常・警告・エラー・無応答はモックで検証し、公開サービスに繰り返し問い合わせません。
Nominatimのリクエストは1秒以上あけます。上限はアプリケーション全体に適用され、ページ内の制限だけで全利用者の合計を保証するものではありません。

## 安全側の決め事

- referrerをno-referrerにしない。strict-origin-when-cross-originを維持
- タイルURLを`https://tile.openstreetmap.org/{z}/{x}/{y}.png`から変更しない。{s}付きに戻さない
- innerHTML・insertAdjacentHTML・document.writeを使わない。createElementとtextContentで描画
- 外部応答を信頼せず、座標・ID・種別・elements配列を検証
- Nominatimのオートコンプリートを実装しない
- Overpassの自動リトライ・検索範囲の制限を導入しない
- CSPにunsafe-inline・unsafe-eval・metaで無効なframe-ancestorsを追加しない
- SRIは配信ファイルのバイト列を計算してから変更。Leaflet 1.9.4とmarkercluster 1.5.3を無断で更新しない
- 外部API・通信先・npm依存・CDNを増やさない
- localStorageへの保存は検証済みのテーマ値だけ。入力や検索結果は保存しない
- 地図タイルの色を反転しない。Leaflet標準コントロールの配色を変更しない
- successだけ5秒で消す。warning・errorは残し、新しい通知の前に古いタイマーを解除
- 期待値を変更してテストを通さない。仕様の矛盾は報告して公開を止める
