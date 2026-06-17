/**
 * cm-slash-menu.ts — 斜杠菜单 CodeMirror 6 扩展
 *
 * 监听编辑器输入，检测触发字符（/ 、 、 Ins），通过 StateEffect 通知前端显示菜单。
 * 触发检测：比较文档中光标前一个字符在新旧版本中的差异，避免 iterChanges API 陷阱。
 * 菜单关闭：任何文档变化（用户继续输入）→ 自动关闭，让输入不受影响。
 */

import { EditorView, ViewPlugin, ViewUpdate, keymap } from '@codemirror/view'
import { StateField, StateEffect } from '@codemirror/state'

/* ------------------------------------------------------------------ */
/*  触发字符                                                            */
/* ------------------------------------------------------------------ */

const TRIGGERS = new Set(['/', '、']) // / 和 、

/* ------------------------------------------------------------------ */
/*  State Effects：与前端通信                                           */
/* ------------------------------------------------------------------ */

export const showSlashMenu = StateEffect.define<{
  trigger: string        // 触发字符
  from: number           // 触发字符在文档中的位置
  cursorLine: number     // 光标所在行号
  coords: { left: number; bottom: number }  // 光标屏幕坐标
}>()

export const slashMenuAction = StateEffect.define<{
  id: string             // 菜单项 actionId
  from: number           // 触发字符起始位置
  to: number             // 搜索词结束位置
}>()

export const hideSlashMenu = StateEffect.define<void>()

/* ------------------------------------------------------------------ */
/*  State Field：追踪菜单状态                                           */
/* ------------------------------------------------------------------ */

export interface SlashMenuState {
  active: boolean
  trigger: string
  from: number           // 触发字符的文档位置
}

export const slashMenuState = StateField.define<SlashMenuState>({
  create() {
    return { active: false, trigger: '', from: 0 }
  },
  update(value, tr) {
    // 优先处理 effect
    for (const effect of tr.effects) {
      if (effect.is(showSlashMenu)) {
        return { active: true, trigger: effect.value.trigger, from: effect.value.from }
      }
      if (effect.is(hideSlashMenu) || effect.is(slashMenuAction)) {
        return { active: false, trigger: '', from: 0 }
      }
    }

    if (!value.active) return value

    // 菜单激活期间，任何文档变化 → 用户在继续输入 → 关闭菜单
    if (tr.docChanged) {
      return { active: false, trigger: '', from: 0 }
    }

    return value
  },
})

/* ------------------------------------------------------------------ */
/*  ViewPlugin：检测触发 + 发射坐标/关闭事件                              */
/* ------------------------------------------------------------------ */

const slashMenuPlugin = ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) {
    // 监听来自全局快捷键系统的 slashMenu 触发
    this.view.dom.addEventListener('slash-menu-keyboard-trigger', () => {
      const cursor = this.view.state.selection.main.head
      const line = this.view.state.doc.lineAt(cursor).number
      const rect = this.view.coordsAtPos(cursor)
      const editorRect = this.view.dom.getBoundingClientRect()
      this.view.dispatch({
        effects: showSlashMenu.of({
          trigger: '',
          from: cursor,
          cursorLine: line,
          coords: {
            left: rect ? rect.left - editorRect.left : 0,
            bottom: rect ? rect.bottom - editorRect.top : 0,
          },
        }),
      })
    })
  }

  update(update: ViewUpdate) {
    const prevState = update.startState.field(slashMenuState)
    const newState = update.state.field(slashMenuState)

    // ---- 菜单自动关闭（docChanged 导致）→ 通知 React ----
    if (prevState.active && !newState.active) {
      const hasExplicitEffect = update.transactions.some(tr =>
        tr.effects.some(e => e.is(hideSlashMenu) || e.is(slashMenuAction) || e.is(showSlashMenu))
      )
      if (!hasExplicitEffect) {
        this.view.dom.dispatchEvent(new CustomEvent('slash-menu-close'))
      }
      return // 菜单刚关闭，不再检测新触发
    }

    // ---- 菜单激活中：发射坐标更新 ----
    if (newState.active) {
      if (update.docChanged || update.selectionSet) {
        this.emitCoords(newState.from, update.state)
      }
      return
    }

    // ---- 检测新触发 ----
    if (!update.docChanged) return
    if (this.view.composing) return  // IME composition 中不触发

    // 核心检测逻辑：比较新旧文档中光标前一个字符
    const cursor = update.state.selection.main.head
    if (cursor === 0) return
    const charBefore = update.state.doc.sliceString(cursor - 1, cursor)
    if (!TRIGGERS.has(charBefore)) return

    // 确认是新插入的（不是之前就存在的）
    const oldDoc = update.startState.doc
    const oldChar = (cursor <= oldDoc.length)
      ? oldDoc.sliceString(cursor - 1, cursor)
      : ''
    if (oldChar === charBefore) return  // 字符之前就在，不是新输入

    this.view.dispatch({
      effects: showSlashMenu.of({
        trigger: charBefore,
        from: cursor - 1,
        cursorLine: update.state.doc.lineAt(cursor - 1).number,
        coords: this.getCoords(cursor),
      }),
    })
  }

  /** 获取指定位置的屏幕坐标（相对于编辑器 DOM） */
  private getCoords(pos: number) {
    const rect = this.view.coordsAtPos(pos)
    const editorRect = this.view.dom.getBoundingClientRect()
    return {
      left: rect ? rect.left - editorRect.left : 0,
      bottom: rect ? rect.bottom - editorRect.top : 0,
    }
  }

  /** 通过 DOM 自定义事件通知 React 组件更新坐标 */
  private emitCoords(from: number, st: any) {
    const cursor = st.selection.main.head
    const coords = this.getCoords(cursor)
    this.view.dom.dispatchEvent(new CustomEvent('slash-menu-update', {
      detail: { from, coords },
    }))
  }
})

/* ------------------------------------------------------------------ */
/*  组合导出                                                            */
/* ------------------------------------------------------------------ */

/** 斜杠菜单完整扩展（StateField + Ins keymap + ViewPlugin） */
export function slashMenuExtension() {
  return [
    slashMenuState,
    // Ins 键通过 keymap 注册（最高优先级，不受其他 plugin eventHandler 干扰）
    keymap.of([{
      key: 'Insert',
      preventDefault: true,
      run(view: EditorView) {
        const cursor = view.state.selection.main.head
        const line = view.state.doc.lineAt(cursor).number
        const rect = view.coordsAtPos(cursor)
        const editorRect = view.dom.getBoundingClientRect()
        view.dispatch({
          effects: showSlashMenu.of({
            trigger: '',
            from: cursor,
            cursorLine: line,
            coords: {
              left: rect ? rect.left - editorRect.left : 0,
              bottom: rect ? rect.bottom - editorRect.top : 0,
            },
          }),
        })
        return true
      },
    }]),
    slashMenuPlugin,
  ]
}
