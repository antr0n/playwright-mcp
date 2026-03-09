# TICKET-016: Multiplexer integration tests -- per-instance file isolation

## Metadata
| Field | Value |
|-------|-------|
| Status | COMPLETED |
| Priority | P1-High |
| Effort | M (1-4hr) |
| Assignee | Unassigned |

## Description
Write integration tests for the multiplexer's DOM state support. These tests verify per-instance file isolation: when multiple browser instances are spawned through the multiplexer, each writes its DOM state files to a separate subdirectory, response paths include the instance ID, and no cross-contamination occurs.

Also test edge cases: no workspace root available (DOM state disabled), instance cleanup on close.

## Technical Approach
- **Architecture Layer**: Testing (integration)
- **Design Patterns**: Multi-instance test setup
- **Implementation Strategy**:
  1. Create test file in the multiplexer test directory or the playwright-mcp test directory
  2. Start a multiplexer MCP server with workspace roots declared
  3. Create two instances via `instance_create`
  4. Navigate each to different pages
  5. Verify separate `dom.html` files exist under `inst-1/` and `inst-2/`
  6. Verify response paths include instance ID

## Files Affected
- `playwright-mcp/packages/playwright-mcp-multiplexer/tests/dom-state-multiplexer.spec.ts` - Create - Multiplexer DOM state tests (or equivalent location)

## Dependencies
- **Prerequisite Tickets**: TICKET-015 (multiplexer env var changes)
- **External Dependencies**: `@playwright/test`, multiplexer test fixtures
- **Potential Blockers**: Multiplexer test infrastructure must support starting with roots

## Acceptance Criteria
- [ ] Test: two instances write to `browser-state/inst-1/` and `browser-state/inst-2/` respectively
- [ ] Test: `dom.html` content differs between instances (different pages)
- [ ] Test: response includes instance-specific file path (e.g., `.playwright-mcp/browser-state/inst-1/dom.html`)
- [ ] Test: closing an instance does not affect the other instance's files
- [ ] Test: no workspace root -> DOM state disabled, no files written, no errors
- [ ] Test: env vars `PW_DOM_STATE_INSTANCE_ID` and `PW_DOM_STATE_WORKSPACE` are passed to child process
- [ ] All tests pass

## Testing Requirements
- **Unit Tests**: N/A
- **Integration Tests**: This IS the integration test ticket
- **Manual Testing**: N/A
- **Coverage Target**: Covers multiplexer code paths in instance-manager.ts

## Implementation Notes
The multiplexer test setup requires spawning the multiplexer MCP server, creating instances, and routing tool calls through them. The existing multiplexer test infrastructure (if any) should be reused.

If no multiplexer test infrastructure exists, the test can spawn the multiplexer as a child process using `StdioClientTransport` similar to how the main playwright-mcp tests work, and use the management tools (`instance_create`, `instance_list`) to create instances.

Verification pattern:
```typescript
test('per-instance file isolation', async ({ multiplexerClient, server }) => {
  // Create two instances
  const inst1 = await multiplexerClient.callTool({
    name: 'instance_create',
    arguments: { headless: true },
  });
  const inst2 = await multiplexerClient.callTool({
    name: 'instance_create',
    arguments: { headless: true },
  });

  // Navigate each to different pages
  server.setContent('/page1', '<body><h1>Page One</h1></body>');
  server.setContent('/page2', '<body><h1>Page Two</h1></body>');

  await multiplexerClient.callTool({
    name: 'browser_navigate',
    arguments: { instanceId: 'inst-1', url: server.PREFIX + '/page1' },
  });
  await multiplexerClient.callTool({
    name: 'browser_navigate',
    arguments: { instanceId: 'inst-2', url: server.PREFIX + '/page2' },
  });

  // Verify separate files
  const dom1 = await fs.promises.readFile(
    path.join(workspaceDir, '.playwright-mcp', 'browser-state', 'inst-1', 'dom.html'), 'utf-8');
  const dom2 = await fs.promises.readFile(
    path.join(workspaceDir, '.playwright-mcp', 'browser-state', 'inst-2', 'dom.html'), 'utf-8');

  expect(dom1).toContain('Page One');
  expect(dom2).toContain('Page Two');
  expect(dom1).not.toContain('Page Two');
});
```

## References
- Spec Section: 8.3 (File Path Resolution -- Multiplexer)
- Spec Section: 13, Test Cases 19-22 (multiplexer tests)
- Related Tickets: TICKET-015 (multiplexer implementation)
