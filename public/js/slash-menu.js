/* ========================================
   Slash Command Autocomplete Menu
   ======================================== */

const SlashMenu = (() => {
  // ========================================
  // Command Definitions
  // ========================================
  const COMMANDS = [
    {
      name: 'help',
      icon: '?',
      description: 'Show all available commands and shortcuts',
      shortcut: '',
      usage: '/help',
    },
    {
      name: 'clear',
      icon: '⌧',
      description: 'Clear conversation history and screen',
      shortcut: 'Ctrl+L',
      usage: '/clear',
    },
    {
      name: 'model',
      icon: '◈',
      description: 'Change or view current model',
      shortcut: '',
      usage: '/model <model-name>',
      hasArgs: true,
    },
    {
      name: 'system',
      icon: '⚙',
      description: 'Set or view the system prompt',
      shortcut: '',
      usage: '/system <prompt>',
      hasArgs: true,
    },
    {
      name: 'history',
      icon: '↻',
      description: 'Show conversation history summary',
      shortcut: '',
      usage: '/history',
    },
    {
      name: 'compact',
      icon: '⊟',
      description: 'Compact conversation to save context window',
      shortcut: '',
      usage: '/compact',
    },
    {
      name: 'cost',
      icon: '⟡',
      description: 'Show token usage and estimated cost report',
      shortcut: '',
      usage: '/cost',
    },
    {
      name: 'config',
      icon: '☰',
      description: 'Show current configuration and settings',
      shortcut: '',
      usage: '/config',
    },
  ];

  // ========================================
  // State
  // ========================================
  let isOpen = false;
  let activeIndex = 0;
  let filteredCommands = [];

  // DOM
  const menuEl = document.getElementById('slash-menu');
  const listEl = document.getElementById('slash-menu-list');

  // ========================================
  // Rendering
  // ========================================

  function renderItems(query) {
    const q = query.toLowerCase();

    // Filter commands matching query
    filteredCommands = COMMANDS.filter(cmd =>
      cmd.name.toLowerCase().startsWith(q)
    );

    // If no matches, try includes
    if (filteredCommands.length === 0) {
      filteredCommands = COMMANDS.filter(cmd =>
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q)
      );
    }

    // Reset index
    activeIndex = 0;

    if (filteredCommands.length === 0) {
      listEl.innerHTML = '<div class="slash-menu-empty">No matching commands</div>';
      return;
    }

    listEl.innerHTML = filteredCommands.map((cmd, i) => {
      const isActive = i === activeIndex ? ' active' : '';
      const nameHtml = highlightMatch(cmd.name, q);
      const shortcutHtml = cmd.shortcut
        ? `<span class="slash-menu-item-shortcut">${escapeHtml(cmd.shortcut)}</span>`
        : '';

      return `
        <div class="slash-menu-item${isActive}" data-index="${i}">
          <div class="slash-menu-item-icon">${cmd.icon}</div>
          <div class="slash-menu-item-body">
            <div class="slash-menu-item-name"><span class="slash-char">/</span>${nameHtml}</div>
            <div class="slash-menu-item-desc">${escapeHtml(cmd.description)}</div>
          </div>
          ${shortcutHtml}
        </div>
      `;
    }).join('');

    // Click handlers
    listEl.querySelectorAll('.slash-menu-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); // prevent input blur
        const idx = parseInt(el.dataset.index);
        selectCommand(idx);
      });
      el.addEventListener('mouseenter', () => {
        setActive(parseInt(el.dataset.index));
      });
    });
  }

  function highlightMatch(name, query) {
    if (!query) return escapeHtml(name);

    const lower = name.toLowerCase();
    const idx = lower.indexOf(query);
    if (idx === -1) return escapeHtml(name);

    const before = name.slice(0, idx);
    const match = name.slice(idx, idx + query.length);
    const after = name.slice(idx + query.length);
    return `${escapeHtml(before)}<span class="match-highlight">${escapeHtml(match)}</span>${escapeHtml(after)}`;
  }

  function setActive(index) {
    if (index < 0 || index >= filteredCommands.length) return;

    activeIndex = index;
    const items = listEl.querySelectorAll('.slash-menu-item');
    items.forEach((el, i) => {
      el.classList.toggle('active', i === activeIndex);
    });

    // Scroll active item into view
    const activeEl = items[activeIndex];
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  // ========================================
  // Open / Close
  // ========================================

  function open(query) {
    renderItems(query || '');
    menuEl.classList.remove('hidden');
    isOpen = true;
  }

  function close() {
    menuEl.classList.add('hidden');
    isOpen = false;
    activeIndex = 0;
    filteredCommands = [];
  }

  function update(query) {
    if (isOpen) {
      renderItems(query || '');
    }
  }

  // ========================================
  // Navigation & Selection
  // ========================================

  function moveUp() {
    if (!isOpen || filteredCommands.length === 0) return;
    const newIndex = activeIndex <= 0 ? filteredCommands.length - 1 : activeIndex - 1;
    setActive(newIndex);
  }

  function moveDown() {
    if (!isOpen || filteredCommands.length === 0) return;
    const newIndex = activeIndex >= filteredCommands.length - 1 ? 0 : activeIndex + 1;
    setActive(newIndex);
  }

  function selectCurrent() {
    if (!isOpen || filteredCommands.length === 0) return null;
    return selectCommand(activeIndex);
  }

  function selectCommand(index) {
    const cmd = filteredCommands[index];
    if (!cmd) return null;

    close();

    // Return the full command string
    if (cmd.hasArgs) {
      return { command: `/${cmd.name} `, keepOpen: true };
    }
    return { command: `/${cmd.name}`, keepOpen: false };
  }

  // ========================================
  // Utilities
  // ========================================

  function escapeHtml(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, c => map[c]);
  }

  // Close on outside click
  document.addEventListener('mousedown', (e) => {
    if (isOpen && !menuEl.contains(e.target) && e.target.id !== 'user-input') {
      close();
    }
  });

  return {
    open,
    close,
    update,
    moveUp,
    moveDown,
    selectCurrent,
    isOpen: () => isOpen,
    hasResults: () => filteredCommands.length > 0,
    COMMANDS,
  };
})();
