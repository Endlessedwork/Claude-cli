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
  let totalTokens = { input: 0, output: 0 };

  // DOM Elements
  const inputEl = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const abortBtn = document.getElementById('abort-btn');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = statusIndicator.querySelector('.status-text');
  const modelBadge = document.getElementById('model-badge');
  const tokenCount = document.getElementById('token-count');
  const apiKeyModal = document.getElementById('api-key-modal');
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

      case 'system':
        Terminal.addSystemMessage(msg.text);
        break;

      case 'error':
        Terminal.addErrorMessage(msg.text);
        if (isStreaming) {
          isStreaming = false;
          currentMessage = null;
          setStatus('error', 'Error');
          showSendBtn();
          setTimeout(() => setStatus('idle', 'Ready'), 3000);
        }
        break;

      case 'clear_screen':
        Terminal.clear();
        break;

      case 'model_changed':
        modelBadge.textContent = msg.model;
        break;

      case 'request_cost_report':
        Terminal.addSystemMessage([
          '**Token Usage Report:**',
          '',
          `- **Total Input Tokens:** ${totalTokens.input.toLocaleString()}`,
          `- **Total Output Tokens:** ${totalTokens.output.toLocaleString()}`,
          `- **Total Tokens:** ${(totalTokens.input + totalTokens.output).toLocaleString()}`,
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

    // Check for commands
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/);
      const command = parts[0];
      const args = parts.slice(1).join(' ');

      commandHistory.push(text);
      historyIndex = commandHistory.length;

      Terminal.addUserMessage(text);
      send({ type: 'command', command, args });
      clearInput();
      return;
    }

    // Regular chat message
    commandHistory.push(text);
    historyIndex = commandHistory.length;

    Terminal.addUserMessage(text);
    Terminal.showThinking();
    setStatus('thinking', 'Thinking');

    send({ type: 'chat', content: text });
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
  }

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    const newHeight = Math.min(inputEl.scrollHeight, 200);
    inputEl.style.height = newHeight + 'px';
  });

  // Keyboard handling
  inputEl.addEventListener('keydown', (e) => {
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
