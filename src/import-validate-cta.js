(() => {
  const install = () => {
    const button = document.querySelector('#validate-json-btn');
    const input = document.querySelector('#json-input');
    if (!button || !input) return setTimeout(install, 40);

    if (!document.querySelector('#import-validate-cta-style')) {
      const style = document.createElement('style');
      style.id = 'import-validate-cta-style';
      style.textContent = `
        #validate-json-btn.import-validate-cta {
          position: relative;
          min-height: 38px;
          padding: 8px 14px 8px 15px;
          color: #ffffff;
          border-color: #0f766e;
          background: linear-gradient(135deg, #0f766e 0%, #12877d 52%, #15968a 100%);
          box-shadow: 0 7px 18px rgba(15, 118, 110, .20), 0 1px 1px rgba(15, 23, 42, .10);
          font-weight: 850;
          letter-spacing: .01em;
        }
        #validate-json-btn.import-validate-cta:hover {
          color: #ffffff;
          border-color: #0c6b64;
          background: linear-gradient(135deg, #0c6b64 0%, #0f7f76 52%, #138d82 100%);
          box-shadow: 0 10px 24px rgba(15, 118, 110, .25), 0 1px 1px rgba(15, 23, 42, .10);
          transform: translateY(-1px);
        }
        #validate-json-btn.import-validate-cta:focus-visible {
          outline: 3px solid rgba(15, 118, 110, .24);
          outline-offset: 2px;
        }
        #validate-json-btn.import-validate-cta::after {
          content: '→';
          display: inline-block;
          margin-left: 7px;
          transform: translateY(-1px);
          transition: transform .16s ease;
        }
        #validate-json-btn.import-validate-cta:hover::after {
          transform: translate(3px, -1px);
        }
        #validate-json-btn.import-validate-cta.is-waiting {
          color: #315a57;
          border-color: #b9d9d5;
          background: #f0faf8;
          box-shadow: none;
        }
        #validate-json-btn.import-validate-cta.is-waiting::after {
          color: #6a9690;
        }
        #validate-json-btn.import-validate-cta.is-ready {
          animation: validateCtaBreath 2.4s ease-in-out infinite;
        }
        @keyframes validateCtaBreath {
          0%, 100% { box-shadow: 0 7px 18px rgba(15, 118, 110, .20), 0 1px 1px rgba(15, 23, 42, .10); }
          50% { box-shadow: 0 10px 28px rgba(15, 118, 110, .29), 0 1px 1px rgba(15, 23, 42, .10); }
        }
        .import-controls:has(#validate-json-btn.import-validate-cta.is-ready) {
          align-items: center;
        }
        @media (prefers-reduced-motion: reduce) {
          #validate-json-btn.import-validate-cta.is-ready { animation: none; }
          #validate-json-btn.import-validate-cta::after { transition: none; }
        }
        @media (max-width: 650px) {
          #validate-json-btn.import-validate-cta {
            width: 100%;
            justify-content: center;
          }
          .import-controls {
            align-items: stretch;
            flex-direction: column;
          }
          .import-controls .segmented-control {
            width: 100%;
          }
          .import-controls .segmented-control label {
            flex: 1;
          }
          .import-controls .segmented-control span {
            width: 100%;
          }
        }
      `;
      document.head.append(style);
    }

    button.classList.add('import-validate-cta');
    const original = button.dataset.originalText || button.textContent.trim() || '検証する';
    button.dataset.originalText = original;

    const update = () => {
      const hasInput = input.value.trim().length > 0;
      button.classList.toggle('is-ready', hasInput);
      button.classList.toggle('is-waiting', !hasInput);
      button.textContent = hasInput ? 'JSONを検証する' : '検証する';
    };

    input.addEventListener('input', update);
    input.addEventListener('change', update);
    document.addEventListener('click', (event) => {
      if (event.target.closest('#json-import-choice-paste, #json-import-apply-sample, #json-import-inspect-sample, #json-start-to-paste, #import-start-after-prompt')) {
        setTimeout(update, 80);
      }
    });
    update();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
