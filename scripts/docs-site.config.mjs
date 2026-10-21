/**
 * 官网「文档」频道配置：四个页面共用的标签栏 + 三个由 Markdown 生成的规范页。
 *
 * 构建：node scripts/build-docs-pages.mjs
 * 校验：node scripts/check-docs-site.mjs（npm run build 会调用）
 *
 * 新增一个频道时，只需要在这里加一项、补一条 DOC_TABS 记录，
 * 再重新生成即可；顶部导航不需要动。
 */

export const DOC_TABS = [
  { label: '帮助中心', page: 'help.html' },
  { label: '演示语法', page: 'slideshow-syntax.html' },
  { label: '主题规范', page: 'theme-spec.html' },
  { label: '技能规范', page: 'skill-spec.html' }
]

/** 由 Markdown 生成的页面。icons 按正文 H2 的顺序分配，缺省用 file-text。 */
export const DOC_PAGES = [
  {
    out: 'slideshow-syntax.html',
    src: 'docs/slideshow-style-mapping.md',
    title: '演示模式语法',
    subtitle: '翻页、分栏、版式、动画与快捷键的完整对照表 —— 不需要额外格式，写 Markdown 就是写幻灯片。',
    description:
      'YiziMarkdown 演示模式语法完整参考：用 --- 分页、*** 分栏，自动版式推断规则，显式 layout / align / fragments 指令，片段逐步显示、切换动画、演讲者备注与播放快捷键。',
    keywords: 'YiziMarkdown,演示模式,幻灯片语法,Markdown分页,分栏,自动版式,演讲者备注',
    meta: ['适用版本 v0.3.5', '纯 Markdown', '零标记'],
    searchPlaceholder: '搜索语法，例如「分栏」「指令」',
    icons: [
      'file-text', 'presentation', 'settings', 'list', 'sparkles', 'file-text',
      'palette', 'quote', 'keyboard', 'code', 'presentation', 'code-2'
    ]
  },
  {
    out: 'theme-spec.html',
    src: 'docs/THEME-DESIGN-SPEC.md',
    title: '主题设计规范',
    subtitle: '从令牌分层到明暗双模式，写出一套能通过校验门禁的主题。',
    description:
      'YiziMarkdown 主题设计规范：主题令牌分层（基础 / 区域 / 装饰 / 效果）、文件与命名、明暗双模式、theme.json 元数据、check-themes 校验门禁、从零写一个主题的完整示例与令牌总表。',
    keywords: 'YiziMarkdown,主题设计,主题规范,CSS变量,令牌,theme.json,自定义主题',
    meta: ['基线 v0.3.2+', '更新 2026-09-24', '面向主题作者'],
    searchPlaceholder: '搜索令牌或规则，例如「--editor-bg」',
    skipSections: ['目录'],
    dropLeadingQuote: true,
    icons: [
      'book-open', 'rocket', 'file-text', 'settings', 'list', 'palette', 'eye',
      'workflow', 'circle-help', 'file-text', 'presentation', 'pencil-line',
      'list', 'sparkles', 'table', 'folder-open'
    ]
  },
  {
    out: 'skill-spec.html',
    src: 'src-tauri/skill-guide.md',
    title: '技能（Skill）规范',
    subtitle: 'skills.json 字段、提示词写法与自定义技能的完整说明。',
    description:
      'YiziMarkdown 技能（Skill）规范：skills.json 字段与逗号规则、提示词编写技巧、自定义技能创建步骤、存储位置与版本更新覆盖机制，以及修改后不生效等常见问题。',
    keywords: 'YiziMarkdown,Skill,技能,自定义技能,skills.json,提示词,AI助手',
    meta: ['适用版本 v0.3.5', '用户目录可改'],
    searchPlaceholder: '搜索技能配置，例如「needsDoc」',
    icons: ['zap', 'folder-open', 'settings', 'pencil-line', 'code', 'sparkles', 'circle-help']
  }
]
