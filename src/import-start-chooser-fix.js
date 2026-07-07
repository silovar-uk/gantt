(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const $ = (selector) => document.querySelector(selector);

  function buildPrompt() {
    try {
      const project = JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}');
      const categories = [...new Set((Array.isArray(project.categories) ? project.categories : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean))];
      const title = String(project.title || '新しいガント');
      const period = project.view?.start && project.view?.end ? `${project.view.start} 〜 ${project.view.end}` : '必要に応じて設定';
      return `あなたはプロジェクト進行表の編集者です。以下の案件情報を、Gantt Deskにそのまま読み込めるJSONへ変換してください。\n\n出力ルール\n- 説明文、Markdown、コードフェンスは付けず、JSONだけを出力する\n- 日付は必ず YYYY-MM-DD 形式\n- tasks は配列。各タスクに name / start / end / category / color / milestone / deadline / note を入れる\n- 1日だけの節目は milestone: true、end は start と同じ日付\n- 締切として強調する節目だけ deadline: true。deadline: true は milestone: true のときだけ使う\n- color は gray / blue / green / amber / red / purple のいずれか\n- 日付や内容が曖昧なら推測せず、note に「要確認」と書く\n\n現在の案件名\n${title}\n\n現在の表示期間\n${period}\n\n既存カテゴリ候補\n${categories.length ? categories.join('、') : '未分類'}\n\n出力するJSON形式\n{\n  "version": 1,\n  "title": "案件名",\n  "memo": "全体の共有事項",\n  "view": {\n    "start": "2026-07-01",\n    "end": "2026-08-31"\n  },\n  "tasks": [\n    {\n      "name": "KV初稿提出",\n      "start": "2026-07-08",\n      "end": "2026-07-10",\n      "category": "制作",\n      "color": "blue",\n      "milestone": false,\n      "deadline": false,\n      "note": "確認者・留意事項"\n    }\n  ]\n}`;
    } catch {
      return 'JSONを作成してください。';
    }
  }

  function restoreStartChoices() {
    const card = $('#import-start-prompt');
    const panel = $('#import-start-prompt-panel');
    if (card) card.hidden = false;
    if (panel) panel.hidden = true;
  }

  function install() {
    const modal = $('#json-modal');
    if (!modal) return setTimeout(install, 50);

    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'attributes' && record.attributeName === 'hidden') && !modal.hidden) {
        setTimeout(restoreStartChoices, 0);
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['hidden'] });

    document.addEventListener('click', (event) => {
      const promptCard = event.target.closest('#import-start-prompt');
      if (promptCard) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const panel = $('#import-start-prompt-panel');
        const area = $('#import-start-prompt-area');
        if (panel && area) {
          panel.hidden = false;
          area.value = buildPrompt();
          area.focus();
          area.select();
        }
        return;
      }
      if (event.target.closest('#import-back-to-start')) setTimeout(restoreStartChoices, 0);
    }, true);
  }

  install();
})();
