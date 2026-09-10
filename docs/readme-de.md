# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)

[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)

**Offizielle Webseite:** https://md.yizigpt.com

Ein eleganter und schlichter plattformübergreifender `Markdown`-Editor, der Windows-Portable- und macOS-Versionen unterstützt. Keine Installation erforderlich, entpacken und verwenden – Ästhetik und Funktionalität vereint. Für Windows gibt es eine installierbare Version sowie eine portable ZIP-Datei. macOS bietet universelle Binärpakete, die nativ auf Intel- und Apple-Silicon-Hardware laufen.

Warum einen `Markdown`-Editor entwickeln?

Es gibt bereits viele `Markdown`-Editor auf dem Markt, aber entweder ist die Benutzeroberfläche nicht ansprechend oder die Funktionen sind zu komplex und umfangreich. Es ist schwer, ein Werkzeug zu finden, das sowohl einfach als auch ästhetisch ansprechend ist.

Deshalb wurde YiziMarkdown entwickelt.

Wir haben für den What-You-See-Is-What-You-Get-Modus ein äußerst eleganten Ans erstellt. Gleichzeitig unterstützen wir eine PPT-ähnliche Präsentationsfunktion. Fertige Dokumente können schnell in den Präsentationsmodus gewechselt werden, um Ergebnisse zu teilen. Probieren Sie es aus.

---

## Funktionen

### Mehrsprachige Benutzeroberfläche

- **15 Oberflächensprachen**: Vereinfachtes Chinesisch (Standard), Traditionelles Chinesisch, Englisch, Japanisch, Koreanisch, Deutsch, Französisch, Spanisch, Portugiesisch, Italienisch, Polnisch, Niederländisch, Türkisch, Schwedisch, Ukrainisch
- Einstellungen → Allgemein → Oberflächensprache mit einem Klick wechseln, sofort wirksam; alle Oberflächenbeschriftungen, Tastaturkürzel-Panel und Plugin-Beschreibungen werden automatisch an die Sprache angepasst

### KI-Assistent (Seitenchat-Panel)

- **17 große Modellanbieter + benutzerdefinierter Dienst**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Tongyi Qianwen, Zhipu GLM, Moonshot Kimi, Volcano Ark, SiliconFlow, MiniMax, OpenRouter, OpenCode Go, Ollama (lokal); „Benutzerdefinierter Dienst" unterstützt OpenAI-kompatible/Anthropic-kompatible Protokolle, eigene Base URL, Modell-ID und Schlüssel, kann mit beliebigen Drittanbietern verwendet werden
- **KI-Fähigkeiten (Skills)**: Das ⚡-Symbol im Eingabefeld öffnet das Fähigkeiten-Menü. Nach Auswahl wird das Skill-Tag an der Cursor-Position eingefügt und der Prompt wird automatisch in den Kontext eingefügt. Benutzerdefinierte Fähigkeiten können erstellt werden, indem `skills.json` + `.md`-Prompts in das `skills/`-Verzeichnis gelegt werden. Integrierte Fähigkeiten: „Präsentationszusammenfassung", „Dokumentenübersicht" und „Textpolitur"
- **Streaming-Dialog**: Die Robot-Schaltfläche in der Symbolleiste öffnet das KI-Panel rechts. Antworten werden in Echtzeit gestreamt und können jederzeit gestoppt werden
- **Denkprozess-Anzeige**: Das Denken von Reasoning-Modellen (reasoning/thinking) wird als zusammenklappbarer Bereich angezeigt, standardmäßig zugeklappt, ohne den Haupttext zu stören
- **Schlüsselsicherheit**: API-Schlüssel werden im System-Keychain gespeichert (OS-Keychain). Ein-Klick-Speicherung, -Löschung und -Verifizierung unterstützt. Lokale Endpunkte (llama.cpp / LM Studio / vLLM etc.) können Schlüssel leer lassen
- **Aktuelles Dokument zitieren**: Nach Aktivierung wird das aktuelle Dokument als Kontext an die KI gesendet. Zitiergrenzen (64K~512K/unbegrenzt) und Kontextrunden (0~20, Standard 3) konfigurierbar
- **Ergebnisse speichern**: Antworten können kopiert, an die Cursor-Position im Dokument eingefügt oder mit einem Klick als neues Dokument erstellt werden

### Bearbeitung und Vorschau

- **Quelltextbearbeitung**: CodeMirror 6-Kern, Syntaxhervorhebung, Klammernabgleich, Autovervollständigung
- **Live-Modus (WYSIWYG)**: What-You-See-Is-What-You-Get-Bearbeitung. Markdown-Markierungen werden bei der Eingabe automatisch ausgeblendet, Fokus auf Inhaltserstellung
- **Live-Modus-Animationen**: 4 Animationsformate für Markierungserscheinung (Fokus/Glanz/Glut/Rippe), in den Einstellungen vorschau- und umschaltbar
- **Live-Vorschau**: Markdown wird während des Schreibens gerendert. Tasklisten-Checkbox-Interaktion unterstützt
- **Fünf Ansichtsmodi**: Quelltext / Nebeneinander / Live (WYSIWYG) / Vorschau / Präsentation (Vollbild-Folien), mit einem Klick umschaltbar
- **Gliederungsgesteuerte Scroll-Synchronisation**: Im Nebeneinander-Modus interagieren linke und rechte Panel bidirektional. Beim Ansichtswechsel wird automatisch zur aktuellen Position positioniert
- **Suchen und Ersetzen**: Navigation zu Übereinstimmungen, Ersetzen aller unterstützt
- **Symbolleiste für schnelle Formatierung**: Fett, Kursiv, Durchgestrichen, Inline-Code – Text auswählen und direkt anwenden
- **Lokale Bildwiedergabe**: Vorschau-Modus rendert lokale Bilddateien automatisch (jpg/png/gif/webp/svg/bmp)
- **Zeilennummern / Automatischer Zeilenumbruch**: Beides kann in den Einstellungen ein- und ausgeschaltet werden
- **Codeblock-Verbesserungen**: Syntaxhervorhebung (highlight.js), Sprachbeschriftung, Kopier-Schaltfläche, automatischer Zeilenumbruch umschaltbar
- **Formatierungssymbolleiste einklappen**: Bei unzureichender Fensterbreite automatisch einklappen, manuelles Ausklappen/Einklappen unterstützt
- **Frontmatter-Filterung**: Vorschau/Nebeneinander/Live-Modus filtern YAML-Frontmatter automatisch

### Mathematische Formeln und Diagramme

- **KaTeX-Formeln**: Integriertes KaTeX-Plugin. Inline `$...$` und Block `$$...$$` LaTeX-Formeln werden in Echtzeit gerendert
- **Mermaid-Diagramme**: Integriertes Mermaid-Plugin. Flussdiagramme, Sequenzdiagramme, Gantt-Diagramme, Klassendiagramme, Kreisdiagramme usw. werden automatisch in visuelle Diagramme umgewandelt. Mehrere Themenkonfigurationen unterstützt
- **Tabellen-Zeilen-/Spaltenauswahl**: Die Tabellen-Schaltfläche in der Symbolleiste öffnet ein 8×8-Gitter. Mit der Maus klicken fügt eine Tabelle mit entsprechender Zeilen-/Spaltenzahl ein

### Präsentationsmodus (Folien)

- **Reines Markdown**: Kein zusätzliches Format erforderlich. `---` (horizontale Trennlinie) wird als Seitenumbruch verwendet. Die Engine analysiert die gesamte Seitenstruktur und wählt automatisch das Layout aus
- **14 automatische Layouts**: Titelseite, Kapitelseite, Schlussseite, Inhaltsverzeichnis, Inhalt, Liste, Datentabelle, Roadmap, Text-Bild, Bild, Zitat, Code, Diagramm (mermaid), Formel
- **Inhaltsseiten linksbündig + betonte Unterstreichung**: Titel oben links mit themenfarbiger Unterstreichung, Fließtext linksbündig, angenehmes Lesen
- **Zitatseiten mit diagonalen Anführungszeichen**: Öffnendes Anführungszeichen oben links, schließendes Anführungszeichen unten rechts, Inhalt vertikal zentriert
- **Explizite Anweisungen**: `<!-- layout: xxx -->` erzwingt Layout, `<!-- align: left|center|right -->` richtet ganze Seite aus (HTML-Kommentar, in der Vorschau unsichtbar)
- **Titelseiten-Meta**: Front Matter stellt `author`/`date` bereit, wird auf der Titelseite automatisch angezeigt
- **Fußzeile und Fortschritt**: Unten links Kapitelname + Seitennummer, unten themenfarbiger Fortschrittsbalken
- **Mausrad zum Blättern**: Inhalt wird zuerst gescrollt, bei Erreichen der Grenze wird die Seite gewechselt
- **Themenvererbung**: Titelfarben ändern sich genau mit dem Thema (alle 15 Themen unterstützt). In der Präsentation können Thema/Dunkel-Modus umgeschaltet werden
- **Vollbild umschalten**: F-Taste zum Vollbild/Normalisieren. Zuverlässiger Eintritt von jedem Fensterstatus (normal/maximiert)
- **Schaltfläche zum Beenden**: Bei Mausaktivität oben rechts halbtransparente Schaltfläche zum Beenden, nach 1,5 Sekunden Inaktivität automatisch ausblenden
- **Fensterstatus wiederherstellen**: Beim Beenden der Präsentation wird automatisch der vorherige Fensterstatus wiederhergestellt (Vollbild/maximiert/normal)

### Plugin-System

- Plugin-Architektur, mit den zwei Kernplugins KaTeX und Mermaid
- Einstellungsseite „Plugins" unterstützt Start-/Stopp-Steuerung und Plugin-Konfiguration
- Plugins werden bei Bedarf dynamisch geladen. Nicht aktivierte Plugins verbrauchen keine Ressourcen

### Mehrdateiverwaltung

- **Einzeln-Instanz-Modus**: Mehrere Dateien öffnen startet nicht mehrere Fenster. Dateien werden automatisch mit der vorhandenen Instanz zusammengeführt. Doppelte Dateien werden automatisch zum entsprechenden Tab positioniert
- **Tab-Leiste**: Oben werden mehrere geöffnete Dateien verwaltet, gewechselt, geschlossen und neu erstellt
- **Startseite**: Liste der zuletzt geöffneten Dateien mit Dateigröße und Änderungszeit
- **Speicherstatus-Anzeige**: Ungepeicherte Dateien zeigen eine atmende Punkte-Animation. Nach dem Speichern erfolgt eine ✅-Bestätigungsanimation
- **Schließen bestätigen**: Beim Schließen ungepeicherter Dateien erscheint ein Dialog Speichern / Nicht speichern / Abbrechen

### Dateioperationen

- **Öffnen**: Unterstützt .md / .markdown / .txt
- **Neu**: Neuer leerer Tab mit „Unbenannt neue Datei"
- **Aus Vorlage neu**: Dropdown-Menü „Aus Vorlage neu" in der Symbolleiste erstellt neue Dokumente basierend auf der Markdown-Struktur der ausgewählten Vorlage. Standardvorlage kann unter Einstellungen → Allgemein eingestellt werden. Danach erstellt `Ctrl+N` automatisch aus der Vorlage
- **Speichern / Automatisch speichern**: Manuelles Speichern + automatisches Speichern mit konfigurierbarem Intervall (5~180 Sekunden, Standard 60 Sekunden)
- **Speichern unter**: Beim Speichern neuer Dateien erscheint automatisch der „Speichern unter"-Dialog
- **Exportieren**: Drei Formate: HTML / Markdown / Reiner Text
- **.md-Dateizuordnung**: In den Einstellungen mit einem Klick als Standard-Markdown-Editor festlegen. Doppelklick auf .md öffnet die Datei direkt (Windows-Registry / macOS LaunchServices)

### Anpassung

- **Fünfzehn integrierte Themen**: Academic Blue (Standard), Vibrant Orange, Tech, Minimal, Magazine, Nature, Liquid Glass, Lychee Red, Violet, Cyberpunk, Facebook, Matrix, Mint, Sunset, Typewriter – jedes mit heller und dunkler Farbgebung
- **Dunkler / Heller Modus**: Jedes Thema hat helle und dunkle Farbgebungen
- **Schriftanpassung**: Schriftart, Schriftgröße und Zeilenhöhe können getrennt für Quelltext- und Vorschau-Modus eingestellt werden
- **Benutzerdefiniertes CSS**: `user.css` wird nach allen Themen geladen und hat höchste Priorität
- **Themenerweiterung**: `.css`-Dateien in das `themes/`-Verzeichnis legen und Theme-Parameter in `themes/theme.json` hinzufügen. Nach Neustart werden sie automatisch erkannt

### Sonstiges

- **Dokumentenvorlagen**: `.md`-Dateien in das `templates/`-Verzeichnis legen, die beim Erstellen ausgewählt werden können
- **Tastaturkürzel-System**: Visuelles Tastaturkürzel-Konfigurationspanel. Unterstützt benutzerdefinierte Zuordnung für 30 Aktionen, Tastenaufnahme, Konflikterkennung und Zurücksetzen auf Standard
- **Einstellungspanel**: Allgemein, Aussehen, Editor, Live-Modus, KI, Plugins, Tastaturkürzel, Vorlagen, Über usw. Einstellungen werden sofort in der Vorschau angezeigt

---

## Tastaturkürzel

| Tastaturkürzel | Funktion |
|----------------|----------|
| Ctrl+N | Neue Datei |
| Ctrl+O | Datei öffnen |
| Ctrl+S | Datei speichern |
| Ctrl+Shift+S | Speichern unter |
| Ctrl+W | Tab schließen |
| Ctrl+H | Als HTML exportieren |
| Ctrl+M | Als Markdown exportieren |
| Ctrl+Z | Rückgängig |
| Ctrl+Y | Wiederholen |
| Ctrl+F | Suchen |
| Ctrl+\ | Seitenleiste umschalten |
| Ctrl+B | Fett |
| Ctrl+I | Kursiv |
| Ctrl+- | Durchgestrichen |
| Ctrl++ | Inline-Code |
| Ctrl+1 | Überschrift 1 |
| Ctrl+2 | Überschrift 2 |
| Ctrl+3 | Überschrift 3 |
| Ctrl+. | Ungeordnete Liste |
| Ctrl+0 | Geordnete Liste |
| Ctrl+' | Zitat |
| Ctrl+K | Link |
| Ctrl+` | Codeblock |
| Ctrl+T | Tabelle |
| Ctrl+L | Trennlinie |
| F1 | Tastaturkürzel-Übersicht |
| F2 | Heller/Dunkler Modus umschalten |
| F3 | Ansichten durchschalten |
| Ctrl+Alt+P | Präsentationsmodus (Folien) |
| Ins | Schrägstrich-Menü |
| F12 | Entwicklertools |

Tastaturkürzel können unter Einstellungen → Tastaturkürzel angepasst werden. Visuelle Konfiguration und Konflikterkennung werden unterstützt.

---

## Verzeichnisstruktur der portable Version

```
YiziMarkdown/
├── YiziMarkdown.exe        # Hauptprogramm
├── readme.md               # Projektbeschreibung (diese Datei)
├── welcome.md              # Willkommensdokument
├── changelog.md            # Entwicklungsprotokoll
├── user.css                # Benutzerdefinierte Styles
├── keybindings.json        # Tastaturkürzel-Konfiguration
├── themes/                 # Thema CSS-Dateien
│   ├── academic.css        # Academic Blue (Standard)
│   ├── vibrant.css         # Vibrant Orange
│   ├── tech.css            # Tech
│   ├── minimal.css         # Minimal
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
│   └── typewriter.css      # Typewriter
├── skills/                 # KI-Fähigkeiten (Skill)
│   ├── skills.json         # Fähigkeitenliste
│   ├── slides-outline.md   # Präsentationszusammenfassung
│   ├── doc-summary.md      # Dokumentenübersicht
│   └── polish-writing.md   # Textpolitur
└── templates/              # Dokumentenvorlagen
    └── default.md          # Standardvorlage
```

---

## Technologie-Stack

| Ebene | Technologie |
|-------|-------------|
| Desktop-Framework | Tauri 2 (Rust) |
| Frontend-Framework | React 18 + TypeScript |
| Editor-Kern | CodeMirror 6 |
| Zustandsverwaltung | Zustand (persist) |
| Stil方案 | Tailwind CSS + CSS-Variablen |
| Markdown-Rendering | markdown-it |
| Internationalisierung | Eigene leichtgewichtige i18n (15 Sprachen) |
| KI-Anbindung | Rust-Streaming-Proxy (OpenAI/Anthropic/Ollama-Protokoll) |
| Build-Werkzeug | Vite |

---

## Entwicklung

### Anforderungen

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Entwicklungsserver starten

```bash
cd code
npm install
npm run tauri:dev
```

### Release-Build erstellen

**Windows**

```bash
npm run tauri:build
```

Build-Ergebnisse:
- Portable EXE: `src-tauri/target/release/yizimarkdown.exe`
- MSI-Installationspaket: `src-tauri/target/release/bundle/msi/`
- NSIS-Installationspaket: `src-tauri/target/release/bundle/nsis/`

Nach dem Build EXE und Ressourcendateien manuell in das Verzeichnis `public/YiziMarkdown-vX.X.X/` zum Verteilen kopieren.

**macOS (Universal Binary, unterstützt Intel und Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Build-Ergebnisse:
- Anwendungspaket: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Installationspaket: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### Projektstruktur

```
code/
├── src/                    # Frontend-Quellcode
│   ├── App.tsx             # Hauptanwendungskomponente
│   ├── components/         # UI-Komponenten
│   │   ├── Editor.tsx      # CodeMirror-Editor + Vorschau
│   │   ├── TabBar.tsx      # Tab-Leiste
│   │   ├── HomePage.tsx    # Startseite (letzte Dateien)
│   │   ├── Toolbar.tsx     # Symbolleiste
│   │   ├── Sidebar.tsx     # Seitenleiste (Gliederung + Dateibrowser)
│   │   ├── StatusBar.tsx   # Statusleiste unten
│   │   └── SettingsModal.tsx # Einstellungspanel
│   ├── stores/             # Zustand-Zustandsverwaltung
│   ├── lib/                # Werkzeugbibliothek (Markdown-Rendering, Titel-ID)
│   └── styles/             # Globale Styles
├── src-tauri/              # Rust-Backend
│   ├── src/main.rs         # Tauri-Befehle (Dateilesen/-schreiben, Thema laden, Registry usw.)
│   ├── icons/              # Anwendungssymbole
│   ├── themes/             # Thema CSS
│   └── templates/          # Dokumentenvorlagen
└── package.json
```

---

## Lizenz

MIT