# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)

[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)

**Official Website:** https://md.yizigpt.com

A concise and elegant cross-platform `Markdown` editor, supporting Windows portable and macOS versions. No installation required, just extract and use, combining beauty with practicality. Windows can be installed or downloaded as a zip archive for extraction; macOS provides a universal binary installer that runs natively on both Intel and Apple Silicon.

Why develop a `Markdown` editor?

Many `Markdown` editors on the market either have poor interface aesthetics or are overly complex and bloated, making it hard to find an editing tool that is both simple, beautiful, and easy to use.

Thus, YiziMarkdown was born.

We have created an extremely elegant experience for WYSIWYG mode; it also supports PPT-like quick presentation capabilities, allowing written notes and documents to quickly switch to presentation mode for convenient sharing and reporting. Try it to believe it.

---

## Features

### Multi-language Interface

- **15 interface languages**: Simplified Chinese (default), Traditional Chinese, English, Japanese, Korean, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська
- Settings → General → One-click interface language switch, instantly effective; all interface text, shortcut key panels, and plugin descriptions are linked with language

### AI Assistant (Side Chat Panel)

- **17 major model providers + custom service**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen, Zhipu GLM, Moonshot Kimi, Volcano Engine, SiliconFlow, MiniMax, OpenRouter, OpenCode Go, Ollama (local); "Custom service" supports OpenAI-compatible / Anthropic-compatible protocols, fill in Base URL, model ID, and key yourself, can connect to any third-party service
- **AI Skills (Skill)**: Click the ⚡ button in the input box to pop up the skill menu, after selection the skill tag is inserted at the cursor, and the prompt is automatically injected into the context; put `skills.json` + `.md` prompt files in the `skills/` directory to customize skills. Built-in "Presentation Outline", "Document Summary", "Polish Writing" 3 skills
- **Streaming conversation**: Click the robot button on the toolbar to open the right AI panel, replies are output in real-time streaming, can stop at any time
- **Thinking process display**: The reasoning model's thinking content (reasoning/thinking) is displayed in a collapsible block, collapsed by default, not affecting the main text reading
- **Key security**: API keys are stored in the system keychain (OS keychain), supporting one-click save, clear, and verification; local endpoints (llama.cpp / LM Studio / vLLM, etc.) keys can be left empty
- **Reference current document**: After checking, send the current document as context to AI, can configure reference limit (64K~512K/unlimited) and context rounds (0~20 rounds, default 3 rounds)
- **Result saving**: Replies can be copied, inserted at the document cursor, or created as a new document with one click

### Editing and Preview

- **Source code editing**: CodeMirror 6 kernel, syntax highlighting, bracket matching, auto-completion
- **Real-time mode (WYSIWYG)**: What you see is what you get editing, automatically hides Markdown markers when typing, focusing on content creation
- **Real-time mode animations**: 4 marker appearance animation schemes (Focus/Flash/Glow/Ripple), can preview and switch in settings
- **Real-time preview**: Markdown renders as you write, supports interactive task list checkboxes
- **Five view modes**: Source / Side-by-side / Real-time (WYSIWYG) / Preview / Presentation (full-screen slides), switch with one click
- **Outline-driven scroll synchronization**: In side-by-side mode, left and right panels are bidirectional linked, automatically positions to current location when switching views
- **Search and replace**: Supports match navigation, replace all
- **Toolbar quick formatting**: Bold, italic, strikethrough, inline code, wrap selected text instantly
- **Local image rendering**: Preview mode automatically renders local path images (jpg/png/gif/webp/svg/bmp)
- **Line numbers / Word wrap**: Both can be toggled in settings
- **Code block enhancement**: Syntax highlighting (highlight.js), language tags, copy button, word wrap toggle
- **Format toolbar collapse**: Automatically collapses when window width is insufficient, supports manual expand/collapse
- **Frontmatter filtering**: Preview/side-by-side/real-time modes automatically filter YAML frontmatter

### Math Formulas and Diagrams

- **KaTeX formulas**: Built-in KaTeX plugin, inline `$...$` and block `$$...$$` LaTeX formulas render in real-time
- **Mermaid diagrams**: Built-in Mermaid plugin, flowcharts, sequence diagrams, Gantt charts, class diagrams, pie charts, etc. automatically render into visual charts, supports multiple theme configurations
- **Table row and column selector**: Click the table button on the toolbar to open an 8×8 grid, click to insert a table with corresponding rows and columns

### Presentation Mode (Slides)

- **Pure Markdown driven**: No extra format needed, `---` (horizontal rule) for pagination, the engine analyzes the entire page structure and automatically selects the layout
- **14 automatic layouts**: Cover, chapter page, ending page, table of contents, content, list, data table, roadmap, text-image, image, quote, code, diagram (mermaid), formula
- **Content page left-aligned + emphasis underline**: Title top-left aligned with theme color underline, body text left-aligned, comfortable reading
- **Quote page diagonal large quotation marks**: Opening quotation mark hangs top-left, closing quotation mark hangs bottom-right, content vertically centered
- **Explicit instructions**: `<!-- layout: xxx -->` forces layout, `<!-- align: left|center|right -->` full-page alignment (HTML comments, invisible in rendering)
- **Cover meta**: Front matter provides `author`/`date`, cover displays automatically
- **Footer and progress**: Bottom-left chapter name + page number, bottom theme color progress bar
- **Mouse wheel page turning**: When content is scrollable, scroll content first, then turn page at boundary
- **Theme inheritance**: Title colors change precisely with theme (all 15 themes support), can switch theme/light-dark during presentation
- **Fullscreen toggle**: F key fullscreen/restore, supports reliable entry from any window state (normal/maximized)
- **Exit button**: Semi-transparent exit button appears in top-right corner when mouse is active, auto-hides after 1.5 seconds of inactivity
- **Window state restore**: Automatically restores to the window state before entry (fullscreen/maximized/normal) when exiting presentation

### Plugin System

- Plugin architecture, built-in KaTeX and Mermaid two core plugins
- Settings panel "Plugins" page supports enable/disable control and plugin configuration
- Plugins are loaded dynamically on demand, disabled plugins do not consume resources

### Multi-file Management

- **Single instance mode**: Opening multiple files no longer launches multiple windows, automatically merges into existing instance, repeatedly opened files automatically locate to corresponding tab
- **Tab bar**: Top manages multiple open files, switch, close, create new
- **Home page**: Recent opened file list, includes file size and modification time
- **Save status indicator**: Unsaved files show breathing dot animation, saved files show ✅ confirmation animation
- **Close confirmation**: Unsaved files prompt save / don't save / cancel confirmation when closing

### File Operations

- **Open**: Supports .md / .markdown / .txt
- **Create new**: Create blank tab, displays "Untitled New File"
- **Create from template**: Toolbar "Create from template" dropdown menu, creates new document based on selected template's Markdown structure; also can set default template in Settings → General, then `Ctrl+N` automatically applies
- **Save / Auto-save**: Manual save + configurable interval auto-save (5~180 seconds, default 60 seconds)
- **Save as**: Automatically pops up save-as dialog when saving new files
- **Export**: HTML / Markdown / Plain text three formats
- **.md file association**: One-click set as system default Markdown editor in settings, double-click .md to open directly (Windows registry / macOS LaunchServices)

### Appearance Customization

- **Fifteen built-in themes**: Academic Blue (default), Vibrant Orange, Tech, Minimalist, Magazine, Nature, Liquid Glass, Lychee Red, Violet, Cyberpunk, Facebook, Matrix, Mint, Sunset, Retro Typewriter, each with light and dark color schemes
- **Dark / Light mode**: Each theme has both light and dark color schemes
- **Font customization**: Source and preview modes can set font, font size, line height separately
- **Custom CSS**: `user.css` overrides after all themes, highest priority
- **Theme extension**: Put `.css` files in `themes/` directory, add theme parameters in `themes/theme.json`, automatically recognized after restart

### Others

- **Document templates**: Put `.md` files in `templates/` directory, can be selected when creating new
- **Shortcut key system**: Visual shortcut key configuration panel, supports custom binding for 30 actions, key recording, conflict detection, and restore defaults
- **Settings panel**: General, Appearance, Editor, Real-time mode, AI, Plugins, Shortcut keys, Templates, About and other tabs, settings take effect immediately

---

## Shortcut Keys

| Shortcut Key | Function |
|--------------|----------|
| Ctrl+N | Create new file |
| Ctrl+O | Open file |
| Ctrl+S | Save file |
| Ctrl+Shift+S | Save as |
| Ctrl+W | Close tab |
| Ctrl+H | Export HTML |
| Ctrl+M | Export Markdown |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+F | Search |
| Ctrl+\ | Toggle sidebar |
| Ctrl+B | Bold |
| Ctrl+I | Italic |
| Ctrl+- | Strikethrough |
| Ctrl++ | Inline code |
| Ctrl+1 | Heading 1 |
| Ctrl+2 | Heading 2 |
| Ctrl+3 | Heading 3 |
| Ctrl+. | Unordered list |
| Ctrl+0 | Ordered list |
| Ctrl+' | Quote |
| Ctrl+K | Link |
| Ctrl+` | Code block |
| Ctrl+T | Table |
| Ctrl+L | Horizontal rule |
| F1 | Shortcut key guide |
| F2 | Toggle dark/light mode |
| F3 | Cycle through views |
| Ctrl+Alt+P | Presentation mode (slides) |
| Ins | Slash menu |
| F12 | Developer tools |

Shortcut keys can be customized in Settings → Shortcut keys, supporting visual configuration and conflict detection.

---

## Portable Version Directory Structure

```
YiziMarkdown/
├── YiziMarkdown.exe        # Main program
├── readme.md               # Project description (this file)
├── welcome.md              # Welcome document
├── changelog.md            # Development log
├── user.css                # User custom styles
├── keybindings.json        # Shortcut key configuration
├── themes/                 # Theme CSS files
│   ├── academic.css        # Academic Blue (default)
│   ├── vibrant.css         # Vibrant Orange
│   ├── tech.css            # Tech
│   ├── minimal.css         # Minimalist
│   ├── magazine.css        # Magazine
│   ├── nature.css          # Nature
│   ├── liquidglass.css     # Liquid Glass
│   ├── lychee.css          # Lychee Red
│   ├── violet.css          # Violet
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Mint
│   ├── sunset.css          # Sunset
│   └── typewriter.css      # Retro Typewriter
├── skills/                 # AI Skills (Skill)
│   ├── skills.json         # Skill list
│   ├── slides-outline.md   # Presentation Outline
│   ├── doc-summary.md      # Document Summary
│   └── polish-writing.md   # Polish Writing
└── templates/              # Document templates
    └── default.md          # Default template
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop framework | Tauri 2 (Rust) |
| Frontend framework | React 18 + TypeScript |
| Editor kernel | CodeMirror 6 |
| State management | Zustand (persist) |
| Styling | Tailwind CSS + CSS variables |
| Markdown rendering | markdown-it |
| Internationalization | Custom lightweight i18n (15 languages) |
| AI integration | Rust streaming proxy (OpenAI/Anthropic/Ollama protocols) |
| Build tool | Vite |

---

## Development

### Environment Requirements

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Start Development Server

```bash
cd code
npm install
npm run tauri:dev
```

### Build Release Version

**Windows**

```bash
npm run tauri:build
```

Build artifacts:
- Portable exe: `src-tauri/target/release/yizimarkdown.exe`
- MSI installer: `src-tauri/target/release/bundle/msi/`
- NSIS installer: `src-tauri/target/release/bundle/nsis/`

After building, manually copy the exe and resource files to the `public/YiziMarkdown-vX.X.X/` directory for distribution.

**macOS (Universal binary, supporting both Intel and Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Build artifacts:
- Application bundle: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Installer: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### Project Structure

```
code/
├── src/                    # Frontend source code
│   ├── App.tsx             # Main application component
│   ├── components/         # UI components
│   │   ├── Editor.tsx      # CodeMirror editor + preview
│   │   ├── TabBar.tsx      # Tab bar
│   │   ├── HomePage.tsx    # Home page (recent files)
│   │   ├── Toolbar.tsx     # Toolbar
│   │   ├── Sidebar.tsx     # Sidebar (outline + file browser)
│   │   ├── StatusBar.tsx   # Bottom status bar
│   │   └── SettingsModal.tsx # Settings panel
│   ├── stores/             # Zustand state management
│   ├── lib/                # Utility library (Markdown rendering, heading IDs)
│   └── styles/             # Global styles
├── src-tauri/              # Rust backend
│   ├── src/main.rs         # Tauri commands (file I/O, theme loading, registry, etc.)
│   ├── icons/              # Application icons
│   ├── themes/             # Theme CSS
│   └── templates/          # Document templates
└── package.json
```

---

## License

MIT