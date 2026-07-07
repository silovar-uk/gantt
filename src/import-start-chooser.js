(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const $ = (selector) => document.querySelector(selector);
  let installed = false;

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function projectContext() {
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
    const context = projectContext();
    const categories = context.categories.length ? context.categories.join('、') : '未分類';
    const period = context.start && context.end ? `${context.start} 〜 ${context.end}` : '必要に応じて設定';
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

  function addStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .import-start-chooser { padding:20px 22px 22px; background:#fcfdff; }
      .import-start-chooser[hidden], .import-workspace-head[hidden] { display:none; }
      .import-start-chooser__eyebrow { margin:0 0 5px; color:#94a3b8; font-size:10px; font-weight:800; letter-spacing:.11em; }
      .import-start-chooser h3 { margin:0; color:#172033; font-size:19px; letter-spacing:-.02em; }
      .import-start-chooser__copy { max-width:640px; margin:7px 0 0; color:#64748b; font-size:13px; line-height:1.55; }
      .import-start-cards { margin-top:16px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .import-start-card { min-height:168px; padding:14px; display:flex; flex-direction:column; align-items:flex-start; text-align:left; border:1px solid #d8e2ed; border-radius:11px; color:#172033; background:#fff; transition:border-color .15s,box-shadow .15s,transform .15s,background .15s; }
      .import-start-card:hover { transform:translateY(-2px); border-color:#7b9ed7; background:#fbfdff; box-shadow:0 8px 22px rgba(36,74,143,.10); }
      .import-start-card:focus-visible { outline:3px solid rgba(36,74,143,.20); outline-offset:2px; }
      .import-start-card__icon { width:34px; height:34px; display:grid; place-items:center; border-radius:9px; color:#244a8f; background:#e8eefb; font-size:18px; font-weight:800; }
      .import-start-card:nth-child(2) .import-start-card__icon { color:#6d4ba0; background:#f2eaff; }
      .import-start-card:nth-child(3) .import-start-card__icon { color:#176452; background:#e7f6f1; }
      .import-start-card strong { display:block; margin-top:13px; color:#25354b; font-size:13px; }
      .import-start-card span { display:block; margin-top:5px; color:#64748b; font-size:11px; line-height:1.5; }
      .import-start-card small { margin-top:auto; padding-top:10px; color:#244a8f; font-size:11px; font-weight:800; }
      .import-start-prompt { margin-top:14px; padding:14px; border:1px solid #d9e5f6; border-radius:10px; background:#f8fbff; }
      .import-start-prompt[hidden] { display:none; }
      .import-start-prompt__head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; }
      .import-start-prompt__head strong { color:#354a65; font-size:12px; }
      .import-start-prompt__actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:7px; }
      .import-start-prompt textarea { width:100%; min-height:188px; padding:10px; resize:vertical; border:1px solid #b9c6d4; border-radius:8px; color:#26364b; background:#fff; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; line-height:1.5; }
      .import-workspace-head { padding:11px 22px 0; display:flex; justify-content:space-between; align-items:center; gap:10px; background:#fcfdff; }
      .import-workspace-head span { color:#64748b; font-size:11px; }
      .import-back-button { min-height:30px; padding:5px 8px; border:1px solid transparent; border-radius:7px; color:#526174; background:transparent; font-size:12px; font-weight:750; }
      .import-back-button:hover { color:#244a8f; background:#eef4ff; }
      @media (max-width:720px) { .import-start-cards { grid-template-columns:1fr; } .import-start-card { min-height:112px; } .import-start-card strong { margin-top:9px; } .import-start-card small { margin-top:7px; } }
      @media (max-width:650px) { .import-start-chooser { padding:16px; } .import-workspace-head { padding:10px 16px 0; } .import-start-prompt__head { align-items:flex-start; flex-direction:column; } .import-start-prompt__actions { width:100%; } .import-start-prompt__actions .button { flex:1; } }
    `;
    document.head.append(style);
  }

  function cleanupLegacyQuickstart() {
    $('#json-quickstart')?.remove();
    $('#load-sample-btn')?.remove();
  }

  function getModalParts() {
    const modal = $('#json-modal');
    if (!modal) return null;
    return {
      modal,
      card: modal.querySelector('.modal-card'),
      layout: modal.querySelector('.import-layout'),
      foot: modal.querySelector('.modal-foot'),
      input: $('#json-input'),
      validate: $('#validate-json-btn'),
      apply: $('#apply-json-btn'),
    };
  }

  function showChooser() {
    const parts = getModalParts();
    if (!parts) return;
    cleanupLegacyQuickstart();
    parts.layout.hidden = true;
    parts.foot.hidden = true;
    $('#import-workspace-head').hidden = true;
    $('#import-start-chooser').hidden = false;
    $('#import-start-prompt').hidden = true;
    $('#import-start-prompt-area').value = buildPrompt();
    setTimeout(() => $('#import-start-sample')?.focus(), 20);
  }

  function showWorkspace({ focusInput = false } = {}) {
    const parts = getModalParts();
    if (!parts) return;
    $('#import-start-chooser').hidden = true;
    $('#import-workspace-head').hidden = false;
    parts.layout.hidden = false;
    parts.foot.hidden = false;
    if (focusInput) setTimeout(() => parts.input?.focus(), 20);
  }

  async function useSample() {
    const parts = getModalParts();
    if (!parts) return;
    const sampleButton = $('#import-start-sample');
    const original = sampleButton.textContent;
    sampleButton.disabled = true;
    sampleButton.textContent = '読み込み中…';
    try {
      const response = await fetch('samples/sample-project.json');
      if (!response.ok) throw new Error('サンプルを読み込めませんでした。');
      const sample = await response.json();
      showWorkspace();
      parts.input.value = JSON.stringify(sample, null, 2);
      document.querySelector('input[name="import-mode"][value="replace"]')?.click();
      parts.validate.click();
      parts.input.focus();
    } catch (error) {
      window.alert(error.message || 'サンプルを読み込めませんでした。');
    } finally {
      sampleButton.disabled = false;
      sampleButton.textContent = original;
    }
  }

  function showPrompt() {
    const panel = $('#import-start-prompt');
    const area = $('#import-start-prompt-area');
    panel.hidden = false;
    area.value = buildPrompt();
    area.focus();
    area.select();
  }

  async function copyPrompt() {
    const area = $('#import-start-prompt-area');
    const text = area.value || buildPrompt();
    area.value = text;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      fallbackCopy(text);
    }
    const button = $('#import-start-copy');
    const original = button.textContent;
    button.textContent = 'コピーしました';
    setTimeout(() => { button.textContent = original; }, 1300);
  }

  function createChooser() {
    const parts = getModalParts();
    if (!parts || $('#import-start-chooser')) return;
    const chooser = document.createElement('section');
    chooser.id = 'import-start-chooser';
    chooser.className = 'import-start-chooser';
    chooser.innerHTML = `
      <p class="import-start-chooser__eyebrow">START WITH JSON</p>
      <h3>JSONの用意方法を選ぶ</h3>
      <p class="import-start-chooser__copy">形式を確かめたい、AIに下書きを作らせたい、すでにJSONがある。最初の一手に合わせて進めます。</p>
      <div class="import-start-cards">
        <button id="import-start-sample" class="import-start-card" type="button">
          <span class="import-start-card__icon" aria-hidden="true">◫</span>
          <strong>サンプルを表示</strong>
          <span>完成形のJSONと、読み込み後の見え方を確認します。</span>
          <small>サンプルから始める →</small>
        </button>
        <button id="import-start-prompt" class="import-start-card" type="button">
          <span class="import-start-card__icon" aria-hidden="true">✦</span>
          <strong>AI用プロンプトを出す</strong>
          <span>現在の案件名・期間・カテゴリを含む依頼文を用意します。</span>
          <small>プロンプトを表示 →</small>
        </button>
        <button id="import-start-paste" class="import-start-card" type="button">
          <span class="import-start-card__icon" aria-hidden="true">↥</span>
          <strong>手元のJSONを読み込む</strong>
          <span>貼り付け、ファイル選択、ドラッグ＆ドロップで取り込みます。</span>
          <small>JSON入力へ進む →</small>
        </button>
      </div>
      <div id="import-start-prompt-panel" class="import-start-prompt" hidden>
        <div class="import-start-prompt__head">
          <strong>外部AIにそのまま渡すプロンプト</strong>
          <div class="import-start-prompt__actions">
            <button id="import-start-copy" class="button button-primary" type="button">コピー</button>
            <button id="import-start-after-prompt" class="button button-secondary" type="button">JSONを貼り付ける</button>
          </div>
        </div>
        <textarea id="import-start-prompt-area" readonly spellcheck="false"></textarea>
      </div>`;

    const workspaceHead = document.createElement('div');
    workspaceHead.id = 'import-workspace-head';
    workspaceHead.className = 'import-workspace-head';
    workspaceHead.hidden = true;
    workspaceHead.innerHTML = `<button id="import-back-to-start" class="import-back-button" type="button">← 最初の選択に戻る</button><span>JSONを貼り付けるか、ファイルをドロップしてください</span>`;

    parts.layout.insertAdjacentElement('beforebegin', workspaceHead);
    workspaceHead.insertAdjacentElement('beforebegin', chooser);

    $('#import-start-sample').addEventListener('click', useSample);
    $('#import-start-prompt').addEventListener('click', showPrompt);
    $('#import-start-paste').addEventListener('click', () => showWorkspace({ focusInput: true }));
    $('#import-start-copy').addEventListener('click', copyPrompt);
    $('#import-start-after-prompt').addEventListener('click', () => showWorkspace({ focusInput: true }));
    $('#import-back-to-start').addEventListener('click', showChooser);
  }

  function observeModal() {
    const parts = getModalParts();
    if (!parts) return;
    createChooser();
    cleanupLegacyQuickstart();

    const modalObserver = new MutationObserver(() => {
      cleanupLegacyQuickstart();
      if (!parts.modal.hidden) showChooser();
    });
    modalObserver.observe(parts.modal, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  }

  function initialize() {
    if (installed) return;
    installed = true;
    addStyle();

    const waitForModal = () => {
      if ($('#json-modal')) {
        observeModal();
        return;
      }
      setTimeout(waitForModal, 40);
    };
    waitForModal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
