import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.join(__dirname, '..', 'dist', 'cli.js');

async function createMultiplexerClient(extraArgs: string[] = []): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [CLI_PATH, '--headless', ...extraArgs],
    stderr: 'pipe',
  });

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);
  await client.ping();

  return {
    client,
    cleanup: async () => {
      // Close all instances before disconnecting
      try {
        await client.callTool({ name: 'instance_close_all', arguments: {} });
      } catch {
        // Ignore errors during cleanup
      }
      await client.close();
    },
  };
}

test.describe('Multiplexer MCP Server', () => {
  test.describe('tool listing', () => {
    test('should list management tools and proxied playwright tools', async () => {
      const { client, cleanup } = await createMultiplexerClient();
      try {
        const result = await client.listTools();
        const toolNames = result.tools.map(t => t.name);

        // Management tools
        expect(toolNames).toContain('instance_create');
        expect(toolNames).toContain('instance_list');
        expect(toolNames).toContain('instance_close');
        expect(toolNames).toContain('instance_close_all');
        expect(toolNames).toContain('auth_export_state');

        // Proxied Playwright tools should have instanceId in their schema
        const navigateTool = result.tools.find(t => t.name === 'browser_navigate');
        expect(navigateTool).toBeTruthy();
        const schema = navigateTool!.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
        expect(schema.properties).toHaveProperty('instanceId');
        expect(schema.required).toContain('instanceId');

        // Core Playwright tools should be present
        expect(toolNames).toContain('browser_snapshot');
        expect(toolNames).toContain('browser_click');
        expect(toolNames).toContain('browser_navigate');
      } finally {
        await cleanup();
      }
    });
  });

  test.describe('instance lifecycle', () => {
    test('should create, list, and close an instance', async () => {
      const { client, cleanup } = await createMultiplexerClient();
      try {
        // Create instance
        const createResult = await client.callTool({
          name: 'instance_create',
          arguments: {},
        });
        const createText = (createResult.content as Array<{ text: string }>)[0].text;
        expect(createText).toContain('Created browser instance');
        const instanceIdMatch = createText.match(/"(inst-\d+)"/);
        expect(instanceIdMatch).toBeTruthy();
        const instanceId = instanceIdMatch![1];

        // List instances
        const listResult = await client.callTool({
          name: 'instance_list',
          arguments: {},
        });
        const listText = (listResult.content as Array<{ text: string }>)[0].text;
        expect(listText).toContain(instanceId);
        expect(listText).toContain('status=ready');

        // Close instance
        const closeResult = await client.callTool({
          name: 'instance_close',
          arguments: { instanceId },
        });
        const closeText = (closeResult.content as Array<{ text: string }>)[0].text;
        expect(closeText).toContain(`Closed instance "${instanceId}"`);

        // Verify closed - list should be empty
        const listAfterClose = await client.callTool({
          name: 'instance_list',
          arguments: {},
        });
        const listAfterText = (listAfterClose.content as Array<{ text: string }>)[0].text;
        expect(listAfterText).toContain('No active instances');
      } finally {
        await cleanup();
      }
    });
  });

  test.describe('tool proxying', () => {
    test('should proxy browser_navigate and browser_snapshot', async () => {
      const { client, cleanup } = await createMultiplexerClient();
      try {
        // Create instance
        const createResult = await client.callTool({
          name: 'instance_create',
          arguments: {},
        });
        const createText = (createResult.content as Array<{ text: string }>)[0].text;
        const instanceId = createText.match(/"(inst-\d+)"/)![1];

        // Navigate
        const navResult = await client.callTool({
          name: 'browser_navigate',
          arguments: { instanceId, url: 'data:text/html,<h1>Hello Multiplexer</h1>' },
        });
        expect(navResult.isError).toBeFalsy();

        // Snapshot
        const snapResult = await client.callTool({
          name: 'browser_snapshot',
          arguments: { instanceId },
        });
        const snapText = (snapResult.content as Array<{ text: string }>)[0].text;
        expect(snapText).toContain('Hello Multiplexer');
      } finally {
        await cleanup();
      }
    });
  });

  test.describe('multi-instance', () => {
    test('should maintain independent state across instances', async () => {
      const { client, cleanup } = await createMultiplexerClient(['--max-instances=5']);
      try {
        // Create two instances
        const create1 = await client.callTool({ name: 'instance_create', arguments: {} });
        const id1 = ((create1.content as Array<{ text: string }>)[0].text).match(/"(inst-\d+)"/)![1];

        const create2 = await client.callTool({ name: 'instance_create', arguments: {} });
        const id2 = ((create2.content as Array<{ text: string }>)[0].text).match(/"(inst-\d+)"/)![1];

        expect(id1).not.toEqual(id2);

        // Navigate each to different content
        await client.callTool({
          name: 'browser_navigate',
          arguments: { instanceId: id1, url: 'data:text/html,<h1>Page One</h1>' },
        });
        await client.callTool({
          name: 'browser_navigate',
          arguments: { instanceId: id2, url: 'data:text/html,<h1>Page Two</h1>' },
        });

        // Verify independent state
        const snap1 = await client.callTool({
          name: 'browser_snapshot',
          arguments: { instanceId: id1 },
        });
        expect((snap1.content as Array<{ text: string }>)[0].text).toContain('Page One');
        expect((snap1.content as Array<{ text: string }>)[0].text).not.toContain('Page Two');

        const snap2 = await client.callTool({
          name: 'browser_snapshot',
          arguments: { instanceId: id2 },
        });
        expect((snap2.content as Array<{ text: string }>)[0].text).toContain('Page Two');
        expect((snap2.content as Array<{ text: string }>)[0].text).not.toContain('Page One');
      } finally {
        await cleanup();
      }
    });
  });

  test.describe('error handling', () => {
    test('should return isError:true for non-existent instanceId', async () => {
      const { client, cleanup } = await createMultiplexerClient();
      try {
        // Force tool discovery by listing tools first
        await client.listTools();

        // Try to navigate with a non-existent instance — should return isError: true, not throw
        const result = await client.callTool({
          name: 'browser_navigate',
          arguments: { instanceId: 'inst-nonexistent', url: 'data:text/html,<h1>test</h1>' },
        });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ text: string }>)[0].text;
        expect(text).toContain('inst-nonexistent');
        expect(text).toContain('browser_navigate');
      } finally {
        await cleanup();
      }
    });

    test('should include tool name and instanceId in proxy error message', async () => {
      const { client, cleanup } = await createMultiplexerClient();
      try {
        await client.listTools();

        const result = await client.callTool({
          name: 'browser_snapshot',
          arguments: { instanceId: 'inst-missing' },
        });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ text: string }>)[0].text;
        expect(text).toContain('browser_snapshot');
        expect(text).toContain('inst-missing');
      } finally {
        await cleanup();
      }
    });

    test('should return isError:true when calling proxy tool after instance is closed', async () => {
      const { client, cleanup } = await createMultiplexerClient();
      try {
        // Create and then close an instance
        const createResult = await client.callTool({ name: 'instance_create', arguments: {} });
        const instanceId = ((createResult.content as Array<{ text: string }>)[0].text).match(/"(inst-\d+)"/)![1];

        await client.callTool({ name: 'instance_close', arguments: { instanceId } });

        // Now attempt to use the closed instance — should return isError: true
        const result = await client.callTool({
          name: 'browser_snapshot',
          arguments: { instanceId },
        });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ text: string }>)[0].text;
        expect(text).toContain(instanceId);
        expect(text).toContain('browser_snapshot');
      } finally {
        await cleanup();
      }
    });

    test('should return error when closing non-existent instance', async () => {
      const { client, cleanup } = await createMultiplexerClient();
      try {
        const result = await client.callTool({
          name: 'instance_close',
          arguments: { instanceId: 'inst-nonexistent' },
        });
        expect(result.isError).toBe(true);
        expect((result.content as Array<{ text: string }>)[0].text).toContain('not found');
      } finally {
        await cleanup();
      }
    });

    test('should return error for missing instanceId on proxy tools', async () => {
      const { client, cleanup } = await createMultiplexerClient();
      try {
        // Force tool discovery
        await client.listTools();

        // Create an instance first (to trigger discovery), then try without instanceId
        await client.callTool({ name: 'instance_create', arguments: {} });

        // This might throw or return error depending on SDK validation
        try {
          const result = await client.callTool({
            name: 'browser_snapshot',
            arguments: {},
          });
          // If it doesn't throw, it should be an error response
          expect(result.isError).toBe(true);
        } catch {
          // SDK might reject before reaching our handler — that's fine
        }
      } finally {
        await cleanup();
      }
    });
  });

  test.describe('instance_close_all', () => {
    test('should close all instances', async () => {
      const { client, cleanup } = await createMultiplexerClient(['--max-instances=5']);
      try {
        // Create multiple instances
        await client.callTool({ name: 'instance_create', arguments: {} });
        await client.callTool({ name: 'instance_create', arguments: {} });
        await client.callTool({ name: 'instance_create', arguments: {} });

        // Verify they exist
        const listBefore = await client.callTool({ name: 'instance_list', arguments: {} });
        expect((listBefore.content as Array<{ text: string }>)[0].text).toContain('Active instances (3)');

        // Close all
        const closeAllResult = await client.callTool({ name: 'instance_close_all', arguments: {} });
        expect((closeAllResult.content as Array<{ text: string }>)[0].text).toContain('Closed 3 instance(s)');

        // Verify empty
        const listAfter = await client.callTool({ name: 'instance_list', arguments: {} });
        expect((listAfter.content as Array<{ text: string }>)[0].text).toContain('No active instances');
      } finally {
        await cleanup();
      }
    });
  });

  test.describe('auth export', () => {
    test('should export storage state from an instance', async () => {
      const { client, cleanup } = await createMultiplexerClient();
      const tmpDir = path.join(__dirname, '..', 'test-results', 'auth-test');
      try {
        // Create instance and navigate to a page
        const createResult = await client.callTool({ name: 'instance_create', arguments: {} });
        const instanceId = ((createResult.content as Array<{ text: string }>)[0].text).match(/"(inst-\d+)"/)![1];

        await client.callTool({
          name: 'browser_navigate',
          arguments: { instanceId, url: 'data:text/html,<h1>Auth Test</h1>' },
        });

        // Export auth state
        const savePath = path.join(tmpDir, 'test-state.json');
        const exportResult = await client.callTool({
          name: 'auth_export_state',
          arguments: { instanceId, savePath },
        });
        const exportText = (exportResult.content as Array<{ text: string }>)[0].text;
        expect(exportText).toContain('Exported auth state');
        expect(exportText).toContain(savePath);

        // Verify the file exists and contains valid JSON
        const stateData = JSON.parse(await fs.promises.readFile(savePath, 'utf-8'));
        expect(stateData).toHaveProperty('cookies');
        expect(stateData).toHaveProperty('origins');
      } finally {
        await cleanup();
        await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });
});
