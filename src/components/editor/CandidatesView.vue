<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useNodeAttrs } from './useNodeAttrs'

const props = defineProps(nodeViewProps)
const a = useNodeAttrs<{ items: { text: string; note: string; chosen: boolean }[] }>(props)
const add = () => a.items.push({ text: '', note: '', chosen: false })
const del = (i: number) => a.items.splice(i, 1)
function choose(i: number) { a.items.forEach((it, k) => (it.chosen = k === i ? !it.chosen : false)) }
</script>

<template>
  <NodeViewWrapper class="nv" data-drag-handle>
    <div class="nv-head"><span>候选译法</span><button type="button" class="btn btn-sm btn-ghost" @click="props.deleteNode()">删除区块</button></div>
    <div v-for="(it, i) in a.items" :key="i" class="grid2" style="margin-bottom: 8px; align-items: center">
      <input v-model="it.text" class="input" :aria-label="`候选 ${i + 1} 译名`" placeholder="译名" style="flex: 1 1 180px">
      <input v-model="it.note" class="input" :aria-label="`候选 ${i + 1} 取舍`" placeholder="取舍（可选）" style="flex: 1 1 220px">
      <button type="button" class="btn btn-sm" :class="{ 'btn-accent': it.chosen }" style="flex: 0 0 auto" :aria-pressed="it.chosen" @click="choose(i)">{{ it.chosen ? '最终' : '设为最终' }}</button>
      <button type="button" class="btn btn-sm btn-ghost" style="flex: 0 0 auto" :aria-label="`删除候选 ${i + 1}`" @click="del(i)">删除</button>
    </div>
    <button type="button" class="btn btn-sm" @click="add">+ 添加候选</button>
  </NodeViewWrapper>
</template>
