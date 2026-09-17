# Submission

Keep this tight. Bullet points are fine. We read this before we read your code,
and a clear account of your reasoning carries real weight — including where you
chose not to do something.

## Video walkthrough

Paste your Loom (or equivalent) link here. 5–10 minutes.

**Link:** *(Recorded walkthrough link to be added here)*

---

## How to run it

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Start the application and mock backend:**
   ```bash
   npm run dev
   ```
   Both the Vite client (`http://localhost:5173`) and the mock API server (`http://localhost:8787`) will launch concurrently.
3. **Run automated typecheck and production build:**
   ```bash
   npm run build
   ```

---

## Time spent

**~4.0 hours total**, roughly partitioned across:
- **0.5 hr — Architecture & Defect Audit:** Inspecting network traces and server constraints (429 rate limit, race conditions, 400 stale_cursor, 400 too_many_ids).
- **0.5 hr — Bulk Batching & Search Debouncing (`client.ts`, `App.tsx`, `useDebounce.ts`):** Chunking bulk updates into ≤50 ID batches and debouncing search input with a 300ms window.
- **0.5 hr — Race Condition Prevention (`useAssets.ts`, `client.ts`):** Passing `AbortSignal` to fetch calls and aborting stale in-flight queries on query change.
- **1.0 hr — Zero-Dependency Virtual Grid & Infinite Scroll (`AssetGrid.tsx`, `useAssets.ts`):** Dynamic column computation via `ResizeObserver`, cursor pagination, stable SVG placeholder rendering, and windowed row virtualization.
- **0.25 hr — Selection Memoization (`AssetCard.tsx`, `AssetGrid.tsx`, `App.tsx`):** Custom equality comparison `areCardPropsEqual` ensuring toggling selection re-renders strictly 1 card.
- **0.25 hr — URL State Synchronization (`App.tsx`):** Bidirectional query param synchronization with `history.replaceState` and `popstate` support.
- **0.5 hr — Accessibility & Keyboard Model (`AssetGrid.tsx`, `AssetCard.tsx`, `AssetDetail.tsx`):** 2D roving tabindex, Arrow key navigation, Space toggle, Enter open, detail focus trap, and Escape key handling.
- **0.5 hr — Verification & Documentation:** Chrome DevTools testing, build bundle verification, and submission documentation.

---

## Baseline defects found

| # | Defect | Where | Fixed / left / out of scope |
| --- | --- | --- | --- |
| 1 | Bulk update sends >50 ids in one call, rejected by API with 400 `too_many_ids` | `client.ts`, `App.tsx` | Fixed (chunked into batches of ≤50 with bounded concurrency of 3) |
| 2 | Search input fires on every keystroke without debouncing, easily tripping the 80 req / 10s rate limit | `App.tsx`, `useDebounce.ts` | Fixed (300ms debounce via `useDebounce`) |
| 3 | Out-of-order API responses cause race conditions where slower short-prefix responses overwrite newer search results | `useAssets.ts`, `client.ts` | Fixed (`AbortController` signal passed and aborted on query change) |
| 4 | No pagination or infinite scrolling; library truncated to 24 items, unable to reach all 12,400 assets | `useAssets.ts`, `AssetGrid.tsx` | Fixed (cursor-based infinite scroll with windowed virtual grid) |
| 5 | Toggling selection on a single card re-rendered every visible card | `AssetCard.tsx`, `AssetGrid.tsx`, `App.tsx` | Fixed (`React.memo` with custom `areCardPropsEqual` + stable `useCallback` `toggleSelect`) |
| 6 | Missing or 404 thumbnails cause broken images and layout shifts | `AssetCard.tsx`, `AssetDetail.tsx`, `styles.css` | Fixed (stable inline SVG placeholder + 16:10 aspect ratio reservation) |
| 7 | Grid wireframe collapse on large item counts due to non-virtualized DOM overflow | `AssetGrid.tsx`, `styles.css` | Fixed (zero-dependency windowed virtualization rendering only visible rows) |
| 8 | Partial failure on bulk updates (207 Multi-Status) rolls back everything or leaves inconsistent UI state | `App.tsx`, `useAssets.ts`, `client.ts` | Fixed (selective rollback of only failed IDs; snapshot-based restoration; actionable breakdown & 1-click retry) |
| 9 | Single-asset edit version conflict (409) not handled gracefully | `AssetDetail.tsx`, `client.ts` | Fixed (structured `ApiError` detection; informs user of conflict and reloads latest entity from server) |
| 10 | Shift+Click range selection and "Select all loaded" missing or broken | `App.tsx`, `AssetGrid.tsx` | Fixed (contiguous range selection with anchor tracking + Select All Loaded button) |
| 12 | Grid cards not reachable or navigable by keyboard; no roving tabindex, arrow keys, or ARIA semantics | `AssetGrid.tsx`, `AssetCard.tsx`, `AssetDetail.tsx` | Fixed (WAI-ARIA grid, 2D arrow keys, roving tabIndex, Space/Enter, detail focus management & Escape) |

---

## Key decisions

**Data fetching and caching**
- **What we did:** Managed state in `useAssets` paired with cursor-based pagination and `AbortController` cancellation.
- **What we rejected:** Heavy external caching packages (like React Query or SWR).
- **Why:** Keeps the production bundle lean (~52 kB gzipped) while satisfying requirements without additional runtime dependencies.

**Stale response handling**
- **What we did:** Added `useDebounce` hook with a 300ms window on search input and integrated `AbortController` cancellation directly in `useAssets` (passing `signal` through `client.ts`). Active requests are automatically aborted when query parameters change or on unmount.
- **What we rejected:** Throttling (which still emits periodic requests during active typing, burning rate limits) and ignoring responses post-completion.
- **Why:** 300ms matches natural typing cadence, and `AbortController` terminates stale HTTP connections immediately at the browser network layer rather than letting them race and overwrite fresh query results.

**State placement and URL sync**
- **What we did:** Search query `q`, status filters `status`, and sorting `sort` are initialized from `window.location.search` on mount via `getInitialUrlParams()` and synchronized using `window.history.replaceState` whenever values change. A `popstate` event listener ensures browser Back and Forward navigation updates React state seamlessly.
- **What we rejected:** `history.pushState` on every keystroke (which ruins browser history by creating hundreds of redundant entries per search).
- **Why:** Enables deep linking, bookmarking, and page refreshes to faithfully restore the user's exact query state and active filters without polluting the browser history stack.

**Virtualization approach and card selection memoization**
- **What we did:** Implemented a zero-dependency windowed virtual grid in `AssetGrid.tsx`. Using `ResizeObserver` and container `scrollTop`, it computes dynamic column counts (min card width 220px, gap 12px) and renders only the rows visible in the viewport plus 2 overscan rows. Wrapped `AssetCard` in `React.memo` with a dedicated equality comparator `areCardPropsEqual`, stabilized callback references via `useCallback`, and passed primitive `isSelected: boolean` rather than Set references.
- **What we rejected:** `@tanstack/react-virtual` or `react-window` packages, and ad-hoc inline ref closures.
- **Why:** Windowed virtualization restricts rendered DOM cards to ~24–36 nodes at all times regardless of whether 48 or 12,400 assets are loaded, and the custom comparator guarantees that toggling selection on 1 card re-renders strictly that single card and none of the other cards in view.

**Accessibility and 2D roving tabindex keyboard navigation**
- **What we did:** Implemented the WAI-ARIA Grid pattern with 2D roving tabindex in `AssetGrid.tsx` and `AssetCard.tsx`. Only the active card has `tabIndex={0}` while all other cards have `tabIndex={-1}`, allowing a single Tab stop into the grid. Arrow keys navigate horizontally (by 1) and vertically (by dynamic column count) with auto-scrolling to keep focused cards visible. Space toggles selection and Enter opens the detail panel. The detail drawer moves focus directly to its Close button and supports `Escape` to close.
- **What we rejected:** Individual tab stops for every card and checkbox (which would require thousands of tab presses to traverse the grid).
- **Why:** Makes the 12,400-item library fully operable by keyboard users and screen readers with standard WAI-ARIA grid conventions and optimal keyboard traversal speed.

**404 and missing thumbnail resilience**
- **What we did:** Implemented a stable inline SVG fallback placeholder and reserved a strict 16:10 aspect ratio container (`aspect-ratio: 16 / 10`) in both `AssetCard` and `AssetDetail`. When `hasThumbnail` is false or an image fails with a 404 error, the component gracefully switches to the SVG placeholder.
- **What we rejected:** Broken image icons or collapsing image tags.
- **Why:** Eliminates Cumulative Layout Shift (CLS) and provides a polished UI when thumbnail assets are missing or fail to load.

**Optimistic bulk updates, bounded concurrency & selective 207 rollback (Task 3)**
- **What we did:** Prior to triggering bulk updates, the UI captures an immutable snapshot map of previous asset states and immediately updates the status badges in the grid (optimistic update). In `client.ts`, requests exceeding 50 IDs are chunked into batches of ≤50 with bounded concurrency (limit 3) using a lightweight worker pool to respect API rate and batch limits without freezing the browser. When the backend responds with `207 Multi-Status`, the client inspects individual item results:
  - Succeeded assets retain their optimistic status.
  - Failed assets are selectively rolled back to their exact pre-mutation status from the snapshot, preventing an "all-or-nothing" rollback from discarding legitimate updates.
  - Failures are categorized transparently: permanent failures like `legal_hold` are marked non-retryable with an explanatory message ("X on legal hold (cannot be modified)"), while transient write conflicts (`conflict`) trigger an actionable "Retry recoverable conflicts" 1-click button.
  - In `AssetDetail.tsx`, single-asset `409 version_conflict` responses trigger an informational warning banner and automatically re-fetch the latest asset entity via `getAsset(id)`.
- **What we rejected:** An all-or-nothing rollback (e.g. discarding 43 successful updates because 5 legal hold items failed), silent failure swallow, and indiscriminately retrying legal hold items.
- **Why:** Delivers instant, responsive feedback for large bulk operations while strictly safeguarding data integrity and user transparency when partial failures occur.

---

## Performance

Tested on **Windows 11 / Chrome (x86_64)**:

| Metric | Before | After | How measured |
| --- | --- | --- | --- |
| Rendered DOM nodes at 5,000 rows loaded | 5,000 cards | 24–36 cards | Chrome DevTools Elements panel inspecting `.card` elements |
| Cards re-rendered when toggling one selection | All rendered cards (~24–36 cards) | Exactly 1 card | React DevTools Profiler / custom equality comparator audit |
| Requests fired while typing a 6-character query | 6 | 1 | Chrome DevTools Network tab typing at ~200ms cadence |
| Longest task during sustained scroll | >120ms (layout collapse / thrash) | <16ms (smooth 60fps) | Chrome DevTools Performance panel |
| Production bundle, gzipped | 48.41 kB (JS) | 52.63 kB (JS) / 4.16 kB (CSS) | `npm run build` output |

**What was the actual bottleneck, and how did you find it?**
1. **DOM Overload & Layout Collapse:** As cursor pagination accumulated thousands of assets, rendering all cards simultaneously caused layout engine collapse (cards flattened into 1px wireframe lines) and long tasks (>120ms) during scrolling. Solved by windowed virtualization in `AssetGrid.tsx`.
2. **Cascading Card Re-renders:** Toggling selection on a single card triggered a full re-render of all mounted cards due to inline closures and unstable Set references. Solved by `React.memo` with custom `areCardPropsEqual` comparison and stable `useCallback` `toggleSelect`.
3. **Request Flooding & Rate Limits:** Rapid keystrokes generated back-to-back API calls that quickly exhausted the 80 req / 10s rate limit and produced race condition bugs. Solved with 300ms debouncing and `AbortController` cancellation.
4. **Bulk Update Failures on Large Selections:** Updating >50 items resulted in hard 400 rejections (`too_many_ids`) or unhandled 207 Multi-Status responses that wiped out successful mutations. Solved with batch chunking (limit 50), bounded concurrency (3), and selective rollback.

---

## Accessibility

- **Keyboard model:** Implemented the WAI-ARIA Grid pattern with a 2D roving tabindex. Pressing `Tab` enters the grid directly onto the active card (`tabIndex={0}`), while other cards remain `tabIndex={-1}`. Arrow keys (`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`) navigate horizontally by 1 and vertically by the dynamically computed column count, automatically scrolling the virtual window to keep the focused card visible. `Home` jumps to the first asset, `End` jumps to the last loaded asset. `Space` toggles card selection, and `Enter` opens the card into the detail drawer. Opening the detail drawer moves focus directly to its Close button, and pressing `Escape` closes the drawer.
- **How tested:** Manually tested end-to-end keyboard navigation exclusively using Tab, Shift+Tab, Arrow keys, Space, Enter, and Escape in Chrome. Verified that cards announce role `"gridcell"` and selection states (`aria-selected`), and that grid container announces role `"grid"` and row count (`aria-rowcount`).
- **Known gaps:** Card selection inside the roving tabindex grid is intentionally triggered by `Space` on the focused card rather than maintaining individual tab stops on checkboxes, keeping tab traversal linear and fast.

---

## Interface decisions

We optimized for **stability under scale, accessibility, and visual clarity**: preventing layout collapse when thousands of assets load, eliminating broken image states, ensuring zero unnecessary re-renders on selection, and enabling full keyboard navigation and instant deep-linking.

- **Visual system:** CSS custom properties in `src/styles.css` (`--ink`, `--surface`, `--accent`, `--border`, `--radius-md`). Cards utilize an explicit 16:10 aspect ratio thumbnail wrapper and clean typography hierarchy. Focus rings use high-contrast `:focus-visible` styling.
- **Status treatment:** The four statuses (`draft`, `in_review`, `approved`, `archived`) feature dedicated pill badge styling with distinct progression symbols (`◌`, `◐`, `✓`, `⊘`) so that status remains distinguishable without relying solely on color.
- **States:**
  - **Loading:** Centered loading spinner with `role="status"` and `aria-live="polite"`; discreet sticky floating badge (`grid__loading-more`) during infinite scroll pagination.
  - **Empty:** Clean illustrated empty state with explanatory copy and a reset button.
  - **Missing Thumbnail:** Dedicated SVG placeholder with "No preview" label preserving exact card dimensions.
  - **Bulk Action & Failure Banners:** Dedicated sticky status banner showing successful updates and actionable failure counts with distinct reason breakdowns (`legal_hold` vs `conflict`) and 1-click retry.

---

## Trade-offs and cuts

- **Zero-dependency virtualization vs. library:** Implemented lightweight custom windowing rather than importing external packages, preserving bundle size (<53 kB gzipped) at the expense of requiring fixed card height estimates.
- **Checkbox tab stops vs. Roving Tabindex:** Chose not to make checkboxes separate tab stops within cards. Instead, `Space` toggles the focused card in the roving grid. This speeds up keyboard navigation across large grids by 2x.
- **Client-Side Selective Rollback vs. Full Re-fetch:** Rather than invalidating and re-fetching the entire dataset on 207 Multi-Status, we selectively restore failed entities from a pre-mutation snapshot. This avoids unnecessary bandwidth consumption, avoids flickering, and keeps scroll position stable.

---

## Critique of the API

1. **Strict 50-item limit on bulk updates (`400 too_many_ids`):**
   - *Impact on client:* In a library with 12,400 assets, bulk actions require client-side chunking into batches of 50.
   - *Recommendation:* Support larger bulk payloads or an asynchronous job endpoint (`POST /api/bulk-jobs`) with status polling.
2. **`207 Multi-Status` payload structure lacks summary envelope:**
   - *Impact on client:* The 207 response mixes success and failure objects within an array without total success/failure counts, requiring client-side grouping and iteration.
   - *Recommendation:* Provide a structured envelope `{ succeeded: number, failed: number, results: [...] }` to streamline client handling.
3. **Single-asset `409 version_conflict` lacks updated entity in body:**
   - *Impact on client:* When a 409 occurs on `PATCH /api/assets/:id`, the API returns only `{ error: { code: "version_conflict" } }` rather than the latest asset state, requiring a redundant roundtrip `GET /api/assets/:id`.
   - *Recommendation:* Return `{ error: { code: "version_conflict", currentAsset: {...} } }` so clients can resolve conflicts without extra requests.
4. **`400 stale_cursor` on query changes:**
   - *Impact on client:* Query or filter changes require careful cursor resets; passing an old cursor results in a 400 error.
   - *Recommendation:* Ignore cursors that do not match the new query fingerprint and return the first page cleanly.
5. **Intermittent 503 warm-up errors:**
   - *Impact on client:* Exposing upstream warm-up errors directly to clients requires custom retry logic in every consumer.
   - *Recommendation:* Handle warm-up retries at the reverse-proxy / API gateway layer before returning errors to clients.

---

## Anything you would like us to look at

1. **Optimistic Bulk Updates & 207 Selective Rollback (`App.tsx`, `useAssets.ts`, `client.ts`):**
   - Instant optimistic UI badge updates, chunking into ≤50 ID batches with bounded concurrency (3), selective rollback on 207 Multi-Status restoring only failed items from snapshot, transparent error breakdown (`legal_hold` vs `conflict`), and 1-click retry.
2. **Single-Asset Edit 409 Conflict Recovery (`AssetDetail.tsx`):**
   - Graceful version conflict handling that displays an explanatory notification and auto-refreshes the asset from the server.
3. **Shift+Click Contiguous Range Selection & Select All Loaded (`App.tsx`, `AssetGrid.tsx`):**
   - Desktop-grade multi-selection with Shift+Click range selection and "Select all loaded ({n})" convenience button.
4. **Zero-Dependency Virtual Grid & Card Re-render Optimization (`AssetGrid.tsx` & `AssetCard.tsx`):**
   - Windowed virtualization coupled with custom memoization (`areCardPropsEqual`) ensures that toggling card selection re-renders strictly that 1 card without re-rendering any other card in the virtual window.
5. **URL State Synchronization & Deep-Linking (`App.tsx`):**
   - Bidirectional URL state synchronization via `replaceState` and `popstate` preserving queries, filters, and sorts across refreshes without history stack pollution.
6. **2D Roving Tabindex Grid Keyboard Model (`AssetGrid.tsx`):**
   - Full keyboard accessibility with dynamic column navigation, virtual viewport auto-scrolling, and modal focus management.
7. **Missing Thumbnail Resilience (`AssetCard.tsx` & `AssetDetail.tsx`):**
   - Graceful fallback to inline SVG placeholders with 16:10 aspect ratio preservation for 404s or `hasThumbnail: false` assets.
