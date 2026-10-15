<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useNodeAttrs } from './useNodeAttrs'
import { scriptLang } from '@/lib/text'

const props = defineProps(nodeViewProps)
const a = useNodeAttrs<{ items: { token: string; meaning: string; note: string }[] }>(props)
const add = () => a.items.push({ token: '', meaning: '', note: '' })
const del = (i: number) => a.items.splice(i, 1)
</script>

<template>
  <NodeViewWrapper class="nv" data-drag-handle>
    <div class="nv-head"><span>词语拆解</span><button type="button" class="btn btn-sm btn-ghost" @click="props.deleteNode()">删除区块</button></div>
    <div v-for="(it, i) in a.items" :key="i" class="grid2" style="margin-bottom: 8px; align-items: center">
      <input v-model="it.token" class="input" :lang="scriptLang(it.token)" aria-label="词形" placeholder="词形" style="flex: 1 1 140px">
      <input v-model="it.meaning" class="input" aria-label="词义" placeholder="词义" style="flex: 1 1 180px">
      <input v-model="it.note" class="input" aria-label="说明" placeholder="说明（可选）" style="flex: 1 1 180px">
      <button type="button" class="btn btn-sm btn-ghost" style="flex: 0 0 auto" :aria-label="`删除第 ${i + 1} 行`" @click="del(i)">删除</button>
    </div>
    <button type="button" class="btn btn-sm" @click="add">+ 添加一行</button>
  </NodeViewWrapper>
</template>
