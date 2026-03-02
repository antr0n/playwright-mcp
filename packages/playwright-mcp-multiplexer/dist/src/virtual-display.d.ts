/**
 * Manages Xvfb virtual displays for headless browser instances.
 *
 * Each "headless" instance gets its own Xvfb process on a unique display
 * number (:10, :11, ...). Chrome runs in headed mode on that virtual display —
 * same rendering engine as a visible window, invisible to the user.
 */
export declare class VirtualDisplayManager {
    private displays;
    private pending;
    allocate(): Promise<string>;
    release(display: string): Promise<void>;
    releaseAll(): Promise<void>;
    private findFreeNum;
    private spawnXvfb;
    private waitForLock;
}
//# sourceMappingURL=virtual-display.d.ts.map