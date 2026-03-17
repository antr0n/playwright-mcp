import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ManagedInstance, InstanceConfig, MultiplexerConfig } from './types.js';
import { VirtualDisplayManager } from './virtual-display.js';

/**
 * Find a Chrome remote debugging port that isn't already known.
 * Scans /proc for Chrome/Chromium processes with --remote-debugging-port=NNNNN.
 */
async function findChromeDebugPort(knownPorts: Set<number>): Promise<number | undefined> {
  try {
    // /proc/*/cmdline uses null bytes as separators — tr converts them to spaces
    const output = execSync(
      `for f in /proc/*/cmdline; do tr '\\0' ' ' < "$f" 2>/dev/null; echo; done | grep -oP 'remote-debugging-port=\\K\\d+' | sort -u`,
      { encoding: 'utf8', shell: '/bin/bash' },
    );
    for (const line of output.trim().split('\n')) {
      const port = parseInt(line, 10);
      if (port > 0 && !knownPorts.has(port))
        return port;
    }
  } catch { /* /proc not available or other error */ }
  return undefined;
}

function getProfileManifest(browser: string): { files: string[]; dirs: string[] } {
  if (browser === 'firefox') {
    return {
      files: [
        'cookies.sqlite', 'cookies.sqlite-wal',
        'key4.db', 'cert9.db',
        'logins.json', 'logins-backup.json',
        'permissions.sqlite',
        'prefs.js',
      ],
      dirs: [
        'storage',
      ],
    };
  }
  // Chrome / Chromium (default)
  return {
    files: [
      'Cookies', 'Cookies-journal',
      'Login Data', 'Login Data-journal',
      'Web Data', 'Web Data-journal',
      'Preferences', 'Secure Preferences',
      'Extension Cookies',
    ],
    dirs: [
      'Local Storage',
      'Session Storage',
      'IndexedDB',
    ],
  };
}

export class InstanceManager {
  private instances = new Map<string, ManagedInstance>();
  private profileDirs = new Map<string, string>();   // instanceId → temp profile root
  private configFiles = new Map<string, string>();   // instanceId → temp config file path
  private virtualDisplays = new Map<string, string>(); // instanceId → ':N' display
  private virtualDisplayManager = new VirtualDisplayManager();
  private _knownDebugPorts = new Set<number>();      // ports already assigned to instances
  private nextId = 1;
  private config: Required<MultiplexerConfig>;
  private workspaceRoot: string | undefined;

  constructor(config: MultiplexerConfig = {}) {
    const electronMode = config.electronMode ?? false;
    this.config = {
      maxInstances: config.maxInstances ?? 10,
      defaultHeadless: config.defaultHeadless ?? true,
      defaultBrowser: config.defaultBrowser ?? 'chrome',
      authDir: config.authDir ?? path.join(os.homedir(), '.pride-riot', 'auth'),
      cliPath: config.cliPath ?? '',
      userDataDir: config.userDataDir ?? '',
      profileName: config.profileName ?? 'Default',
      cdpEndpoint: config.cdpEndpoint ?? (electronMode ? 'http://127.0.0.1:9222' : ''),
      extension: config.extension ?? false,
      executablePath: config.executablePath ?? '',
      electronMode,
    };
  }

  /**
   * Set the workspace root path from the MCP client's roots.
   * Called by the multiplexer server during initialization.
   */
  setWorkspaceRoot(workspaceRoot: string | undefined): void {
    this.workspaceRoot = workspaceRoot;
  }

  async create(instanceConfig: InstanceConfig = {}): Promise<ManagedInstance> {
    if (this.instances.size >= this.config.maxInstances) {
      throw new Error(`Maximum number of instances (${this.config.maxInstances}) reached`);
    }

    const id = `inst-${this.nextId++}`;
    const args = await this.buildArgs(id, instanceConfig);

    // Use --storage-state CLI flag directly (no temp config file needed)
    if (instanceConfig.storageState) {
      args.push(`--storage-state=${instanceConfig.storageState}`);
    }

    const instance: ManagedInstance = {
      id,
      client: null as unknown as Client,
      transport: null as unknown as StdioClientTransport,
      config: instanceConfig,
      createdAt: Date.now(),
      status: 'starting',
    };

    this.instances.set(id, instance);

    try {
      const headless = instanceConfig.headless ?? this.config.defaultHeadless;

      // In Electron mode, Electron manages its own window/display — skip Xvfb.
      // Allocate a virtual display for headless instances so Chrome still runs
      // in headed mode (same rendering, same fingerprint) but stays invisible.
      if (headless && !this.config.electronMode) {
        const display = await this.virtualDisplayManager.allocate();
        this.virtualDisplays.set(id, display);
      }

      // Build environment for child process — start from parent env
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) env[k] = v;
      }
      env.DEBUG = env.DEBUG ?? '';

      // Point Chrome at the right display
      const virtualDisplay = this.virtualDisplays.get(id);
      if (virtualDisplay) {
        // Headless: override DISPLAY to our Xvfb, remove Wayland so Chrome uses X11
        env.DISPLAY = virtualDisplay;
        delete env.WAYLAND_DISPLAY;
      }
      // Visible: inherit DISPLAY/WAYLAND_DISPLAY from parent as-is

      // DOM state toggle: explicitly disable or enable per instance.
      // In Electron mode, DOM state is off by default (Electron owns the UI).
      const domStateEnabled = instanceConfig.domState ?? (this.config.electronMode ? false : true);
      if (!domStateEnabled) {
        env.PW_DOM_STATE_DISABLED = '1';
      } else {
        env.PW_DOM_STATE_INSTANCE_ID = id;
        const workspace = this.workspaceRoot ?? process.env.PW_DOM_STATE_WORKSPACE;
        if (workspace)
          env.PW_DOM_STATE_WORKSPACE = workspace;
      }

      // Spawn a child @playwright/mcp instance. Uses the same entry point
      // (this script) with "child" prepended so it enters @playwright/mcp mode.
      // Works in both dev (node dist/cli.js) and production (node cli.bundle.cjs).
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [process.argv[1], 'child', ...args],
        stderr: 'pipe',
        env,
      });

      const client = new Client({
        name: `multiplexer-${id}`,
        version: '1.0.0',
      });

      instance.transport = transport;
      instance.client = client;

      await client.connect(transport);
      await client.ping();

      // Resolve Chrome's remote debugging port. After ping(), Chrome is running.
      // Scan all chrome/chromium processes for --remote-debugging-port=NNNNN.
      // We track known ports to avoid returning a stale port from a previous instance.
      instance.debugPort = await findChromeDebugPort(this._knownDebugPorts);
      if (instance.debugPort)
        this._knownDebugPorts.add(instance.debugPort);

      instance.status = 'ready';
      return instance;
    } catch (error) {
      this.instances.delete(id);
      await this.cleanupProfile(id);
      throw new Error(`Failed to create instance ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  get(id: string): ManagedInstance | undefined {
    return this.instances.get(id);
  }

  getOrThrow(id: string): ManagedInstance {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Instance "${id}" not found`);
    }
    if (instance.status !== 'ready') {
      throw new Error(`Instance "${id}" is not ready (status: ${instance.status})`);
    }
    return instance;
  }

  list(): ManagedInstance[] {
    return Array.from(this.instances.values());
  }

  async close(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Instance "${id}" not found`);
    }

    instance.status = 'closed';

    try {
      await instance.client.close();
    } catch {
      // Client may already be disconnected
    }

    this.instances.delete(id);
    await this.cleanupProfile(id);

    const virtualDisplay = this.virtualDisplays.get(id);
    if (virtualDisplay) {
      this.virtualDisplays.delete(id);
      await this.virtualDisplayManager.release(virtualDisplay);
    }
  }

  async closeAll(): Promise<void> {
    const ids = Array.from(this.instances.keys());
    const results = await Promise.allSettled(ids.map(id => this.close(id)));
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        process.stderr.write(`Failed to close instance ${ids[i]}: ${result.reason}\n`);
      }
    }
  }

  getConfig(): Readonly<Required<MultiplexerConfig>> {
    return this.config;
  }

  private async buildArgs(instanceId: string, instanceConfig: InstanceConfig): Promise<string[]> {
    // Extension mode: connect to running Chrome via browser extension
    const useExtension = instanceConfig.extension ?? this.config.extension;
    if (useExtension)
      return ['--extension'];

    // CDP mode: connect to an existing browser, skip all launch/profile logic
    const cdpEndpoint = instanceConfig.cdpEndpoint || this.config.cdpEndpoint;
    if (cdpEndpoint) {
      const args = [`--cdp-endpoint=${cdpEndpoint}`];
      // In Electron mode, each instance needs its own isolated BrowserContext
      // so that cookies, localStorage, and other state don't leak between
      // automation sessions. The --isolated flag tells @playwright/mcp's
      // CdpContextFactory to call browser.newContext() instead of reusing
      // the default context (browser.contexts()[0]).
      if (this.config.electronMode)
        args.push('--isolated');
      return args;
    }

    const args: string[] = [];

    const browser = instanceConfig.browser ?? this.config.defaultBrowser;
    if (browser)
      args.push(`--browser=${browser}`);

    const executablePath = this.config.executablePath;
    if (executablePath)
      args.push(`--executable-path=${executablePath}`);

    // If a userDataDir is configured, copy the profile and use --user-data-dir.
    // null = caller explicitly wants no profile (e.g. probe instances).
    // undefined = defer to server config.
    // Otherwise fall back to --isolated for a clean ephemeral profile.
    const sourceDir = instanceConfig.userDataDir !== undefined
      ? instanceConfig.userDataDir
      : this.config.userDataDir;
    if (sourceDir) {
      const profileRoot = await this.copyProfile(instanceId, sourceDir, browser);
      args.push(`--user-data-dir=${profileRoot}`);
    } else {
      args.push('--isolated');
    }

    // Always create a launch config with flags needed for profile copying.
    const configPath = await this.createLaunchConfig(instanceId, browser);
    args.push(`--config=${configPath}`);

    if (process.env.CI && process.platform === 'linux')
      args.push('--no-sandbox');

    if (instanceConfig.args)
      args.push(...instanceConfig.args);

    return args;
  }

  private async createLaunchConfig(instanceId: string, browser: string): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), 'pw-mux');
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const configPath = path.join(tmpDir, `launch-${instanceId}.json`);
    let launchArgs: string[] = [];

    if (browser === 'firefox') {
      // Firefox prefs to reduce automation fingerprint
      launchArgs.push('-pref', 'dom.webdriver.enabled=false');
    } else {
      // Chrome/Chromium: disable DBSC so copied cookies stay valid
      launchArgs.push('--disable-features=EnableBoundSessionCredentials');
      // WM_CLASS for window manager routing via Hyprland workspace rules.
      // Routes all instances to workspace 9 so they don't steal focus.
      launchArgs.push('--class=pw-mux');
      // Expose a CDP debugging port so external tools (e.g. Electron webview
      // via DevTools frontend) can connect and show a live view.
      // Port 0 = OS picks a free port; the actual port is logged to stderr.
      launchArgs.push('--remote-debugging-port=0');
      // Allow WebSocket connections from any origin (Electron renderer at
      // localhost:1420 needs to connect for CDP screencast).
      launchArgs.push('--remote-allow-origins=*');
    }

    const config: Record<string, unknown> = {
      browser: {
        launchOptions: {
          // Always launch Chrome in headed mode. "Headless" instances use an Xvfb
          // virtual display (DISPLAY=:N) so Chrome remains invisible without using
          // Chrome's headless flag — same rendering engine, no bot-detection signal.
          headless: false,
          args: launchArgs,
        },
      },
    };

    await fs.promises.writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
    this.configFiles.set(instanceId, configPath);
    return configPath;
  }

  private async copyProfile(instanceId: string, sourceDir: string, browser: string): Promise<string> {
    const isFirefox = browser === 'firefox';
    const profileRoot = path.join(os.tmpdir(), 'pw-mux', `profile-${instanceId}`);

    if (isFirefox) {
      // Firefox: copy the entire profile directory. Firefox stores session
      // state across many files (sessionstore.jsonlz4, cookies.sqlite, storage/,
      // etc.) so cherry-picking is unreliable. Skip cache to keep it fast.
      await fs.promises.cp(sourceDir, profileRoot, {
        recursive: true,
        filter: (src) => {
          const base = path.basename(src);
          // Skip cache dirs (large, not needed) and files that cause version conflicts
          if (base === 'cache2' || base === 'startupCache') return false;
          // compatibility.ini records Firefox version — causes "older version" warning
          if (base === 'compatibility.ini') return false;
          // Lock files from the source profile
          if (base === 'lock' || base === '.parentlock') return false;
          return true;
        },
      });
    } else {
      // Chrome: copy specific auth-relevant files from <userDataDir>/<profileName>/
      const { files, dirs } = getProfileManifest(browser);
      const srcDir = path.join(sourceDir, this.config.profileName);
      const destDir = path.join(profileRoot, 'Default');

      await fs.promises.mkdir(destDir, { recursive: true });

      for (const file of files) {
        const src = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        try {
          await fs.promises.copyFile(src, dest);
        } catch {
          // File may not exist in every profile — skip silently
        }
      }

      for (const dir of dirs) {
        const src = path.join(srcDir, dir);
        const dest = path.join(destDir, dir);
        try {
          await fs.promises.cp(src, dest, { recursive: true });
        } catch {
          // Directory may not exist — skip silently
        }
      }

      // Copy top-level Local State (needed for encrypted cookie decryption)
      try {
        await fs.promises.copyFile(
          path.join(sourceDir, 'Local State'),
          path.join(profileRoot, 'Local State'),
        );
      } catch {
        // May not exist
      }
    }

    this.profileDirs.set(instanceId, profileRoot);
    return profileRoot;
  }

  private async cleanupProfile(instanceId: string): Promise<void> {
    const profileDir = this.profileDirs.get(instanceId);
    if (profileDir) {
      this.profileDirs.delete(instanceId);
      try {
        await fs.promises.rm(profileDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }

    const configFile = this.configFiles.get(instanceId);
    if (configFile) {
      this.configFiles.delete(instanceId);
      await fs.promises.unlink(configFile).catch(() => {});
    }
  }
}
