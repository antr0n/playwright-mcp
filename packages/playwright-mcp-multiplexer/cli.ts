#!/usr/bin/env node

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
  }

  return config;
}

async function main() {
  const config = parseArgs(process.argv);
  const server = new MultiplexerServer(config);
  const transport = new StdioServerTransport();

  // Graceful shutdown — guard against re-entrant signals (e.g. double Ctrl+C)
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
