(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const $ = (selector) => document.querySelector(selector);
  let initialized = false;

  function readProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}'); }
    catch { return {}; }
  }
  function todayISO() {
    const now = new Date();
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  function addDays(iso, amount) {
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + amount);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  function sampleJSON() {
    const start = todayISO();
    return JSON.stringify({
      version: 1,
      title: '開幕プロモーション進行表',
      memo: 'サンプルです。必要に応じて置き換えてください。',
      view: { start, end: addDays(start, 42) },
      holidays: [{ date: addDays(start, 10), name: '社内確認日' }],
      tasks: [
        { name: '全体方針の整理', start, end: addDays(start, 3), category: '企画', color: 'blue', milestone: false, deadline: false, note: '目的・対象・導線を整理' },
        { name: 'KV初稿確認', start: addDays(start, 4), end: addDays(start, 4), category: '制作', color: 'purple', milestone: true, deadline: true, note: '関係者確認' },
        { name: '告知文作成', start: addDays(start, 5), end: addDays(start, 9), category: '広報', color: 'green', milestone: false, deadline: false, note: '公式サイト・SNS向け' }
      ]
    }, null, 2);
  }
  function aiPrompt() {
    const project = readProject();
    const view = project.view || {};
    const categories = [...new Set((project.tasks || []).map((task) => task.category).filter(Boolean))];
    return `以下の情報を、Gantt Deskに読み込めるJSONへ整形してください。\n\n要件:\n- JSONのみを出力してください。\n- title, memo, view, holidays, tasks を含めてください。\n- 日付は YYYY-MM-DD 形式にしてください。\n- tasksの各要素には name, start, end, category, color, milestone, deadline, note を含めてください。\n- color は gray / blue / green / amber / red / purple のいずれかにしてください。\n- milestone が true の場合、end は start と同じ日付にしてください。\n\n現在の参考情報:\n- 案件名: ${project.title || '未設定'}\n- 表示開始: ${view.start || '未設定'}\n- 表示終了: ${view.end || '未設定'}\n- 既存カテゴリ: ${categories.join(' / ') || '未分類'}\n\n素材:\nここに進行表にしたい内容を貼り付けてください。`;
  }
  function addStyles() {
    if ($('#import-step-lite-style')) return;
    const style = document.createElement('style');
    style.id = 'import-step-lite-style';
    style.textContent = `
      .import-step-lite { margin:0 0 14px; padding:12px 14px; border:1px solid #dbe7f3; border-radius:12px; background:#f8fbff; }
      .import-step-lite__list { margin:0; padding:0; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; list-style:none; }
      .import-step-lite__item { min-height:52px; padding:9px 10px; display:grid; align-content:center; gap:3px; border:1px solid #dbe2ea; border-radius:9px; background:#fff; color:#64748b; }
      .import-step-lite__item.is-active { color:#244a8f; border-color:#86a7df; background:#eef4ff; box-shadow:inset 0 0 0 1px rgba(36,74,143,.08); }
      .import-step-lite__item.is-done { color:#0f766e; border-color:#9fd5ca; background:#f0fdfa; }
      .import-step-lite__number { font-size:10px; font-weight:900; letter-spacing:.08em; }
      .import-step-lite__label { font-size:12px; font-weight:850; }
      .import-step-lite__help { margin:9px 0 0; color:#64748b; font-size:11px; line-height:1.55; }
      .import-step-tools { margin:0 0 10px; padding:10px; display:flex; flex-wrap:wrap; gap:8px; border:1px dashed #cbd8e7; border-radius:10px; background:#fbfdff; }
      .import-step-tools .button { min-height:32px; }
      .import-step-note { flex:1 1 220px; color:#64748b; font-size:11px; line-height:1.45; }
      #validate-json-btn { border-color:#0f766e !important; color:#fff !important; background:#0f766e !important; box-shadow:0 1px 1px rgba(15,118,110,.16); }
      #validate-json-btn:hover { background:#0c625c !important; border-color:#0c625c !important; }
      #apply-json-btn:not(:disabled) { box-shadow:0 0 0 3px rgba(36,74,143,.12); }
      @media (max-width:680px) { .import-step-lite__list { grid-template-columns:1fr; } .import-step-tools { display:grid; grid-template-columns:1fr; } }
    `;
    document.head.append(style);
  }
  function setStep(step) {
    document.querySelectorAll('[data-import-step]').forEach((item) => {
      const value = Number(item.dataset.importStep);
      item.classList.toggle('is-active', value === step);
      item.classList.toggle('is-done', value < step);
    });
    const help = $('#import-step-help');
    if (!help) return;
    help.textContent = step === 1 ? 'JSONを貼り付けるか、サンプルを入れて準備します。' : step === 2 ? '検証して、エラーがないか確認します。反映方法は中身を見てから選べます。' : 'プレビュー内容を確認し、「この内容で反映」を押します。';
  }
  function updateStepFromState() {
    const input = $('#json-input');
    const apply = $('#apply-json-btn');
    if (apply && !apply.disabled) return setStep(3);
    if (input?.value.trim()) return setStep(2);
    return setStep(1);
  }
  async function copyPrompt() {
    const text = aiPrompt();
    try {
      await navigator.clipboard.writeText(text);
      showMiniStatus('AI用プロンプトをコピーしました');
    } catch {
      $('#json-input').value = text;
      setStep(2);
      showMiniStatus('コピーできなかったため、入力欄に入れました');
    }
  }
  function showMiniStatus(message) {
    const result = $('#import-result');
    if (!result) return;
    const note = document.createElement('div');
    note.className = 'import-empty';
    note.textContent = message;
    result.prepend(note);
    setTimeout(() => note.remove(), 2200);
  }
  function injectUI() {
    const modalCard = $('#json-modal .modal-card');
    const layout = $('#json-modal .import-layout');
    const main = $('#json-modal .import-main');
    if (!modalCard || !layout || !main || $('#import-step-lite')) return false;
    const steps = document.createElement('section');
    steps.id = 'import-step-lite';
    steps.className = 'import-step-lite';
    steps.innerHTML = `
      <ol class="import-step-lite__list" aria-label="JSON読み込みステップ">
        <li class="import-step-lite__item" data-import-step="1"><span class="import-step-lite__number">STEP 1</span><span class="import-step-lite__label">JSONを用意</span></li>
        <li class="import-step-lite__item" data-import-step="2"><span class="import-step-lite__number">STEP 2</span><span class="import-step-lite__label">検証する</span></li>
        <li class="import-step-lite__item" data-import-step="3"><span class="import-step-lite__number">STEP 3</span><span class="import-step-lite__label">確認して反映</span></li>
      </ol>
      <p id="import-step-help" class="import-step-lite__help"></p>`;
    layout.insertAdjacentElement('beforebegin', steps);

    const tools = document.createElement('div');
    tools.id = 'import-step-tools';
    tools.className = 'import-step-tools';
    tools.innerHTML = `
      <button id="import-sample-fill-btn" class="button button-secondary" type="button">サンプルを入れる</button>
      <button id="import-prompt-copy-btn" class="button button-secondary" type="button">AI用プロンプトをコピー</button>
      <span class="import-step-note">最初に追加／置き換えを決めなくても大丈夫です。検証後に中身を見てから判断できます。</span>`;
    main.insertAdjacentElement('afterbegin', tools);
    return true;
  }
  function bindEvents() {
    $('#json-input')?.addEventListener('input', updateStepFromState);
    $('#validate-json-btn')?.addEventListener('click', () => setTimeout(updateStepFromState, 180));
    $('#apply-json-btn')?.addEventListener('click', () => setStep(3));
    $('#import-sample-fill-btn')?.addEventListener('click', () => {
      const input = $('#json-input');
      if (!input) return;
      input.value = sampleJSON();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setStep(2);
      showMiniStatus('サンプルJSONを入力しました。検証してください。');
    });
    $('#import-prompt-copy-btn')?.addEventListener('click', copyPrompt);
    $('#import-json-btn')?.addEventListener('click', () => setTimeout(updateStepFromState, 180));
  }
  function init() {
    if (initialized) return;
    addStyles();
    let attempts = 0;
    const retry = () => {
      if (!injectUI()) {
        if (attempts < 30) { attempts += 1; setTimeout(retry, 120); }
        return;
      }
      initialized = true;
      bindEvents();
      updateStepFromState();
    };
    retry();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
