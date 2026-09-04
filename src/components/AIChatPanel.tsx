import { useEffect, useRef, useState } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { Bot, Send, Square, Trash2, Copy, Check, FileDown, FilePlus2, X, Sparkles } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { providerById } from '../lib/ai-providers'
import { invokeTauriOrThrow } from '../lib/tauri'
import { useI18n } from '../i18n'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
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
const EVT_DONE = 'yizi://ai-done'
const EVT_ERROR = 'yizi://ai-error'

interface ChunkPayload { request_id: string; chunk: string }
interface DonePayload { request_id: string; full_text: string }
interface ErrorPayload { request_id: string; error: string }

export default function AIChatPanel({ open, onClose, docContent, docName, onInsert, onNewDoc }: AIChatPanelProps) {
  const { t } = useI18n()
  const { aiProvider, aiModel, aiBaseUrl, aiSystemPrompt, aiDocLimit } = useSettingsStore()
  const provider = providerById(aiProvider)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [useDoc, setUseDoc] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

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

  // 发送一条消息（含系统提示 + 可选的当前文档上下文）
  const handleSend = async () => {
    const text = input.trim()
    if (!text || streamingId) return
    setInput('')

    const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const userMsg: ChatMessage = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }])
    setStreamingId(requestId)

    const systemPrompt = aiSystemPrompt.trim()
    const docLimit = aiDocLimit > 0 ? aiDocLimit : docContent.length
    const messagesPayload: Array<{ role: string; content: string }> = []
    if (systemPrompt) messagesPayload.push({ role: 'system', content: systemPrompt })
    if (useDoc && docContent.trim()) {
      messagesPayload.push({
        role: 'system',
        content: `The user is editing a Markdown document titled "${docName}". Current document content:\n\n"""\n${docContent.slice(0, docLimit)}\n"""\n\nUse this as context to answer.`,
      })
    }
    messagesPayload.push({ role: 'user', content: text })

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
      unlisteners.push(await listen<DonePayload>(EVT_DONE, (e) => {
        if (e.payload.request_id !== requestId) return
        finish((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = { role: 'assistant', content: e.payload.full_text }
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
          api_format: provider?.apiFormat,
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
      // 兜底：10s 后仍未结束则解除 loading 态并注销监听（正常路径由 finish 提前完成）
      setTimeout(() => {
        if (!done) {
          done = true
          setStreamingId((cur) => (cur === requestId ? null : cur))
          unlistenAll()
        }
      }, 10000)
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
      {/* 头部 */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-[var(--editor-border)] shrink-0">
        <Bot size={15} className="text-[var(--editor-accent)]" />
        <span className="text-sm font-semibold flex-1 truncate">{t('ai.chatTitle')}</span>
        <span className="text-[10px] text-[var(--sidebar-text)] truncate max-w-[110px]">
          {provider?.label || aiProvider} · {aiModel || provider?.defaultModel || ''}
        </span>
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

      {/* 操作行：引用文档（始终显示，首条对话就可能与文档相关） */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-t border-[var(--editor-border)] shrink-0">
        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[var(--sidebar-text)]">
          <input type="checkbox" checked={useDoc} onChange={(e) => setUseDoc(e.target.checked)} className="settings-checkbox" />
          {t('ai.useCurrentDoc')}
        </label>
      </div>

      {/* 输入区 */}
      <div className="px-3 py-2.5 border-t border-[var(--editor-border)] shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={t('ai.placeholder')}
          rows={3}
          className="w-full px-3 py-2 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg text-[13px] text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)] resize-none"
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
              disabled={!input.trim()}
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
