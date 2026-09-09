# 修改或自定义 Skill 技能

## 什么是 Skill？

Skill（技能）是 YiziMarkdown AI 对话面板中的预设提示词模板。选择一个 Skill 后，AI 会按照该技能的提示词执行特定任务，例如：

- **演示稿提炼** — 将文档转为幻灯片格式的 Markdown
- **文档摘要** — 快速总结文档核心内容
- **润色改写** — 优化文字表达
- **全文翻译** — 翻译文档内容

每个 Skill 由两部分组成：
1. **`skills.json`** — 技能清单（元数据：名称、描述、是否需要文档等）
2. **`<file>.md`** — 提示词正文（告诉 AI 具体如何执行）

## 存储位置

Skill 文件存储在用户文档目录下：

| 系统 | 路径 |
|------|------|
| Windows | `C:\Users\<用户名>\Documents\yizimarkdown\skills\` |
| macOS | `/Users/<用户名>/Documents/yizimarkdown/skills/` |

目录结构：
```
yizimarkdown/
└── skills/
    ├── skills.json           ← 技能清单
    ├── slides-outline.md     ← 演示稿提炼提示词
    ├── doc-summary.md        ← 文档摘要提示词
    ├── polish-writing.md     ← 润色改写提示词
    └── translate-fulltext.md ← 全文翻译提示词
```

## 更新覆盖机制

YiziMarkdown 更新版本时，会自动处理 Skill 文件：

| 场景 | 行为 |
|------|------|
| 首次安装 | 所有内置 Skill 复制到用户文档目录 |
| 版本更新（`skills.json` 中 `version` 变化） | 内置 Skill 的 `.md` 文件被覆盖（提示词同步更新），用户自定义的 Skill 保留不动 |
| 版本一致 | 不做任何操作 |

**注意**：如果你修改了内置 Skill 的 `.md` 文件，下次版本更新时会被覆盖。建议通过复制一份来创建自定义 Skill。

## 如何创建自定义 Skill

### 方法一：手动创建

**第 1 步：编写提示词文件**

在 `skills/` 目录下新建一个 `.md` 文件，例如 `my-skill.md`：

```markdown
你是一个专业的代码审查助手。

请按照以下步骤审查用户提供的代码：
1. 检查代码风格是否一致
2. 识别潜在的 Bug 和逻辑错误
3. 评估性能和可读性
4. 给出具体的改进建议

输出格式：
- 问题列表（按严重程度排序）
- 每个问题的具体位置和修复建议
```

**第 2 步：在 `skills.json` 中注册**

打开 `skills.json`，在 `skills` 数组中添加一项。具体格式和逗号规则请参见下方「`skills.json` 完整格式」章节。

**第 3 步：重启应用**

保存后重启 YiziMarkdown，新的 Skill 就会出现在列表中。

### 方法二：复制内置 Skill 修改

1. 复制现有的 `.md` 文件，例如将 `polish-writing.md` 复制为 `my-polish.md`
2. 修改提示词内容
3. 在 `skills.json` 中添加新条目，`file` 指向新文件名

## `skills.json` 完整格式

`skills.json` 是标准 JSON 文件，遵循以下语法规则：

- 所有字符串用**双引号** `"` 包裹，不能用单引号
- 键值对之间用**逗号** `,` 分隔
- `skills` 数组中的每个技能对象之间用**逗号** `,` 分隔
- **最后一个技能对象后面不加逗号**（尾逗号会导致解析失败）
- 文件编码必须为 **UTF-8**

### 示例：添加一个自定义技能

假设当前 `skills.json` 内容如下，要在末尾追加一个"代码审查"技能：

**追加前**（注意最后一个技能 `translate-fulltext` 后面没有逗号）：

```json
{
  "version": 2,
  "skills": [
    {
      "id": "slides-outline",
      "name": "演示稿提炼",
      "summary": "把当前文档提炼为简洁的演示模式 Markdown",
      "file": "slides-outline.md",
      "needsDoc": true
    },
    {
      "id": "translate-fulltext",
      "name": "全文翻译",
      "summary": "将内容完整翻译为目标语言",
      "file": "translate-fulltext.md",
      "needsDoc": true
    }
  ]
}
```

**追加后**（在 `translate-fulltext` 对象的 `}` 后加逗号，再添加新技能）：

```json
{
  "version": 2,
  "skills": [
    {
      "id": "slides-outline",
      "name": "演示稿提炼",
      "summary": "把当前文档提炼为简洁的演示模式 Markdown",
      "file": "slides-outline.md",
      "needsDoc": true
    },
    {
      "id": "translate-fulltext",
      "name": "全文翻译",
      "summary": "将内容完整翻译为目标语言",
      "file": "translate-fulltext.md",
      "needsDoc": true
    },
    {
      "id": "code-review",
      "name": "代码审查",
      "summary": "审查代码质量并给出改进建议",
      "description": "对用户提供的代码进行全面审查，包括风格、Bug、性能等方面。",
      "file": "code-review.md",
      "needsDoc": false
    }
  ]
}
```

### 逗号规则速查

| 位置 | 是否加逗号 | 示例 |
|------|-----------|------|
| 同一对象内，最后一个字段后 | 不加 | `"needsDoc": false`（后面是 `}`） |
| 数组中，最后一个元素后 | 不加 | `}`（后面是 `]`） |
| 数组中，非最后一个元素后 | 必须加 | `},`（后面还有下一个 `{`） |
| 对象内，非最后一个字段后 | 必须加 | `"name": "xx",`（后面还有下一个字段） |

### 常见错误

```json
// ❌ 错误：最后一个技能后加了逗号
{
  "skills": [
    { "id": "a", ... },
    { "id": "b", ... },    ← 这里多了一个逗号！
  ]
}

// ✅ 正确：最后一个技能后不加逗号
{
  "skills": [
    { "id": "a", ... },
    { "id": "b", ... }     ← 没有逗号
  ]
}
```

字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一标识符，建议用英文小写和连字符 |
| `name` | 是 | 显示在列表中的名称 |
| `summary` | 是 | 一句话简介，列表中显示 |
| `description` | 否 | 详细说明，hover 时显示 |
| `file` | 是 | 提示词文件名（需与 `skills/` 目录下的文件名一致） |
| `needsDoc` | 否 | 是否需要引用当前文档。`true` = AI 会自动读取当前打开的文档内容 |

**第 3 步：重启应用**

保存后重启 YiziMarkdown，新的 Skill 就会出现在列表中。

## 提示词编写技巧

1. **明确角色**：告诉 AI 它扮演什么角色（如"你是一个专业的翻译"）
2. **分步骤**：用编号列出执行步骤，AI 更容易遵循
3. **指定格式**：说明输出的格式要求（Markdown、列表、表格等）
4. **设置约束**：告诉 AI 什么不该做（如"不要添加额外解释"）
5. **利用文档**：设置 `needsDoc: true` 后，AI 可以读取当前文档内容作为上下文

## 常见问题

**Q: 修改后没有生效？**
A: 请重启 YiziMarkdown。技能列表在应用启动时加载。

**Q: 不小心删除了内置 Skill 怎么办？**
A: 删除 `skills.json` 文件，重启应用会自动重新生成（从内置资源复制）。

**Q: 能否删除不需要的内置 Skill？**
A: 可以。在 `skills.json` 中删除对应条目即可。但下次版本更新时可能会重新出现。

**Q: `needsDoc` 设为 `true` 但没有打开文档？**
A: AI 会正常执行，只是没有文档上下文。建议在打开文档后使用需要文档的 Skill。
