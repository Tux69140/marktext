# TOC Sidebar Improvements

Related issue: https://github.com/marktext/marktext/issues/2421

## Problems

| Issue | Root cause |
|---|---|
| TOC always scrolls to top | No `scrollIntoView()` on active node; `el-tree` doesn't auto-scroll |
| No current chapter highlight | No `node-key` + `current-node-key` on `el-tree`; no active slug tracked in store |
| Can't keyboard-navigate sidebar | `el-tree` supports keyboard nav but the container has no `tabindex` |
| Doesn't remember expand/collapse | `default-expand-all` is hardcoded; no expand state persisted |
| Doesn't auto-collapse in TOC mode | No logic to collapse when switching to the TOC panel |

## Code audit

**`toc.vue`** — the entire TOC sidebar is an `el-tree` with:
- `default-expand-all="true"` — always fully expanded, no collapse state
- No `ref`, so `setCurrentKey()` / `scrollIntoView()` can't be called
- No `node-key`, so Element Plus can't track which node is "current"
- Click → `bus.emit('scroll-to-header', slug)` → `scrollToElement('#slug')` in `editor.vue`

**`editor.vue`** — the muya `scroll` event fires with `{ scrollTop: number }` only. It calls `editorStore.updateScrollPosition()`. There is no logic mapping scroll position back to a heading slug, so the TOC has no awareness of the current reading position.

**`store/editor.ts`** — `toc` is a tree of `{ slug, label, lvl, children }` nodes; `listToc` is the flat list. Both are updated on content change. No `activeSlug` state exists.

**`muyajs/lib/index.js`** — the scroll event only emits `scrollTop`. There is no "current heading" event from the engine.

## Design

### 1. Active heading detection

On the muya `scroll` event in `editor.vue`, after debounce, query all heading anchor elements inside the editor container and find the last one whose bounding rect top is ≤ a threshold (e.g. 30 % of viewport height). Emit `active-heading-changed` with its `id` attribute (which equals the slug).

```
scroll (debounced) →
  query all elements with [id] that match a slug in listToc →
  find last element where getBoundingClientRect().top ≤ threshold →
  bus.emit('active-heading-changed', slug)
```

`listToc` already contains all slugs, so the match is O(n) with a small n.

### 2. Store changes (`store/editor.ts`)

Add one field to state:

```ts
activeHeadingSlug: string   // slug of the heading currently in view
```

Add one action:

```ts
SET_ACTIVE_HEADING(slug: string): void
```

### 3. TOC component changes (`toc.vue`)

```diff
 <el-tree
+  ref="tocTree"
+  node-key="slug"
+  :current-node-key="activeSlug"
+  :default-expanded-keys="expandedKeys"
-  :default-expand-all="true"
+  @node-expand="onExpand"
+  @node-collapse="onCollapse"
   ...
 />

+<div tabindex="0" @keydown="onKeyDown">   ← wraps el-tree for keyboard focus
```

On `activeSlug` change (watch):
1. Call `tocTree.value?.setCurrentKey(slug)` to highlight the node.
2. Call `tocTree.value?.scrollIntoView(slug)` to scroll the sidebar to it.

**CSS notes (discovered during implementation):**
- The `toc` store data contains circular `parent` references on each `TreeNode`. These must be stripped before passing to `el-tree`, otherwise `node-key` / `current-node-key` matching silently fails. Use a `computed` that maps to plain `{ slug, label, lvl, children }` objects.
- Element Plus sets `color` on `.el-tree` via `--el-tree-text-color: var(--el-text-color-regular)` which inherits into all labels. Override `--el-tree-text-color` on the `is-current` content element, not `color` directly.
- Element Plus's `is-current` background rule is `.el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content`. Your override must include `.el-tree--highlight-current` to win the specificity battle.
- `.el-tree-node__label` gets `background-color: var(--el-color-primary); color: #fff` when drop-target — reset `background-color: transparent` globally on `.side-bar-toc .el-tree-node__label` to prevent bleed.
- Use `color-mix(in srgb, var(--themeColor) 15%, transparent)` for the active background tint. Electron's Chromium supports `color-mix` fully.

### 4. Expand/collapse persistence (`store/layout.ts`)

Add to layout state:

```ts
tocExpandedKeys: string[]   // slugs of expanded nodes
```

Persist via the existing `bufferedState` mechanism (already used for sidebar width, `rightColumn`, etc.).

Initialize `expandedKeys` in `toc.vue` from the store on mount. On `@node-expand` / `@node-collapse`, update the store.

### 5. Auto-collapse on TOC panel activation

In `index.vue`, watch `rightColumn`. When it changes to `'toc'`:
- If `tocExpandedKeys` is empty (first open), expand only the ancestors of the active heading.
- Otherwise, restore the persisted state (handled automatically by `:default-expanded-keys`).

Optionally expose a `collapseAll()` method on `toc.vue` via `defineExpose` for explicit collapse from the parent.

### 6. Keyboard navigation

`el-tree` handles `↑` `↓` `←` `→` `Enter` natively when focused. The only required change is `tabindex="0"` on the wrapper and auto-focusing the tree when the TOC panel is opened (watch `rightColumn === 'toc'` → `nextTick(() => tocWrapper.focus())`).

## Files to change

| File | Change |
|---|---|
| `src/renderer/src/components/sideBar/toc.vue` | `node-key`, `current-node-key`, controlled expand keys, `tabindex`, scroll-into-view watch, keyboard focus |
| `src/renderer/src/components/editorWithTabs/editor.vue` | On scroll, compute active heading slug and emit `active-heading-changed` |
| `src/renderer/src/store/editor.ts` | Add `activeHeadingSlug` state + `SET_ACTIVE_HEADING` action |
| `src/renderer/src/store/layout.ts` | Add `tocExpandedKeys: string[]` to persisted state |

Estimated ~80–120 lines of new/changed code. No new dependencies — Element Plus `el-tree` already supports all required APIs.

## Testing

**Unit (Vitest)** — test the "find active heading from scrollTop" helper as a pure function: given a list of `{ slug, top }` positions and a threshold, assert the correct slug is returned. Lives in `packages/desktop/test/unit/`.

**E2E (Playwright)** — open a markdown file with multiple headings, scroll to a known position, assert the correct TOC node has the `.is-current` CSS class, and assert the sidebar has scrolled it into view. Lives in `packages/desktop/test/e2e/`.

Run tests:
```bash
pnpm test          # unit
pnpm test:e2e      # Playwright
```
