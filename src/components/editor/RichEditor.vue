<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { editorExtensions } from './extensions'
import { uploadImage, UploadError } from '@/services/assets'
import { safeUrl } from '@/lib/text'
import type { DocNode } from '@/lib/types'

const props = defineProps<{ modelValue: DocNode; publicContext?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: DocNode): void }>()

let last = JSON.stringify(props.modelValue)
const editor = useEditor({
  extensions: editorExtensions(),
  content: props.modelValue as never,
  editorProps: { attributes: { 'aria-label': '正文编辑区', role: 'textbox', 'aria-multiline': 'true' } },
  onUpdate: ({ editor }) => {
    const json = editor.getJSON() as DocNode
    last = JSON.stringify(json)
    emit('update:modelValue', json)
  }
})

watch(() => props.modelValue, (v) => {
  const s = JSON.stringify(v)
  if (s !== last && editor.value) { last = s; editor.value.commands.setContent(v as never, false) }
}, { deep: true })
onBeforeUnmount(() => editor.value?.destroy())

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const err = ref('')

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f || !editor.value) return
  err.value = ''; uploading.value = true
  try {
    // 公开条目的图片放公开桶；草稿 / 私密条目的图片放私有桶，发布时再转为公开。
    const a = await uploadImage(f, props.publicContext ? 'public' : 'private')
    editor.value.chain().focus().insertContent({ type: 'image', attrs: { assetId: a.id, alt: '', caption: '', credit: '' } }).run()
  } catch (x) { err.value = x instanceof UploadError || x instanceof Error ? x.message : '上传失败' } finally { uploading.value = false }
}

function setLink() {
  const ed = editor.value; if (!ed) return
  const prev = ed.getAttributes('link').href as string | undefined
  const input = window.prompt('链接地址（只支持 http、https、mailto；留空则取消链接）', prev ?? 'https://')
  if (input === null) return
  if (input.trim() === '') { ed.chain().focus().extendMarkRange('link').unsetLink().run(); return }
  const href = safeUrl(input)
  if (!href) { err.value = '链接必须以 http://、https:// 或 mailto: 开头。'; return }
  err.value = ''
  ed.chain().focus().extendMarkRange('link').setLink({ href }).run()
}

const ins = (node: Record<string, unknown>) => editor.value?.chain().focus().insertContent(node).run()
const insertNote = (kind: string) => ins({ type: 'noteBlock', attrs: { kind }, content: [{ type: 'paragraph' }] })
const on = (name: string, attrs?: Record<string, unknown>) => !!editor.value?.isActive(name, attrs)
</script>

<template>
  <div v-if="editor">
    <div class="tbar" role="toolbar" aria-label="正文工具栏">
      <div class="grp">
        <button type="button" class="tb" :class="{ on: on('heading', { level: 2 }) }" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">大标题</button>
        <button type="button" class="tb" :class="{ on: on('heading', { level: 3 }) }" @click="editor.chain().focus().toggleHeading({ level: 3 }).run()">小标题</button>
        <button type="button" class="tb" :class="{ on: on('bold') }" aria-label="加粗" @click="editor.chain().focus().toggleBold().run()"><b>B</b></button>
        <button type="button" class="tb" :class="{ on: on('italic') }" aria-label="斜体" @click="editor.chain().focus().toggleItalic().run()"><i>I</i></button>
        <button type="button" class="tb" :class="{ on: on('code') }" @click="editor.chain().focus().toggleCode().run()">代码</button>
        <button type="button" class="tb" :class="{ on: on('link') }" @click="setLink">链接</button>
      </div>
      <div class="grp">
        <button type="button" class="tb" :class="{ on: on('bulletList') }" @click="editor.chain().focus().toggleBulletList().run()">列表</button>
        <button type="button" class="tb" :class="{ on: on('orderedList') }" @click="editor.chain().focus().toggleOrderedList().run()">编号</button>
        <button type="button" class="tb" :class="{ on: on('blockquote') }" @click="editor.chain().focus().toggleBlockquote().run()">引用</button>
        <button type="button" class="tb" @click="editor.chain().focus().setHorizontalRule().run()">分隔线</button>
      </div>
      <div class="grp">
        <button type="button" class="tb" @click="editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()">表格</button>
        <template v-if="on('table')">
          <button type="button" class="tb" @click="editor.chain().focus().addRowAfter().run()">+行</button>
          <button type="button" class="tb" @click="editor.chain().focus().deleteRow().run()">−行</button>
          <button type="button" class="tb" @click="editor.chain().focus().addColumnAfter().run()">+列</button>
          <button type="button" class="tb" @click="editor.chain().focus().deleteColumn().run()">−列</button>
          <button type="button" class="tb" @click="editor.chain().focus().deleteTable().run()">删表</button>
        </template>
      </div>
      <div class="grp">
        <button type="button" class="tb" @click="ins({ type: 'bilingualPair' })">原译对照</button>
        <button type="button" class="tb" @click="ins({ type: 'wordBreakdown' })">词语拆解</button>
        <button type="button" class="tb" @click="ins({ type: 'candidates' })">候选译法</button>
        <button type="button" class="tb" @click="ins({ type: 'sourceQuote' })">来源引文</button>
      </div>
      <div class="grp">
        <button type="button" class="tb" @click="insertNote('fact')"><span class="mark mark-fact" style="margin: 0 6px 0 0" aria-hidden="true"></span>语言事实</button>
        <button type="button" class="tb" @click="insertNote('inference')"><span class="mark mark-inference" style="margin: 0 6px 0 0" aria-hidden="true"></span>情境推断</button>
        <button type="button" class="tb" @click="insertNote('choice')"><span class="mark mark-choice" style="margin: 0 6px 0 0" aria-hidden="true"></span>译者选择</button>
      </div>
      <div class="grp" style="border-right: 0">
        <button type="button" class="tb" :disabled="uploading" @click="fileInput?.click()">{{ uploading ? '上传中…' : '图片' }}</button>
        <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="sr" tabindex="-1" @change="onFile">
        <button type="button" class="tb" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()">撤销</button>
        <button type="button" class="tb" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()">重做</button>
      </div>
    </div>
    <p v-if="err" class="err" role="alert" style="margin-bottom: 8px">{{ err }}</p>
    <EditorContent :editor="editor" />
  </div>
</template>
