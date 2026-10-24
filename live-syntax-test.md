# 实时模式语法验收（P0 / P1）

> **怎么测**
>
> 1. 打开本文件，切到状态栏的「实时」模式；再切「预览」对照同一段的渲染结果。
> 2. 实时模式是「光标离开才渲染」：把光标点到别的行，本行源码才会变成成品样式；光标回到该行会恢复源码供编辑。
> 3. 公式类（`$…$`、表格单元格里的公式、`$$…$$`）需要先在 **设置 → 插件** 里启用 **KaTeX**。没启用时预览和实时都显示源码，这是正常的。
> 4. 远程图片依赖网络；加载失败时应回退成 alt 文本，而不是撑破行高。

[toc]

> 上面是 `[toc]` 目录：应与本文标题同步，点击任一条目会滚动到对应标题（不改光标位置）。
> 光标点进 `[toc]` 这一行时，目录会恢复成源码。

---

## 1. 行内 HTML（常用标签）

行内语义：H<sub>2</sub>O、x<sup>2</sup>、<u>下划线</u>、<ins>插入</ins>、<del>删除</del>、<s>删除线</s>、<mark>高亮</mark>、<kbd>Ctrl</kbd>+<kbd>C</kbd>、<small>小字</small>、<b>粗</b> / <strong>更粗</strong>、<i>斜</i> / <em>强调</em>、<code>行内代码</code>、<var>x</var>、<samp>输出</samp>、<cite>引用</cite>、<q>引号</q>、<abbr>HTML</abbr>、<big>大字</big>。

行内样式：<span style="color:#d33; font-weight:700">红色加粗</span>、<span style="background-color:#fff3b0">黄色底纹</span>、<font color="#377dff">font 颜色</font>、<span style="font-size:1.2em">大一号</span>。

换行标签：第一段文字<br>第二段紧随其后（同一源码行，实时里应真的换行，而不是显示 `<br>`）。

链接标签：<a href="https://example.com">行内 a 标签</a>（实时模式只保留链接样式，点击会落到编辑光标，不会跳转）。

行内 HTML 图片：文字 <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjI0IiBmaWxsPSIjMzM2NmNjIi8+PHRleHQgeD0iNCIgeT0iMTYiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IiNmZmYiPklNRzwvdGV4dD48L3N2Zz4=" alt="HTML img"> 后面文字。

> 预期：标签本身不可见，只看到 H₂O、x²、下划线、高亮等效果；光标进入本段时标签源码重新出现。

## 2. 转义与 HTML 实体

实体：AT&amp;T &copy; 2026 &mdash; &hellip; &#169; &#x2764; &nbsp;（末尾是不换行空格）。

转义：\*不是斜体\*、\_不是下划线\_、\[不是链接\]、\\ 是一个反斜杠。

行内代码里的实体不解码：`&copy;` 应原样显示 `&copy;`，不要变成 ©。

> 预期：光标移开后反斜杠隐藏、实体变成对应字符；行内代码区间完全不参与扫描。

## 3. 图片：行内 / 引用式 / 失败回退

行内图片（远程）：文字 ![远程小图](https://picsum.photos/id/237/80/48) 后面文字。

行内图片（内嵌 data URL）：文字 ![内嵌图](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjI0IiBmaWxsPSIjMzM2NmNjIi8+PHRleHQgeD0iNCIgeT0iMTYiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IiNmZmYiPklNRzwvdGV4dD48L3N2Zz4=) 后面文字。

失败回退（路径故意不存在）：文字 ![丢失的图](./images/does-not-exist.png) 后面文字。

引用式图片（完整写法）：文字 ![引用图][pic] 后面文字。

引用式图片（折叠写法）：文字 ![pic][] 后面文字。

未定义的引用式图片：这个 ![未定义][nope] 应完整保留源码，不能被吃掉 `![` / `]`。

> 预期：
> - 远程/内嵌/引用式图片都显示成小图（行高受限）；
> - 丢失的图显示 alt 文本「丢失的图」，不出现破图标；
> - 未定义的那一条保持原样，方便继续编辑。

## 4. 引用式链接与定义

完整引用：[foo][bar] 只显示 `foo`。

折叠引用：[bar][] 只显示 `bar`。

自定义文字：[点我看看][bar]。

短引用：[bar]（只有一个 label、定义存在）。

> 下面两行是「引用式定义」，光标移开后应折叠成一枚 chip（label → 目标地址），光标进入恢复源码：

[bar]: https://example.com/bar "Bar 的标题"
[baz]: <https://example.com/baz>

> 再引用一次第三个定义：[链接到 baz][baz]。

## 5. HTML 注释 / 演示指令

行内注释：前<!-- 这是行内注释，应折叠成小 chip -->后。

独占一行的注释/演示指令（光标移开后折叠，进入后恢复源码）：

<!-- layout: center -->

多行注释块：

<!--
这是一段多行注释
第二行内容
-->

> 预期：行内注释变成一枚淡淡的 chip，独占行的注释也不占正文空间；光标进入该块恢复 `<!-- … -->` 源码。

## 6. 表格：列对齐 + 单元格内联
| 左对齐 | 居中 | 右对齐 | 默认 |
| :--- | :---: | ---: | ---: |
| **加粗** | `code` | $x^2$ | 普通 |
| ~~删除线~~ | [链接](https://example.com) | ![单元格图](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjI0IiBmaWxsPSIjMzM2NmNjIi8+PC9zdmc+) | <mark>高亮</mark> |
| 第三行 | 跨列不测 | 123 | 456 |

> 预期：
> - 表头与前两行分别左 / 居中 / 右 / 左对齐；
> - 单元格里的加粗、代码、删除线、链接、公式、图片都生效（公式需启用 KaTeX）；
> - 点击单元格进入源码编辑（`$x^2$` 会先变回源码），回车或失焦写回文档。

## 7. 任务列表：有序 / 无序 / 嵌套

有序任务（序号应保留，checkbox 在序号后面）：

1. [ ] 有序任务：未完成
2. [x] 有序任务：已完成
3. [X] 大写 X 也算已勾选

无序任务：

- [ ] 无序任务：未完成
- [x] 无序任务：已完成
  - [ ] 嵌套子任务（保留缩进）

> 预期：
> - 勾选框可见、可点击；点击后源码里的 `[ ]` / `[x]` 立即被改写（切到「源码」模式确认）；
> - 有序列表的 `1.` `2.` `3.` 不能被 checkbox 顶掉；
> - 嵌套任务保持缩进。

## 8. 代码块：高亮 / 语言标签 / 复制

```js
// 鼠标移入代码块右上角会出现复制按钮
const greeting = 'hello'
function add(a, b) {
  return a + b
}
console.log(add(1, 2))
```

```python
# Python 高亮
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

```text
没有语言标识的围栏块：仍应有等宽样式与复制按钮。
```

缩进代码块（4 个空格，确认不会被当成脚注续行）：

    这是缩进代码块
    const x = 1

代码块里不应触发任何 Markdown 渲染：

```md
**不应加粗** &copy; <sup>2</sup> [toc] [^x]
```

> 预期：围栏块内按语言高亮，左下角显示语言名，右上角复制按钮可复制原文；光标进入块内恢复源码。

## 9. 脚注：编号 / 多行 / 多段

编号按「首次出现顺序」：先引用脚注 B[^second]，再引用脚注 A[^first]，重复引用同一个脚注[^first]。

行内代码里的脚注语法不算引用：`[^notaref]`。

[^first]: 第一条脚注定义。

    这是第一段的续行，包含 **加粗**、`行内代码`，光标移开时不应显示成灰色代码块。

    这是第二段（空行 + 4 格缩进）。

[^second]: 第二条脚注定义（单行）。

> 预期：
> - 正文里的 `[^second]` 显示为 1，两个 `[^first]` 都显示为 2；
> - 定义区首行显示序号 `1.` `2.`，上方有分隔线；
> - 多行/多段续行是正常正文样式，加粗与行内代码正常渲染；光标进入续行时恢复源码。

## 10. 块级公式与行内公式行

单行块级公式：

$$E = mc^2$$

多行块级公式：

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

行内公式整行：**加粗** 与 `$notmath$` 以及 $E = mc^2$ 结束，[这里还有链接](https://example.com)。

> 预期（需启用 KaTeX）：
> - 两个 `$$` 块都渲染成块级公式；
> - 最后一个整行公式里，`**加粗**` 保持加粗、`` `$notmath$` `` 保持代码且不当公式、链接保持链接、`$E = mc^2$` 渲染成公式 —— 不能像旧版那样整行只剩公式；
> - 光标进入这些行时恢复源码。

## 11. 边界与反例（这些「不渲染」才是对的）

- 未定义引用链接：[没有定义的][missing] 应保持源码。
- 引用式定义缺失图片：见第 3 节。
- 行内代码里的语法：`**不是加粗**`、`` `[toc]` ``、`` `$不是公式$` ``。
- 未闭合的 HTML 标签：<span 应保持源码（标签不配对时不猜渲染）。
- 未闭合的围栏代码块：

```text
没有闭合围栏时，后面所有内容都应留在代码块里（这是 CommonMark 的行为）
本文件有意保持闭合，避免吞掉后续内容。

---

## 验收清单（可直接勾选）

- [ ] 行内 HTML 全部按语义显示，标签隐藏，`<br>` 真的换行
- [ ] 实体解码、反斜杠转义隐藏；行内代码不参与扫描
- [ ] 行内图片、引用式图片显示；加载失败回退 alt
- [ ] 未定义的引用式图片保留完整源码
- [ ] 引用式链接只显示链接文字；定义行折叠成 chip
- [ ] 行内注释 / 独占行注释折叠成 chip
- [ ] 表格列对齐正确，单元格加粗/代码/删除线/链接/公式/图片生效
- [ ] 表格单元格可进入源码编辑并写回
- [ ] 有序任务保留序号、checkbox 可勾选并回写；嵌套任务保留缩进
- [ ] `[toc]` 渲染目录，点击可滚动到标题
- [ ] 代码块高亮、语言标签、复制按钮正常；光标进入恢复源码
- [ ] 缩进代码块正常，脚注续行不被误判为代码块
- [ ] 脚注编号按首次出现顺序；多行/多段续行渲染为正文
- [ ] 行内公式整行保留加粗/代码/链接等其它行内语法
- [ ] 所有「光标进入恢复源码」的位置都可正常编辑

## 附：本文件用到的引用式定义

[pic]: data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjI0IiBmaWxsPSIjMzM2NmNjIi8+PHRleHQgeD0iNCIgeT0iMTYiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IiNmZmYiPklNRzwvdGV4dD48L3N2Zz4= "引用式图片标题"

> 上面这行在实时模式里也是一枚 chip；`[pic]` 指向它，所以第 3 节能显示图片。

---

## 本次未实现（P2，见到原文属正常）

以下语法不在本轮范围，实时/预览都会按纯文本或现有规则处理，不要按「应该渲染」来验收：

- `==高亮==`、`^上标^`、`~下标~`、`:emoji:`
- 定义列表、callout / admonition
- wiki link `[[页面]]`
- 标题属性 `{#id .class}`
