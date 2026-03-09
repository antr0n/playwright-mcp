# TICKET-004: Add hasExplicitRoots() to Context and DomState lifecycle management

## Metadata
| Field | Value |
|-------|-------|
| Status | COMPLETED |
| Priority | P0-Critical |
| Effort | M (1-4hr) |
| Assignee | Claude |

## Description
Modify `context.ts` to add the `hasExplicitRoots()` method and create a `DomState` instance owned by `Context`. The `DomState` is created in the `Context` constructor and disposed during `Context.dispose()`, which deletes the `.playwright-mcp/browser-state/` directory on shutdown. This ticket also modifies `browserServerBackend.ts` to pass the `DomState` to `Response` instances.

`hasExplicitRoots()` checks whether the MCP client declared workspace roots during initialization. This is the gating mechanism for standalone mode -- if the client did not declare roots, DOM state is disabled to avoid creating files in an unknown `cwd`. The existing `firstRootPath()` always returns a value (falls back to `process.cwd()` via `allRootPaths`), but `hasExplicitRoots()` performs the stricter check.

## Technical Approach
- **Architecture Layer**: Backend (context management)
- **Design Patterns**: Ownership/lifecycle management
- **Implementation Strategy**:
  1. Add `hasExplicitRoots(): boolean` method to `Context` that checks `this._clientInfo.roots.length > 0`
  2. Import `DomState` and add `readonly domState: DomState` field to `Context`
  3. Instantiate `DomState` in the `Context` constructor
  4. Call `await this.domState.dispose()` in `Context.dispose()`
  5. In `browserServerBackend.ts`, call `response.setDomState(context.domState)` in `callTool()` after creating the `Response`

## Files Affected
- `playwright/packages/playwright/src/mcp/browser/context.ts` - Modify - Add `hasExplicitRoots()`, `domState` field, dispose integration
- `playwright/packages/playwright/src/mcp/browser/browserServerBackend.ts` - Modify - Pass `domState` to `Response`

## Dependencies
- **Prerequisite Tickets**: TICKET-005 (domState.ts must exist to import)
- **External Dependencies**: None
- **Potential Blockers**: The `DomState` class must be importable; this ticket depends on TICKET-005 creating it

## Acceptance Criteria
- [ ] `context.hasExplicitRoots()` returns `true` when the client provided roots during initialization
- [ ] `context.hasExplicitRoots()` returns `false` when the client provided no roots
- [ ] `context.domState` is a `DomState` instance available immediately after construction
- [ ] `Context.dispose()` calls `domState.dispose()` which deletes `.playwright-mcp/browser-state/`
- [ ] `browserServerBackend.ts` passes `context.domState` to each `Response` via `response.setDomState()`
- [ ] The Playwright build completes successfully

## Testing Requirements
- **Unit Tests**:
  - Test `hasExplicitRoots()` with empty roots array -> false
  - Test `hasExplicitRoots()` with populated roots array -> true
  - Test `dispose()` calls `domState.dispose()`
- **Integration Tests**: Create MCP client with and without roots, verify DOM state behavior
- **Manual Testing**: N/A
- **Coverage Target**: 80%

## Implementation Notes
The `_clientInfo.roots` array comes from the MCP client's `initialize` request. If the client declares `capabilities: { roots: {} }`, the server sends a `roots/list` request and populates the array. If the client does not declare root capabilities, the array is empty.

The `allRootPaths()` function (used by `firstRootPath()`) falls back to `process.cwd()` when roots is empty:
```typescript
if (paths.length === 0)
  paths.push(process.cwd());
```

This is why `hasExplicitRoots()` is needed -- it distinguishes "client declared roots" from "fallback to cwd". DOM state should only activate when the client explicitly told us where to write files.

Changes to `browserServerBackend.ts` are minimal -- one line after the `Response` constructor:
```typescript
const response = new Response(context, name, parsedArguments, cwd);
response.setDomState(context.domState);  // <-- NEW
```

## References
- Spec Section: 8.4 (context.ts, browserServerBackend.ts modifications)
- Related Tickets: TICKET-005 (DomState class), TICKET-006 (Response integration)
