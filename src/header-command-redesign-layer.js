(() => {
  const $ = (selector) => document.querySelector(selector);
  let retryCount = 0;
  let polishTimer = null;

  function addStyles() {
    if ($('#header-command-redesign-style')) return;
    const style = document.createElement('style');
    style.id = 'header-command-redesign-style';
    style.textContent = `
      body.header-command-redesigned .app-header {
        border-bottom:1px solid #dfe8f2;
        background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%);
      }
      body.header-command-redesigned .project-bar {
        align-items:center;
        gap:10px 16px;
        padding-block:10px;
        border-bottom:1px solid #e8eef6;
      }
      body.header-command-redesigned .project-title-wrap {
        min-width:280px;
        flex:1 1 360px;
      }
      body.header-command-redesigned .project-title {
        max-width:min(620px,100%);
      }
      body.header-command-redesigned .project-actions {
        flex:0 1 auto;
        justify-content:flex-end;
        align-items:center;
        gap:6px;
      }
      body.header-command-redesigned .project-actions .save-status {
        order:0;
        flex:0 0 auto;
        max-width:150px;
        min-height:28px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        padding:4px 9px;
        border:1px solid #dbe5ef;
        border-radius:999px;
        background:#f8fafc;
        color:#64748b;
        font-size:11px;
        font-weight:800;
        white-space:nowrap;
      }
      body.header-command-redesigned .project-actions .action-share { order:1; }
      body.header-command-redesigned .project-actions .action-export-wrap { order:2; }
      body.header-command-redesigned .project-actions .action-library { order:3; }
      body.header-command-redesigned .project-actions .action-more-wrap { order:4; }
      body.header-command-redesigned #share-open-btn,
      body.header-command-redesigned #export-json-btn,
      body.header-command-redesigned #library-open-btn {
        min-width:70px;
        min-height:32px;
        padding-inline:10px;
        border-radius:9px;
      }
      body.header-command-redesigned #more-btn {
        width:34px;
        height:32px;
        border-radius:9px;
      }
      body.header-command-redesigned #import-json-btn.command-import-action {
        min-height:34px;
        padding-inline:10px;
        border-radius:9px;
        background:#fff;
        border-color:#cbd7e6;
        color:#334155;
        box-shadow:none;
        font-weight:850;
      }
      body.header-command-redesigned #import-json-btn.command-import-action:hover {
        background:#eef4ff;
        border-color:#8aa8dc;
        color:#244a8f;
      }
      body.header-command-redesigned .toolbar {
        display:flex;
        align-items:center;
        gap:8px 12px;
        padding-block:9px;
        background:#fff;
      }
      body.header-command-redesigned .toolbar-group {
        min-width:0;
      }
      body.header-command-redesigned .toolbar-group.command-primary-group {
        order:1;
        flex:0 1 auto;
      }
      body.header-command-redesigned .toolbar-group-view {
        order:2;
        flex:1 1 420px;
        justify-content:center;
      }
      body.header-command-redesigned .toolbar-group-zoom {
        order:3;
        flex:0 1 260px;
      }
      body.header-command-redesigned .display-toolbar-group {
        order:4;
        flex:0 0 auto;
      }
      body.header-command-redesigned .command-divider {
        display:inline-block;
        width:1px;
        height:22px;
        margin-inline:2px;
        background:#dbe5ef;
        flex:0 0 1px;
      }
      body.header-command-redesigned .toolbar-label {
        font-size:11px;
        font-weight:850;
        color:#64748b;
      }
      body.header-command-redesigned .compact-field {
        background:#f8fafc;
        border-color:#e2e8f0;
      }
      body.header-command-redesigned #today-btn {
        border-color:#dbe5ef;
        background:#f8fafc;
      }
      body.header-command-redesigned #display-settings-btn {
        min-width:70px;
      }
      body.header-command-redesigned #display-compact-btn {
        min-width:78px;
      }
      @media (max-width:1040px) {
        body.header-command-redesigned .project-bar {
          align-items:flex-start;
        }
        body.header-command-redesigned .project-actions {
          flex:1 1 360px;
        }
        body.header-command-redesigned .toolbar {
          align-items:stretch;
        }
        body.header-command-redesigned .toolbar-group-view {
          justify-content:flex-start;
          flex-basis:100%;
          order:5;
        }
        body.header-command-redesigned .toolbar-group-zoom {
          flex:1 1 240px;
        }
      }
      @media (max-width:720px) {
        body.header-command-redesigned .project-bar {
          padding:9px 10px;
        }
        body.header-command-redesigned .project-title-wrap {
          flex-basis:100%;
          min-width:0;
        }
        body.header-command-redesigned .project-actions {
          width:100%;
          display:grid;
          grid-template-columns:auto 1fr 1fr auto;
          gap:6px;
        }
        body.header-command-redesigned .project-actions .save-status {
          grid-column:1;
          grid-row:1;
          max-width:none;
        }
        body.header-command-redesigned .project-actions .action-share {
          grid-column:2;
          grid-row:1;
        }
        body.header-command-redesigned .project-actions .action-export-wrap {
          grid-column:3;
          grid-row:1;
        }
        body.header-command-redesigned .project-actions .action-more-wrap {
          grid-column:4;
          grid-row:1;
        }
        body.header-command-redesigned .project-actions .action-library {
          grid-column:1 / -1;
          grid-row:2;
        }
        body.header-command-redesigned #share-open-btn,
        body.header-command-redesigned #export-json-btn,
        body.header-command-redesigned #library-open-btn {
          width:100%;
        }
        body.header-command-redesigned .toolbar {
          padding:8px 10px;
          gap:7px;
        }
        body.header-command-redesigned .toolbar-group.command-primary-group,
        body.header-command-redesigned .toolbar-group-zoom,
        body.header-command-redesigned .display-toolbar-group,
        body.header-command-redesigned .toolbar-group-view {
          flex:1 1 100%;
          width:100%;
        }
        body.header-command-redesigned .toolbar-group.command-primary-group {
          display:grid;
          grid-template-columns:1fr 1fr 34px 34px 1fr;
          gap:6px;
        }
        body.header-command-redesigned .command-divider {
          display:none;
        }
        body.header-command-redesigned #add-task-btn,
        body.header-command-redesigned #add-milestone-btn,
        body.header-command-redesigned #import-json-btn {
          width:100%;
        }
        body.header-command-redesigned .toolbar-group-view {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:6px;
        }
        body.header-command-redesigned .toolbar-group-view #today-btn {
          grid-column:1 / -1;
          width:100%;
        }
        body.header-command-redesigned .toolbar-group-view .range-separator {
          display:none;
        }
        body.header-command-redesigned .toolbar-group-view .compact-field {
          width:100%;
        }
      }
      @media (max-width:420px) {
        body.header-command-redesigned .project-actions {
          grid-template-columns:1fr 1fr 38px;
        }
        body.header-command-redesigned .project-actions .save-status {
          grid-column:1 / -1;
        }
        body.header-command-redesigned .project-actions .action-share {
          grid-column:1;
          grid-row:2;
        }
        body.header-command-redesigned .project-actions .action-export-wrap {
          grid-column:2;
          grid-row:2;
        }
        body.header-command-redesigned .project-actions .action-more-wrap {
          grid-column:3;
          grid-row:2;
        }
        body.header-command-redesigned .project-actions .action-library {
          grid-column:1 / -1;
          grid-row:3;
        }
        body.header-command-redesigned .toolbar-group.command-primary-group {
          grid-template-columns:1fr 1fr;
        }
        body.header-command-redesigned #undo-btn,
        body.header-command-redesigned #redo-btn {
          width:100%;
        }
        body.header-command-redesigned #import-json-btn {
          grid-column:1 / -1;
        }
      }
    `;
    document.head.append(style);
  }

  function ensureDivider(id) {
    let divider = document.getElementById(id);
    if (!divider) {
      divider = document.createElement('span');
      divider.id = id;
      divider.className = 'command-divider';
      divider.setAttribute('aria-hidden', 'true');
    }
    return divider;
  }

  function moveImportToCommandBar() {
    const importer = $('#import-json-btn');
    const primaryGroup = $('.toolbar .toolbar-group:first-child');
    if (!importer || !primaryGroup) return false;
    primaryGroup.classList.add('command-primary-group');
    importer.classList.add('command-import-action');
    importer.textContent = '読込';
    importer.title = 'JSONを読み込む';

    const redo = $('#redo-btn');
    const divider = ensureDivider('command-import-divider');
    if (redo && !primaryGroup.contains(divider)) redo.insertAdjacentElement('afterend', divider);
    if (!primaryGroup.contains(importer)) {
      divider.insertAdjacentElement('afterend', importer);
    } else if (divider.nextElementSibling !== importer) {
      divider.insertAdjacentElement('afterend', importer);
    }
    return true;
  }

  function polishProjectActions() {
    const actions = $('.project-actions');
    if (!actions) return false;
    const save = $('#save-status');
    const share = $('#share-open-btn');
    const exporter = $('#export-json-btn');
    const library = $('#library-open-btn');
    const more = $('#more-btn');
    if (save) actions.append(save);
    if (share) actions.append(share);
    const exportWrap = exporter?.closest('.menu-wrap');
    if (exportWrap) actions.append(exportWrap);
    if (library) actions.append(library);
    const moreWrap = more?.closest('.menu-wrap');
    if (moreWrap) actions.append(moreWrap);
    if (share) {
      share.textContent = '共有';
      share.title = '共有ビューと画像出力を開く';
      share.classList.add('action-share');
    }
    if (exporter) {
      exporter.textContent = 'コピー';
      exporter.title = 'JSONやAI用プロンプトをコピーする';
      exportWrap?.classList.add('action-export-wrap');
    }
    if (library) {
      library.textContent = '保存';
      library.title = '保存済みガントを管理する';
      library.classList.add('action-library');
    }
    moreWrap?.classList.add('action-more-wrap');
    return true;
  }

  function polishToolbar() {
    $('#add-task-btn')?.setAttribute('title', 'タスクを追加');
    $('#add-milestone-btn')?.setAttribute('title', 'マイルストーンを追加');
    $('#today-btn')?.setAttribute('title', '今日の位置へ移動');
    const display = $('#display-settings-btn');
    if (display) {
      display.textContent = '表示';
      display.title = '見え方・行高・列表示を調整する';
    }
  }

  function apply() {
    addStyles();
    const moved = moveImportToCommandBar();
    polishProjectActions();
    polishToolbar();
    document.body.classList.add('header-command-redesigned');
    return moved;
  }

  function scheduleApply() {
    clearTimeout(polishTimer);
    polishTimer = setTimeout(apply, 60);
  }

  function init() {
    apply();
    const retry = () => {
      if (apply()) return;
      retryCount += 1;
      if (retryCount < 30) setTimeout(retry, 120);
    };
    retry();
    document.addEventListener('gantt-desk:rendered', scheduleApply);
    window.addEventListener('resize', scheduleApply);
    setTimeout(scheduleApply, 400);
    setTimeout(scheduleApply, 1100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
