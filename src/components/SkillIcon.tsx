/**
 * Skill 图标组件：把清单里的图标名称映射到 lucide 图标。
 */
import {
  AlignLeft, BookOpen, Bot, Brain, Briefcase, ClipboardList, Code2, FileCode2,
  FileText, Globe, GraduationCap, Image, Languages, Lightbulb, ListTree,
  MessageSquare, Music, NotebookPen, Pencil, PenTool, Presentation, Rocket,
  ScanText, Search, Sparkles, SpellCheck, Table2, Target, TextQuote, Video,
  Wand2, Zap,
} from 'lucide-react'
import { DEFAULT_SKILL_ICON, resolveSkillIcon, type SkillIconName } from '../lib/skillIconNames'

export const SKILL_ICON_COMPONENTS: Record<SkillIconName, typeof Sparkles> = {
  sparkles: Sparkles,
  'file-text': FileText,
  pencil: Pencil,
  presentation: Presentation,
  languages: Languages,
  wand2: Wand2,
  code2: Code2,
  'file-code2': FileCode2,
  'book-open': BookOpen,
  'list-tree': ListTree,
  search: Search,
  'message-square': MessageSquare,
  bot: Bot,
  globe: Globe,
  lightbulb: Lightbulb,
  'clipboard-list': ClipboardList,
  table2: Table2,
  image: Image,
  music: Music,
  video: Video,
  briefcase: Briefcase,
  'graduation-cap': GraduationCap,
  rocket: Rocket,
  zap: Zap,
  brain: Brain,
  'scan-text': ScanText,
  'pen-tool': PenTool,
  'spell-check': SpellCheck,
  'align-left': AlignLeft,
  'notebook-pen': NotebookPen,
  'text-quote': TextQuote,
  target: Target,
}

interface SkillIconProps {
  /** 传入技能：自动按 id / icon 选择；与 `name` 二选一 */
  skill?: { id: string; icon?: string }
  name?: string
  size?: number
  className?: string
}

export default function SkillIcon({ skill, name, size = 14, className }: SkillIconProps) {
  const resolved = name ?? (skill ? resolveSkillIcon(skill) : DEFAULT_SKILL_ICON)
  const Icon = SKILL_ICON_COMPONENTS[resolved as SkillIconName] ?? SKILL_ICON_COMPONENTS[DEFAULT_SKILL_ICON]
  return <Icon size={size} className={className} />
}
