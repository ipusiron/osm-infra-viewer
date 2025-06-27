# OSMインフラ可視化ツール（OSM Infrastructure Viewer）

[![GitHub Stars](https://img.shields.io/github/stars/ipusiron/osm-infra-viewer?style=social)](https://github.com/ipusiron/osm-infra-viewer/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/ipusiron/osm-infra-viewer?style=social)](https://github.com/ipusiron/osm-infra-viewer/network/members)
[![MIT License](https://img.shields.io/badge/license-MIT-green)](https://opensource.org/licenses/MIT)
[![Built with Leaflet](https://img.shields.io/badge/Built%20with-Leaflet-1e90ff)](https://leafletjs.com/)
[![Demo](https://img.shields.io/badge/Demo-View-blue)](https://ipusiron.github.io/osm-infra-viewer/)

## 📌 概要

**Day 11 - 生成AIで作るセキュリティツール100**

**OSMインフラ可視化ツール（OSM Infrastructure Viewer）** は、OSM（OpenStreetMap）に登録されたCCTVカメラ、携帯基地局、Wi-Fiホットスポットなどの**インフラ系オブジェクトを地図上に可視化する**シンプルなWebアプリケーションです。

### 用途

このツールは、以下のような用途に活用できます。

- セキュリティ・プライバシー研究
- OSINT（オープンソース情報収集）
- 都市調査や地域インフラ分析
- 教育用デモンストレーション

## 🌐 デモページ

👉 [https://ipusiron.github.io/osm-infra-viewer/](https://ipusiron.github.io/osm-infra-viewer/)

### 主な特徴

- 🌍 **Overpass API経由でリアルタイムにOSMデータを取得**
- 🗺️ **Leaflet.js による地図表示とインタラクティブ操作**
- 🔎 **オブジェクト種別の選択やフィルターが可能**
- 🔐 **APIキー不要・無料で使用可能**
- 🧠 **完全クライアントサイドでプライバシー安心**

## 🚀 使用方法

1. `index.html`をWebブラウザーで開きます。
2. 地図を移動・ズームして範囲を指定します。
3. 画面のUIから「表示したいオブジェクト種別」を選択します。
4. 「検索」ボタンをクリックすると、Overpass APIが現在の地図範囲に対してデータを取得し、マーカーを表示されます。
5. マーカーをクリックすると、詳細な属性（例：name, operator, surveillance:type など）が表示されます。

## 🔧 技術スタック
| 技術         | 用途                            |
|--------------|---------------------------------|
| HTML / CSS   | UI構築                          |
| JavaScript   | データ取得・処理ロジック        |
| Leaflet.js   | 地図描画・マーカー表示           |
| Overpass API | OSMデータのクエリ                |

## 🧩 対応タグ（初期実装）
| オブジェクト        | OSMタグ例                             |
|---------------------|----------------------------------------|
| CCTVカメラ          | `man_made=surveillance`               |
| 携帯基地局          | `man_made=communications_tower`       |
| Wi-Fiホットスポット | `internet_access=wlan`               |

※ `index.html` を編集すれば、任意のタグを追加可能です。

## 📁 プロジェクト構成

```
osm-infra-viewer/
├── index.html          # メインアプリケーション
├── README.md          # このファイル
└── LICENSE            # MITライセンス
```

## 📄 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照してください。

## このツールについて

本ツールは、「生成AIで作るセキュリティツール100」プロジェクトの一環として開発されました。 このプロジェクトでは、AIの支援を活用しながら、セキュリティに関連するさまざまなツールを100日間にわたり制作・公開していく取り組みを行っています。

プロジェクトの詳細や他のツールについては、以下のページをご覧ください。

🔗 [https://akademeia.info/?page_id=42163](https://akademeia.info/?page_id=42163)
