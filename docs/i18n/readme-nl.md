# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](../../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md) | [Русский](./readme-ru.md)

**Officiële website:** https://md.yizigpt.com

YiziMarkdown is een platformonafhankelijke Markdown-editor met schrijven als middelpunt. Hetzelfde `.md`-bestand kent zeven manieren van weergeven: `broncode bewerken`, `naast elkaar nalezen`, `live schrijven`, `voltooide voorbeeldweergave`, `diavoorstelling`, `lezen als een boek` en een `zenmodus` waarin alleen de tekst overblijft.

- **Windows**: installeerbaar (NSIS-installer met updates in de app) of als draagbaar zip-archief dat je uitpakt en direct start
- **macOS**: universele binary, native op Intel en Apple Silicon
- **Linux**: `deb` voor Debian-systemen en draagbare `AppImage` (Ubuntu 22.04+ / Debian 12+, voorlopig alleen amd64)

Waarom nog een Markdown-editor? Wat de markt biedt, is vaak niet mooi om naar te kijken of juist overladen met functies; een tool die tegelijk eenvoudig, mooi en prettig in gebruik is, is moeilijk te vinden. Zo is YiziMarkdown ontstaan, met drie vaste principes: **mooie interface**, **krachtige functies**, **veelzijdige scenario's**.

Zo is het huidige `YiziMarkdown` geworden: `3 besturingssystemen`, `7 gebruiksmodi`, `16 interfacetalen`, `15 lichte en donkere thema's`, `5 AI-skills`, `7 exportformaten`, plus innovatieve functies als de ingebouwde AI-assistent en cloudopslag, en open documentatie over thema's, skills en presentaties waarmee je heel eigen werkwijzen kunt opbouwen.

Dit is allang geen eenvoudige Markdown-editor meer, maar een veelzijdige applicatie die alle documentsituaties bij het schrijven, op het werk en in het dagelijks leven echt dekt.

---

## Zeven modi: één document, zeven manieren om het te tonen

De waarde van Markdown zit niet alleen in het schrijven, maar ook in aan wie en hoe je het resultaat laat zien. YiziMarkdown biedt voor hetzelfde document zeven manieren van weergeven: de eerste vier zijn bewerkingsweergaven die schakelen tussen broncode en eindresultaat; de laatste drie zijn zelfstandige scenario's die het document omzetten in dia's, boekpagina's of gewoon alleen de tekst.

| Modus | Kort gezegd | Toegang | Geschikt voor |
|------|-----------|------|------|
| Broncode | Ruwe Markdown direct bewerken | `F3` / weergaveknoppen | Structuur verfijnen, bulkvervanging, frontmatter aanpassen |
| Naast elkaar | Links schrijven, rechts direct vergelijken | `F3` / weergaveknoppen | Lay-out nalezen, schrijven volgens een sjabloon |
| Live | WYSIWYG, markeringen worden automatisch verborgen | `F3` / weergaveknoppen | Lange teksten schrijven, geconcentreerd werken |
| Voorbeeld | Alleen de definitieve lay-out | `F3` / weergaveknoppen | Resultaat controleren, hele tekst doornemen |
| Presentatie | Het document direct als dia's tonen | `Ctrl+Alt+P` / werkbalk | Delen, presenteren, lesgeven |
| Lezen | Het document als een omslaanbaar boek | `Ctrl+Alt+R` / werkbalk | Lange teksten, EPUB, meeslepend lezen |
| Zen | De hele interface wijkt terug, alleen tekst blijft | `F9` / werkbalk | Diepgaand, geconcentreerd schrijven |

`F3` schakelt cyclisch tussen Broncode / Naast elkaar / Live / Voorbeeld; presentatie, lezen en zen hebben elk een eigen ingang en storen elkaar niet.

---

## Markdown – vier in één

![Vier modi vergeleken](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

Broncode, Naast elkaar, Live en Voorbeeld delen één editor-kern en dezelfde Markdown-mogelijkheden; het verschil zit alleen in informatiedichtheid: van volledig zichtbare markeringen tot een volledig gezette uitkomst. Je kunt op elk moment omschakelen, waarbij de weergave zo goed mogelijk de huidige positie vasthoudt.

### Broncodemodus: alles wat je moet zien

- CodeMirror 6-kern: syntaxmarkering, haakjesmatching, automatische aanvulling
- Regelnummers en automatische regelafbreking zijn apart schakelbaar; ideaal voor regel voor regel verfijnen en grootschalig herschrijven
- YAML-frontmatter wordt ongewijzigd getoond – metadata wijzigen zonder het formaat te raden
- Tabellen, codeblokken en formules verschijnen als broncode; bij complexe structuren de meest controleerbare optie

### Naast-elkaar-modus: schrijven en vergelijken

- Broncode links, voorbeeld rechts, direct vernieuwd bij het typen
- Scrollsynchronisatie wordt door de outline gedreven; bij het wisselen van weergave springt de app naar je positie
- Ideaal voor het nalezen van de lay-out en het aanpassen van de structuur aan een bestaand document

### Livemodus: wat je ziet, is wat je krijgt

- Markdown-markeringen worden tijdens het typen automatisch verborgen en komen terug zodra de cursor ze verlaat; de inhoud blijft centraal staan
- Vier eigen animaties voor het verschijnen van markeringen (Focus / Flits / Gloed / Rimpel), te bekijken en te kiezen in de instellingen
- YAML-frontmatter wordt weergegeven als een bewerkbaar eigenschappenpaneel in Obsidian-stijl: 7 typen – automatisch / tekst / getal / selectievakje / datum / datum en tijd / lijst –, het type wordt per eigenschapsnaam globaal onthouden

### Voorbeeldmodus: alleen het resultaat

- Markdown wordt gerenderd terwijl je schrijft; selectievakjes van takenlijsten zijn direct aanklikbaar
- Afbeeldingen via lokale paden, afbeeldingen van het web en SVG worden automatisch weergegeven (jpg / png / gif / webp / svg / bmp)
- Frontmatter wordt automatisch verborgen; je ziet de definitieve lay-out

### Wat alle vier weergaven delen

- **Zoeken en vervangen**: navigeren door treffers, alles vervangen
- **Opmaak via de werkbalk**: vet, cursief, doorgestreept, inline code – de selectie wordt meteen omwikkeld
- **Extra's voor codeblokken**: highlight.js-syntaxkleuren, taallabels, kopieerknop, schakelaar voor regelafbreking
- **Tabelkiezer**: 8×8-raster waarin je kunt klikken, aantal rijen en kolommen direct zichtbaar, rijen en kolommen toevoegen en verwijderen, rechtermuisknopmenu met alle functies
- **Formules en diagrammen**: KaTeX inline `$...$` / blok `$$...$$`, Mermaid-flowcharts, sequentiediagrammen, Gantt-diagrammen, klassendiagrammen, cirkeldiagrammen en meer, kleuren volgen het thema
- **Inklapbare opmaakwerkbalk**: klapt bij een smal venster automatisch in en kan ook handmatig worden uitgeklapt
- **Regelnummers en regelafbreking**: schakelbaar in de instellingen
- **Outline-navigatie**: de kopniveaus komen uit de documentstructuur en volgen de scrollpositie

---

## Presentatiemodus: je notities in één stap als dia's

![Presentatiemodus](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

Kant-en-klare notities hoef je niet meer naar PPT te exporteren: met de ingebouwde skill van de AI-assistent verdicht je ze in één stap tot een bondige presentatieversie; schakel je naar de presentatiemodus, dan wordt het document meteen een schermvullende dia. Paginering, kolommen en lay-outs worden afgeleid uit de Markdown-structuur; voor exacte controle gebruik je HTML-commentaardirectieven.

### Inhoud wordt dia

- Geen extra formaat nodig: `---` (horizontale scheidingslijn) begint een nieuwe dia
- Een `***` op een eigen regel splitst de dia in kolommen, maximaal 4
- De engine analyseert de structuur van de pagina en kiest automatisch een lay-out: titels, lijsten, tabellen, code, afbeeldingen en diagrammen hebben elk hun eigen lay-out

### 14 lay-outs

Voorblad, sectiepagina, slotpagina, agenda, inhoud, lijst, datatabel, roadmap, tekst en beeld, beeld, citaat, code, diagram (Mermaid), formule.

- Afgezien van 'tekst en beeld', dat expliciet `<!-- layout: figure -->` vereist, worden alle lay-outs uit de inhoud afgeleid
- Inhoudspagina's zijn links uitgelijnd, de titel heeft een onderstreping in de themakleur
- Citaatpagina's hebben grote diagonale aanhalingstekens: openend linksboven, sluitend rechtsonder, inhoud verticaal gecentreerd
- Het voorblad leest `author` / `date` uit de frontmatter

### Typografie tijdens het presenteren

- HUD-instellingen: lettertype (thema volgen / sans-serif / serif / monospace), gewicht, grootte, breedte en hoogte van het inhoudsgebied (50%–95%)
- Wijzigingen werken direct en blijven bewaard voor de volgende presentatie
- Te lange inline code breekt af in plaats van afgesneden te worden bij de paginarand
- Expliciete directieven: `<!-- layout: xxx -->` forceert een lay-out, `<!-- align: left|center|right -->` lijnt de hele pagina uit

### Presenteren en navigeren

- Sectienaam + paginanummer linksonder, voortgangsbalk in themakleur onderaan
- `T` opent de agendalade, `G` of het invoerveld onderaan springt naar een pagina
- Muiswiel bladert: scrollbare inhoud scrolt eerst, aan de rand wordt de pagina omgeslagen
- `F` volledig scherm / terug, werkt vanuit elke vensterstatus – normaal, gemaximaliseerd enzovoort
- Na beëindigen wordt de vorige vensterstatus hersteld; de sluitknop rechtsboven verbergt zich na 1,5 s zonder interactie
- Thema's worden geërfd: titelkleuren volgen het thema, thema en licht/donker zijn ook tijdens het presenteren te wisselen

---

## Leesmodus: het document als een boek dat je omslaat

![Leesmodus](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

De leesmodus is geen 'volledig scherm als voorbeeld', maar zet de tekst echt in vaste pagina's: met voorblad, titelpagina, inhoudsopgave, paginanummers en papier- en omslaaneffecten.

- Ingang: boekknop in de werkbalk of `Ctrl+Alt+R`; `Esc` verlaat en herstelt de vorige weergave
- Lay-out: een dunne rand met gelijke marges om de boekpagina's, twee pagina's sluiten op elkaar aan met maar één scheidingslijn; boektitel linksboven, sectienaam / paginanummer linksonder, HUD rechtsonder – dezelfde posities als in de presentatiemodus
- Voorblad, titelpagina en inhoudsopgave worden automatisch gegenereerd: de titel komt uit `title` in de frontmatter of uit de eerste H1, de inhoudsopgave wordt uit de koppen opgebouwd met paginanummers en waar nodig gesplitst
- Echte paginering: twee pagina's naast elkaar (automatisch één pagina in smalle vensters), met paginanummers en leesvoortgang

### Animaties bij het omslaan

4 opties, te kiezen in de instellingen, standaard horizontaal schuiven:

- **Horizontaal schuiven** (standaard): de hele pagina verschuift, strak en snel
- **3D-omslaan**: het blad krult op vanaf rechtsonder en buigt om de binnenvouw, met licht en schaduw bij het omslaan (in éénpagina-modus om de rug)
- **Vervagen** / **Zoomen**: rustigere overgangen

Herhaald snel drukken slaat geen pagina's over; springen via inhoudsopgave, paginanummers en voetnoten speelt geen animatie af.

### Paginaregels per boekpagina

Paragrafen worden per regel gesplitst, koppen blijven nooit alleen staan, tabellen herhalen de kopregel op de vervolgpagina, codeblokken lopen regel voor regel door, lijsten item voor item, hele afbeeldingen schalen proportioneel; tekstparagrafen krijgen een eerste-regelinspringing van twee tekens, die op vervolgpagina's niet wordt herhaald.

### Navigatie en details

- Inhoudslade: `T` opent hem, koppen per niveau met paginanummers, klik springt direct
- `G` of het paginanummer-invoerveld springt naar een pagina
- Voetnoten heen en terug: klik op een verwijzing springt naar de definitiepagina en markeert die, met een knop 'terug naar verwijzing'; interne ankers springen ook per pagina
- Lees-HUD: rechtsonder licht/donker, thema, lettertype (thema / serif / sans-serif / monospace), grootte en regelafstand, alleen voor deze leessessie
- Positiegeheugen: paginanummer / sectie worden per document onthouden en bij het volgende openen hersteld
- Bediening: pijltoetsen, PageUp / PageDown, spatie, muiswiel, en klikken op de linker- of rechterrand van de pagina

### EPUB

Een `.epub` openen gaat direct naar de leesmodus: het leesthema van de app wordt gebruikt (uitgevers-CSS wordt genegeerd), ingebedde covers, navigatie-inhoudsopgave, afbeeldingen, formules, Mermaid-SVG, voetnoten en links tussen hoofdstukken worden gelezen. EPUB's met DRM of een vaste lay-out (comics / fotoboeken) worden nog niet ondersteund.

---

## Zenmodus: alleen de tekst

![Zenmodus](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

Betreden via `F9` of de zenknop in de werkbalk. Werkbalk, tabbladbalk, zijbalk, AI-paneel en statusbalk klappen laag voor laag naar de schermranden weg en vervagen, alleen de tekst blijft; **de lay-out verandert niet**, de tekst beweegt geen pixel.

- **De wereld is er nog**: houd de muis tegen een schermrand (boven / links / rechts / onder) en dat gebied komt op zijn plaats terug; ongeveer 1,2 s na vertrek klapt het weer weg
- **Een blijvende schakelaar**: de zenknop verdwijnt niet en blijft op zijn plek (met een zeer zwakke ademende rimpel eromheen) – zowel anker voor 'je bent in de zenmodus' als uitgang; `F9` / `Esc` verlaten ook
- **Alleen voor schrijven**: alleen beschikbaar in Broncode / Live; bij overschakelen naar Naast elkaar of Voorbeeld, of bij het ingaan van Lezen / Presentatie, wordt de modus automatisch verlaten
- **Rustiger papier**: regelnummers en zijbalklijnen verborgen, een zeer subtiele vignette, cursor na 2 s stilstand verborgen; de verticale scrollbalk wordt een minimalistische dunne strook die verschijnt bij scrollen of in de buurt van de rechterrand

---

## Bestanden en schrijven

### Bestanden en tabbladen

- **Openen**: `.md` / `.markdown` / `.txt` / `.epub`, EPUB gaat direct naar de leesmodus
- **Enkele instantie**: meerdere bestanden worden automatisch samengevoegd in het bestaande venster, een al geopend bestand wordt in het juiste tabblad gefocust
- **Tabbladbalk**: wisselen, sluiten, nieuw, sorteren door te slepen
- **Startpagina**: lijst met recent geopende bestanden, met grootte en wijzigingstijd
- **Opslagstatus**: ademende stip bij niet-opgeslagen bestanden, ✅-bevestigingsanimatie na opslaan
- **Sluiten bevestigen**: opslaan / niet opslaan / annuleren bij een niet-opgeslagen bestand

### Nieuw en sjablonen

- Een nieuw leeg tabblad toont 'Naamloos nieuw bestand'
- 'Nieuw uit sjabloon' in de werkbalk maakt een document op basis van de Markdown-structuur van het sjabloon; onder Instellingen → Algemeen stel je een standaardsjabloon in, waarna `Ctrl+N` dat automatisch gebruikt
- Sjablonen staan in de gebruikersmap – een `.md` erin plaatsen is genoeg; je kunt ze ook aanmaken en bewerken onder Instellingen → Sjablonen

### Plakken als Markdown

Rijke tekst die je kopieert uit webpagina's, Word / DOCX, Google Docs, Notion en vergelijkbare bronnen wordt bij het plakken in het geheugen omgezet naar nette Markdown (koppen / lijsten / tabellen / code / citaten / links); bestaande Markdown-broncode en platte tekst worden ongewijzigd geplakt.

### Opslaan en exporteren

- **Opslaan / automatisch opslaan**: handmatig opslaan plus een instelbaar interval (5–180 s, standaard 60 s)
- **Opslaan als**: bij het opslaan van een nieuw bestand verschijnt automatisch de dialoog 'Opslaan als'
- **Exporteren**: HTML / Markdown / platte tekst / Word (DOCX) / PDF / PPTX / EPUB
  - DOCX gebruikt native Word-semantiek (lijsten, tabellen, codeblokken, citaten, takenlijsten), de tabelopmaak komt overeen met het voorbeeld, afbeeldingen via lokale paden, webafbeeldingen en HTML-`<img>` worden ondersteund (breedte via `width`)
  - PDF komt overeen met het voorbeeld en wordt automatisch gepagineerd
  - HTML heeft links een zwevende outlinekaart, klik op een item springt naar de sectie (PDF zonder zijbalk)
  - PPTX erft thema, licht/donker en lay-outs van de presentatiemodus en levert bewerkbare tekst, tabellen, afbeeldingen, vormen en native formules
  - EPUB komt uit de ingebouwde plugin; vóór het exporteren kun je hoofdstukdeling / voorblad / zichtbare inhoudsopgave / leesthema / documentinformatie kiezen
- **`.md`-koppeling**: stel YiziMarkdown in de instellingen met één klik in als standaard Markdown-editor van het systeem (Windows-register / macOS LaunchServices)

### Cloudopslag (WebDAV)

- **Bestandsbrowser**: het tabblad 'Cloud' in de zijbalk doorzoekt de mappenboom van de server – documenten openen, bestanden / mappen aanmaken, hernoemen, verplaatsen, verwijderen; diepe paden klappen in de breadcrumb samen tot '…' met een dropdown, mappen worden lui per niveau geladen
- **Naar de cloud opslaan**: een lokaal document met één klik uploaden, relatief gerefereerde afbeeldingen gaan mee en de mappenstructuur blijft intact; bij clouddocumenten schrijft `Ctrl+S` direct terug
- **Conflictbescherming**: vóór het opslaan wordt de ETag vergeleken; is het bestand op een ander apparaat gewijzigd, dan biedt een dialoog 'serverversie overschrijven' of 'lokale wijzigingen verwerpen en opnieuw laden' – nooit stil overschrijven
- **Veilige inloggegevens**: gebruikersnaam en wachtwoord staan in de systeemreferentieopslag (Windows Credential Manager / macOS-sleutelhanger), niet in configuratiebestanden
- **Compatibiliteit**: standaard WebDAV-diensten zoals Nutstore, Nextcloud en Synology (een app-specifiek wachtwoord wordt aanbevolen)

---

## Uitbreidingen en personalisatie

### AI-assistent (chatpaneel in de zijbalk)

- **18 modelproviders + eigen dienst**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen, Zhipu GLM, Moonshot Kimi, Volcano Engine, SiliconFlow, MiniMax, Xiaomi MiMo, Meituan LongCat, OpenRouter, OpenCode Go, Ollama (lokaal); 'Eigen dienst' ondersteunt OpenAI-compatibele en Anthropic-compatibele protocollen met eigen Base URL, model-ID en sleutel
- **Streaming-gesprek**: de robotknop in de werkbalk opent het paneel rechts, antwoorden streamen live en zijn altijd te stoppen
- **Denkproces**: reasoning / thinking van reasoning-modellen verschijnt in een inklapbaar blok, standaard ingeklapt
- **Sleutelveiligheid**: API-sleutels staan in de systeemsleutelhanger, met één klik opslaan, wissen en verifiëren; lokale endpoints (llama.cpp / LM Studio / vLLM enz.) mogen leeg blijven
- **Het huidige document als referentie**: na aanvinken dient het huidige document als context, met instelbare limiet (64K–512K / onbeperkt) en contextrondes (0–20, standaard 3)
- **Resultaat bruikbaar maken**: kopiëren, op de cursorpositie invoegen of met één klik als nieuw document aanmaken

### AI-skills

De ⚡-knop in het invoerveld opent het skillmenu; de gekozen skill-tag wordt op de cursor ingevoegd en de prompt wordt automatisch in de context geïnjecteerd. Zet `skills.json` + `.md`-prompts in `skills/` om eigen skills te definiëren. Vijf skills zijn ingebouwd: 'Presentatie verdichten', 'Document samenvatten', 'Tekst verfijnen', 'Volledige tekst vertalen', 'Markdown formatteren'.

### Plugins

- **Kernmogelijkheden standaard ingebouwd**: KaTeX / Mermaid / voetnoten / takenlijsten / TOC en vergelijkbare documentsemantiek zijn onafhankelijk van plugin-schakelaars
- **Ingebouwde plugin**: EPUB-export (standaard aan, uit te schakelen op de pluginpagina; pas dan verschijnt het exportmenu in de werkbalk)
- **Plugin-standaard**: manifest (versie / API-versie / activatiemoment / rechten / capaciteiten) → kwalificatiecheck → lazy activatie → registratie van capaciteiten → opruimen bij deactiveren; de huidige versie laadt alleen in de app gecompileerde ingebouwde plugins

### Thema's en uiterlijk

- **15 ingebouwde thema's**: Liquid Glass Prism (standaard), Academic Blue, Vibrant Orange, Tech, Minimalistisch, Magazine, Natuur, Lychee-rood, Violet, Cyberpunk, Facebook, Matrix, Mint, Sunset, Retro typemachine – elk met een lichte en een donkere variant
- **Donker / licht**: met één toets wisselen (`F2`)
- **Lettertypen aanpassen**: lettertype, grootte en regelhoogte apart voor broncode en voorbeeld
- **Eigen thema**: schrijf en bewaar CSS onder Instellingen → Uiterlijk → Eigen CSS; op basis van het huidige thema ontstaat een 'eigen thema' – een heel thema plakken of alleen een paar kleuren bijstellen, direct van kracht
- **Thema-uitbreiding**: plaats een `.css` in `themes/` en registreer die in `themes/theme.json`, na een herstart wordt hij herkend; het tokensysteem en de conventies staan in `docs/THEME-DESIGN-SPEC.md`

### Talen en interface

- **16 interfacetalen**: Vereenvoudigd Chinees (standaard), Traditioneel Chinees, English, 日本語, 한국어, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська, Русский
- Onder Instellingen → Algemeen → Interfacetaal met één klik wisselen, direct van kracht; interfaceteksten, het sneltoetsenpaneel en pluginbeschrijvingen volgen mee
- **Automatisch bij de eerste start**: zonder installatietaalkeuze wordt de systeemtaal gebruikt, buiten de lijst valt het terug op English; elke taaleingang heeft ook het Engelse label `Language`, zodat je hem ook in een Chinese interface snel vindt
- **Interfaceschaal**: 80%–120% (standaard 100%), schaalt alleen interfaceteksten en pictogrammen, paneelgrootte en documentinhoud blijven onaangetast
- **Instellingenpaneel**: Algemeen, Uiterlijk, Editor, Livemodus, AI-assistent, Cloud, Plugins, Sneltoetsen, Sjablonen, Documenten, Over, Producten, met directe preview

---

## Sneltoetsen

| Sneltoets | Functie | Sneltoets | Functie |
|--------|------|--------|------|
| Ctrl+N | Nieuw bestand | Ctrl+B | Vet |
| Ctrl+O | Bestand openen | Ctrl+I | Cursief |
| Ctrl+S | Bestand opslaan | Ctrl+- | Doorgestreept |
| Ctrl+Shift+S | Opslaan als | Ctrl++ | Inline code |
| Ctrl+W | Tabblad sluiten | Ctrl+1 | Kop 1 |
| Ctrl+H | HTML exporteren | Ctrl+2 | Kop 2 |
| Ctrl+M | Markdown exporteren | Ctrl+3 | Kop 3 |
| Ctrl+Z | Ongedaan maken | Ctrl+. | Ongeordende lijst |
| Ctrl+Y | Herhalen | Ctrl+0 | Geordende lijst |
| Ctrl+F | Zoeken | Ctrl+' | Citaat |
| Ctrl+\ | Zijbalk wisselen | Ctrl+K | Link |
| F1 | Alle sneltoetsen | Ctrl+` | Codeblok |
| F2 | Licht/donker wisselen | Ctrl+T | Tabel |
| F3 | Cyclisch door de vier bewerkingsweergaven | Ctrl+L | Scheidingslijn |
| F9 | Zenmodus (alleen Broncode / Live) | Ctrl+Alt+P | Presentatiemodus (dia's) |
| F11 | Volledig scherm wisselen | Ctrl+Alt+R | Leesmodus |
| Ins | Slash-menu | F12 | Ontwikkelaarshulpmiddelen |

Sneltoetsen zijn aan te passen onder Instellingen → Sneltoetsen: visuele binding voor 36 actions, toetsen opnemen, conflictdetectie en terugzetten naar de standaard.

---

## Mappenstructuur

Na het uitpakken van de draagbare versie:

```
YiziMarkdown/
├── YiziMarkdown.exe        # Hoofdprogramma
├── readme.md               # Projectbeschrijving (dit bestand)
├── welcome.md              # Welkomstdocument
├── docs/                   # Documentatie (THEME-DESIGN-SPEC.md, specificatie voor themaontwerp enz.)
├── user.css                # Eigen gebruikersstijlen
├── keybindings.json        # Sneltoetsconfiguratie
├── themes/                 # Thema-CSS-bestanden
│   ├── liquidglass-prism.css # Liquid Glass Prism (standaard)
│   ├── academic.css        # Academic Blue
│   ├── vibrant.css         # Vibrant Orange
│   ├── tech.css            # Tech
│   ├── minimal.css         # Minimalistisch
│   ├── magazine.css        # Magazine
│   ├── nature.css          # Natuur
│   ├── lychee.css          # Lychee-rood
│   ├── violet.css          # Violet
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Mint
│   ├── sunset.css          # Sunset
│   └── typewriter.css      # Retro typemachine
├── skills/                 # AI-skills
│   ├── skills.json         # Skilllijst
│   ├── slides-outline.md   # Presentatie verdichten
│   ├── doc-summary.md      # Document samenvatten
│   ├── polish-writing.md   # Tekst verfijnen
│   ├── translate-fulltext.md # Volledige tekst vertalen
│   └── markdown-format.md  # Markdown formatteren
└── templates/              # Ingebouwde documentsjablonen (bij de eerste start naar de gebruikersmap gesynchroniseerd)
    ├── default.md          # Standaardsjabloon
    └── Slide-Template.md   # Presentatiesjabloon
```

> Let op: AI-skills en documentsjablonen staan in werkelijkheid in de **gebruikersmap** – onder Windows / macOS in `~/Documents/yizimarkdown/skills/` en `.../templates/`; onder Linux in `yizimarkdown/` binnen de XDG-documentenmap (bijv. `~/Documenten/yizimarkdown/`), met `~/.local/share/yizimarkdown/` als terugval wanneer er geen documentenmap is. (De mappen met dezelfde naam in de programmamap zijn ingebouwde bronnen en worden bij de eerste start daarheen gesynchroniseerd.) Bewaar je eigen inhoud in de gebruikersmap, zodat upgrades en herinstallaties die nooit overschrijven.

---

## Technologiestack

| Laag | Technologie |
|------|------|
| Desktopframework | Tauri 2 (Rust) |
| Frontendframework | React 18 + TypeScript |
| Editor-kern | CodeMirror 6 |
| Statusbeheer | Zustand (persist) |
| Styling | Tailwind CSS + CSS-variabelen |
| Markdown-rendering | markdown-it |
| Internationalisering | Eigen lichtgewicht i18n (16 talen) |
| AI-integratie | Rust-streamingproxy (OpenAI / Anthropic / Ollama-protocollen) |
| Buildtool | Vite |

---

## Ontwikkeling

### Vereisten

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Dev-server starten

```bash
cd code
npm install
npm run tauri:dev
```

### Dockpictogram in Linux-dev-modus (optioneel)

Desktops als elementary / GNOME zoeken op basis van de `WM_CLASS` van het venster een `.desktop`-bestand met dezelfde naam en daarin het `Icon`; een dev-build heeft geen installer en dus geen `.desktop`-bestand, de dock toont alleen een algemeen pictogram (het `_NET_WM_ICON` van het venster wordt al door Rust gezet, installers zijn niet getroffen). Voer één keer uit:

```bash
npm run dev:icon           # schrijft ~/.local/share/applications/yizimarkdown-dev.desktop
npm run dev:icon:remove    # maakt het ongedaan
```

Start daarna het dev-venster opnieuw, dan toont de dock het app-pictogram.

### Releasebuild maken

**Windows**

```bash
npm run tauri:build
```

Artefacten:
- Draagbare exe: `src-tauri/target/release/yizimarkdown.exe`
- NSIS-installer: `src-tauri/target/release/bundle/nsis/`

Installatieassistent: bij de eerste installatie wordt de installatietaal gekozen (16 opties: alle interfacetalen van de app plus Braziliaans-Portugees); de teksten van de assistent en de taal bij de eerste start daarna volgen die keuze; upgrades / automatische updates zetten de gekozen taal niet terug. Pictogrammen en illustraties voor zijbalk / koptekst staan in `src-tauri/installer/`; na een wijziging van de merkkleuren opnieuw genereren met `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1`.

Kopieer na de build de exe en de resourcebestanden handmatig naar `public/YiziMarkdown-vX.X.X/` om te distribueren.

**macOS (universele binary, Intel en Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artefacten:
- App-bundel: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Installer: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux (deb + AppImage)**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

Artefacten (**voorlopig alleen amd64 / x86_64**; ARM `arm64` deb en `aarch64` AppImage worden nog niet gepubliceerd):
- Debian-pakket: `src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb` (ongeveer 16 MB, installeert naar `/usr/bin`, registreert menuitem, pictogram en `.md` / `.epub`-koppelingen)
- Draagbare AppImage: `src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage` (ongeveer 150 MB, met GTK / WebKit en de GStreamer-mediacomponenten, dubbelklikken is genoeg)

Let op: **bouwen moet op Ubuntu 22.04**. Binaries die op 24.04 zijn gebouwd vereisen glibc 2.39 en starten niet op Ubuntu 22.04 (2.35) / Debian 12 (2.36); de `deb`-afhankelijkheid van `libwebkit2gtk-4.1-0` legt dezelfde ondergrens (Debian 11 heeft alleen webkit 4.0). `rpm` wordt niet aangeboden: Fedora / openSUSE gebruiken andere afhankelijkheidsnamen en zouden apart onderhoud vergen.

### Projectstructuur

```
code/
├── src/                    # Frontendbroncode
│   ├── App.tsx             # Hoofdcomponent van de app
│   ├── components/         # UI-componenten
│   │   ├── Editor.tsx      # CodeMirror-editor + voorbeeld
│   │   ├── Reader.tsx      # Leesmodus (paginering / omslaan)
│   │   ├── Slideshow.tsx   # Presentatiemodus
│   │   ├── TabBar.tsx      # Tabbladbalk
│   │   ├── HomePage.tsx    # Startpagina (recente bestanden)
│   │   ├── Toolbar.tsx     # Werkbalk
│   │   ├── Sidebar.tsx     # Zijbalk (outline + bestandsbrowser)
│   │   ├── StatusBar.tsx   # Statusbalk onderaan
│   │   └── SettingsModal.tsx # Instellingenpaneel
│   ├── stores/             # Statusbeheer met Zustand
│   ├── lib/                # Hulpbibliotheek (Markdown-rendering, thema's, zenmodus enz.)
│   └── styles/             # Globale stijlen
├── src-tauri/              # Rust-backend
│   ├── src/main.rs         # Tauri-commando's (bestands-I/O, thema laden, register enz.)
│   ├── icons/              # App-pictogrammen
│   ├── themes/             # Thema-CSS (met theme.json-metadata)
│   └── templates/          # Documentsjablonen
├── docs/                   # Documentatie (changelog / i18n-readme's / THEME-DESIGN-SPEC.md)
└── package.json
```

---

## Versie en updates

Windows-installaties werken zichzelf binnen de app bij; macOS, Linux en draagbare versies controleren bij de start `latest.json`, melden een nieuwe versie rechtsonder en openen de juiste downloadpagina (handmatig vervangen, geen automatische installatie; onder Linux lopen zowel `deb` als `AppImage` via deze weg).

---

## Licentie

MIT
