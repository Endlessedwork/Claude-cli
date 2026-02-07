/* ========================================
   Tool Executor — Server-Side Tool Execution
   ======================================== */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Base directory for safety (can be overridden via env)
const BASE_DIR = process.env.WORK_DIR || process.cwd();

/**
 * Execute a tool and return the result
 * @param {string} name - Tool name
 * @param {object} input - Tool input parameters
 * @returns {Promise<{content: string, isError: boolean}>}
 */
async function executeTool(name, input) {
  try {
    switch (name) {
      case 'Read':
        return await toolRead(input);
      case 'Write':
        return await toolWrite(input);
      case 'Edit':
        return await toolEdit(input);
      case 'Bash':
        return await toolBash(input);
      case 'Glob':
        return await toolGlob(input);
      case 'Grep':
        return await toolGrep(input);
      case 'LS':
        return await toolLS(input);
      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    return { content: `Error executing ${name}: ${err.message}`, isError: true };
  }
}

// ========================================
// Tool: Read
// ========================================
async function toolRead({ file_path, offset, limit }) {
  if (!file_path) {
    return { content: 'Error: file_path is required', isError: true };
  }

  if (!fs.existsSync(file_path)) {
    return { content: `Error: File not found: ${file_path}`, isError: true };
  }

  const stat = fs.statSync(file_path);
  if (stat.isDirectory()) {
    return { content: `Error: ${file_path} is a directory, not a file. Use LS tool instead.`, isError: true };
  }

  const content = fs.readFileSync(file_path, 'utf-8');
  const lines = content.split('\n');

  const startLine = (offset && offset > 0) ? offset - 1 : 0;
  const endLine = limit ? Math.min(startLine + limit, lines.length) : lines.length;
  const selectedLines = lines.slice(startLine, endLine);

  // Format with line numbers (like cat -n)
  const numbered = selectedLines.map((line, i) => {
    const lineNum = startLine + i + 1;
    return `${String(lineNum).padStart(6)}\t${line}`;
  }).join('\n');

  const totalInfo = limit || offset
    ? ` (showing lines ${startLine + 1}-${endLine} of ${lines.length})`
    : '';

  return { content: numbered + totalInfo, isError: false };
}

// ========================================
// Tool: Write
// ========================================
async function toolWrite({ file_path, content }) {
  if (!file_path) {
    return { content: 'Error: file_path is required', isError: true };
  }
  if (content === undefined || content === null) {
    return { content: 'Error: content is required', isError: true };
  }

  // Create directory if it doesn't exist
  const dir = path.dirname(file_path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(file_path, content, 'utf-8');

  const lines = content.split('\n').length;
  return { content: `Successfully wrote ${lines} lines to ${file_path}`, isError: false };
}

// ========================================
// Tool: Edit
// ========================================
async function toolEdit({ file_path, old_string, new_string, replace_all }) {
  if (!file_path) {
    return { content: 'Error: file_path is required', isError: true };
  }
  if (!fs.existsSync(file_path)) {
    return { content: `Error: File not found: ${file_path}`, isError: true };
  }

  let content = fs.readFileSync(file_path, 'utf-8');

  if (!content.includes(old_string)) {
    return { content: `Error: old_string not found in ${file_path}. Make sure the string matches exactly (including whitespace).`, isError: true };
  }

  if (!replace_all) {
    // Check uniqueness
    const count = content.split(old_string).length - 1;
    if (count > 1) {
      return { content: `Error: old_string found ${count} times in ${file_path}. Provide more context to make it unique, or set replace_all to true.`, isError: true };
    }
  }

  if (replace_all) {
    content = content.split(old_string).join(new_string);
  } else {
    const idx = content.indexOf(old_string);
    content = content.substring(0, idx) + new_string + content.substring(idx + old_string.length);
  }

  fs.writeFileSync(file_path, content, 'utf-8');
  return { content: `Successfully edited ${file_path}`, isError: false };
}

// ========================================
// Tool: Bash
// ========================================
async function toolBash({ command, timeout }) {
  if (!command) {
    return { content: 'Error: command is required', isError: true };
  }

  const timeoutMs = Math.min(timeout || 120000, 600000);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const child = spawn('bash', ['-c', command], {
      cwd: BASE_DIR,
      timeout: timeoutMs,
      env: { ...process.env, TERM: 'dumb' },
      maxBuffer: 1024 * 1024 * 10, // 10MB
    });

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      // Truncate if too large
      if (stdout.length > 100000) {
        stdout = stdout.substring(0, 100000) + '\n... [output truncated]';
        child.kill();
        killed = true;
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > 50000) {
        stderr = stderr.substring(0, 50000) + '\n... [stderr truncated]';
      }
    });

    child.on('error', (err) => {
      resolve({ content: `Error: ${err.message}`, isError: true });
    });

    child.on('close', (code) => {
      let result = '';
      if (stdout) result += stdout;
      if (stderr) result += (result ? '\n' : '') + `STDERR: ${stderr}`;
      if (code !== 0 && !killed) {
        result += (result ? '\n' : '') + `Exit code: ${code}`;
      }
      if (killed) {
        result += '\n[Output was truncated due to size]';
      }
      resolve({
        content: result || '(no output)',
        isError: code !== 0
      });
    });

    // Handle timeout
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 5000);
      }
    }, timeoutMs);
  });
}

// ========================================
// Tool: Glob
// ========================================
async function toolGlob({ pattern, path: searchPath }) {
  if (!pattern) {
    return { content: 'Error: pattern is required', isError: true };
  }

  const dir = searchPath || BASE_DIR;

  try {
    // Use find + shell glob or node glob
    // Simple approach: use bash with shopt globstar
    const cmd = `cd "${dir}" && shopt -s globstar nullglob 2>/dev/null; ls -d ${pattern} 2>/dev/null | head -200`;
    const result = execSync(`bash -c '${cmd}'`, {
      timeout: 30000,
      encoding: 'utf-8',
      cwd: dir
    }).trim();

    if (!result) {
      return { content: `No files matched pattern: ${pattern}`, isError: false };
    }

    const files = result.split('\n');
    return { content: `Found ${files.length} files:\n${result}`, isError: false };
  } catch (err) {
    // Try alternative with find
    try {
      const findPattern = pattern
        .replace(/\*\*/g, '')
        .replace(/\*/g, '*');

      const ext = path.extname(pattern).replace('.', '');
      let findCmd;
      if (ext) {
        findCmd = `find "${dir}" -name "*.${ext}" -type f 2>/dev/null | head -200`;
      } else {
        findCmd = `find "${dir}" -name "${path.basename(pattern)}" -type f 2>/dev/null | head -200`;
      }

      const result = execSync(findCmd, {
        timeout: 30000,
        encoding: 'utf-8'
      }).trim();

      if (!result) {
        return { content: `No files matched pattern: ${pattern}`, isError: false };
      }

      const files = result.split('\n');
      return { content: `Found ${files.length} files:\n${result}`, isError: false };
    } catch {
      return { content: `Error searching for pattern: ${pattern}`, isError: true };
    }
  }
}

// ========================================
// Tool: Grep
// ========================================
async function toolGrep({ pattern, path: searchPath, include }) {
  if (!pattern) {
    return { content: 'Error: pattern is required', isError: true };
  }

  const dir = searchPath || BASE_DIR;

  // Try ripgrep first, then fall back to grep
  let cmd;
  const escapedPattern = pattern.replace(/'/g, "'\\''");

  // Check if rg is available
  try {
    execSync('which rg', { encoding: 'utf-8' });

    // Use ripgrep
    cmd = `rg --no-heading -n '${escapedPattern}'`;
    if (include) {
      cmd += ` --glob '${include}'`;
    }
    cmd += ` '${dir}' 2>/dev/null | head -100`;
  } catch {
    // Fall back to grep
    cmd = `grep -rn '${escapedPattern}'`;
    if (include) {
      cmd += ` --include='${include}'`;
    }
    cmd += ` '${dir}' 2>/dev/null | head -100`;
  }

  try {
    const result = execSync(cmd, {
      timeout: 30000,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 5
    }).trim();

    if (!result) {
      return { content: `No matches found for pattern: ${pattern}`, isError: false };
    }

    return { content: result, isError: false };
  } catch (err) {
    if (err.status === 1) {
      // grep returns exit 1 for no matches
      return { content: `No matches found for pattern: ${pattern}`, isError: false };
    }
    return { content: `Error searching: ${err.message}`, isError: true };
  }
}

// ========================================
// Tool: LS
// ========================================
async function toolLS({ path: dirPath }) {
  const dir = dirPath || BASE_DIR;

  if (!fs.existsSync(dir)) {
    return { content: `Error: Directory not found: ${dir}`, isError: true };
  }

  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    return { content: `Error: ${dir} is not a directory`, isError: true };
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result = entries.map(e => {
    if (e.isDirectory()) return e.name + '/';
    return e.name;
  }).sort((a, b) => {
    // Directories first
    const aDir = a.endsWith('/');
    const bDir = b.endsWith('/');
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return a.localeCompare(b);
  }).join('\n');

  return { content: result || '(empty directory)', isError: false };
}

module.exports = { executeTool };
