(() => {
  const ICON = 'data:image/png;base64,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';
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const $ = (selector) => document.querySelector(selector);

  function addStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .app-mark.app-mark--icon { padding:0; overflow:hidden; border:1px solid rgba(15,23,42,.08); background:#fff; box-shadow:0 1px 3px rgba(15,23,42,.16); }
      .app-mark.app-mark--icon img { display:block; width:100%; height:100%; object-fit:cover; }
      .json-quickstart { margin:14px 22px 0; padding:11px 12px; border:1px solid #d9e5f6; border-radius:10px; background:#f8fbff; }
      .json-quickstart__row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .json-quickstart__title { min-width:0; }
      .json-quickstart__title strong { display:block; color:#28486f; font-size:12px; }
      .json-quickstart__title span { display:block; margin-top:2px; color:#60728a; font-size:11px; line-height:1.45; }
      .json-quickstart__actions { display:flex; flex:0 0 auto; gap:7px; }
      .json-prompt-panel { margin-top:10px; padding-top:10px; border-top:1px solid #dce8f7; }
      .json-prompt-panel[hidden] { display:none; }
      .json-prompt-panel__top { display:flex; align-items:center; justify-content:space-between; gap:9px; margin-bottom:7px; }
      .json-prompt-panel__top strong { color:#425466; font-size:12px; }
      .json-prompt-area { width:100%; min-height:150px; padding:9px; resize:vertical; border:1px solid #b9c6d4; border-radius:8px; color:#26364b; background:#fff; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; line-height:1.5; }
      .json-prompt-area:focus { outline:3px solid rgba(36,74,143,.12); border-color:#244a8f; }
      @media (max-width:650px) { .json-quickstart { margin:10px 16px 0; } .json-quickstart__row { align-items:flex-start; flex-direction:column; } .json-quickstart__actions { width:100%; } .json-quickstart__actions .button { flex:1; } }
    `;
    document.head.append(style);
  }

  function setAppIcon() {
    const mark = $('.app-mark');
    if (mark && !mark.querySelector('img')) {
      mark.classList.add('app-mark--icon');
      mark.textContent = '';
      const image = document.createElement('img');
      image.src = ICON;
      image.alt = '';
      image.decoding = 'async';
      mark.append(image);
    }
    const addLink = (rel) => {
      const old = document.head.querySelector(`link[data-gantt-icon="${rel}"]`);
      if (old) old.remove();
      const link = document.createElement('link');
      link.rel = rel;
      link.href = ICON;
      link.sizes = '48x48';
      link.type = 'image/png';
      link.dataset.ganttIcon = rel;
      document.head.append(link);
    };
    addLink('icon');
    addLink('shortcut icon');
    addLink('apple-touch-icon');
    if (!document.head.querySelector('meta[name="theme-color"]')) {
      const meta = document.createElement('meta'); meta.name = 'theme-color'; meta.content = '#f8fafc'; document.head.append(meta);
    }
  }

  function projectContext() {
    try {
      const project = JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}');
      return {
        title: String(project.title || '新しいガント'),
        categories: [...new Set((Array.isArray(project.categories) ? project.categories : []).map((item) => String(item || '').trim()).filter(Boolean))],
        start: project.view?.start || '',
        end: project.view?.end || ''
      };
    } catch { return { title: '新しいガント', categories: [], start: '', end: '' }; }
  }

  function buildPrompt() {
    const context = projectContext();
    const categoryHint = context.categories.length ? context.categories.join('、') : '未分類';
    const periodHint = context.start && context.end ? `${context.start} 〜 ${context.end}` : '必要に応じて設定';
    return `あなたはプロジェクト進行表の編集者です。以下の案件情報を、Gantt Deskにそのまま読み込めるJSONへ変換してください。

出力ルール
- 説明文、Markdown、コードフェンスは付けず、JSONだけを出力する
- 日付は必ず YYYY-MM-DD 形式
- tasks は配列。各タスクに name / start / end / category / color / milestone / deadline / note を入れる
- 1日だけの節目は milestone: true、end は start と同じ日付
- 締切として強調する節目だけ deadline: true。deadline: true は milestone: true のときだけ使う
- color は gray / blue / green / amber / red / purple のいずれか
- 日付や内容が曖昧なら推測せず、note に「要確認」と書く

現在の案件名
${context.title}

現在の表示期間
${periodHint}

既存カテゴリ候補
${categoryHint}

出力するJSON形式
{
  "version": 1,
  "title": "案件名",
  "memo": "全体の共有事項",
  "view": {
    "start": "2026-07-01",
    "end": "2026-08-31"
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
      "note": "確認者・留意事項"
    }
  ]
}`;
  }

  function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text; area.style.position = 'fixed'; area.style.left = '-9999px';
    document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
  }

  function installImportQuickstart() {
    const modal = $('#json-modal');
    const layout = modal?.querySelector('.import-layout');
    if (!modal || !layout || $('#json-quickstart')) return;
    const quickstart = document.createElement('section');
    quickstart.id = 'json-quickstart';
    quickstart.className = 'json-quickstart';
    quickstart.innerHTML = `
      <div class="json-quickstart__row">
        <div class="json-quickstart__title">
          <strong>まずはここから</strong>
          <span>形式を確認したいときはサンプル、外部AIで作るときは専用プロンプトを使えます。</span>
        </div>
        <div class="json-quickstart__actions">
          <button id="json-quick-sample-btn" class="button button-secondary" type="button">サンプルを入れる</button>
          <button id="json-quick-prompt-btn" class="button button-secondary" type="button">作成用プロンプト</button>
        </div>
      </div>
      <div id="json-prompt-panel" class="json-prompt-panel" hidden>
        <div class="json-prompt-panel__top"><strong>外部AIにそのまま渡すプロンプト</strong><button id="json-prompt-copy-btn" class="button button-primary" type="button">コピー</button></div>
        <textarea id="json-prompt-area" class="json-prompt-area" readonly spellcheck="false"></textarea>
      </div>`;
    layout.insertAdjacentElement('beforebegin', quickstart);

    $('#json-quick-sample-btn').addEventListener('click', () => {
      const sampleButton = $('#load-sample-btn');
      if (sampleButton) sampleButton.click();
    });
    $('#json-quick-prompt-btn').addEventListener('click', () => {
      const panel = $('#json-prompt-panel');
      const area = $('#json-prompt-area');
      const shouldOpen = panel.hidden;
      panel.hidden = !shouldOpen;
      if (shouldOpen) { area.value = buildPrompt(); area.focus(); area.select(); }
    });
    $('#json-prompt-copy-btn').addEventListener('click', async () => {
      const area = $('#json-prompt-area');
      const text = area.value || buildPrompt();
      area.value = text;
      try { await navigator.clipboard.writeText(text); } catch { fallbackCopy(text); }
      const button = $('#json-prompt-copy-btn');
      const original = button.textContent; button.textContent = 'コピーしました';
      setTimeout(() => { button.textContent = original; }, 1400);
    });
  }

  function initialize() { addStyle(); setAppIcon(); installImportQuickstart(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
