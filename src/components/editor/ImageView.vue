<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useNodeAttrs } from './useNodeAttrs'
import AssetImage from '@/components/ui/AssetImage.vue'

const props = defineProps(nodeViewProps)
const a = useNodeAttrs<{ assetId: string; alt: string; caption: string; credit: string }>(props)
</script>

<template>
  <NodeViewWrapper class="nv" data-drag-handle>
    <div class="nv-head"><span>图片</span><button type="button" class="btn btn-sm btn-ghost" @click="props.deleteNode()">删除图片</button></div>
    <div style="max-height: 260px; overflow: hidden; border: 1px solid var(--rule); background: #CFCEC8"><AssetImage :asset-id="a.assetId" bare :zoom="false" /></div>
    <div class="grid2" style="margin-top: 10px">
      <div class="field"><label for="img-alt">替代文字（读屏用）</label><input id="img-alt" v-model="a.alt" class="input" placeholder="用一句话描述图片内容"></div>
      <div class="field"><label for="img-cap">图注</label><input id="img-cap" v-model="a.caption" class="input" placeholder="可选"></div>
      <div class="field"><label for="img-cr">来源 / 署名</label><input id="img-cr" v-model="a.credit" class="input" placeholder="可选：截图出处、摄影者"></div>
    </div>
    <p v-if="!a.alt" class="hint" style="margin-top: 6px">没有替代文字时，视障读者无法知道这张图的内容。</p>
  </NodeViewWrapper>
</template>
