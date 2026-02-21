const fs = require('fs');
const path = require('path');
const { streamClaude } = require('./api/claude');
const { tools } = require('./tools/definitions');
const { executeTool } = require('./tools/executor');
const { v4: uuidv4 } = require('uuid');

// Model pricing per 1M tokens (USD)
const MODEL_PRICING = {
  'claude-opus-4-6':            { input: 15, output: 75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-sonnet-4-20250514':   { input: 3, output: 15 },
  'claude-haiku-4-5-20251001':  { input: 0.80, output: 4 },
};

function handleWebSocket(ws) {
  const sessionId = uuidv4();
  const sessionStart = Date.now();
  let conversationHistory = [];
  let currentModel = process.env.DEFAULT_MODEL || 'claude-sonnet-4-20250514';
  let systemPrompt = '';
  let abortController = null;
  let vimMode = false;
  let mcpServers = [];
  let workDir = process.env.WORK_DIR || process.cwd();
  let permissions = {
    autoApprove: ['Read', 'Glob', 'Grep', 'LS', 'WebFetch'],
    requireApproval: ['Write', 'Edit', 'Bash'],
  };

  // Pending permission requests (tool_call_id -> resolve callback)
  let pendingPermissions = new Map();

  // Load CLAUDE.md if it exists in working directory
  let claudeMdContent = '';
  function loadClaudeMd() {
    claudeMdContent = '';
    const candidates = [
      path.join(workDir, 'CLAUDE.md'),
      path.join(workDir, '.claude', 'CLAUDE.md'),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          claudeMdContent = fs.readFileSync(p, 'utf-8').trim();
          break;
        }
      } catch {}
    }
  }
  loadClaudeMd();

  ws.send(JSON.stringify({
    type: 'session',
    sessionId,
    model: currentModel,
    workDir,
    hasClaudeMd: !!claudeMdContent
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
        await handleCommand(msg);
        break;
      case 'abort':
        handleAbort();
        break;
      case 'permission_response':
        handlePermissionResponse(msg);
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
      case 'set_work_dir':
        if (msg.path && fs.existsSync(msg.path)) {
          workDir = msg.path;
          loadClaudeMd();
          send({ type: 'system', text: `Working directory changed to **${workDir}**${claudeMdContent ? ' (CLAUDE.md loaded)' : ''}` });
          send({ type: 'work_dir_changed', workDir, hasClaudeMd: !!claudeMdContent });
        } else {
          send({ type: 'error', text: `Directory not found: ${msg.path}` });
        }
        break;
    }
  });

  ws.on('close', () => {
    if (abortController) abortController.abort();
    // Reject all pending permissions
    for (const [id, resolver] of pendingPermissions) {
      resolver.reject('disconnected');
    }
    pendingPermissions.clear();
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

  function handlePermissionResponse(msg) {
    const resolver = pendingPermissions.get(msg.toolCallId);
    if (resolver) {
      pendingPermissions.delete(msg.toolCallId);
      if (msg.approved) {
        // If user chose "Always Allow", add to autoApprove
        if (msg.alwaysAllow && msg.toolName) {
          permissions.requireApproval = permissions.requireApproval.filter(t => t !== msg.toolName);
          if (!permissions.autoApprove.includes(msg.toolName)) {
            permissions.autoApprove.push(msg.toolName);
          }
          send({ type: 'system', text: `**${msg.toolName}** is now auto-approved for this session.` });
        }
        resolver.resolve(true);
      } else {
        resolver.resolve(false);
      }
    }
  }

  // ========================================
  // Permission Check
  // ========================================

  async function checkPermission(toolName, toolCallId, input) {
    // Auto-approve if in autoApprove list
    if (permissions.autoApprove.includes(toolName)) {
      return true;
    }

    // Ask user for permission via WebSocket
    return new Promise((resolve, reject) => {
      pendingPermissions.set(toolCallId, { resolve, reject });
      send({
        type: 'permission_request',
        toolCallId,
        toolName,
        input
      });
    });
  }

  // ========================================
  // Command Router
  // ========================================

  async function handleCommand(msg) {
    const cmd = msg.command.trim().toLowerCase();
    const args = msg.args || '';

    switch (cmd) {
      case '/help':      cmdHelp(); break;
      case '/clear':     cmdClear(); break;
      case '/model':     cmdModel(args); break;
      case '/system':    cmdSystem(args); break;
      case '/history':   cmdHistory(); break;
      case '/compact':   cmdCompact(); break;
      case '/cost':      cmdCost(); break;
      case '/config':    cmdConfig(); break;
      case '/bug':       cmdBug(args); break;
      case '/doctor':    cmdDoctor(); break;
      case '/init':      cmdInit(); break;
      case '/login':     cmdLogin(); break;
      case '/logout':    cmdLogout(); break;
      case '/mcp':       cmdMcp(args); break;
      case '/permissions': cmdPermissions(args); break;
      case '/review':    cmdReview(args); break;
      case '/status':    cmdStatus(); break;
      case '/terminal-setup': cmdTerminalSetup(); break;
      case '/vim':       cmdVim(); break;
      default:
        // Unknown command → passthrough to Claude as chat
        await handleChat({
          content: `${msg.command}${args ? ' ' + args : ''}`
        });
        break;
    }
  }

  // ========================================
  // Command Implementations
  // ========================================

  function cmdHelp() {
    send({
      type: 'system',
      text: [
        '**Available Commands:**',
        '',
        '| Command | Description |',
        '|---------|-------------|',
        '| `/bug <desc>` | Report a bug or send feedback |',
        '| `/clear` | Clear conversation history and screen |',
        '| `/compact` | Compact conversation to save context |',
        '| `/config` | View or modify configuration |',
        '| `/cost` | Show token usage and estimated cost |',
        '| `/doctor` | Check health of API and environment |',
        '| `/help` | Show this help message |',
        '| `/history` | Show conversation history summary |',
        '| `/init` | Generate a CLAUDE.md template |',
        '| `/login` | Set or switch API key |',
        '| `/logout` | Clear API key and sign out |',
        '| `/mcp [add\\|remove\\|list]` | Manage MCP servers |',
        '| `/model <name>` | Switch or view current model |',
        '| `/permissions [tool] [allow\\|deny]` | Manage tool permissions |',
        '| `/review <pr>` | Review a PR by number or URL |',
        '| `/status` | Show session and connection status |',
        '| `/system <prompt>` | Set or view system prompt |',
        '| `/terminal-setup` | Show terminal integration info |',
        '| `/vim` | Toggle vim mode |',
        '',
        '*Unrecognized commands are sent to Claude as a message.*',
        '',
        '**Available Tools:**',
        '',
        '| Tool | Permission |',
        '|------|-----------|',
        '| Read | Auto-approved |',
        '| Write | Requires approval |',
        '| Edit | Requires approval |',
        '| Bash | Requires approval |',
        '| Glob | Auto-approved |',
        '| Grep | Auto-approved |',
        '| LS | Auto-approved |',
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
  }

  function cmdClear() {
    conversationHistory = [];
    send({ type: 'clear_screen' });
    send({ type: 'system', text: 'Conversation cleared.' });
  }

  function cmdModel(args) {
    if (args) {
      currentModel = args;
      send({ type: 'system', text: `Model changed to **${currentModel}**` });
      send({ type: 'model_changed', model: currentModel });
    } else {
      send({
        type: 'system',
        text: [
          `Current model: **${currentModel}**`,
          '',
          '**Available models:**',
          '| Model | ID |',
          '|-------|----|',
          '| Opus 4.6 | `claude-opus-4-6` |',
          '| Sonnet 4.5 | `claude-sonnet-4-5-20250929` |',
          '| Haiku 4.5 | `claude-haiku-4-5-20251001` |',
          '',
          'Usage: `/model <model-id>`',
        ].join('\n')
      });
    }
  }

  function cmdSystem(args) {
    if (args) {
      systemPrompt = args;
      send({ type: 'system', text: 'System prompt updated.' });
    } else {
      send({
        type: 'system',
        text: systemPrompt
          ? `Current system prompt:\n\n> ${systemPrompt}`
          : 'No system prompt set. Usage: `/system <prompt>`'
      });
    }
  }

  function cmdHistory() {
    if (conversationHistory.length === 0) {
      send({ type: 'system', text: 'No conversation history.' });
      return;
    }
    const summary = conversationHistory.map((m, i) => {
      const role = m.role === 'user' ? 'You' : 'Claude';
      const content = m.content;
      let preview = '';
      if (typeof content === 'string') {
        preview = content.substring(0, 80);
      } else if (Array.isArray(content)) {
        const textBlock = content.find(b => b.type === 'text');
        preview = textBlock ? textBlock.text.substring(0, 80) : '[tool content]';
      } else {
        preview = '[complex content]';
      }
      return `${i + 1}. **${role}**: ${preview}${preview.length >= 80 ? '...' : ''}`;
    }).join('\n');
    send({ type: 'system', text: summary });
  }

  function cmdCompact() {
    if (conversationHistory.length > 4) {
      const kept = conversationHistory.slice(-4);
      conversationHistory = kept;
      send({ type: 'system', text: `Compacted conversation. Kept last ${kept.length} messages.` });
    } else {
      send({ type: 'system', text: 'Conversation already compact.' });
    }
  }

  function cmdCost() {
    send({ type: 'request_cost_report' });
  }

  function cmdConfig() {
    send({
      type: 'system',
      text: [
        '**Current Configuration:**',
        '',
        `- **Model:** ${currentModel}`,
        `- **System Prompt:** ${systemPrompt || '(none)'}`,
        `- **History Length:** ${conversationHistory.length} messages`,
        `- **Vim Mode:** ${vimMode ? 'ON' : 'OFF'}`,
        `- **MCP Servers:** ${mcpServers.length > 0 ? mcpServers.map(s => s.name).join(', ') : '(none)'}`,
        `- **API Key:** ${process.env.ANTHROPIC_API_KEY ? '••••' + process.env.ANTHROPIC_API_KEY.slice(-4) : '(not set)'}`,
        `- **Auto-approve tools:** ${permissions.autoApprove.join(', ')}`,
        `- **Require approval tools:** ${permissions.requireApproval.join(', ')}`,
      ].join('\n')
    });
  }

  function cmdBug(args) {
    if (args) {
      send({
        type: 'system',
        text: [
          '**Bug report noted.** Thank you for your feedback!',
          '',
          `> ${args}`,
          '',
          'For official Claude Code bugs, report at:',
          'https://github.com/anthropics/claude-code/issues',
        ].join('\n')
      });
    } else {
      send({
        type: 'system',
        text: [
          'Usage: `/bug <description>`',
          '',
          'Or report directly at:',
          'https://github.com/anthropics/claude-code/issues',
        ].join('\n')
      });
    }
  }

  function cmdDoctor() {
    const checks = [];
    const ok = (msg) => checks.push(`  ✓ ${msg}`);
    const fail = (msg) => checks.push(`  ✗ ${msg}`);

    if (process.env.ANTHROPIC_API_KEY) {
      ok(`API Key configured (••••${process.env.ANTHROPIC_API_KEY.slice(-4)})`);
    } else {
      fail('API Key not set — use `/login` to configure');
    }

    if (ws.readyState === 1) {
      ok('WebSocket connected');
    } else {
      fail('WebSocket disconnected');
    }

    ok(`Model: ${currentModel}`);
    ok(`Node.js ${process.version}`);

    const mem = process.memoryUsage();
    const mbUsed = Math.round(mem.heapUsed / 1024 / 1024);
    ok(`Memory usage: ${mbUsed}MB`);

    const uptime = Math.round((Date.now() - sessionStart) / 1000);
    ok(`Session uptime: ${formatUptime(uptime)}`);
    ok(`Conversation: ${conversationHistory.length} messages`);
    ok(`Tools: ${tools.length} available (${permissions.autoApprove.length} auto-approved)`);

    const allPassed = !checks.some(c => c.includes('✗'));
    send({
      type: 'system',
      text: [
        `**Doctor — Health Check ${allPassed ? '✓ All Passed' : '⚠ Issues Found'}**`,
        '',
        ...checks,
      ].join('\n')
    });
  }

  function cmdInit() {
    const template = [
      '# CLAUDE.md',
      '',
      'This file provides guidance to Claude Code when working with this project.',
      '',
      '## Project Overview',
      '<!-- Describe what this project does -->',
      '',
      '## Tech Stack',
      '<!-- List frameworks, languages, key dependencies -->',
      '',
      '## Build & Run',
      '```bash',
      '# Install dependencies',
      'npm install',
      '',
      '# Start development server',
      'npm run dev',
      '',
      '# Run tests',
      'npm test',
      '```',
      '',
      '## Code Conventions',
      '<!-- Style guide, naming conventions, file structure -->',
      '',
      '## Important Notes',
      '<!-- Anything Claude should know about this project -->',
    ].join('\n');

    send({
      type: 'system',
      text: [
        '**Generated CLAUDE.md template:**',
        '',
        '```markdown',
        template,
        '```',
        '',
        'Copy this into a `CLAUDE.md` file in your project root.',
      ].join('\n')
    });
  }

  function cmdLogin() {
    send({ type: 'show_api_key_modal' });
  }

  function cmdLogout() {
    process.env.ANTHROPIC_API_KEY = '';
    send({ type: 'system', text: 'API key cleared. You are now signed out. Use `/login` to set a new key.' });
  }

  function cmdMcp(args) {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0] || '';

    switch (sub) {
      case 'add': {
        const name = parts[1];
        const url = parts[2];
        if (!name || !url) {
          send({ type: 'system', text: 'Usage: `/mcp add <name> <url>`' });
          return;
        }
        mcpServers.push({ name, url });
        send({ type: 'system', text: `MCP server **${name}** added (${url})` });
        break;
      }
      case 'remove': {
        const name = parts[1];
        if (!name) {
          send({ type: 'system', text: 'Usage: `/mcp remove <name>`' });
          return;
        }
        const before = mcpServers.length;
        mcpServers = mcpServers.filter(s => s.name !== name);
        if (mcpServers.length < before) {
          send({ type: 'system', text: `MCP server **${name}** removed.` });
        } else {
          send({ type: 'system', text: `MCP server **${name}** not found.` });
        }
        break;
      }
      case 'list':
      default:
        if (mcpServers.length === 0) {
          send({
            type: 'system',
            text: [
              'No MCP servers configured.',
              '',
              'Usage:',
              '- `/mcp list` — List servers',
              '- `/mcp add <name> <url>` — Add server',
              '- `/mcp remove <name>` — Remove server',
            ].join('\n')
          });
        } else {
          const list = mcpServers.map((s, i) =>
            `${i + 1}. **${s.name}** — \`${s.url}\``
          ).join('\n');
          send({
            type: 'system',
            text: [
              '**MCP Servers:**',
              '',
              list,
            ].join('\n')
          });
        }
        break;
    }
  }

  function cmdPermissions(args) {
    const parts = args.trim().split(/\s+/);
    const tool = parts[0] || '';
    const action = parts[1] || '';

    if (!tool) {
      send({
        type: 'system',
        text: [
          '**Tool Permissions:**',
          '',
          '**Auto-approved:**',
          permissions.autoApprove.map(t => `  ✓ ${t}`).join('\n'),
          '',
          '**Require approval:**',
          permissions.requireApproval.map(t => `  ⚠ ${t}`).join('\n'),
          '',
          'Usage: `/permissions <tool> allow|deny`',
        ].join('\n')
      });
      return;
    }

    if (action === 'allow') {
      permissions.requireApproval = permissions.requireApproval.filter(t => t !== tool);
      if (!permissions.autoApprove.includes(tool)) {
        permissions.autoApprove.push(tool);
      }
      send({ type: 'system', text: `**${tool}** is now auto-approved.` });
    } else if (action === 'deny') {
      permissions.autoApprove = permissions.autoApprove.filter(t => t !== tool);
      if (!permissions.requireApproval.includes(tool)) {
        permissions.requireApproval.push(tool);
      }
      send({ type: 'system', text: `**${tool}** now requires approval.` });
    } else {
      const inAuto = permissions.autoApprove.includes(tool);
      const inReq = permissions.requireApproval.includes(tool);
      if (inAuto) {
        send({ type: 'system', text: `**${tool}**: auto-approved` });
      } else if (inReq) {
        send({ type: 'system', text: `**${tool}**: requires approval` });
      } else {
        send({ type: 'system', text: `**${tool}**: not configured. Use \`/permissions ${tool} allow|deny\`` });
      }
    }
  }

  function cmdReview(args) {
    if (!args) {
      send({ type: 'system', text: 'Usage: `/review <pr-number-or-url>`' });
      return;
    }
    handleChat({
      content: `Please review this pull request: ${args}\n\nProvide a thorough code review covering: code quality, potential bugs, security issues, performance concerns, and suggestions for improvement.`
    });
  }

  function cmdStatus() {
    const uptime = Math.round((Date.now() - sessionStart) / 1000);
    send({
      type: 'system',
      text: [
        '**Session Status:**',
        '',
        `- **Session ID:** \`${sessionId.substring(0, 8)}...\``,
        `- **Uptime:** ${formatUptime(uptime)}`,
        `- **Model:** ${currentModel}`,
        `- **Messages:** ${conversationHistory.length}`,
        `- **WebSocket:** ${ws.readyState === 1 ? 'Connected ✓' : 'Disconnected ✗'}`,
        `- **Vim Mode:** ${vimMode ? 'ON' : 'OFF'}`,
        `- **MCP Servers:** ${mcpServers.length}`,
        `- **API Key:** ${process.env.ANTHROPIC_API_KEY ? 'Set ✓' : 'Not set ✗'}`,
        `- **Tools:** ${tools.length} available`,
      ].join('\n')
    });
  }

  function cmdTerminalSetup() {
    send({
      type: 'system',
      text: [
        '**Terminal Integration (Web)**',
        '',
        'This is the web version of Claude CLI. Terminal-specific setup is not required.',
        '',
        '**Keyboard bindings are built-in:**',
        '- `Enter` — Send message',
        '- `Shift+Enter` — New line',
        '- `Escape` / `Ctrl+C` — Cancel response',
        '- `Ctrl+L` — Clear screen',
        '- `↑` / `↓` — Command history',
        '',
        '**For the native CLI terminal setup:**',
        '```bash',
        'claude /terminal-setup',
        '```',
      ].join('\n')
    });
  }

  function cmdVim() {
    vimMode = !vimMode;
    send({ type: 'vim_mode', enabled: vimMode });
    send({
      type: 'system',
      text: vimMode
        ? '**Vim mode ON** — `Escape` to enter normal mode, `i` to insert, `j/k` to scroll'
        : '**Vim mode OFF** — Standard input mode restored'
    });
  }

  // ========================================
  // Utility
  // ========================================

  function formatUptime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  /**
   * Generate a short description for tool display
   */
  function toolDescription(name, input) {
    switch (name) {
      case 'Read':
        return input.file_path || '';
      case 'Write':
        return input.file_path || '';
      case 'Edit':
        return input.file_path || '';
      case 'Bash':
        return (input.command || '').substring(0, 100);
      case 'Glob':
        return input.pattern || '';
      case 'Grep':
        return `"${input.pattern || ''}"` + (input.path ? ` in ${input.path}` : '');
      case 'LS':
        return input.path || '.';
      case 'WebFetch':
        return input.url || '';
      default:
        return '';
    }
  }

  // ========================================
  // Chat Handler with Tool Loop
  // ========================================

  async function handleChat(msg) {
    if (!process.env.ANTHROPIC_API_KEY) {
      send({
        type: 'error',
        text: 'API key not set. Use `/login` or set `ANTHROPIC_API_KEY` environment variable.'
      });
      return;
    }

    // Build user content — may include files
    let userContent;
    if (msg.files && msg.files.length > 0) {
      // Multimodal content: text + images/files
      const contentBlocks = [];
      // Add text block
      if (msg.content) {
        contentBlocks.push({ type: 'text', text: msg.content });
      }
      // Add files
      for (const file of msg.files) {
        if (file.isImage && file.data.startsWith('data:')) {
          // Extract base64 from data URL
          const match = file.data.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: match[1],
                data: match[2]
              }
            });
          }
        } else {
          // Text file — append as text block
          contentBlocks.push({
            type: 'text',
            text: `[File: ${file.name}]\n${file.data}`
          });
        }
      }
      userContent = contentBlocks;
    } else {
      userContent = msg.content;
    }
    conversationHistory.push({ role: 'user', content: userContent });

    abortController = new AbortController();
    const messageId = uuidv4();

    // Build system prompt with tool context + CLAUDE.md
    const fullSystemPrompt = [
      'You are Claude, an AI assistant with access to tools for file system operations, bash commands, and code search. Use these tools to help the user with their requests. When you need to read files, write code, run commands, or search for information, use the appropriate tool.',
      `Current working directory: ${workDir}`,
      claudeMdContent ? `# Project Context (from CLAUDE.md)\n${claudeMdContent}` : '',
      systemPrompt || '',
    ].filter(Boolean).join('\n\n');

    let isFirstResponse = true;
    let totalUsage = { inputTokens: 0, outputTokens: 0 };
    let hasError = false;

    try {
      // Tool loop — keep going until Claude stops using tools
      let loopCount = 0;
      const MAX_LOOPS = 25; // Safety limit

      while (loopCount < MAX_LOOPS) {
        loopCount++;
        let fullResponseText = '';
        let toolUseBlocks = [];

        if (isFirstResponse) {
          send({ type: 'response_start', messageId });
          isFirstResponse = false;
        }

        const finalMessage = await streamClaude({
          messages: conversationHistory,
          model: currentModel,
          system: fullSystemPrompt,
          tools: tools,
          signal: abortController.signal,
          onText: (text) => {
            fullResponseText += text;
            send({ type: 'response_delta', messageId, delta: text });
          },
          onThinking: (thinking) => {
            send({ type: 'thinking', messageId, content: thinking });
          },
          onToolUse: (block) => {
            toolUseBlocks.push(block);
            // Notify frontend about tool use
            send({
              type: 'tool_use',
              messageId,
              toolCallId: block.id,
              toolName: block.name,
              description: toolDescription(block.name, block.input),
              input: block.input
            });
          },
          onUsage: (u) => {
            totalUsage.inputTokens += u.input_tokens || 0;
            totalUsage.outputTokens += u.output_tokens || 0;
          },
          onError: (err) => {
            hasError = true;
            send({ type: 'error', messageId, text: err.message });
          }
        });

        if (hasError || !finalMessage) break;

        // Save the assistant response to history (full content blocks)
        conversationHistory.push({
          role: 'assistant',
          content: finalMessage.content
        });

        // Check if Claude wants to use tools
        if (finalMessage.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
          // Finish text part of the response before tool execution
          send({ type: 'response_pause', messageId });

          // Execute each tool
          const toolResults = [];

          for (const toolBlock of toolUseBlocks) {
            // Check permission
            const approved = await checkPermission(toolBlock.name, toolBlock.id, toolBlock.input);

            if (!approved) {
              // User denied
              send({
                type: 'tool_result',
                messageId,
                toolCallId: toolBlock.id,
                toolName: toolBlock.name,
                status: 'denied'
              });

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: 'Tool execution denied by user.',
                is_error: true
              });
              continue;
            }

            // Execute tool
            send({
              type: 'tool_executing',
              messageId,
              toolCallId: toolBlock.id,
              toolName: toolBlock.name
            });

            const result = await executeTool(toolBlock.name, toolBlock.input);

            // Send result to frontend
            send({
              type: 'tool_result',
              messageId,
              toolCallId: toolBlock.id,
              toolName: toolBlock.name,
              result: result.content.substring(0, 2000), // Truncate for display
              status: result.isError ? 'error' : 'done'
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: result.content,
              is_error: result.isError
            });
          }

          // Add tool results to conversation history
          conversationHistory.push({
            role: 'user',
            content: toolResults
          });

          // Continue the loop — Claude will process tool results
          // Signal to frontend that Claude is continuing after tools
          send({ type: 'response_continue', messageId });
          continue;
        }

        // stop_reason === 'end_turn' or other — Claude is done
        break;
      }

      // Finalize
      // Calculate cost
      const pricing = MODEL_PRICING[currentModel] || { input: 3, output: 15 };
      const cost = (totalUsage.inputTokens / 1_000_000 * pricing.input)
                 + (totalUsage.outputTokens / 1_000_000 * pricing.output);

      send({
        type: 'response_end',
        messageId,
        usage: { ...totalUsage, cost }
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
