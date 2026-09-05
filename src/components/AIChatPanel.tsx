import { useEffect, useRef, useState } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { Bot, Send, Square, Trash2, Copy, Check, FileDown, FilePlus2, X, Sparkles, Zap } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { providerById } from '../lib/ai-providers'
import { invokeTauriOrThrow } from '../lib/tauri'
import { loadSkills, loadSkillPrompt, type Skill } from '../lib/ai-skills'
import { useI18n } from '../i18n'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** 思考内容（reasoning / thinking），无则为空 */
  thinking?: string
  error?: boolean
}

interface AIChatPanelProps {
  open: boolean
  onClose: () => void
  docContent: string
  docName: string
  onInsert: (text: string) => void
  onNewDoc: (text: string) => void
}

const EVT_CHUNK = 'yizi://ai-chunk'
const EVT_THINKING = 'yizi://ai-thinking'
const EVT_DONE = 'yizi://ai-done'
const EVT_ERROR = 'yizi://ai-error'

interface ChunkPayload { request_id: string; chunk: string }
interface DonePayload { request_id: string; full_text: string; full_thinking?: string }
interface ErrorPayload { request_id: string; error: string }

export default function AIChatPanel({ open, onClose, docContent, docName, onInsert, onNewDoc }: AIChatPanelProps) {
  const { t } = useI18n()
  const { aiProvider, aiModel, aiBaseUrl, aiApiFormat, aiSystemPrompt, aiDocLimit } = useSettingsStore()
  const provider = providerById(aiProvider)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [useDoc, setUseDoc] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Skills：技能清单、当前选中、弹窗开关、提示词缓存
  const [skills, setSkills] = useState<Skill[]>([])
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null)
  const [skillMenuOpen, setSkillMenuOpen] = useState(false)
  const skillPromptCache = useRef<Record<string, string>>({})
  const skillMenuRef = useRef<HTMLDivElement>(null)
  // 输入区（contentEditable）：skill tag 与用户文字混排
  const editorRef = useRef<HTMLDivElement>(null)
  const activeSkillRef = useRef<Skill | null>(null)
  /** 选中 needsDoc 技能前的 useDoc 值，删除技能时恢复 */
  const prevUseDocRef = useRef(false)

  useEffect(() => {
    activeSkillRef.current = activeSkill
  }, [activeSkill])

  useEffect(() => {
    loadSkills().then(setSkills)
  }, [])

  // 技能 tag 被当作文字删除（退格/删除键）时，同步取消技能
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    const obs = new MutationObserver(() => {
      if (activeSkillRef.current && !el.querySelector('.skill-tag')) {
        removeSkill()
      }
    })
    obs.observe(el, { childList: true, subtree: true, characterData: true })
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 点击弹窗外关闭技能菜单
  useEffect(() => {
    if (!skillMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (skillMenuRef.current && !skillMenuRef.current.contains(e.target as Node)) {
        setSkillMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [skillMenuOpen])

  // 关闭面板时取消进行中的流
  useEffect(() => {
    if (!open && streamingId) {
      invokeTauriOrThrow('ai_cancel', { requestId: streamingId }).catch(() => {})
    }
  }, [open]) // eslint-disable-line

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streamingId])

  // 清空消息
  const handleClear = () => {
    setMessages([])
    setCopiedIndex(null)
  }

  // ── Skill 输入框交互 ──────────────────────────────────────────

  /** 从 contentEditable 提取纯文本（排除 skill tag，<br> 还原为换行）。 */
  const syncFromDom = () => {
    const el = editorRef.current
    if (!el) return
    let text = ''
    el.childNodes.forEach((node) => {
      if (node instanceof HTMLElement && node.classList.contains('skill-tag')) return
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent
      else if (node instanceof HTMLElement) text += node.tagName === 'BR' ? '\n' : node.innerText
    })
    setInput(text)
  }

  /** 在光标处插入技能 tag；焦点不在编辑器内则追加到末尾。 */
  const insertTagAtCaret = (skill: Skill) => {
    const el = editorRef.current
    if (!el) return
    const tag = document.createElement('span')
    tag.className = 'skill-tag'
    tag.contentEditable = 'false'
    tag.innerHTML =
      '<span class="skill-tag-icon-zone"><span class="skill-tag-icon">⚡</span><span class="skill-tag-x">✕</span></span><span class="skill-tag-name"></span>'
    ;(tag.querySelector('.skill-tag-name') as HTMLElement).textContent = skill.name
    ;(tag.querySelector('.skill-tag-x') as HTMLElement).addEventListener('click', () => removeSkill())

    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(tag)
      const space = document.createTextNode('\u00A0')
      tag.after(space)
      range.setStartAfter(space)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      el.appendChild(tag)
      const space = document.createTextNode('\u00A0')
      el.appendChild(space)
      // 光标移到末尾
      const range = document.createRange()
      range.setStartAfter(space)
      range.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }

  /** 取消技能：移除 tag、恢复 useDoc、清除状态。 */
  const removeSkill = () => {
    const s = activeSkillRef.current
    if (!s) return
    if (s.needsDoc) setUseDoc(prevUseDocRef.current)
    editorRef.current?.querySelectorAll('.skill-tag').forEach((n) => n.remove())
    setActiveSkill(null)
    setSkillMenuOpen(false)
  }

  /** 选中技能：光标处插入 tag；needsDoc 自动勾选并锁定。 */
  const selectSkill = (s: Skill) => {
    if (activeSkillRef.current) removeSkill()
    prevUseDocRef.current = useDoc
    insertTagAtCaret(s)
    setActiveSkill(s)
    if (s.needsDoc) setUseDoc(true)
    setSkillMenuOpen(false)
    editorRef.current?.focus()
  }

  /** 发送后清空用户文本，保留技能 tag。 */
  const clearEditorText = () => {
    const el = editorRef.current
    if (!el) return
    el.childNodes.forEach((node) => {
      if (node instanceof HTMLElement && node.classList.contains('skill-tag')) return
      node.remove()
    })
  }

  // 发送一条消息（含系统提示 + 可选的当前文档上下文）
  const handleSend = async () => {
    const text = input.trim()
    if ((!text && !activeSkill) || streamingId) return
    setInput('')
    clearEditorText()

    const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    // 选中技能但未输入文字时，给一条默认指令让模型执行技能
    const userContent = text || t('ai.skillAutoRun')
    const userMsg: ChatMessage = { role: 'user', content: userContent }
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }])
    setStreamingId(requestId)

    const systemPrompt = aiSystemPrompt.trim()
    // 技能需要文档且当前文档非空时，自动引用当前文档
    const skillNeedsDoc = !!activeSkill?.needsDoc && !!docContent.trim()
    const docLimit = aiDocLimit > 0 ? aiDocLimit : docContent.length
    const messagesPayload: Array<{ role: string; content: string }> = []
    if (systemPrompt) messagesPayload.push({ role: 'system', content: systemPrompt })
    // 技能提示词作为独立 system 消息注入（懒加载并缓存正文）
    if (activeSkill) {
      let prompt = skillPromptCache.current[activeSkill.file]
      if (prompt === undefined) {
        prompt = await loadSkillPrompt(activeSkill.file)
        skillPromptCache.current[activeSkill.file] = prompt
      }
      if (prompt) messagesPayload.push({ role: 'system', content: prompt })
    }
    if ((useDoc || skillNeedsDoc) && docContent.trim()) {
      messagesPayload.push({
        role: 'system',
        content: `The user is editing a Markdown document titled "${docName}". Current document content:\n\n"""\n${docContent.slice(0, docLimit)}\n"""\n\nUse this as context to answer.`,
      })
    }
    messagesPayload.push({ role: 'user', content: userContent })

    // 先注册事件监听，再发起请求，避免快速失败时事件丢失
    // 注意：ai_chat 命令立即返回 request_id，流式事件随后异步到达，
    // 监听器必须在 done/error 到达后才注销，不能在 invoke 返回时注销。
    const unlisteners: UnlistenFn[] = []
    let done = false
    const unlistenAll = () => {
      unlisteners.forEach((u) => { try { u() } catch {} })
    }
    const finish = (setFn: (prev: ChatMessage[]) => ChatMessage[]) => {
      done = true
      setMessages(setFn)
      setStreamingId(null)
      unlistenAll()
    }
    try {
      unlisteners.push(await listen<ChunkPayload>(EVT_CHUNK, (e) => {
        if (e.payload.request_id !== requestId) return
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: last.content + e.payload.chunk }
          return updated
        })
      }))
      unlisteners.push(await listen<ChunkPayload>(EVT_THINKING, (e) => {
        if (e.payload.request_id !== requestId) return
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: last.content,
            thinking: (last.thinking || '') + e.payload.chunk,
          }
          return updated
        })
      }))
      unlisteners.push(await listen<DonePayload>(EVT_DONE, (e) => {
        if (e.payload.request_id !== requestId) return
        // 始终以后端累积的完整文本为准，自愈个别 chunk 丢失导致的截断
        finish((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              role: 'assistant',
              content: e.payload.full_text,
              thinking: e.payload.full_thinking || undefined,
            }
          }
          return updated
        })
      }))
      unlisteners.push(await listen<ErrorPayload>(EVT_ERROR, (e) => {
        if (e.payload.request_id !== requestId) return
        const errText = e.payload.error
        finish((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: errText === 'cancelled' ? '' : t('ai.error', { msg: errText }),
            error: errText !== 'cancelled',
          }
          return updated
        })
      }))

      await invokeTauriOrThrow('ai_chat', {
        request: {
          provider: aiProvider,
          api_format: provider?.id === 'custom' ? aiApiFormat : provider?.apiFormat,
          model: aiModel || provider?.defaultModel || '',
          base_url: aiBaseUrl || provider?.defaultBaseUrl || null,
          request_id: requestId,
          messages: messagesPayload,
        },
      })
    } catch (e) {
      finish((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: t('ai.error', { msg: e instanceof Error ? e.message : String(e) }),
          error: true,
        }
        return updated
      })
    } finally {
      // 兜底：与后端 180s HTTP 总超时对齐（200s > 180s），流必然以 done/error 结束并触发 finish。
      // 正常路径由 finish 提前完成；此处仅防事件系统异常导致的监听器泄漏，不截断正常长流。
      setTimeout(() => {
        if (!done) {
          done = true
          setStreamingId((cur) => (cur === requestId ? null : cur))
          unlistenAll()
        }
      }, 200000)
    }
  }

  const handleStop = () => {
    if (streamingId) invokeTauriOrThrow('ai_cancel', { requestId: streamingId }).catch(() => {})
  }

  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content)
    setCopiedIndex(messages.findIndex((m) => m.role === 'assistant' && m.content === content))
    setTimeout(() => setCopiedIndex(null), 1500)
  }

  const handleInsert = (content: string) => {
    onInsert(content)
  }

  if (!open) return null

  return (
    <div className="ai-chat-panel">
      {/* 头部：标题 + 服务商 · 模型 ID（自定义服务简写），紧跟标题左对齐，不推挤右侧按钮 */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-[var(--editor-border)] shrink-0">
        <Bot size={15} className="text-[var(--editor-accent)] shrink-0" />
        <span className="text-sm font-semibold shrink-0">{t('ai.chatTitle')}</span>
        <span className="text-[10px] text-[var(--sidebar-text)] truncate min-w-0">
          {provider?.id === 'custom' ? t('ai.customLabel') : provider?.label || aiProvider} · {aiModel || provider?.defaultModel || ''}
        </span>
        <div className="flex-1" />
        <button onClick={handleClear} className="p-1 rounded hover:bg-[var(--editor-hover)]" title={t('ai.clear')}>
          <Trash2 size={13} />
        </button>
        <button onClick={onClose} className="p-1 rounded hover:bg-[var(--editor-hover)]" title={t('common.close')}>
          <X size={14} />
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-[var(--sidebar-text)]">
            <Sparkles size={28} className="mb-2 opacity-50" />
            <p className="text-xs">{t('ai.empty')}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            {/* 思考内容：可折叠区块，位于回答上方，默认收起 */}
            {m.role === 'assistant' && m.thinking && (
              <details className="max-w-[85%] w-fit mb-1.5 rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)] px-3 py-1.5">
                <summary className="text-[10px] text-[var(--sidebar-text)] cursor-pointer select-none">
                  {t('ai.thinkingSection')}
                </summary>
                <div className="mt-1.5 text-[11px] leading-relaxed text-[var(--sidebar-text)] whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                  {m.thinking}
                </div>
              </details>
            )}
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                m.role === 'user'
                  ? 'bg-[var(--editor-accent)] text-white rounded-br-sm'
                  : m.error
                    ? 'bg-red-500/10 text-red-500 border border-red-500/30 rounded-bl-sm'
                    : 'bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-bl-sm'
              }`}
            >
              {m.content}
              {m.role === 'assistant' && streamingId && i === messages.length - 1 && !m.content && (
                <span className="inline-block w-2 h-4 ml-0.5 align-middle animate-pulse bg-[var(--editor-accent)]" />
              )}
            </div>
            {/* 每条 AI 回复的操作图标：图标常显，hover 显示文字说明 */}
            {m.role === 'assistant' && m.content && !m.error && (
              <div className="mt-1 flex items-center gap-0.5">
                <button
                  onClick={() => handleCopy(m.content)}
                  className="group flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)] hover:text-[var(--editor-text)]"
                  title={t('ai.copy')}
                >
                  {copiedIndex === i ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  <span className="text-[10px] hidden group-hover:inline">{copiedIndex === i ? t('ai.copied') : t('ai.copy')}</span>
                </button>
                <button
                  onClick={() => handleInsert(m.content)}
                  className="group flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)] hover:text-[var(--editor-text)]"
                  title={t('ai.insertToDoc')}
                >
                  <FileDown size={12} />
                  <span className="text-[10px] hidden group-hover:inline">{t('ai.insertToDoc')}</span>
                </button>
                <button
                  onClick={() => onNewDoc(m.content)}
                  className="group flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)] hover:text-[var(--editor-text)]"
                  title={t('ai.newDoc')}
                >
                  <FilePlus2 size={12} />
                  <span className="text-[10px] hidden group-hover:inline">{t('ai.newDoc')}</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 操作行：技能（闪电）+ 引用文档 */}
      <div className="relative flex items-center gap-3 px-4 py-1.5 border-t border-[var(--editor-border)] shrink-0" ref={skillMenuRef}>
        <button
          onClick={() => setSkillMenuOpen((v) => !v)}
          className={`flex items-center gap-1 p-1 rounded hover:bg-[var(--editor-hover)] ${activeSkill ? 'text-[var(--editor-accent)]' : 'text-[var(--sidebar-text)]'}`}
          title={t('ai.skillButton')}
        >
          <Zap size={14} />
        </button>
        {skillMenuOpen && (
          <div className="absolute bottom-full left-2 mb-1 w-[300px] max-h-[280px] overflow-y-auto rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)] shadow-xl z-10">
            {skills.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-[var(--sidebar-text)]">{t('ai.skillEmpty')}</p>
            ) : (
              skills.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSkill(s)}
                  className={`group w-full text-left px-3.5 py-2.5 hover:bg-[var(--editor-hover)] border-b border-[var(--editor-border)] last:border-b-0 ${activeSkill?.id === s.id ? 'bg-[var(--editor-accent)]/5' : ''}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Zap size={12} className="text-[var(--editor-accent)] shrink-0" />
                    <span className="text-[13px] font-medium text-[var(--editor-text)]">{s.name}</span>
                  </div>
                  <p className="text-[11px] text-[var(--sidebar-text)] mt-1 leading-snug">{s.summary}</p>
                  <p className="hidden group-hover:block text-[11px] text-[var(--sidebar-text)] mt-1.5 pt-1.5 border-t border-[var(--editor-border)] leading-relaxed">{s.description}</p>
                </button>
              ))
            )}
          </div>
        )}
        <label className={`flex items-center gap-1.5 text-[11px] ${activeSkill?.needsDoc ? 'opacity-70' : 'cursor-pointer text-[var(--sidebar-text)]'}`}>
          <input
            type="checkbox"
            checked={useDoc || !!activeSkill?.needsDoc}
            disabled={!!activeSkill?.needsDoc}
            onChange={(e) => setUseDoc(e.target.checked)}
            className="settings-checkbox"
          />
          {t('ai.useCurrentDoc')}
        </label>
      </div>

      {/* 输入区：contentEditable，skill tag 与文字混排、可光标删除 */}
      <div className="px-3 py-2.5 border-t border-[var(--editor-border)] shrink-0">
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          data-placeholder={t('ai.placeholder')}
          onInput={syncFromDom}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, text)
            syncFromDom()
          }}
          className="ai-chat-editor w-full px-3 py-2 bg-[var(--editor-surface)] rounded-lg text-[13px] text-[var(--editor-text)] outline-none resize-none"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-[var(--sidebar-text)]">Enter 发送 · Shift+Enter 换行</span>
          {streamingId ? (
            <button onClick={handleStop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white bg-red-500/90 hover:bg-red-500">
              <Square size={11} /> {t('ai.stop')}
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() && !activeSkill}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white bg-[var(--editor-accent)] hover:opacity-90 disabled:opacity-40"
            >
              <Send size={11} /> {t('ai.send')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
