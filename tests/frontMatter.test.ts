/**
 * 元信息块（YAML front matter）判定与解析的边界用例。
 *
 * 判定采用**严格档**（见 lib/frontMatter.ts 的规则说明）。重点盯住两类误判：
 *   · 把正文当元信息（用户实测：两个 `---` 之间是正文 ⇒ 整篇被套上元信息样式）
 *   · 把合法元信息当正文（会让演示模式读不到 title、预览不剥离）
 *
 * 注：本文件里有两条用例在改为严格档时**被有意改写**（原先断言"允许前导空行"、
 * "忽略非键值行"），因为那两条宽松行为正是误判来源。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitFrontMatter, parseProperties } from '../src/lib/frontMatter.ts'

// ---------- 基本解析 ----------

test('splitFrontMatter: 解析键值、剥离正文、给出区间', () => {
  const src = '---\ntitle: 演示标题\nauthor: 张三\nslideshow-fragments: off\n---\n\n# A'
  const { meta, body, range } = splitFrontMatter(src)

  assert.equal(meta.title, '演示标题')
  assert.equal(meta.author, '张三')
  assert.equal(meta['slideshow-fragments'], 'off')
  assert.equal(body.trim(), '# A')
  assert.ok(range, '应识别出元信息区间')
  assert.equal(range!.from, 0, '区间应从 `---` 本身开始')
  assert.ok(src.slice(range!.to).includes('# A'), '区间之后应是正文')
})

test('splitFrontMatter: 键名统一小写、值去掉首尾引号', () => {
  const { meta } = splitFrontMatter('---\nTitle: "带引号的标题"\nTAGS: \'a,b\'\n---\n正文')
  assert.equal(meta.title, '带引号的标题')
  assert.equal(meta.tags, 'a,b')
})

test('splitFrontMatter: 兼容 CRLF', () => {
  const src = '---\r\ntitle: CRLF\r\n---\r\n\r\n正文'
  const { meta, body, range } = splitFrontMatter(src)
  assert.equal(meta.title, 'CRLF')
  assert.equal(body.trim(), '正文')
  assert.ok(range)
})

test('splitFrontMatter: 全文只有元信息（闭合行后没有换行）', () => {
  const src = '---\ntitle: 只有元信息\n---'
  const { meta, body, range } = splitFrontMatter(src)
  assert.equal(meta.title, '只有元信息')
  assert.equal(body, '')
  assert.equal(range!.to, src.length)
})

// ---------- 不能误判为元信息（关键）----------

test('splitFrontMatter: 两个 --- 之间是正文 ⇒ 不是元信息（用户实测反例）', () => {
  const src = '---\n第一段正文\n---\n第二段正文'
  const { meta, body, range } = splitFrontMatter(src)
  assert.deepEqual(meta, {}, '块内不是 YAML 映射 ⇒ 不能当元信息')
  assert.equal(range, null)
  assert.equal(body, src, '正文必须原样保留，不能被吞掉')
})

test('splitFrontMatter: 没有闭合 --- 时不算元信息（就是普通分隔线）', () => {
  const src = '---\n这只是一段正文，前面有个分隔线\n后面还有内容'
  const { meta, body, range } = splitFrontMatter(src)
  assert.deepEqual(meta, {})
  assert.equal(range, null, '没有闭合行 ⇒ 不能当元信息')
  assert.equal(body, src, '正文必须原样保留，不能被吞掉')
})

test('splitFrontMatter: 前导空行 ⇒ 不是元信息（严格档）', () => {
  // 原实现允许 `^\s*`，导致"开头先空一行再写 ---"这种常见排版被误判 —— 改为严格
  const src = '\n\n---\ntitle: x\n---\n正文'
  const { meta, range } = splitFrontMatter(src)
  assert.deepEqual(meta, {})
  assert.equal(range, null)
})

test('splitFrontMatter: 只有注释、没有键值对 ⇒ 不是元信息', () => {
  const src = '---\n# 第一章\n# 只是两个注释\n---\n正文'
  const { meta, range } = splitFrontMatter(src)
  assert.deepEqual(meta, {})
  assert.equal(range, null, '`#` 在 YAML 里是注释，但没有任何键值对 ⇒ 不算元信息')
})

test('splitFrontMatter: 含非 YAML 成分的行 ⇒ 整块不是元信息', () => {
  // 一条既不是空行/注释/键值对、也没有缩进的行 ⇒ 这不是 YAML 映射
  const src = '---\ntitle: x\n这就是一行散文\n---\n正文'
  const { meta, range } = splitFrontMatter(src)
  assert.deepEqual(meta, {})
  assert.equal(range, null)
})

test('splitFrontMatter: 中文键 + 半角冒号 ⇒ 视为键值对（固有歧义，与 Obsidian 一致）', () => {
  // 这本身就是合法 YAML 映射，无法与"散文里恰好有半角冒号"区分。
  // 取舍：宁可接受这种罕见误判，也不要误杀合法元信息（后者会让 author/date/title 静默消失）。
  const src = '---\n注意: 这是一段正文\n---\n正文'
  const { meta, range } = splitFrontMatter(src)
  assert.equal(meta['注意'], '这是一段正文')
  assert.ok(range)
})

test('splitFrontMatter: 中文全角冒号不是键值对', () => {
  const src = '---\n注意：这是一段正文\n---\n正文'
  const { range } = splitFrontMatter(src)
  assert.equal(range, null, '全角 `：` 不是 YAML 的映射分隔符')
})

test('splitFrontMatter: 中文键名也算合法元信息（YAML 允许非 ASCII 键）', () => {
  const src = '---\n标题: 中文键\n---\n正文'
  const { meta, range } = splitFrontMatter(src)
  assert.equal(meta['标题'], '中文键')
  assert.ok(range, '不能因为键是中文就拒掉整块 —— 那会连带 author/date 一起消失')
})

test('splitFrontMatter: 点号键（Hugo/Jekyll 常见）算合法元信息', () => {
  const src = '---\ntitle: x\npublish.date: 2026-09-22\n---\n正文'
  const { meta, range } = splitFrontMatter(src)
  assert.equal(meta['publish.date'], '2026-09-22')
  assert.ok(range)
})

test('splitFrontMatter: 容忍开头 BOM（Windows 编辑器常见）', () => {
  const src = '\uFEFF---\ntitle: x\n---\n正文'
  const { meta, range } = splitFrontMatter(src)
  assert.equal(meta.title, 'x')
  assert.ok(range)
})

test('splitFrontMatter: URL 行不会被误认成键值对', () => {
  // `https:` 后面是 `/` 而不是空白 ⇒ 不是键值对 ⇒ 整块不是元信息
  const src = '---\nhttps://example.com\n---\n正文'
  const { range } = splitFrontMatter(src)
  assert.equal(range, null)
})

// ---------- 合法但形态特殊的元信息 ----------

test('splitFrontMatter: 缩进续行（块状列表）⇒ 是元信息', () => {
  const src = '---\ntags:\n  - 工作\n  - 随笔\ntitle: x\n---\n正文'
  const { meta, range, props } = splitFrontMatter(src)
  assert.ok(range, '缩进续行属于 YAML 映射，不能误杀')
  assert.equal(meta.title, 'x')
  assert.equal(props[0].key, 'tags')
  assert.equal(props[0].hasBlockValue, true, '后面紧跟缩进行 ⇒ 标记为块状值（面板只读）')
})

test('splitFrontMatter: `...` 也可作为闭合行', () => {
  const src = '---\ntitle: x\n...\n正文'
  const { meta, range } = splitFrontMatter(src)
  assert.equal(meta.title, 'x')
  assert.ok(range)
})

test('splitFrontMatter: 空行允许出现在块内', () => {
  const src = '---\ntitle: x\n\nauthor: y\n---\n正文'
  const { meta, range } = splitFrontMatter(src)
  assert.equal(meta.author, 'y')
  assert.ok(range)
})

// ---------- 属性偏移（属性面板写回要用）----------

test('parseProperties: 偏移能精确切出键与值', () => {
  const src = '---\ntitle: 我的文档\ndone: true\n---\n正文'
  const props = parseProperties(src)
  assert.equal(props.length, 2)

  const [title, done] = props
  assert.equal(src.slice(title.keyFrom, title.keyTo), 'title')
  assert.equal(src.slice(title.valueFrom, title.valueTo), '我的文档')
  assert.equal(src.slice(done.keyFrom, done.keyTo), 'done')
  assert.equal(src.slice(done.valueFrom, done.valueTo), 'true')
  // 整行区间用于"删除该属性"
  assert.equal(src.slice(title.lineFrom, title.lineTo), 'title: 我的文档')
})

test('parseProperties: 值带引号时偏移指向引号内，value 已去引号', () => {
  const src = '---\ntitle: "带引号"\n---\n正文'
  const [p] = parseProperties(src)
  assert.equal(p.value, '带引号')
  assert.equal(src.slice(p.valueFrom, p.valueTo), '"带引号"', '偏移覆盖含引号的原文，便于整体替换')
})

test('parseProperties: 无元信息时返回空数组', () => {
  assert.deepEqual(parseProperties('# 标题\n\n正文'), [])
})
