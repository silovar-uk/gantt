# 実装依頼: Gantt Desk 守破離 ― どこを触っても、同じ予定

## 依頼文(次のセッションへ貼る)

```
C:\Users\vediv\repos\gantt\docs\PLAN-SHUHARI-EDIT.md を読んで、そのとおりに実装してください。

前提:
- 最新の origin/main(044cd1e 時点)から feat/shuhari-edit を作って着手してください。
- 仕様S1〜S13を、作戦に書かれた段階1〜4の順で進めてください。
- 停止点は第1段(S1〜S3 予定カード)の見た目確認の1回だけです。スクリーンショット6枚を会話に貼って
  承認を求め、それまではpushしないでください。
  1440×900の分割表示でバーをクリックしたカード / 一覧の••• から開いたカード / バーの••• の見え方 /
  375×812の一覧でのボトムシート / 375×812のガントでのボトムシート / 行の高さ14pxでのカード。
- 承認後は、push、PR作成、CI確認、squashマージ、deploy-pages と public-smoke の成功確認、
  公開URLでの再確認まで止めずに進めてください。
- index.html の ?v= を変えたら、.github/workflows/public-smoke.yml の照合値を同じコミットで
  更新してください。CSS 6本・JS 5本が直書きで照合されています。
```

## 目的

右のガントのバーが、左の一覧の行と同じだけ編集できるようにする。
そのために、左右が**同じ予定カードを開く**形に揃える。

## 完了条件

1. デスクトップの分割表示で、バーをクリックすると予定カードが開き、名前・日付・カテゴリー・完了をその場で直せる。
2. 一覧行の `•••` が、同じ予定カードを開く(従来の詳細モーダルではない)。詳細モーダルはカードの「すべての項目」から開ける。
3. 375px幅のガント表示で、予定名またはバーをタップすると予定カードがボトムシートで開く。
4. 375px幅で、画面右端をはみ出す要素が0件。
5. バーの上に指を置いたまま、ガントを縦にスクロールできる。
6. キーボードだけで、ガント表示の予定を選び、開き、削除できる。
7. ドラッグ中に移動後の日付が出る。締切を越えるときは警告が出る。
8. `validate-v5`・`validate-css-architecture`・`public-smoke`(既存8本 + 新規 `public-e2e-task-card.mjs`)が通る。
9. 公開URLで1〜7を再確認できている。

## 変更範囲

### 純増(2本)

- `src/v5/classic/21-task-card.js`
- `assets/v14-task-card.css`

両方とも `index.html` への追加が必須です。`validate-css-architecture.mjs` が孤児ファイルを検査します。

### 変更

| ファイル | 内容 |
|---|---|
| `src/v5/classic/05.js` | `contentCommit` に `undo` オプション(S9) |
| `src/v5/classic/06.js` | モバイルのガントのラベルに `•••`(S5)、バーの名前の位置(S10)、詳細モーダルに「名前の位置」(S10) |
| `src/v5/classic/07.js` | 絞り込みモーダルの先頭に検索欄(S12) |
| `src/v5/classic/08.js` | `revealTask()` の新設(S8) |
| `src/v5/classic/10.js` | `data-action="details"` の飛び先(S1)、行選択の除外条件(S5) |
| `src/v5/classic/11-ux-workspace.js` | タップ/ドラッグの距離しきい値(S4)、ドラッグ予告(S7)、トーストの文言(S9)、`#ux-selection-badge` の削除(S11)、バーの `tabindex`(S6) |
| `src/v5/classic/16-macro-detail-lens.js` | 重複する横スクロール処理を `revealTask` に置換(S8) |
| `src/v5/classic/18-time-compass.js` | 締切ピンの `is-alert`(S7)、選択中の期間の表示(S8) |
| `src/v5/classic/20-quiet-coach.js` | `detail` の文言(S13) |
| `assets/v6-workspace-ux.css` | `touch-action` を `pan-y` へ(S4)、モバイルのツールバー(S12) |
| `assets/v5-responsive.css` | モバイルのツールバー2段構成(S12) |
| `index.html` | 新規2本の読み込み、`?v=` の更新 |
| `.github/workflows/public-smoke.yml` | `?v=` の照合値、`node --check` の追加、新規e2eの実行 |
| `README.md` | 予定カードと一括変更の記述を足す |

### 保持する仕様

- `editorFormHTML()` / `saveEditor()` / `deleteTask()` / `contentCommit()` / Undo / Redo / 自動保存は変えない。新しい保存経路を作らない。
- 詳細モーダルを消さない。
- Present モードの挙動を変えない(バーは `pointer-events: none` のまま。カードも開かない)。
- 時間の窓、`fitOverview`、`overviewAutoFit` の扱いを変えない。
- `COLOR_PALETTE` の色名と順序、保存データのスキーマを変えない。`displayNamePosition` は値を1つ増やすだけ(`'auto'`)。

## 実装方針

- レイヤーを積み増さない。不具合は原因のファイルを直接直す。
- 予定カードは `<div popover="auto">` を使う。`Esc`・外側クリック・最前面はブラウザに任せる。自前のバックドロップやフォーカストラップを書かない。
- カードの中身は `editorFormHTML()` の項目の部分集合。別のフォーム定義を作らず、必要なら `editorFormHTML` を分割して共有する。
- モバイルの分岐はCSSで行う。JSの分岐は「アンカー計算を飛ばす」1箇所だけにする。
- 削れるものは削る。`#ux-selection-badge` は「まとめてカード」に吸収して消す。
- 概算で足りるところは概算にする(S10のバー幅の見積もり)。実測のためのreflowを増やさない。
- 意図的に割り切った箇所には `ponytail:` コメントで天井と引き上げ先を書く。計画に3箇所指定してある。

## 実装担当が判断してよいこと

- 予定カードのCSSの細部(角丸、影、余白、配色)。既存の `v13-sage-polish.css` のトークンに揃える。
- `21-task-card.js` の内部構造(関数の分け方、状態の持ち方)。
- 新規e2eの書き方。既存の `scripts/public-e2e-visible-truth.mjs` の作法に合わせる。
- `?v=` の文字列(`20260919-card1` など、既存の命名に合わせる)。

## 確認が必要なこと

- 第1段の見た目(上記の停止点)。
- 計画から外れる設計変更をしたくなったとき。
- 保存データのスキーマを変えたくなったとき。

## 確認なしで行ってよい操作

- ブランチ作成、コミット、push、PR作成、CI確認、squashマージ、`deploy-pages` の実行、公開URLでの確認。
- 第1段の承認後は、第2〜4段を止めずに進める。段ごとに報告で止まらない。

## 未確認事項

- `popover` 属性の対応は、この環境の Chrome / Edge / iOS Safari では問題ない想定です。念のため、`HTMLElement.prototype.showPopover` が無いときは `hidden` の付け外しに落とす3行のフォールバックを入れてください。
- 時間の窓(`18-time-compass.js`、905行)の締切ピンの描画箇所は未特定です。S7・S8 の追記位置は実装時に読んで決めてください。
- `.task-bar` の `touch-action: pan-y` に変えたあと、`#timeline-scroll` の横スクロールがバーの上で効かなくなります。横は時間の窓でパンできるため許容の想定ですが、実機で違和感があれば報告してください。

## 調査の根拠(再現済み)

計画の「調査で確かめた事実」表を参照してください。特に次の2つは実機で確認済みです。

- 375px幅のガント表示で予定名をタップしても `state.selectedTaskId` が `null` のまま変わらない(事実B)。
- 375px幅でツールバーの内容が888px、主要4操作が画面外(事実D)。

---

## ファイル

- 計画: `C:\Users\vediv\repos\gantt\docs\PLAN-SHUHARI-EDIT.md`
- 依頼: `C:\Users\vediv\repos\gantt\docs\HANDOFF-SHUHARI-EDIT.md`

## 起動文(1行)

```
C:\Users\vediv\repos\gantt\docs\PLAN-SHUHARI-EDIT.md と docs\HANDOFF-SHUHARI-EDIT.md を読んで、feat/shuhari-edit を作って第1段から実装してください。
```
