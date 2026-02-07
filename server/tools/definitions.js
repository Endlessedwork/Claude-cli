/* ========================================
   Tool Definitions for Anthropic API
   ======================================== */

const tools = [
  {
    name: 'Read',
    description: 'Read the contents of a file at the given path. Returns the file content with line numbers. Can read text files, images, and PDFs.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to read'
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (1-indexed). Optional.'
        },
        limit: {
          type: 'number',
          description: 'Number of lines to read. Optional, defaults to entire file.'
        }
      },
      required: ['file_path']
    }
  },
  {
    name: 'Write',
    description: 'Write content to a file at the given path. Creates the file if it does not exist, or overwrites it if it does.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to write'
        },
        content: {
          type: 'string',
          description: 'The content to write to the file'
        }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'Edit',
    description: 'Perform an exact string replacement in a file. The old_string must match exactly (including whitespace and indentation). Only the first occurrence is replaced unless replace_all is true.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to edit'
        },
        old_string: {
          type: 'string',
          description: 'The exact string to find and replace'
        },
        new_string: {
          type: 'string',
          description: 'The string to replace old_string with'
        },
        replace_all: {
          type: 'boolean',
          description: 'If true, replace all occurrences. Default false.',
          default: false
        }
      },
      required: ['file_path', 'old_string', 'new_string']
    }
  },
  {
    name: 'Bash',
    description: 'Execute a bash command on the server. Returns stdout, stderr, and exit code. Use for running scripts, git commands, npm commands, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The bash command to execute'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds. Default 120000 (2 minutes). Max 600000 (10 minutes).',
          default: 120000
        }
      },
      required: ['command']
    }
  },
  {
    name: 'Glob',
    description: 'Find files matching a glob pattern. Returns matching file paths sorted by modification time.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The glob pattern to match (e.g., "**/*.js", "src/**/*.ts")'
        },
        path: {
          type: 'string',
          description: 'The directory to search in. Defaults to current working directory.'
        }
      },
      required: ['pattern']
    }
  },
  {
    name: 'Grep',
    description: 'Search file contents using regular expressions (powered by ripgrep). Returns matching file paths or content lines.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The regex pattern to search for'
        },
        path: {
          type: 'string',
          description: 'File or directory to search in. Defaults to current working directory.'
        },
        include: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}")'
        }
      },
      required: ['pattern']
    }
  },
  {
    name: 'LS',
    description: 'List files and directories at the given path. Returns names with type indicators (/ for directories).',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to list. Defaults to current working directory.'
        }
      },
      required: []
    }
  }
];

module.exports = { tools };
