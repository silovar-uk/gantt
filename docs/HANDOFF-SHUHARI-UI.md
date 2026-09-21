# 実装依頼: Gantt Desk 守破離 ― 時間が、見える

## 依頼文(次のセッションへ貼る)

```
C:\Users\vediv\repos\gantt\docs\PLAN-SHUHARI-UI.md と docs\HANDOFF-SHUHARI-UI.md を読んで、そのとおりに実装してください。
見た目の到達点は docs\mock-shuhari-ui.html(ブラウザで直接開ける静的モック)です。

前提:
- 最新の origin/main(597f265 時点)から feat/shuhari-ui を作って着手してください。
- 仕様U0〜U21を、作戦に書かれた段階0〜4の順で進めてください。
- 停止点は第2段(U10〜U16)が終わった時点の見た目確認の1回だけです。計画の「停止点で出すスクリーンショット」
  7枚を、モックの同じ状態と並べて会話に貼り、承認を求めてください。それまではpushしないでください。
- 承認後は、push、PR作成、CI確認、squashマージ、deploy-pages と public-smoke の成功確認、
  公開URLでの再確認まで止めずに進めてください。
- index.html の ?v= を変えたら、public-smoke.yml と validate-v5.yml の照合値を同じコミットで更新してください。
  JS内部の版数定数(COMPASS_VERSION、DENSITY_VERSION、POLISH_VERSIONなど)は変えないでください。
```

## 目的

画面に「時間」を描く。いま・遅れ・締切・変化が一目で分かり、道具は手元に浮かぶ。
そのうえで、見た目を「整った表」から「一枚の設計された図」へ引き上げる。

## 完了条件

1. 一覧・分割・ガントのどの表示でも、1440×900と390×844で、図または表が画面の幅を使い切る。一覧モードで空白が65%残る状態、ガントへ切り替えて右が空く状態が無い。
2. 「全体」を押すと、最後の行まで操作盤に隠れずに収まる。24件前後なら行は36pxまで広がる。
3. 見出しは二段(月/日)。日ごとの縦罫が無く、週末の帯と月の罫だけがある。見出し・補助・目盛りの文字に8〜10pxが無い(目盛りは10.5px)。
4. 今日線は朱で、見出しに `今日 9/21 月` の旗と `遅れ N` のボタンがある。ボタンで遅れだけに絞れる。
5. 遅れた予定は、バーの終わりから今日まで朱の糸を引き、`N日遅れ` が出る。締切は全行を貫く柱と `あとN日` の旗を持つ。マイルストーンには名前が出る。
6. バーは過ぎた時間だけ濃くなり、名前と日付がホバー無しで読める。
7. 題字の帯48pxと地平線44pxだけが上にあり、操作は下に浮かぶ操作盤にある。スマホの上部は92px。
8. `Ctrl+K`(`⌘K`、`/`)で手帳が開き、予定名の一部と `Enter` で、その予定の予定カードまで開く。
9. ドラッグ・Undo・カードでの日付変更のあと、前の位置が点線で一瞬残り、`+N日` が出る。
10. AIから戻したJSONで「予定をすべて入れ替え」をすると、移動・追加・削除の件数が出て、「変更だけ表示」で絞れる。完了印と締切の印が消えない。
11. `validate-v5`・`validate-css-architecture`・`public-smoke`(既存9本+新規 `public-e2e-now-desk.mjs`)が通る。
12. 公開URLで1〜10を再確認できている。

## 変更範囲

### 純増(3本)

- `assets/v15-now-desk.css`(先頭コメントに `now desk owner`)
- `src/v5/classic/22-command-palette.js`
- `src/v5/classic/23-afterimage.js`

3本とも `index.html` への追加が必須です。`validate-css-architecture.mjs` が孤児ファイルを検査します。
新規e2e `scripts/public-e2e-now-desk.mjs` も足します。

### 変更

| ファイル | 内容 |
|---|---|
| `src/v5/classic/01.js` | `taskState()` の新設(U4) |
| `src/v5/classic/02.js` | `sortAndFilterTasks` に「変更だけ表示」の1行(U18) |
| `src/v5/classic/05.js` | `setMode` の再フィット(U2)、変更イベントに `before`・Undo/Redo のイベント(U17)、題字の帯の `#project-meta`(U10) |
| `src/v5/classic/06.js` | 条件の帯の表示条件(U13)、索引の行(U9, U15)、二段の見出し(U3)、今日線・過去の地・旗・柱・月の罫(U6, U8, U3)、スマホの名前列(U16) |
| `src/v5/classic/08.js` | 取り込みの差分と引き継ぎ(U18, U19)、取り込みの説明文(U19)、滑らかなスクロール(U21) |
| `src/v5/classic/11-ux-workspace.js` | バー・節目・遅れの糸・`•••` の位置(U4, U5, U7)、ドラッグ中の元の位置(U17)、Presentの凡例(U20)、空のときの `#ux-view-controls`(U12) |
| `src/v5/classic/13-overview-density.js` | 行の高さの上限と移行、浮かぶ道具のぶんの空き高さ(U2) |
| `src/v5/classic/15-macro-overview.js` | `HEADER_HEIGHT` を44に(U3) |
| `src/v5/classic/17-project-surface.js` | 地平線を題字の帯の直後へ、全体・拡大縮小を操作盤へ(U11) |
| `src/v5/classic/18-time-compass.js` | 稜線のSVG、過去の地(U11) |
| `assets/v13-sage-polish.css` | トークン、`.color-*` と `.cat-*`、ボタンと題字の帯(U1, U10) |
| `assets/v5-base.css`、`v5-responsive.css`、`v6-workspace-ux.css`、`v7-overview-density.css`、`v9-macro-overview.css`、`v10-macro-detail-lens.css`、`v11-project-surface.css`、`v12-time-compass.css`、`v14-task-card.css` | 計画の各仕様に書いた規則の書き換えと削除(日の格子、`.timeline-head-cell`、ツールバーの規則、8〜10pxの文字、青い色の残り) |
| `index.html` | 新規3本の読み込み、`?v=` の更新 |
| `.github/workflows/public-smoke.yml`、`validate-v5.yml` | `?v=` の照合値、新規ファイルの確認、新規e2eの実行 |
| `scripts/public-e2e-*.mjs`(既存10本) | `GANTT_BASE` と `ORIGIN` を環境変数から取れるように(U0)。照合値は変えない |
| `README.md` | 見た目・キーボード・取り込みの節(U21) |

### 保持する仕様

- 保存データの形、JSON形式(入力・AI用・バックアップ)、スキーマの版。U19の引き継ぎも形は変えない。
- `COLOR_PALETTE` の色名と順序。トークン `--primary` = `#3E6A5A`、`--line` = `#E2E5E0`。
- e2eとJSが使うid・class・`data-*`(計画の「検証」の節に一覧)。ラベル `Present`・`AI用JSON`・`JSON`・`予定を追加`。
- `#project-ribbon` と `#project-ribbon-track` の高さ36px。時間の窓のピンに名前を常設しない。
- Presentの振る舞い(バーは押せない、カードは開かない、帯は40px以下)。
- 予定カード、まとめてカード、ドラッグ予告、時間の窓の操作、`fitOverview` の表現切替(14pxの床とShape)。
- JS内部の版数定数と、`body` の `data-*-version` の値。

## 実装方針

- レイヤーを積み増さない。見た目の変更は、その部品の持ち主のファイルを直接書き換える。新しい部品だけを新規3本に置く。
- 削れるものは削る。ツールバーの規則(6ファイル)、`.timeline-head-cell`、日の格子、死んだ `.color-*`、文字を薄める・隠す規則は消す。
- 状態の判定は `taskState()` の1箇所だけ。バー・索引・一覧・手帳・Presentが同じ関数を使う。
- 概算で足りるところは概算にする(文字幅は既存の `nameWidth`)。実測のためのreflowを増やさない。
- ブラウザにある部品を使う。手帳は `<dialog>` の `showModal()`、カードの出現は `@starting-style`、緩急は `linear()`。
- 動きは初回と変化の瞬間だけ。`prefers-reduced-motion` ではすべて止め、情報は残す。
- 意図的に割り切った箇所には `ponytail:` コメントで天井と引き上げ先を書く。計画に5箇所指定してある(行の高さの移行、稜線の区間、手帳の合成クリック、残像の上限、名前での対応づけ)。

## 実装担当が判断してよいこと

- 新規3本の内部構造(関数の分け方、状態の持ち方)。
- 余白・角丸・影の細部。モックと計画のトークンから大きく外れない範囲で。
- 見出しの旗が重なったときの細かい逃がし方。
- 新規e2eの書き方。既存の `public-e2e-visible-truth.mjs` と `public-e2e-task-card.mjs` の作法に合わせる。
- `?v=` の文字列(例: `20260921-desk1`)。

## 確認が必要なこと

- 第2段の見た目(停止点)。
- 計画から外れる設計変更をしたくなったとき。特に、セージ以外の手の色、ダークモード、Webフォント。
- 既存e2eの照合値を変えたくなったとき(仕様として消した振る舞いを照合している場合を除く)。
- 保存データやJSONスキーマを変えたくなったとき。

## 確認なしで行ってよい操作

- ブランチ作成、コミット。
- 第2段の承認後の push、PR作成、CI確認、squashマージ、`deploy-pages` の確認、公開URLでの確認。
- `public-smoke` が失敗したときの原因調査と修正コミット。
- 第2段の承認後は、第3〜4段を止めずに進める。段ごとの報告で止まらない。

## 未確認事項

- `backdrop-filter`・`@starting-style`・`linear()` は、未対応の環境では効果が無くなるだけの想定です。WindowsのChrome / EdgeとiPhoneのSafariで見てください。
- ツールバーの規則の削除対象(計画U12の行番号)は `597f265` 時点です。消す前に中身を確かめてください。
- 行の高さの移行(U2)で、手で24px以下にしていた人も一度36pxに戻ります。計画で許容と判断済みです。
- `public-e2e-run.mjs` は `/tmp/` に書くため、Windowsの手元では失敗することがあります。その1本は CI に任せてかまいません。

## 調査の根拠(公開URLで実測済み)

計画の「調査で確かめた事実」表を参照してください。特に次の3つは数値で確認済みです。

- 一覧モードで1440px幅のうち937px(65%)が空白。ガントへ切り替えると右の345px(24%)が空く(事実B・C)。
- 分割表示の文字は9pxが19要素、10pxが41要素(事実A)。
- 「予定をすべて入れ替え」で完了4件→0件、締切1件→0件(事実I)。

---

## ファイル

- 計画: `C:\Users\vediv\repos\gantt\docs\PLAN-SHUHARI-UI.md`
- 依頼: `C:\Users\vediv\repos\gantt\docs\HANDOFF-SHUHARI-UI.md`
- モック: `C:\Users\vediv\repos\gantt\docs\mock-shuhari-ui.html`

## 起動文(1行)

```
C:\Users\vediv\repos\gantt\docs\PLAN-SHUHARI-UI.md と docs\HANDOFF-SHUHARI-UI.md を読み、docs\mock-shuhari-ui.html を見本に、feat/shuhari-ui を作って段階0から実装してください。
```
