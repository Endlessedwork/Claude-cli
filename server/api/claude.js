const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (!client || client._apiKey !== process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    client._apiKey = process.env.ANTHROPIC_API_KEY;
  }
  return client;
}

/**
 * Stream a Claude response with tool support.
 *
 * Callbacks:
 *   onText(text)          — streaming text delta
 *   onThinking(text)      — thinking block content
 *   onToolUse(block)      — {id, name, input} when Claude requests a tool
 *   onUsage(usage)        — usage stats from final message
 *   onError(err)          — error during streaming
 *
 * Returns: finalMessage object (for tool loop control)
 */
async function streamClaude({ messages, model, system, tools, signal, onText, onThinking, onToolUse, onUsage, onError }) {
  const anthropic = getClient();

  const params = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: messages
  };

  if (system) {
    params.system = system;
  }

  // Add tools if provided
  if (tools && tools.length > 0) {
    params.tools = tools;
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

    stream.on('error', (err) => {
      onError(err);
    });

    const finalMessage = await stream.finalMessage();

    // Extract tool_use and thinking blocks from finalMessage.content
    // This is more reliable than stream events (contentBlock may not fire for tool_use)
    if (finalMessage && finalMessage.content) {
      for (const block of finalMessage.content) {
        if (block.type === 'tool_use' && onToolUse) {
          onToolUse({
            id: block.id,
            name: block.name,
            input: block.input
          });
        }
        if (block.type === 'thinking' && onThinking) {
          onThinking(block.thinking);
        }
      }
    }

    if (finalMessage && finalMessage.usage && onUsage) {
      onUsage(finalMessage.usage);
    }

    return finalMessage;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }
    onError(err);
    return null;
  }
}

module.exports = { streamClaude };
