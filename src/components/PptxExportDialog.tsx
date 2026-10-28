/**
 * PptxExportDialog.tsx — 「导出 PPTX」弹窗（工具栏 / 演示 HUD 共用同一个组件）。
 *
 * 入口差异只有一处：HUD 入口带 `currentSlide`（可只导当前页、且已经看得到演示效果）；
 * 工具栏入口没有它（此时提供「先看演示效果」按钮）。
 *
 * 为什么先选保存路径再生成：生成要逐页在 1280×720 里重排 + 栅格化图表，耗时肉眼可见；
 * 让用户在选路径阶段就取消，比转完再 Cancel 更符合预期。
 *
 * 通过 createPortal 挂到 body：HUD 入口时组件树处在 `.yizi-slideshow`（z-index 10000）里，
 * 普通 fixed 弹窗会被整层盖住。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, FileDown, Loader2, Play, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'
import { invokeTauri, invokeTauriOrThrow } from '../lib/tauri'
import { exportPptx, type PptxExportResult, type PptxOverflowMode } from '../lib/pptxExport'
import { deriveExportBaseName } from '../lib/exportName'
import { parseDeck } from '../lib/slideDeck'
import type { SlideTypography } from '../lib/slideTypography'
import type { SlideColAlign, SlideColStyle } from '../lib/slideColumns'
import type { PptxWarning } from '../lib/pptxTypes'

export interface PptxExportSource {
  content: string
  title: string
  /** 当前文档的本地路径（已保存时用于沿用原文件名，null = 未保存） */
  filePath?: string | null
  theme: string
  dark: boolean
  customCssBase?: string
  colStyle: SlideColStyle
  colAlign: SlideColAlign
  enabledPlugins: string[]
  pluginConfigs: Record<string, Record<string, unknown>>
  docBaseDir?: string | null
  /** 演示 HUD 当前页（0-based）；工具栏入口为 undefined */
  currentSlide?: number
}

interface Props {
  open: boolean
  onClose: () => void
  source: PptxExportSource
  /** 「先看演示效果」（工具栏入口）：一般由 App 启动演示 */
  onPreview?: () => void
  /** 点告警里的页码跳页（0-based）；一般由 App 启动演示并定位 */
  onJumpToSlide?: (index: number) => void
}

type RangeMode = 'all' | 'current' | 'custom'

interface Progress {
  pct: number
  text: string
}

const Z_INDEX = 10050

function sanitizeFileName(name: string): string {
  return (name || 'slides').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'slides'
}

async function toBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

export default function PptxExportDialog({ open, onClose, source, onPreview, onJumpToSlide }: Props) {
  const { t } = useI18n()
  const hintSeen = useSettingsStore((s) => s.pptxExportHintSeen)
  const includeNotes = useSettingsStore((s) => s.pptxIncludeNotes)
  const includeFooter = useSettingsStore((s) => s.pptxIncludeFooter)
  const overflowMode = useSettingsStore((s) => s.pptxOverflowMode)
  const setField = useSettingsStore((s) => s.setField)
  const slideFontFamily = useSettingsStore((s) => s.slideFontFamily)
  const slideFontWeight = useSettingsStore((s) => s.slideFontWeight)
  const slideFontScale = useSettingsStore((s) => s.slideFontScale)
  const slideFillWidth = useSettingsStore((s) => s.slideFillWidth)
  const slideFillHeight = useSettingsStore((s) => s.slideFillHeight)

  // 总页数由内容现算（与演示/导出同源）：外部只传 Markdown 源，
  // 避免 App 再解析一次造成两份「页数」不一致。
  const totalSlides = useMemo(
    () => parseDeck(source.content, source.title).slides.length,
    [source.content, source.title],
  )

  const [rangeMode, setRangeMode] = useState<RangeMode>('all')
  const [customStart, setCustomStart] = useState(1)
  const [customEnd, setCustomEnd] = useState(Math.max(1, totalSlides))
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ path: string; count: number } | null>(null)
  const [warnings, setWarnings] = useState<PptxWarning[]>([])
  const [overflowSlides, setOverflowSlides] = useState<number[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const hasCurrent = typeof source.currentSlide === 'number'

  // 每次打开重置
  useEffect(() => {
    if (!open) return
    setRangeMode('all')
    setCustomStart(1)
    setCustomEnd(Math.max(1, totalSlides))
    setBusy(false)
    setProgress(null)
    setError(null)
    setResult(null)
    setWarnings([])
    setOverflowSlides([])
    abortRef.current = null
  }, [open, totalSlides])

  // Esc：未在导出时关闭（导出中 Esc 取消）
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (busy) abortRef.current?.abort()
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  useEffect(() => () => abortRef.current?.abort(), [])

  const typography: Partial<SlideTypography> = {
    fontFamily: slideFontFamily,
    fontWeight: slideFontWeight,
    fontScale: slideFontScale,
    fillWidth: slideFillWidth,
    fillHeight: slideFillHeight,
  }

  const mermaidTheme = String(
    (source.pluginConfigs?.mermaid as Record<string, unknown> | undefined)?.theme ?? 'default',
  )

  const startExport = useCallback(async () => {
    if (busy) return
    setError(null)
    setResult(null)
    setWarnings([])
    setOverflowSlides([])

    const total = Math.max(1, totalSlides)
    // 默认文件名与其它导出同一口径：已保存文件的文件名 → 文档标题 → slides
    const defaultName = `${sanitizeFileName(
      deriveExportBaseName({ content: source.content, filePath: source.filePath, fallback: 'slides' }),
    )}.pptx`
    let path: string | null = null
    try {
      path = await invokeTauri<string | null>('save_file_dialog', {
        fileName: defaultName,
        extensions: ['pptx'],
      })
    } catch (e) {
      setError(String((e as Error).message || e))
      return
    }
    if (!path) return
    if (!/\.pptx$/i.test(path)) path += '.pptx'

    let range: { start: number; end: number } | undefined
    if (rangeMode === 'current' && typeof source.currentSlide === 'number') {
      range = { start: source.currentSlide, end: source.currentSlide }
    } else if (rangeMode === 'custom') {
      const s = Math.max(1, Math.min(total, customStart))
      const e = Math.max(1, Math.min(total, customEnd))
      range = { start: Math.min(s, e) - 1, end: Math.max(s, e) - 1 }
    }

    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setProgress({ pct: 3, text: t('pptxExport.stepPrepare') })

    try {
      const res: PptxExportResult = await exportPptx({
        content: source.content,
        fallbackTitle: source.title,
        theme: source.theme,
        dark: source.dark,
        customCssBase: source.customCssBase,
        typography,
        colStyle: source.colStyle,
        colAlign: source.colAlign,
        enabledPlugins: source.enabledPlugins,
        pluginConfigs: source.pluginConfigs,
        mermaidTheme,
        docBaseDir: source.docBaseDir ?? null,
        includeNotes,
        includeFooter,
        overflowMode: overflowMode as PptxOverflowMode,
        range,
        signal: controller.signal,
        onProgress: (done, count, label) => {
          if (label === 'render') {
            setProgress({
              pct: 5 + (count ? done / count : 0) * 55,
              text: t('pptxExport.stepRender', { done, total: count }),
            })
          } else if (label === 'math') {
            setProgress({ pct: 62, text: t('pptxExport.stepMath') })
          } else {
            setProgress({
              pct: 65 + (count ? done / count : 0) * 28,
              text: t('pptxExport.stepBuild'),
            })
          }
        },
      })

      setProgress({ pct: 96, text: t('pptxExport.stepSave') })
      const base64 = await toBase64(res.buffer)
      await invokeTauriOrThrow<void>('save_binary_file', { path, base64 })

      setProgress({ pct: 100, text: t('pptxExport.done') })
      setWarnings(res.warnings)
      setOverflowSlides(res.overflowSlides)
      setResult({ path, count: res.slideCount })
    } catch (e) {
      const err = e as Error
      if (err?.name === 'AbortError') setError(t('pptxExport.cancelled'))
      else setError(t('pptxExport.failed', { message: err?.message || String(e) }))
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }, [
    busy, source, rangeMode, customStart, customEnd, t,
    includeNotes, includeFooter, overflowMode,
    slideFontFamily, slideFontWeight, slideFontScale, slideFillWidth, slideFillHeight, mermaidTheme,
  ])

  if (!open) return null

  const jump = (page: number) => {
    onJumpToSlide?.(page - 1)
    onClose()
  }

  const overlay = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: Z_INDEX, background: 'var(--overlay-bg)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative border rounded-pop overflow-hidden animate-dialog-in flex flex-col"
        style={{
          width: 560,
          maxHeight: '86vh',
          background: 'var(--dialog-bg)',
          borderColor: 'var(--dialog-border)',
          boxShadow: 'var(--dialog-shadow)',
        }}
      >
        <div className="flex items-center justify-between px-4 h-11 border-b border-[var(--editor-border)] shrink-0">
          <span className="text-sm font-semibold text-[var(--editor-text)] flex items-center gap-2">
            <FileDown size={15} />
            {t('pptxExport.title')}
          </span>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)] disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto text-[12px] text-[var(--editor-text)]">
          {!hintSeen && (
            <div
              className="mb-3 rounded-lg border px-3 py-2.5"
              style={{ background: 'var(--editor-surface)', borderColor: 'var(--editor-border)' }}
            >
              <div className="font-semibold mb-1">{t('pptxExport.hintTitle')}</div>
              <ul className="list-disc pl-5 space-y-0.5 text-[var(--sidebar-text)] leading-relaxed">
                <li>{t('pptxExport.hint1')}</li>
                <li>{t('pptxExport.hint2')}</li>
                <li>{t('pptxExport.hint3')}</li>
              </ul>
              <button
                onClick={() => setField('pptxExportHintSeen', true)}
                className="mt-2 px-2 py-1 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)]"
              >
                {t('pptxExport.hintDontShow')}
              </button>
            </div>
          )}

          <p className="text-[var(--sidebar-text)] leading-relaxed mb-3">{t('pptxExport.desc')}</p>

          {/* 范围 */}
          <div className="mb-3">
            <div className="font-semibold mb-1.5">{t('pptxExport.range')}</div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={rangeMode === 'all'} onChange={() => setRangeMode('all')} />
                {t('pptxExport.rangeAll', { n: totalSlides })}
              </label>
              {hasCurrent && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={rangeMode === 'current'} onChange={() => setRangeMode('current')} />
                  {t('pptxExport.rangeCurrent', { n: (source.currentSlide || 0) + 1 })}
                </label>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={rangeMode === 'custom'} onChange={() => setRangeMode('custom')} />
                {t('pptxExport.rangeCustom')}
              </label>
              {rangeMode === 'custom' && (
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={totalSlides}
                    value={customStart}
                    onChange={(e) => setCustomStart(Number(e.target.value) || 1)}
                    className="w-14 px-1.5 py-0.5 rounded border border-[var(--editor-border)] bg-[var(--editor-bg)]"
                  />
                  <span className="opacity-60">–</span>
                  <input
                    type="number"
                    min={1}
                    max={totalSlides}
                    value={customEnd}
                    onChange={(e) => setCustomEnd(Number(e.target.value) || 1)}
                    className="w-14 px-1.5 py-0.5 rounded border border-[var(--editor-border)] bg-[var(--editor-bg)]"
                  />
                </span>
              )}
            </div>
          </div>

          {/* 内容 */}
          <div className="mb-3 space-y-1.5">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={(e) => setField('pptxIncludeNotes', e.target.checked)}
              />
              {t('pptxExport.notes')}
              <span className="text-[var(--sidebar-text)]">{t('pptxExport.notesHint')}</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeFooter}
                onChange={(e) => setField('pptxIncludeFooter', e.target.checked)}
              />
              {t('pptxExport.footer')}
              <span className="text-[var(--sidebar-text)]">{t('pptxExport.footerHint')}</span>
            </label>
          </div>

          {/* 超页 */}
          <div className="mb-1">
            <div className="font-semibold mb-1.5">{t('pptxExport.overflow')}</div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={overflowMode === 'warn'}
                  onChange={() => setField('pptxOverflowMode', 'warn')}
                />
                {t('pptxExport.overflowWarn')}
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={overflowMode === 'shrink'}
                  onChange={() => setField('pptxOverflowMode', 'shrink')}
                />
                {t('pptxExport.overflowShrink')}
              </label>
            </div>
            <div className="text-[11px] text-[var(--sidebar-text)] mt-1">{t('pptxExport.overflowHint')}</div>
          </div>

          {onPreview && !hasCurrent && (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => { onClose(); onPreview() }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)]"
              >
                <Play size={13} />
                {t('pptxExport.preview')}
              </button>
              <span className="text-[11px] text-[var(--sidebar-text)]">{t('pptxExport.previewHint')}</span>
            </div>
          )}

          {/* 进度 / 结果 / 错误 */}
          {progress && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1 text-[var(--sidebar-text)]">
                {busy && <Loader2 size={13} className="animate-spin" />}
                <span>{progress.text}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--editor-surface)' }}>
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${Math.max(0, Math.min(100, progress.pct))}%`, background: 'var(--editor-accent)' }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 text-[var(--editor-error,#dc2626)]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {result && (
            <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--editor-border)' }}>
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 size={14} style={{ color: 'var(--editor-success,#16a34a)' }} />
                {t('pptxExport.success', { n: result.count })}
              </div>
              <div className="mt-1 break-all text-[11px] text-[var(--sidebar-text)]">{result.path}</div>
            </div>
          )}

          {(warnings.length > 0 || overflowSlides.length > 0) && (
            <div className="mt-3">
              <div className="font-semibold flex items-center gap-1.5 mb-1">
                <AlertTriangle size={13} style={{ color: 'var(--editor-warning,#d97706)' }} />
                {t('pptxExport.warnings')}
              </div>
              {overflowSlides.length > 0 && (
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[var(--sidebar-text)]">{t('pptxExport.overflowPages')}</span>
                  {overflowSlides.map((p) => (
                    <button
                      key={p}
                      onClick={() => jump(p)}
                      className="px-1.5 py-0.5 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)]"
                      title={t('pptxExport.jump')}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {warnings.map((w, i) => (
                  <li key={i} className="text-[11px] text-[var(--sidebar-text)] leading-relaxed flex flex-wrap items-center gap-1">
                    {w.slide && (
                      <button
                        onClick={() => jump(w.slide!)}
                        className="px-1 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)]"
                        title={t('pptxExport.jump')}
                      >
                        {t('pptxExport.pageN', { n: w.slide })}
                      </button>
                    )}
                    <span>{w.messageKey ? t(w.messageKey, w.messageArgs) : w.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--editor-border)] flex items-center justify-end gap-2 shrink-0">
          {busy ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="px-3 py-1.5 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)]"
            >
              {t('pptxExport.cancelExport')}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)]"
            >
              {result ? t('common.close') : t('common.cancel')}
            </button>
          )}
          <button
            onClick={startExport}
            disabled={busy}
            className="px-3 py-1.5 rounded text-white disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: 'var(--editor-accent)' }}
          >
            <FileDown size={14} />
            {busy ? t('pptxExport.exporting') : t('pptxExport.export')}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
