<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useNodeAttrs } from './useNodeAttrs'
import { scriptLang } from '@/lib/text'

const props = defineProps(nodeViewProps)
const a = useNodeAttrs<{ text: string; from: string }>(props)
</script>

<template>
  <NodeViewWrapper class="nv" data-drag-handle>
    <div class="nv-head"><span>来源引文</span><button type="button" class="btn btn-sm btn-ghost" @click="props.deleteNode()">删除区块</button></div>
    <textarea v-model="a.text" class="textarea" :lang="scriptLang(a.text)" aria-label="引文原文" placeholder="引文原文（请注意版权，只引必要的部分）"></textarea>
    <input v-model="a.from" class="input" style="margin-top: 8px" aria-label="出处" placeholder="出处：作品 / 集数 / 时间点">
  </NodeViewWrapper>
</template>
