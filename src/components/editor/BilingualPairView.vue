<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useNodeAttrs } from './useNodeAttrs'
import { LANGS } from '@/lib/taxonomy'
import { scriptLang } from '@/lib/text'

const props = defineProps(nodeViewProps)
const a = useNodeAttrs<{ source: string; target: string; sourceLang: string; targetLang: string; note: string }>(props)
</script>

<template>
  <NodeViewWrapper class="nv" data-drag-handle>
    <div class="nv-head"><span>原译对照</span><button type="button" class="btn btn-sm btn-ghost" @click="props.deleteNode()">删除区块</button></div>
    <div class="grid2">
      <div class="field">
        <label>原文语言
          <select v-model="a.sourceLang" class="select"><option value="">（自动）</option><option v-for="l in LANGS" :key="l.code" :value="l.code">{{ l.name }}</option></select>
        </label>
        <textarea v-model="a.source" class="textarea" :lang="a.sourceLang || scriptLang(a.source)" aria-label="原文" placeholder="原文"></textarea>
      </div>
      <div class="field">
        <label>译文语言
          <select v-model="a.targetLang" class="select"><option value="">（自动）</option><option v-for="l in LANGS" :key="l.code" :value="l.code">{{ l.name }}</option></select>
        </label>
        <textarea v-model="a.target" class="textarea" aria-label="译文" placeholder="译文"></textarea>
      </div>
    </div>
    <div class="field" style="margin-top: 10px"><input v-model="a.note" class="input" aria-label="备注" placeholder="备注（可选）：语气、取舍、出处位置……"></div>
  </NodeViewWrapper>
</template>
