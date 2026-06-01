<template>
  <div
    class="side-bar-toc"
  >
    <div class="title">
      {{ t('sideBar.toc.title') }}
    </div>
    <el-tree
      v-if="tocData.length"
      ref="tocTreeRef"
      :class="[{ 'side-bar-toc-overflow': !wordWrapInToc, 'side-bar-toc-wordwrap': wordWrapInToc }]"
      :data="tocData"
      :default-expand-all="true"
      :props="defaultProps"
      :expand-on-click-node="false"
      :indent="10"
      :icon="ArrowRight"
      node-key="slug"
      :highlight-current="true"
      @node-click="handleClick"
    />
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import bus from '../../bus'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'
import { computed, ref, watch, nextTick } from 'vue'
import type { ElTree } from 'element-plus'

const { t } = useI18n()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const tocTreeRef = ref<InstanceType<typeof ElTree> | null>(null)

const defaultProps = {
  children: 'children',
  label: 'label'
}

const { toc, activeHeadingSlug } = storeToRefs(editorStore)
const { wordWrapInToc } = storeToRefs(preferencesStore)

// Strip circular `parent` references so el-tree node-key matching works correctly
type PlainNode = { slug: string; label: unknown; lvl: unknown; children: PlainNode[] }
function stripParent(nodes: typeof toc.value): PlainNode[] {
  return nodes.map(({ slug, label, lvl, children }) => ({
    slug: slug as string,
    label,
    lvl,
    children: stripParent(children)
  }))
}
const tocData = computed(() => stripParent(toc.value))

function applyCurrentKey() {
  nextTick(() => {
    tocTreeRef.value?.setCurrentKey(activeHeadingSlug.value || null)
    tocTreeRef.value?.$el?.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' })
  })
}

// Re-apply when slug changes or when tree data is replaced (e.g. new file loaded)
watch(activeHeadingSlug, applyCurrentKey)
watch(tocData, applyCurrentKey)

const handleClick = (data: { slug?: unknown }): void => {
  // editor.vue builds a CSS selector with `#${slug}` — bail out if the
  // node has no slug (e.g. unsluggable headings) to avoid emitting
  // `undefined` / non-string payloads and producing `#undefined` selectors.
  if (typeof data.slug !== 'string' || data.slug.length === 0) return
  bus.emit('scroll-to-header', data.slug)
}
</script>

<style>
.side-bar-toc {
  height: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.side-bar-toc .title {
  flex-shrink: 0;
  color: var(--sideBarTitleColor);
  font-weight: 600;
  font-size: 16px;
  margin: 37px 0 10px 0;
  padding-left: 25px;
}

.side-bar-toc .el-tree-node {
  margin-top: 8px;
}

.side-bar-toc .el-tree {
  flex: 1;
  min-height: 0;
  background: transparent;
  color: var(--sideBarColor);
  --el-color-primary: var(--themeColor);
}

.side-bar-toc .el-tree-node:focus > .el-tree-node__content {
  background-color: var(--sideBarItemHoverBgColor);
}

.side-bar-toc .el-tree-node__content:hover {
  background: var(--sideBarItemHoverBgColor);
}

.side-bar-toc .el-tree-node__label {
  background-color: transparent;
}

.side-bar-toc .el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content {
  background: color-mix(in srgb, var(--themeColor) 15%, transparent);
  font-weight: 600;
  --el-tree-text-color: var(--themeColor);
}

.side-bar-toc .el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content .el-tree-node__label {
  background-color: transparent;
  color: var(--themeColor);
}

.side-bar-toc > li {
  font-size: 14px;
  margin-bottom: 15px;
  cursor: pointer;
}
.side-bar-toc-overflow {
  overflow: auto;
}
.side-bar-toc-wordwrap {
  overflow-x: hidden;
  overflow-y: auto;
}

.side-bar-toc-wordwrap .el-tree-node__content {
  white-space: normal;
  height: auto;
  min-height: 26px;
}
</style>
