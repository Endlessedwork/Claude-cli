/* ========================================
   Terminal UI Component
   ======================================== */

const Terminal = (() => {
  const outputEl = document.getElementById('output');

  // Track tool blocks by toolCallId
  const toolBlocks = new Map();

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
        <span class="role">&#10095; You</span>
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
        if (fullText) {
          body.innerHTML = MarkdownRenderer.render(fullText);
        } else {
          // Remove cursor if no text
          if (cursor.parentNode) cursor.remove();
        }
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
      <span class="thinking-toggle">&#9660;</span>
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

  // ========================================
  // Tool Use Blocks (Stateful)
  // ========================================

  const TOOL_ICONS = {
    'Read': '\uD83D\uDCC4',    // file
    'Write': '\u270F\uFE0F',   // pencil
    'Edit': '\uD83D\uDD27',    // wrench
    'Bash': '\u26A1',          // lightning
    'Glob': '\uD83D\uDD0D',    // magnifier
    'Grep': '\uD83D\uDD0E',    // magnifier right
    'LS': '\uD83D\uDCC2',      // folder
    'WebFetch': '\uD83C\uDF10', // globe
  };

  /**
   * Add a tool use block when Claude requests a tool.
   * Returns a reference tracked by toolCallId.
   */
  function addToolUseBlock(toolCallId, toolName, description, input) {
    const block = document.createElement('div');
    block.className = 'tool-block';
    block.dataset.toolCallId = toolCallId;

    const icon = TOOL_ICONS[toolName] || '\u2699\uFE0F';

    const header = document.createElement('div');
    header.className = 'tool-header';
    header.innerHTML = `
      <span class="tool-icon">${icon}</span>
      <span class="tool-name">${escapeHtml(toolName)}</span>
      <span class="tool-desc">${escapeHtml(description || '')}</span>
      <span class="tool-status tool-status-pending">pending</span>
    `;

    const contentEl = document.createElement('div');
    contentEl.className = 'tool-content collapsed';

    // Show input parameters
    if (input) {
      const inputSummary = formatToolInput(toolName, input);
      contentEl.innerHTML = `<pre><code>${escapeHtml(inputSummary)}</code></pre>`;
    }

    header.addEventListener('click', () => {
      contentEl.classList.toggle('collapsed');
    });

    block.appendChild(header);
    block.appendChild(contentEl);
    outputEl.appendChild(block);
    scrollToBottom();

    // Track it
    toolBlocks.set(toolCallId, { block, header, contentEl });

    return block;
  }

  /**
   * Update tool block status (executing, done, error, denied)
   */
  function updateToolBlockStatus(toolCallId, status) {
    const entry = toolBlocks.get(toolCallId);
    if (!entry) return;

    const statusEl = entry.header.querySelector('.tool-status');
    if (!statusEl) return;

    // Remove old status classes
    statusEl.className = 'tool-status';

    switch (status) {
      case 'executing':
        statusEl.className += ' tool-status-executing';
        statusEl.textContent = 'running...';
        break;
      case 'done':
        statusEl.className += ' tool-status-done';
        statusEl.textContent = 'done';
        break;
      case 'error':
        statusEl.className += ' tool-status-error';
        statusEl.textContent = 'error';
        break;
      case 'denied':
        statusEl.className += ' tool-status-denied';
        statusEl.textContent = 'denied';
        break;
      default:
        statusEl.className += ' tool-status-pending';
        statusEl.textContent = status;
    }
  }

  /**
   * Update tool block with result content
   */
  function updateToolBlockResult(toolCallId, result, isError, toolName) {
    const entry = toolBlocks.get(toolCallId);
    if (!entry) return;

    const resultEl = document.createElement('div');
    resultEl.className = 'tool-result';

    if (isError) {
      resultEl.innerHTML = `<pre class="tool-result-error"><code>${escapeHtml(result)}</code></pre>`;
    } else if (toolName === 'Edit' && result && result.includes('\n- ') && result.includes('\n+ ')) {
      // Render diff with colors
      resultEl.innerHTML = `<pre><code>${renderDiff(result)}</code></pre>`;
    } else {
      resultEl.innerHTML = `<pre><code>${escapeHtml(result)}</code></pre>`;
    }

    entry.contentEl.appendChild(resultEl);

    // Auto-expand for errors, diffs, or short results
    if (isError || toolName === 'Edit' || (result && result.length < 500)) {
      entry.contentEl.classList.remove('collapsed');
    }

    scrollToBottom();
  }

  function renderDiff(text) {
    return text.split('\n').map(line => {
      if (line.startsWith('+ ')) {
        return `<span class="diff-add">${escapeHtml(line)}</span>`;
      } else if (line.startsWith('- ')) {
        return `<span class="diff-remove">${escapeHtml(line)}</span>`;
      } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
        return `<span class="diff-header">${escapeHtml(line)}</span>`;
      }
      return escapeHtml(line);
    }).join('\n');
  }

  // ========================================
  // Permission Request UI
  // ========================================

  function addPermissionRequest(toolCallId, toolName, input, onApprove, onDeny) {
    const block = document.createElement('div');
    block.className = 'permission-request';
    block.dataset.toolCallId = toolCallId;

    const icon = TOOL_ICONS[toolName] || '\u2699\uFE0F';
    const desc = formatToolInput(toolName, input);

    block.innerHTML = `
      <div class="permission-header">
        <span class="permission-icon">\u26A0\uFE0F</span>
        <span class="permission-title">Permission Required</span>
      </div>
      <div class="permission-body">
        <div class="permission-tool">
          <span class="tool-icon">${icon}</span>
          <span class="tool-name">${escapeHtml(toolName)}</span>
        </div>
        <pre class="permission-detail"><code>${escapeHtml(desc)}</code></pre>
      </div>
      <div class="permission-actions">
        <button class="btn-approve" title="Allow this tool execution">Allow</button>
        <button class="btn-deny" title="Deny this tool execution">Deny</button>
        <button class="btn-always" title="Always allow this tool">Always Allow</button>
      </div>
    `;

    const approveBtn = block.querySelector('.btn-approve');
    const denyBtn = block.querySelector('.btn-deny');
    const alwaysBtn = block.querySelector('.btn-always');

    approveBtn.addEventListener('click', () => {
      block.remove();
      onApprove(false);
    });

    denyBtn.addEventListener('click', () => {
      block.remove();
      onDeny();
    });

    alwaysBtn.addEventListener('click', () => {
      block.remove();
      onApprove(true); // true = always allow
    });

    outputEl.appendChild(block);
    scrollToBottom();

    return block;
  }

  // ========================================
  // System / Error / Usage Messages
  // ========================================

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

  function addErrorMessage(text) {
    const block = document.createElement('div');
    block.className = 'message-block error';
    block.innerHTML = `
      <div class="message-body">\u2717 ${escapeHtml(text)}</div>
    `;
    outputEl.appendChild(block);
    scrollToBottom();
    return block;
  }

  function addUsageBar(usage) {
    const bar = document.createElement('div');
    bar.className = 'usage-bar';
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const total = inputTokens + outputTokens;
    const cost = usage.cost || 0;

    bar.innerHTML = `
      <span><span class="label">In:</span> <span class="value">${inputTokens.toLocaleString()}</span></span>
      <span><span class="label">Out:</span> <span class="value">${outputTokens.toLocaleString()}</span></span>
      <span><span class="label">Cost:</span> <span class="value">$${cost.toFixed(4)}</span></span>
    `;
    outputEl.appendChild(bar);
    scrollToBottom();
  }

  // Clear the terminal output
  function clear() {
    outputEl.innerHTML = '';
    toolBlocks.clear();
  }

  // Add an aborted indicator
  function addAbortedMessage() {
    const el = document.createElement('div');
    el.className = 'message-block system';
    el.innerHTML = `<div class="message-body dim">\u23F9 Response cancelled.</div>`;
    outputEl.appendChild(el);
    scrollToBottom();
  }

  // ========================================
  // Utilities
  // ========================================

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

  function formatToolInput(toolName, input) {
    switch (toolName) {
      case 'Read':
        return input.file_path + (input.offset ? ` (line ${input.offset})` : '');
      case 'Write':
        return `${input.file_path}\n${(input.content || '').substring(0, 500)}${(input.content || '').length > 500 ? '\n... [truncated]' : ''}`;
      case 'Edit':
        return `${input.file_path}\n- old: ${(input.old_string || '').substring(0, 200)}\n+ new: ${(input.new_string || '').substring(0, 200)}`;
      case 'Bash':
        return input.command || '';
      case 'Glob':
        return `${input.pattern}${input.path ? ' in ' + input.path : ''}`;
      case 'Grep':
        return `"${input.pattern}"${input.path ? ' in ' + input.path : ''}${input.include ? ' (files: ' + input.include + ')' : ''}`;
      case 'LS':
        return input.path || '.';
      default:
        return JSON.stringify(input, null, 2);
    }
  }

  return {
    addUserMessage,
    createAssistantMessage,
    showThinking,
    removeThinking,
    addThinkingBlock,
    addToolUseBlock,
    updateToolBlockStatus,
    updateToolBlockResult,
    addPermissionRequest,
    addSystemMessage,
    addErrorMessage,
    addUsageBar,
    addAbortedMessage,
    clear,
    scrollToBottom
  };
})();
