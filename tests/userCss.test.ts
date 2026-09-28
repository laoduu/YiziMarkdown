/**
 * 主题/用户 CSS 的选择器改写（`src/lib/userCss.ts`）。
 *
 * 回归两条真实 bug：
 * 1. user.css 注入在最后，但「最后」只能赢同特异性的平局，主题的
 *    `:root.theme-x` / `.editor-content.theme-x <el>` 特异性更高 ⇒ 用户写最自然的
 *    `:root{}` / `.editor-content h1{}` 静默失效（「注入了但没有任何反应」）。
 * 2. 用户把整份主题粘进自定义 CSS（`:root.theme-brocade`），而 `<html>` 上只有
 *    当前生效主题的类 ⇒ 永远匹配不到（且曾被提权改坏成双主题类）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeUserCss, retargetThemeCss, sanitizeUserCss } from '../src/lib/userCss.ts'

const T = 'custom'
const S = ':root.theme-custom'

// ── normalizeUserCss：用户 CSS ──

test('变量覆盖：裸 :root 提升为 :root.theme-custom（平手 + 后置 ⇒ 胜）', () => {
  assert.equal(normalizeUserCss(':root { --editor-accent: red; }', T), `${S} { --editor-accent: red; }`)
  assert.equal(normalizeUserCss(':root{--a:1}', T), `${S}{--a:1}`)
})

test('根元素选择器：html 换成 :root.theme-custom', () => {
  assert.equal(normalizeUserCss('html { font-size: 18px; }', T), `${S} { font-size: 18px; }`)
})

test('普通元素规则：加后代作用域前缀，特异性抬到主题之上', () => {
  assert.equal(
    normalizeUserCss('.editor-content h1 { font-size: 5em; }', T),
    `${S} .editor-content h1 { font-size: 5em; }`
  )
  assert.equal(normalizeUserCss('.toolbar { height: 90px; }', T), `${S} .toolbar { height: 90px; }`)
  assert.equal(normalizeUserCss('body { margin: 0 }', T), `${S} body { margin: 0 }`)
})

test('粘贴整份主题：:root.theme-brocade 归一为 :root.theme-custom（不再加前缀）', () => {
  assert.equal(
    normalizeUserCss(':root.theme-brocade { --editor-bg: #fff; }', T),
    `${S} { --editor-bg: #fff; }`
  )
  assert.equal(
    normalizeUserCss(':root.theme-brocade.dark { --editor-bg: #111; }', T),
    `${S}.dark { --editor-bg: #111; }`
  )
})

test('粘贴整份主题的元素规则：.editor-content.theme-brocade h1 归一（不双前缀）', () => {
  assert.equal(
    normalizeUserCss('.editor-content.theme-brocade h1 { font-size: 2em; }', T),
    '.editor-content.theme-custom h1 { font-size: 2em; }'
  )
})

test('任意主题类都归一（不只 brocade）', () => {
  assert.equal(normalizeUserCss(':root.theme-liquidglass-prism { --a: 1 }', T), `${S} { --a: 1 }`)
})

test('选择器列表：逗号分隔的每条都处理（保留原始空白）', () => {
  // `.theme-x h2` 已带主题类 ⇒ 只归一不加前缀（双作用域永不匹配）
  assert.equal(
    normalizeUserCss('h1, .theme-x h2 ,h3 { color: red }', T),
    `${S} h1, .theme-custom h2 ,${S} h3 { color: red }`
  )
})

test('@media / @supports 递归进内部改写', () => {
  assert.equal(
    normalizeUserCss('@media (max-width: 600px) { .sidebar { display: none } }', T),
    `@media (max-width: 600px) { ${S} .sidebar { display: none } }`
  )
})

test('@keyframes / @font-face / @page 的块内容原样保留', () => {
  const kf = '@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }'
  assert.equal(normalizeUserCss(kf, T), kf)
  const ff = "@font-face { font-family: 'X'; src: url(x.woff2) }"
  assert.equal(normalizeUserCss(ff, T), ff)
})

test('字符串与注释里的花括号 / 逗号不干扰解析', () => {
  assert.equal(
    normalizeUserCss('.a { content: "}{," } /* 注释 { } */ .b { color: red }', T),
    `${S} .a { content: "}{," } /* 注释 { } */ ${S} .b { color: red }`
  )
})

test('括号内的逗号不当作选择器分隔符', () => {
  assert.equal(
    normalizeUserCss(':is(h1, h2) { color: red }', T),
    `${S} :is(h1, h2) { color: red }`
  )
})

test('target 为空时原样返回（避免生成 :root.theme- 这种非法选择器）', () => {
  assert.equal(normalizeUserCss(':root { --a: 1 }', ''), ':root { --a: 1 }')
  assert.equal(normalizeUserCss('', T), '')
})

test('@import 等无块 at-rule 原样保留', () => {
  const imp = '@import url("x.css");'
  assert.equal(normalizeUserCss(imp, T), imp)
})

// ── retargetThemeCss：主题文件归属 ──

test('主题文件选择器归一到目标主题名', () => {
  assert.equal(
    retargetThemeCss(':root.theme-brocade { --a: 1 } :root.theme-brocade.dark { --b: 2 }', 'custom'),
    ':root.theme-custom { --a: 1 } :root.theme-custom.dark { --b: 2 }'
  )
})

test('同名归一是无害的空操作', () => {
  const css = ':root.theme-minimal { --a: 1 } .editor-content.theme-minimal h1 { color: red }'
  assert.equal(retargetThemeCss(css, 'minimal'), css)
})

test('retargetThemeCss 不改注释外的非主题选择器', () => {
  assert.equal(
    retargetThemeCss('.toolbar { color: red }', 'custom'),
    '.toolbar { color: red }'
  )
})

// ── sanitizeUserCss：保存前清洗 ──

test('清洗：剥离行首行号（真实踩坑形态：从聊天窗口复制带行号的主题）', () => {
  const dirty = [
    '/* 主题 */',
    '1 :root {',
    '2   --editor-bg: #fff;',
    '3 }',
    '4',
    '5 .toolbar { color: red }',
  ].join('\n')
  // 行号与其后的分隔空白一并剥掉；纯数字行 `4` 不带内容，原样保留
  assert.equal(
    sanitizeUserCss(dirty),
    '/* 主题 */\n:root {\n--editor-bg: #fff;\n}\n4\n.toolbar { color: red }'
  )
})

test('清洗：`3.` 与 `12)` 分隔符形态同样剥离', () => {
  const dirty = ['1. :root {', '2) --a: 1', '3. }', '4. .x { color: red }', '5. }'].join('\n')
  assert.equal(sanitizeUserCss(dirty), ':root {\n--a: 1\n}\n.x { color: red }\n}')
})

test('清洗：纯数字行保留（可能是用户有意的结构）', () => {
  const css = '1 :root { --a: 1 }\n2\n3 .x { color: red }'
  // 3 行中 2 行带行号+内容 ⇒ 触发剥离；纯数字行 `2` 不带内容，保留
  assert.equal(sanitizeUserCss(css), ':root { --a: 1 }\n2\n.x { color: red }')
})

test('清洗：零宽字符与 BOM 无条件剥离', () => {
  const dirty = '\uFEFF:root { --a: \u200B1\u200B } \u200B/* 注\u200D释 */'
  assert.equal(sanitizeUserCss(dirty), ':root { --a: 1 } /* 注释 */')
})

test('清洗：多数行无行号时不动（防误伤合法内容）', () => {
  const legit = ':root {\n  --shadow: 0 1px 3px;\n}\n.toolbar { height: 48px }'
  assert.equal(sanitizeUserCss(legit), legit)
})

test('清洗：`0 1px` 这类值行（数字开头但属合法 CSS 值上下文）不被误判', () => {
  // 多行阴影值恰好都以数字开头时，行号占比不过半 ⇒ 不剥离
  const legit = [
    '.a {',
    '  box-shadow:',
    '  0 1px 3px rgba(0,0,0,.1),',
    '  0 8px 24px rgba(0,0,0,.2);',
    '}',
  ].join('\n')
  assert.equal(sanitizeUserCss(legit), legit)
})

test('清洗：少于 3 个非空行时不启用行号剥离（样本太少，宁可不动）', () => {
  const css = '1 :root { --a: 1 }'
  assert.equal(sanitizeUserCss(css), css)
})

test('清洗：空串原样返回', () => {
  assert.equal(sanitizeUserCss(''), '')
})
