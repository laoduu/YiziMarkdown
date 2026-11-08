# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](../../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md) | [Русский](./readme-ru.md)

**Offizielle Website:** https://md.yizigpt.com

YiziMarkdown ist ein plattformübergreifender Markdown-Editor mit dem Schreiben im Mittelpunkt. Dieselbe `.md`-Datei bietet sieben Darstellungen: `Quelltext bearbeiten`, `Nebeneinander gegenlesen`, `Live schreiben`, `Fertige Vorschau`, `Folienpräsentation`, `Lesen wie in einem Buch` und den `Zen-Modus`, in dem nur der Text übrig bleibt.

- **Windows**: installierbar (NSIS-Installer mit Updates direkt in der App) oder als portables ZIP-Archiv, das nach dem Entpacken sofort läuft
- **macOS**: universelles Binary, nativ auf Intel und Apple Silicon
- **Linux**: `deb` für Debian-basierte Systeme und portables `AppImage` (Ubuntu 22.04+ / Debian 12+, derzeit nur amd64)

Warum noch ein Markdown-Editor? Was der Markt bietet, sieht entweder wenig ansprechend aus oder ist mit Funktionen überladen; ein Werkzeug, das zugleich schlicht, schön und angenehm zu bedienen ist, ist schwer zu finden. So entstand YiziMarkdown, mit drei festen Grundsätzen: **schöne Oberfläche**, **starke Funktionen**, **vielfältige Szenarien**.

Daraus wurde das heutige `YiziMarkdown`: `3 Betriebssysteme`, `7 Nutzungsmodi`, `16 Oberflächensprachen`, `15 helle und dunkle Themes`, `5 AI-Skills`, `7 Exportformate` – dazu innovative Funktionen wie der integrierte KI-Assistent und Cloud-Speicher sowie offene Dokumentation zu Themes, Skills und Präsentationen, mit der Sie sich ganz eigene Arbeitsweisen zusammenstellen können.

Das ist längst kein einfacher Markdown-Editor mehr, sondern eine vielseitige Anwendung, die alle Ihre Dokument-Szenarien beim Schreiben, bei der Arbeit und im Alltag wirklich abdeckt.

---

## Sieben Modi: ein Dokument, sieben Darstellungen

Der Wert von Markdown liegt nicht nur im Schreiben, sondern auch darin, wem man das Ergebnis zeigt und wie. YiziMarkdown bietet für dasselbe Dokument sieben Darstellungen: Die ersten vier sind Bearbeitungsansichten, die zwischen Quelltext und fertigem Ergebnis wechseln; die letzten drei sind eigenständige Szenarien, die das Dokument zu Folien, Buchseiten oder schlicht nur zum Text machen.

| Modus | Kurz gesagt | Zugang | Geeignet für |
|------|-----------|------|------|
| Quelltext | Rohes Markdown direkt bearbeiten | `F3` / Ansichts-Schaltflächen | Struktur feilen, Suchen und Ersetzen im großen Stil, Frontmatter ändern |
| Nebeneinander | Links schreiben, rechts sofort vergleichen | `F3` / Ansichts-Schaltflächen | Layout gegenlesen, nach einer Vorlage schreiben |
| Live | WYSIWYG, Markierungen verschwinden automatisch | `F3` / Ansichts-Schaltflächen | Lange Texte schreiben, konzentriert arbeiten |
| Vorschau | Nur das endgültige Layout | `F3` / Ansichts-Schaltflächen | Ergebnis prüfen, ganzen Text lesen |
| Präsentation | Das Dokument direkt als Folien zeigen | `Ctrl+Alt+P` / Symbolleiste | Teilen, Berichten, Unterrichten |
| Lesen | Das Dokument als durchblätterbares Buch | `Ctrl+Alt+R` / Symbolleiste | Lange Texte, EPUB, immersives Lesen |
| Zen | Die gesamte Oberfläche weicht zurück, nur der Text bleibt | `F9` / Symbolleiste | Tiefes, konzentriertes Schreiben |

`F3` wechselt zyklisch zwischen Quelltext / Nebeneinander / Live / Vorschau; Präsentation, Lesen und Zen haben jeweils einen eigenen Einstieg und stören sich gegenseitig nicht.

---

## Markdown – vier in einem

![Vier Modi im Vergleich](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

Quelltext, Nebeneinander, Live und Vorschau teilen einen Editor-Kern und denselben Funktionsumfang für Markdown; der Unterschied liegt allein in der Informationsdichte: von vollständig sichtbaren Markern bis zum fertig gesetzten Ergebnis. Jederzeit umschaltbar, wobei die Ansicht die aktuelle Position möglichst beibehält.

### Quelltextmodus: alles im Blick

- CodeMirror-6-Kern: Syntaxhervorhebung, Klammerabgleich, Autovervollständigung
- Zeilennummern und Zeilenumbruch lassen sich unabhängig schalten; ideal zum zeilenweisen Feilen und für umfangreiches Umschreiben
- YAML-Frontmatter wird unverändert angezeigt – Metadaten ändern, ohne das Format zu raten
- Tabellen, Codeblöcke und Formeln erscheinen als Quelltext – bei komplexen Strukturen die kontrollierbarste Variante

### Nebeneinander-Modus: schreiben und vergleichen

- Quelltext links, Vorschau rechts, Aktualisierung beim Tippen
- Die Scroll-Synchronisierung folgt der Gliederung; beim Ansichtswechsel springt die Ansicht an die aktuelle Position
- Ideal zum Gegenlesen des Layouts und zum Umbau nach einem bestehenden Dokument

### Live-Modus: was Sie sehen, ist was Sie bekommen

- Markdown-Marker werden beim Tippen automatisch ausgeblendet und erscheinen wieder, sobald der Cursor sie verlässt – der Inhalt steht im Vordergrund
- Vier eigene Animationen zum Einblenden der Marker (Fokus / Blitz / Glühen / Welle), in den Einstellungen als Vorschau wählbar
- YAML-Frontmatter wird als bearbeitbares Eigenschaften-Panel im Obsidian-Stil gerendert: 7 Typen – Automatisch / Text / Zahl / Kontrollkästchen / Datum / Datum und Uhrzeit / Liste –, der Typ wird je Eigenschaftsname global gemerkt

### Vorschau-Modus: nur das Ergebnis

- Markdown wird beim Schreiben gerendert, Kontrollkästchen von Aufgabenlisten sind direkt anklickbar
- Bilder aus lokalen Pfaden, Web-Bilder und SVG werden automatisch gerendert (jpg / png / gif / webp / svg / bmp)
- Frontmatter wird automatisch ausgeblendet – Sie sehen das endgültige Layout

### Was alle vier Ansichten teilen

- **Suchen und Ersetzen**: Navigation durch Treffer, alles ersetzen
- **Formatierung über die Symbolleiste**: fett, kursiv, durchgestrichen, Inline-Code – die Auswahl wird sofort umschlossen
- **Codeblock-Erweiterungen**: highlight.js-Syntaxfarben, Sprach-Label, Kopier-Schaltfläche, Zeilenumbruch-Umschalter
- **Tabellen-Auswahl**: 8×8-Raster zum Anklicken und Einfügen, Zeilen- und Spaltenzahl auf einen Blick, Zeilen und Spalten hinzufügen oder löschen, Rechtsklick-Menü mit allen Funktionen
- **Formeln und Diagramme**: KaTeX inline `$...$` / Block `$$...$$`, Mermaid-Flussdiagramme, Sequenzdiagramme, Gantt-Diagramme, Klassendiagramme, Kreisdiagramme und mehr, Farben folgen dem Theme
- **Einklappbare Format-Symbolleiste**: klappt bei schmalem Fenster automatisch ein, lässt sich auch manuell ausklappen
- **Zeilennummern und Zeilenumbruch**: in den Einstellungen schaltbar
- **Gliederungsnavigation**: Überschriftenhierarchie aus der Dokumentstruktur, gekoppelt an die Scrollposition

---

## Präsentationsmodus: Notizen mit einem Klick zu Folien

![Präsentationsmodus](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

Fertige Notizen müssen nicht erst nach PPT exportiert werden: Mit dem integrierten Skill des KI-Assistenten lassen sie sich in einem Schritt zu einer knappen Präsentationsfassung verdichten; in den Präsentationsmodus gewechselt, wird das Dokument sofort zur bildschirmfüllenden Folie. Seitenumbrüche, Spalten und Layouts werden aus der Markdown-Struktur abgeleitet; für exakte Kontrolle kommen HTML-Kommentar-Direktiven dazu.

### Inhalt wird zur Folie

- Kein zusätzliches Format nötig: `---` (horizontale Trennlinie) beginnt eine neue Folie
- Ein `***` auf eigener Zeile teilt die Folie in Spalten, maximal 4
- Die Engine analysiert die Struktur der Seite und wählt das Layout automatisch: Titel, Listen, Tabellen, Code, Bilder und Diagramme haben jeweils ein passendes Layout

### 14 Layouts

Deckblatt, Abschnittsseite, Abschlussseite, Agenda, Inhalt, Liste, Datentabelle, Roadmap, Text und Bild, Bild, Zitat, Code, Diagramm (Mermaid), Formel.

- Außer „Text und Bild“, das explizit `<!-- layout: figure -->` benötigt, werden alle Layouts aus dem Inhalt abgeleitet
- Inhaltsseiten sind linksbündig, der Titel trägt eine Unterstreichung in der Theme-Farbe
- Zitatseiten mit großen diagonalen Anführungszeichen: öffnendes oben links, schließendes unten rechts, Inhalt vertikal zentriert
- Das Deckblatt liest `author` / `date` aus dem Frontmatter

### Typografie während der Präsentation

- HUD-Einstellungen: Schrift (Theme folgen / serifenlos / Serif / Monospace), Schriftgewicht, Schriftgröße, Breite und Höhe des Inhaltsbereichs (50 %–95 %)
- Änderungen wirken sofort und bleiben erhalten, die nächste Präsentation übernimmt sie
- Zu langer Inline-Code bricht um, statt am Seitenrand abgeschnitten zu werden
- Explizite Direktiven: `<!-- layout: xxx -->` erzwingt ein Layout, `<!-- align: left|center|right -->` richtet die ganze Seite aus

### Präsentieren und Navigieren

- Kapitelname + Seitenzahl unten links, Fortschrittsbalken in Theme-Farbe am unteren Rand
- `T` öffnet die Agenda-Schublade, `G` oder das Eingabefeld unten springt zu einer Seite
- Mausrad blättert: scrollbarer Inhalt scrollt zuerst, an der Grenze wird die Seite gewechselt
- `F` Vollbild / zurück, funktioniert aus jedem Fensterzustand – normal, maximiert und so weiter
- Nach dem Beenden wird der vorherige Fensterzustand wiederhergestellt; die Schließen-Schaltfläche oben rechts blendet nach 1,5 s ohne Bedienung aus
- Theme-Vererbung: Titel-Farben folgen dem Theme, Theme und Hell/Dunkel lassen sich auch während der Präsentation wechseln

---

## Lesemodus: das Dokument als aufschlagbares Buch

![Lesemodus](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

Der Lesemodus ist keine „Vollbild-Vorschau“, sondern setzt den Text tatsächlich in feste Seiten: mit Deckblatt, Titelseite, Inhaltsverzeichnis, Seitenzahlen sowie Papier- und Blätteranimationen.

- Einstieg: Buch-Schaltfläche in der Symbolleiste oder `Ctrl+Alt+R`; `Esc` beendet und stellt die vorherige Ansicht wieder her
- Seitenaufbau: ein feiner Rahmen mit gleichmäßigen Rändern umschließt die Buchseiten, Doppelseiten stoßen aneinander, dazwischen nur eine Trennlinie; Buchtitel oben links, Kapitelname / Seitenzahl unten links, HUD unten rechts – dieselben Positionen wie im Präsentationsmodus
- Deckblatt, Titelseite und Inhaltsverzeichnis werden automatisch erzeugt: Der Titel stammt aus `title` im Frontmatter oder aus der ersten H1, das Inhaltsverzeichnis entsteht aus den Überschriften inklusive Seitenzahlen und wird bei Bedarf umbrochen
- Echte Paginierung: Doppelseiten (in schmalen Fenstern automatisch Einzelseiten), mit Seitenzahlen und Lesefortschritt

### Blätter-Animationen

4 Optionen, in den Einstellungen wählbar, standardmäßig horizontales Gleiten:

- **Horizontales Gleiten** (Standard): die ganze Seite verschiebt sich, klar und zügig
- **3D-Blättern**: das Blatt rollt sich von unten rechts auf und knickt um den Bund, beim Blättern hebt sich das Papier mit Licht und Schatten (im Einzelseitenmodus um den Buchrücken)
- **Überblenden** / **Zoomen**: ruhigere Übergänge

Schnelles wiederholtes Drücken überspringt keine Seiten; Sprünge über Inhaltsverzeichnis, Seitenzahlen und Fußnoten laufen ohne Animation.

### Seitenregeln für den Buchsatz

Absätze werden zeilenweise aufgeteilt, Überschriften stehen nie allein, Tabellen wiederholen die Kopfzeile auf der Folgeseite, Codeblöcke laufen zeilenweise weiter, Listen eintragsweise, ganze Bilder werden proportional skaliert; Fließtext-Absätze erhalten einen Erstzeilen-Einzug von zwei Zeichen, der auf Folgeseiten nicht wiederholt wird.

### Navigation und Details

- Inhaltsverzeichnis-Schublade: `T` öffnet sie, Überschriftenhierarchie mit Seitenzahlen, Klick springt direkt hin
- `G` oder das Seitenzahl-Eingabefeld springt zu einer Seite
- Fußnoten hin und zurück: Klick auf eine Referenz springt zur Definitionsseite und hebt sie hervor, eine „Zurück zur Referenz“-Schaltfläche steht bereit; interne Anker springen ebenfalls seitenweise
- Lese-HUD: unten rechts Hell/Dunkel, Theme, Schrift (Theme / Serif / serifenlos / Monospace), Schriftgröße und Zeilenabstand – gilt nur für diese Lesesitzung
- Positionsspeicherung: Seitenzahl / Kapitel werden je Dokument gemerkt und beim nächsten Einstieg wiederhergestellt
- Bedienung: Pfeiltasten, PageUp / PageDown, Leertaste, Mausrad, Klick auf den linken oder rechten Seitenrand

### EPUB

Eine `.epub` öffnet sich direkt im Lesemodus: Es gilt das Lesetheme der App (Verlags-CSS wird ignoriert), eingebettete Cover, Navigations-Inhaltsverzeichnis, Bilder, Formeln, Mermaid-SVG, Fußnoten und kapitelübergreifende Links werden gelesen. DRM-verschlüsselte und fest gesetzte EPUBs (Comics / Bildbände) werden noch nicht unterstützt.

---

## Zen-Modus: nur der Text

![Zen-Modus](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

Einstieg über `F9` oder die Zen-Schaltfläche in der Symbolleiste. Symbolleiste, Tab-Leiste, Seitenleiste, KI-Panel und Statusleiste klappen Schicht für Schicht zu den Bildschirmrändern hin weg und blenden aus, nur der Text bleibt; **das Layout ändert sich dabei nicht**, der Text bewegt sich keinen Pixel.

- **Die Welt ist noch da**: Legen Sie den Zeiger an einen beliebigen Bildschirmrand (oben / links / rechts / unten), blendet der entsprechende Bereich an Ort und Stelle zurück; etwa 1,2 s nach dem Verlassen zieht er sich wieder zurück
- **Ein dauerhafter Schalter**: die Zen-Schaltfläche verschwindet nicht und bleibt an ihrem Platz (mit einer ganz schwachen Atem-Welle darum) – sie ist sowohl Anker für „Sie sind im Zen-Modus“ als auch Ausgang; `F9` / `Esc` beenden ebenfalls
- **Nur zum Schreiben**: nur in Quelltext / Live verfügbar; beim Wechsel zu Nebeneinander, Vorschau oder beim Einstieg in Lesen / Präsentation wird der Modus automatisch beendet
- **Ruhigeres Papier**: Zeilennummern und Seitenleisten-Linien ausgeblendet, sehr dezente Vignette, Zeiger nach 2 s Stillstand ausgeblendet; die vertikale Scrollleiste wird durch einen minimalistischen schmalen Streifen ersetzt, der beim Scrollen oder in der Nähe des rechten Randes erscheint

---

## Dateien und Schreiben

### Dateien und Tabs

- **Öffnen**: `.md` / `.markdown` / `.txt` / `.epub`, EPUB startet direkt im Lesemodus
- **Einzelinstanz**: Mehrere Dateien werden automatisch im bestehenden Fenster zusammengeführt, bereits geöffnete Dateien im passenden Tab fokussiert
- **Tab-Leiste**: wechseln, schließen, neu anlegen, per Ziehen sortieren
- **Startseite**: Liste der zuletzt geöffneten Dateien mit Größe und Änderungszeit
- **Speicherstatus**: atmender Punkt bei ungespeicherten Dateien, ✅-Bestätigungsanimation nach dem Speichern
- **Schließen bestätigen**: Speichern / Nicht speichern / Abbrechen bei ungespeicherten Änderungen

### Neu und Vorlagen

- Ein neuer leerer Tab zeigt „Unbenannte neue Datei“
- „Neu aus Vorlage“ in der Symbolleiste erzeugt ein Dokument nach der Markdown-Struktur der Vorlage; unter Einstellungen → Allgemein lässt sich eine Standardvorlage festlegen, die `Ctrl+N` danach automatisch verwendet
- Vorlagen liegen im Benutzerverzeichnis – eine `.md` hineinlegen genügt; auch unter Einstellungen → Vorlagen lassen sie sich anlegen und bearbeiten

### Einfügen als Markdown

Rich Text aus Webseiten, Word / DOCX, Google Docs, Notion und ähnlichen Quellen wird beim Einfügen im Speicher in sauberes Markdown umgewandelt (Überschriften / Listen / Tabellen / Code / Zitate / Links); vorhandener Markdown-Quelltext und reiner Text werden unverändert eingefügt.

### Speichern und Exportieren

- **Speichern / automatisches Speichern**: manuelles Speichern plus konfigurierbares Intervall (5–180 s, Standard 60 s)
- **Speichern unter**: beim Speichern einer neuen Datei öffnet sich automatisch der Dialog „Speichern unter“
- **Export**: HTML / Markdown / reiner Text / Word (DOCX) / PDF / PPTX / EPUB
  - DOCX nutzt native Word-Semantik (Listen, Tabellen, Codeblöcke, Zitate, Aufgabenlisten), die Tabellenformatierung entspricht der Vorschau, Bilder aus lokalen Pfaden, Web-Bilder und HTML-`<img>` werden unterstützt (Breite über `width`)
  - PDF entspricht der Vorschau und wird automatisch umbrochen
  - HTML enthält links eine schwebende Gliederungskarte, Klick auf einen Eintrag springt zum Abschnitt (PDF ohne Seitenleiste)
  - PPTX übernimmt Theme, Hell/Dunkel und Layouts des Präsentationsmodus und gibt bearbeitbaren Text, Tabellen, Bilder, Formen und native Formeln aus
  - EPUB stammt aus dem integrierten Plugin; vor dem Export sind Kapitelaufteilung / Cover / sichtbares Inhaltsverzeichnis / Lesetheme / Dokumentinformationen wählbar
- **`.md`-Zuordnung**: in den Einstellungen mit einem Klick als Standard-Markdown-Editor des Systems festlegen (Windows-Registrierung / macOS LaunchServices)

### Cloud-Speicher (WebDAV)

- **Dateibrowser**: Der „Cloud“-Tab in der Seitenleiste durchsucht den Verzeichnisbaum des Servers – Dokumente öffnen, Dateien / Ordner anlegen, umbenennen, verschieben, löschen; tiefe Pfade klappen im Breadcrumb zu „…“ mit Dropdown, Ordner werden Schicht für Schicht nachgeladen
- **In die Cloud speichern**: lokales Dokument mit einem Klick hochladen, relativ referenzierte Bilder werden mit übertragen und die Verzeichnisstruktur bleibt erhalten; bei Cloud-Dokumenten schreibt `Ctrl+S` direkt zurück
- **Konfliktschutz**: vor dem Speichern wird der ETag verglichen; wurde die Datei auf einem anderen Gerät geändert, fragt ein Dialog nach „Serverversion überschreiben“ oder „Lokale Änderungen verwerfen und neu laden“ – niemals stilles Überschreiben
- **Zugangsdaten**: Benutzername und Passwort liegen im System-Credential-Store (Windows-Anmeldeinformationsverwaltung / macOS-Schlüsselbund), nicht in Konfigurationsdateien
- **Kompatibilität**: Standard-WebDAV-Dienste wie Nutstore, Nextcloud, Synology (ein anwendungsspezifisches Passwort wird empfohlen)

---

## Erweiterungen und Personalisierung

### KI-Assistent (Chatpanel in der Seitenleiste)

- **18 Modell-Anbieter + eigener Dienst**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen, Zhipu GLM, Moonshot Kimi, Volcano Engine, SiliconFlow, MiniMax, Xiaomi MiMo, Meituan LongCat, OpenRouter, OpenCode Go, Ollama (lokal); „Eigener Dienst“ unterstützt OpenAI-kompatible und Anthropic-kompatible Protokolle mit eigener Base URL, Modell-ID und Schlüssel
- **Streaming-Chat**: die Roboterschaltfläche in der Symbolleiste öffnet das Panel rechts, Antworten erscheinen live im Stream und lassen sich jederzeit stoppen
- **Denkprozess**: reasoning / thinking von Reasoning-Modellen erscheint in einem einklappbaren Block, standardmäßig zugeklappt
- **Schlüsselsicherheit**: API-Schlüssel liegen im Systemschlüsselbund, Speichern, Löschen und Prüfen mit einem Klick; lokale Endpunkte (llama.cpp / LM Studio / vLLM usw.) dürfen leer bleiben
- **Aktuelles Dokument referenzieren**: nach dem Anhaken dient das aktuelle Dokument als Kontext, mit konfigurierbarem Umfang (64K–512K / unbegrenzt) und Kontextrunden (0–20, Standard 3)
- **Ergebnis übernehmen**: kopieren, an der Cursorposition einfügen oder mit einem Klick als neues Dokument anlegen

### KI-Skills

Die ⚡-Schaltfläche im Eingabefeld öffnet das Skill-Menü; der gewählte Skill-Tag wird an der Cursorposition eingefügt und der Prompt automatisch in den Kontext eingebunden. In `skills/` genügen `skills.json` + `.md`-Prompts, um eigene Skills zu definieren. Fünf Skills sind integriert: „Präsentationsfassung verdichten“, „Dokument zusammenfassen“, „Formulierung überarbeiten“, „Volltext übersetzen“, „Markdown formatieren“.

### Plugins

- **Kernfunktionen standardmäßig integriert**: KaTeX / Mermaid / Fußnoten / Aufgabenlisten / TOC und weitere Dokument-Semantik sind von Plugin-Schaltern unabhängig
- **Integriertes Plugin**: EPUB-Export (standardmäßig aktiv, auf der Plugin-Seite abschaltbar; erst dann erscheint das Export-Menü in der Symbolleiste)
- **Plugin-Standard**: Manifest (Version / API-Version / Aktivierungszeitpunkt / Berechtigungen / Fähigkeiten) → Eignungsprüfung → Lazy-Aktivierung → Registrierung der Fähigkeiten → Aufräumen beim Deaktivieren; die aktuelle Version lädt nur in die App kompilierte integrierte Plugins

### Themes und Aussehen

- **15 integrierte Themes**: Liquid Glass Prism (Standard), Academic Blue, Vibrant Orange, Tech, Minimalistisch, Magazin, Natur, Litschi-Rot, Violett, Cyberpunk, Facebook, Matrix, Minze, Sonnenuntergang, Retro-Schreibmaschine – jedes mit heller und dunkler Farbpalette
- **Dunkel- / Hellmodus**: Umschalten mit einem Tastendruck (`F2`)
- **Schriften anpassen**: Schrift, Größe und Zeilenhöhe getrennt für Quelltext und Vorschau
- **Eigenes Theme**: unter Einstellungen → Aussehen → Benutzerdefiniertes CSS schreiben und speichern; auf Basis des aktuellen Themes entsteht ein „eigenes Theme“ – ein komplettes Theme einfügen oder nur einzelne Farben anpassen, wirkt sofort
- **Theme-Erweiterung**: eine `.css` in `themes/` legen und in `themes/theme.json` registrieren, nach einem Neustart wird sie erkannt; Token-System und Konventionen stehen in `docs/THEME-DESIGN-SPEC.md`

### Sprachen und Oberfläche

- **16 Oberflächensprachen**: Vereinfachtes Chinesisch (Standard), Traditionelles Chinesisch, English, 日本語, 한국어, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська, Русский
- Unter Einstellungen → Allgemein → Oberflächensprache mit einem Klick wechseln, sofort wirksam; Oberflächentexte, das Tastenkürzel-Panel und Plugin-Beschreibungen folgen mit
- **Erster Start passt sich an**: ohne Installationssprache wird die Systemsprache gewählt, außerhalb der Liste fällt es auf English zurück; jeder Spracheintrag trägt zusätzlich die englische Kennung `Language`, damit er auch in einer chinesischen Oberfläche schnell zu finden ist
- **Oberflächenskalierung**: 80 %–120 % (Standard 100 %), skaliert nur Oberflächentexte und Symbole, Panelgrößen und Dokumentinhalt bleiben unberührt
- **Einstellungs-Panel**: Allgemein, Aussehen, Editor, Live-Modus, KI-Assistent, Cloud, Plugins, Tastenkürzel, Vorlagen, Dokumente, Info, Produkte, mit sofortiger Vorschau

---

## Tastenkürzel

| Tastenkürzel | Funktion | Tastenkürzel | Funktion |
|--------|------|--------|------|
| Ctrl+N | Neue Datei | Ctrl+B | Fett |
| Ctrl+O | Datei öffnen | Ctrl+I | Kursiv |
| Ctrl+S | Datei speichern | Ctrl+- | Durchgestrichen |
| Ctrl+Shift+S | Speichern unter | Ctrl++ | Inline-Code |
| Ctrl+W | Tab schließen | Ctrl+1 | Überschrift 1 |
| Ctrl+H | HTML exportieren | Ctrl+2 | Überschrift 2 |
| Ctrl+M | Markdown exportieren | Ctrl+3 | Überschrift 3 |
| Ctrl+Z | Rückgängig | Ctrl+. | Ungeordnete Liste |
| Ctrl+Y | Wiederholen | Ctrl+0 | Geordnete Liste |
| Ctrl+F | Suchen | Ctrl+' | Zitat |
| Ctrl+\ | Seitenleiste umschalten | Ctrl+K | Link |
| F1 | Alle Tastenkürzel | Ctrl+` | Codeblock |
| F2 | Hell/Dunkel umschalten | Ctrl+T | Tabelle |
| F3 | Zyklisch durch die vier Bearbeitungsansichten | Ctrl+L | Trennlinie |
| F9 | Zen-Modus (nur Quelltext / Live) | Ctrl+Alt+P | Präsentationsmodus (Folien) |
| F11 | Vollbild umschalten | Ctrl+Alt+R | Lesemodus |
| Ins | Slash-Menü | F12 | Entwicklerwerkzeuge |

Tastenkürzel lassen sich unter Einstellungen → Tastenkürzel anpassen: visuelle Belegung für 36 Actions, Tastenaufzeichnung, Konflikterkennung und Zurücksetzen auf den Standard.

---

## Verzeichnisstruktur

Nach dem Entpacken der portablen Version:

```
YiziMarkdown/
├── YiziMarkdown.exe        # Hauptprogramm
├── readme.md               # Projektbeschreibung (diese Datei)
├── welcome.md              # Willkommensdokument
├── docs/                   # Dokumentation (THEME-DESIGN-SPEC.md, Theme-Design-Spezifikation usw.)
├── user.css                # Eigene Benutzerstile
├── keybindings.json        # Tastenkürzel-Konfiguration
├── themes/                 # Theme-CSS-Dateien
│   ├── liquidglass-prism.css # Liquid Glass Prism (Standard)
│   ├── academic.css        # Academic Blue
│   ├── vibrant.css         # Vibrant Orange
│   ├── tech.css            # Tech
│   ├── minimal.css         # Minimalistisch
│   ├── magazine.css        # Magazin
│   ├── nature.css          # Natur
│   ├── lychee.css          # Litschi-Rot
│   ├── violet.css          # Violett
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Minze
│   ├── sunset.css          # Sonnenuntergang
│   └── typewriter.css      # Retro-Schreibmaschine
├── skills/                 # AI-Skills
│   ├── skills.json         # Skill-Liste
│   ├── slides-outline.md   # Präsentationsfassung verdichten
│   ├── doc-summary.md      # Dokument zusammenfassen
│   ├── polish-writing.md   # Formulierung überarbeiten
│   ├── translate-fulltext.md # Volltext übersetzen
│   └── markdown-format.md  # Markdown formatieren
└── templates/              # Integrierte Dokumentvorlagen (beim ersten Start in das Benutzerverzeichnis synchronisiert)
    ├── default.md          # Standardvorlage
    └── Slide-Template.md   # Präsentationsvorlage
```

> Hinweis: Die tatsächlichen Speicherorte für AI-Skills und Dokumentvorlagen liegen im **Benutzerverzeichnis** – unter Windows / macOS in `~/Documents/yizimarkdown/skills/` und `.../templates/`; unter Linux in `yizimarkdown/` im XDG-Dokumentverzeichnis (z. B. `~/Dokumente/yizimarkdown/`), ohne Dokumentverzeichnis als Rückfall auf `~/.local/share/yizimarkdown/`. (Die gleichnamigen Ordner im Programmverzeichnis sind integrierte Ressourcen und werden beim ersten Start dorthin synchronisiert.) Eigene Inhalte gehören ins Benutzerverzeichnis, damit Upgrades und Neuinstallationen sie nie überschreiben.

---

## Technologie-Stack

| Ebene | Technologie |
|------|------|
| Desktop-Framework | Tauri 2 (Rust) |
| Frontend-Framework | React 18 + TypeScript |
| Editor-Kern | CodeMirror 6 |
| Zustandsverwaltung | Zustand (persist) |
| Styling | Tailwind CSS + CSS-Variablen |
| Markdown-Rendering | markdown-it |
| Internationalisierung | Eigenes schlankes i18n (16 Sprachen) |
| KI-Anbindung | Rust-Streaming-Proxy (OpenAI / Anthropic / Ollama-Protokolle) |
| Build-Werkzeug | Vite |

---

## Entwicklung

### Voraussetzungen

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Entwicklungsserver starten

```bash
cd code
npm install
npm run tauri:dev
```

### Dock-Symbol im Linux-Entwicklungsmodus (optional)

Desktops wie elementary / GNOME suchen anhand der `WM_CLASS` des Fensters eine gleichnamige `.desktop`-Datei und darin das `Icon`; im Entwicklungsmodus gibt es keinen Installer und damit keine `.desktop`-Datei, das Dock zeigt nur ein allgemeines Symbol (das `_NET_WM_ICON` des Fensters wird bereits von Rust gesetzt, Installer sind nicht betroffen). Einmal ausführen:

```bash
npm run dev:icon           # schreibt ~/.local/share/applications/yizimarkdown-dev.desktop
npm run dev:icon:remove    # macht es rückgängig
```

Danach das Dev-Fenster neu starten, schon zeigt das Dock das App-Symbol.

### Release-Build erstellen

**Windows**

```bash
npm run tauri:build
```

Build-Artefakte:
- Portable exe: `src-tauri/target/release/yizimarkdown.exe`
- NSIS-Installer: `src-tauri/target/release/bundle/nsis/`

Installationsassistent: Bei der ersten Installation wird die Installationssprache gewählt (16 Optionen: alle Oberflächensprachen der App plus brasilianisches Portugiesisch); Assistentstexte und die Sprache beim ersten Start nach der Installation folgen dieser Auswahl; Upgrades / automatische Updates setzen die gewählte Sprache nicht zurück. Symbole sowie Seitenleisten- / Kopfzeilen-Grafiken liegen in `src-tauri/installer/`; nach einer Änderung der Markenfarben mit `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1` neu erzeugen.

Nach dem Build die exe und die Ressourcendateien manuell nach `public/YiziMarkdown-vX.X.X/` kopieren und verteilen.

**macOS (universelles Binary, Intel und Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Build-Artefakte:
- App-Bundle: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Installer: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux (deb + AppImage)**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

Build-Artefakte (**derzeit nur amd64 / x86_64**; ARM `arm64` deb und `aarch64` AppImage werden noch nicht veröffentlicht):
- Debian-Paket: `src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb` (etwa 16 MB, installiert nach `/usr/bin`, registriert Menüeintrag, Symbol und `.md` / `.epub`-Dateizuordnungen)
- Portables AppImage: `src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage` (etwa 150 MB, bringt GTK / WebKit und die GStreamer-Medienkomponenten mit, Doppelklick genügt)

Hinweis: **Der Build muss auf Ubuntu 22.04 erfolgen**. Auf 24.04 gebaute Binaries verlangen glibc 2.39 und starten auf Ubuntu 22.04 (2.35) / Debian 12 (2.36) nicht; die `deb`-Abhängigkeit von `libwebkit2gtk-4.1-0` setzt dieselbe Untergrenze (Debian 11 hat nur webkit 4.0). `rpm` wird nicht angeboten: Fedora / openSUSE verwenden andere Abhängigkeitsnamen und müssten separat gepflegt werden.

### Projektstruktur

```
code/
├── src/                    # Frontend-Quelltext
│   ├── App.tsx             # Hauptkomponente der App
│   ├── components/         # UI-Komponenten
│   │   ├── Editor.tsx      # CodeMirror-Editor + Vorschau
│   │   ├── Reader.tsx      # Lesemodus (Paginierung / Blättern)
│   │   ├── Slideshow.tsx   # Präsentationsmodus
│   │   ├── TabBar.tsx      # Tab-Leiste
│   │   ├── HomePage.tsx    # Startseite (letzte Dateien)
│   │   ├── Toolbar.tsx     # Symbolleiste
│   │   ├── Sidebar.tsx     # Seitenleiste (Gliederung + Dateibrowser)
│   │   ├── StatusBar.tsx   # Statusleiste unten
│   │   └── SettingsModal.tsx # Einstellungs-Panel
│   ├── stores/             # Zustandsverwaltung mit Zustand
│   ├── lib/                # Werkzeugbibliothek (Markdown-Rendering, Themes, Zen-Modus usw.)
│   └── styles/             # Globale Stile
├── src-tauri/              # Rust-Backend
│   ├── src/main.rs         # Tauri-Befehle (Datei-I/O, Theme-Laden, Registrierung usw.)
│   ├── icons/              # App-Symbole
│   ├── themes/             # Theme-CSS (mit theme.json-Metadaten)
│   └── templates/          # Dokumentvorlagen
├── docs/                   # Dokumentation (changelog / i18n-Readmes / THEME-DESIGN-SPEC.md)
└── package.json
```

---

## Version und Updates

Windows-Installationen aktualisieren sich direkt in der App; macOS, Linux und portable Versionen prüfen beim Start `latest.json`, melden eine neue Version unten rechts und öffnen die passende Downloadseite (manuelles Ersetzen, keine automatische Installation; unter Linux laufen sowohl `deb` als auch `AppImage` über diesen Weg).

---

## Lizenz

MIT
