# TICKET-009: Unit tests for AIDomBuilder (domExtractor.ts)

## Metadata
| Field | Value |
|-------|-------|
| Status | COMPLETED |
| Priority | P1-High |
| Effort | L (4-8hr) |
| Assignee | Claude |

## Description
Write comprehensive unit tests for the `AIDomBuilderInjection` function. Since this function runs inside a browser context via `page.evaluate()`, tests should use Playwright's test runner to create test pages with known DOM structures, run the builder, and verify the output HTML and iframe refs.

These tests validate every individual behavior of the DOM serializer: noise stripping, ref stamping, class filtering, attribute ordering, shadow DOM traversal, iframe collection, and edge cases.

## Technical Approach
- **Architecture Layer**: Testing
- **Design Patterns**: Page Object pattern (test pages with known DOM)
- **Implementation Strategy**:
  1. Create test file `tests/dom-extractor.spec.ts` in the playwright-mcp test directory
  2. Use the existing test fixture to start an MCP server and connect a client
  3. For each test case, serve a custom HTML page via the test server, navigate to it, then call a tool that triggers DOM extraction and verify the output
  4. Alternatively, for direct unit tests of the builder, use `page.evaluate()` directly in Playwright test context

## Files Affected
- `playwright-mcp/packages/playwright-mcp/tests/dom-extractor.spec.ts` - Create - Unit tests for AIDomBuilder

## Dependencies
- **Prerequisite Tickets**: TICKET-008 (build must pass)
- **External Dependencies**: `@playwright/test`, test server fixtures
- **Potential Blockers**: Test server must be able to serve custom HTML pages

## Acceptance Criteria
- [ ] Tests cover all noise stripping: `<script>`, `<style>`, `<noscript>`, `<template>`, `<link rel="stylesheet">`
- [ ] Tests verify event handler stripping (`onclick`, `onchange`, etc.)
- [ ] Tests verify `style` attribute stripping
- [ ] Tests verify `data-*` attribute stripping
- [ ] Tests verify `_ariaRef` stamping produces `ref="eN"` attribute
- [ ] Tests verify existing `ref` attributes on elements are skipped (Vue prevention)
- [ ] Tests verify CSS class filtering:
  - `class="css-1a2b3c help-text sc-dkPtRN"` -> `class="help-text"`
  - All-generated classes -> no `class` attribute
  - Semantic-only classes -> class preserved as-is
- [ ] Tests verify canonical attribute ordering
- [ ] Tests verify void element handling (no closing tag)
- [ ] Tests verify shadow DOM traversal with comment markers
- [ ] Tests verify iframe ref collection
- [ ] Tests verify SVG noise attribute replacement (`d`, `points` -> `"..."`)
- [ ] Tests verify HTML entity escaping in text and attributes
- [ ] Tests verify hidden elements are preserved (not stripped)
- [ ] Tests verify `<img>` alt text replacement pattern
- [ ] All tests pass with `npx playwright test dom-extractor`
- [ ] 90%+ coverage of domExtractor.ts logic

## Testing Requirements
- **Unit Tests**: This IS the unit test ticket
- **Coverage Target**: 90%+ for domExtractor.ts

## Implementation Notes
Test structure example:

```typescript
test('strips script and style elements', async ({ server, client }) => {
  server.setContent('/test', `
    <body>
      <div id="content">Hello</div>
      <script>alert('noise')</script>
      <style>.foo { color: red; }</style>
    </body>
  `);
  const response = await client.callTool({ name: 'browser_navigate', arguments: { url: server.PREFIX + '/test' } });
  // Read dom.html from disk and verify no <script> or <style>
});

test('filters generated CSS classes', async ({ server, client }) => {
  server.setContent('/test', `
    <body>
      <div class="css-1a2b3c help-text sc-dkPtRN form-group">Content</div>
    </body>
  `);
  // Navigate and verify dom.html has class="help-text form-group"
});
```

For shadow DOM testing, use `customElements.define()` in the test page to create a web component with a shadow root.

For iframe testing, serve an iframe page that loads a child page from the same test server.

Key edge cases to test:
- Empty page (just `<body>`)
- Page with only noise (all scripts/styles)
- Deeply nested elements (10+ levels)
- Elements with many attributes (10+)
- Boolean attributes (`required`, `disabled`, `checked`)
- Elements with no attributes
- Mixed text and element children

## References
- Spec Section: 13 (Test Cases 6, 11, 13, 14, 15, 16)
- Related Tickets: TICKET-003 (implementation), TICKET-010 (pretty-print tests)
