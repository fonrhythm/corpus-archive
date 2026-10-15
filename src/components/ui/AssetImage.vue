<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useAssetUrl } from '@/composables/useAssetUrl'

const props = defineProps<{ assetId?: string | null; alt?: string | null; caption?: string | null; credit?: string | null; bare?: boolean; zoom?: boolean }>()
const { url, asset, failed } = useAssetUrl(toRef(props, 'assetId'))
const altText = computed(() => props.alt ?? asset.value?.alt_text ?? '')
const cap = computed(() => props.caption ?? asset.value?.caption ?? '')
const credit = computed(() => props.credit ?? asset.value?.credit ?? '')

function open() { if (props.zoom !== false && url.value) window.open(url.value, '_blank', 'noopener,noreferrer') }
</script>

<template>
  <img v-if="bare && url" :src="url" :alt="altText" loading="lazy" style="width: 100%; height: 100%; object-fit: cover">
  <figure v-else-if="!bare" style="margin: 22px 0">
    <button v-if="url" type="button" :aria-label="`放大图片：${altText}`" style="display: block; width: 100%; padding: 0; border: 1px solid var(--rule); background: none; cursor: zoom-in" @click="open">
      <img :src="url" :alt="altText" loading="lazy" style="width: 100%; height: auto">
    </button>
    <p v-else-if="failed" class="hint" role="status">图片暂时无法显示。</p>
    <figcaption v-if="cap || credit" class="hint" style="margin-top: 8px; font-size: 13px">
      {{ cap }}<template v-if="credit"> · 图片来源：{{ credit }}</template>
    </figcaption>
  </figure>
</template>
