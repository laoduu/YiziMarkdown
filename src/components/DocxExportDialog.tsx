/**
 * DOCX 导出弹窗：只负责「导出前选参数」，真正的保存路径与导出由 App 侧继续完成。
 *
 * 与 PPTX 导出弹窗保持同一套视觉（dialog token / 圆角 / 遮罩），但选项更少：
 *   - 是否导出主题色（关闭后标题、表头、代码高亮统一走黑白灰）
 *   - 字号行距是否跟随预览（关闭则用 Word 规范版式：A4 / 11pt / 1.5 倍行距）
 *   - 字体是否跟随预览（关闭则用 Word 经典默认字体：正文 Calibri / 等线，标题 Calibri Light / 等线 Light）
 *
 * 选项不落盘：每次打开都回到默认（跟随主题 + 跟随预览），避免用户忘记上次关过什么。
 */
import { useState } from 'react'
import { FileDown, X } from 'lucide-react'
import { useI18n } from '../i18n'

export interface DocxExportOptions {
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
  const [themeColors, setThemeColors] = useState(true)
  const [followPreview, setFollowPreview] = useState(true)
  const [followPreviewFont, setFollowPreviewFont] = useState(true)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[10040] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-[430px] max-w-[92vw] border rounded-pop overflow-hidden animate-dialog-in"
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

        <div className="px-4 py-3 text-[13px] space-y-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={themeColors}
              onChange={(e) => setThemeColors(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{t('docxExport.themeColors')}</span>
              <span className="block text-[11px] text-[var(--sidebar-text)] leading-relaxed">
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
              <span className="block text-[11px] text-[var(--sidebar-text)] leading-relaxed">
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
              <span className="block text-[11px] text-[var(--sidebar-text)] leading-relaxed">
                {t('docxExport.followPreviewFontHint')}
              </span>
            </span>
          </label>
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
            onClick={() => { onExport({ themeColors, followPreview, followPreviewFont }); onClose() }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--editor-accent)] text-white hover:opacity-90"
          >
            <FileDown size={13} />
            {t('toolbar.export')}
          </button>
        </div>
      </div>
    </div>
  )
}
