/* ========================================
   Main Application — WebSocket + Input Handling
   ======================================== */

const App = (() => {
  // State
  let ws = null;
  let isStreaming = false;
  let currentMessage = null;
  let sessionId = null;
  let commandHistory = [];
  let historyIndex = -1;
  let totalTokens = { input: 0, output: 0, cost: 0 };
  let vimEnabled = false;

  // DOM Elements
  const inputEl = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const abortBtn = document.getElementById('abort-btn');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = statusIndicator.querySelector('.status-text');
  const modelBadge = document.getElementById('model-badge');
  const tokenCount = document.getElementById('token-count');
  const workDirBadge = document.getElementById('work-dir-badge');
  const fileInput = document.getElementById('file-input');
  const apiKeyModal = document.getElementById('api-key-modal');
  let pendingFiles = []; // Files waiting to be sent with next message
  const apiKeyInput = document.getElementById('api-key-input');
  const saveApiKeyBtn = document.getElementById('save-api-key');
  const cancelApiKeyBtn = document.getElementById('cancel-api-key');

  // ========================================
  // WebSocket Connection
  // ========================================

  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);

    ws.onopen = () => {
      setStatus('idle', 'Ready');
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    };

    ws.onclose = () => {
      setStatus('error', 'Disconnected');
      // Reconnect after delay
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      setStatus('error', 'Connection Error');
    };
  }

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // ========================================
  // Server Message Handler
  // ========================================

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'session':
        sessionId = msg.sessionId;
        modelBadge.textContent = msg.model;
        if (msg.workDir) workDirBadge.textContent = msg.workDir;
        if (msg.hasClaudeMd) workDirBadge.title = 'CLAUDE.md loaded — click to change';
        checkApiKey();
        break;

      case 'response_start':
        isStreaming = true;
        Terminal.removeThinking();
        currentMessage = Terminal.createAssistantMessage();
        setStatus('streaming', 'Generating');
        showAbortBtn();
        break;

      case 'response_delta':
        if (currentMessage) {
          currentMessage.append(msg.delta);
        }
        break;

      case 'thinking':
        Terminal.removeThinking();
        Terminal.addThinkingBlock(msg.content);
        break;

      case 'response_pause':
        // Claude paused text streaming to execute tools
        if (currentMessage) {
          currentMessage.finish();
          currentMessage = null;
        }
        break;

      case 'response_continue':
        // Claude is continuing after tool execution
        setStatus('streaming', 'Generating');
        currentMessage = Terminal.createAssistantMessage();
        break;

      case 'response_end':
        if (currentMessage) {
          currentMessage.finish();
          currentMessage = null;
        }
        isStreaming = false;
        setStatus('idle', 'Ready');
        showSendBtn();
        if (msg.usage) {
          Terminal.addUsageBar(msg.usage);
          totalTokens.input += msg.usage.inputTokens || 0;
          totalTokens.output += msg.usage.outputTokens || 0;
          totalTokens.cost += msg.usage.cost || 0;
          updateTokenDisplay();
        }
        break;

      case 'response_aborted':
        if (currentMessage) {
          currentMessage.finish();
          currentMessage = null;
        }
        isStreaming = false;
        Terminal.addAbortedMessage();
        setStatus('idle', 'Ready');
        showSendBtn();
        break;

      case 'abort_ack':
        // Already handled by response_aborted
        break;

      // ========================================
      // Tool Messages
      // ========================================

      case 'tool_use':
        // Claude wants to use a tool — show it in UI
        if (currentMessage) {
          currentMessage.finish();
          currentMessage = null;
        }
        Terminal.addToolUseBlock(msg.toolCallId, msg.toolName, msg.description, msg.input);
        setStatus('streaming', `Using ${msg.toolName}`);
        break;

      case 'tool_executing':
        // Tool is being executed
        Terminal.updateToolBlockStatus(msg.toolCallId, 'executing');
        setStatus('streaming', `Running ${msg.toolName}...`);
        break;

      case 'tool_result':
        // Tool execution completed
        Terminal.updateToolBlockStatus(msg.toolCallId, msg.status);
        if (msg.result) {
          Terminal.updateToolBlockResult(msg.toolCallId, msg.result, msg.status === 'error', msg.toolName);
        }
        break;

      case 'permission_request':
        // Server is asking for permission to run a tool
        if (currentMessage) {
          currentMessage.finish();
          currentMessage = null;
        }
        Terminal.addPermissionRequest(
          msg.toolCallId,
          msg.toolName,
          msg.input,
          (alwaysAllow) => {
            send({
              type: 'permission_response',
              toolCallId: msg.toolCallId,
              toolName: msg.toolName,
              approved: true,
              alwaysAllow
            });
          },
          () => {
            send({
              type: 'permission_response',
              toolCallId: msg.toolCallId,
              toolName: msg.toolName,
              approved: false
            });
          }
        );
        setStatus('thinking', 'Awaiting Permission');
        break;

      // ========================================
      // System Messages
      // ========================================

      case 'system':
        Terminal.addSystemMessage(msg.text);
        break;

      case 'error':
        Terminal.removeThinking();
        Terminal.addErrorMessage(msg.text);
        if (isStreaming) {
          if (currentMessage) {
            currentMessage.finish();
            currentMessage = null;
          }
          isStreaming = false;
          showSendBtn();
        }
        setStatus('error', 'Error');
        setTimeout(() => {
          if (!isStreaming) setStatus('idle', 'Ready');
        }, 3000);
        break;

      case 'clear_screen':
        Terminal.clear();
        break;

      case 'model_changed':
        modelBadge.textContent = msg.model;
        break;

      case 'show_api_key_modal':
        showApiKeyModal();
        break;

      case 'work_dir_changed':
        workDirBadge.textContent = msg.workDir;
        workDirBadge.title = msg.hasClaudeMd ? 'CLAUDE.md loaded — click to change' : 'Click to change working directory';
        break;

      case 'vim_mode':
        vimEnabled = msg.enabled;
        break;

      case 'request_cost_report':
        Terminal.addSystemMessage([
          '**Token Usage Report:**',
          '',
          `- **Total Input Tokens:** ${totalTokens.input.toLocaleString()}`,
          `- **Total Output Tokens:** ${totalTokens.output.toLocaleString()}`,
          `- **Total Tokens:** ${(totalTokens.input + totalTokens.output).toLocaleString()}`,
          `- **Estimated Cost:** $${totalTokens.cost.toFixed(4)}`,
        ].join('\n'));
        break;
    }
  }

  // ========================================
  // API Key Check
  // ========================================

  async function checkApiKey() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (!data.hasApiKey) {
        showApiKeyModal();
      }
    } catch {
      // Server not reachable
    }
  }

  function showApiKeyModal() {
    apiKeyModal.classList.remove('hidden');
    apiKeyInput.focus();
  }

  function hideApiKeyModal() {
    apiKeyModal.classList.add('hidden');
  }

  saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      send({ type: 'set_api_key', apiKey: key });
      hideApiKeyModal();
    }
  });

  cancelApiKeyBtn.addEventListener('click', hideApiKeyModal);

  // Working directory selector
  workDirBadge.addEventListener('click', () => {
    const newDir = prompt('Enter working directory path:', workDirBadge.textContent);
    if (newDir && newDir.trim()) {
      send({ type: 'set_work_dir', path: newDir.trim() });
    }
  });

  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveApiKeyBtn.click();
    }
  });

  // ========================================
  // Input Handling
  // ========================================

  function handleSend() {
    const text = inputEl.value.trim();
    if (!text || isStreaming) return;

    // Check for slash commands
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/);
      const command = parts[0];
      const args = parts.slice(1).join(' ');

      // Known built-in commands — handled server-side instantly
      const builtins = [
        '/help','/clear','/compact','/config','/cost','/doctor',
        '/history','/init','/login','/logout','/mcp','/model',
        '/permissions','/status','/system','/terminal-setup','/vim','/bug'
      ];
      const isBuiltin = builtins.includes(command.toLowerCase());

      commandHistory.push(text);
      historyIndex = commandHistory.length;
      Terminal.addUserMessage(text);

      if (isBuiltin) {
        // Built-in: send as command for instant server handling
        send({ type: 'command', command, args });
      } else {
        // Unknown command: send as regular chat to Claude (like real CLI)
        Terminal.showThinking();
        setStatus('thinking', 'Thinking');
        send({ type: 'chat', content: text });
      }

      clearInput();
      return;
    }

    // Regular chat message
    commandHistory.push(text);
    historyIndex = commandHistory.length;

    // Show attached files in user message
    const fileNames = pendingFiles.map(f => `[${f.isImage ? 'Image' : 'File'}: ${f.name}]`).join(' ');
    Terminal.addUserMessage(text + (fileNames ? '\n' + fileNames : ''));
    Terminal.showThinking();
    setStatus('thinking', 'Thinking');

    // Build content with files
    const chatMsg = { type: 'chat', content: text };
    if (pendingFiles.length > 0) {
      chatMsg.files = pendingFiles.map(f => ({
        name: f.name,
        type: f.type,
        data: f.data,
        isImage: f.isImage
      }));
      pendingFiles = [];
      renderFileAttachments();
    }
    send(chatMsg);
    clearInput();
  }

  function handleAbort() {
    if (isStreaming) {
      send({ type: 'abort' });
    }
  }

  function clearInput() {
    inputEl.value = '';
    inputEl.style.height = 'auto';
    inputEl.rows = 1;
    if (SlashMenu.isOpen()) {
      SlashMenu.close();
    }
  }

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    const newHeight = Math.min(inputEl.scrollHeight, 200);
    inputEl.style.height = newHeight + 'px';

    // Slash command menu logic
    handleSlashInput();
  });

  function handleSlashInput() {
    const text = inputEl.value;

    // Check if input starts with / and is on the first line (no newlines before cursor)
    const cursorPos = inputEl.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);

    if (textBeforeCursor.startsWith('/') && !textBeforeCursor.includes('\n') && !textBeforeCursor.includes(' ')) {
      // Extract the query after /
      const query = textBeforeCursor.substring(1);
      if (SlashMenu.isOpen()) {
        SlashMenu.update(query);
      } else {
        SlashMenu.open(query);
      }
    } else {
      if (SlashMenu.isOpen()) {
        SlashMenu.close();
      }
    }
  }

  // Keyboard handling
  inputEl.addEventListener('keydown', (e) => {
    // ---- Slash menu navigation takes priority when open ----
    if (SlashMenu.isOpen()) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        SlashMenu.moveUp();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        SlashMenu.moveDown();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const result = SlashMenu.selectCurrent();
        if (result) {
          inputEl.value = result.command;
          // Move cursor to end
          inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
          // If command has args, don't send yet — let user type args
          if (!result.keepOpen) {
            handleSend();
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        SlashMenu.close();
        return;
      }
    }

    // ---- Normal keyboard handling ----

    // Enter to send (without shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    // Escape to abort
    if (e.key === 'Escape') {
      if (isStreaming) {
        handleAbort();
      }
      return;
    }

    // Command history navigation
    if (e.key === 'ArrowUp' && inputEl.value === '') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        inputEl.value = commandHistory[historyIndex];
      }
      return;
    }

    if (e.key === 'ArrowDown' && inputEl.selectionStart === inputEl.value.length) {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        inputEl.value = commandHistory[historyIndex];
      } else {
        historyIndex = commandHistory.length;
        inputEl.value = '';
      }
      return;
    }
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+C to abort
    if (e.ctrlKey && e.key === 'c' && isStreaming) {
      e.preventDefault();
      handleAbort();
      return;
    }

    // Ctrl+L to clear screen
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      send({ type: 'command', command: '/clear', args: '' });
      return;
    }

    // Focus input on any key press if not in modal
    if (!apiKeyModal.classList.contains('hidden')) return;
    if (document.activeElement !== inputEl && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key.length === 1) {
        inputEl.focus();
      }
    }
  });

  // Button handlers
  sendBtn.addEventListener('click', handleSend);
  abortBtn.addEventListener('click', handleAbort);

  // ========================================
  // UI Helpers
  // ========================================

  function setStatus(state, text) {
    statusIndicator.className = `status ${state}`;
    statusText.textContent = text;
  }

  function showAbortBtn() {
    sendBtn.classList.add('hidden');
    abortBtn.classList.remove('hidden');
  }

  function showSendBtn() {
    abortBtn.classList.add('hidden');
    sendBtn.classList.remove('hidden');
  }

  function updateTokenDisplay() {
    const total = totalTokens.input + totalTokens.output;
    if (total > 1000000) {
      tokenCount.textContent = (total / 1000000).toFixed(1) + 'M tokens';
    } else if (total > 1000) {
      tokenCount.textContent = (total / 1000).toFixed(1) + 'k tokens';
    } else {
      tokenCount.textContent = total + ' tokens';
    }
  }

  // ========================================
  // File Upload
  // ========================================

  fileInput.addEventListener('change', (e) => {
    for (const file of e.target.files) {
      addFile(file);
    }
    fileInput.value = '';
  });

  function addFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const isImage = file.type.startsWith('image/');
      pendingFiles.push({
        name: file.name,
        type: file.type,
        data: reader.result,
        isImage
      });
      renderFileAttachments();
    };
    if (file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  }

  function renderFileAttachments() {
    let container = document.querySelector('.file-attachments');
    if (!container) {
      container = document.createElement('div');
      container.className = 'file-attachments';
      const inputWrapper = document.querySelector('.input-wrapper');
      inputWrapper.parentNode.insertBefore(container, inputWrapper);
    }
    container.innerHTML = pendingFiles.map((f, i) =>
      `<span class="file-attachment">
        ${f.isImage ? '\uD83D\uDDBC' : '\uD83D\uDCC4'} ${f.name}
        <span class="remove-file" data-idx="${i}">\u00D7</span>
      </span>`
    ).join('');

    container.querySelectorAll('.remove-file').forEach(el => {
      el.addEventListener('click', () => {
        pendingFiles.splice(parseInt(el.dataset.idx), 1);
        renderFileAttachments();
      });
    });

    if (pendingFiles.length === 0 && container.parentNode) {
      container.remove();
    }
  }

  // Drag & drop support
  let dragCounter = 0;
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      const overlay = document.createElement('div');
      overlay.className = 'drop-overlay';
      overlay.id = 'drop-overlay';
      overlay.innerHTML = '<span class="drop-overlay-text">Drop files here</span>';
      document.body.appendChild(overlay);
    }
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      const overlay = document.getElementById('drop-overlay');
      if (overlay) overlay.remove();
    }
  });

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    const overlay = document.getElementById('drop-overlay');
    if (overlay) overlay.remove();

    for (const file of e.dataTransfer.files) {
      addFile(file);
    }
  });

  // ========================================
  // Initialize
  // ========================================

  function init() {
    connect();
    inputEl.focus();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { handleSend, handleAbort };
})();
