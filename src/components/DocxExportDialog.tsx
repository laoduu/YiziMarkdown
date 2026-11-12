/**
 * DOCX 导出弹窗：只负责「导出前选参数」，真正的保存路径与导出由 App 侧继续完成。
 *
 * 与 PPTX 导出弹窗保持同一套视觉（dialog token / 圆角 / 遮罩）：
 *   - 导出方式：内置 OOXML 生成器 / 本机 Pandoc
 *   - Pandoc 方式可选择 .docx reference document 作为 Word 模板
 *   - 是否导出主题色（关闭后标题、表头、代码高亮统一走黑白灰）
 *   - 字号行距是否跟随预览（关闭则用 Word 规范版式：A4 / 11pt / 1.5 倍行距）
 *   - 字体是否跟随预览（关闭则用 Word 经典默认字体：正文 Calibri / 等线，标题 Calibri Light / 等线 Light）
 *
 * 内置导出的版式开关每次回到默认；Pandoc 模板路径单独持久化，下次打开自动恢复。
 */
import { useEffect, useState } from 'react'
import { FileDown, FolderOpen, Trash2, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { invokeTauriOrThrow } from '../lib/tauri'
import { useSettingsStore } from '../stores/settingsStore'

export interface DocxExportOptions {
  /** 导出引擎：内置 OOXML 生成器，或调用用户本机的 Pandoc */
  engine: 'native' | 'pandoc'
  /** Pandoc 的 Word reference.docx；为空时使用 Pandoc 默认样式 */
  templatePath: string | null
  /** 导出主题色（标题/表头/代码高亮）；false = 黑白灰 */
  themeColors: boolean
  /** 字号与行距跟随预览；false = 规范版式 11pt / 1.5 */
  followPreview: boolean
  /** 字体跟随预览；false = Word 默认字体（Calibri / 等线 + Light 标题） */
  followPreviewFont: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onExport: (options: DocxExportOptions) => void
}

export default function DocxExportDialog({ open, onClose, onExport }: Props) {
  const { t } = useI18n()
  const savedTemplatePath = useSettingsStore((s) => s.docxPandocTemplatePath)
  const setField = useSettingsStore((s) => s.setField)
  const [themeColors, setThemeColors] = useState(true)
  const [followPreview, setFollowPreview] = useState(true)
  const [followPreviewFont, setFollowPreviewFont] = useState(true)
  const [engine, setEngine] = useState<'native' | 'pandoc'>('native')
  const [templatePath, setTemplatePath] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [pickingTemplate, setPickingTemplate] = useState(false)

  useEffect(() => {
    if (!open) {
      setEngine('native')
      setTemplatePath(null)
      setTemplateError(null)
      setPickingTemplate(false)
      setThemeColors(true)
      setFollowPreview(true)
      setFollowPreviewFont(true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const saved = savedTemplatePath.trim()
    if (!saved) {
      setTemplatePath(null)
      return
    }

    let cancelled = false
    setTemplatePath(saved)
    invokeTauriOrThrow<boolean>('validate_docx_template', { path: saved })
      .then((valid) => {
        if (cancelled || valid) return
        setField('docxPandocTemplatePath', '')
        setTemplatePath(null)
      })
      .catch((e) => {
        // 浏览器降级环境没有 Tauri；保留路径，导出阶段仍会给出明确错误。
        console.warn('[docx-export] template validation unavailable:', e)
      })
    return () => { cancelled = true }
  }, [open, savedTemplatePath, setField])

  const chooseTemplate = async () => {
    setTemplateError(null)
    setPickingTemplate(true)
    try {
      const path = await invokeTauriOrThrow<string | null>('pick_docx_template_dialog')
      if (path) {
        setTemplatePath(path)
        setField('docxPandocTemplatePath', path)
      }
    } catch (e) {
      console.error('[docx-export] template picker failed:', e)
      setTemplateError(t('docxExport.templatePickFailed'))
    } finally {
      setPickingTemplate(false)
    }
  }

  if (!open) return null

  const templateName = templatePath?.split(/[\\/]/).pop() || ''

  return (
    <div
      className="fixed inset-0 z-[10040] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-[460px] max-w-[92vw] border rounded-pop overflow-hidden animate-dialog-in"
        style={{
          background: 'var(--dialog-bg)',
          borderColor: 'var(--dialog-border)',
          boxShadow: 'var(--dialog-shadow)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--dialog-border)' }}
        >
          <div className="flex items-center gap-2 font-semibold">
            <FileDown size={15} />
            {t('docxExport.title')}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--editor-hover)]"
            title={t('common.cancel')}
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3 text-[0.8125rem] space-y-4">
          <div>
            <div className="font-medium mb-2">{t('docxExport.engine')}</div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('docxExport.engine')}>
              {([
                {
                  id: 'native' as const,
                  label: t('docxExport.engineNative'),
                  hint: t('docxExport.engineNativeHint'),
                },
                {
                  id: 'pandoc' as const,
                  label: t('docxExport.enginePandoc'),
                  hint: t('docxExport.enginePandocHint'),
                },
              ]).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={engine === item.id}
                  onClick={() => setEngine(item.id)}
                  className="text-left p-2.5 rounded border transition-colors hover:bg-[var(--editor-hover)]"
                  style={{
                    borderColor: engine === item.id ? 'var(--editor-accent)' : 'var(--editor-border)',
                    background: engine === item.id ? 'color-mix(in srgb, var(--editor-accent) 9%, transparent)' : 'transparent',
                  }}
                >
                  <span className="block font-medium">{item.label}</span>
                  <span className="block mt-0.5 text-[0.6875rem] text-[var(--sidebar-text)] leading-relaxed">
                    {item.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {engine === 'native' ? (
            <>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={themeColors}
                  onChange={(e) => setThemeColors(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{t('docxExport.themeColors')}</span>
                  <span className="block text-[0.6875rem] text-[var(--sidebar-text)] leading-relaxed">
                    {t('docxExport.themeColorsHint')}
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={followPreview}
                  onChange={(e) => setFollowPreview(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{t('docxExport.followPreview')}</span>
                  <span className="block text-[0.6875rem] text-[var(--sidebar-text)] leading-relaxed">
                    {t('docxExport.followPreviewHint')}
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={followPreviewFont}
                  onChange={(e) => setFollowPreviewFont(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{t('docxExport.followPreviewFont')}</span>
                  <span className="block text-[0.6875rem] text-[var(--sidebar-text)] leading-relaxed">
                    {t('docxExport.followPreviewFontHint')}
                  </span>
                </span>
              </label>
            </>
          ) : (
            <div className="space-y-2">
              <div>
                <div className="font-medium">{t('docxExport.template')}</div>
                <div className="text-[0.6875rem] text-[var(--sidebar-text)] leading-relaxed">
                  {t('docxExport.templateHint')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="min-w-0 flex-1 px-2.5 py-1.5 rounded border text-[0.75rem] truncate"
                  style={{ borderColor: 'var(--editor-border)' }}
                  title={templatePath || undefined}
                >
                  {templateName || t('docxExport.defaultTemplate')}
                </div>
                <button
                  type="button"
                  disabled={pickingTemplate}
                  onClick={chooseTemplate}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)] disabled:opacity-50"
                >
                  <FolderOpen size={13} />
                  {t('dialog.browse')}
                </button>
                {templatePath && (
                  <button
                    type="button"
                    onClick={() => {
                      setTemplatePath(null)
                      setTemplateError(null)
                      setField('docxPandocTemplatePath', '')
                    }}
                    className="p-1.5 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)]"
                    title={t('docxExport.clearTemplate')}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              {templateError && (
                <p className="text-[0.6875rem] text-red-500">{templateError}</p>
              )}
            </div>
          )}
        </div>

        <div
          className="flex justify-end gap-2 px-4 py-3 border-t"
          style={{ borderColor: 'var(--dialog-border)' }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)]"
          >
            {t('common.cancel')}
          </button>
          <button
            disabled={pickingTemplate}
            onClick={() => {
              onExport({ engine, templatePath, themeColors, followPreview, followPreviewFont })
              onClose()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--editor-accent)] text-white hover:opacity-90"
            style={{ opacity: pickingTemplate ? 0.5 : undefined }}
          >
            <FileDown size={13} />
            {t('toolbar.export')}
          </button>
        </div>
      </div>
    </div>
  )
}
