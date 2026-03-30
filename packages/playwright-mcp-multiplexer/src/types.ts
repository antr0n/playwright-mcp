import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type InstanceStatus = 'starting' | 'ready' | 'closed';

export interface ManagedInstance {
  id: string;
  client: Client;
  transport: StdioClientTransport;
  config: InstanceConfig;
  createdAt: number;
  status: InstanceStatus;
}

export interface InstanceConfig {
  headless?: boolean;
  browser?: string;
  storageState?: string;
  /** Path to user data dir to copy. `null` forces --isolated (no profile copy), `undefined` falls back to server config. */
  userDataDir?: string | null;
  cdpEndpoint?: string;
  extension?: boolean;
  args?: string[];
  domState?: boolean;
  /** Paths to JS files to inject into every page via @playwright/mcp's initScript config option. */
  initScript?: string[];
  /** Set bypassCSP on the browser context — required for injecting scripts on CSP-protected pages. */
  bypassCSP?: boolean;
}

export interface MultiplexerConfig {
  maxInstances?: number;
  defaultHeadless?: boolean;
  defaultBrowser?: string;
  authDir?: string;
  cliPath?: string;
  userDataDir?: string;
  profileName?: string;
  cdpEndpoint?: string;
  extension?: boolean;
  executablePath?: string;
  /** Paths to JS files to inject into every page via @playwright/mcp's initScript config option. */
  initScript?: string[];
  /** Set bypassCSP on the browser context — required for injecting scripts on CSP-protected pages. */
  bypassCSP?: boolean;
}

export interface AugmentedTool extends Tool {
  // Tool with instanceId injected into its inputSchema
}

export interface ToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface ToolCallResponse {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}
