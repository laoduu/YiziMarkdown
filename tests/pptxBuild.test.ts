/**
 * PPTX 生成层的 XML 后处理回归测试（不依赖浏览器：场景图是纯数据）。
 *
 * 这里覆盖的是 pptxgenjs 表达不了、必须直接改 XML 的四件事 —— 它们一旦坏掉，
 * 产出的 PPTX 要么打不开（非法 XML / 未声明的命名空间），要么静默丢样式：
 *   1. 原生公式：私有区标记 → `mc:AlternateContent` + `a14:m` + OMML；
 *   2. CJK 字体拆分：`latin|ea` 哨兵 → `a:latin` / `a:ea` / `a:cs`；
 *   3. 渐变装饰：`yz-grad-*` 形状的 solidFill → gradFill；
 *   4. 清理：`<a:t>` 补 xml:space、同一 `<a:p>` 只留一个 `<a:pPr>`。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { buildPptx } from '../src/lib/pptxBuild.ts'
import type { SceneRunStyle, SlideScene } from '../src/lib/pptxTypes.ts'

const LATIN = 'Segoe UI'
const EA = 'Microsoft YaHei'

function runStyle(extra: Partial<SceneRunStyle> = {}): SceneRunStyle {
  return { color: 'F8FAFC', sizePt: 20, latin: LATIN, ea: EA, ...extra }
}

const INLINE_OMML = '<m:oMath><m:r><m:t>x</m:t></m:r></m:oMath>'
const DISPLAY_OMML = '<m:oMath><m:r><m:t>y</m:t></m:r></m:oMath>'

function sampleScene(): SlideScene {
  return {
    index: 1,
    kind: 'content',
    title: '示例',
    background: '1E1E2E',
    notes: '演讲者备注：第一页',
    overflowPx: 0,
    warnings: [],
    fontScale: 1,
    nodes: [
      // 渐变下划线（封面/标题下划线都走这条）
      {
        t: 'rect',
        x: 1, y: 1, w: 2, h: 0.05,
        fill: '4F46E5',
        gradient: { color: '4F46E5' },
        radiusPt: 1.5,
      },
      // 普通文本 + 行内公式
      {
        t: 'text',
        x: 1, y: 1.5, w: 8, h: 0.6,
        align: 'left', valign: 'top', lineSpacingPt: 28,
        baseColor: 'F8FAFC', baseSizePt: 20, latin: LATIN, ea: EA,
        paragraphs: [
          { runs: [{ text: '标题 ', style: runStyle({ bold: true }) }] },
          { runs: [{ text: '', style: runStyle({ mathTex: 'x^2', mathOmml: INLINE_OMML }) }] },
        ],
      },
      // 表格（<a:tbl> 不能被 xml:space 的正则误伤）
      {
        t: 'table',
        x: 1, y: 3, w: 6, h: 1,
        colW: [3, 3], rowH: [0.5, 0.5],
        rows: [
          [
            {
              text: '列一', bold: true, color: 'F8FAFC', sizePt: 16, latin: LATIN, ea: EA,
              borders: [null, null, null, null], align: 'left', valign: 'middle',
              margin: [0.05, 0.08, 0.05, 0.08],
            },
            {
              text: '列二', color: 'F8FAFC', sizePt: 16, latin: LATIN, ea: EA,
              borders: [null, null, null, null], align: 'left', valign: 'middle',
              margin: [0.05, 0.08, 0.05, 0.08],
            },
          ],
        ],
      },
      // 代码块（保留缩进空格 ⇒ 需要 xml:space="preserve"）
      {
        t: 'code',
        x: 1, y: 4.5, w: 6, h: 1,
        lines: [
          [{ text: '  const a = 1', style: runStyle({ sizePt: 14 }) }],
          [{ text: '  const b = 2', style: runStyle({ sizePt: 14 }) }],
        ],
        sizePt: 14, lineSpacingPt: 20, latin: LATIN, ea: EA, scale: 1,
      },
      // 独立公式（display）
      {
        t: 'math',
        x: 1, y: 5.8, w: 4, h: 0.6,
        tex: 'y', omml: DISPLAY_OMML, sizePt: 22, color: 'F8FAFC', latin: LATIN, ea: EA,
      },
    ],
  }
}

async function buildXml(scene: SlideScene = sampleScene()): Promise<{ xml: string; zip: JSZip }> {
  const buffer = await buildPptx({
    title: '测试演示',
    scenes: [scene],
    includeNotes: true,
    includeFooter: true,
  })
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
  return { xml, zip }
}

test('PPTX：公式转成 mc:AlternateContent + a14:m + OMML，且命名空间已声明', async () => {
  const { xml } = await buildXml()
  // 行内 + 显示各一处（各包一个形状）
  assert.equal((xml.match(/<mc:AlternateContent/g) || []).length, 2, xml.slice(0, 2000))
  assert.match(xml, /<m:oMathPara xmlns:m="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/math">/)
  assert.match(xml, /<m:oMathParaPr><m:jc m:val="centerGroup"\/><\/m:oMathParaPr>/)
  // 行内公式的 m: 前缀必须就地声明，否则 XML 非法
  assert.match(xml, /<a14:m><m:oMath xmlns:m="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/math">/)
  // 兜底文本仍保留 TeX
  assert.match(xml, /\$x\^2\$/)
  assert.match(xml, /\$y\$/)
  // 私有区标记不得残留
  assert.ok(!xml.includes('\uE000'), '导出后仍有公式占位标记')
  // OMML run 带字号/颜色/Cambria Math
  assert.match(xml, /<m:r><a:rPr lang="en-US" sz="2000"><a:solidFill><a:srgbClr val="F8FAFC"\/><\/a:solidFill><a:latin typeface="Cambria Math"/)
})

test('PPTX：公式的 MC 信封包住整个 p:sp（PowerPoint 原生写法），不写在 a:p 里', async () => {
  const { xml } = await buildXml()
  assert.match(xml, /<mc:AlternateContent xmlns:mc="[^"]+"><mc:Choice xmlns:a14="[^"]+" Requires="a14"><p:sp>/)
  // 段落内部一旦出现 AlternateContent，PowerPoint 会把公式整段丢掉（空白）
  assert.ok(
    !/<a:p>(?:(?!<\/a:p>)[\s\S])*?<mc:AlternateContent/.test(xml),
    'MC 信封不能出现在段落内部',
  )
  // Fallback 必须是形状（spTree 的合法子元素），而不是裸 run
  assert.match(xml, /<\/mc:Choice><mc:Fallback><p:sp>/)
})

test('PPTX：缺少或空 OMML 时回退成 TeX，不生成空公式（PowerPoint 空白）', async () => {
  const scene = sampleScene()
  scene.nodes = [
    {
      t: 'math',
      x: 1, y: 1, w: 4, h: 0.8,
      tex: 'a+b', sizePt: 22, color: 'F8FAFC', latin: LATIN, ea: EA,
    },
    {
      t: 'math',
      x: 1, y: 2, w: 4, h: 0.8,
      tex: 'c', omml: '<m:oMath><m:r><m:t></m:t></m:r></m:oMath>',
      sizePt: 22, color: 'F8FAFC', latin: LATIN, ea: EA,
    },
  ]
  const { xml } = await buildXml(scene)
  assert.ok(!xml.includes('<a14:m'), '空 OMML 不应生成原生公式')
  assert.ok(!xml.includes('<mc:AlternateContent'), '没有可用公式时不需要 MC 信封')
  assert.match(xml, /\$a\+b\$/)
  assert.match(xml, /\$c\$/)
})

test('PPTX：根节点补 mc/a14 命名空间', async () => {
  const { xml } = await buildXml()
  assert.match(xml, /<p:sld[^>]*xmlns:a14="http:\/\/schemas\.microsoft\.com\/office\/drawing\/2010\/main"/)
  assert.match(xml, /<p:sld[^>]*xmlns:mc="http:\/\/schemas\.openxmlformats\.org\/markup-compatibility\/2006"/)
  assert.match(xml, /<p:sld[^>]*mc:Ignorable="a14"/)
})

test('PPTX：latin|ea 哨兵拆到 a:latin / a:ea / a:cs', async () => {
  const { xml } = await buildXml()
  assert.ok(!xml.includes('|'), '仍有未拆分的字体哨兵')
  assert.match(xml, /<a:latin typeface="Segoe UI" pitchFamily="34" charset="0"\/>/)
  assert.match(xml, /<a:ea typeface="Microsoft YaHei" pitchFamily="34" charset="-122"\/>/)
  assert.match(xml, /<a:cs typeface="Microsoft YaHei" pitchFamily="34" charset="-120"\/>/)
})

test('PPTX：渐变下划线换成 gradFill（两端 accent → transparent）', async () => {
  const { xml } = await buildXml()
  assert.match(xml, /<a:gradFill rotWithShape="1">/)
  assert.match(xml, /<a:gs pos="0"><a:srgbClr val="4F46E5"\/><\/a:gs>/)
  assert.match(xml, /<a:gs pos="100000"><a:srgbClr val="4F46E5"><a:alpha val="0"\/><\/a:srgbClr><\/a:gs>/)
})

test('PPTX：<a:t> 统一补 xml:space，且不误伤 <a:tbl> / <a:tabLst>', async () => {
  const { xml } = await buildXml()
  // 代码缩进的首部空格必须保留
  assert.match(xml, /<a:t xml:space="preserve">  const a = 1<\/a:t>/)
  // 表格结构的标签不能被写成 <a:t xml:space="preserve"bl…>
  assert.ok(!/xml:space="preserve"(bl|abLst)/.test(xml), 'xml:space 正则误伤了表格标签')
  assert.match(xml, /<a:tbl>/)
  // 公式兜底文本也保留了 xml:space
  assert.match(xml, /<a:t xml:space="preserve">\$y\$<\/a:t>/)
})

test('PPTX：同一 <a:p> 只保留一个 <a:pPr>', async () => {
  const { xml } = await buildXml()
  const paragraphs = xml.match(/<a:p>[\s\S]*?<\/a:p>/g) || []
  assert.ok(paragraphs.length > 0)
  for (const p of paragraphs) {
    const count = (p.match(/<a:pPr\b/g) || []).length
    assert.ok(count <= 1, `段落里有 ${count} 个 a:pPr：${p.slice(0, 300)}`)
  }
})

test('PPTX：圆角半径按英寸换算（12px 圆角不能变成胶囊）', async () => {
  // 回归：rectRadius 在 pptxgenjs 里是**英寸**，内部再除一次短边得到 adj。
  // 早先传的是点（或点/短边），代码块 12px 圆角被放大成短边一半 → 胶囊形。
  const buf = await buildPptx({
    title: 't',
    scenes: [{
      index: 1, kind: 'content', title: 't', background: '1E1E2E', notes: '',
      overflowPx: 0, warnings: [], fontScale: 1,
      nodes: [{ t: 'rect', x: 1, y: 1, w: 6, h: 1.9, fill: '101828', radiusPt: 9 }],
    }],
    includeNotes: false,
    includeFooter: false,
  })
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
  const adj = Number(/fmla="val (\d+)"/.exec(xml)?.[1])
  // 9pt = 0.125in，短边 1.9in ⇒ adj ≈ 6579（上限 50000）
  assert.ok(adj > 6000 && adj < 7200, '圆角 adj 偏移：' + adj)
})

test('PPTX：演讲者备注写入 notesSlide', async () => {
  const { zip } = await buildXml()
  const notesFile = Object.keys(zip.files).find((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))
  assert.ok(notesFile, '缺少 notesSlide')
  const notes = await zip.file(notesFile!)!.async('string')
  assert.match(notes, /演讲者备注/)
})

test('PPTX：16:9 尺寸按 1280×720 基准（12192000×6858000 EMU）', async () => {
  const { zip } = await buildXml()
  const presentation = await zip.file('ppt/presentation.xml')!.async('string')
  assert.match(presentation, /<p:sldSz cx="12192000" cy="6858000"\/>/)
})
