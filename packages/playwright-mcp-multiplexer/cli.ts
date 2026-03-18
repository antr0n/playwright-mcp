#!/usr/bin/env node

// Combined entry point: two modes in one binary.
//
// Default (no subcommand): Multiplexer mode — MCP server that manages
//   multiple browser instances, proxies tool calls by instanceId.
//
// "child" subcommand: @playwright/mcp mode — single-browser MCP server.
//   The multiplexer spawns copies of itself with "child" prepended.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MultiplexerServer } from './src/multiplexer-server.js';
import type { MultiplexerConfig } from './src/types.js';

function parseArgs(argv: string[]): MultiplexerConfig {
  const config: MultiplexerConfig = {};

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--max-instances='))
      config.maxInstances = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--auth-dir='))
      config.authDir = arg.split('=')[1];
    else if (arg.startsWith('--cli-path='))
      config.cliPath = arg.split('=')[1];
    else if (arg.startsWith('--browser='))
      config.defaultBrowser = arg.split('=')[1];
    else if (arg === '--headed')
      config.defaultHeadless = false;
    else if (arg === '--headless')
      config.defaultHeadless = true;
    else if (arg.startsWith('--user-data-dir='))
      config.userDataDir = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--profile='))
      config.profileName = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--cdp-endpoint='))
      config.cdpEndpoint = arg.split('=').slice(1).join('=');
    else if (arg === '--extension')
      config.extension = true;
    else if (arg.startsWith('--executable-path='))
      config.executablePath = arg.split('=').slice(1).join('=');
    else if (arg === '--electron-mode')
      config.electronMode = true;
    else if (arg.startsWith('--view-manager-url='))
      config.viewManagerUrl = arg.split('=').slice(1).join('=');
  }

  return config;
}

if (process.argv[2] === 'child') {
  // ─── @playwright/mcp mode ─────────────────────────────────────────
  // Strip 'child' so @playwright/mcp's arg parser sees the real flags.
  process.argv.splice(2, 1);

  // playwright's built output is CJS; createRequire bridges ESM → CJS.
  const { program } = require('playwright-core/lib/utilsBundle');
  const { decorateCommand } = require('playwright/lib/mcp/program');

  decorateCommand(program, '0.0.66');
  void program.parseAsync(process.argv);
} else {
  // ─── Multiplexer mode ─────────────────────────────────────────────
  async function main() {
    const config = parseArgs(process.argv);
    const server = new MultiplexerServer(config);
    const transport = new StdioServerTransport();

    let shuttingDown = false;

    async function shutdown() {
      if (shuttingDown) return;
      shuttingDown = true;
      await server.close();
      process.exit(0);
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await server.connect(transport);
  }

  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
