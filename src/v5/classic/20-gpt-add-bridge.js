(() => {
  const GPT_ADD_VERSION = '20260914-gptadd1';

  function planningContext({ targetYear = '', baseDate = '', category = '' } = {}) {
    const lines = [];
    if (targetYear) lines.push(`対象年: ${targetYear}`);
    if (baseDate) lines.push(`基準日: ${baseDate}`);
    if (category) lines.push(`既定カテゴリー: ${category}`);
    return lines.length
      ? lines.join('\n')
      : '対象年・基準日は指定なし。原文だけでは確定できない年や相対日付は推測しない。';
  }

  function buildPlanningPrompt({ sourceText = '', targetYear = '', baseDate = '', category = '' } = {}) {
    const context = planningContext({ targetYear, baseDate, category });
    return `あなたは、文章・メモ・メール・箇条書きから、Gantt Deskへ安全に取り込める予定だけを構造化する日程整理担当です。\n\n目的は「それらしい計画を作ること」ではありません。\n原文から確定できる事実を失わず、推測を混ぜず、Gantt Deskの取り込みJSONへ変換してください。\n\n【判断の優先順位】\n1. 原文に明示された事実を最優先する。\n2. 対象年・基準日が指定されている場合だけ、それを使って日付を一意に確定する。\n3. それでも確定できない項目は補完せずneedsReviewへ送る。\n\n【日付ルール】\n- YYYY-MM-DD、YYYY/M/Dなど明示日付はYYYY-MM-DDへ正規化する。\n- 年のない「9/19」などは、対象年が指定されている場合だけその年を使う。\n- 「明日」「来週月曜」などの相対日付は、基準日から一意に計算できる場合だけ確定する。\n- 「来月ごろ」「秋」「なるべく早く」など幅がある表現は推測しない。\n- 開始日と終了日の両方が必要な作業で、片方しか確定できない場合はneedsReviewへ送る。\n- その日だけで成立する会議、提出、公開、締切、決定などはstart=endとし、milestone=trueにできる。\n- 1日作業として明示されているものはstart=endでもmilestone=falseにする。\n- endは必ずstart以降にする。\n\n【予定の切り方】\n- 原文にない準備工程、確認工程、バッファ、依存関係を勝手に追加しない。\n- 1つの記述を細かい複数Taskへ分解しない。明確に別工程・別成果物として書かれている場合だけ分ける。\n- 同じ予定が重複して書かれている場合は、同一内容・同一日付なら重複登録しない。\n- 予定名は原文の意味を保ち、短く識別できる形にする。キャッチコピー化しない。\n- 原文の並び順をできるだけ保つ。\n\n【カテゴリー】\n- 原文にカテゴリーや分類が明示されていればそれを使う。\n- 明示がなく「既定カテゴリー」が指定されていればそれを使う。\n- どちらもなければ「未分類」にする。\n- 内容からもっともらしいカテゴリー名を創作しない。\n\n【note】\n- 担当、場所、条件、前提、対象物など、原文にあり予定理解に必要な補足だけを書く。\n- 日付や予定名の単なる言い換えを重複して書かない。\n- 原文にない理由・目的・優先度・重要度を足さない。\n\n【needsReview】\n- 日付、年、期間、対象、予定名などが確定できず、そのままtasksへ入れると誤解が生じるものを入れる。\n- sourceTextには判断元の最小限の原文を残す。\n- reasonには「何が分からないから確定できないか」を具体的に書く。\n- missingFieldsには不足している情報名を入れる。例: ["start"], ["end"], ["year"], ["duration"]。\n- candidateStart / candidateEndは、その値だけは確定できる場合に限って入れる。\n- ユーザーへ質問文を返さない。確認が必要なものはneedsReviewへ退避する。\n\n【禁止】\n- 原文にない日付、期間、担当、カテゴリー、依存関係、優先度を推測しない。\n- priority、deadline、dependencies、statusなど未定義フィールドを追加しない。\n- Markdown、コードフェンス、前置き、解説、まとめを書かない。\n\n【JSON形式】\n{\n  "handoffVersion": 1,\n  "tasks": [\n    {\n      "name": "予定名",\n      "start": "YYYY-MM-DD",\n      "end": "YYYY-MM-DD",\n      "categoryName": "カテゴリー名",\n      "note": "原文にある必要な補足のみ",\n      "milestone": false\n    }\n  ],\n  "needsReview": [\n    {\n      "sourceText": "判断元の原文",\n      "reason": "確定できない理由",\n      "missingFields": ["start"],\n      "name": "分かる場合のみ",\n      "categoryName": "分かる場合のみ",\n      "candidateStart": "確定できた場合のみYYYY-MM-DD",\n      "candidateEnd": "確定できた場合のみYYYY-MM-DD",\n      "note": "原文にある必要な補足のみ"\n    }\n  ]\n}\n\n【出力前の自己監査】\n内部で次を確認してから、JSONだけを返してください。\n- 最上位キーはhandoffVersion / tasks / needsReviewだけか。\n- tasksの各要素はname / start / end / categoryName / note / milestoneだけか。\n- needsReviewに未知のキーがないか。\n- 全日付がYYYY-MM-DDか。\n- end >= startか。\n- milestone=trueならstart=endか。\n- 原文または基準情報だけでは決まらない値を勝手に埋めていないか。\n- 同一予定を重複させていないか。\n\n【基準情報】\n${context}\n\n【原文】\n${String(sourceText || '').trim()}`;
  }

  // The existing handoff flow calls this global function at action time.
  buildInputPrompt = buildPlanningPrompt;

  // Keep one-click manual entry. GPT is a secondary path inside Add, not a new primary mode.
  renderDetailsModal = function renderDetailsModalWithGptAdd() {
    const title = state.editor.isNew ? '予定を追加' : '予定の詳細';
    const bridge = state.editor.isNew ? `
      <div class="prompt-head" data-gpt-add-bridge>
        <div>
          <h3>GPTに指示して追加</h3>
          <p>文章や複数の予定を、日付を勝手に補完せずGantt Desk用JSONへ整理します。</p>
        </div>
        <button class="button button-secondary" type="button" data-action="add-via-gpt">GPTに指示する</button>
      </div>
      <p class="handoff-note">手入力はこのまま下で続けられます。GPTはアプリ外で開き、回答だけを検証して取り込みます。</p>` : '';
    const footer = `<button class="button button-quiet" type="button" data-action="close-modal">キャンセル</button><button class="button button-primary" type="button" data-action="save-task">保存</button>`;
    return modalFrame(title, 'SCHEDULE DETAILS', `${bridge}${editorFormHTML()}`, footer);
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="add-via-gpt"]');
    if (!button) return;
    if (state.editor?.dirty && !confirm('手入力中の内容はGPT用入力へ引き継がれません。GPTに指示する画面へ移動しますか？')) return;
    event.preventDefault();
    if (state.inputDraft?.completed) {
      state.inputDraft = null;
      state.storage.clearDraft('input');
    }
    state.editor = null;
    openModal('chat-input');
  });

  globalThis.ganttGptAddPrompt = {
    version: GPT_ADD_VERSION,
    build: buildPlanningPrompt,
  };
  document.body.dataset.gptAddPromptVersion = GPT_ADD_VERSION;
})();
