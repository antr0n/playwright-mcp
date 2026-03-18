import type { ManagedInstance, InstanceConfig, MultiplexerConfig } from './types.js';
export declare class InstanceManager {
    private instances;
    private profileDirs;
    private configFiles;
    private virtualDisplays;
    private virtualDisplayManager;
    private _knownDebugPorts;
    private nextId;
    private config;
    private workspaceRoot;
    private electronViews;
    constructor(config?: MultiplexerConfig);
    /**
     * Set the workspace root path from the MCP client's roots.
     * Called by the multiplexer server during initialization.
     */
    setWorkspaceRoot(workspaceRoot: string | undefined): void;
    create(instanceConfig?: InstanceConfig): Promise<ManagedInstance>;
    get(id: string): ManagedInstance | undefined;
    getOrThrow(id: string): ManagedInstance;
    list(): ManagedInstance[];
    close(id: string): Promise<void>;
    closeAll(): Promise<void>;
    getConfig(): Readonly<Required<MultiplexerConfig>>;
    private buildArgs;
    private createLaunchConfig;
    private copyProfile;
    private createElectronView;
    private destroyElectronView;
    private cleanupProfile;
}
//# sourceMappingURL=instance-manager.d.ts.map