# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](../../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md) | [Русский](./readme-ru.md)

**Official website:** https://md.yizigpt.com

YiziMarkdown is a cross-platform Markdown editor built around writing. One `.md` file gets seven ways to present itself: source editing, side-by-side proofing, live writing, finished preview, slide presentation, book-style reading, and a zen mode that leaves only the text and keeps you focused on writing.

- **Windows**: installable (NSIS installer with in-app updates) or a portable zip — extract and run
- **macOS**: universal binary, native on both Intel and Apple Silicon
- **Linux**: Debian `deb` and portable `AppImage` (Ubuntu 22.04+ / Debian 12+, amd64 only for now)

Why build another Markdown editor? The options out there are either unpleasant to look at or bloated with features, and it is hard to find one that is both clean and comfortable to use. So YiziMarkdown was born, holding to three things: **a beautiful interface**, **formidable features**, **diverse scenarios**.

That is how today's `YiziMarkdown` came to be: `3 operating systems`, `7 usage modes`, `16 interface languages`, `15 light/dark themes`, `5 AI skills`, `7 export formats` — plus built-in innovations such as the AI assistant and cloud storage, and open documentation for themes, skills and presentations, so you can assemble a workflow that is uniquely yours.

This is no longer a simple Markdown editor, but a versatile application that truly covers your document scenarios in creation, work and daily life.

---

## Seven Modes: One Document, Seven Ways to Present It

Markdown matters not only while writing but also in how the result is shown. YiziMarkdown gives one document seven presentations: the first four are editing views that move between raw source and finished output; the last three are separate scenarios that turn the document into slides, pages, or just the text itself.

| Mode | What it is | Entry | Best for |
|------|------------|-------|----------|
| Source | Edit raw Markdown directly | `F3` / view buttons | Precise structure work, bulk replace, front matter |
| Side-by-side | Write on the left, compare on the right | `F3` / view buttons | Proofing layout, writing against a template |
| Live | WYSIWYG with markers hidden | `F3` / view buttons | Long-form writing, focused drafting |
| Preview | Finished layout only | `F3` / view buttons | Checking the result, reading through |
| Presentation | The document as a slide deck | `Ctrl+Alt+P` / toolbar | Sharing, reporting, teaching |
| Reading | The document as a page-turnable book | `Ctrl+Alt+R` / toolbar | Long reads, EPUB, immersive reading |
| Zen | The interface disappears, text remains | `F9` / toolbar | Deep writing |

`F3` cycles through Source / Side-by-side / Live / Preview; Presentation, Reading and Zen each have their own entry and do not conflict.

---

## Markdown Four-in-One

![Four modes compared](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

Source, Side-by-side, Live and Preview share one editor core and one set of Markdown capabilities. The difference is information density: from completely exposed markers to a fully typeset result. You can switch at any time and the view keeps its position as closely as it can.

### Source Mode: See Everything

- CodeMirror 6 core: syntax highlighting, bracket matching, auto-completion
- Line numbers and word wrap toggle independently; best for line-by-line work and bulk rewrites
- YAML front matter shown as-is, no guessing when editing metadata
- Tables, code blocks and formulas stay in source form — the most controllable option for complex structures

### Side-by-Side Mode: Write and Compare

- Source on the left, preview on the right, refreshed as you type
- Scroll sync is driven by the outline; switching views jumps back to your position
- Best for proofing layout or restructuring against an existing document

### Live Mode: What You See Is What You Get

- Markdown markers hide while typing and return when the cursor leaves, keeping you on the content
- Four marker appearance animations (Focus / Flash / Glow / Ripple), previewable and switchable in settings
- YAML front matter renders as an Obsidian-style editable property panel: auto / text / number / checkbox / date / date & time / list, with the type remembered globally per property name

### Preview Mode: Only the Result

- Markdown renders as you write; task-list checkboxes are clickable
- Local-path images, remote images and SVG all render (jpg / png / gif / webp / svg / bmp)
- Front matter is hidden automatically — what you see is the final layout

### What All Four Share

- **Search and replace**: match navigation and replace-all
- **Toolbar formatting**: bold, italic, strikethrough, inline code — wrap the selection instantly
- **Code block extras**: highlight.js syntax colors, language labels, copy button, word-wrap toggle
- **Table picker**: an 8×8 grid, pick rows and columns in one click
- **Formulas and diagrams**: KaTeX inline `$...$` / block `$$...$$`, plus Mermaid flowcharts, sequence diagrams, Gantt charts, class diagrams, pie charts and more, colored by the current theme
- **Collapsible format toolbar**: collapses automatically when the window narrows, and can be toggled manually
- **Line numbers and word wrap**: both switchable in settings
- **Outline navigation**: heading hierarchy comes from the document and follows the scroll position

---

## Presentation Mode: Your Notes as a Slide Deck

![Presentation mode](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

No exporting to PowerPoint: switch to Presentation and the document becomes a full-screen deck. Pagination, columns and layouts are inferred from the Markdown structure, with HTML comment directives when you need exact control.

### Content Becomes Slides

- No extra format required: `---` (horizontal rule) starts a new slide
- A `***` on its own line splits the slide into columns, up to four
- The engine reads the page structure and picks a layout: headings, lists, tables, code, images and diagrams each have one

### 14 Layouts

Cover, section, closing, agenda, content, list, data table, roadmap, text + image, image, quote, code, diagram (Mermaid), formula.

- Apart from “text + image”, which needs an explicit `<!-- layout: figure -->`, every layout is inferred from the content
- Content pages are left-aligned, with a theme-colored underline under the title
- Quote pages carry diagonal quotation marks: opening at top-left, closing at bottom-right, content vertically centered
- The cover reads `author` / `date` from front matter

### Typography Controls While Presenting

- HUD controls: font (follow theme / sans / serif / mono), weight, size, and content area width/height (50%–95%)
- Changes apply instantly and persist for the next run
- Long inline code wraps instead of being clipped at the page edge
- Directives: `<!-- layout: xxx -->` forces a layout, `<!-- align: left|center|right -->` aligns the whole page

### Navigation and Screen

- Chapter name and page number at bottom-left, a theme-colored progress bar along the bottom
- `T` opens the agenda drawer; `G` or the bottom input jumps to a page
- Mouse wheel turns pages: content scrolls first, and the page turns at the boundary
- `F` toggles full screen, working reliably from normal or maximized windows
- The previous window state is restored on exit; the exit button fades out after 1.5 s of inactivity
- Themes are inherited, so title colors follow the theme; theme and light/dark can be switched while presenting

---

## Reading Mode: The Document as a Book

![Reading mode](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

Reading mode is not a full-screen preview: the text is actually typeset into fixed pages, with a cover, title page, table of contents, page numbers, paper and page-turn motion.

- Entry: the book button in the toolbar or `Ctrl+Alt+R`; `Esc` exits and restores the previous view
- Layout: a thin border with even margins wraps the pages; two pages join with a single gutter line; book title top-left, chapter/page bottom-left, HUD bottom-right — the same positions as Presentation
- Cover, title page and contents are generated automatically: the title comes from front matter `title` or the first H1, contents are built from headings with page numbers and paginated when long
- Real pagination: spreads by default, single page in narrow windows, with page numbers and reading progress

### Page-Turn Animations

Four options, switchable in settings, horizontal slide by default:

- **Horizontal slide** (default): the whole page translates — crisp and quick
- **3D flip**: the leaf curls from the bottom-right and folds around the gutter, with lift, light and shadow (around the spine in single-page mode)
- **Fade** / **Zoom**: quieter transitions

Rapid presses never skip pages; jumps from contents, page numbers and footnotes play no animation.

### Page-Level Pagination Rules

Paragraphs split by line, headings never orphaned, table headers repeat on continuation pages, code blocks continue line by line, lists continue item by item, whole images scale proportionally; body paragraphs get a two-character first-line indent that is not repeated on continuation pages.

### Navigation and Details

- Contents drawer: `T`, headings with page numbers, click to jump
- `G` or the page-number input jumps to a page
- Footnote round-trip: clicking a reference jumps to the definition page and highlights it, with a “back to reference” button; internal anchors jump by page too
- Reading HUD: light/dark, theme, font (theme / serif / sans / mono), size and line spacing, applying only to this reading session
- Position memory: page/chapter remembered per document and restored on re-entry
- Controls: arrow keys, PageUp / PageDown, space, mouse wheel, and clicking the left or right page edge

### EPUB

Opening an `.epub` goes straight into reading mode: the app reading theme is used (publisher CSS is ignored), and the embedded cover, navigation, images, formulas, Mermaid SVG, footnotes and cross-chapter links are read. DRM-protected and fixed-layout (comics / picture books) EPUBs are not supported yet.

---

## Zen Mode: Only the Text

![Zen mode](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

Enter with `F9` or the toolbar button. Toolbar, tab bar, sidebar, AI panel and status bar fold away toward the screen edges layer by layer, leaving only the text; **the layout never changes**, so the text does not move by a single pixel.

- **The world is still there**: move the pointer against any screen edge (top / left / right / bottom) and that region fades back in place; it retracts about 1.2 s after the pointer leaves
- **A permanent switch**: the zen button never disappears and stays where it was (with a very faint breathing ripple around it) — both a reminder that you are in zen mode and the way out; `F9` / `Esc` also exit
- **Writing only**: available in Source / Live; switching to Side-by-side or Preview, or entering Reading / Presentation, exits automatically
- **A cleaner sheet**: line numbers and sidebar rules hidden, a very light vignette, the pointer hidden after 2 s of stillness, and the vertical scrollbar replaced by a minimal sliver that appears while scrolling or near the right edge

---

## Files and Writing

### Files and Tabs

- **Open**: `.md` / `.markdown` / `.txt` / `.epub`; EPUB goes straight into reading mode
- **Single instance**: multiple files merge into the existing window, and a file that is already open is focused in its tab
- **Tab bar**: switch, close, create, reorder by dragging
- **Home page**: recently opened files with size and modification time
- **Save status**: a breathing dot while unsaved, a ✅ confirmation after saving
- **Close confirmation**: save / don't save / cancel when closing an unsaved file

### New Documents and Templates

- A new blank tab shows “Untitled New File”
- The toolbar “New from template” menu builds a document from the selected template's Markdown structure; a default template can be set in Settings → General, after which `Ctrl+N` applies it
- Templates live in the user directory — drop in `.md` files, or create and edit them in Settings → Templates

### Paste as Markdown

Rich text copied from web pages, Word / DOCX, Google Docs or Notion is converted to clean Markdown in memory (headings / lists / tables / code / quotes / links); existing Markdown source and plain text paste as-is.

### Saving and Export

- **Save / auto-save**: manual save plus a configurable interval (5–180 s, default 60 s)
- **Save as**: saving a new file opens the save-as dialog automatically
- **Export**: HTML / Markdown / plain text / Word (DOCX) / PDF / PPTX / EPUB
  - DOCX uses native Word semantics (lists, tables, code blocks, quotes, task lists), matches the preview's table styling, and supports local-path images, remote images and HTML `<img>` (width via the `width` attribute)
  - PDF matches the preview and paginates automatically
  - HTML includes a floating outline card on the left that jumps to sections (PDF has no sidebar)
  - PPTX inherits the Presentation theme, light/dark mode and layouts, and emits editable text, tables, images, shapes and native equations
  - EPUB comes from the built-in plugin; before export you can choose chapter splitting / cover / visible contents / reading theme / document info
- **`.md` association**: set YiziMarkdown as the default Markdown editor in settings, then double-clicking `.md` opens it (Windows registry / macOS LaunchServices)

### Cloud Storage (WebDAV)

- **File browser**: the “Cloud” tab in the sidebar browses the server tree — open documents, create files / folders, rename, move, delete; deep breadcrumbs collapse into “…” with a dropdown, and folders load lazily
- **Save to cloud**: upload a local document in one click, including images referenced by relative paths, preserving the directory structure; `Ctrl+S` writes cloud documents straight back
- **Conflict protection**: the server ETag is compared before saving; if another device changed the file, a dialog offers “overwrite the server copy” or “discard my changes and reload” — never a silent overwrite
- **Credential safety**: username and password go into the OS credential store (Windows Credential Manager / macOS Keychain), never into config files
- **Compatibility**: standard WebDAV services such as Nutstore, Nextcloud and Synology (an app-specific password is recommended)

---

## Extras and Customization

### AI Assistant (Side Chat Panel)

- **18 model providers + custom service**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen, Zhipu GLM, Moonshot Kimi, Volcano Engine, SiliconFlow, MiniMax, Xiaomi MiMo, Meituan LongCat, OpenRouter, OpenCode Go, Ollama (local); “Custom service” accepts OpenAI-compatible or Anthropic-compatible protocols with your own Base URL, model ID and key
- **Streaming chat**: the robot button on the toolbar opens the right-hand panel; replies stream in and can be stopped at any time
- **Thinking process**: reasoning / thinking from reasoning models is shown in a collapsible block, collapsed by default
- **Key safety**: API keys live in the OS keychain and can be saved, cleared and verified in one click; local endpoints (llama.cpp / LM Studio / vLLM) can leave the key empty
- **Reference the current document**: send the document as context with a configurable limit (64K–512K / unlimited) and context rounds (0–20, default 3)
- **Landing the result**: copy, insert at the cursor, or create a new document in one click

### AI Skills

The ⚡ button in the input box opens the skill menu; the selected skill tag is inserted at the cursor and its prompt is injected into the context. Put `skills.json` plus `.md` prompts in `skills/` to define your own. Five skills ship built in: Presentation Outline, Document Summary, Polish Writing, Full-text Translation and Markdown Formatting.

### Plugins

- **Core capabilities are built in**: KaTeX / Mermaid / footnotes / task lists / TOC and similar document semantics are unaffected by plugin switches
- **Built-in plugin**: EPUB export (enabled by default and switchable on the Plugins page; the export menu appears only when it is on)
- **Plugin standard**: manifest (version / API version / activation timing / permissions / capabilities) → eligibility check → lazy activation → capability registration → teardown; the current release loads only plugins compiled into the app

### Themes and Appearance

- **15 built-in themes**: Liquid Glass Prism (default), Academic Blue, Vibrant Orange, Tech, Minimalist, Magazine, Nature, Lychee Red, Violet, Cyberpunk, Facebook, Matrix, Mint, Sunset, Retro Typewriter — each with light and dark palettes
- **Dark / light mode**: one-key toggle (`F2`)
- **Font customization**: separate font, size and line height for source and preview
- **Custom theme**: write CSS under Settings → Appearance → Custom CSS and save; a “custom theme” is generated on top of the current theme — paste a whole theme or tweak a few colors, effective immediately
- **Theme extension**: drop a `.css` into `themes/` and register it in `themes/theme.json`; it is picked up after a restart. Tokens and conventions are documented in `docs/THEME-DESIGN-SPEC.md`

### Languages and Interface

- **16 interface languages**: Simplified Chinese (default), Traditional Chinese, English, Japanese, Korean, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська, Русский
- Switch instantly in Settings → General → Interface language; UI text, the shortcut panel and plugin descriptions follow
- **First-launch detection**: without an installer language, the system language is used, falling back to English when unsupported; each language entry also carries an English `Language` label so it is easy to find from a Chinese UI
- **Interface scale**: 80%–120% (default 100%), scaling only UI text and icons — panel sizes and document content are untouched
- **Settings panel**: General, Appearance, Editor, Live Mode, AI, Cloud, Plugins, Shortcuts, Templates, Docs, About, Products, with live preview

---

## Keyboard Shortcuts

| Shortcut | Function | Shortcut | Function |
|----------|----------|----------|----------|
| Ctrl+N | New file | Ctrl+B | Bold |
| Ctrl+O | Open file | Ctrl+I | Italic |
| Ctrl+S | Save file | Ctrl+- | Strikethrough |
| Ctrl+Shift+S | Save as | Ctrl++ | Inline code |
| Ctrl+W | Close tab | Ctrl+1 | Heading 1 |
| Ctrl+H | Export HTML | Ctrl+2 | Heading 2 |
| Ctrl+M | Export Markdown | Ctrl+3 | Heading 3 |
| Ctrl+Z | Undo | Ctrl+. | Unordered list |
| Ctrl+Y | Redo | Ctrl+0 | Ordered list |
| Ctrl+F | Search | Ctrl+' | Quote |
| Ctrl+\ | Toggle sidebar | Ctrl+K | Link |
| F1 | Shortcut guide | Ctrl+` | Code block |
| F2 | Toggle light/dark | Ctrl+T | Table |
| F3 | Cycle the four editing views | Ctrl+L | Horizontal rule |
| F9 | Zen mode (Source / Live only) | Ctrl+Alt+P | Presentation mode |
| F11 | Toggle full screen | Ctrl+Alt+R | Reading mode |
| Ins | Slash menu | F12 | Developer tools |

Shortcuts can be customized in Settings → Shortcuts: 36 actions, visual binding, key recording, conflict detection and restore-defaults.

---

## Portable Directory Structure

After extracting the portable build:

```
YiziMarkdown/
├── YiziMarkdown.exe        # Main program
├── readme.md               # Project description (this file)
├── welcome.md              # Welcome document
├── docs/                   # Documentation (THEME-DESIGN-SPEC.md, etc.)
├── user.css                # User custom styles
├── keybindings.json        # Shortcut configuration
├── themes/                 # Theme CSS files
│   ├── liquidglass-prism.css # Liquid Glass Prism (default)
│   ├── academic.css        # Academic Blue
│   ├── vibrant.css         # Vibrant Orange
│   ├── tech.css            # Tech
│   ├── minimal.css         # Minimalist
│   ├── magazine.css        # Magazine
│   ├── nature.css          # Nature
│   ├── lychee.css          # Lychee Red
│   ├── violet.css          # Violet
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Mint
│   ├── sunset.css          # Sunset
│   └── typewriter.css      # Retro Typewriter
├── skills/                 # AI skills
│   ├── skills.json         # Skill list
│   ├── slides-outline.md   # Presentation Outline
│   ├── doc-summary.md      # Document Summary
│   ├── polish-writing.md   # Polish Writing
│   ├── translate-fulltext.md # Full-text Translation
│   └── markdown-format.md  # Markdown Formatting
└── templates/              # Built-in templates (synced to the user directory on first launch)
    ├── default.md          # Default template
    └── Slide-Template.md   # Presentation template
```

> Note: AI skills and document templates actually live in the **user directory** — `~/Documents/yizimarkdown/skills/` and `.../templates/` on Windows / macOS; on Linux, `yizimarkdown/` inside the XDG documents directory (e.g. `~/Documents/yizimarkdown/`), falling back to `~/.local/share/yizimarkdown/` when no documents directory exists. (The same folders in the program directory are built-in resources, synced there on first launch.) Keep your own content in the user directory so upgrades and reinstalls never overwrite it.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop framework | Tauri 2 (Rust) |
| Frontend | React 18 + TypeScript |
| Editor core | CodeMirror 6 |
| State management | Zustand (persist) |
| Styling | Tailwind CSS + CSS variables |
| Markdown rendering | markdown-it |
| Internationalization | Custom lightweight i18n (16 languages) |
| AI integration | Rust streaming proxy (OpenAI / Anthropic / Ollama protocols) |
| Build tool | Vite |

---

## Development

### Requirements

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Start the Dev Server

```bash
cd code
npm install
npm run tauri:dev
```

### Linux Dev Dock Icon (optional)

Desktops such as elementary / GNOME look up a matching `.desktop` file by the window's `WM_CLASS`; a dev build has no installer and therefore no `.desktop`, so the dock shows a generic icon (the window's own `_NET_WM_ICON` is already set by Rust, and installers are unaffected). Run once:

```bash
npm run dev:icon           # writes ~/.local/share/applications/yizimarkdown-dev.desktop
npm run dev:icon:remove    # undo
```

Restart the dev window and the dock shows the app icon.

### Build a Release

**Windows**

```bash
npm run tauri:build
```

Artifacts:
- Portable exe: `src-tauri/target/release/yizimarkdown.exe`
- NSIS installer: `src-tauri/target/release/bundle/nsis/`

Installer: the first run asks for an install language (16 options: all interface languages plus Brazilian Portuguese); the wizard text and the language used on first launch follow that choice, and upgrades / auto-updates never reset it. Icons and sidebar / header art live in `src-tauri/installer/`; after changing brand colors, regenerate with `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1`.

After building, copy the exe and resource files into `public/YiziMarkdown-vX.X.X/` for distribution.

**macOS (universal binary, Intel and Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artifacts:
- App bundle: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Installer: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux (deb + AppImage)**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

Artifacts (**amd64 / x86_64 only for now**; ARM `arm64` deb and `aarch64` AppImage are not published):
- Debian package: `src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb` (about 16 MB, installs to `/usr/bin`, registers menu entry, icon and `.md` / `.epub` associations)
- Portable AppImage: `src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage` (about 100 MB, bundles GTK / WebKit and the GStreamer media components, double-click to run)

Note: **build on Ubuntu 22.04**. Binaries built on 24.04 require glibc 2.39 and fail to start on Ubuntu 22.04 (2.35) / Debian 12 (2.36); the `deb` dependency on `libwebkit2gtk-4.1-0` sets the same floor. `rpm` is not provided: Fedora / openSUSE use different dependency names and would need separate maintenance.

### Project Structure

```
code/
├── src/                    # Frontend source
│   ├── App.tsx             # Main application component
│   ├── components/         # UI components
│   │   ├── Editor.tsx      # CodeMirror editor + preview
│   │   ├── Reader.tsx      # Reading mode (pagination / page turns)
│   │   ├── Slideshow.tsx   # Presentation mode
│   │   ├── TabBar.tsx      # Tab bar
│   │   ├── HomePage.tsx    # Home page (recent files)
│   │   ├── Toolbar.tsx     # Toolbar
│   │   ├── Sidebar.tsx     # Sidebar (outline + file browser)
│   │   ├── StatusBar.tsx   # Bottom status bar
│   │   └── SettingsModal.tsx # Settings panel
│   ├── stores/             # Zustand state management
│   ├── lib/                # Utilities (Markdown rendering, themes, zen mode, etc.)
│   └── styles/             # Global styles
├── src-tauri/              # Rust backend
│   ├── src/main.rs         # Tauri commands (file I/O, theme loading, registry, etc.)
│   ├── icons/              # Application icons
│   ├── themes/             # Theme CSS (with theme.json metadata)
│   └── templates/          # Document templates
├── docs/                   # Documentation (changelog / i18n readmes / THEME-DESIGN-SPEC.md)
└── package.json
```

---

## Version and Updates

Windows installs support in-app updates. macOS, Linux and portable builds check `latest.json` on launch and show a notice in the bottom-right when a new version is available, linking to the matching download page (manual replacement, no automatic install; both the Linux `deb` and `AppImage` use this path).

---

## License

MIT
