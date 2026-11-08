# YiziMarkdown


![Bild](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](../../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md) | [Русский](./readme-ru.md)

**Officiell webbplats:** https://md.yizigpt.com

YiziMarkdown är en plattformsoberoende Markdown-redigerare med skrivandet i centrum. Samma `.md`-fil får sju presentationssätt: `källredigering`, `korrekturläsning sida vid sida`, `live-skrivande`, `färdig förhandsvisning`, `bildspel`, `bokläsning` och ett `Zen-läge` där bara texten blir kvar och skrivandet får fullt fokus.

- **Windows**: installationsbar (NSIS-installationspaket med uppdateringar i appen) eller portabelt zip — packa upp och kör
- **macOS**: universellt binärpaket som körs nativt på både Intel och Apple Silicon
- **Linux**: `deb` för Debian-baserade system och installationsfri `AppImage` (Ubuntu 22.04+ / Debian 12+, för närvarande endast amd64)

Varför utveckla ännu en Markdown-redigerare? Alternativen på marknaden är antingen mindre vackra eller överfyllda med funktioner, och det är svårt att hitta ett verktyg som förenar enkel, vacker design med behaglig användning. Därför skapades YiziMarkdown, med tre löften: **snyggt gränssnitt**, **kraftfulla funktioner**, **många användningsområden**.

Så uppstod dagens `YiziMarkdown`: `3 system`, `7 arbetslägen`, `16 gränssnittsspråk`, `15 ljusa och mörka teman`, `5 AI-färdigheter (Skill)`, `7 exportformat` – plus innovativa funktioner som AI-assistenten och molnlagringen, och öppen dokumentation för teman, färdigheter och presentationer, så att du kan bygga ännu mer unika upplevelser.

Det här är inte längre en enkel Markdown-redigerare, utan en verkligt mångsidig app som täcker många dokumentsituationer i ditt skapande, arbete och vardagsliv.

---

## Sju lägen: ett dokument, sju sätt att presenteras

Markdowns värde ligger inte bara i skrivandet, utan också i vem som ska se resultatet och hur. YiziMarkdown ger samma dokument sju presentationssätt: de fyra första är redigeringsvyer som växlar mellan rå källkod och färdigt resultat; de tre sista är separata scenarier som förvandlar dokumentet till slajder, boksidor eller bara texten.

| Läge | Kort beskrivning | Ingång | Bäst för |
|------|-----------|------|------|
| Källa | Redigera rå Markdown direkt | `F3` / vyknappar | Finjustera struktur, massersättning, redigera front matter |
| Sida vid sida | Skriv till vänster, jämför direkt till höger | `F3` / vyknappar | Korrekturläsa layout, skriva mot en mall |
| Live | WYSIWYG, markeringar döljs automatiskt | `F3` / vyknappar | Långa texter, fokuserat skrivande |
| Förhandsvisning | Visar endast den färdiga layouten | `F3` / vyknappar | Kontrollera resultatet, läsa igenom hela texten |
| Presentation | Dokumentet som ett bildspel | `Ctrl+Alt+P` / verktygsfältet | Dela, rapportera, undervisa |
| Läsning | Dokumentet som en bok att bläddra i | `Ctrl+Alt+R` / verktygsfältet | Långa texter, EPUB, fördjupad läsning |
| Zen | Gränssnittet försvinner, texten blir kvar | `F9` / verktygsfältet | Fördjupat skrivande |

`F3` växlar i cykler mellan Källa / Sida vid sida / Live / Förhandsvisning; Presentation, Läsning och Zen har egna ingångar och krockar inte med varandra.

---

## Markdown: fyra i ett

![Jämförelse av fyra lägen](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

Källa, Sida vid sida, Live och Förhandsvisning delar en redigerarkärna och samma uppsättning Markdown-funktioner; skillnaden är informationsdensiteten — från helt synliga markeringar till ett fullt satt resultat. Du kan växla när som helst, och vyn behåller positionen så gott det går.

### Källläge: allt synligt som behövs

- CodeMirror 6-kärna: syntaxmarkering, parentesmatchning, autokomplettering
- Radnummer och radbrytning kan slås på och av oberoende av varandra; perfekt för radvis finputsning och massredigering
- YAML-frontmatter visas som det är — metadata kan redigeras utan att gissa formatet
- Tabeller, kodblock och formler visas som källkod — ger mest kontroll vid komplexa strukturer

### Sida vid sida: skriv och jämför

- Källa till vänster, förhandsvisning till höger, uppdateras direkt vid inmatning
- Synkroniserad rullning styrs av översikten; vid vybyte hoppar vyn automatiskt till aktuell position
- Perfekt för korrekturläsning av layout och omstrukturering av befintliga dokument

### Live-läge: det du ser är det du får

- Markeringar döljs medan du skriver och återkommer när markören lämnar dem, så du kan fokusera på innehållet
- Fyra animationer när markeringar visas (fokus / blixt / glöd / våg) med förhandsvisning och byte i inställningarna
- YAML-front matter renderas som en redigerbar egenskapspanel i Obsidian-stil: 7 typer — automatiskt / text / tal / kryssruta / datum / datum och tid / lista; typen memoreras globalt per egenskapsnamn

### Förhandsvisningsläge: bara resultatet

- Markdown renderas direkt när du skriver; kryssrutor i att-göra-listor kan klickas
- Bilder från lokala sökvägar, bilder från nätet och SVG renderas automatiskt (jpg / png / gif / webp / svg / bmp)
- frontmatter döljs automatiskt — du ser den slutliga layouten

### Det de fyra vyerna delar

- **Sök och ersätt**: navigering mellan träffar, ersätt alla
- **Formatering i verktygsfältet**: fet, kursiv, genomstruken, inline-kod — markeringen omsluts direkt
- **Kodblocksförstärkning**: highlight.js-syntaxfärger, språketiketter, kopieringsknapp, växling av radbrytning
- **Tabellväljare**: 8×8-rutnät, infoga med ett klick, antal rader och kolumner synligt direkt, lägg till och ta bort rader och kolumner, högerklicksmeny med flera funktioner
- **Formler och diagram**: KaTeX inline `$...$` / block `$$...$$`, Mermaid flödesdiagram, sekvensdiagram, Gantt-scheman, klassdiagram, cirkeldiagram m.m., färgsatta efter temat
- **Hopfallbart formateringsfält**: dras automatiskt in när fönstret blir smalare, kan också expanderas manuellt
- **Radnummer och radbrytning**: kan slås på och av i inställningarna
- **Översiktsnavigering**: rubrikhierarkin kommer från dokumentets struktur och följer rullningspositionen

---

## Presentationsläge: gör anteckningar till ett bildspel

![Presentationsläge](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

Färdiga anteckningar behöver inte längre exporteras till PPT: med den inbyggda AI-färdigheten destilleras de med ett klick till en kort presentationsversion, och när du byter till presentationsläget blir dokumentet omedelbart ett bildspel i fullskärm. Sidbrytningar, kolumner och layouter härleds automatiskt från Markdown-strukturen; när du behöver exakt kontroll använder du HTML-kommentarsdirektiv.

### Innehållet blir slajder

- Inget extra format krävs: `---` (horisontell linje) delar sidor
- En egen rad med `***` delar slajden i kolumner, högst 4
- Motorn analyserar hela sidans struktur och väljer layout automatiskt: rubriker, listor, tabeller, kod, bilder och diagram har var sin layout

### 14 layouter

Omslag, avsnittsslajd, avslutningsslajd, dagordning, innehåll, lista, datatabell, roadmap, text och bild, bild, citat, kod, diagram (Mermaid), formel.

- Förutom ”text och bild”, som kräver explicit `<!-- layout: figure -->`, härleds alla layouter från innehållet
- Innehållssidor är vänsterjusterade, rubriken har en understrykning i temafärg
- Citatslajden har stora diagonala citattecken: öppning uppe till vänster, stängning nere till höger, innehållet vertikalt centrerat
- Omslaget läser automatiskt `author` / `date` från front matter

### Typografikontroll under visningen

- HUD-inställningar: typsnitt (följ temat / sans / serif / mono), vikt, storlek, innehållsytans bredd och höjd (50%–95%)
- Ändringar slår igenom direkt och sparas — nästa visning använder dem
- Lång inline-kod radbryts i stället för att klippas vid sidkanten
- Direktiv: `<!-- layout: xxx -->` tvingar en layout, `<!-- align: left|center|right -->` justerar hela sidan

### Visning och navigering

- Avsnittsnamn och sidnummer nere till vänster, en förloppsindikator i temafärg längst ned
- `T` öppnar dagordningslådan, `G` eller inmatningsfältet längst ned hoppar till en sida
- Musrullningen bläddrar: innehållet rullas först, och sidan vänds vid kanten
- `F` växlar fullskärm, fungerar från alla fönstertillstånd — normalt, maximerat m.m.
- Fönstrets tidigare tillstånd återställs vid avslut; stängningsknappen uppe till höger göms efter 1,5 s utan åtgärd
- Temat ärvs: rubrikfärger följer temat, och tema samt ljust/mörkt kan bytas även under visningen

---

## Läsläge: dokumentet som en bok att bläddra i

![Läsläge](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

Läsläget är inte en ”förhandsvisning i fullskärm” — texten sätts faktiskt i fasta sidor: med omslag, titelsida, innehållsförteckning, sidnummer samt pappers- och bläddringseffekter.

- Ingång: bokknappen i verktygsfältet eller `Ctrl+Alt+R`; `Esc` avslutar och återställer föregående vy
- Layout: en tunn ram med jämna marginaler omsluter sidorna; två sidor möts med bara en falslinje; boktitel uppe till vänster, avsnittsnamn / sidnummer nere till vänster, HUD nere till höger — samma placering som i presentationsläget
- Omslag, titelsida och innehållsförteckning skapas automatiskt: titeln hämtas från front matter `title` eller första H1, innehållsförteckningen byggs från rubriker med sidnummer och delas automatiskt när den blir för lång
- Verklig sidindelning: uppslag (enkel sida automatiskt i smala fönster), med sidnummer och läsframsteg

### Bläddringsanimeringar

4 alternativ, växlingsbara i inställningarna, horisontell glidning som standard:

- **Horisontell glidning** (standard): hela sidan förskjuts — snabbt och distinkt
- **3D-bläddring**: bladet rullar upp från nedre högra hörnet och böjs runt falsen, med lyft, ljus och skugga (runt bokryggen i enkelsidigt läge)
- **Tonning** / **Zoomning**: lugnare övergångar

Snabba upprepade tryck hoppar aldrig över sidor; hopp från innehållsförteckning, sidnummer och fotnoter spelas upp utan animering.

### Sidindelningsregler

Stycken delas radvis, rubriker lämnas aldrig ensamma, tabellhuvuden upprepas på nästa sida, kodblock fortsätter rad för rad, listor fortsätter post för post, hela bilder skalas proportionellt; brödtextsparagrafer får automatiskt ett första radindrag på två tecken som inte upprepas på nästa sida.

### Navigering och detaljer

- Innehållslåda: `T`, rubriker listade enligt hierarki med sidnummer, klick hoppar direkt
- `G` eller sidnummerfältet hoppar till angiven sida
- Fotnoter fram och tillbaka: klick på en referens hoppar till definitionssidan och markerar den, med knappen ”tillbaka till referens”; interna ankare hoppar också sida för sida
- Läs-HUD: nere till höger, växla ljust/mörkt, tema, typsnitt (tema / serif / sans / mono), storlek och radavstånd — gäller endast denna läsning
- Positionsminne: sida/avsnitt sparas per dokument och återställs vid nästa ingång
- Styrning: piltangenter, PageUp / PageDown, mellanslag, mushjulet, samt klick på sidans vänstra eller högra kant

### EPUB

När en `.epub` öppnas går du direkt in i läsläget: appens läsningstema används (utgivarens CSS ignoreras), och inbäddat omslag, navigering, bilder, formler, Mermaid-SVG, fotnoter och länkar mellan avsnitt läses in. EPUB med DRM och fast layout (serier / bilderböcker) stöds ännu inte.

---

## Zen-läge: bara texten

![Zen-läge](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

Aktiveras med `F9` eller Zen-knappen i verktygsfältet. Verktygsfält, flikfält, sidofält, AI-panel och statusfält vecklas lager för lager mot skärmkanterna och tonar bort, så att bara texten blir kvar; hela förloppet **ändrar inte layouten** — texten flyttar sig inte en enda pixel.

- **Världen finns kvar**: när pekaren rör vid valfri skärmkant (upp / vänster / höger / ned) tonar motsvarande område tillbaka på plats; det dras in igen cirka 1,2 s efter att pekaren lämnat
- **En ständig växlingsknapp**: Zen-knappen försvinner aldrig och står kvar på sin plats (med en mycket svag andande våg runt omkring) — både en markering att du är i Zen-läget och vägen ut; `F9` / `Esc` avslutar också
- **Endast för skrivande**: tillgängligt endast i Källa / Live; byte till Sida vid sida eller Förhandsvisning, eller inträde i Läsning / Presentation, avslutar det automatiskt
- **En renare pappersyta**: radnummer och sidofältets vertikala linjer dolda, en mycket svag vinjett, pekaren dold efter 2 s stillhet; den vertikala rullningslisten ersatt av en minimal tunn linje som visas vid rullning eller nära högerkanten

---

## Filer och skrivande

### Filer och flikar

- **Öppna**: `.md` / `.markdown` / `.txt` / `.epub`, EPUB går direkt till läsläget
- **Enkel instans**: flera filer slås samman i det befintliga fönstret, och en redan öppnad fil fokuseras i sin flik
- **Flikfält**: växla, stäng, skapa, ordna genom att dra
- **Startsida**: lista över senast öppnade filer med storlek och ändringstid
- **Sparstatus**: en andande punkt för osparade filer, ✅-bekräftelseanimering efter sparning
- **Stängningsbekräftelse**: spara / spara inte / avbryt när en osparad fil stängs

### Nya dokument och mallar

- En ny tom flik visar ”Namnlös fil”
- ”Ny från mall” i verktygsfältet skapar ett dokument enligt mallens Markdown-struktur; en standardmall kan anges i Inställningar → Allmänt, varefter `Ctrl+N` använder den automatiskt
- Mallar ligger i användarkatalogen — lägg bara in `.md`-filer, eller skapa / redigera dem i Inställningar → Mallar

### Inklistring som Markdown

Formaterad text (rich text) som kopierats från webbsidor, Word / DOCX, Google Docs, Notion m.m. konverteras vid inklistring i minnet till ordnad Markdown (rubriker / listor / tabeller / kod / citat / länkar); befintlig Markdown-källa och ren text klistras in oförändrade.

### Spara och exportera

- **Spara / autospara**: manuell sparning + konfigurerbart intervall (5–180 s, standard 60 s)
- **Spara som**: när en ny fil sparas öppnas dialogrutan Spara som automatiskt
- **Export**: HTML / Markdown / ren text / Word (DOCX) / PDF / PPTX / EPUB
  - DOCX använder Words inbyggda semantik (listor, tabeller, kodblock, citat, att-göra-listor), tabellstilen matchar förhandsvisningen, bilder stöds från lokala sökvägar, nätverk och HTML `<img>` (bredd via `width`)
  - PDF överensstämmer med förhandsvisningen och sidindelas automatiskt
  - HTML innehåller ett flytande översiktskort till vänster; klick på en post går direkt till avsnittet (PDF har inget sidofält)
  - PPTX ärver presentationslägets tema, ljust/mörkt och layouter och exporterar redigerbar text, tabeller, bilder, former och inbyggda formler
  - EPUB levereras av det inbyggda pluginet; före export kan du välja avsnittsdelning / omslag / synlig innehållsförteckning / läsningstema / dokumentinformation
- **`.md`-filassociation**: ange YiziMarkdown som systemets standard Markdown-redigerare med ett klick i inställningarna (Windows-registret / macOS LaunchServices)

### Molnlagring (WebDAV)

- **Filbläddrare**: fliken ”Moln” i sidofältet bläddrar i serverns katalogträd — öppna dokument, skapa filer / mappar, byta namn, flytta, ta bort; djupa sökvägar (brödsmulor) vecklas till ”…” med en rullgardinsmeny för att hoppa, och mappar laddas lättjefullt nivå för nivå
- **Spara till molnet**: ett lokalt dokument laddas upp med ett klick, tillsammans med bilder som refereras med relativa sökvägar, och katalogstrukturen bevaras; `Ctrl+S` i ett molndokument skriver direkt tillbaka
- **Konfliktskydd**: ETag jämförs före sparning; om filen ändrats av en annan enhet visas ett val att ”överskriv serverns version” eller ”förkasta mina ändringar och ladda om” — aldrig tyst överskrivning
- **Säkerhet för inloggningsuppgifter**: användarnamn och lösenord lagras i operativsystemets nyckelring (Windows Credential Manager / macOS Keychain), aldrig i konfigurationsfiler
- **Kompatibilitet**: standardiserade WebDAV-tjänster som Nutstore (Jianguoyun), Nextcloud och Synology (appspecifikt lösenord rekommenderas)

---

## Tillägg och anpassning

### AI-assistent (sidopanel för chatt)

- **18 modellleverantörer + anpassad tjänst**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Tongyi Qianwen (Qwen), Zhipu GLM, Moonshot Kimi, Volcano Engine (Doubao), SiliconFlow, MiniMax, Xiaomi MiMo, Meituan LongCat, OpenRouter, OpenCode Go, Ollama (lokal); ”Anpassad tjänst” stöder OpenAI-kompatibla / Anthropic-kompatibla protokoll med egen Base URL, modell-ID och nyckel
- **Strömmande chatt**: robotknappen i verktygsfältet öppnar panelen till höger, svaren strömmar in i realtid och kan stoppas när som helst
- **Tankeprocess**: reasoning / thinking från resonerande modeller visas i ett hopfallbart block, hopfallet som standard
- **Nyckelsäkerhet**: API-nycklar lagras i systemets nyckelring och kan sparas, rensas och verifieras med ett klick; lokala slutpunkter (llama.cpp / LM Studio / vLLM m.fl.) kan lämnas tomma
- **Referera aktuellt dokument**: när rutan är ikryssad används dokumentet som kontext, med konfigurerbar gräns (64K–512K / obegränsat) och antal kontextomgångar (0–20, standard 3)
- **Spara resultatet**: kopiera, infoga vid markören eller skapa ett nytt dokument med ett klick

### AI-färdigheter (Skill)

Knappen ⚡ i inmatningsfältet öppnar färdighetsmenyn; den valda färdighetstaggen infogas vid markören och prompten injiceras automatiskt i kontexten. Lägg `skills.json` + `.md`-promptar i katalogen `skills/` för att definiera egna. Fem färdigheter är inbyggda: ”Presentationsdisposition”, ”Dokumentsammanfattning”, ”Textpolering”, ”Översättning av hela texten”, ”Markdown-formatering”.

### Plugin

- **Kärnfunktioner är inbyggda**: KaTeX / Mermaid / fotnoter / att-göra-listor / TOC och liknande dokument-semantik påverkas inte av plugin-växlingar
- **Inbyggt plugin**: EPUB-export (aktiverat som standard och kan slås av på plugin-sidan; exportmenyn i verktygsfältet visas först när det är på)
- **Plugin-standard**: manifest (version / API-version / aktiveringstidpunkt / behörigheter / kapaciteter) → behörighetskontroll → lat aktivering → kapacitetsregistrering → nedmontering; den aktuella versionen laddar endast plugin som kompilerats in i appen

### Teman och utseende

- **15 inbyggda teman**: Liquid Glass Prism (standard), Akademiskt blått, Levande orange, Teknik, Minimalistisk, Tidskrift, Natur, Lychee-röd, Violett, Cyberpunk, Facebook, Matrix, Mint, Solnedgång, Retro skrivmaskin — varje med ljust och mörkt schema
- **Mörkt / ljust läge**: växlas med ett tangenttryck (`F2`)
- **Anpassade typsnitt**: separat typsnitt, storlek och radavstånd för källa och förhandsvisning
- **Anpassat tema**: skriv och spara CSS under Inställningar → Utseende → Anpassad CSS, och ett ”anpassat tema” skapas på basis av det aktuella temat — du kan klistra in ett helt nytt tema eller bara justera några färger; sparningen gäller omedelbart
- **Utbyggnad av teman**: lägg en `.css` i katalogen `themes/` och registrera parametrarna i `themes/theme.json`; den igenkänns efter omstart. Tokens och riktlinjer dokumenteras i `docs/THEME-DESIGN-SPEC.md`

### Språk och gränssnitt

- **16 gränssnittsspråk**: förenklad kinesiska (standard), traditionell kinesiska, English, 日本語, 한국어, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська, Русский
- Inställningar → Allmänt → Gränssnittsspråk växlar omedelbart; gränssnittstexter, genvägspanelen och plugin-beskrivningar följer språket
- **Automatisk anpassning vid första starten**: utan installationsspråk väljs språket efter systemets språk; om det inte finns i listan används English. Språkposterna har en engelsk `Language`-etikett, så de är snabba att hitta även i ett kinesiskt gränssnitt
- **Gränssnittsstorlek**: 80%–120% (standard 100%), skalar endast gränssnittstext och ikoner; panelstorlekar och dokumentinnehåll påverkas inte
- **Inställningspanel**: Allmänt, Utseende, Redigerare, Live-läge, AI-assistent, Moln, Plugin, Genvägar, Mallar, Dokumentation, Version och uppdateringar, Fler produkter — med omedelbar förhandsvisning

---

## Tangentbordsgenvägar

| Genväg | Funktion | Genväg | Funktion |
|--------|------|--------|------|
| Ctrl+N | Ny fil | Ctrl+B | Fet |
| Ctrl+O | Öppna fil | Ctrl+I | Kursiv |
| Ctrl+S | Spara fil | Ctrl+- | Genomstruken |
| Ctrl+Shift+S | Spara som | Ctrl++ | Inline-kod |
| Ctrl+W | Stäng flik | Ctrl+1 | Rubrik 1 |
| Ctrl+H | Exportera HTML | Ctrl+2 | Rubrik 2 |
| Ctrl+M | Exportera Markdown | Ctrl+3 | Rubrik 3 |
| Ctrl+Z | Ångra | Ctrl+. | Punktlista |
| Ctrl+Y | Gör om | Ctrl+0 | Numrerad lista |
| Ctrl+F | Sök | Ctrl+' | Citat |
| Ctrl+\ | Växla sidofält | Ctrl+K | Länk |
| F1 | Alla genvägar | Ctrl+` | Kodblock |
| F2 | Växla ljust/mörkt | Ctrl+T | Tabell |
| F3 | Växlar mellan de fyra redigeringslägena | Ctrl+L | Horisontell linje |
| F9 | Zen-läge (endast Källa / Live) | Ctrl+Alt+P | Presentationsläge (bildspel) |
| F11 | Växla fullskärm | Ctrl+Alt+R | Läsläge |
| Ins | Snedstrecksmeny | F12 | Utvecklarverktyg |

Genvägar kan anpassas i Inställningar → Genvägar: visuell bindning av 36 åtgärder, inspelning av tangenter, konfliktkontroll och återställning till standard.

---

## Katalogstruktur

Efter att ha packat upp den bärbara versionen:

```
YiziMarkdown/
├── YiziMarkdown.exe        # Huvudprogram
├── readme.md               # Projektbeskrivning (den här filen)
├── welcome.md              # Välkomstdokument
├── docs/                   # Dokumentation (THEME-DESIGN-SPEC.md, specifikation för temadesign m.m.)
├── user.css                # Användarens egna stilar
├── keybindings.json        # Tangentbordskonfiguration
├── themes/                 # Tema-CSS-filer
│   ├── liquidglass-prism.css # Liquid Glass Prism (standard)
│   ├── academic.css        # Akademiskt blått
│   ├── vibrant.css         # Levande orange
│   ├── tech.css            # Teknik
│   ├── minimal.css         # Minimalistisk
│   ├── magazine.css        # Tidskrift
│   ├── nature.css          # Natur
│   ├── lychee.css          # Lychee-röd
│   ├── violet.css          # Violett
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Mint
│   ├── sunset.css          # Solnedgång
│   └── typewriter.css      # Retro skrivmaskin
├── skills/                 # AI-färdigheter (Skill)
│   ├── skills.json         # Färdighetslista
│   ├── slides-outline.md   # Presentationsdisposition
│   ├── doc-summary.md      # Dokumentsammanfattning
│   ├── polish-writing.md   # Textpolering
│   ├── translate-fulltext.md # Översättning av hela texten
│   └── markdown-format.md  # Markdown-formatering
└── templates/              # Inbyggda dokumentmallar (synkroniseras till användarkatalogen vid första starten)
    ├── default.md          # Standardmall
    └── Slide-Template.md   # Presentationsmall
```

> Tips: AI-färdigheter och dokumentmallar lagras i själva verket i **användarkatalogen** — i Windows / macOS är det `~/Documents/yizimarkdown/skills/` och `.../templates/`; i Linux `yizimarkdown/` i XDG-dokumentkatalogen (t.ex. `~/Dokument/yizimarkdown/`), med `~/.local/share/yizimarkdown/` som reserv när systemet saknar dokumentkatalog. (Mapparna med samma namn i programkatalogen är inbyggda resurser som synkroniseras dit vid första starten.) Lägg eget innehåll i användarkatalogen så att uppgraderingar / ominstallationer aldrig skriver över det.

---

## Teknikstack

| Lager | Teknik |
|------|------|
| Skrivbordsramverk | Tauri 2 (Rust) |
| Frontend-ramverk | React 18 + TypeScript |
| Redigerarkärna | CodeMirror 6 |
| Tillståndshantering | Zustand (persist) |
| Styling | Tailwind CSS + CSS-variabler |
| Markdown-rendering | markdown-it |
| Internationalisering | Egen lättviktig i18n (16 språk) |
| AI-integration | Strömmande Rust-proxy (OpenAI / Anthropic / Ollama-protokoll) |
| Byggverktyg | Vite |

---

## Utveckling

### Krav

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Starta utvecklingsservern

```bash
cd code
npm install
npm run tauri:dev
```

### Linux-utvecklingsikon i dockan (valfritt)

Skrivbordsmiljöer som elementary / GNOME letar via fönstrets `WM_CLASS` efter en `.desktop`-fil med samma namn och dess `Icon`; ett utvecklingsbygge har inget installationspaket och därför ingen `.desktop`-fil, så dockan visar en allmän ikon (fönstrets egen `_NET_WM_ICON` sätts redan av Rust-sidan, och installerade versioner påverkas inte). Kör en gång:

```bash
npm run dev:icon           # skriver ~/.local/share/applications/yizimarkdown-dev.desktop
npm run dev:icon:remove    # ångrar
```

Starta sedan om utvecklingsfönstret, och dockan visar appens ikon.

### Bygg en release

**Windows**

```bash
npm run tauri:build
```

Artefakter:
- Portabel exe: `src-tauri/target/release/yizimarkdown.exe`
- NSIS-installationspaket: `src-tauri/target/release/bundle/nsis/`

Installationsprogram: vid första installationen väljs installationsspråk (16 alternativ: alla appens gränssnittsspråk plus brasiliansk portugisiska); guidexten och språket vid första starten efter installationen följer valet, och uppgraderingar / automatiska uppdateringar återställer aldrig det valda språket. Ikoner och grafik för sidofält / sidhuvud finns i `src-tauri/installer/`; när varumärkesfärgerna ändrats genereras de på nytt med `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1`.

Efter bygget kopierar du manuellt exe-filen och resursfilerna till katalogen `public/YiziMarkdown-vX.X.X/` för distribution.

**macOS (universellt binärpaket, Intel och Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artefakter:
- App-paket: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Installationspaket: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux (deb + AppImage)**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

Artefakter (**för närvarande endast amd64 / x86_64**; ARM-deb `arm64` och AppImage `aarch64` publiceras ännu inte):
- Debian-paket: `src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb` (cirka 16 MB, installeras i `/usr/bin`, registrerar menyval, ikon och filassociationer för `.md` / `.epub`)
- Portabel AppImage: `src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage` (cirka 100 MB, innehåller GTK / WebKit och GStreamer-mediekomponenter, körs med dubbelklick)

Obs: **bygg på Ubuntu 22.04**. Binärfiler byggda på 24.04 kräver glibc 2.39 och startar inte på Ubuntu 22.04 (2.35) / Debian 12 (2.36); `deb`-beroendet på `libwebkit2gtk-4.1-0` sätter samma golv (Debian 11 har bara webkit 4.0). `rpm` erbjuds inte: Fedora / openSUSE använder andra beroendenamn än Debian-systemen och skulle kräva separat underhåll.

### Projektstruktur

```
code/
├── src/                    # Frontend-källkod
│   ├── App.tsx             # Huvudkomponent för appen
│   ├── components/         # UI-komponenter
│   │   ├── Editor.tsx      # CodeMirror-redigerare + förhandsvisning
│   │   ├── Reader.tsx      # Läsläge (sidindelning / bläddring)
│   │   ├── Slideshow.tsx   # Presentationsläge
│   │   ├── TabBar.tsx      # Flikfält
│   │   ├── HomePage.tsx    # Startsida (senaste filer)
│   │   ├── Toolbar.tsx     # Verktygsfält
│   │   ├── Sidebar.tsx     # Sidofält (översikt + filbläddrare)
│   │   ├── StatusBar.tsx   # Statusfält längst ned
│   │   └── SettingsModal.tsx # Inställningspanel
│   ├── stores/             # Zustand-tillståndshantering
│   ├── lib/                # Verktygsbibliotek (Markdown-rendering, teman, Zen-läge m.m.)
│   └── styles/             # Globala stilar
├── src-tauri/              # Rust-backend
│   ├── src/main.rs         # Tauri-kommandon (fil-I/O, temaladdning, registret m.m.)
│   ├── icons/              # Appikoner
│   ├── themes/             # Tema-CSS (med theme.json-metadata)
│   └── templates/          # Dokumentmallar
├── docs/                   # Dokumentation (changelog / i18n-readmes på flera språk / THEME-DESIGN-SPEC.md)
└── package.json
```

---

## Version och uppdateringar

Windows-installationer stöder uppdateringar med ett klick i appen; macOS, Linux och den bärbara versionen kontrollerar `latest.json` vid start och visar en notis nere till höger när en ny version finns, med länk till rätt nedladdningssida (manuell ersättning, ingen automatisk installation; både Linux `deb` och `AppImage` använder denna väg).

---

## Licens

MIT
