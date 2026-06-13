import { useState } from 'react'
import { Palette, X, Check } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

const themes = [
  { 
    id: 'minimal' as const, 
    name: '极简风', 
    description: '大量留白，细线条，低调配色',
    preview: '#ffffff'
  },
  { 
    id: 'magazine' as const, 
    name: '杂志感', 
    description: '衬线字体，精致排版，优雅留白',
    preview: '#faf8f5'
  },
  { 
    id: 'tech' as const, 
    name: '科技感', 
    description: '等宽字体，暗色调，代码风格',
    preview: '#0d1117'
  },
  { 
    id: 'nature' as const, 
    name: '自然风', 
    description: '暖色调，有机曲线，纸张质感',
    preview: '#f5f2eb'
  },
]

export default function ThemeSwitcher() {
  const [isOpen, setIsOpen] = useState(false)
  const { currentTheme, setField } = useSettingsStore()

  const handleSelectTheme = (themeId: typeof themes[number]['id']) => {
    setField('currentTheme', themeId)
    setIsOpen(false)
  }

  return (
    <div className="fixed bottom-12 right-4 z-50">
      {/* 主题选择面板 */}
      {isOpen && (
        <div 
          className="
            absolute bottom-14 right-0
            w-72 
            bg-[var(--editor-surface)]
            border border-[var(--editor-border)]
            rounded-xl
            shadow-2xl
            overflow-hidden
            animate-in fade-in slide-in-from-bottom-2 duration-200
          "
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--editor-border)]">
            <div className="flex items-center gap-2">
              <Palette size={16} className="text-[var(--editor-accent)]" />
              <span className="font-medium text-[var(--editor-text)]">选择主题</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)]"
            >
              <X size={16} />
            </button>
          </div>

          {/* 主题列表 */}
          <div className="p-2">
            {themes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleSelectTheme(theme.id)}
                className={`
                  w-full p-3 rounded-lg
                  flex items-center gap-3
                  transition-colors duration-150
                  ${currentTheme === theme.id 
                    ? 'bg-[var(--editor-accent)] bg-opacity-10' 
                    : 'hover:bg-[var(--editor-hover)]'
                  }
                `}
              >
                {/* 颜色预览 */}
                <div 
                  className="w-10 h-10 rounded-lg border border-[var(--editor-border)] shadow-sm"
                  style={{ backgroundColor: theme.preview }}
                />
                
                {/* 主题信息 */}
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--editor-text)]">
                      {theme.name}
                    </span>
                    {currentTheme === theme.id && (
                      <Check size={14} className="text-[var(--editor-accent)]" />
                    )}
                  </div>
                  <p className="text-xs text-[var(--sidebar-text)] mt-0.5">
                    {theme.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 切换按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          w-12 h-12 rounded-full
          bg-[var(--editor-accent)]
          text-white
          shadow-lg
          flex items-center justify-center
          hover:scale-110
          transition-transform duration-200
        "
      >
        <Palette size={20} />
      </button>
    </div>
  )
}
