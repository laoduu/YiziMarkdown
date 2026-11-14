/**
 * 设置页共用的 Markdown 编辑 / 预览组件。
 *
 * 模板管理与 Skill 管理使用同一套交互：
 * - 可编辑：`编辑` / `预览` 两个标签；
 * - 只读：`预览` / `源码` 两个标签，默认预览。
 */
import { useMemo, useState } from 'react'
import { Code, Eye } from 'lucide-react'
import { renderMarkdown } from '../lib/markdownRenderer'
import { useI18n } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'

interface MarkdownEditPreviewProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  placeholder?: string
  /** 编辑区 / 预览区的最小高度（px） */
  minHeight?: number
}

export default function MarkdownEditPreview({
  value,
  onChange,
  readOnly = false,
  placeholder,
  minHeight = 240,
}: MarkdownEditPreviewProps) {
  const { t } = useI18n()
  const currentTheme = useSettingsStore((s) => s.currentTheme)
  const [mode, setMode] = useState<'edit' | 'preview'>(readOnly ? 'preview' : 'edit')

  const html = useMemo(
    () => (mode === 'preview' ? renderMarkdown(value) : ''),
    [mode, value],
  )

  const tabs = readOnly
    ? [
        { key: 'preview' as const, label: t('settings.preview'), icon: <Eye size={12} /> },
        { key: 'edit' as const, label: t('settings.mdSource'), icon: <Code size={12} /> },
      ]
    : [
        { key: 'edit' as const, label: t('settings.edit'), icon: <Code size={12} /> },
        { key: 'preview' as const, label: t('settings.preview'), icon: <Eye size={12} /> },
      ]

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-end gap-1 mb-1">
        {tabs.map((tab) => {
          const active = mode === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.6875rem] transition-colors ${
                active
                  ? 'bg-[var(--editor-accent)] text-white'
                  : 'text-[var(--sidebar-text)] hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          )
        })}
      </div>

      {mode === 'preview' ? (
        <div
          className={`editor-content prose max-w-none theme-${currentTheme} overflow-y-auto`}
          style={{
            minHeight,
            maxHeight: minHeight,
            padding: '10px 12px',
            fontSize: '0.8125rem',
            lineHeight: 1.6,
            background: 'var(--editor-surface)',
            border: '1px solid var(--editor-border)',
            borderRadius: 'var(--radius-sm)',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          className={`settings-textarea font-mono ${readOnly ? 'opacity-80' : ''}`}
          style={{ minHeight, height: minHeight }}
        />
      )}
    </div>
  )
}
