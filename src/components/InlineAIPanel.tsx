/**
 * InlineAIPanel — 文档内 AI（划词改写）浮层。
 *
 * 与右侧 AI 助手是两套东西：这里的产出直接写回正文（替换 / 插入），
 * 不进入聊天记录，也不走 skills。
 *
 * 阶段：compose → streaming → review → error；review 里可再提「补充需求」继续改同一段。
 * 事件与后端约定见 lib/aiStream.ts；提示词与 diff 见 lib/inlineAI.ts。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, Check, Copy, RotateCcw, Square, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'
import { providerById } from '../lib/ai-providers'
import { writeClipboardText } from '../lib/clipboard'
import { startAIStream, type AIStreamHandle } from '../lib/aiStream'
import {
  MAX_SELECTION_CHARS,
  buildInlineMessages,
  diffLines,
  pickInlineIntents,
  truncateSelection,
  type ChatPayloadMessage,
  type InlineIntentId,
} from '../lib/inlineAI'

type Phase = 'compose' | 'streaming' | 'review' | 'error'

interface InlineAIPanelProps {
  /** 选区末尾的视口坐标；boundLeft/Right 限制在正文列内，避免压到左侧边栏 */
  anchor: { x: number; y: number; boundLeft?: number; boundRight?: number }
  /** rewrite：改写选中内容；create：在光标处按指令创作 */
  mode?: 'rewrite' | 'create'
  originalText: string
  /** 成功后由调用方关闭浮层并提示（已写入正文，可 Ctrl+Z 撤销） */
  onApply: (kind: 'replace' | 'insert', text: string) => boolean
  onClose: () => void
}

const INTENT_LABEL_KEY: Record<InlineIntentId, string> = {
  polish: 'aiInline.intentPolish',
  expand: 'aiInline.intentExpand',
  shorten: 'aiInline.intentShorten',
  translate: 'aiInline.intentTranslate',
  proofread: 'aiInline.intentProofread',
  toList: 'aiInline.intentToList',
  explainCode: 'aiInline.intentExplain',
  tidyTable: 'aiInline.intentTidyTable',
}

const INTENT_INSTRUCTION: Record<'zh' | 'en', Record<InlineIntentId, string>> = {
  zh: {
    polish: '请润色这段内容：保持原意与结构，让表达更通顺、准确、自然。',
    expand: '请扩写这段内容：沿用原有语气与结构，补充必要的细节，但不要编造事实。',
    shorten: '请精简这段内容：保留关键信息与结论，删去冗余表达。',
    translate: '请翻译这段内容：中文译成英文，其他语言译成中文。',
    proofread: '请校对这段内容：修正错别字、标点与语法问题，尽量不改变原句结构。',
    toList: '请把这段内容改写成结构清晰的 Markdown 列表，保留原有信息。',
    explainCode: '请为这段代码添加简洁的中文注释，不要改动代码逻辑。',
    tidyTable: '请整理这个 Markdown 表格：对齐列、补齐缺失单元格，不改变原有内容含义。',
  },
  en: {
    polish: 'Polish this passage: keep the meaning and structure, make it clearer and more natural.',
    expand: 'Expand this passage: keep the tone and structure, add necessary detail without inventing facts.',
    shorten: 'Shorten this passage: keep key information and conclusions, remove redundancy.',
    translate: 'Translate this passage: Chinese into English, other languages into Chinese.',
    proofread: 'Proofread this passage: fix typos, punctuation and grammar without restructuring sentences.',
    toList: 'Rewrite this passage as a clear Markdown list, keeping all information.',
    explainCode: 'Add concise comments to this code without changing its logic.',
    tidyTable: 'Tidy this Markdown table: align columns and fill missing cells without changing the meaning.',
  },
}

export default function InlineAIPanel({
  anchor,
  mode = 'rewrite',
  originalText,
  onApply,
  onClose,
}: InlineAIPanelProps) {
  const { t, lang } = useI18n()
  const isCreate = mode === 'create'
  const { aiProvider, aiModel, aiBaseUrl, aiApiFormat } = useSettingsStore()
  const provider = providerById(aiProvider)
  const intentLang: 'zh' | 'en' = String(lang).startsWith('zh') ? 'zh' : 'en'

  const [instruction, setInstruction] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [phase, setPhase] = useState<Phase>('compose')
  const [result, setResult] = useState('')
  const [thinking, setThinking] = useState('')
  const [error, setError] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const streamRef = useRef<AIStreamHandle | null>(null)
  const resultRef = useRef('')
  const busyRef = useRef(false)
  /** 多轮「补充需求」的对话上下文：system + 首轮指令 + 历次指令/结果 */
  const historyRef = useRef<ChatPayloadMessage[]>([])

  const intents = pickInlineIntents(originalText)
  const streaming = phase === 'streaming'

  /* ---------- 定位：优先放在选区下方，空间不足翻到上方 ---------- */
  const place = useCallback(() => {
    const el = panelRef.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const margin = 8
    // 水平方向限制在正文列内：选区起点常在行首，直接用视口夹取会把浮层推到左边栏上
    const minLeft = Math.max(margin, anchor.boundLeft ?? margin)
    const maxLeft = Math.max(
      minLeft,
      Math.min(window.innerWidth - w - margin, (anchor.boundRight ?? window.innerWidth) - w),
    )
    const left = Math.max(minLeft, Math.min(anchor.x, maxLeft))
    let top = anchor.y + 12
    if (top + h > window.innerHeight - margin) top = Math.max(margin, anchor.y - h - 12)
    // 选区末尾可能在视口外（长选区）：上面/下面都放不下时，硬夹回视口内
    top = Math.max(margin, Math.min(top, window.innerHeight - h - margin))
    setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
  }, [anchor.x, anchor.y, anchor.boundLeft, anchor.boundRight])

  useLayoutEffect(() => {
    place()
  }, [place, phase, compareOpen, result.length, error])

  // 首帧的 window.innerHeight 可能还在稳定（窗口刚打开/恢复），下一帧再夹一次
  useEffect(() => {
    const raf = requestAnimationFrame(place)
    return () => cancelAnimationFrame(raf)
  }, [place])

  // 流式输出让浮层变高时重新夹取，避免下半截被视口裁掉
  useEffect(() => {
    const el = panelRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => place())
    ro.observe(el)
    return () => ro.disconnect()
  }, [place])

  // 窗口尺寸变化后重新夹取，避免浮层跑到视口外
  useEffect(() => {
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [place])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // 卸载时取消请求并释放监听器
  useEffect(() => {
    return () => {
      streamRef.current?.cancel()
      streamRef.current?.dispose()
      streamRef.current = null
    }
  }, [])

  // Esc 关闭（生成中先取消）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      streamRef.current?.cancel()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  /** 上下文最多保留 9 条：system + 首轮用户消息 + 最近几轮，避免多轮改写后无限增长 */
  const MAX_HISTORY_MESSAGES = 9
  const trimHistory = (messages: ChatPayloadMessage[]): ChatPayloadMessage[] =>
    messages.length <= MAX_HISTORY_MESSAGES
      ? messages
      : [messages[0], messages[1], ...messages.slice(-(MAX_HISTORY_MESSAGES - 2))]

  const startStream = async (messages: ChatPayloadMessage[]) => {
    busyRef.current = true
    setPhase('streaming')
    setResult('')
    setThinking('')
    setError('')
    setCopied(false)
    setCompareOpen(false)
    resultRef.current = ''

    streamRef.current?.dispose()
    const handle = await startAIStream(
      {
        provider: aiProvider,
        apiFormat: provider?.id === 'custom' ? aiApiFormat : provider?.apiFormat,
        model: aiModel || provider?.defaultModel || '',
        baseUrl: aiBaseUrl || provider?.defaultBaseUrl || null,
        messages,
      },
      {
        onChunk: (chunk) => {
          resultRef.current += chunk
          setResult(resultRef.current)
        },
        onThinking: (chunk) => setThinking((prev) => prev + chunk),
        onDone: (fullText) => {
          resultRef.current = fullText
          historyRef.current = trimHistory([...historyRef.current, { role: 'assistant', content: fullText }])
          setResult(fullText)
          setPhase('review')
          busyRef.current = false
          streamRef.current = null
        },
        onError: (message) => {
          streamRef.current = null
          busyRef.current = false
          if (message === 'cancelled') {
            if (resultRef.current.trim()) {
              // 已生成的半截内容按结果保留，后续「补充需求」仍能在它基础上继续
              historyRef.current = trimHistory([...historyRef.current, { role: 'assistant', content: resultRef.current }])
              setPhase('review')
            } else {
              // 没有任何产出：丢掉这条未完成的指令，回到输入态
              historyRef.current = historyRef.current.slice(0, -1)
              setPhase('compose')
            }
            return
          }
          setError(message)
          setPhase('error')
        },
      },
    )
    streamRef.current = handle
  }

  /** 首轮：用指令 + 选区原文开一个任务；创作模式没有原文 */
  const run = (rawInstruction?: string) => {
    const text = (rawInstruction ?? instruction).trim()
    if (!text || busyRef.current) return
    setInstruction(text)
    const payload = isCreate ? { text: '', truncated: false } : truncateSelection(originalText)
    setTruncated(payload.truncated)
    const messages = buildInlineMessages(text, isCreate ? null : payload.text)
    historyRef.current = messages
    void startStream(messages)
  }

  /** 补充需求：在已有结果的基础上继续改 */
  const refine = () => {
    const text = followUp.trim()
    if (!text || busyRef.current || historyRef.current.length === 0) return
    setFollowUp('')
    const messages = trimHistory([...historyRef.current, { role: 'user', content: text }])
    historyRef.current = messages
    void startStream(messages)
  }

  /** 失败重试：沿用同一份上下文（末尾就是失败的那条指令） */
  const retry = () => {
    if (busyRef.current || historyRef.current.length === 0) return
    void startStream(historyRef.current)
  }

  const stop = () => {
    streamRef.current?.cancel()
  }

  const copyResult = () => {
    if (!result) return
    void writeClipboardText(result).then((ok) => {
      if (!ok) return
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const apply = (kind: 'replace' | 'insert') => {
    if (!result.trim()) return
    if (!onApply(kind, result)) return
    // 写入成功后立即关闭：浮层正好盖在写回位置上方，留着会挡住用户看结果
    onClose()
  }

  const diff = !isCreate && compareOpen && phase === 'review' ? diffLines(originalText, result) : null

  return createPortal(
    <div
      ref={panelRef}
      className="inline-ai-panel"
      style={{ left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y, visibility: pos ? 'visible' : 'hidden' }}
      role="dialog"
      aria-label={t('selection.askAI')}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button type="button" className="inline-ai-close" onClick={onClose} title={t('aiInline.close')} aria-label={t('aiInline.close')}>
        <X size={13} />
      </button>

      {phase === 'compose' && (
            <>
              <textarea
                ref={textareaRef}
                className="inline-ai-input"
                rows={2}
                value={instruction}
                placeholder={isCreate ? t('aiInline.createPlaceholder') : t('aiInline.placeholder')}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    void run()
                  }
                }}
              />
              <div className="inline-ai-meta">
                {truncated
                  ? <span style={{ color: 'var(--editor-accent)' }}>{t('aiInline.truncated', { count: MAX_SELECTION_CHARS })}</span>
                  : !isCreate
                    ? <span>{t('aiInline.selectedChars', { count: originalText.length })}</span>
                    : <span />}
                <button
                  type="button"
                  className="inline-ai-send"
                  disabled={!instruction.trim()}
                  onClick={() => void run()}
                  title={t('aiInline.send')}
                  aria-label={t('aiInline.send')}
                >
                  <ArrowUp size={14} />
                </button>
              </div>
              {!isCreate && intents.length > 0 && (
                <div className="inline-ai-intents">
                  {intents.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="inline-ai-chip"
                      onClick={() => void run(INTENT_INSTRUCTION[intentLang][id])}
                    >
                      {t(INTENT_LABEL_KEY[id])}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {(phase === 'streaming' || phase === 'review' || phase === 'error') && (
            <>
              {compareOpen && diff ? (
                <div className="inline-ai-compare">
                  <div>
                    <div className="inline-ai-compare-title">{t('aiInline.original')}</div>
                    <pre className="inline-ai-pre">
                      {diff.map((line, i) => (
                        <div key={i} className={`inline-ai-diff-${line.type}`}>{line.text || ' '}</div>
                      ))}
                    </pre>
                  </div>
                  <div>
                    <div className="inline-ai-compare-title">{t('aiInline.result')}</div>
                    <pre className="inline-ai-pre">
                      {diff.filter((line) => line.type !== 'del').map((line, i) => (
                        <div key={i} className={`inline-ai-diff-${line.type}`}>{line.text || ' '}</div>
                      ))}
                    </pre>
                  </div>
                </div>
              ) : (
                (streaming || result) && (
                  <pre className="inline-ai-pre inline-ai-result">
                    {result || t('aiInline.generating')}
                    {streaming && result && <span className="inline-ai-caret" />}
                  </pre>
                )
              )}

              {thinking && !result && (
                <details className="inline-ai-thinking">
                  <summary>{t('aiInline.thinking')}</summary>
                  <div>{thinking}</div>
                </details>
              )}

              {phase === 'error' && (
                <div className="inline-ai-error">{t('ai.error', { msg: error })}</div>
              )}

              {phase === 'review' && (
                <div className="inline-ai-followup">
                  <input
                    className="inline-ai-followup-input"
                    value={followUp}
                    placeholder={t('aiInline.followUpPlaceholder')}
                    onChange={(e) => setFollowUp(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        refine()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="inline-ai-send inline-ai-send-sm"
                    disabled={!followUp.trim()}
                    onClick={refine}
                    title={t('aiInline.send')}
                    aria-label={t('aiInline.send')}
                  >
                    <ArrowUp size={12} />
                  </button>
                </div>
              )}

              <div className="inline-ai-actions">
                {streaming ? (
                  <button type="button" className="inline-ai-btn" onClick={stop}>
                    <Square size={11} /> {t('aiInline.stop')}
                  </button>
                ) : phase === 'error' ? (
                  <button type="button" className="inline-ai-btn" onClick={retry}>
                    <RotateCcw size={11} /> {t('aiInline.retry')}
                  </button>
                ) : (
                  <>
                    {!isCreate && (
                      <button type="button" className="inline-ai-btn" onClick={() => setCompareOpen((v) => !v)}>
                        {t('aiInline.compare')}
                      </button>
                    )}
                    <button type="button" className="inline-ai-btn" onClick={copyResult}>
                      {copied ? <><Check size={11} /> {t('aiInline.copied')}</> : <><Copy size={11} /> {t('aiInline.copy')}</>}
                    </button>
                    {isCreate ? (
                      <button type="button" className="inline-ai-btn inline-ai-btn-primary" onClick={() => apply('insert')}>
                        {t('aiInline.insertHere')}
                      </button>
                    ) : (
                      <>
                        <button type="button" className="inline-ai-btn" onClick={() => apply('insert')}>
                          {t('aiInline.insertBelow')}
                        </button>
                        <button type="button" className="inline-ai-btn inline-ai-btn-primary" onClick={() => apply('replace')}>
                          {t('aiInline.replace')}
                        </button>
                      </>
                    )}
                  </>
                )}
                {!streaming && (
                  <button type="button" className="inline-ai-btn inline-ai-btn-ghost" onClick={onClose}>
                    {t('aiInline.discard')}
                  </button>
                )}
              </div>
            </>
          )}
    </div>,
    document.body,
  )
}
