/**
 * PluginExportDialog — 通用插件导出面板。
 *
 * EPUB / 未来的 PlantUML、LaTeX 等导出插件可以声明 exportOptions，
 * App 只需要知道「插件 id + 导出格式」，面板负责配置、保存路径、进度和告警。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, FileDown, Loader2, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { getPluginById, exportWithPlugin } from '../plugins/registry'
import { invokeTauri, invokeTauriOrThrow } from '../lib/tauri'
import type { PluginConfigField, PluginExportContext, PluginExportWarning } from '../plugins/types'

export interface PluginExportSource {
  content: string
  title: string
  author?: string
  date?: string
  filePath?: string | null
  docBaseDir?: string | null
  bodyHtml: string
  bodyClass: string
  bodyStyle: string
  rootStyle: string
  css: {
    base: string
    math: string
    theme: string
    user: string
    outline: string
  }
  theme: string
  isDark: boolean
  locale: string
}

interface Props {
  open: boolean
  pluginId: string
  format: string
  source: PluginExportSource
  defaultFileName?: string
  onClose: () => void
}

type Value = string | number | boolean

function sanitizeFileName(name: string): string {
  return (name || 'document').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'document'
}

async function toBase64(buffer: Uint8Array): Promise<string> {
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(buffer.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

function fieldValue(field: PluginConfigField, raw: unknown): Value {
  if (field.type === 'checkbox') return Boolean(raw ?? field.defaultValue)
  if (field.type === 'number') {
    const n = Number(raw ?? field.defaultValue)
    return Number.isFinite(n) ? n : Number(field.defaultValue)
  }
  return String(raw ?? field.defaultValue)
}

export default function PluginExportDialog({ open, pluginId, format, source, defaultFileName, onClose }: Props) {
  const { t } = useI18n()
  const plugin = useMemo(() => getPluginById(pluginId), [pluginId])
  const fields = plugin?.exportOptions || []
  const [values, setValues] = useState<Record<string, Value>>({})
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ pct: number; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<PluginExportWarning[]>([])
  const [result, setResult] = useState<{ path: string } | null>(null)
  const abortRef = useRef(false)

  const baseContext = useMemo<PluginExportContext>(() => ({
    content: source.content,
    title: source.title,
    author: source.author,
    date: source.date,
    filePath: source.filePath,
    docBaseDir: source.docBaseDir,
    bodyHtml: source.bodyHtml,
    bodyClass: source.bodyClass,
    bodyStyle: source.bodyStyle,
    rootStyle: source.rootStyle,
    css: source.css,
    theme: source.theme,
    isDark: source.isDark,
    locale: source.locale,
    options: {},
  }), [source])

  // 打开面板 / 切换插件时重置并套默认值
  useEffect(() => {
    if (!open) return
    setBusy(false)
    setProgress(null)
    setError(null)
    setWarnings([])
    setResult(null)
    abortRef.current = false
    const defaults = plugin?.getExportDefaults?.(baseContext) || {}
    const next: Record<string, Value> = {}
    for (const field of fields) next[field.key] = fieldValue(field, defaults[field.key])
    setValues(next)
  }, [open, pluginId, plugin]) // 打开时只初始化一次；source 变化不重置用户选项

  const startExport = useCallback(async () => {
    if (busy || !plugin) return
    setBusy(true)
    setError(null)
    setWarnings([])
    setResult(null)
    setProgress({ pct: 3, text: t('settings.processing') })

    const name = sanitizeFileName(defaultFileName || `${source.title || 'document'}.${format}`)
    let path: string | null = null
    try {
      path = await invokeTauri<string | null>('save_file_dialog', {
        fileName: name,
        extensions: [format],
      })
    } catch (e) {
      setError(String((e as Error).message || e))
      setBusy(false)
      return
    }
    if (!path) { setBusy(false); setProgress(null); return }
    if (!path.toLowerCase().endsWith(`.${format.toLowerCase()}`)) path += `.${format}`

    try {
      const resultData = await exportWithPlugin(pluginId, format, {
        ...baseContext,
        options: values,
        onProgress: (done, total) => {
          if (abortRef.current) return
          const pct = total > 0 ? 5 + (done / total) * 85 : 90
          setProgress({ pct: Math.min(94, pct), text: t('settings.processing') })
        },
      })
      setProgress({ pct: 96, text: t('settings.processing') })
      await invokeTauriOrThrow<void>('save_binary_file', {
        path,
        base64: await toBase64(resultData.bytes),
      })
      setWarnings(resultData.warnings || [])
      setResult({ path })
      setProgress({ pct: 100, text: t('settings.processing') })
    } catch (e) {
      setError((e as Error).message || String(e))
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }, [busy, plugin, pluginId, format, source.title, defaultFileName, baseContext, values, t])

  if (!open || !plugin) return null

  const setValue = (key: string, value: Value) => setValues((prev) => ({ ...prev, [key]: value }))
  const fieldLabel = (f: PluginConfigField) => f.labelKey ? t(f.labelKey) : f.label
  const fieldHint = (f: PluginConfigField) => f.hintKey ? t(f.hintKey) : f.hint

  const overlay = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10050, background: 'var(--overlay-bg)' }}
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
            {plugin.exportTitleKey ? t(plugin.exportTitleKey) : t('pluginExport.title')}
          </span>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)] disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto text-[12px] text-[var(--editor-text)] space-y-3">
          <p className="text-[var(--sidebar-text)] leading-relaxed">
            {plugin.descriptionKey ? t(plugin.descriptionKey) : plugin.description}
          </p>

          {fields.map((field) => (
            <div key={field.key} className="flex items-center gap-4">
              <div className="w-32 shrink-0">
                <span className="text-[12px] text-[var(--editor-text)]">{fieldLabel(field)}</span>
                {fieldHint(field) && (
                  <p className="text-[10px] text-[var(--sidebar-text)] mt-0.5 leading-relaxed">{fieldHint(field)}</p>
                )}
              </div>
              <div className="flex-1 flex justify-end">
                {field.type === 'select' && (
                  <select
                    className="settings-select"
                    value={String(values[field.key] ?? field.defaultValue)}
                    onChange={(e) => setValue(field.key, e.target.value)}
                    disabled={busy}
                  >
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.labelKey ? t(opt.labelKey) : opt.label}</option>
                    ))}
                  </select>
                )}
                {field.type === 'checkbox' && (
                  <input
                    type="checkbox"
                    className="settings-checkbox"
                    checked={Boolean(values[field.key])}
                    onChange={(e) => setValue(field.key, e.target.checked)}
                    disabled={busy}
                  />
                )}
                {field.type === 'number' && (
                  <input
                    type="number"
                    className="settings-input w-24"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={Number(values[field.key] ?? field.defaultValue)}
                    onChange={(e) => setValue(field.key, Number(e.target.value))}
                    disabled={busy}
                  />
                )}
                {field.type === 'text' && (
                  <input
                    type="text"
                    className="settings-input w-56"
                    value={String(values[field.key] ?? field.defaultValue)}
                    onChange={(e) => setValue(field.key, e.target.value)}
                    disabled={busy}
                  />
                )}
              </div>
            </div>
          ))}

          {progress && (
            <div className="pt-1">
              <div className="flex items-center gap-2 mb-1 text-[var(--sidebar-text)]">
                {busy && <Loader2 size={13} className="animate-spin" />}
                <span>{progress.text}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--editor-surface)' }}>
                <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${progress.pct}%`, background: 'var(--editor-accent)' }} />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-[var(--editor-error,#dc2626)]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span className="leading-relaxed">{t('pluginExport.failed', { message: error })}</span>
            </div>
          )}

          {result && (
            <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--editor-border)' }}>
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 size={14} style={{ color: 'var(--editor-success,#16a34a)' }} />
                {t('pluginExport.done')}
              </div>
              <div className="mt-1 break-all text-[11px] text-[var(--sidebar-text)]">{result.path}</div>
            </div>
          )}

          {warnings.length > 0 && (
            <div>
              <div className="font-semibold flex items-center gap-1.5 mb-1">
                <AlertTriangle size={13} style={{ color: 'var(--editor-warning,#d97706)' }} />
                {t('pluginExport.warnings')}
              </div>
              <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                {warnings.map((w, i) => (
                  <li key={`${w.messageKey || w.message}-${i}`} className="text-[11px] text-[var(--sidebar-text)] leading-relaxed">
                    {w.messageKey ? t(w.messageKey, w.messageArgs) : w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--editor-border)] flex items-center justify-end gap-2 shrink-0">
          {busy ? (
            <button
              onClick={() => { abortRef.current = true; onClose() }}
              className="px-3 py-1.5 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)]"
            >
              {t('common.cancel')}
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
            {busy ? t('settings.processing') : t('pluginExport.export')}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
