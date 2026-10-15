<script setup lang="ts">
defineProps<{ page: number; pageSize: number; total: number }>()
const emit = defineEmits<{ (e: 'go', p: number): void }>()
</script>

<template>
  <nav v-if="total > pageSize" class="pager" aria-label="分页">
    <button class="btn btn-ghost" type="button" :disabled="page <= 1" @click="emit('go', page - 1)">← 上一页</button>
    <span class="lat" style="font-size: 16px; letter-spacing: .04em">{{ page }} / {{ Math.max(1, Math.ceil(total / pageSize)) }}</span>
    <button class="btn btn-ghost" type="button" :disabled="page >= Math.ceil(total / pageSize)" @click="emit('go', page + 1)">下一页 →</button>
  </nav>
</template>
