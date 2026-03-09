# File-Based DOM State -- Backlog

## Overview
Implementation backlog for the file-based DOM state system for the Playwright MCP server. See [spec](specs/file-based-dom-state.md) for full design document.

## Tickets by Dependency Order

### Phase 1: Core Infrastructure (no dependencies, can be parallelized)

| Ticket | Title | Priority | Effort | Status | Assignee |
|--------|-------|----------|--------|--------|----------|
| [TICKET-001](tickets/TICKET-001.md) | Add js-beautify dependency to Playwright package | P0-Critical | S | COMPLETED | Claude |
| [TICKET-003](tickets/TICKET-003.md) | Create domExtractor.ts -- AIDomBuilder browser-side DOM serializer | P0-Critical | L | COMPLETED | Claude |

### Phase 2: Pretty-printer (depends on TICKET-001)

| Ticket | Title | Priority | Effort | Status | Assignee |
|--------|-------|----------|--------|--------|----------|
| [TICKET-002](tickets/TICKET-002.md) | Create domPrettyPrint.ts -- HTML pretty-printer wrapper | P0-Critical | S | COMPLETED | Claude |

### Phase 3: Core Orchestrator (depends on TICKET-002, TICKET-003)

| Ticket | Title | Priority | Effort | Status | Assignee |
|--------|-------|----------|--------|--------|----------|
| [TICKET-005](tickets/TICKET-005.md) | Create domState.ts -- Core DOM state orchestrator | P0-Critical | L | COMPLETED | Claude |

### Phase 4: Wiring (depends on TICKET-005)

| Ticket | Title | Priority | Effort | Status | Assignee |
|--------|-------|----------|--------|--------|----------|
| [TICKET-004](tickets/TICKET-004.md) | Add hasExplicitRoots() to Context and DomState lifecycle management | P0-Critical | M | COMPLETED | Claude |
| [TICKET-006](tickets/TICKET-006.md) | Integrate DOM state into Response._build() and add Browser State section | P0-Critical | M | COMPLETED | Claude |

### Phase 5: Tool Enhancement (depends on TICKET-006)

| Ticket | Title | Priority | Effort | Status | Assignee |
|--------|-------|----------|--------|--------|----------|
| [TICKET-007](tickets/TICKET-007.md) | Add snapshot inclusion to browser_fill_form tool | P1-High | S | COMPLETED | Claude |

### Phase 6: Build Gate (depends on all Phase 1-5)

| Ticket | Title | Priority | Effort | Status | Assignee |
|--------|-------|----------|--------|--------|----------|
| [TICKET-008](tickets/TICKET-008.md) | Build verification and smoke test | P0-Critical | M | COMPLETED | Claude |

### Phase 7: Core Testing (depends on TICKET-008, can be parallelized)

| Ticket | Title | Priority | Effort | Status | Assignee |
|--------|-------|----------|--------|--------|----------|
| [TICKET-009](tickets/TICKET-009.md) | Unit tests for AIDomBuilder (domExtractor.ts) | P1-High | L | COMPLETED | Claude |
| [TICKET-010](tickets/TICKET-010.md) | Unit tests for prettyPrintHtml (domPrettyPrint.ts) | P1-High | M | COMPLETED | Claude |
| [TICKET-011](tickets/TICKET-011.md) | Unit tests for DomState diffing and file I/O (domState.ts) | P1-High | M | COMPLETED | Claude |
| [TICKET-012](tickets/TICKET-012.md) | Integration tests -- end-to-end tool call to file on disk | P1-High | L | COMPLETED | Claude |
| [TICKET-014](tickets/TICKET-014.md) | Integration tests -- iframe stitching and shadow DOM | P1-High | M | COMPLETED | Claude |

### Phase 8: Performance (depends on TICKET-012)

| Ticket | Title | Priority | Effort | Status | Assignee |
|--------|-------|----------|--------|--------|----------|
| [TICKET-013](tickets/TICKET-013.md) | Performance benchmarks -- extraction time, file size, diff quality | P2-Medium | L | COMPLETED | Claude |

### Phase 9: Multiplexer (depends on TICKET-005, independent of phases 6-8)

| Ticket | Title | Priority | Effort | Status | Assignee |
|--------|-------|----------|--------|--------|----------|
| [TICKET-015](tickets/TICKET-015.md) | Multiplexer support -- pass DOM state env vars to child instances | P1-High | M | COMPLETED | Claude |
| [TICKET-016](tickets/TICKET-016.md) | Multiplexer integration tests -- per-instance file isolation | P1-High | M | COMPLETED | Claude |

### Phase 10: Agent & Evaluation (depends on phases 6-8)

| Ticket | Title | Priority | Effort | Status | Assignee |
|--------|-------|----------|--------|--------|----------|
| [TICKET-017](tickets/TICKET-017.md) | Update agent instructions for DOM state file usage | P2-Medium | M | COMPLETED | Claude |
| [TICKET-018](tickets/TICKET-018.md) | AI agent efficiency evaluation -- does DOM state improve task completion? | P2-Medium | XL | COMPLETED | Claude |

## Dependency Graph

```
TICKET-001 (js-beautify dep)
    |
    v
TICKET-002 (domPrettyPrint.ts) ---+
                                   |
TICKET-003 (domExtractor.ts) -----+
                                   |
                                   v
                            TICKET-005 (domState.ts)
                               /        \
                              v          v
                    TICKET-004        TICKET-006 (Response integration)
                    (Context)              |
                        \                  v
                         \          TICKET-007 (form.ts)
                          \              /
                           v            v
                         TICKET-008 (Build gate)
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
         TICKET-009      TICKET-010      TICKET-011
         (extractor      (pretty-print   (domState
          tests)          tests)          tests)
              |               |               |
              +-------+-------+               |
                      |                       |
                      v                       v
                TICKET-012              TICKET-014
                (integration)           (iframe/shadow)
                      |
                      v
                TICKET-013
                (perf benchmarks)

TICKET-005 (domState.ts)
    |
    v
TICKET-015 (multiplexer env vars)
    |
    v
TICKET-016 (multiplexer tests)

TICKET-008 (build gate) + TICKET-017 (agent instructions)
    |
    v
TICKET-018 (AI efficiency evaluation)
```

## Critical Path

The minimum path to a working feature:

1. TICKET-001 + TICKET-003 (parallel)
2. TICKET-002
3. TICKET-005
4. TICKET-004 + TICKET-006 (parallel)
5. TICKET-007
6. TICKET-008

Total critical path effort: S + L + S + L + M + M + S + M = ~18-28 hours

## Effort Summary

| Effort | Count | Tickets |
|--------|-------|---------|
| S (< 1hr) | 3 | 001, 002, 007 |
| M (1-4hr) | 9 | 004, 006, 008, 010, 011, 014, 015, 016, 017 |
| L (4-8hr) | 5 | 003, 005, 009, 012, 013 |
| XL (> 8hr) | 1 | 018 |
| **Total** | **18** | |
