(() => {
  const $ = (selector) => document.querySelector(selector);
  let retryCount = 0;
  let relabelTimer = null;

  function addStyles() {
    if ($('#display-menu-redesign-style')) return;
    const style = document.createElement('style');
    style.id = 'display-menu-redesign-style';
    style.textContent = `
      #display-settings-btn.display-menu-redesigned-button {
        min-width:76px;
      }
      #display-settings-panel.display-redesigned {
        display:block !important;
        padding:12px !important;
        background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%) !important;
      }
      #display-settings-panel.display-redesigned[hidden] {
        display:none !important;
      }
      #display-settings-panel.display-redesigned .display-panel__head {
        display:flex !important;
        align-items:flex-start !important;
        justify-content:space-between !important;
        gap:10px !important;
        padding:0 0 10px !important;
        margin:0 0 10px !important;
        border-bottom:1px solid #e6edf6 !important;
      }
      #display-settings-panel.display-redesigned .display-panel__head strong {
        font-size:14px !important;
        letter-spacing:.01em;
      }
      #display-settings-panel.display-redesigned .display-panel__head span {
        max-width:720px;
        color:#64748b !important;
        font-size:11px !important;
        line-height:1.45 !important;
      }
      #display-settings-panel.display-redesigned .display-menu-section {
        padding:10px 0 !important;
        border-bottom:1px solid #e9f0f7 !important;
      }
      #display-settings-panel.display-redesigned .display-menu-section:last-child {
        border-bottom:0 !important;
        padding-bottom:0 !important;
      }
      #display-settings-panel.display-redesigned .display-menu-section-title {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom:8px;
      }
      #display-settings-panel.display-redesigned .display-menu-section-title strong {
        color:#172033;
        font-size:12px;
        font-weight:900;
      }
      #display-settings-panel.display-redesigned .display-menu-section-title span {
        color:#8a9aab;
        font-size:10px;
        font-weight:800;
        letter-spacing:.06em;
        text-transform:uppercase;
      }
      #display-settings-panel.display-redesigned .display-menu-section-copy {
        margin:-3px 0 9px;
        color:#64748b;
        font-size:10.5px;
        line-height:1.45;
      }
      #display-settings-panel.display-redesigned .display-control-block {
        padding:0 !important;
        border:0 !important;
      }
      #display-settings-panel.display-redesigned .display-control-block + .display-control-block {
        margin-top:10px;
      }
      #display-settings-panel.display-redesigned .display-menu-grid {
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px 14px;
      }
      #display-settings-panel.display-redesigned .display-menu-grid .display-control-block + .display-control-block {
        margin-top:0;
      }
      #display-settings-panel.display-redesigned .display-panel__label {
        margin-bottom:6px !important;
        font-size:11.5px !important;
      }
      #display-settings-panel.display-redesigned .display-range {
        height:18px;
      }
      #display-settings-panel.display-redesigned .density-preset-row {
        grid-template-columns:repeat(4,minmax(0,1fr)) !important;
        gap:7px !important;
      }
      #display-settings-panel.display-redesigned .density-preset {
        min-height:42px !important;
        padding:7px 5px !important;
        border-radius:10px !important;
      }
      #display-settings-panel.display-redesigned .density-preset small {
        margin-top:2px !important;
      }
      #display-settings-panel.display-redesigned .display-menu-helper .display-panel__quick {
        display:grid !important;
        grid-template-columns:1fr 1fr !important;
        gap:7px !important;
        padding:0 !important;
        border:0 !important;
      }
      #display-settings-panel.display-redesigned .category-mode-help {
        margin-top:7px !important;
      }
      @media (min-width:900px) {
        #display-settings-panel.display-redesigned {
          width:100% !important;
          max-width:none !important;
        }
        #display-settings-panel.display-redesigned .display-menu-body {
          display:grid;
          grid-template-columns:minmax(230px,1fr) minmax(230px,1fr) minmax(230px,1fr);
          gap:0 16px;
          align-items:start;
        }
        #display-settings-panel.display-redesigned .display-menu-section {
          border-bottom:0 !important;
          padding:4px 0 !important;
        }
        #display-settings-panel.display-redesigned .display-menu-appearance {
          grid-column:1 / 2;
        }
        #display-settings-panel.display-redesigned .display-menu-vertical,
        #display-settings-panel.display-redesigned .display-menu-horizontal {
          grid-column:2 / 3;
        }
        #display-settings-panel.display-redesigned .display-menu-columns,
        #display-settings-panel.display-redesigned .display-menu-helper {
          grid-column:3 / 4;
        }
        #display-settings-panel.display-redesigned .display-menu-horizontal {
          margin-top:12px;
        }
        #display-settings-panel.display-redesigned .display-menu-helper {
          margin-top:12px;
        }
        #display-settings-panel.display-redesigned .display-menu-grid {
          grid-template-columns:1fr;
          gap:10px;
        }
      }
      @media (max-width:650px) {
        #display-settings-panel.display-redesigned .display-menu-grid {
          grid-template-columns:1fr;
        }
        #display-settings-panel.display-redesigned .density-preset-row {
          grid-template-columns:repeat(2,minmax(0,1fr)) !important;
        }
      }
    `;
    document.head.append(style);
  }

  function sectionTemplate(className, title, code, copy = '') {
    const section = document.createElement('div');
    section.className = `display-panel__section display-menu-section ${className}`;
    section.innerHTML = `
      <div class="display-menu-section-title"><strong>${title}</strong><span>${code}</span></div>
      ${copy ? `<p class="display-menu-section-copy">${copy}</p>` : ''}
    `;
    return section;
  }

  function makeBlock(section) {
    if (!section) return null;
    section.classList.remove('display-panel__section');
    section.classList.add('display-control-block');
    return section;
  }

  function relabel() {
    const button = $('#display-settings-btn');
    if (button) {
      button.textContent = '表示';
      button.title = '見え方・行高・列表示を調整する';
      button.classList.add('display-menu-redesigned-button');
    }
    const compact = document.querySelector('[data-density-preset="compact"]');
    if (compact) compact.innerHTML = '一覧<small>24px</small>';
    const current = $('#display-density-current');
    if (current && current.textContent === '圧縮') current.textContent = '一覧';
    const reset = $('#reset-density-btn');
    if (reset) reset.textContent = '表示をリセット';
    const compactBtn = $('#display-compact-btn');
    if (compactBtn) {
      compactBtn.textContent = '極小表示';
      compactBtn.title = '行と日付幅を限界まで縮め、全体を俯瞰します';
    }
  }

  function redesignPanel() {
    const panel = $('#display-settings-panel');
    if (!panel) return false;
    addStyles();
    relabel();

    const head = panel.querySelector('.display-panel__head');
    if (head) {
      const strong = head.querySelector('strong');
      const copy = head.querySelector('span');
      if (strong) strong.textContent = '表示';
      if (copy) copy.textContent = '見たい粒度に合わせて、行・列・日付幅を調整します。';
    }

    let body = panel.querySelector('.display-menu-body');
    if (!body) {
      body = document.createElement('div');
      body.className = 'display-menu-body';
      panel.append(body);
    }

    const rowSection = $('#row-height-slider')?.closest('.display-panel__section, .display-control-block');
    const daySection = $('#day-width-slider')?.closest('.display-panel__section, .display-control-block');
    const panelSection = $('#panel-width-slider')?.closest('.display-panel__section, .display-control-block');
    const categorySection = $('#category-mode-controls');
    const quickSection = $('#fit-tasks-range-btn')?.closest('.display-panel__section, .display-panel__quick, .display-control-block');
    const densitySection = document.querySelector('[data-density-preset]')?.closest('.display-panel__section, .display-control-block');

    let appearance = panel.querySelector('.display-menu-appearance');
    if (!appearance) {
      appearance = sectionTemplate('display-menu-appearance', '見え方', 'PRESET', '一覧性を優先するか、余白を残して読みやすくするかを切り替えます。');
      body.append(appearance);
    }
    if (densitySection && !appearance.contains(densitySection)) appearance.append(makeBlock(densitySection));
    const densityLabel = appearance.querySelector('.display-panel__label span:first-child');
    if (densityLabel) densityLabel.textContent = '密度プリセット';

    let vertical = panel.querySelector('.display-menu-vertical');
    if (!vertical) {
      vertical = sectionTemplate('display-menu-vertical', '縦方向', 'ROW', '1画面に入るタスク数を調整します。');
      body.append(vertical);
    }
    if (rowSection && !vertical.contains(rowSection)) vertical.append(makeBlock(rowSection));

    let horizontal = panel.querySelector('.display-menu-horizontal');
    if (!horizontal) {
      horizontal = sectionTemplate('display-menu-horizontal', '横方向', 'WIDTH', '左の表と右の時間軸の見え方を調整します。');
      const grid = document.createElement('div');
      grid.className = 'display-menu-grid';
      horizontal.append(grid);
      body.append(horizontal);
    }
    const horizontalGrid = horizontal.querySelector('.display-menu-grid') || horizontal;
    if (panelSection && !horizontalGrid.contains(panelSection)) horizontalGrid.append(makeBlock(panelSection));
    if (daySection && !horizontalGrid.contains(daySection)) horizontalGrid.append(makeBlock(daySection));

    let columns = panel.querySelector('.display-menu-columns');
    if (!columns) {
      columns = sectionTemplate('display-menu-columns', '列', 'COLUMN', 'カテゴリの見せ方を切り替えて、左の表を詰められます。');
      const slot = document.createElement('div');
      slot.id = 'category-mode-slot';
      columns.append(slot);
      body.append(columns);
    }
    const slot = $('#category-mode-slot') || columns;
    if (categorySection && !slot.contains(categorySection)) {
      slot.append(makeBlock(categorySection));
    }

    let helper = panel.querySelector('.display-menu-helper');
    if (!helper) {
      helper = sectionTemplate('display-menu-helper', '補助', 'UTILITY');
      body.append(helper);
    }
    if (quickSection && !helper.contains(quickSection)) {
      quickSection.classList.remove('display-panel__section');
      quickSection.classList.add('display-panel__quick');
      helper.append(quickSection);
    }

    panel.classList.add('display-redesigned');
    return true;
  }

  function scheduleRelabel() {
    clearTimeout(relabelTimer);
    relabelTimer = setTimeout(() => {
      relabel();
      redesignPanel();
    }, 40);
  }

  function init() {
    addStyles();
    if (redesignPanel()) {
      scheduleRelabel();
    }
    const retry = () => {
      if (redesignPanel()) return;
      retryCount += 1;
      if (retryCount < 40) setTimeout(retry, 120);
    };
    retry();
    document.addEventListener('click', (event) => {
      if (event.target.closest('#display-settings-btn, [data-density-preset], #reset-density-btn')) scheduleRelabel();
    });
    window.addEventListener('gantt-display-updated', scheduleRelabel);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
