import type { InstanceManager } from './instance-manager.js';
import type { ToolRegistry } from './tool-registry.js';
import type { AuthManager } from './auth-manager.js';
import type { ToolCallResponse } from './types.js';

export class ToolRouter {
  constructor(
    private instanceManager: InstanceManager,
    private toolRegistry: ToolRegistry,
    private authManager: AuthManager,
  ) {}

  async route(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResponse> {
    if (this.toolRegistry.isManagementTool(name))
      return this.handleManagementTool(name, args);

    if (this.toolRegistry.isProxyTool(name))
      return this.handleProxyTool(name, args);

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  private async handleManagementTool(name: string, args: Record<string, unknown>): Promise<ToolCallResponse> {
    switch (name) {
      case 'instance_create':
        return this.handleInstanceCreate(args);
      case 'instance_list':
        return this.handleInstanceList();
      case 'instance_close':
        return this.handleInstanceClose(args);
      case 'instance_close_all':
        return this.handleInstanceCloseAll();
      case 'auth_export_state':
        return this.handleAuthExport(args);
      default:
        return {
          content: [{ type: 'text', text: `Unknown management tool: ${name}` }],
          isError: true,
        };
    }
  }

  private async handleProxyTool(name: string, args: Record<string, unknown>): Promise<ToolCallResponse> {
    const instanceId = args.instanceId as string | undefined;
    if (!instanceId) {
      return {
        content: [{ type: 'text', text: 'Missing required parameter: instanceId' }],
        isError: true,
      };
    }

    try {
      const instance = this.instanceManager.getOrThrow(instanceId);

      // Strip instanceId before forwarding to child
      const { instanceId: _, ...childArgs } = args;

      const result = await instance.client.callTool({
        name,
        arguments: childArgs,
      });

      return result as ToolCallResponse;
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error calling ${name} on instance "${instanceId}": ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async handleInstanceCreate(args: Record<string, unknown>): Promise<ToolCallResponse> {
    try {
      const instance = await this.instanceManager.create({
        headless: args.headless as boolean | undefined,
        browser: args.browser as string | undefined,
        storageState: args.storageState as string | undefined,
        userDataDir: args.userDataDir as string | undefined,
        cdpEndpoint: args.cdpEndpoint as string | undefined,
        extension: args.extension as boolean | undefined,
        domState: args.domState as boolean | undefined,
      });

      const effectiveConfig = this.instanceManager.getConfig();
      const useExtension = instance.config.extension ?? effectiveConfig.extension;
      const cdpEndpoint = instance.config.cdpEndpoint || effectiveConfig.cdpEndpoint;
      let description: string;
      if (useExtension) {
        description = `Created browser instance "${instance.id}" (extension)`;
      } else if (effectiveConfig.electronMode && instance.viewId) {
        description = `Created browser instance "${instance.id}" (Electron view: ${instance.viewId}, target: ${instance.targetUrl})`;
      } else if (effectiveConfig.electronMode && cdpEndpoint) {
        description = `Created browser instance "${instance.id}" (Electron CDP: ${cdpEndpoint}, isolated context)`;
      } else if (cdpEndpoint) {
        description = `Created browser instance "${instance.id}" (CDP: ${cdpEndpoint})`;
      } else {
        const browser = instance.config.browser ?? effectiveConfig.defaultBrowser;
        const headless = instance.config.headless ?? effectiveConfig.defaultHeadless;
        description = `Created browser instance "${instance.id}" (${browser}, ${headless ? 'headless' : 'headed'})`;
      }

      const result: Record<string, unknown> = {
        instanceId: instance.id,
        description,
      };
      if (instance.debugPort)
        result.debugPort = instance.debugPort;
      if (instance.viewId)
        result.viewId = instance.viewId;
      if (instance.targetUrl)
        result.targetUrl = instance.targetUrl;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to create instance: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  private async handleInstanceList(): Promise<ToolCallResponse> {
    const instances = this.instanceManager.list();
    if (instances.length === 0) {
      return {
        content: [{ type: 'text', text: 'No active instances. Use instance_create to create one.' }],
      };
    }

    const effectiveConfig = this.instanceManager.getConfig();
    const lines = instances.map(inst => {
      const age = Math.round((Date.now() - inst.createdAt) / 1000);
      const domState = inst.config.domState !== false ? 'on' : 'off';
      const useExtension = inst.config.extension ?? effectiveConfig.extension;
      if (useExtension) {
        return `- ${inst.id}: status=${inst.status}, mode=extension, domState=${domState}, age=${age}s`;
      }
      const cdpEndpoint = inst.config.cdpEndpoint || effectiveConfig.cdpEndpoint;
      if (effectiveConfig.electronMode && cdpEndpoint) {
        return `- ${inst.id}: status=${inst.status}, mode=electron-cdp, isolated=true, domState=${domState}, age=${age}s`;
      }
      if (cdpEndpoint) {
        return `- ${inst.id}: status=${inst.status}, cdp=${cdpEndpoint}, domState=${domState}, age=${age}s`;
      }
      const browser = inst.config.browser ?? effectiveConfig.defaultBrowser;
      const headless = inst.config.headless ?? effectiveConfig.defaultHeadless;
      return `- ${inst.id}: status=${inst.status}, browser=${browser}, ${headless ? 'headless' : 'headed'}, domState=${domState}, age=${age}s`;
    });

    return {
      content: [{ type: 'text', text: `Active instances (${instances.length}):\n${lines.join('\n')}` }],
    };
  }

  private async handleInstanceClose(args: Record<string, unknown>): Promise<ToolCallResponse> {
    const instanceId = args.instanceId as string | undefined;
    if (!instanceId) {
      return {
        content: [{ type: 'text', text: 'Missing required parameter: instanceId' }],
        isError: true,
      };
    }

    try {
      await this.instanceManager.close(instanceId);
      return {
        content: [{ type: 'text', text: `Closed instance "${instanceId}"` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to close instance: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  private async handleInstanceCloseAll(): Promise<ToolCallResponse> {
    const count = this.instanceManager.list().length;
    await this.instanceManager.closeAll();
    return {
      content: [{ type: 'text', text: `Closed ${count} instance(s)` }],
    };
  }

  private async handleAuthExport(args: Record<string, unknown>): Promise<ToolCallResponse> {
    const instanceId = args.instanceId as string | undefined;
    if (!instanceId) {
      return {
        content: [{ type: 'text', text: 'Missing required parameter: instanceId' }],
        isError: true,
      };
    }

    try {
      const instance = this.instanceManager.getOrThrow(instanceId);
      const savePath = args.savePath as string | undefined;
      const resultPath = await this.authManager.exportState(instance, savePath);
      return {
        content: [{ type: 'text', text: `Exported auth state from "${instanceId}" to: ${resultPath}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to export auth state: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
}
