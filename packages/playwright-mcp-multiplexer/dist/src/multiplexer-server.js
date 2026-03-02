import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema, InitializedNotificationSchema, } from '@modelcontextprotocol/sdk/types.js';
import { InstanceManager } from './instance-manager.js';
import { ToolRegistry } from './tool-registry.js';
import { ToolRouter } from './tool-router.js';
import { AuthManager } from './auth-manager.js';
export class MultiplexerServer {
    server;
    instanceManager;
    toolRegistry;
    toolRouter;
    authManager;
    discoveryPromise = null;
    constructor(config = {}) {
        this.instanceManager = new InstanceManager(config);
        this.toolRegistry = new ToolRegistry();
        this.authManager = new AuthManager(this.instanceManager.getConfig().authDir);
        this.toolRouter = new ToolRouter(this.instanceManager, this.toolRegistry, this.authManager);
        this.server = new Server({ name: 'playwright-mcp-multiplexer', version: '0.0.1' }, { capabilities: { tools: {} } });
        this.registerHandlers();
    }
    async connect(transport) {
        // Wait for the MCP handshake to complete before making server->client requests.
        // Server.connect() sets up I/O but the handshake (initialize/InitializeResult/initialized)
        // happens asynchronously. listRoots() will fail if called before the handshake.
        const handshakeComplete = new Promise(resolve => {
            this.server.setNotificationHandler(InitializedNotificationSchema, () => resolve());
        });
        await this.server.connect(transport);
        await handshakeComplete;
        // Now safe to make server->client requests
        try {
            const rootsResult = await this.server.listRoots();
            if (rootsResult.roots?.length > 0) {
                const firstRoot = rootsResult.roots[0];
                if (firstRoot.uri) {
                    // Convert file:// URI to path
                    const workspaceRoot = this.uriToPath(firstRoot.uri);
                    this.instanceManager.setWorkspaceRoot(workspaceRoot);
                }
            }
        }
        catch {
            // Client may not support roots - that's okay, DOM state will be disabled
        }
    }
    uriToPath(uri) {
        if (uri.startsWith('file://')) {
            // Remove file:// prefix and decode URI components
            let path = uri.slice(7);
            // On Windows, file:///C:/... becomes C:/...
            // On Unix, file:///home/... becomes /home/...
            if (process.platform === 'win32' && path.startsWith('/')) {
                path = path.slice(1);
            }
            return decodeURIComponent(path);
        }
        return uri;
    }
    async close() {
        await this.instanceManager.closeAll();
        await this.server.close();
    }
    registerHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            // Lazy discovery: on first call, spawn a probe instance to discover tools
            if (!this.toolRegistry.isInitialized()) {
                await this.ensureToolsDiscovered();
            }
            return { tools: this.toolRegistry.getTools() };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            // Ensure tools are discovered before routing
            if (!this.toolRegistry.isInitialized()) {
                // For management tools like instance_create, route first then discover
                if (this.toolRegistry.isManagementTool(name)) {
                    const result = await this.toolRouter.route(name, args);
                    // After instance_create, we now have an instance to discover from
                    if (name === 'instance_create')
                        await this.ensureToolsDiscovered();
                    return result;
                }
                await this.ensureToolsDiscovered();
            }
            const result = await this.toolRouter.route(name, args);
            return result;
        });
    }
    async ensureToolsDiscovered() {
        if (this.toolRegistry.isInitialized())
            return;
        if (!this.discoveryPromise) {
            this.discoveryPromise = this.discoverTools().catch(err => {
                // Allow retry on failure by resetting the cached promise
                this.discoveryPromise = null;
                throw err;
            });
        }
        return this.discoveryPromise;
    }
    async discoverTools() {
        // Try to use an existing instance for discovery
        const existing = this.instanceManager.list().find(i => i.status === 'ready');
        if (existing) {
            await this.toolRegistry.discoverTools(existing.client);
            return;
        }
        // Spawn a minimal probe: --isolated, headless, no profile copy, no extension.
        // userDataDir: null forces --isolated regardless of server config.
        const probe = await this.instanceManager.create({ headless: true, userDataDir: null, extension: false });
        try {
            await this.toolRegistry.discoverTools(probe.client);
        }
        finally {
            await this.instanceManager.close(probe.id);
        }
    }
}
//# sourceMappingURL=multiplexer-server.js.map