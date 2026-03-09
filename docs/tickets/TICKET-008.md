# TICKET-008: Build verification and smoke test

## Metadata
| Field | Value |
|-------|-------|
| Status | COMPLETED |
| Priority | P0-Critical |
| Effort | M (1-4hr) |
| Assignee | Claude |

## Description
After all core implementation tickets (001-007) are complete, verify the full build pipeline works end-to-end. Build the Playwright monorepo, run the existing MCP test suite to ensure no regressions, and perform a manual smoke test of the complete DOM state pipeline: navigate to a page, fill a field, verify files are written to disk.

This ticket acts as a gate -- it must pass before any testing or multiplexer tickets are worked on.

## Technical Approach
- **Architecture Layer**: Infrastructure (build and verification)
- **Design Patterns**: N/A
- **Implementation Strategy**:
  1. Build the Playwright monorepo: `cd playwright && node utils/build/build.js`
  2. Run the existing MCP test suite: `cd playwright-mcp/packages/playwright-mcp && npx playwright test --project=chrome`
  3. Fix any build errors or test regressions
  4. Perform a manual smoke test with a simple MCP client that passes roots

## Files Affected
- No new files -- this is a verification ticket
- May require minor fixes to any files from TICKET-001 through TICKET-007 if build issues are found

## Dependencies
- **Prerequisite Tickets**: TICKET-001, TICKET-002, TICKET-003, TICKET-004, TICKET-005, TICKET-006, TICKET-007
- **External Dependencies**: None
- **Potential Blockers**: Build system changes in the Playwright monorepo

## Acceptance Criteria
- [ ] `node utils/build/build.js` completes without errors in the Playwright root
- [ ] All existing MCP tests pass: `npx playwright test --project=chrome` (no regressions)
- [ ] TypeScript compilation produces no type errors
- [ ] A manual smoke test confirms:
  - Navigate to a page -> `dom.html` and `accessibility-tree.yaml` are written
  - Click a field -> diff file is written to `diffs/`
  - `dom.html` contains `ref` attributes matching the aria tree
  - `dom.html` does not contain `<script>`, `<style>`, or event handler attributes
  - Pretty-printing produces aligned attributes for multi-attribute elements

## Testing Requirements
- **Unit Tests**: Run existing test suite
- **Integration Tests**: Run existing test suite
- **Manual Testing**: Full smoke test as described above
- **Coverage Target**: Existing coverage must not decrease

## Implementation Notes
Build command: `cd /home/electron/projects/explorer-workspace/playwright && node utils/build/build.js`

Test command: `cd /home/electron/projects/explorer-workspace/playwright-mcp/packages/playwright-mcp && npx playwright test --project=chrome`

If there are type errors, check:
1. `diff` import from `playwright-core/lib/utilsBundle` -- verify `createPatch` is on the type
2. `js-beautify` import -- may need `@types/js-beautify` if types are not bundled
3. `DomState` import in `context.ts` and `response.ts` -- verify paths are correct
4. `AIDomBuilderInjection` return type -- verify it matches what `page.evaluate()` expects

## References
- Spec Section: 13 (Build and Test)
- Related Tickets: All of TICKET-001 through TICKET-007
