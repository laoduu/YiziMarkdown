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
        this.view.dom.dispatchEvent(new CustomEvent('slash-menu-close', { bubbles: true }))
      }
      return // 菜单刚关闭，不再检测新触发
    }

    // ---- 菜单激活中：延迟发射坐标更新 ----
    if (newState.active) {
      if (update.docChanged || update.selectionSet) {
        this.measureMenu(newState.from)
      }
      return
    }

    // ---- 检测新触发 ----
    if (!update.docChanged) return

    const cursor = update.state.selection.main.head
    if (cursor === 0) return

    // 取出本次交易中结束于光标处（紧贴光标）的插入文本。
    // 用实际插入文本检测，而非比较新旧文档 + composing 守卫，
    // 这样 IME 组合提交的 /（Windows 中文输入法英文模式也会走组合）也能触发。
    let inserted = ''
    update.changes.iterChanges((_fA, _tA, _fromB, toB, ins) => {
      if (toB === cursor) inserted = ins.toString()
    })
    if (!inserted) return

    const trigger = inserted[inserted.length - 1]
    if (!TRIGGERS.has(trigger)) return

    // CodeMirror 禁止在 update 期间调用 view.dispatch（会抛
    // "Calls to EditorView.update are not allowed while an update is in progress"），
    // 因此把派发延迟到微任务，待本次 update 结束后再执行；并重新校验状态，避免误触发。
    queueMicrotask(() => {
      const sm = this.view.state.field(slashMenuState, false)
      if (!sm || sm.active) return            // 已被占用或已关闭
      const head = this.view.state.selection.main.head
      if (head === 0) return
      const ch = this.view.state.doc.sliceString(head - 1, head)
      if (!TRIGGERS.has(ch)) return          // 触发字符已被后续输入覆盖
      const f = head - 1
      this.view.dispatch({
        effects: showSlashMenu.of({
          trigger: ch,
          from: f,
          cursorLine: this.view.state.doc.lineAt(f).number,
          coords: { left: 0, bottom: 0 },
        }),
      })
      this.measureMenu(f)
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

  /** 延迟到 update 之外测量坐标并通知 React（update 期间禁止读布局） */
  private measureMenu(from: number) {
    requestAnimationFrame(() => {
      const sm = this.view.state.field(slashMenuState, false)
      if (!sm || !sm.active) return
      const cursor = this.view.state.selection.main.head
      const coords = this.getCoords(cursor)
      this.view.dom.dispatchEvent(new CustomEvent('slash-menu-update', {
        detail: { from, coords },
        bubbles: true,
      }))
    })
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
