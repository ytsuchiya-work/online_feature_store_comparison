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
| D | 自動feature lookup（Model Serving vs 生lookup） |

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
  /Workspace/Users/yusuke.tsuchiya@databricks.com/online_feature_store_comparison --profile Azure-ytcy-east2
```
