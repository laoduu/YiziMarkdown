/**
 * 手动更新提示卡（macOS / 便携版的启动提醒）。
 *
 * 为什么不是「又来一个弹窗」：这两类环境没有一键更新，应用**不能**替用户换包，
 * 提示的唯一价值是「让你知道有新版本」，所以做成右下角**不抢焦点**的卡片：
 *   · 不遮正文、不需要先处理它才能继续工作
 *   · 「稍后」只在本进程内闭嘴（同一次运行里别再烦），「跳过此版本」才持久化
 *   · 换到更新的版本会重新出现（dismissed 记的是版本号，不是布尔）
 *
 * Windows NSIS 安装版不会看到这张卡：那条路径走 tauri-plugin-updater，
 * 状态栏已经有「有新版本」入口，双击提示反而多余（见 stores/updateStore.ts）。
 */
import { useState } from 'react'
import { Download, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { useUpdateStore } from '../stores/updateStore'
import { notesExcerpt } from '../lib/manualUpdate'

/** 本进程内被「稍后 / 关闭」按掉的版本号（换版本重新提示） */
export default function UpdateNotice() {
  const { t } = useI18n()
  const status = useUpdateStore((s) => s.status)
  const update = useUpdateStore((s) => s.update)
  // 本进程内被「稍后 / 关闭」按掉的版本号：换版本会重新提示
  const [dismissed, setDismissed] = useState<string | null>(null)

  if (status !== 'available' || !update || update.mode !== 'manual') return null
  if (dismissed === update.version) return null

  const excerpt = notesExcerpt(update.notes)
  const dismiss = () => setDismissed(update.version)

  return (
    <div className="update-notice" role="status" aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Download size={15} style={{ color: 'var(--editor-accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--editor-text)', flex: 1, lineHeight: 1.4 }}>
          {t('update.title', { v: update.version })}
        </span>
        <button
          onClick={dismiss}
          aria-label={t('update.close')}
          title={t('update.close')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, padding: 0, border: 'none', background: 'transparent',
            color: 'var(--sidebar-text)', cursor: 'pointer', borderRadius: 4, flexShrink: 0,
          }}
        >
          <X size={14} />
        </button>
      </div>

      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: 'var(--sidebar-text)' }}>
        {t('update.body', { current: update.currentVersion })}
      </p>

      {/* 更新说明只给一句摘要：完整说明在「设置 → 版本与更新」里渲染 */}
      {excerpt && (
        <p
          style={{
            margin: '6px 0 0', fontSize: 11.5, lineHeight: 1.55, color: 'var(--editor-text)',
            display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden',
          }}
        >
          {excerpt}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <button
          className="settings-btn-primary"
          style={{ padding: '5px 12px', fontSize: 12 }}
          onClick={() => {
            void useUpdateStore.getState().openDownloadPage()
            dismiss()
          }}
        >
          {t('update.download')}
        </button>
        <button
          className="settings-btn-secondary"
          style={{ padding: '5px 12px', fontSize: 12 }}
          onClick={dismiss}
        >
          {t('update.later')}
        </button>
        <button
          onClick={() => void useUpdateStore.getState().skip()}
          style={{
            marginLeft: 'auto', padding: 0, border: 'none', background: 'transparent',
            color: 'var(--sidebar-text)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          {t('update.skip')}
        </button>
      </div>
    </div>
  )
}
