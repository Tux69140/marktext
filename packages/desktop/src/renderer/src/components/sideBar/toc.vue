<template>
  <div
    class="side-bar-toc"
    :class="[{ 'side-bar-toc-overflow': !wordWrapInToc, 'side-bar-toc-wordwrap': wordWrapInToc }]"
  >
    <div class="title">
      {{ t('sideBar.toc.title') }}
    </div>
    <el-tree
      v-if="toc.length"
      :key="tocTreeKey"
      :data="toc"
      node-key="foldKey"
      :default-expanded-keys="tocExpandedKeys"
      :props="defaultProps"
      :auto-expand-parent="false"
      :expand-on-click-node="false"
      :indent="10"
      :icon="ArrowRight"
      @node-click="handleClick"
      @node-expand="handleNodeExpand"
      @node-collapse="handleNodeCollapse"
    />
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import bus from '../../bus'
import type { TreeNode } from '@/util/listToTree'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'

const { t } = useI18n()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const defaultProps = {
  children: 'children',
  label: 'label'
}

const { currentFile, toc } = storeToRefs(editorStore)
const { wordWrapInToc } = storeToRefs(preferencesStore)

const getTocFoldKeys = (nodes: TreeNode[]): string[] => {
  return nodes.flatMap((node) => {
    const foldKey = typeof node.foldKey === 'string' ? [node.foldKey] : []
    return foldKey.concat(getTocFoldKeys(node.children))
  })
}

const tocExpandedKeys = computed(() => {
  const collapsedKeys = new Set(currentFile.value?.tocCollapsedKeys ?? [])
  return getTocFoldKeys(toc.value).filter((key) => !collapsedKeys.has(key))
})

const tocTreeKey = computed(() => {
  return `${currentFile.value?.id ?? ''}:${tocExpandedKeys.value.join(',')}`
})

const handleClick = (data: { slug?: unknown }): void => {
  // editor.vue builds a CSS selector with `#${slug}` — bail out if the
  // node has no slug (e.g. unsluggable headings) to avoid emitting
  // `undefined` / non-string payloads and producing `#undefined` selectors.
  if (typeof data.slug !== 'string' || data.slug.length === 0) return
  bus.emit('scroll-to-header', data.slug)
}

const updateCollapsedKeys = (foldKey: unknown, collapsed: boolean) => {
  if (!currentFile.value || typeof foldKey !== 'string') return

  const collapsedKeys = new Set(currentFile.value.tocCollapsedKeys)
  if (collapsed) {
    collapsedKeys.add(foldKey)
  } else {
    collapsedKeys.delete(foldKey)
  }
  editorStore.updateTocCollapsedKeys(currentFile.value.id, Array.from(collapsedKeys))
}

const handleNodeExpand = (data: { foldKey?: unknown }): void => {
  updateCollapsedKeys(data.foldKey, false)
}

const handleNodeCollapse = (data: { foldKey?: unknown }): void => {
  updateCollapsedKeys(data.foldKey, true)
}
</script>

<style>
.side-bar-toc {
  height: calc(100% - 35px);
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.side-bar-toc .title {
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
  background: transparent;
  color: var(--sideBarColor);
}

.side-bar-toc .el-tree-node:focus > .el-tree-node__content {
  background-color: var(--sideBarItemHoverBgColor);
}

.side-bar-toc .el-tree-node__content:hover {
  background: var(--sideBarItemHoverBgColor);
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
