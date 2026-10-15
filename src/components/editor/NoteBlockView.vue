<script setup lang="ts">
import { NodeViewWrapper, NodeViewContent, nodeViewProps } from '@tiptap/vue-3'
const props = defineProps(nodeViewProps)
const KINDS = [['fact', '语言事实'], ['inference', '情境推断'], ['choice', '译者选择']] as const
const MARK: Record<string, string> = { fact: 'mark-fact', inference: 'mark-inference', choice: 'mark-choice' }
</script>

<template>
  <NodeViewWrapper class="nv" data-drag-handle>
    <div class="nv-head">
      <span style="display: flex; align-items: center; gap: 8px">
        <span class="mark" :class="MARK[String(props.node.attrs.kind)]" style="margin-top: 0" aria-hidden="true"></span>
        <select class="select" style="width: auto; min-height: 36px" aria-label="说明类型" :value="props.node.attrs.kind" @change="props.updateAttributes({ kind: ($event.target as HTMLSelectElement).value })">
          <option v-for="k in KINDS" :key="k[0]" :value="k[0]">{{ k[1] }}</option>
        </select>
      </span>
      <button type="button" class="btn btn-sm btn-ghost" @click="props.deleteNode()">删除区块</button>
    </div>
    <NodeViewContent class="note-block" style="margin: 0" />
  </NodeViewWrapper>
</template>
