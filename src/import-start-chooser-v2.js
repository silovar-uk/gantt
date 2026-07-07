(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const $ = (selector) => document.querySelector(selector);
  let ready = false;

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

  function removeLegacyUI() {
    $('#json-quickstart')?.remove();
    $('#load-sample-btn')?.remove();
  }

  function parts() {
    const modal = $('#json-modal');
    if (!modal) return null;
    return {
      modal,
      layout: modal.querySelector('.import-layout'),
      foot: modal.querySelector('.modal-foot'),
      input: $('#json-input'),
      validate: $('#validate-json-btn'),
    };
  }

  function addStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .json-start-choice { padding:20px 22px 22px; background:#fcfdff; }
      .json-start-choice[hidden], .json-import-workspace-head[hidden] { display:none; }
      .json-start-choice__eyebrow { margin:0 0 5px; color:#94a3b8; font-size:10px; font-weight:800; letter-spacing:.11em; }
      .json-start-choice h3 { margin:0; color:#172033; font-size:19px; letter-spacing:-.02em; }
      .json-start-choice__copy { max-width:650px; margin:7px 0 0; color:#64748b; font-size:13px; line-height:1.55; }
      .json-start-choice__cards { margin-top:16px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .json-start-choice__card { min-height:168px; padding:14px; display:flex; flex-direction:column; align-items:flex-start; text-align:left; border:1px solid #d8e2ed; border-radius:11px; color:#172033; background:#fff; transition:border-color .15s,box-shadow .15s,transform .15s,background .15s; }
      .json-start-choice__card:hover { transform:translateY(-2px); border-color:#7b9ed7; background:#fbfdff; box-shadow:0 8px 22px rgba(36,74,143,.10); }
      .json-start-choice__card:focus-visible { outline:3px solid rgba(36,74,143,.20); outline-offset:2px; }
      .json-start-choice__icon { width:34px; height:34px; display:grid; place-items:center; border-radius:9px; color:#244a8f; background:#e8eefb; font-size:18px; font-weight:800; }
      .json-start-choice__card:nth-child(2) .json-start-choice__icon { color:#6d4ba0; background:#f2eaff; }
      .json-start-choice__card:nth-child(3) .json-start-choice__icon { color:#176452; background:#e7f6f1; }
      .json-start-choice__card strong { display:block; margin-top:13px; color:#25354b; font-size:13px; }
      .json-start-choice__card span { display:block; margin-top:5px; color:#64748b; font-size:11px; line-height:1.5; }
      .json-start-choice__card small { margin-top:auto; padding-top:10px; color:#244a8f; font-size:11px; font-weight:800; }
      .json-start-prompt { margin-top:14px; padding:14px; border:1px solid #d9e5f6; border-radius:10px; background:#f8fbff; }
      .json-start-prompt[hidden] { display:none; }
      .json-start-prompt__head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px; }
      .json-start-prompt__head strong { color:#354a65; font-size:12px; }
      .json-start-prompt__actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:7px; }
      .json-start-prompt textarea { width:100%; min-height:188px; padding:10px; resize:vertical; border:1px solid #b9c6d4; border-radius:8px; color:#26364b; background:#fff; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; line-height:1.5; }
      .json-import-workspace-head { padding:11px 22px 0; display:flex; justify-content:space-between; align-items:center; gap:10px; background:#fcfdff; }
      .json-import-workspace-head span { color:#64748b; font-size:11px; }
      .json-import-back { min-height:30px; padding:5px 8px; border:1px solid transparent; border-radius:7px; color:#526174; background:transparent; font-size:12px; font-weight:750; }
      .json-import-back:hover { color:#244a8f; background:#eef4ff; }
      @media (max-width:720px) { .json-start-choice__cards { grid-template-columns:1fr; } .json-start-choice__card { min-height:112px; } .json-start-choice__card strong { margin-top:9px; } .json-start-choice__card small { margin-top:7px; } }
      @media (max-width:650px) { .json-start-choice { padding:16px; } .json-import-workspace-head { padding:10px 16px 0; } .json-start-prompt__head { align-items:flex-start; flex-direction:column; } .json-start-prompt__actions { width:100%; } .json-start-prompt__actions .button { flex:1; } }
    `;
    document.head.append(style);
  }

  function showStart() {
    const view = parts();
    if (!view) return;
    removeLegacyUI();
    view.layout.hidden = true;
    view.foot.hidden = true;
    $('#json-import-workspace-head').hidden = true;
    $('#json-start-choice').hidden = false;
    $('#json-start-prompt-panel').hidden = true;
    $('#json-start-prompt-area').value = buildPrompt();
    setTimeout(() => $('#json-choice-sample')?.focus(), 50);
  }

  function showWorkspace(focus = false) {
    const view = parts();
    if (!view) return;
    $('#json-start-choice').hidden = true;
    $('#json-import-workspace-head').hidden = false;
    view.layout.hidden = false;
    view.foot.hidden = false;
    if (focus) setTimeout(() => view.input?.focus(), 20);
  }

  async function loadSample() {
    const view = parts();
    if (!view) return;
    const button = $('#json-choice-sample');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = '読み込み中…';
    try {
      const response = await fetch('samples/sample-project.json');
      if (!response.ok) throw new Error('サンプルを読み込めませんでした。');
      const sample = await response.json();
      showWorkspace();
      view.input.value = JSON.stringify(sample, null, 2);
      document.querySelector('input[name="import-mode"][value="replace"]')?.click();
      view.validate.click();
      view.input.focus();
    } catch (error) {
      window.alert(error.message || 'サンプルを読み込めませんでした。');
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  function showPrompt() {
    const panel = $('#json-start-prompt-panel');
    const area = $('#json-start-prompt-area');
    panel.hidden = false;
    area.value = buildPrompt();
    area.focus();
    area.select();
  }

  async function copyPrompt() {
    const area = $('#json-start-prompt-area');
    const text = area.value || buildPrompt();
    area.value = text;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      fallbackCopy(text);
    }
    const button = $('#json-start-copy');
    const label = button.textContent;
    button.textContent = 'コピーしました';
    setTimeout(() => { button.textContent = label; }, 1300);
  }

  function createUI() {
    const view = parts();
    if (!view || $('#json-start-choice')) return;

    const choice = document.createElement('section');
    choice.id = 'json-start-choice';
    choice.className = 'json-start-choice';
    choice.innerHTML = `
      <p class="json-start-choice__eyebrow">START WITH JSON</p>
      <h3>JSONの用意方法を選ぶ</h3>
      <p class="json-start-choice__copy">形式を確かめたい、AIに下書きを作らせたい、すでにJSONがある。最初の一手に合わせて進めます。</p>
      <div class="json-start-choice__cards">
        <button id="json-choice-sample" class="json-start-choice__card" type="button">
          <span class="json-start-choice__icon" aria-hidden="true">◫</span>
          <strong>サンプルを表示</strong>
          <span>完成形のJSONと、読み込み後の見え方を確認します。</span>
          <small>サンプルから始める →</small>
        </button>
        <button id="json-choice-prompt" class="json-start-choice__card" type="button">
          <span class="json-start-choice__icon" aria-hidden="true">✦</span>
          <strong>AI用プロンプトを出す</strong>
          <span>案件名・表示期間・カテゴリを含む依頼文をすぐ用意します。</span>
          <small>プロンプトを表示 →</small>
        </button>
        <button id="json-choice-paste" class="json-start-choice__card" type="button">
          <span class="json-start-choice__icon" aria-hidden="true">↥</span>
          <strong>手元のJSONを読み込む</strong>
          <span>貼り付け、ファイル選択、ドラッグ＆ドロップで取り込みます。</span>
          <small>JSON入力へ進む →</small>
        </button>
      </div>
      <div id="json-start-prompt-panel" class="json-start-prompt" hidden>
        <div class="json-start-prompt__head">
          <strong>外部AIにそのまま渡すプロンプト</strong>
          <div class="json-start-prompt__actions">
            <button id="json-start-copy" class="button button-primary" type="button">コピー</button>
            <button id="json-start-to-paste" class="button button-secondary" type="button">JSONを貼り付ける</button>
          </div>
        </div>
        <textarea id="json-start-prompt-area" readonly spellcheck="false"></textarea>
      </div>`;

    const workspaceHead = document.createElement('div');
    workspaceHead.id = 'json-import-workspace-head';
    workspaceHead.className = 'json-import-workspace-head';
    workspaceHead.hidden = true;
    workspaceHead.innerHTML = `<button id="json-import-back" class="json-import-back" type="button">← 最初の選択に戻る</button><span>JSONを貼り付けるか、ファイルをドロップしてください</span>`;

    view.layout.insertAdjacentElement('beforebegin', workspaceHead);
    workspaceHead.insertAdjacentElement('beforebegin', choice);

    $('#json-choice-sample').addEventListener('click', loadSample);
    $('#json-choice-prompt').addEventListener('click', showPrompt);
    $('#json-choice-paste').addEventListener('click', () => showWorkspace(true));
    $('#json-start-copy').addEventListener('click', copyPrompt);
    $('#json-start-to-paste').addEventListener('click', () => showWorkspace(true));
    $('#json-import-back').addEventListener('click', showStart);
  }

  function bindModalState() {
    const view = parts();
    if (!view) return;
    const observer = new MutationObserver((records) => {
      removeLegacyUI();
      const opened = records.some((record) => record.type === 'attributes' && record.attributeName === 'hidden' && !view.modal.hidden);
      if (opened) showStart();
    });
    observer.observe(view.modal, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  }

  function initialize() {
    if (ready) return;
    if (!$('#json-modal')) return setTimeout(initialize, 40);
    ready = true;
    addStyle();
    removeLegacyUI();
    createUI();
    bindModalState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
