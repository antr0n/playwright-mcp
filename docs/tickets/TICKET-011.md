# TICKET-011: Unit tests for DomState diffing and file I/O (domState.ts)

## Metadata
| Field | Value |
|-------|-------|
| Status | COMPLETED |
| Priority | P1-High |
| Effort | M (1-4hr) |
| Assignee | Claude |

## Description
Write unit tests for the `DomState` class, focusing on the diffing logic, file I/O, diff file naming, workspace resolution, and lifecycle management. These tests verify that diffs are computed correctly, files are written to the expected locations, diff names are formatted properly, and `dispose()` cleans up the state directory.

## Technical Approach
- **Architecture Layer**: Testing
- **Design Patterns**: Test doubles (mock page, mock context)
- **Implementation Strategy**:
  1. Create test file `tests/dom-state.spec.ts` in the playwright-mcp test directory
  2. For file I/O tests, use `testInfo.outputPath()` as the workspace root
  3. For diff tests, call `domState.update()` multiple times with different DOM content and verify diffs
  4. For workspace resolution, test with/without env vars and with/without roots

## Files Affected
- `playwright-mcp/packages/playwright-mcp/tests/dom-state.spec.ts` - Create - Unit tests for DomState

## Dependencies
- **Prerequisite Tickets**: TICKET-008 (build must pass)
- **External Dependencies**: `@playwright/test`, `fs`, test server fixtures
- **Potential Blockers**: None

## Acceptance Criteria
- [ ] Test: first `update()` produces `dom.html` and `accessibility-tree.yaml` but no diff file
- [ ] Test: second `update()` with changed DOM produces a diff file in `diffs/`
- [ ] Test: diff file content is a valid unified diff with `@@` hunks
- [ ] Test: diff file name format is `NNN-action-suffix.diff` (e.g., `001-navigate.diff`, `002-click-e14.diff`)
- [ ] Test: diff counter increments correctly across calls
- [ ] Test: no diff file written when DOM has not changed between calls
- [ ] Test: `formatDiffName` sanitizes special characters in values
- [ ] Test: `formatDiffName` truncates long values (>20 chars)
- [ ] Test: workspace resolution with `PW_DOM_STATE_INSTANCE_ID` + `PW_DOM_STATE_WORKSPACE` env vars
- [ ] Test: workspace resolution with explicit roots (standalone mode)
- [ ] Test: workspace resolution with neither -> returns undefined (DOM state disabled)
- [ ] Test: `dispose()` deletes the `browser-state/` directory
- [ ] Test: `update()` after `dispose()` creates a fresh directory (if called again)
- [ ] Test: 5 sequential actions produce 5 sequential diff files
- [ ] All tests pass

## Testing Requirements
- **Unit Tests**: This IS the unit test ticket
- **Coverage Target**: 85%+ for domState.ts

## Implementation Notes
For testing `_ensureStateDir`, env vars can be set in the test:

```typescript
test('multiplexer mode uses env vars', async ({ page, server }) => {
  process.env.PW_DOM_STATE_INSTANCE_ID = 'test-inst';
  process.env.PW_DOM_STATE_WORKSPACE = testInfo.outputPath('workspace');
  try {
    // create DomState and call update()
    // verify files at workspace/.playwright-mcp/browser-state/test-inst/
  } finally {
    delete process.env.PW_DOM_STATE_INSTANCE_ID;
    delete process.env.PW_DOM_STATE_WORKSPACE;
  }
});
```

For diff content verification, check that the diff contains the expected changed lines. The diff library's `createPatch` output format is standard unified diff.

For testing the full pipeline through MCP, use the existing test fixtures to start a client with roots, navigate to a test page, and verify files on disk.

## References
- Spec Section: 7 (Diff Trail)
- Spec Section: 13, Test Cases 1-5, 9, 17 (navigate, click, fill, diff trail, cleanup)
- Related Tickets: TICKET-005 (implementation), TICKET-009 (extractor tests)
