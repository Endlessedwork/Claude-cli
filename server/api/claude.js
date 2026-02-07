const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (!client || client._apiKey !== process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    client._apiKey = process.env.ANTHROPIC_API_KEY;
  }
  return client;
}

async function streamClaude({ messages, model, system, signal, onText, onThinking, onUsage, onError }) {
  const anthropic = getClient();

  const params = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  };

  if (system) {
    params.system = system;
  }

  // Use extended thinking for opus models
  if (model && model.includes('opus')) {
    params.thinking = {
      type: 'enabled',
      budget_tokens: 4096
    };
  }

  try {
    const stream = await anthropic.messages.stream(params, { signal });

    stream.on('text', (text) => {
      onText(text);
    });

    stream.on('message', (message) => {
      if (message.usage) {
        onUsage(message.usage);
      }

      // Handle thinking blocks
      if (message.content) {
        for (const block of message.content) {
          if (block.type === 'thinking' && onThinking) {
            onThinking(block.thinking);
          }
        }
      }
    });

    stream.on('error', (err) => {
      onError(err);
    });

    await stream.finalMessage();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }
    onError(err);
  }
}

module.exports = { streamClaude };
