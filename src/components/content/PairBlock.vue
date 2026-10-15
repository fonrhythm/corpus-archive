<script setup lang="ts">
import { ref } from 'vue'
import { copyText, scriptLang } from '@/lib/text'
import { langName } from '@/lib/taxonomy'

const props = defineProps<{ source?: string; target?: string; sourceLang?: string; targetLang?: string; note?: string }>()
const done = ref('')
async function copy(which: 'source' | 'target') {
  if (await copyText((which === 'source' ? props.source : props.target) ?? '')) {
    done.value = which; setTimeout(() => (done.value = ''), 1500)
  }
}
</script>

<template>
  <div class="pair">
    <div>
      <div class="lab" style="display: flex; justify-content: space-between; align-items: center">
        <span>原文 · {{ sourceLang ? langName(sourceLang) : '' }}</span>
        <button type="button" class="linkbtn" style="color: var(--ink-soft); min-width: 44px" @click="copy('source')">{{ done === 'source' ? '已复制' : '复制' }}</button>
      </div>
      <p class="t" :lang="sourceLang || scriptLang(source)">{{ source }}</p>
    </div>
    <div>
      <div class="lab" style="display: flex; justify-content: space-between; align-items: center">
        <span>译文 · {{ targetLang ? langName(targetLang) : '' }}</span>
        <button type="button" class="linkbtn" style="color: var(--ink-soft); min-width: 44px" @click="copy('target')">{{ done === 'target' ? '已复制' : '复制' }}</button>
      </div>
      <p class="t tgt" :lang="targetLang || undefined">{{ target }}</p>
    </div>
    <p v-if="note" class="hint" style="flex-basis: 100%; padding: 0 0 14px; font-size: 14px">{{ note }}</p>
  </div>
</template>
