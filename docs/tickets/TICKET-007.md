# TICKET-007: Add snapshot inclusion to browser_fill_form tool

## Metadata
| Field | Value |
|-------|-------|
| Status | COMPLETED |
| Priority | P1-High |
| Effort | S (< 1hr) |
| Assignee | Claude |

## Description
Add `response.setIncludeSnapshot()` to the `browser_fill_form` tool handler so that form fill operations produce both the aria snapshot diff and the DOM state diff. Currently, `browser_fill_form` does not call `setIncludeSnapshot()`, so the response does not include a snapshot section and DOM state is not extracted. This is a one-line change.

Form fills are the most valuable actions to diff -- the AI can see exactly which fields changed values, whether validation errors appeared, and what attributes changed (e.g., `aria-invalid` being added).

## Technical Approach
- **Architecture Layer**: Backend (tool handler)
- **Design Patterns**: N/A (single-line addition)
- **Implementation Strategy**:
  1. In `form.ts`, add `response.setIncludeSnapshot()` at the beginning of the `handle` function, before the field loop

## Files Affected
- `playwright/packages/playwright/src/mcp/browser/tools/form.ts` - Modify - Add `response.setIncludeSnapshot()` call

## Dependencies
- **Prerequisite Tickets**: TICKET-006 (Response integration -- so the snapshot triggers DOM state)
- **External Dependencies**: None
- **Potential Blockers**: None

## Acceptance Criteria
- [ ] `browser_fill_form` response includes a Snapshot section with aria tree
- [ ] `browser_fill_form` response includes a Browser State section with file paths
- [ ] A diff file is generated showing the value changes from the form fill
- [ ] The diff correctly shows individual field value changes (e.g., `value=""` -> `value="John"`)
- [ ] Existing form fill functionality is not affected

## Testing Requirements
- **Unit Tests**: N/A (one-line change)
- **Integration Tests**:
  - Call `browser_fill_form` with multiple fields, verify response includes Snapshot and Browser State sections
  - Verify the diff file shows value changes for all filled fields
- **Manual Testing**: Fill a form, inspect the generated diff
- **Coverage Target**: N/A

## Implementation Notes
The change is a single line added to the `handle` function in `form.ts`:

```typescript
handle: async (tab, params, response) => {
  response.setIncludeSnapshot();  // <-- ADD THIS LINE
  for (const field of params.fields) {
    // ... existing code unchanged ...
  }
},
```

Looking at other tools for the pattern: `navigate.ts`, `click.ts`, `snapshot.ts` all call `response.setIncludeSnapshot()` or `response.setIncludeFullSnapshot()` already. Form was the only major action tool missing this call.

## References
- Spec Section: 12, Q1 (Resolved: browser_fill_form triggers DOM extraction)
- Spec Section: 11 (Performance -- browser_fill_form now included in DOM extraction)
- Related Tickets: TICKET-006 (Response integration)
