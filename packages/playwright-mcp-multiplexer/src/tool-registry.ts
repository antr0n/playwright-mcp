import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const MANAGEMENT_TOOLS: Tool[] = [
  {
    name: 'instance_create',
    description: 'Create a new browser instance. Returns the instance ID for use with other tools.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        headless: { type: 'boolean', description: 'Run browser in headless mode (default: true)' },
        browser: { type: 'string', enum: ['chrome', 'chromium', 'firefox', 'webkit'], description: 'Browser type (default: from server config)' },
        storageState: { type: 'string', description: 'Path to a storageState JSON file for pre-authenticated sessions' },
        userDataDir: { type: 'string', description: 'Path to a browser profile directory to copy auth state from (Chrome user-data-dir or Firefox profile path)' },
        cdpEndpoint: { type: 'string', description: 'CDP endpoint URL to connect to an already-running Chrome instance (e.g. http://localhost:9222). Overrides browser/userDataDir.' },
        extension: { type: 'boolean', description: 'Connect to running Chrome via the Playwright MCP Bridge extension (default: from server config). Overrides browser/userDataDir.' },
        domState: { type: 'boolean', description: 'Enable DOM state file output (default: true). Set to false to disable DOM/diff file generation for this instance.' },
      },
    },
  },
  {
    name: 'instance_list',
    description: 'List all active browser instances with their IDs and status.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'instance_close',
    description: 'Close a specific browser instance and release its resources.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        instanceId: { type: 'string', description: 'The instance ID to close' },
      },
      required: ['instanceId'],
    },
  },
  {
    name: 'instance_close_all',
    description: 'Close all browser instances and release all resources.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'auth_export_state',
    description: 'Export cookies and localStorage from a browser instance to a JSON file for sharing with other instances.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        instanceId: { type: 'string', description: 'The instance ID to export auth state from' },
        savePath: { type: 'string', description: 'Optional file path to save the state (defaults to auth directory)' },
      },
      required: ['instanceId'],
    },
  },
];

const MANAGEMENT_TOOL_NAMES = new Set(MANAGEMENT_TOOLS.map(t => t.name));

export class ToolRegistry {
  private proxyTools: Tool[] = [];
  private proxyToolNames = new Set<string>();
  private allTools: Tool[] = [];
  private initialized = false;

  isManagementTool(name: string): boolean {
    return MANAGEMENT_TOOL_NAMES.has(name);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async discoverTools(probeClient: Client): Promise<void> {
    const result = await probeClient.listTools();
    const childTools = result.tools;

    this.proxyTools = childTools.map(tool => this.augmentWithInstanceId(tool));
    this.proxyToolNames = new Set(childTools.map(t => t.name));
    this.allTools = [...MANAGEMENT_TOOLS, ...this.proxyTools];
    this.initialized = true;
  }

  getTools(): Tool[] {
    return this.allTools;
  }

  getManagementTools(): Tool[] {
    return MANAGEMENT_TOOLS;
  }

  isProxyTool(name: string): boolean {
    return this.proxyToolNames.has(name);
  }

  private augmentWithInstanceId(tool: Tool): Tool {
    const schema = JSON.parse(JSON.stringify(tool.inputSchema)) as {
      type: 'object';
      properties?: Record<string, object>;
      required?: string[];
    };

    if (!schema.properties)
      schema.properties = {};

    schema.properties['instanceId'] = {
      type: 'string',
      description: 'Target browser instance ID (from instance_create or instance_list)',
    };

    if (!schema.required)
      schema.required = [];
    schema.required.unshift('instanceId');

    return {
      ...tool,
      inputSchema: schema,
    };
  }
}
