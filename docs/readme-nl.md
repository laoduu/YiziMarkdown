# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)

[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)


**Officiële website:** https://md.yizigpt.com

Een elegante en eenvoudige cross-platform `Markdown`-editor, met ondersteuning voor een Windows portable versie en een macOS versie. Geen installatie nodig, uitpakken en gebruiken — mooi en praktisch tegelijk. Windows kan geïnstalleerd worden, maar je kunt ook een zip-bestand downloaden en direct uitpakken. macOS biedt een universeel binaire installatiepakket dat native draait op zowel Intel als Apple Silicon.

Waarom een `Markdown`-editor ontwikkelen?

Er zijn veel `Markdown`-editors op de markt, maar de meeste hebben ofwel een lelijke interface, ofwel zijn ze overladen met functies. Het is moeilijk een editor te vinden die zowel eenvoudig als stijlvol is en prettig werkt.

Daarom is YiziMarkdown ontstaan.

We hebben een uiterst elegante ervaring gecreëerd voor de WYSIWYG-modus. Tegelijkertijd ondersteunen we een PPT-achtige snelle presentatiemodus — geschreven notities en documenten kunnen snel worden overgeschakeld naar een presentatiemodus, ideaal voor het delen van informatie. Je moet het zelf proberen om het te weten.

---

## Functies

### Meertalige interface

- **15 interface-talen**: Vereenvoudigd Chinees (standaard), Traditioneel Chinees, Engels, Japans, Koreaans, Duits, Frans, Spaans, Portugees, Italiaans, Pools, Nederlands, Turks, Zweeds, Oekraïens
- Instellingen → Algemeen → Interface-taal met één klik wisselen, direct van kracht; alle interface-teksten, sneltoetspanelen en plugin-beschrijvingen worden mee gewisseld met de taal

### AI-assistent (zijbalk chatpaneel)

- **17 grote modelaanbieders + aangepaste service**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qianwen, Zhipu GLM, Moonshot Kimi, Volcengine, SiliconFlow, MiniMax, OpenRouter, OpenCode Go, Ollama (lokaal); "Aangepaste service" ondersteunt zowel OpenAI-compatibele als Anthropic-compatibele protocollen — voer zelf een Base URL, model-ID en sleutel in om verbinding te maken met elke externe service
- **AI-vaardigheden (Skills)**: Klik op de ⚡-knop in het invoerveld om het vaardigheidsmenu te openen; na selectie wordt de vaardigheids-tag bij de cursor ingevoegd en wordt het prompt automatisch in de context ingevoegd. Plaats `skills.json` + `.md` prompts in de `map skills/` om vaardigheden aan te passen. Ingebouwd: "Presentatie samenvatten", "Documentsamenvatting", "Schrijven polijsten"
- **Streaming conversatie**: Klik op de robotknop in de werkbalk om het AI-paneel aan de rechterkant te openen; antwoorden worden in realtime gestreamd en kunnen op elk moment worden gestopt
- **Denkproces weergave**: Het redeneerproces van redeneermodellen (reasoning/thinking) wordt weergegeven als een inklapbaar blok, standaard ingeklapt, zonder de tekst te beïnvloeden
- **Beveiliging van sleutels**: API-sleutels worden opgeslagen in de systeemportefeuille (OS keychain); ondersteuning voor opslaan, verwijderen en verifiëren met één klik; sleutels voor lokale eindpunten (llama.cpp / LM Studio / VLLM enz.) kunnen leeg worden gelaten
- **Huidige document refereren**: Schakel dit in om het huidige document als context naar de AI te stel; configureer het referentielimiet (64K–512K / onbeperkt) en het aantal contextrondes (0–20, standaard 3)
- **Resultaat opslaan**: Antwoorden kunnen worden gekopieerd, ingevoegd op de cursorpositie in het document, of met één klik als nieuw document worden aangemaakt

### Bewerken en voorvertoning

- **Broncode bewerken**: CodeMirror 6-kern, syntaxiskleuring, haakjescorrespondentie, automische aanvulling
- **Realtime-modus (WYSIWYG)**: Wat je ziet is wat je krijgt — Markdown-markeringen worden automatisch verborgen tijdens het typen, zodat je je kunt concentreren op de inhoud
- **Realtime-modus animaties**: 4 animatieschermen voor markeringen (focus / flits / gloed / golf), instelbaar in de instellingen
- **Realtime voorvertoning**: Markdown wordt direct gerenderd zodra je typt; ondersteuning voor interactieve takenlijsten (checkboxen)
- **Vijf weergavemodi**: Broncode / Naast elkaar / Realtime (WYSIWYG) / Voorvertoning / Presentatie (fullscreen diavoorstelling), met één klik te wisselen
- **Structuurgestuurde synchronisatie**: In de naast-elkaar-modus werken de linker- en rechterpanelen双向 samen; bij het wisselen van weergave wordt automatisch naar de huidige positie genavigeerd
- **Zoeken en vervangen**: Ondersteuning voor navigatie tussen overeenkomsten en alles vervangen
- **Werkbalk snelle opmaak**: Vet, cursief, doorgestreept, inline code — selecteer tekst en het wordt direct omhuld
- **Lokale afbeeldingen renderen**: In de voorvertoningsmodus worden lokale afbeeldingspaden (jpg/png/gif/webp/svg/bmp) automatisch gerenderd
- **Regelnummers / automatische terugloop**: Beide in te schakelen via de instellingen
- **Codeblok verbeteringen**: Syntaxiskleuring (highlight.js), taallabel, kopieerknop, automatische terugloop
- **Opmaakwerkbalk inklappen**: Wanneer de vensterbrete onvoldoende is, wordt de werkbalk automatisch ingeklapt; handmatig uitvouwen/invouwen mogelijk
- **Frontmatter filtering**: Voorvertoning / naast elkaar / realtime-modus filtert YAML frontmatter automatisch

### Wiskundige formules en diagrammen

- **KaTeX-formules**: Ingebouwde KaTeX-plug-in, inline `$...$` en blok `$$...$$` LaTeX-formules worden in realtime gerenderd
- **Mermaid-diagrammen**: Ingebouwde Mermaid-plug-in, stroomdiagrammen, sequentiediagrammen, Gantt-diagrammen, classendiagrammen, taartdiagrammen en meer worden automatisch gerenderd als visuele diagrammen, met ondersteuning voor meerdere thema's
- **Tabel selectie**: Klik op de tabelknop in de werkbalk om een 8×8 raster te openen; klik om een tabel met het gewenste aantal rijen en kolommen in te voegen

### Presentatiemodus (diavoorstelling)

- **Puur Markdown-gedreven**: Geen extra formaten nodig, `---` (horizontale scheidingslijn) scheidt pagina's; de engine analyseert de paginastructuur en kiest automatisch de lay-out
- **14 automatische lay-outs**: Omslag, hoofdstukspagina, afsluiting, inhoudsopgave, inhoud, lijst, datatabel, routekaart, afbeelding met tekst, afbeelding, citaat, code, diagram (mermaid), formule
- **Inhoudspagina links uitgelijnd + nadruk onderstreping**: Titel links bovenaan met themakleur onderstreping, tekst links uitgelijnd, comfortabel lezen
- **Citaatpagina diagonale aanhalingstekens**: Bovenste aanhalingsteken linksboven, onderste aanhalingsteken rechtsonder, inhoud verticaal gecentreerd
- **Expliciete instructies**: `<!-- layout: xxx -->` forceert een lay-out, `<!-- align: left|center|right -->` stelt de uitlijning van de hele pagina in (HTML-commentaar, onzichtbaar in de weergave)
- **Omslag meta**: Frontmatter biedt `author`/`date`, die automatisch op de omslag worden weergegeven
- **Voettekst en voortgang**: Linksonder de hoofdstuknaam + paginanummer, onderaan de voortgangsbalk in de themakleur
- **Scrollen met de muis**: Wanneer de inhoud scrollbaar is, wordt eerst de inhoud gescrolld; bij de grens wordt de pagina omgeslagen
- **Themaovertreding**: Titelkleuren veranderen nauwkeurig met het thema (alle 15 thema's worden ondersteund); tijdens de presentatie kun je het thema / de helderheid wijzigen
- **Fullscreen wisselen**: F-toets voor fullscreen / herstel, ondersteuning voor betrouwbaar schakelen vanuit elke vensterstatus (normaal / gemaximaliseerd)
- **Afsluitknop**: Wanneer de muis beweegt, verschijnt rechtsboven een transparante afsluitknop; na 1,5 seconden zonder actie verdwijnt deze automatisch
- **Vensterstatus herstellen**: Bij het afsluiten van de presentatie wordt automatisch de vorige vensterstatus (fullscreen / gemaximaliseerd / normaal) hersteld

### Plug-insysteem

- Plug-in-architectuur met twee ingebouwde kernplug-ins: KaTeX en Mermaid
- Het instellingenpaneel ondersteunt het in-/uitschakelen en configureren van plug-ins
- Plug-ins worden dynamisch geladen; niet-geactiveerde plug-ins verbruiken geen bronnen

### Multibestandsbeheer

- **Enkel instantiemodus**: Het openen van meerdere bestanden start geen meerdere vensters meer; ze worden automatisch samengevoegd naar de bestaande instantie; herhaald geopende bestanden worden automatisch naar het juiste tabblad genavigeerd
- **Tabbladbalk**: Beheer bovenaan meerdere geopende bestanden — wisselen, sluiten, nieuw aanmaken
- **Startpagina**: Lijst van recent geopende bestanden met bestandsgrootte en wijzigingstijd
- **Opslagstatus indicator**: Niet-opgeslagen bestanden hebben een ademende stipanimatie; na opslaan een ✅-bevestigingsanimatie
- **Sluitbevestiging**: Bij het sluiten van een niet-opgeslagen bestand verschijnt een bevestigingsvenster: opslaan / niet opslaan / annuleren

### Bestandsbewerkingen

- **Openen**: Ondersteuning voor .md / .markdown / .txt
- **Nieuw**: Nieuw leeg tabblad met "Naamloos nieuw bestand"
- **Nieuw vanuit sjabloon**: Werkbalk "Nieuw vanuit sjabloon" dropdownmenu maakt een nieuw document aan op basis van het geselecteerde Markdown-sjabloon; ook in te stellen als standaardsjabloon via Instellingen → Algemeen, waarna `Ctrl+N` automatisch het sjabloon toepast
- **Opslaan / automatisch opslaan**: Handmatig opslaan + configureerbaar automatisch opslaan (5–180 seconden, standaard 60 seconden)
- **Opslaan als**: Nieuwe bestanden openen automatisch het "Opslaan als"-dialoogvenster bij het opslaan
- **Exporteren**: Drie formaten — HTML / Markdown / platte tekst
- **.md-bestandskoppeling**: Stel met één klik in als standaard Markdown-editor; dubbelklik op .md om direct te openen (Windows register / macOS LaunchServices)

### Uiterlijk aanpassen

- **Vijftien ingebouwde thema's**: Academisch blauw (standaard), Levendig oranje, Tech-look, Minimalistisch, Magazine-look, Natureel, Vloeibaar glas, Lychee-rood, Violet, Cyberpunk, Facebook, Matrix, Mint-smoothie, Zonsondergang-goud, Retro typemachine — elk met lichte en donkere kleurenschema's
- **Donkere / lichte modus**: Elk thema heeft zowel een licht als donker kleurenschema
- **Lettertype aanpassen**: Afzonderlijke instellingen voor lettertype, lettergrootte en regelhoogte in de broncode- en voorvertoningsmodus
- **Aangepaste CSS**: `user.css` overschrijft alle thema's met de hoogste prioriteit
- **Thema-uitbreidingen**: Plaats `.css`-bestanden in de `themes/`-map en voeg themaparameters toe in `themes/theme.json`; na herstart worden ze automatisch herkend

### Overig

- **Documentsjablonen**: Plaats `.md`-bestanden in de `templates/`-map; bij het aanmaken van een nieuw document kun je een sjabloon selecteren
- **Sneltoetsensysteem**: Visueel sneltoetsconfiguratiepaneel met ondersteuning voor aangepaste binding van 30 acties, toetsopname, conflictdetectie en herstel naar standaardwaarden
- **Instellingenpaneel**: Meerdere tabbladen — Algemeen, Uiterlijk, Editor, Realtime-modus, AI, Plug-ins, Sneltoetsen, Sjablonen, Over; instellingen worden direct weergegeven

---

## Sneltoetsen

| Sneltoets | Functie |
|-----------|---------|
| Ctrl+N | Nieuw bestand |
| Ctrl+O | Bestand openen |
| Ctrl+S | Bestand opslaan |
| Ctrl+Shift+S | Opslaan als |
| Ctrl+W | Tabblad sluiten |
| Ctrl+H | Exporteren als HTML |
| Ctrl+M | Exporteren als Markdown |
| Ctrl+Z | Ongedaan maken |
| Ctrl+Y | Opnieuw uitvoeren |
| Ctrl+F | Zoeken |
| Ctrl+\ | Zijbalk wisselen |
| Ctrl+B | Vet |
| Ctrl+I | Cursief |
| Ctrl+- | Doorgestreept |
| Ctrl++ | Inline code |
| Ctrl+1 | Hoofdtitel |
| Ctrl+2 | Subtitel |
| Ctrl+3 | Derde titel |
| Ctrl+. | Ongeordende lijst |
| Ctrl+0 | Geordende lijst |
| Ctrl+' | Citaat |
| Ctrl+K | Link |
| Ctrl+` | Codeblok |
| Ctrl+T | Tabel |
| Ctrl+L | Scheidingslijn |
| F1 | Sneltoetsoverzicht |
| F2 | Donker/licht modus wisselen |
| F3 | Weergave doorlopen |
| Ctrl+Alt+P | Presentatiemodus (diavoorstelling) |
| Ins | Slash-menu |
| F12 | Ontwikkeltools |

Sneltoetsen kunnen worden aangepast via Instellingen → Sneltoetsen, met visuele configuratie en conflictdetectie.

---

## Draagbare versie mappenstructuur

```
YiziMarkdown/
├── YiziMarkdown.exe        # Hoofdprogramma
├── readme.md               # Projectbeschrijving (dit bestand)
├── welcome.md              # Welkomstdocument
├── changelog.md            # Ontwikkelingslogboek
├── user.css                # Gebruikers aangepaste stijlen
├── keybindings.json        # Sneltoetsconfiguratie
├── themes/                 # Thema CSS-bestanden
│   ├── academic.css        # Academisch blauw (standaard)
│   ├── vibrant.css         # Levendig oranje
│   ├── tech.css            # Tech-look
│   ├── minimal.css         # Minimalistisch
│   ├── magazine.css        # Magazine-look
│   ├── nature.css          # Natureel
│   ├── liquidglass.css     # Vloeibaar glas
│   ├── lychee.css          # Lychee-rood
│   ├── violet.css          # Violet
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Mint-smoothie
│   ├── sunset.css          # Zonsondergang-goud
│   └── typewriter.css      # Retro typemachine
├── skills/                 # AI-vaardigheden (Skills)
│   ├── skills.json         # Vaardigheidslijst
│   ├── slides-outline.md   # Presentatie samenvatten
│   ├── doc-summary.md      # Documentsamenvatting
│   └── polish-writing.md   # Schrijven polijsten
└── templates/              # Documentsjablonen
    └── default.md          # Standaardsjabloon
```

---

## Technische stack

| Laag | Technologie |
|------|-------------|
| Desktop framework | Tauri 2 (Rust) |
| Frontend framework | React 18 + TypeScript |
| Editor-kern | CodeMirror 6 |
| Statusbeheer | Zustand (persist) |
| Stijlen | Tailwind CSS + CSS variabelen |
| Markdown rendering | markdown-it |
| Internationalisatie | Eigen lichtgewicht i18n (15 talen) |
| AI-integratie | Rust streaming proxy (OpenAI/Anthropic/Ollama protocol) |
| Build tools | Vite |

---

## Ontwikkeling

### Vereisten

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Ontwikkelingsserver starten

```bash
cd code
npm install
npm run tauri:dev
```

### Releaseversie bouwen

**Windows**

```bash
npm run tauri:build
```

Build-resultaten:
- Portable exe: `src-tauri/target/release/yizimarkdown.exe`
- MSI-installatiepakket: `src-tauri/target/release/bundle/msi/`
- NSIS-installatiepakket: `src-tauri/target/release/bundle/nsis/`

Kopieer na het bouwen handmatig de exe en bronbestanden naar de map `public/YiziMarkdown-vX.X.X/` voor distributie.

**macOS (universeel binair, ondersteunt zowel Intel als Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Build-resultaten:
- App-pakket: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Installatiepakket: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### Projectstructuur

```
code/
├── src/                    # Frontend broncode
│   ├── App.tsx             # Hoofdtoepassing component
│   ├── components/         # UI-componenten
│   │   ├── Editor.tsx      # CodeMirror editor + voorvertoning
│   │   ├── TabBar.tsx      # Tabbladbalk
│   │   ├── HomePage.tsx    # Startpagina (recente bestanden)
│   │   ├── Toolbar.tsx     # Werkbalk
│   │   ├── Sidebar.tsx     # Zijbalk (structuur + bestandsverkenner)
│   │   ├── StatusBar.tsx   # Statusbalk onderaan
│   │   └── SettingsModal.tsx # Instellingenpaneel
│   ├── stores/             # Zustand statusbeheer
│   ├── lib/                # Gereedschapsbibliotheek (Markdown rendering, titel-ID's)
│   └── styles/             # Globale stijlen
├── src-tauri/              # Rust backend
│   ├── src/main.rs         # Tauri-commando's (bestanden lezen/schrijven, thema laden, register, enz.)
│   ├── icons/              # App-iconen
│   ├── themes/             # Thema CSS
│   └── templates/          # Documentsjablonen
└── package.json
```

---

## Licentie

MIT
