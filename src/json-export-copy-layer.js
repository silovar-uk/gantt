(() => {
  const PROJECT_KEY = 'gantt-desk:v2:project';
  const APP_VERSION = 2;
  const $ = (selector) => document.querySelector(selector);

  function readProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null'); }
    catch { return null; }
  }

  function buildBackupPayload(project) {
    return {
      format: 'gantt-desk-backup',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      project,
    };
  }

  function buildAIPayload(project) {
    return {
      version: 1,
      title: project.title,
      memo: project.memo,
      view: {
        start: project.view?.start,
        end: project.view?.end,
      },
      holidays: Array.isArray(project.holidays) ? project.holidays : [],
      tasks: (project.tasks || []).map((task) => ({
        name: task.name,
        start: task.start,
        end: task.end,
        category: task.category,
        color: task.color,
        milestone: task.milestone,
        deadline: task.deadline,
        note: task.note,
      })),
    };
  }

  function showToast(message, isError = false) {
    const toast = $('#toast') || $('#share-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.toggle('is-error', isError);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    clearTimeout(toast._jsonCopyTimer);
    toast._jsonCopyTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => { toast.hidden = true; }, 180);
    }, 2600);
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    area.style.top = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy failed');
    return true;
  }

  async function copyJSON(kind) {
    const project = readProject();
    if (!project) return showToast('コピーするJSONを読み込めませんでした', true);
    const payload = kind === 'backup' ? buildBackupPayload(project) : buildAIPayload(project);
    const text = JSON.stringify(payload, null, 2);
    try {
      await copyText(text);
      showToast(kind === 'backup' ? '完全バックアップJSONをコピーしました' : 'AI連携用JSONをコピーしました');
    } catch (error) {
      console.error(error);
      showToast('クリップボードへコピーできませんでした', true);
    }
  }

  function updateLabels() {
    const backup = document.querySelector('[data-export="backup"]');
    const ai = document.querySelector('[data-export="ai"]');
    const prompt = document.querySelector('[data-export="prompt"]');
    if (backup) backup.textContent = '完全バックアップJSONをコピー';
    if (ai) ai.textContent = 'AI連携用JSONをコピー';
    if (prompt) prompt.textContent = 'AI用プロンプトをコピー';
    const button = $('#export-json-btn');
    if (button) {
      button.textContent = 'コピー';
      button.title = 'JSONやAI用プロンプトをコピーする';
    }
  }

  function bind() {
    const menu = $('#export-menu');
    if (!menu || menu.dataset.copyLayerBound === '1') return false;
    menu.dataset.copyLayerBound = '1';
    menu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-export]');
      if (!item) return;
      const type = item.dataset.export;
      if (type !== 'backup' && type !== 'ai') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      $('#export-menu').hidden = true;
      $('#export-json-btn')?.setAttribute('aria-expanded', 'false');
      copyJSON(type);
    }, true);
    return true;
  }

  function init() {
    updateLabels();
    if (bind()) return;
    let attempts = 0;
    const retry = () => {
      updateLabels();
      if (bind()) return;
      attempts += 1;
      if (attempts < 20) setTimeout(retry, 120);
    };
    retry();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
