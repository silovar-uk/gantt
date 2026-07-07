(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const $ = (selector) => document.querySelector(selector);
  let ready = false;
  let sampleCache = null;

  function getParts() {
    const modal = $('#json-modal');
    if (!modal) return null;
    return {
      modal,
      layout: modal.querySelector('.import-layout'),
      footer: modal.querySelector('.modal-foot'),
      input: $('#json-input'),
      validate: $('#validate-json-btn'),
    };
  }

  function getProjectContext() {
    try {
      const project = JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}');
      const categories = [...new Set((Array.isArray(project.categories) ? project.categories : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean))];
      return {
        title: String(project.title || '新しいガント'),
        categories,
        start: project.view?.start || '',
        end: project.view?.end || '',
      };
    } catch {
      return { title: '新しいガント', categories: [], start: '', end: '' };
    }
  }

  function buildPrompt() {
    const context = getProjectContext();
    const period = context.start && context.end ? `${context.start} 〜 ${context.end}` : '必要に応じて設定';
    const categories = context.categories.length ? context.categories.join('、') : '未分類';
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
${period}

既存カテゴリ候補
${categories}

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
    area.value = text;
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }

  function removeLegacyImportUI() {
    $('#json-quickstart')?.remove();
    $('#load-sample-btn')?.remove();
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .modal-card.json-import-guided { display:flex; flex-direction:column; }
      .modal-card.json-import-guided .modal-head,
      .modal-card.json-import-guided .modal-foot,
      .modal-card.json-import-guided .json-import-workspace-head { flex:0 0 auto; }
      .modal-card.json-import-guided .import-layout,
      .modal-card.json-import-guided .json-import-start { min-height:0; overflow:auto; }
      .modal-card.json-import-guided .import-layout { flex:1 1 auto; }
      .modal-card.json-import-guided .json-import-start { flex:1 1 auto; }
      .json-import-start[hidden], .json-import-workspace-head[hidden], .json-import-sample-preview[hidden], .json-import-prompt[hidden] { display:none; }
      .json-import-start { padding:20px 22px 22px; background:#fcfdff; }
      .json-import-start__eyebrow { margin:0 0 5px; color:#94a3b8; font-size:10px; font-weight:800; letter-spacing:.11em; }
      .json-import-start h3 { margin:0; color:#172033; font-size:19px; letter-spacing:-.02em; }
      .json-import-start__copy { max-width:660px; margin:7px 0 0; color:#64748b; font-size:13px; line-height:1.55; }
      .json-import-start__choices { margin-top:16px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .json-import-choice { min-height:138px; padding:14px; display:flex; flex-direction:column; align-items:flex-start; text-align:left; border:1px solid #d8e2ed; border-radius:11px; color:#172033; background:#fff; transition:border-color .15s,box-shadow .15s,transform .15s,background .15s; }
      .json-import-choice:hover { transform:translateY(-2px); border-color:#7b9ed7; background:#fbfdff; box-shadow:0 8px 22px rgba(36,74,143,.10); }
      .json-import-choice:focus-visible { outline:3px solid rgba(36,74,143,.20); outline-offset:2px; }
      .json-import-choice__icon { width:32px; height:32px; display:grid; place-items:center; border-radius:9px; color:#244a8f; background:#e8eefb; font-size:17px; font-weight:800; }
      .json-import-choice:nth-child(2) .json-import-choice__icon { color:#6d4ba0; background:#f2eaff; }
      .json-import-choice:nth-child(3) .json-import-choice__icon { color:#176452; background:#e7f6f1; }
      .json-import-choice strong { display:block; margin-top:10px; color:#25354b; font-size:13px; }
      .json-import-choice span { display:block; margin-top:4px; color:#64748b; font-size:11px; line-height:1.48; }
      .json-import-choice small { margin-top:auto; padding-top:9px; color:#244a8f; font-size:11px; font-weight:800; }
      .json-import-sample-preview, .json-import-prompt { margin-top:14px; padding:14px; border:1px solid #d9e5f6; border-radius:10px; background:#f8fbff; }
      .json-import-sample-preview__head, .json-import-prompt__head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .json-import-sample-preview__head strong, .json-import-prompt__head strong { display:block; color:#354a65; font-size:13px; }
      .json-import-sample-preview__head span { display:block; margin-top:3px; color:#64748b; font-size:11px; }
      .json-import-sample-timeline { height:46px; margin:12px 0; display:grid; grid-template-rows:repeat(4,1fr); gap:4px; padding:6px; overflow:hidden; border:1px solid #dde7f1; border-radius:8px; background:repeating-linear-gradient(90deg,#fff 0,#fff calc(20% - 1px),#edf2f7 calc(20% - 1px),#edf2f7 20%); }
      .json-import-sample-bar { height:100%; border-radius:999px; box-shadow:0 1px 1px rgba(15,23,42,.10); }
      .json-import-sample-bar.blue { background:#bfdbfe; }
      .json-import-sample-bar.green { background:#bbf7d0; }
      .json-import-sample-bar.amber { background:#fde68a; }
      .json-import-sample-bar.red { background:#fecdd3; }
      .json-import-sample-actions, .json-import-prompt-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:7px; }
      .json-import-prompt textarea { width:100%; min-height:184px; margin-top:10px; padding:10px; resize:vertical; border:1px solid #b9c6d4; border-radius:8px; color:#26364b; background:#fff; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; line-height:1.5; }
      .json-import-workspace-head { padding:11px 22px 0; display:flex; justify-content:space-between; align-items:center; gap:10px; background:#fcfdff; }
      .json-import-workspace-head span { color:#64748b; font-size:11px; }
      .json-import-back { min-height:30px; padding:5px 8px; border:1px solid transparent; border-radius:7px; color:#526174; background:transparent; font-size:12px; font-weight:750; }
      .json-import-back:hover { color:#244a8f; background:#eef4ff; }
      @media (max-width:720px) { .json-import-start__choices { grid-template-columns:1fr; } .json-import-choice { min-height:104px; } .json-import-choice strong { margin-top:8px; } .json-import-choice small { margin-top:6px; } }
      @media (max-width:650px) { .json-import-start { padding:16px; } .json-import-workspace-head { padding:10px 16px 0; } .json-import-sample-preview__head, .json-import-prompt__head { flex-direction:column; } .json-import-sample-actions, .json-import-prompt-actions { width:100%; } .json-import-sample-actions .button, .json-import-prompt-actions .button { flex:1; } }
    `;
    document.head.append(style);
  }

  function showStart() {
    const view = getParts();
    if (!view) return;
    removeLegacyImportUI();
    view.layout.hidden = true;
    view.footer.hidden = true;
    $('#json-import-workspace-head').hidden = true;
    $('#json-import-start').hidden = false;
    $('#json-import-sample-preview').hidden = true;
    $('#json-import-prompt').hidden = true;
    $('#json-import-prompt-area').value = buildPrompt();
    setTimeout(() => $('#json-import-choice-sample')?.focus(), 0);
  }

  function showWorkspace({ focusInput = false } = {}) {
    const view = getParts();
    if (!view) return;
    $('#json-import-start').hidden = true;
    $('#json-import-workspace-head').hidden = false;
    view.layout.hidden = false;
    view.footer.hidden = false;
    if (focusInput) setTimeout(() => view.input?.focus(), 0);
  }

  async function readSample() {
    if (sampleCache) return sampleCache;
    const response = await fetch('samples/sample-project.json');
    if (!response.ok) throw new Error('サンプルを読み込めませんでした。');
    sampleCache = await response.json();
    return sampleCache;
  }

  function buildMiniBars(tasks) {
    const colors = ['blue', 'green', 'amber', 'red'];
    const visible = tasks.slice(0, 4);
    return visible.map((task, index) => {
      const starts = [10, 2, 24, 48];
      const widths = [35, 62, 24, 31];
      const color = colors[index % colors.length];
      return `<div class="json-import-sample-bar ${color}" style="margin-left:${starts[index]}%;width:${widths[index]}%" title="${String(task.name || '').replaceAll('"', '&quot;')}"></div>`;
    }).join('');
  }

  async function showSamplePreview() {
    const button = $('#json-import-choice-sample');
    const initialText = button.querySelector('strong')?.textContent || 'サンプルを表示';
    button.disabled = true;
    try {
      const sample = await readSample();
      const tasks = Array.isArray(sample.tasks) ? sample.tasks : [];
      $('#json-import-sample-title').textContent = sample.title || 'サンプルプロジェクト';
      $('#json-import-sample-meta').textContent = `${tasks.length}件のタスク ・ ${sample.view?.start || ''} 〜 ${sample.view?.end || ''}`;
      $('#json-import-sample-timeline').innerHTML = buildMiniBars(tasks);
      $('#json-import-sample-preview').hidden = false;
    } catch (error) {
      window.alert(error.message || 'サンプルを読み込めませんでした。');
    } finally {
      button.disabled = false;
      const strong = button.querySelector('strong');
      if (strong) strong.textContent = initialText;
    }
  }

  async function loadSampleToWorkspace() {
    const button = $('#json-import-apply-sample');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '読み込み中…';
    try {
      const sample = await readSample();
      const view = getParts();
      showWorkspace();
      view.input.value = JSON.stringify(sample, null, 2);
      const replace = document.querySelector('input[name="import-mode"][value="replace"]');
      if (replace) replace.checked = true;
      view.validate.click();
      view.input.focus();
    } catch (error) {
      window.alert(error.message || 'サンプルを読み込めませんでした。');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function inspectSampleJSON() {
    const view = getParts();
    try {
      const sample = await readSample();
      showWorkspace();
      view.input.value = JSON.stringify(sample, null, 2);
      const replace = document.querySelector('input[name="import-mode"][value="replace"]');
      if (replace) replace.checked = true;
      view.validate.click();
      view.input.focus();
    } catch (error) {
      window.alert(error.message || 'サンプルを読み込めませんでした。');
    }
  }

  function showPrompt() {
    $('#json-import-prompt-area').value = buildPrompt();
    $('#json-import-prompt').hidden = false;
    $('#json-import-prompt-area').focus();
    $('#json-import-prompt-area').select();
  }

  async function copyPrompt() {
    const area = $('#json-import-prompt-area');
    const text = area.value || buildPrompt();
    area.value = text;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      fallbackCopy(text);
    }
    const button = $('#json-import-copy-prompt');
    const original = button.textContent;
    button.textContent = 'コピーしました';
    setTimeout(() => { button.textContent = original; }, 1300);
  }

  function createUI() {
    const view = getParts();
    if (!view || $('#json-import-start')) return;
    view.modal.querySelector('.modal-card')?.classList.add('json-import-guided');

    const start = document.createElement('section');
    start.id = 'json-import-start';
    start.className = 'json-import-start';
    start.innerHTML = `
      <p class="json-import-start__eyebrow">START WITH JSON</p>
      <h3>取り込み方を選ぶ</h3>
      <p class="json-import-start__copy">サンプルで見え方を確かめる、外部AIにJSONを作らせる、手元のJSONをそのまま入れる。ここから選べます。</p>
      <div class="json-import-start__choices">
        <button id="json-import-choice-sample" class="json-import-choice" type="button">
          <span class="json-import-choice__icon" aria-hidden="true">◫</span>
          <strong>サンプルを見る</strong>
          <span>完成イメージを小さなガントで確認します。</span>
          <small>サンプルを表示 →</small>
        </button>
        <button id="json-import-choice-prompt" class="json-import-choice" type="button">
          <span class="json-import-choice__icon" aria-hidden="true">✦</span>
          <strong>AI用プロンプトを出す</strong>
          <span>案件名・期間・カテゴリを入れた依頼文を作ります。</span>
          <small>プロンプトを表示 →</small>
        </button>
        <button id="json-import-choice-paste" class="json-import-choice" type="button">
          <span class="json-import-choice__icon" aria-hidden="true">↥</span>
          <strong>JSONを読み込む</strong>
          <span>貼り付け、ファイル選択、ドラッグ＆ドロップに進みます。</span>
          <small>JSON入力へ進む →</small>
        </button>
      </div>
      <section id="json-import-sample-preview" class="json-import-sample-preview" hidden>
        <div class="json-import-sample-preview__head">
          <div><strong id="json-import-sample-title">サンプル</strong><span id="json-import-sample-meta"></span></div>
          <div class="json-import-sample-actions"><button id="json-import-inspect-sample" class="button button-secondary" type="button">JSONを確認</button><button id="json-import-apply-sample" class="button button-primary" type="button">このサンプルを読み込む</button></div>
        </div>
        <div id="json-import-sample-timeline" class="json-import-sample-timeline" aria-hidden="true"></div>
      </section>
      <section id="json-import-prompt" class="json-import-prompt" hidden>
        <div class="json-import-prompt__head"><strong>外部AIにそのまま渡すプロンプト</strong><div class="json-import-prompt-actions"><button id="json-import-copy-prompt" class="button button-primary" type="button">コピー</button><button id="json-import-prompt-to-workspace" class="button button-secondary" type="button">JSONを貼り付ける</button></div></div>
        <textarea id="json-import-prompt-area" readonly spellcheck="false"></textarea>
      </section>`;

    const workspaceHead = document.createElement('div');
    workspaceHead.id = 'json-import-workspace-head';
    workspaceHead.className = 'json-import-workspace-head';
    workspaceHead.hidden = true;
    workspaceHead.innerHTML = `<button id="json-import-back" class="json-import-back" type="button">← 取り込み方を選び直す</button><span>JSONを貼り付けるか、ファイルをドロップしてください</span>`;

    view.layout.insertAdjacentElement('beforebegin', workspaceHead);
    workspaceHead.insertAdjacentElement('beforebegin', start);

    $('#json-import-choice-sample').addEventListener('click', showSamplePreview);
    $('#json-import-choice-prompt').addEventListener('click', showPrompt);
    $('#json-import-choice-paste').addEventListener('click', () => showWorkspace({ focusInput: true }));
    $('#json-import-apply-sample').addEventListener('click', loadSampleToWorkspace);
    $('#json-import-inspect-sample').addEventListener('click', inspectSampleJSON);
    $('#json-import-copy-prompt').addEventListener('click', copyPrompt);
    $('#json-import-prompt-to-workspace').addEventListener('click', () => showWorkspace({ focusInput: true }));
    $('#json-import-back').addEventListener('click', showStart);
  }

  function bindOpenState() {
    const view = getParts();
    if (!view) return;
    const modalObserver = new MutationObserver((records) => {
      const opened = records.some((record) => record.target === view.modal && record.type === 'attributes' && record.attributeName === 'hidden' && !view.modal.hidden);
      if (opened) requestAnimationFrame(showStart);
    });
    modalObserver.observe(view.modal, { attributes: true, attributeFilter: ['hidden'] });

    view.modal.querySelector('.modal-card')?.addEventListener('DOMNodeInserted', removeLegacyImportUI);
    $('#import-json-btn')?.addEventListener('click', () => requestAnimationFrame(showStart));

    const legacyObserver = new MutationObserver(removeLegacyImportUI);
    legacyObserver.observe(view.modal, { childList: true, subtree: true });
  }

  function initialize() {
    if (ready) return;
    const view = getParts();
    if (!view) return setTimeout(initialize, 40);
    ready = true;
    addStyles();
    removeLegacyImportUI();
    createUI();
    bindOpenState();
    if (!view.modal.hidden) showStart();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
