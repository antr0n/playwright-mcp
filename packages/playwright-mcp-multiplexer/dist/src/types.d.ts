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
    /** Chrome's remote debugging port (0 = not available). */
    debugPort?: number;
    /** Electron ViewManager view ID (electron mode only). */
    viewId?: string;
    /** Target URL for page filtering in electron mode. */
    targetUrl?: string;
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
    /** Target URL for page filtering in electron mode */
    targetUrl?: string;
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
    /**
     * Electron mode: connect to Electron's built-in Chromium via CDP.
     *
     * When enabled:
     *   - Each instance connects to the CDP endpoint and creates an isolated
     *     BrowserContext (via --isolated), providing session isolation
     *     (separate cookies, localStorage, etc.) without spawning new Chrome
     *     processes.
     *   - Profile management is skipped entirely (no profile dirs, no copying).
     *   - No Xvfb virtual displays are needed (Electron manages its own window).
     *   - DOM state output is disabled by default.
     *   - If no cdpEndpoint is configured, defaults to http://127.0.0.1:9222.
     */
    electronMode?: boolean;
    /** URL of the Electron ViewManager HTTP API (default: http://127.0.0.1:3002) */
    viewManagerUrl?: string;
}
export interface AugmentedTool extends Tool {
}
export interface ToolCallRequest {
    name: string;
    arguments?: Record<string, unknown>;
}
export interface ToolCallResponse {
    content: Array<{
        type: string;
        text?: string;
        [key: string]: unknown;
    }>;
    isError?: boolean;
}
//# sourceMappingURL=types.d.ts.map