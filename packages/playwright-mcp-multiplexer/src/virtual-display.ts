import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';

const DISPLAY_RANGE_START = 10;
const DISPLAY_RANGE_END = 99;

/**
 * Manages Xvfb virtual displays for headless browser instances.
 *
 * Each "headless" instance gets its own Xvfb process on a unique display
 * number (:10, :11, ...). Chrome runs in headed mode on that virtual display —
 * same rendering engine as a visible window, invisible to the user.
 */
export class VirtualDisplayManager {
  private displays = new Map<number, ChildProcess>(); // displayNum → Xvfb process
  private pending = new Set<number>(); // display nums being spawned (not yet in displays)

  async allocate(): Promise<string> {
    const num = this.findFreeNum();
    this.pending.add(num);
    try {
      await this.spawnXvfb(num);
      return `:${num}`;
    } finally {
      this.pending.delete(num);
    }
  }

  async release(display: string): Promise<void> {
    const num = parseInt(display.slice(1), 10);
    const proc = this.displays.get(num);
    if (!proc) return;

    this.displays.delete(num);

    // Wait for Xvfb to exit (it removes the lock file on exit).
    // Give it 3 seconds; kill -9 if it doesn't cooperate.
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 3000);

      proc.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      proc.kill('SIGTERM');
    });
  }

  async releaseAll(): Promise<void> {
    const nums = [...this.displays.keys()];
    const results = await Promise.allSettled(nums.map(n => this.release(`:${n}`)));
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        process.stderr.write(`Failed to release virtual display :${nums[i]}: ${result.reason}\n`);
      }
    }
  }

  private findFreeNum(): number {
    for (let n = DISPLAY_RANGE_START; n <= DISPLAY_RANGE_END; n++) {
      if (this.displays.has(n)) continue;
      if (this.pending.has(n)) continue;
      if (fs.existsSync(`/tmp/.X${n}-lock`)) continue;
      return n;
    }
    throw new Error('No free virtual display slots available (:10–:99 all occupied by this process or system-wide lock files)');
  }

  private spawnXvfb(num: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) { settled = true; fn(); }
      };

      const proc = spawn('Xvfb', [`:${num}`, '-screen', '0', '1920x1080x24', '-ac'], {
        stdio: 'ignore',
        detached: false,
      });

      proc.on('error', (err) => settle(() => reject(err)));

      proc.on('exit', (code) => {
        settle(() => reject(new Error(`Xvfb :${num} exited before ready (code ${code})`)));
      });

      // The X lock file at /tmp/.X<N>-lock is the standard signal that the server is up
      this.waitForLock(num, 5000)
        .then(() => {
          // Re-check liveness: Xvfb may have exited between lock creation and now
          if (proc.exitCode !== null) {
            settle(() => reject(new Error(`Xvfb :${num} exited after creating lock (code ${proc.exitCode})`)));
          } else {
            settle(() => { this.displays.set(num, proc); resolve(); });
          }
        })
        .catch(err => {
          proc.kill();
          settle(() => reject(err));
        });
    });
  }

  private async waitForLock(num: number, timeoutMs: number): Promise<void> {
    const lockFile = `/tmp/.X${num}-lock`;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await fs.promises.access(lockFile);
        return; // lock file exists — Xvfb is ready
      } catch {
        await new Promise(r => setTimeout(r, 50));
      }
    }
    throw new Error(`Xvfb :${num} did not start within ${timeoutMs}ms`);
  }
}
