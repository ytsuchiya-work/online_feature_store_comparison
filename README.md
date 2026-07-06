# online_feature_store_comparison

Lakebase を使用した Databricks Online Feature Store と、Unity Catalog Delta table ベースの
オフライン Feature Store の性能・パフォーマンスを同一データ・同一エンティティキーで比較するアプリ。

## 構成

- **データ**: `ytcy_azure_east2classic_stable.feature_store_comp`
  - `entity_base` / `feature_offline_current` / `feature_offline_timeseries` / `labels_optional`
  - `lookup_keys_small` / `lookup_keys_medium` / `lookup_keys_large`
  - `benchmark_scenarios` / `benchmark_requests` / `benchmark_results` / `value_consistency_results` / `cost_snapshots`
- **Online Feature Store**: `fscomp-online-store`（Lakebase Autoscaling backed）。`feature_offline_current` /
  `feature_offline_timeseries` を TRIGGERED で publish
- **Serving**: `fscomp-churn-serving`（自動feature lookup付きModel Servingエンドポイント、シナリオD用）
- **セットアップ**: `notebooks/01_setup_online_feature_store.py`（feature table作成・online store作成・publish）、
  `notebooks/02_setup_model_serving.py`（モデル学習・登録・serving endpoint作成）、
  `notebooks/03_toggle_publish.py`（publish_modeの切替、シナリオBから呼び出される）
- **アプリ**: `backend/`（FastAPI）+ `frontend/`（React/Vite）。React は `npm run build` して
  `backend/app/static/` に出力したものをコミットする

## 比較シナリオ

| シナリオ | 内容 |
|---|---|
| A | 最新値lookup（offline vs online、単発/バッチ） |
| B | freshness（offline更新 → online反映までの遅延、TRIGGERED/CONTINUOUS比較） |
| C | 同時実行負荷（concurrency 1〜500） |
| D | 1行リアルタイム推論（オフラインFS経由 vs オンライン自動feature lookup、同一Serving endpointで比較） |

## ローカル開発

```bash
cd backend
pip install -r requirements.txt
DATABRICKS_CONFIG_PROFILE=Azure-ytcy-east2 uvicorn app.main:app --reload

cd frontend
npm install
npm run dev   # http://localhost:5173, /api は :8000 にプロキシ
```

## デプロイ

```bash
cd frontend && npm run build   # backend/app/static/ に出力
git add -A && git commit -m "..." && git push
databricks repos update 2241352061641814 --branch main --profile Azure-ytcy-east2
databricks apps deploy fscomp-benchmark --source-code-path \
  /Workspace/Users/yusuke.tsuchiya@databricks.com/online_feature_store_comparison/backend --profile Azure-ytcy-east2
```

## 変更履歴

### 2026-07-06: シナリオDを「1行リアルタイム推論」比較に再設計

- 旧シナリオD（Model Serving vs 生のonline lookup）を、**オフラインFS経由の1行推論 vs オンライン自動feature lookup推論**の比較に変更
  - 両経路とも同一のServing endpoint（`fscomp-churn-serving`）でスコアリングするため、モデル・推論基盤は同一。レイテンシ差はfeature取得経路の違いのみを反映する
  - オフライン経由: アプリがSQL warehouse経由でDeltaのfeature値を1行取得し、リクエストに含めて送信（feature値を明示的に渡すと自動lookupはスキップされる）。本来バッチ用（`score_batch`）のオフラインFSをあえて1行推論に流用した場合のコストを可視化
  - オンライン: entity_idだけ送信し、endpointがLakebaseから自動lookupして推論（本来のリアルタイム経路）
  - source_typeは `offline_scoring` / `serving` の2系統。旧形式のrun（serving/online）も履歴表示は互換維持

### 2026-07-06: シナリオ再編・実行履歴の永続化・実行内容の可視化

- シナリオIDをA/B/C/Dに再編（旧B「時系列lookup」を削除し、旧C/D/E→B/C/Dへリナンバリング）。
  UC上の過去実行履歴（`benchmark_scenarios.scenario_id`）もSQL UPDATEで新割当に移行済み
- **実行履歴の永続化**: `/api/runs` がメモリ上のdictのみで履歴を保持しており、Appsの再起動・再デプロイのたびに
  全消去されていた問題を修正。`benchmark_scenarios`/`benchmark_results` を正のソースとして再構築するよう変更
- run詳細に「実行内容サンプル」（`benchmark_requests`の個別リクエスト生ログ：entity_id・latency・成否・エラー）と
  「実測値サンプル」（`value_consistency_results`のoffline値/online値の突き合わせ）を追加
- ダッシュボード: 全実行結果テーブルにCreated Time列を追加。Concurrency別p95チャートをシナリオ選択プルダウン付きの
  棒グラフに変更（経路別に色分けし、同一concurrencyの複数runは平均値を1本のバーとして表示）
- 各シナリオの実行パラメータ説明を箇条書き化
