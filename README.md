# Gantt Desk

外部AIで整形したJSONを取り込み、確認・編集・可視化するためのローカル保存型ガントチャートです。

## 特徴

- ブラウザ内のローカル保存（`localStorage`）
- AI機能・APIキー・サーバー処理なし
- JSONの貼り付け、ファイル選択、ドラッグ＆ドロップ
- 反映前のJSON検証とプレビュー
- 「追加」と「置き換え」を選択可能
- JSON完全バックアップとAI連携用JSONの書き出し
- 土日を連続帯で表示し、タスク色を主役にする静かなガント表示
- タスクバーのドラッグ移動、右端ドラッグによる終了日変更
- 右サイドの編集パネル、Undo / Redo、端末内自動保存

## GitHub Pagesでの公開

1. このリポジトリの **Settings** → **Pages** を開く
2. **Build and deployment** の Source を **GitHub Actions** に設定
3. `main` ブランチへpushすると、`.github/workflows/deploy-pages.yml` が公開を実行します

公開後のURLは通常、`https://silovar-uk.github.io/gantt/` です。

## JSONの基本形式

```json
{
  "version": 1,
  "title": "開幕プロモーション",
  "memo": "全体共有事項",
  "view": {
    "start": "2026-07-01",
    "end": "2026-09-30"
  },
  "tasks": [
    {
      "name": "KV初稿提出",
      "start": "2026-07-08",
      "end": "2026-07-10",
      "category": "制作",
      "color": "blue",
      "milestone": false,
      "deadline": false,
      "note": "確認者：広報・営業"
    }
  ]
}
```

### 利用できる色

`gray` / `blue` / `green` / `amber` / `red` / `purple`

### 読み込み時の扱い

- `end` がない場合は、`start` と同じ日付を指定してください
- `deadline: true` は `milestone: true` のときだけ有効です
- 未登録カテゴリは自動で追加されます
- 未対応の色は `gray` に補正されます
- 日付不正や終了日が開始日より前のタスクは、反映前にエラーとして表示されます

## データについて

日常の編集中データは、このブラウザの `localStorage` に保存されます。ブラウザデータを削除すると消えるため、節目ごとに「完全バックアップJSON」を書き出してください。
