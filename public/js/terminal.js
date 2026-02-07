/* ========================================
   Terminal UI Component
   ======================================== */

const Terminal = (() => {
  const outputEl = document.getElementById('output');

  // Scroll to bottom
  function scrollToBottom() {
    requestAnimationFrame(() => {
      outputEl.scrollTop = outputEl.scrollHeight;
    });
  }

  // Create a user message block
  function addUserMessage(text) {
    const block = document.createElement('div');
    block.className = 'message-block user';
    block.innerHTML = `
      <div class="message-header">
        <span class="role">❯ You</span>
        <span class="timestamp">${formatTime()}</span>
      </div>
      <div class="message-body">${escapeHtml(text)}</div>
    `;
    outputEl.appendChild(block);
    scrollToBottom();
    return block;
  }

  // Create an assistant message block (returns handle for streaming)
  function createAssistantMessage() {
    const block = document.createElement('div');
    block.className = 'message-block assistant';

    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = `
      <span class="role"><svg viewBox="0 0 28 28" fill="currentColor" width="12" height="12" style="width:12px;height:12px;vertical-align:-1px;margin-right:3px;"><path d="M14.0566 1.05664C13.3046 4.74563 12.1665 7.5461 10.5089 9.71885C8.92048 11.8011 6.63627 13.5768 3.33398 15.1649C6.53069 16.4858 8.88719 18.1927 10.5416 20.3452C12.2148 22.5227 13.3293 25.4161 14.0566 29.0566C14.7839 25.4161 15.8984 22.5227 17.5717 20.3452C19.2261 18.1927 21.5826 16.4858 24.7793 15.1649C21.477 13.5768 19.1928 11.8011 17.6044 9.71885C15.9468 7.5461 14.8087 4.74563 14.0566 1.05664Z"/></svg>Claude</span>
      <span class="timestamp">${formatTime()}</span>
    `;

    const body = document.createElement('div');
    body.className = 'message-body markdown-body';

    const cursor = document.createElement('span');
    cursor.className = 'cursor';

    block.appendChild(header);
    block.appendChild(body);
    body.appendChild(cursor);
    outputEl.appendChild(block);
    scrollToBottom();

    let fullText = '';
    let renderTimer = null;

    return {
      element: block,
      // Append streaming text
      append(delta) {
        fullText += delta;
        // Throttle rendering for performance
        if (!renderTimer) {
          renderTimer = setTimeout(() => {
            renderTimer = null;
            body.innerHTML = MarkdownRenderer.renderPartial(fullText);
            body.appendChild(cursor);
            scrollToBottom();
          }, 30);
        }
      },
      // Finalize the message
      finish() {
        if (renderTimer) {
          clearTimeout(renderTimer);
          renderTimer = null;
        }
        body.innerHTML = MarkdownRenderer.render(fullText);
        scrollToBottom();
      },
      getText() {
        return fullText;
      }
    };
  }

  // Show thinking indicator
  function showThinking() {
    const el = document.createElement('div');
    el.className = 'thinking-indicator';
    el.id = 'current-thinking';
    el.innerHTML = `
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
      <span>Thinking...</span>
    `;
    outputEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  // Remove thinking indicator
  function removeThinking() {
    const el = document.getElementById('current-thinking');
    if (el) el.remove();
  }

  // Show thinking block (collapsible)
  function addThinkingBlock(content) {
    const block = document.createElement('div');
    block.className = 'thinking-block';

    const header = document.createElement('div');
    header.className = 'thinking-header';
    header.innerHTML = `
      <span class="thinking-toggle">▼</span>
      <span>Thinking</span>
    `;

    const contentEl = document.createElement('div');
    contentEl.className = 'thinking-content';
    contentEl.textContent = content;

    header.addEventListener('click', () => {
      header.classList.toggle('collapsed');
      contentEl.classList.toggle('collapsed');
    });

    // Start collapsed
    header.classList.add('collapsed');
    contentEl.classList.add('collapsed');

    block.appendChild(header);
    block.appendChild(contentEl);
    outputEl.appendChild(block);
    scrollToBottom();
    return block;
  }

  // Add system message
  function addSystemMessage(text) {
    const block = document.createElement('div');
    block.className = 'message-block system';
    block.innerHTML = `
      <div class="message-body markdown-body">${MarkdownRenderer.render(text)}</div>
    `;
    outputEl.appendChild(block);
    scrollToBottom();
    return block;
  }

  // Add error message
  function addErrorMessage(text) {
    const block = document.createElement('div');
    block.className = 'message-block error';
    block.innerHTML = `
      <div class="message-body">✗ ${escapeHtml(text)}</div>
    `;
    outputEl.appendChild(block);
    scrollToBottom();
    return block;
  }

  // Add usage bar after response
  function addUsageBar(usage) {
    const bar = document.createElement('div');
    bar.className = 'usage-bar';
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const total = inputTokens + outputTokens;

    bar.innerHTML = `
      <span><span class="label">Input:</span> <span class="value">${inputTokens.toLocaleString()}</span></span>
      <span><span class="label">Output:</span> <span class="value">${outputTokens.toLocaleString()}</span></span>
      <span><span class="label">Total:</span> <span class="value">${total.toLocaleString()}</span></span>
    `;
    outputEl.appendChild(bar);
    scrollToBottom();
  }

  // Add tool usage block
  function addToolBlock(name, description, content) {
    const block = document.createElement('div');
    block.className = 'tool-block';

    const icons = {
      'Read': '📄', 'Write': '✏️', 'Edit': '🔧',
      'Bash': '⚡', 'Glob': '🔍', 'Grep': '🔎',
      'WebFetch': '🌐', 'Task': '📋'
    };
    const icon = icons[name] || '⚙️';

    const header = document.createElement('div');
    header.className = 'tool-header';
    header.innerHTML = `
      <span class="tool-icon">${icon}</span>
      <span class="tool-name">${escapeHtml(name)}</span>
      <span class="tool-desc">${escapeHtml(description || '')}</span>
    `;

    const contentEl = document.createElement('div');
    contentEl.className = 'tool-content';
    if (content) {
      contentEl.innerHTML = `<pre><code>${escapeHtml(content)}</code></pre>`;
    }

    header.addEventListener('click', () => {
      contentEl.classList.toggle('collapsed');
    });

    block.appendChild(header);
    if (content) {
      block.appendChild(contentEl);
    }
    outputEl.appendChild(block);
    scrollToBottom();
    return block;
  }

  // Clear the terminal output
  function clear() {
    outputEl.innerHTML = '';
  }

  // Add an aborted indicator
  function addAbortedMessage() {
    const el = document.createElement('div');
    el.className = 'message-block system';
    el.innerHTML = `<div class="message-body dim">⏹ Response cancelled.</div>`;
    outputEl.appendChild(el);
    scrollToBottom();
  }

  // Utility
  function formatTime() {
    return new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, c => map[c]);
  }

  return {
    addUserMessage,
    createAssistantMessage,
    showThinking,
    removeThinking,
    addThinkingBlock,
    addSystemMessage,
    addErrorMessage,
    addUsageBar,
    addToolBlock,
    addAbortedMessage,
    clear,
    scrollToBottom
  };
})();
