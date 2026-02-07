/* ========================================
   Markdown Renderer — Code Highlighting + Copy
   ======================================== */

const MarkdownRenderer = (() => {
  // Configure marked
  const renderer = new marked.Renderer();

  // Custom code block rendering with language label + copy button
  renderer.code = function ({ text, lang }) {
    const language = lang || 'plaintext';
    const id = 'code-' + Math.random().toString(36).substr(2, 9);

    let highlighted;
    try {
      if (hljs.getLanguage(language)) {
        highlighted = hljs.highlight(text, { language }).value;
      } else {
        highlighted = hljs.highlightAuto(text).value;
      }
    } catch {
      highlighted = escapeHtml(text);
    }

    return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-block-lang">${escapeHtml(language)}</span>
          <button class="code-copy-btn" data-code-id="${id}" onclick="MarkdownRenderer.copyCode(this)">Copy</button>
        </div>
        <pre><code id="${id}" class="hljs language-${language}">${highlighted}</code></pre>
      </div>
    `;
  };

  // Inline code
  renderer.codespan = function ({ text }) {
    return `<code>${text}</code>`;
  };

  marked.setOptions({
    renderer,
    breaks: true,
    gfm: true
  });

  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, c => map[c]);
  }

  function render(text) {
    if (!text) return '';
    return marked.parse(text);
  }

  // Incremental render for streaming — parse what we have so far
  function renderPartial(text) {
    if (!text) return '';
    // For partial markdown, just render what we have
    return marked.parse(text);
  }

  function copyCode(button) {
    const codeId = button.getAttribute('data-code-id');
    const codeEl = document.getElementById(codeId);
    if (!codeEl) return;

    const text = codeEl.textContent;
    navigator.clipboard.writeText(text).then(() => {
      button.textContent = 'Copied!';
      button.classList.add('copied');
      setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('copied');
      }, 2000);
    });
  }

  return { render, renderPartial, copyCode };
})();
