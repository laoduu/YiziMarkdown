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
import { ArrowUp, Check, Copy, GripHorizontal, History, Plus, RotateCcw, Square, Trash2, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'
import { providerById } from '../lib/ai-providers'
import { writeClipboardText } from '../lib/clipboard'
import { startAIStream, type AIStreamHandle } from '../lib/aiStream'
import {
  MAX_CONTEXT_CHARS,
  MAX_SELECTION_CHARS,
  buildInlineMessages,
  diffLines,
  extractSection,
  pickInlineIntents,
  truncateSelection,
  type ChatPayloadMessage,
  type DiffLine,
  type InlineIntentId,
} from '../lib/inlineAI'
import {
  appendRecord,
  buildHistoryRecord,
  deleteRecord,
  listRecords,
  loadHistory,
  withHistory,
  type InlineAIHistoryRecord,
} from '../lib/inlineAIHistory'

type Phase = 'compose' | 'streaming' | 'review' | 'error'

interface InlineAIPanelProps {
  /** 选区末尾的视口坐标；boundLeft/Right 限制在正文列内，避免压到左侧边栏 */
  anchor: { x: number; y: number; boundLeft?: number; boundRight?: number }
  /** rewrite：改写选中内容；create：在光标处按指令创作 */
  mode?: 'rewrite' | 'create'
  originalText: string
  /** 当前文档全文（用于「附加上下文」） */
  documentText?: string
  /** 选区起点在文档中的偏移（用于定位当前小节） */
  selectionOffset?: number
  /** 来自划词技能：技能名（用于浮层上的角标）与提示词 */
  skillName?: string
  skillPrompt?: string
  /** 技能直通：预置指令并自动执行 */
  initialInstruction?: string
  autoRun?: boolean
  /** 成功后由调用方关闭浮层并提示（已写入正文，可 Ctrl+Z 撤销） */
  onApply: (kind: 'replace' | 'insert', text: string) => boolean
  /** 文档键：会话历史按它归档（Editor 从 activeTab 解析；空 = 不记历史） */
  docKey?: string
  /** 把历史记录的结果写回正文；返回是否成功 */
  onApplyHistory?: (record: InlineAIHistoryRecord) => boolean
  /** 对比原文：把 diff 交给编辑器在正文里就地展示；null = 关闭 */
  onDiff?: (lines: DiffLine[] | null) => void
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
  documentText = '',
  selectionOffset = 0,
  skillName,
  skillPrompt,
  initialInstruction,
  autoRun = false,
  onApply,
  docKey,
  onApplyHistory,
  onDiff,
  onClose,
}: InlineAIPanelProps) {
  const { t, lang } = useI18n()
  const isCreate = mode === 'create'
  const { aiProvider, aiModel, aiBaseUrl, aiApiFormat } = useSettingsStore()
  const provider = providerById(aiProvider)
  const intentLang: 'zh' | 'en' = String(lang).startsWith('zh') ? 'zh' : 'en'

  const [instruction, setInstruction] = useState(initialInstruction ?? '')
  const [followUp, setFollowUp] = useState('')
  const [ctx, setCtx] = useState<'none' | 'section' | 'document'>('none')
  const [ctxMenuOpen, setCtxMenuOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('compose')
  const [result, setResult] = useState('')
  const [thinking, setThinking] = useState('')
  const [error, setError] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [truncated, setTruncated] = useState(false)
  /** 思考过程：流式期间默认展开，正文首帧到达后收折（仍可手动展开） */
  const [thinkingOpen, setThinkingOpen] = useState(true)
  const thinkingCollapsedRef = useRef(false)
  const thinkingBodyRef = useRef<HTMLDivElement>(null)
  // 思考内容持续增长时保持贴底，最新一行始终可见；用户主动上翻阅读时不打扰
  useEffect(() => {
    const el = thinkingBodyRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) {
      el.scrollTop = el.scrollHeight
    }
  }, [thinking, thinkingOpen])
  /** 输入区手动调高（像素；null = 默认 rows 高度） */
  const [inputH, setInputH] = useState<number | null>(null)
  const resizeRef = useRef<{ y: number; h: number } | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  /** 用户拖动后的位置；一旦拖动，就不再跟随选区锚点 */
  const [manualPos, setManualPos] = useState<{ left: number; top: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; left: number; top: number } | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const streamRef = useRef<AIStreamHandle | null>(null)
  const resultRef = useRef('')
  const busyRef = useRef(false)
  const autoRanRef = useRef(false)
  /** 多轮「补充需求」的对话上下文：system + 首轮指令 + 历次指令/结果 */
  const historyRef = useRef<ChatPayloadMessage[]>([])
  /** 当前这轮生成对应的指令（首轮 run / 补充需求 refine 各自设置），落历史记录用 */
  const pendingInstructionRef = useRef('')
  /** 历史面板（compose 态，浮层内向下展开） */
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyRecords, setHistoryRecords] = useState<InlineAIHistoryRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** 详情区的长指令（如完整 skill prompt）默认收成几行，点击展开 */
  const [instrExpanded, setInstrExpanded] = useState(false)
  useEffect(() => {
    setInstrExpanded(false)
  }, [selectedId])
  /** 关掉浮层时要清掉正文里的 diff 装饰，用 ref 拿最新的回调 */
  const onDiffRef = useRef(onDiff)
  onDiffRef.current = onDiff

  const intents = pickInlineIntents(originalText)
  const streaming = phase === 'streaming'

  /* ---------- 定位：优先放在选区下方，空间不足翻到上方 ---------- */
  // pos 的 ref 镜像：place 里要读「当前顶边」，放 ref 避免进依赖导致 place 每帧重建
  const posRef = useRef<{ left: number; top: number } | null>(null)
  const manualPosRef = useRef(manualPos)
  manualPosRef.current = manualPos

  const place = useCallback(() => {
    const el = panelRef.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const margin = 8
    const vh = window.innerHeight
    // 水平方向限制在正文列内：选区起点常在行首，直接用视口夹取会把浮层推到左边栏上
    const minLeft = Math.max(margin, anchor.boundLeft ?? margin)
    const maxLeft = Math.max(
      minLeft,
      Math.min(window.innerWidth - w - margin, (anchor.boundRight ?? window.innerWidth) - w),
    )
    const left = Math.max(minLeft, Math.min(anchor.x, maxLeft))

    const prev = posRef.current
    // 当前显示中的顶边（拖动后以 manualPos 为准），粘滞它而不是每次按锚点重算
    const shownTop = manualPosRef.current?.top ?? prev?.top ?? null
    let top: number
    if (shownTop != null) {
      // 已放置过：顶边保持不动，只有底边出屏时才上收。
      // 内容高度变化（切历史记录、展开思考）只在限高里消化，面板不再来回位移。
      top = Math.max(margin, Math.min(shownTop, vh - h - margin))
    } else {
      top = anchor.y + 12
      if (top + h > vh - margin) top = Math.max(margin, anchor.y - h - 12)
      // 选区末尾可能在视口外（长选区）：上面/下面都放不下时，硬夹回视口内
      top = Math.max(margin, Math.min(top, vh - h - margin))
    }

    // 历史区限高：按最终顶边倒推可用高度，装不下就在自己的滚动区里消化
    const body = el.querySelector<HTMLElement>('.inline-ai-history-body')
    if (body) {
      const overhead = h - body.offsetHeight
      const cap = Math.max(0, Math.round(vh - top - margin - overhead))
      if (body.style.getPropertyValue('--hist-cap') !== `${cap}px`) {
        body.style.setProperty('--hist-cap', `${cap}px`)
      }
    }

    if (!prev || prev.left !== left || prev.top !== top) {
      posRef.current = { left, top }
      setPos({ left, top })
    }
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

  /* ---------- 拖动：抓住顶部手柄移动浮层 ---------- */
  const clampToViewport = (left: number, top: number) => {
    const el = panelRef.current
    const w = el?.offsetWidth ?? 0
    const h = el?.offsetHeight ?? 0
    const margin = 8
    return {
      left: Math.max(margin, Math.min(left, window.innerWidth - w - margin)),
      top: Math.max(margin, Math.min(top, window.innerHeight - h - margin)),
    }
  }

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = panelRef.current
    if (!el) return
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, left: rect.left, top: rect.top }
    setManualPos({ left: rect.left, top: rect.top })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setManualPos(clampToViewport(
      drag.left + e.clientX - drag.startX,
      drag.top + e.clientY - drag.startY,
    ))
  }

  const onDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  // 拖动过之后，窗口缩放仍要保证浮层在视口内
  useEffect(() => {
    if (!manualPos) return
    const onResize = () => setManualPos((p) => (p ? clampToViewport(p.left, p.top) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [manualPos])

  /* ---------- 底部手柄：上下拖动调高输入区 ---------- */
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    resizeRef.current = { y: e.clientY, h: textareaRef.current?.offsetHeight ?? 92 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current
    if (!r) return
    setInputH(Math.max(80, Math.min(480, r.h + (e.clientY - r.y))))
  }
  const onResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    resizeRef.current = null
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  // 拖动过之后，结果变长导致浮层变高时也要夹回视口（不能用 manualPos 作依赖，避免循环）
  useEffect(() => {
    setManualPos((prev) => {
      if (!prev) return prev
      const next = clampToViewport(prev.left, prev.top)
      return next.left === prev.left && next.top === prev.top ? prev : next
    })
  }, [phase, compareOpen, result.length])

  // 面板可见后再聚焦一次：首帧 visibility:hidden 的元素 focus() 会被浏览器忽略，
  // 顶部星芒 / 快捷键打开时输入框必须直接可打字（autoRun 技能直通时没有输入框，跳过）
  const focusRequestedRef = useRef(false)
  useEffect(() => {
    if (focusRequestedRef.current || (!pos && !manualPos)) return
    focusRequestedRef.current = true
    if (phase === 'compose') textareaRef.current?.focus()
  }, [pos, manualPos, phase])

  // 卸载时取消请求并释放监听器；正文里的 diff 也必须一起撤掉
  useEffect(() => {
    return () => {
      onDiffRef.current?.(null)
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

  /** 上下文最多保留 9 条：保留 system / 首轮用户消息与最近几轮，避免多轮改写后无限增长 */
  const MAX_HISTORY_MESSAGES = 9
  const trimHistory = (messages: ChatPayloadMessage[]): ChatPayloadMessage[] => {
    if (messages.length <= MAX_HISTORY_MESSAGES) return messages
    const firstUser = messages.findIndex((m) => m.role === 'user')
    const head = firstUser >= 0 ? firstUser + 1 : 1
    const tail = MAX_HISTORY_MESSAGES - head
    if (tail <= 0) return messages.slice(0, MAX_HISTORY_MESSAGES)
    return [...messages.slice(0, head), ...messages.slice(-tail)]
  }

  /** 进入 review（含保留半截结果的取消）时落一条会话历史；空结果 / 无文档键不写 */
  const persistHistory = (fullText: string, status: 'complete' | 'partial') => {
    if (!docKey || !fullText.trim()) return
    try {
      const record = buildHistoryRecord({
        mode,
        skillName,
        ctx,
        instruction: pendingInstructionRef.current,
        originalSelection: originalText,
        result: fullText,
        from: selectionOffset,
        to: selectionOffset + originalText.length,
        status,
      })
      withHistory((s) => appendRecord(s, docKey, record))
    } catch {
      // 历史可弃：写入失败绝不打断生成流程
    }
  }

  const startStream = async (messages: ChatPayloadMessage[]) => {
    busyRef.current = true
    setPhase('streaming')
    // 生成开始即收起历史（compose 区段会卸载；重新打开时 refreshHistory 拿最新列表）
    setHistoryOpen(false)
    setHistoryRecords([])
    setSelectedId(null)
    // 新一轮：思考过程重新默认展开，正文首帧到达时才收折
    setThinkingOpen(true)
    thinkingCollapsedRef.current = false
    setResult('')
    setThinking('')
    setError('')
    setCopied(false)
    setCompareOpen(false)
    onDiffRef.current?.(null)
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
          // 正文开始输出：思考过程收折（用户仍可点开）
          if (!thinkingCollapsedRef.current) {
            thinkingCollapsedRef.current = true
            setThinkingOpen(false)
          }
        },
        onThinking: (chunk) => setThinking((prev) => prev + chunk),
        onDone: (fullText) => {
          resultRef.current = fullText
          historyRef.current = trimHistory([...historyRef.current, { role: 'assistant', content: fullText }])
          setResult(fullText)
          setPhase('review')
          busyRef.current = false
          streamRef.current = null
          persistHistory(fullText, 'complete')
        },
        onError: (message) => {
          streamRef.current = null
          busyRef.current = false
          if (message === 'cancelled') {
            if (resultRef.current.trim()) {
              // 已生成的半截内容按结果保留，后续「补充需求」仍能在它基础上继续
              historyRef.current = trimHistory([...historyRef.current, { role: 'assistant', content: resultRef.current }])
              setPhase('review')
              persistHistory(resultRef.current, 'partial')
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
    setCtxMenuOpen(false)
    pendingInstructionRef.current = text
    const payload = isCreate ? { text: '', truncated: false } : truncateSelection(originalText)
    setTruncated(payload.truncated)
    const contextText = ctx === 'document'
      ? documentText.slice(0, MAX_CONTEXT_CHARS)
      : ctx === 'section'
        ? extractSection(documentText, selectionOffset).slice(0, MAX_CONTEXT_CHARS)
        : null
    const messages = buildInlineMessages(text, isCreate ? null : payload.text, contextText, skillPrompt)
    historyRef.current = messages
    void startStream(messages)
  }

  // 技能直通：打开浮层即按技能提示词执行一次（ref 防止 StrictMode / 重渲染重复触发）
  useEffect(() => {
    if (autoRanRef.current || !autoRun) return
    autoRanRef.current = true
    const text = (initialInstruction ?? '').trim()
    if (text) run(text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, initialInstruction])

  /** 补充需求：在已有结果的基础上继续改 */
  const refine = () => {    const text = followUp.trim()
    if (!text || busyRef.current || historyRef.current.length === 0) return
    setFollowUp('')
    pendingInstructionRef.current = text
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

  const toggleCompare = () => {
    if (isCreate || !result.trim()) return
    const next = !compareOpen
    setCompareOpen(next)
    onDiffRef.current?.(next ? diffLines(originalText, result) : null)
  }

  const chooseContext = (next: 'none' | 'section' | 'document') => {
    setCtx(next)
    setCtxMenuOpen(false)
  }
  const ctxLabel = ctx === 'section'
    ? t('aiInline.ctxSection')
    : ctx === 'document'
      ? t('aiInline.ctxDocument')
      : t('aiInline.ctxAdd')

  /* ---------- 会话历史（浮层内向下展开：左列表右详情） ---------- */
  const applyHistoryList = (list: InlineAIHistoryRecord[]) => {
    setHistoryRecords(list)
    // 选中项被删 / 不在列表里时回落到第一条，右栏始终有内容可看
    setSelectedId((prev) => (prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? null))
  }

  const refreshHistory = () => {
    if (!docKey) {
      setHistoryRecords([])
      setSelectedId(null)
      return
    }
    applyHistoryList(listRecords(loadHistory(), docKey))
  }

  const toggleHistory = () => {
    const next = !historyOpen
    setHistoryOpen(next)
    setCtxMenuOpen(false)
    if (next) refreshHistory()
    else {
      setHistoryRecords([])
      setSelectedId(null)
    }
  }

  const insertFromHistory = (record: InlineAIHistoryRecord) => {
    if (!onApplyHistory?.(record)) return
    onClose()
  }

  const copyFromHistory = (record: InlineAIHistoryRecord) => {
    void writeClipboardText(record.result)
  }

  const deleteFromHistory = (record: InlineAIHistoryRecord) => {
    if (!docKey) return
    withHistory((s) => deleteRecord(s, docKey, record.id))
    refreshHistory()
  }

  const historyModeLabel = (record: InlineAIHistoryRecord) =>
    record.mode === 'create'
      ? t('aiInline.historyModeCreate')
      : record.mode === 'skill'
        ? (record.skillName || t('aiInline.historyModeSkill'))
        : null

  const apply = (kind: 'replace' | 'insert') => {
    if (!result.trim()) return
    if (!onApply(kind, result)) return
    // 写入成功后立即关闭：浮层正好盖在写回位置上方，留着会挡住用户看结果
    onClose()
  }

  return createPortal(
    <div
      ref={panelRef}
      className="inline-ai-panel"
      style={{
        left: (manualPos ?? pos)?.left ?? anchor.x,
        top: (manualPos ?? pos)?.top ?? anchor.y,
        visibility: manualPos || pos ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label={t('selection.askAI')}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="inline-ai-drag"
        title={t('aiInline.drag')}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <GripHorizontal size={14} />
      </div>
      <button type="button" className="inline-ai-close" onClick={onClose} title={t('aiInline.close')} aria-label={t('aiInline.close')}>
        <X size={13} />
      </button>

      {skillName && (
        <div className="inline-ai-skill">{t('aiInline.skillBadge', { name: skillName })}</div>
      )}

      {phase === 'compose' && (
            <>
              <textarea
                ref={textareaRef}
                className="inline-ai-input"
                rows={2}
                value={instruction}
                style={inputH ? { height: inputH } : undefined}
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
                <div className="inline-ai-meta-left">
                  <div className="inline-ai-ctx">
                    <button
                      type="button"
                      className={`inline-ai-ctx-btn ${ctx !== 'none' ? 'is-active' : ''}`}
                      onClick={() => setCtxMenuOpen((v) => !v)}
                      title={t('aiInline.ctxAdd')}
                    >
                      <Plus size={11} /> {ctxLabel}
                    </button>
                    {ctxMenuOpen && (
                      <div className="inline-ai-ctx-menu">
                        <button type="button" onClick={() => chooseContext('section')}>{t('aiInline.ctxSection')}</button>
                        <button type="button" onClick={() => chooseContext('document')}>{t('aiInline.ctxDocument')}</button>
                        {ctx !== 'none' && (
                          <button type="button" onClick={() => chooseContext('none')}>{t('aiInline.ctxNone')}</button>
                        )}
                      </div>
                    )}
                  </div>
                  {!isCreate && !skillPrompt && intents.length > 0 && (
                    <div className="inline-ai-chips">
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
                </div>
                <div className="inline-ai-meta-right">
                  <button
                    type="button"
                    className={`inline-ai-ctx-btn ${historyOpen ? 'is-active' : ''}`}
                    onClick={toggleHistory}
                    title={t('aiInline.history')}
                    aria-label={t('aiInline.history')}
                  >
                    <History size={11} />
                  </button>
                  {truncated
                    ? <span className="inline-ai-chars" style={{ color: 'var(--editor-accent)' }}>{t('aiInline.truncated', { count: MAX_SELECTION_CHARS })}</span>
                    : !isCreate
                      ? <span className="inline-ai-chars">{t('aiInline.selectedChars', { count: originalText.length })}</span>
                      : null}
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
              </div>
              {/* 历史：在浮层内部向下展开（不是叠加弹窗），左列表右详情 */}
              {historyOpen && (
                <div className="inline-ai-history-panel">
                  <div className="inline-ai-history-head">
                    <span>{t('aiInline.history')}</span>
                    <button
                      type="button"
                      className="inline-ai-close"
                      onClick={toggleHistory}
                      title={t('aiInline.close')}
                      aria-label={t('aiInline.close')}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="inline-ai-history-body">
                    <div className="inline-ai-history-list">
                      {historyRecords.length === 0 ? (
                        <div className="inline-ai-history-empty">{t('aiInline.historyEmpty')}</div>
                      ) : (
                        historyRecords.map((record) => (
                          <button
                            key={record.id}
                            type="button"
                            className={`inline-ai-history-item ${selectedId === record.id ? 'is-active' : ''}`}
                            onClick={() => setSelectedId(record.id)}
                          >
                            <span className="inline-ai-history-instruction">{record.instruction}</span>
                            <span className="inline-ai-history-meta">
                              <time dateTime={new Date(record.ts).toISOString()}>
                                {new Date(record.ts).toLocaleString()}
                              </time>
                              {historyModeLabel(record) && (
                                <span className="inline-ai-history-badge">{historyModeLabel(record)}</span>
                              )}
                              {record.status === 'partial' && (
                                <span className="inline-ai-history-badge">{t('aiInline.historyPartial')}</span>
                              )}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="inline-ai-history-detail-pane">
                      {(() => {
                        const selected = historyRecords.find((r) => r.id === selectedId)
                        if (!selected) {
                          return <div className="inline-ai-history-empty">{t('aiInline.historyEmpty')}</div>
                        }
                        return (
                          <>
                            <div className="inline-ai-history-meta">
                              <time dateTime={new Date(selected.ts).toISOString()}>
                                {new Date(selected.ts).toLocaleString()}
                              </time>
                              {historyModeLabel(selected) && (
                                <span className="inline-ai-history-badge">{historyModeLabel(selected)}</span>
                              )}
                              {selected.status === 'partial' && (
                                <span className="inline-ai-history-badge">{t('aiInline.historyPartial')}</span>
                              )}
                            </div>
                            <div
                              className={`inline-ai-history-instruction-full ${instrExpanded ? 'is-expanded' : ''}`}
                              onClick={() => setInstrExpanded((v) => !v)}
                            >
                              {selected.instruction}
                            </div>
                            <pre className="inline-ai-history-result">{selected.result}</pre>
                            <div className="inline-ai-history-actions">
                              <button type="button" className="inline-ai-btn" onClick={() => insertFromHistory(selected)}>
                                {t('aiInline.historyInsert')}
                              </button>
                              <button type="button" className="inline-ai-btn" onClick={() => copyFromHistory(selected)}>
                                {t('aiInline.historyCopy')}
                              </button>
                              <button
                                type="button"
                                className="inline-ai-btn inline-ai-btn-ghost"
                                onClick={() => deleteFromHistory(selected)}
                              >
                                <Trash2 size={11} /> {t('aiInline.historyDelete')}
                              </button>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )}
              {/* 底部调高手柄：上下拖动改变输入区高度 */}
              <div
                className="inline-ai-resize"
                title={t('aiInline.resize')}
                onPointerDown={onResizeDown}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeUp}
                onPointerCancel={onResizeUp}
              />
            </>
          )}

          {(phase === 'streaming' || phase === 'review' || phase === 'error') && (
            <>
              {(streaming || result) && (
                <pre className="inline-ai-pre inline-ai-result">
                  {result || t('aiInline.generating')}
                  {streaming && result && <span className="inline-ai-caret" />}
                </pre>
              )}

              {thinking && (
                <details
                  className="inline-ai-thinking"
                  open={thinkingOpen}
                  onToggle={(e) => setThinkingOpen(e.currentTarget.open)}
                >
                  <summary>{t('aiInline.thinking')}</summary>
                  <div ref={thinkingBodyRef}>{thinking}</div>
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
                      <button
                        type="button"
                        className={`inline-ai-btn ${compareOpen ? 'is-active' : ''}`}
                        onClick={toggleCompare}
                      >
                        {compareOpen ? t('aiInline.compareOff') : t('aiInline.compare')}
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
