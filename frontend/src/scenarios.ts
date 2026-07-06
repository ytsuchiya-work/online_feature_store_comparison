import type { AccessPattern, KeySet, ScenarioId } from './api'

export interface ParamDoc {
  label: string
  help: string[]
}

export interface ScenarioMeta {
  id: ScenarioId
  icon: string
  accent: string
  shortLabel: string
  title: string
  /** How it's implemented under the hood. */
  howItWorks: string[]
  /** What exactly is being compared, and why it matters. */
  whatItCompares: string[]
  /** Notes on how to read the result. */
  howToRead: string
  showAccessPattern: boolean
  showBatchSize: boolean
  showPublishMode: boolean
  defaults: {
    keySet: KeySet
    accessPattern: AccessPattern
    concurrency: number
    batchSize: number
    requestCount: number
  }
  params: {
    keySet: ParamDoc
    accessPattern?: ParamDoc
    concurrency: ParamDoc
    batchSize?: ParamDoc
    requestCount: ParamDoc
    publishMode?: ParamDoc
  }
  tip?: string
}

const keySetHelp: ParamDoc = {
  label: 'Key set（lookup対象プール）',
  help: [
    'どのサイズのentity_idプールからサンプリングするか。',
    'small=100件 / medium=10,000件 / large=1,000,000件。',
    '大きいプールほど多様なキーを引けるが、large は初回クエリのウォームアップに時間がかかることがある。',
  ],
}

const accessPatternHelp: ParamDoc = {
  label: 'Access pattern（サンプリング方式）',
  help: [
    'key set からどうキーを選ぶか。',
    'uniform=毎回ランダムに1件選ぶ（一般的な分散アクセス）。',
    'hot=最初に選んだ1件を全リクエストで使い回す（同一キーへの反復アクセス、キャッシュが効きやすいケースを模す）。',
    'cold=プールの先頭から順番に一巡させる（キャッシュが効きにくい広い分散アクセス）。',
    'skewed=上位20%のキーに80%の確率でアクセスし、残り20%は全体からランダムに選ぶ（実運用でよくある偏った人気キー分布）。',
  ],
}

const concurrencyHelp: ParamDoc = {
  label: 'Concurrency（同時実行数）',
  help: [
    '同時に投げるリクエスト（またはバッチ）の数。',
    '内部ではこの数のスレッドで並列にoffline/onlineへ問い合わせる。',
    '1なら逐次実行、大きくするほど負荷をかけた状態でのレイテンシ・エラー率の変化を見られる。',
  ],
}

const requestCountHelp: ParamDoc = {
  label: 'Request count（総リクエスト数）',
  help: [
    'このシナリオ実行全体で発行するlookup（またはバッチ）の総数。',
    'p50/p95/p99やqpsはこの母数から算出される。',
  ],
}

const batchSizeHelp: ParamDoc = {
  label: 'Batch size（1回あたりの件数）',
  help: [
    '1回のクエリでまとめて取得するentity数。',
    '1なら「1件lookupのp50/p95/p99」の測定になり、10/100/1000などにすると「バッチ応答時間」の測定になる（同じコードパスで両方を測れる）。',
    'request_count ÷ batch_size 回のラウンドトリップが発生する。',
  ],
}

const publishModeHelp: ParamDoc = {
  label: 'Publish mode切替（任意）',
  help: [
    '指定すると、計測前に online store への publish 方式を切り替えるジョブを実行してから計測する。',
    'TRIGGERED=明示的に再publishしない限り反映されない（スケジュールジョブ想定）。',
    'CONTINUOUS=offline側の更新をストリーミングで即時反映。',
    '「変更しない」を選ぶと現在の設定のまま計測する。',
  ],
}

export const SCENARIOS: ScenarioMeta[] = [
  {
    id: 'A',
    icon: '🔍',
    accent: '#3b82f6',
    shortLabel: 'A. 最新値lookup',
    title: 'シナリオA: 最新値lookup（offline vs online）',
    howItWorks: [
      'サンプリングしたentity_idの集合を batch_size 件ずつのバッチに分割する。',
      '各バッチについて、offlineはSQL warehouse経由でUnity Catalogの feature_offline_current テーブルを、' +
        'onlineはLakebase（Postgres）に直接接続して online_feature_current テーブルを、同時に1回ずつ問い合わせる。',
      'concurrency で指定した数のスレッドで複数バッチを並列実行し、バッチ単位のレイテンシを記録する。',
      '同じバッチ内で両方から返ってきたentityについて、activity_score_7d / risk_score の値を突き合わせて一致率も記録する。',
    ],
    whatItCompares: [
      '同一entity・同一featureに対する「Delta table経由の参照（オフライン）」と「Lakebase直接参照（オンライン）」の応答速度差。',
      'これは最も基本的なオンライン推論パターン（1件〜数千件のリアルタイムlookup）に対応する。',
      '値そのものが一致しているか（publishが正しく効いているかの健全性チェック）も同時に確認できる。',
    ],
    howToRead:
      '通常はofflineが数百ms、onlineが数ms程度になり、その差がLakebase Online Feature Storeの価値そのもの。' +
      'value consistencyの一致率が100%でなければpublishの遅延や設定ミスを疑う。',
    showAccessPattern: true,
    showBatchSize: true,
    showPublishMode: false,
    defaults: { keySet: 'small', accessPattern: 'uniform', concurrency: 1, batchSize: 1, requestCount: 100 },
    params: {
      keySet: keySetHelp,
      accessPattern: accessPatternHelp,
      concurrency: concurrencyHelp,
      batchSize: batchSizeHelp,
      requestCount: requestCountHelp,
    },
  },
  {
    id: 'C',
    icon: '🔄',
    accent: '#d97706',
    shortLabel: 'C. Freshness',
    title: 'シナリオC: Freshness（更新反映までの遅延）',
    howItWorks: [
      '（publish mode切替を指定した場合）まずジョブを起動し、online storeへのpublish方式をTRIGGERED/CONTINUOUSに切り替える。',
      '対象entity（最大20件）ごとに、online側の現在の risk_score を記録した上で、offline側の feature_offline_current を' +
        'SQL warehouse経由でUPDATEする（risk_scoreを微小変化させる）。',
      'UPDATE直後から1秒間隔でonline側を再取得し続け、値が変化するまでの経過時間（freshness lag）を計測する' +
        '（最大2分でタイムアウト）。',
    ],
    whatItCompares: [
      'オフラインでの更新が、オンラインストアに反映されるまでの遅延（publishパイプラインの実効速度）。',
      'TRIGGERED（明示的な再publishが必要）とCONTINUOUS（ストリーミングで即時反映）で、この遅延がどれだけ変わるか。',
    ],
    howToRead:
      'TRIGGEREDのまま再publishを走らせずに計測すると、反映されずタイムアウト（約120秒）になるのが正しい挙動。' +
      'freshnessを正しく比較したい場合は、CONTINUOUSに切り替えてから実行するか、TRIGGERED再publishジョブを別途スケジュールした上で計測する。',
    showAccessPattern: false,
    showBatchSize: false,
    showPublishMode: true,
    defaults: { keySet: 'small', accessPattern: 'uniform', concurrency: 1, batchSize: 1, requestCount: 5 },
    params: {
      keySet: keySetHelp,
      requestCount: { ...requestCountHelp, help: [...requestCountHelp.help, '内部で最大20件までに制限される。'] },
      concurrency: { ...concurrencyHelp, help: ['このシナリオでは常に逐次（1件ずつ）実行するため使用しない。'] },
      publishMode: publishModeHelp,
    },
  },
  {
    id: 'D',
    icon: '🚦',
    accent: '#dc2626',
    shortLabel: 'D. 同時実行負荷',
    title: 'シナリオD: 同時実行負荷（concurrencyスケーラビリティ）',
    howItWorks: [
      '内部の処理はシナリオAと全く同じ（offline/online双方への同時lookup）。',
      '違いはconcurrencyを高く設定して実行する点のみ。1つのrunにつき1つのconcurrency値で計測する。',
      '1, 10, 50, 100, 500 のように concurrency を変えて複数回このシナリオを実行し、ダッシュボードで並べて比較することを想定している。',
    ],
    whatItCompares: [
      '同時実行数を上げていったときに、offline（SQL warehouse）とonline（Lakebase）それぞれで' +
        'レイテンシ（p95/p99）やエラー率がどう劣化するか＝実運用に近いスケーラビリティの違い。',
      'Lakebase Autoscalingが負荷に応じてどこまで低レイテンシを維持できるかを見るシナリオ。',
    ],
    howToRead:
      'ダッシュボードタブの「Concurrency別 p95 latency」チャートに、このシナリオの結果がconcurrency順に並んで表示される。' +
      '同一のkey_set/access_patternでconcurrencyだけを変えた複数runを比較すると傾向が読みやすい。',
    showAccessPattern: true,
    showBatchSize: true,
    showPublishMode: false,
    defaults: { keySet: 'medium', accessPattern: 'uniform', concurrency: 50, batchSize: 1, requestCount: 500 },
    params: {
      keySet: keySetHelp,
      accessPattern: accessPatternHelp,
      concurrency: concurrencyHelp,
      batchSize: batchSizeHelp,
      requestCount: requestCountHelp,
    },
    tip: '同じ設定でconcurrencyだけ 1→10→50→100→500 と変えながら複数回実行し、ダッシュボードで比較するのがおすすめ。',
  },
  {
    id: 'E',
    icon: '🤖',
    accent: '#8b5cf6',
    shortLabel: 'E. 自動feature lookup',
    title: 'シナリオE: 自動feature lookup（Model Serving vs 生lookup）',
    howItWorks: [
      '各entityについて、Model Serving endpoint（fscomp-churn-serving）に entity_id だけを送信し、' +
        'エンドポイント側で自動feature lookupを行わせてスコアリング結果を得る（総所要時間を計測）。',
      '同時に、同じentityについてOnlineストアから生のfeature値を直接取得する（シナリオAと同じonlineパス）。',
      '両者の所要時間を比較する。',
    ],
    whatItCompares: [
      '「Model Servingが自動で行うfeature lookup込みの推論時間」と「feature lookupだけの生の時間」の差分＝' +
        'モデル推論そのものやネットワークなど、lookup以外にかかっているオーバーヘッド。',
      'automatic feature lookupが実運用でどの程度のレイテンシコストを追加するのかを定量化できる。',
    ],
    howToRead:
      'run詳細に表示される「自動feature lookupのoverhead (p50)」が、Serving p50 と Online p50 の差分。' +
      'この値が小さいほど、自動feature lookupの追加コストが小さいことを意味する。',
    showAccessPattern: true,
    showBatchSize: false,
    showPublishMode: false,
    defaults: { keySet: 'small', accessPattern: 'uniform', concurrency: 1, batchSize: 1, requestCount: 20 },
    params: {
      keySet: keySetHelp,
      accessPattern: accessPatternHelp,
      concurrency: { ...concurrencyHelp, help: [...concurrencyHelp.help, 'Serving endpointへの同時リクエスト数にもなる。'] },
      requestCount: requestCountHelp,
    },
  },
]

export function getScenarioMeta(id: ScenarioId): ScenarioMeta {
  const found = SCENARIOS.find((s) => s.id === id)
  if (!found) throw new Error(`unknown scenario ${id}`)
  return found
}
