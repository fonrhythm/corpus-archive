import { reactive, watch } from 'vue'
import type { NodeViewProps } from '@tiptap/vue-3'

/** 节点视图里的输入框用本地副本编辑，变化后回写到节点属性；撤销 / 外部变化时反向同步。
 *  v-model 在输入法组词（泰文、韩文、中文）期间不会触发更新，因此不会打断输入。 */
export function useNodeAttrs<T extends Record<string, unknown>>(props: NodeViewProps) {
  const clone = (v: unknown) => JSON.parse(JSON.stringify(v ?? {}))
  const local = reactive(clone(props.node.attrs)) as T
  let applying = false

  watch(local, () => {
    if (applying) return
    if (JSON.stringify(local) !== JSON.stringify(props.node.attrs)) props.updateAttributes(clone(local))
  }, { deep: true })

  watch(() => props.node.attrs, (a) => {
    if (JSON.stringify(a) === JSON.stringify(local)) return
    applying = true
    Object.assign(local, clone(a))
    queueMicrotask(() => { applying = false })
  }, { deep: true })

  return local
}
