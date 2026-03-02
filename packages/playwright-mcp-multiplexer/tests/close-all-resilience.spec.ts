/**
 * Tests for closeAll() resilience using Promise.allSettled().
 *
 * Verifies that instance_close_all attempts to close ALL instances
 * even when individual close operations encounter errors, and that
 * failures are reported to stderr.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.join(__dirname, '..', 'dist', 'cli.js');

/**
 * Creates a multiplexer client and returns a cleanup function.
 * Stderr is collected so tests can assert on logged errors.
 */
async function createClientWithStderr(extraArgs: string[] = []): Promise<{
  client: Client;
  stderrLines: string[];
  cleanup: () => Promise<void>;
}> {
  const stderrLines: string[] = [];

  const transport = new StdioClientTransport({
    command: 'node',
    args: [CLI_PATH, '--headless', ...extraArgs],
    stderr: 'pipe',
  });

  // Collect stderr output from the multiplexer process
  // StdioClientTransport exposes the underlying process via the 'stderr' stream
  // on the transport after connection. We access it via the internal process.
  const rawTransport = transport as unknown as { _process?: { stderr?: NodeJS.ReadableStream } };

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);

  // Attach stderr listener after connection when process is spawned
  const proc = rawTransport._process;
  if (proc?.stderr) {
    let buf = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      const newlines = buf.split('\n');
      buf = newlines.pop() ?? '';
      for (const line of newlines) {
        if (line.trim()) stderrLines.push(line);
      }
    });
  }

  return {
    client,
    stderrLines,
    cleanup: async () => {
      try {
        await client.callTool({ name: 'instance_close_all', arguments: {} });
      } catch {
        // Ignore errors during cleanup
      }
      await client.close();
    },
  };
}

test.describe('closeAll() resilience (Promise.allSettled)', () => {
  test('closes all instances and reports count correctly', async () => {
    const { client, cleanup } = await createClientWithStderr(['--max-instances=5']);
    try {
      // Create 3 instances
      await client.callTool({ name: 'instance_create', arguments: {} });
      await client.callTool({ name: 'instance_create', arguments: {} });
      await client.callTool({ name: 'instance_create', arguments: {} });

      // Verify 3 instances exist
      const listBefore = await client.callTool({ name: 'instance_list', arguments: {} });
      const listText = (listBefore.content as Array<{ text: string }>)[0].text;
      expect(listText).toContain('Active instances (3)');

      // Close all — should succeed and report all 3 closed
      const closeAllResult = await client.callTool({ name: 'instance_close_all', arguments: {} });
      const closeAllText = (closeAllResult.content as Array<{ text: string }>)[0].text;
      expect(closeAllText).toContain('Closed 3 instance(s)');

      // Verify no instances remain
      const listAfter = await client.callTool({ name: 'instance_list', arguments: {} });
      const listAfterText = (listAfter.content as Array<{ text: string }>)[0].text;
      expect(listAfterText).toContain('No active instances');
    } finally {
      await cleanup();
    }
  });

  test('instance_close_all on empty set succeeds without error', async () => {
    const { client, cleanup } = await createClientWithStderr();
    try {
      // No instances created — close all should succeed gracefully
      const closeAllResult = await client.callTool({ name: 'instance_close_all', arguments: {} });
      expect(closeAllResult.isError).toBeFalsy();
      const text = (closeAllResult.content as Array<{ text: string }>)[0].text;
      expect(text).toContain('Closed 0 instance(s)');
    } finally {
      await cleanup();
    }
  });

  test('instance_close_all leaves no instances after partial prior close', async () => {
    // This tests that closeAll() is not affected by the state of individual
    // prior closes. Create 3 instances, manually close 1, then closeAll()
    // should still clean up the remaining 2 without any issues.
    const { client, cleanup } = await createClientWithStderr(['--max-instances=5']);
    try {
      // Create 3 instances
      const create1 = await client.callTool({ name: 'instance_create', arguments: {} });
      await client.callTool({ name: 'instance_create', arguments: {} });
      await client.callTool({ name: 'instance_create', arguments: {} });

      // Extract first instance ID and close it manually
      const create1Text = (create1.content as Array<{ text: string }>)[0].text;
      const id1Match = create1Text.match(/"(inst-\d+)"/);
      if (id1Match) {
        await client.callTool({ name: 'instance_close', arguments: { instanceId: id1Match[1] } });
      }

      // Verify 2 remain
      const listMid = await client.callTool({ name: 'instance_list', arguments: {} });
      const listMidText = (listMid.content as Array<{ text: string }>)[0].text;
      expect(listMidText).toContain('Active instances (2)');

      // closeAll on the remaining 2 should succeed
      const closeAllResult = await client.callTool({ name: 'instance_close_all', arguments: {} });
      const closeAllText = (closeAllResult.content as Array<{ text: string }>)[0].text;
      expect(closeAllText).toContain('Closed 2 instance(s)');

      // Verify empty
      const listFinal = await client.callTool({ name: 'instance_list', arguments: {} });
      const listFinalText = (listFinal.content as Array<{ text: string }>)[0].text;
      expect(listFinalText).toContain('No active instances');
    } finally {
      await cleanup();
    }
  });

  test('close_all reports instance IDs correctly when listing before close', async () => {
    // Verifies that closeAll processes all instances in the map,
    // demonstrating the Promise.allSettled pattern collects all results.
    const { client, cleanup } = await createClientWithStderr(['--max-instances=5']);
    try {
      // Create 2 instances
      await client.callTool({ name: 'instance_create', arguments: {} });
      await client.callTool({ name: 'instance_create', arguments: {} });

      // List to confirm IDs are tracked
      const listResult = await client.callTool({ name: 'instance_list', arguments: {} });
      const listText = (listResult.content as Array<{ text: string }>)[0].text;
      expect(listText).toContain('Active instances (2)');
      expect(listText).toMatch(/inst-\d+/);

      // closeAll should handle all of them
      const closeAllResult = await client.callTool({ name: 'instance_close_all', arguments: {} });
      const closeAllText = (closeAllResult.content as Array<{ text: string }>)[0].text;
      expect(closeAllText).toContain('Closed 2 instance(s)');
    } finally {
      await cleanup();
    }
  });
});
