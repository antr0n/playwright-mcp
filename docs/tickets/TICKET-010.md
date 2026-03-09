# TICKET-010: Unit tests for prettyPrintHtml (domPrettyPrint.ts)

## Metadata
| Field | Value |
|-------|-------|
| Status | COMPLETED |
| Priority | P1-High |
| Effort | M (1-4hr) |
| Assignee | Claude |

## Description
Write unit tests for the `prettyPrintHtml()` function from `domPrettyPrint.ts`. These tests verify that the HTML formatter produces deterministic, diff-friendly output: simple elements stay on one line, multi-attribute elements get force-aligned wrapping, indentation is consistent, and void elements have no closing tags.

The critical property to test is **diff quality** -- when a single attribute value changes, the pretty-printed output should differ in exactly one line.

## Technical Approach
- **Architecture Layer**: Testing
- **Design Patterns**: Property-based testing (determinism), snapshot comparison
- **Implementation Strategy**:
  1. Create test file `tests/dom-pretty-print.spec.ts` in the playwright-mcp test directory
  2. Import `prettyPrintHtml` directly (it is a pure function with no browser dependencies)
  3. Test each formatting rule with known input/output pairs
  4. Test the diff-quality property: format HTML, change one value, format again, diff should be one line

## Files Affected
- `playwright-mcp/packages/playwright-mcp/tests/dom-pretty-print.spec.ts` - Create - Unit tests for pretty-printer

## Dependencies
- **Prerequisite Tickets**: TICKET-008 (build must pass)
- **External Dependencies**: `@playwright/test` (test runner)
- **Potential Blockers**: Import path for `prettyPrintHtml` from the built Playwright package

## Acceptance Criteria
- [ ] Test: simple element with 1-2 attributes stays on one line
- [ ] Test: element with 3+ attributes gets force-aligned wrapping
- [ ] Test: nested elements use 2-space indentation
- [ ] Test: void elements (`<input>`, `<br>`, `<img>`) have no closing tag
- [ ] Test: `<pre>` and `<code>` content is not reformatted
- [ ] Test: output is deterministic (same input -> same output, multiple runs)
- [ ] Test: output ends with newline
- [ ] Test: single attribute value change produces a one-line diff
  ```
  Format HTML with value=""
  Format same HTML with value="John"
  Diff -> only one line changed
  ```
- [ ] Test: attribute alignment is preserved after value changes (no cascading reformatting)
- [ ] All tests pass

## Testing Requirements
- **Unit Tests**: This IS the unit test ticket
- **Coverage Target**: 100% of prettyPrintHtml.ts

## Implementation Notes
`prettyPrintHtml` is a pure function -- it takes a string and returns a string. Tests can run without any browser or MCP infrastructure.

Example test for diff quality:

```typescript
import { prettyPrintHtml } from '../path/to/domPrettyPrint';
import { createPatch } from 'diff';

test('single value change produces one-line diff', () => {
  const before = prettyPrintHtml('<input id="name" type="text" name="firstName" required value="" ref="e14">');
  const after = prettyPrintHtml('<input id="name" type="text" name="firstName" required value="John" ref="e14">');

  const patch = createPatch('dom.html', before, after, undefined, undefined, { context: 0 });
  const changedLines = patch.split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).filter(l => !l.startsWith('+++') && !l.startsWith('---'));
  expect(changedLines).toHaveLength(2); // one removed, one added
  expect(changedLines[0]).toContain('value=""');
  expect(changedLines[1]).toContain('value="John"');
});
```

## References
- Spec Section: 5.5 (Pretty-Printing Rules)
- Spec Section: 13, Test Case 7 (Pretty-printing verification)
- Related Tickets: TICKET-002 (implementation), TICKET-009 (extractor tests)
