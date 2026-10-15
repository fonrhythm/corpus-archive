<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useSite } from '@/stores/site'
import { saveSetting } from '@/services/api'

const site = useSite()
const FIELDS = [
  ['site_name', '站名', 'input'], ['site_subtitle', '英文副标题', 'input'], ['author_name', '译者署名（页脚与札记默认署名）', 'input'],
  ['about', '「关于这里」第一段', 'textarea'], ['about_2', '「关于这里」第二段', 'textarea'], ['motto', '首页引语', 'input']
] as const
const form = reactive<Record<string, string>>({})
const msg = ref(''); const busy = ref(false)
onMounted(async () => { await site.load(); for (const [k] of FIELDS) form[k] = site.get(k) })

async function save() {
  busy.value = true; msg.value = ''
  try { for (const [k] of FIELDS) await saveSetting(k, form[k] ?? ''); await site.load(true); msg.value = '已保存。' }
  catch (e) { msg.value = e instanceof Error ? e.message : '保存失败' } finally { busy.value = false }
}
</script>

<template>
  <h1 style="font-size: 44px; line-height: 1.3">站点设置</h1>
  <form style="margin-top: 28px; max-width: 720px; display: flex; flex-direction: column; gap: 22px" @submit.prevent="save">
    <div v-for="f in FIELDS" :key="f[0]" class="field">
      <label :for="f[0]">{{ f[1] }}</label>
      <textarea v-if="f[2] === 'textarea'" :id="f[0]" v-model="form[f[0]]" class="textarea"></textarea>
      <input v-else :id="f[0]" v-model="form[f[0]]" class="input">
    </div>
    <div style="display: flex; align-items: center; gap: 16px"><button class="btn btn-ink" type="submit" :disabled="busy">保存设置</button><span class="save-state" role="status">{{ msg }}</span></div>
  </form>
</template>
