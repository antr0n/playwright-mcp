import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
export declare class ToolRegistry {
    private proxyTools;
    private proxyToolNames;
    private allTools;
    private initialized;
    isManagementTool(name: string): boolean;
    isInitialized(): boolean;
    discoverTools(probeClient: Client): Promise<void>;
    getTools(): Tool[];
    getManagementTools(): Tool[];
    isProxyTool(name: string): boolean;
    private augmentWithInstanceId;
}
//# sourceMappingURL=tool-registry.d.ts.map