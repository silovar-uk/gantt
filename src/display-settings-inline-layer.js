(() => {
  function addStyles() {
    if (document.getElementById('display-settings-inline-style')) return;
    const style = document.createElement('style');
    style.id = 'display-settings-inline-style';
    style.textContent = `
      .toolbar .display-toolbar-group {
        flex:1 1 100% !important;
        width:100% !important;
        order:6 !important;
        display:flex !important;
        flex-wrap:wrap !important;
        align-items:center !important;
        gap:7px !important;
        padding-top:4px;
      }
      .toolbar .display-settings-wrap {
        position:static !important;
        display:contents !important;
      }
      #display-settings-panel.display-panel {
        position:static !important;
        inset:auto !important;
        top:auto !important;
        right:auto !important;
        left:auto !important;
        z-index:auto !important;
        flex:1 1 100% !important;
        width:100% !important;
        max-width:none !important;
        margin:4px 0 0 !important;
        padding:10px 12px !important;
        border:1px solid #dbe7f3 !important;
        border-radius:12px !important;
        background:#f8fbff !important;
        box-shadow:none !important;
        pointer-events:auto !important;
      }
      #display-settings-panel.display-panel[hidden] {
        display:none !important;
        pointer-events:none !important;
      }
      #display-settings-panel .display-panel__head {
        padding:0 0 8px !important;
        margin:0 0 8px !important;
        border-bottom:1px solid #e6edf6 !important;
      }
      #display-settings-panel .display-panel__head strong {
        font-size:13px !important;
      }
      #display-settings-panel .display-panel__head span {
        font-size:10.5px !important;
      }
      #display-settings-panel .display-panel__section {
        padding:8px 0 !important;
      }
      #display-settings-panel .display-panel__section:not(.display-panel__quick) {
        border-bottom:1px solid #edf3f8 !important;
      }
      #display-settings-panel .density-preset-row {
        grid-template-columns:repeat(4,minmax(0,1fr)) !important;
      }
      #display-settings-panel .density-preset {
        min-height:36px !important;
        padding:6px 5px !important;
        font-size:11px !important;
      }
      #display-settings-panel .density-preset small {
        font-size:9px !important;
      }
      @media (min-width:900px) {
        #display-settings-panel.display-panel {
          display:grid;
          grid-template-columns:minmax(210px,.95fr) minmax(220px,1fr) minmax(220px,1fr) minmax(220px,1fr);
          gap:8px 14px;
          align-items:start;
        }
        #display-settings-panel[hidden] { display:none !important; }
        #display-settings-panel .display-panel__head {
          grid-column:1 / -1;
        }
        #display-settings-panel .display-panel__section {
          border-bottom:0 !important;
          padding:4px 0 !important;
        }
        #display-settings-panel #category-mode-controls {
          grid-column:1 / 2;
        }
        #display-settings-panel .display-panel__quick {
          grid-column:1 / -1;
          display:flex !important;
          justify-content:flex-end;
        }
        #display-settings-panel .display-panel__quick .button {
          min-width:150px;
        }
      }
      @media (max-width:899px) {
        #display-settings-panel.display-panel {
          max-height:42vh !important;
          overflow:auto !important;
        }
      }
      @media (max-width:650px) {
        .toolbar .display-toolbar-group {
          order:8 !important;
        }
        #display-settings-panel.display-panel {
          position:static !important;
          inset:auto !important;
          max-height:48vh !important;
        }
        #display-settings-panel .density-preset-row {
          grid-template-columns:repeat(2,minmax(0,1fr)) !important;
        }
      }
    `;
    document.head.append(style);
  }

  function updateCopy() {
    const button = document.getElementById('display-settings-btn');
    if (button) {
      button.textContent = '表示メニュー';
      button.title = '表示設定を上部メニュー内に開く';
    }
    const head = document.querySelector('#display-settings-panel .display-panel__head span');
    if (head) {
      head.textContent = 'グラフに重ならないよう、上部メニュー内に展開します。行高・日付幅・カテゴリ表示をまとめて調整できます。';
    }
  }

  function init() {
    addStyles();
    updateCopy();
    let count = 0;
    const retry = () => {
      updateCopy();
      count += 1;
      if (count < 20 && !document.getElementById('display-settings-btn')) setTimeout(retry, 120);
    };
    retry();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
