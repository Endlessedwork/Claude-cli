const { streamClaude } = require('./api/claude');
const { v4: uuidv4 } = require('uuid');

function handleWebSocket(ws) {
  const sessionId = uuidv4();
  let conversationHistory = [];
  let currentModel = process.env.DEFAULT_MODEL || 'claude-sonnet-4-20250514';
  let systemPrompt = '';
  let abortController = null;

  ws.send(JSON.stringify({
    type: 'session',
    sessionId,
    model: currentModel
  }));

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'chat':
        await handleChat(msg);
        break;
      case 'command':
        handleCommand(msg);
        break;
      case 'abort':
        handleAbort();
        break;
      case 'set_api_key':
        process.env.ANTHROPIC_API_KEY = msg.apiKey;
        send({ type: 'system', text: 'API key updated.' });
        break;
      case 'set_model':
        currentModel = msg.model;
        send({ type: 'system', text: `Model changed to ${currentModel}` });
        break;
      case 'set_system':
        systemPrompt = msg.prompt;
        send({ type: 'system', text: 'System prompt updated.' });
        break;
      case 'clear':
        conversationHistory = [];
        send({ type: 'system', text: 'Conversation cleared.' });
        break;
    }
  });

  ws.on('close', () => {
    if (abortController) abortController.abort();
  });

  function send(data) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }

  function handleAbort() {
    if (abortController) {
      abortController.abort();
      abortController = null;
      send({ type: 'abort_ack' });
    }
  }

  function handleCommand(msg) {
    const cmd = msg.command.trim().toLowerCase();
    const args = msg.args || '';

    switch (cmd) {
      case '/help':
        send({
          type: 'system',
          text: [
            '**Available Commands:**',
            '',
            '| Command | Description |',
            '|---------|-------------|',
            '| `/help` | Show this help message |',
            '| `/clear` | Clear conversation history |',
            '| `/model <name>` | Change model (e.g. claude-sonnet-4-20250514) |',
            '| `/system <prompt>` | Set system prompt |',
            '| `/history` | Show conversation history summary |',
            '| `/compact` | Compact conversation to save context |',
            '| `/cost` | Show token usage and estimated cost |',
            '| `/config` | Show current configuration |',
            '',
            '**Keyboard Shortcuts:**',
            '',
            '| Shortcut | Action |',
            '|----------|--------|',
            '| `Enter` | Send message |',
            '| `Shift+Enter` | New line |',
            '| `Ctrl+C` / `Escape` | Cancel current response |',
            '| `Ctrl+L` | Clear screen |',
            '| `↑` / `↓` | Navigate command history |',
          ].join('\n')
        });
        break;

      case '/clear':
        conversationHistory = [];
        send({ type: 'clear_screen' });
        send({ type: 'system', text: 'Conversation cleared.' });
        break;

      case '/model':
        if (args) {
          currentModel = args;
          send({ type: 'system', text: `Model changed to **${currentModel}**` });
          send({ type: 'model_changed', model: currentModel });
        } else {
          send({ type: 'system', text: `Current model: **${currentModel}**` });
        }
        break;

      case '/system':
        if (args) {
          systemPrompt = args;
          send({ type: 'system', text: 'System prompt updated.' });
        } else {
          send({
            type: 'system',
            text: systemPrompt
              ? `Current system prompt:\n\n> ${systemPrompt}`
              : 'No system prompt set.'
          });
        }
        break;

      case '/history':
        const summary = conversationHistory.map((m, i) => {
          const role = m.role === 'user' ? '👤 User' : '🤖 Assistant';
          const preview = typeof m.content === 'string'
            ? m.content.substring(0, 80)
            : '[complex content]';
          return `${i + 1}. **${role}**: ${preview}${m.content?.length > 80 ? '...' : ''}`;
        }).join('\n');
        send({
          type: 'system',
          text: summary || 'No conversation history.'
        });
        break;

      case '/compact':
        if (conversationHistory.length > 4) {
          const kept = conversationHistory.slice(-4);
          conversationHistory = kept;
          send({ type: 'system', text: `Compacted conversation. Kept last ${kept.length} messages.` });
        } else {
          send({ type: 'system', text: 'Conversation already compact.' });
        }
        break;

      case '/cost':
        send({ type: 'request_cost_report' });
        break;

      case '/config':
        send({
          type: 'system',
          text: [
            '**Current Configuration:**',
            '',
            `- **Model:** ${currentModel}`,
            `- **System Prompt:** ${systemPrompt || '(none)'}`,
            `- **History Length:** ${conversationHistory.length} messages`,
            `- **API Key:** ${process.env.ANTHROPIC_API_KEY ? '••••' + process.env.ANTHROPIC_API_KEY.slice(-4) : '(not set)'}`,
          ].join('\n')
        });
        break;

      default:
        send({ type: 'system', text: `Unknown command: \`${cmd}\`. Type \`/help\` for available commands.` });
    }
  }

  async function handleChat(msg) {
    if (!process.env.ANTHROPIC_API_KEY) {
      send({
        type: 'error',
        text: 'API key not set. Use `/config` or set `ANTHROPIC_API_KEY` environment variable.'
      });
      return;
    }

    const userContent = msg.content;
    conversationHistory.push({ role: 'user', content: userContent });

    abortController = new AbortController();
    const messageId = uuidv4();

    send({ type: 'response_start', messageId });

    try {
      let fullResponse = '';
      const usage = { inputTokens: 0, outputTokens: 0 };

      await streamClaude({
        messages: conversationHistory,
        model: currentModel,
        system: systemPrompt,
        signal: abortController.signal,
        onText: (text) => {
          fullResponse += text;
          send({ type: 'response_delta', messageId, delta: text });
        },
        onThinking: (thinking) => {
          send({ type: 'thinking', messageId, content: thinking });
        },
        onUsage: (u) => {
          usage.inputTokens = u.input_tokens || 0;
          usage.outputTokens = u.output_tokens || 0;
        },
        onError: (err) => {
          send({ type: 'error', messageId, text: err.message });
        }
      });

      conversationHistory.push({ role: 'assistant', content: fullResponse });

      send({
        type: 'response_end',
        messageId,
        usage
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        send({ type: 'response_aborted', messageId });
      } else {
        send({ type: 'error', messageId, text: err.message });
      }
    } finally {
      abortController = null;
    }
  }
}

module.exports = { handleWebSocket };
