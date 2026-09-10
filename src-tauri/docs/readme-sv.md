# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)

[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)

**Officiell webbplats:** https://md.yizigpt.com

En koncis och elegant plattformsoberoende `Markdown`-redigeringsprogram som stöder Windows-portabel och macOS-versioner. Ingen installation behövs, extrahera bara och använd, kombinerar skönhet med praktisk användning. Windows kan installeras eller laddas ner som zip-arkiv för extrahering; macOS erbjuder en universell binär installationsprogram som körs nativt på både Intel och Apple Silicon.

Varför utveckla en `Markdown`-redigeringsprogram?

Många `Markdown`-redigeringsprogram på marknaden har antingen dålig gränssnitt estetik eller är alltför komplexa och svulstiga, vilket gör det svårt att hitta ett redigeringsverktyg som är enkelt, vackert och lätt att använda.

Så föddes YiziMarkdown.

Vi har skapat en extremt elegant upplevelse för WYSIWYG-läge; det stöder också PPT-liknande snabb presentationsförmåga, vilket gör att skrivna anteckningar och dokument snabbt kan växla till presentationsläge för bekväm delning och rapportering. Prova det för att tro det.

---

## Funktionalitet

### Flerspråkigt gränssnitt

- **15 gränssnittsspråk**: Förenklad kinesisk (standard), Traditionell kinesisk, Engelska, Japanska, Koreanska, Tyska, Franska, Spanska, Portugisiska, Italienska, Polska, Nederländska, Turkiska, Svenska, Ukrainska
- Inställningar → Allmänt → Enklicksgränssnittsspråksväxling, omedelbart effektiv; all gränssnittstext, genvägspaneler och tilläggsbeskrivningar länkas med språk

### AI-assistent (Sidopanel för chatt)

- **17 stora modellleverantörer + anpassad tjänst**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen, Zhipu GLM, Moonshot Kimi, Volcano Engine, SiliconFlow, MiniMax, OpenRouter, OpenCode Go, Ollama (lokal); "Anpassad tjänst" stöder OpenAI-kompatibelt / Anthropic-kompatibelt protokoll, fyll i Base URL, modell-ID och nyckel själv, kan ansluta till tredjepartstjänster
- **AI-färdigheter (Skill)**: Klicka på ⚡-knappen i inmatningsrutan för att visa färdighetsmenyn, efter val infogas färdighetstaggen vid markören och prompten injiceras automatiskt i kontexten; lägg till `skills.json` + `.md`-promptfiler i `skills/`-katalogen för att anpassa färdigheter. Inbyggda "Presentation Outlining", "Dokumentsammanfattning", "Skrivpolering" 3 färdigheter
- **Strömmande konversation**: Klicka på robotknappen i verktygsfältet för att öppna högra AI-panelen, svar exporteras i realtid strömmande, kan stoppa när som helst
- **Tänkprocessvisning**: Resoneringsmodellens tänkande (reasoning/thinking) visas i ett vikbart block, standardvikt, påverkar inte huvudtextläsning
- **Nyckelsäkerhet**: API-nycklar lagras i systemnyckelkedjan (OS-nyckelkedja), stöder enklicks-spara, rensa och verifiera; lokala ändpunkter (llama.cpp / LM Studio / vLLM osv.) nycklar kan lämnas tomma
- **Referens aktuellt dokument**: Efter kontroll skicka det aktuella dokumentet som kontext till AI, kan konfigurera referensgräns (64K~512K/obegränsad) och kontextrundor (0~20 rundor, standard 3 rundor)
- **Resultatarkivering**: Svar kan kopieras, infogas vid dokumentmarkören, eller skapas som nytt dokument med ett klick

### Redigering och förhandsgranskning

- **Källkodsredigering**: CodeMirror 6-kärna, syntaxmarkering, parentesmatchning, automatisk komplettering
- **Realtidsläge (WYSIWYG)**: What you see is what you get redigering, döljer automatiskt Markdown-markeringar vid inmatning, fokuserar på innehållsskapande
- **Realtidslägeanimationer**: 4 markörförekomstanimationsmetoder (Fokus/Blixt/Glöd/Gropar), kan förhandsgranska och växla i inställningar
- **Realtidsförhandsgranskning**: Markdown renderas medan du skriver, stöder interaktiva uppgiftslistor checkboxar
- **Fem vytyper**: Källa / Sida vid sida / Realtid (WYSIWYG) / Förhandsgranskning / Presentation (helskärmsbilder), växla med ett klick
- **Disposition驱动ad scrollningssynkronisering**: I sida-v-sida-läge vänster och höger paneler tvåriktning länkade, positionerar automatiskt till aktuell plats vid växling av vyer
- **Sök och ersätt**: Stöder matchningsnavigering, ersätt alla
- **Verktygsfält snabb formatering**: Fetstil, kursiv, genomstrykning, inline-kod, omsluter markerad text omedelbart
- **Lokal bildrendering**: Förhandsgranskningläge renderar automatiskt lokala sökvägsbilder (jpg/png/gif/webp/svg/bmp)
- **Radnummer / Ordbrytning**: Båda kan växlas i inställningar
- **Kodblocksförbättring**: Syntaxmarkering (highlight.js), språketiketter, kopieringsknapp, ordbrytningsväxling
- **Formateringsverktygsfält vikning**: Viker automatiskt när fönsterbredden är otillräcklig, stöder manuell expandering/vikning
- **Frontmatterfiltrering**: Förhandsgranskning/sida-v-sida/realtidsläge filtrerar automatiskt YAML frontmatter

### Matematikformler och diagram

- **KaTeX-formler**: Inbyggda KaTeX-tillägget, inline `$...$` och block `$$...$$` LaTeX-formler renderas i realtid
- **Mermaid-diagram**: Inbyggda Mermaid-tillägget, flödesscheman, sekvensdiagram, Gantt-diagram, klassdiagram, cirkeldiagram osv. renderas automatiskt till visuella diagram, stöder flera temaconfigurationer
- **Tabellrad och kolumnväljare**: Klicka på tabellknappen i verktygsfältet för att öppna ett 8×8 nät, klicka för att infoga en tabell med motsvarande rader och kolumner

### Presentationsläge (bilder)

- **Rent Markdown-drivet**: Inget extra format behövs, `---` (horisontell linje) för sidbrytning, motorn analyserar hela sidans struktur och väljer automatiskt layout
- **14 automatiska layouter**: Omslag, kapitelsida, avslutningssida, innehållsförteckning, innehåll, lista, datatabell, vägkarta, text-bild, bild, citat, kod, diagram (mermaid), formel
- **Innehållssida vänsterjusterad + betoning understreck**: Rubrik övre vänsterjusterad med tema understreck, brödtext vänsterjusterad, bekväm läsning
- **Citatsida diagonal stor anföringstecken**: Öppningsanföringstecken hänger övre vänster, slutningsanföringstecken hänger undre höger, innehåll vertikalt centrerat
- **Explicita instruktioner**: `<!-- layout: xxx -->` tvingar layout, `<!-- align: left|center|right -->` helsida justering (HTML-kommentarer, osynliga i rendering)
- **Omslagsmeta**: Front matter ger `author`/`date`, omslag visas automatiskt
- **Sidfot och framsteg**: Undre vänster kapitelnamm + sidnummer, undre tema färg framstegsindikator
- **Mushjul sidbläddring**: När innehåll är scrollningsbart, scrolla innehåll först, vid gräns bläddra sedan sida
- **Ärvt tema**: Rubrikfärger ändras exakt med tema (alla 15 tema stöds), kan växla tema/ljust-mörkt under presentation
- **Helskärmsväxling**: F-tangent helskärm/återställ, stöder tillförlitlig entry från valfritt fönsterläge (normalt/maximerat)
- **Avslutningsknapp**: Halvtransparent avslutningsknapp visas i övre högra hörnet när musen är aktiv, döljs automatiskt efter 1,5 sekunders inaktivitet
- **Fönsterläge återställ**: Återställer automatiskt till fönsterläget innan entry vid avslutning av presentation (helskärm/maximerat/normalt)

### Tilläggssystem

- Tilläggsarkitektur, inbyggda KaTeX och Mermaid två kärntillägg
- Inställningspanelen "Tillägg"-sida stöder aktivering/avaktivering och tilläggsconfiguration
- Tillägg laddas dynamiskt vid behov, inaktiverade tillägg förbrukar inte resurser

### Multifilhantering

- **Enstaka instansläge**: Att öppna flera filer startar inte längre flera fönster, fusionerar automatiskt till befintlig instans, upprepade öppnade filer lokaliserar automatiskt till motsvarande flik
- **Flikfält**: Övre hanterar flera öppnade filer, växla, stänga, skapa nya
- **Hemsida**: Senast öppnade fillista, inklusive filstorlek och ändringstid
- **Sparningsindikator**: Osparade filer visar andningsdotanimering, sparade filer visar ✅ bekräftelseanimering
- **Stängningsbekräftelse**: Osparade filer frågar spara / inte spara / avbryt bekräftelse vid stängning

### Filoperationer

- **Öppna**: Stöder .md / .markdown / .txt
- **Skapa ny**: Skapa blank flik, visar "Namnlös ny fil"
- **Skapa från mall**: Verktygsfältet "Skapa från mall" dropdown-meny, skapar nytt dokument baserat på vald malls Markdown-struktur; kan också ställa in standardmall i Inställningar → Allmänt, sedan `Ctrl+N` tillämpar automatiskt
- **Spara / Automatisk sparning**: Manuell sparning + konfigurerbar intervall automatisk sparning (5~180 sekunder, standard 60 sekunder)
- **Spara som**: Visar automatiskt dialogruta för spara som vid sparning av nya filer
- **Exportera**: HTML / Markdown / Ren text tre format
- **.md-fil association**: Enklicksställ in som systemstandard Markdown-redigeringsprogram i inställningar, dubbelklicka på .md för att öppna direkt (Windows-register / macOS LaunchServices)

### Utseendeanpassning

- ** femton inbyggda teman**: Akademiskt blå (standard), Dynamisk orange, Tekniskt, Minimalistiskt, Magasin, Natur, Vätske glas, Litchi röd, Viol, Cyberpunk, Facebook, Matrix, Mint, Solnedgång, Retro skrivmaskin, varje med ljust och mörkt färgschema
- **Mörkt / Ljust läge**: Varje tema har både ljust och mörkt färgschema
- **Typsnittsanpassning**: Källa och förhandsgranskningläge kan ställa in typsnitt, teckensnittstorlek, radavstånd separat
- **Anpassad CSS**: `user.css` åsätter efter alla teman, högsta prioritet
- **Temaexpansion**: Lägg till `.css`-filer i `themes/`-katalogen, lägg till temaparametrar i `themes/theme.json`, känns automatiskt igen efter omstart

### Övrigt

- **Dokumentmallar**: Lägg till `.md`-filer i `templates/`-katalogen, kan väljas vid skapande av ny
- **Genvägssystem**: Visuellt genvägspanel, stöder anpassad bindning för 30 åtgärder, tangentinspelning, konfliktupptäckning och återställning till standard
- **Inställningspanelen**: Allmänt, Utseende, Redigerare, Realtidsläge, AI, Tillägg, Genvägar, Mallar, Om och andra flikar, inställningar träder i kraft omedelbart

---

## Genvägar

| Genväg | Funktion |
|--------|----------|
| Ctrl+N | Skapa ny fil |
| Ctrl+O | Öppna fil |
| Ctrl+S | Spara fil |
| Ctrl+Shift+S | Spara som |
| Ctrl+W | Stäng flik |
| Ctrl+H | Exportera HTML |
| Ctrl+M | Exportera Markdown |
| Ctrl+Z | Ångra |
| Ctrl+Y | Gör om |
| Ctrl+F | Sök |
| Ctrl+\ | Växla sidopanel |
| Ctrl+B | Fetstil |
| Ctrl+I | Kursiv |
| Ctrl+- | Genomstrykning |
| Ctrl++ | Inline-kod |
| Ctrl+1 | Rubrik 1 |
| Ctrl+2 | Rubrik 2 |
| Ctrl+3 | Rubrik 3 |
| Ctrl+. | Oordnad lista |
| Ctrl+0 | Ordning lista |
| Ctrl+' | Citat |
| Ctrl+K | Länk |
| Ctrl+` | Kodblock |
| Ctrl+T | Tabell |
| Ctrl+L | Horisontell linje |
| F1 | Genvägsguide |
| F2 | Växla mörkt/ljust läge |
| F3 | Cykla genom vyer |
| Ctrl+Alt+P | Presentationsläge (bilder) |
| Ins | Skreckmeny |
| F12 | Utvecklarverktyg |

Genvägar kan anpassas i Inställningar → Genvägar, stöder visuell configuration och konfliktupptäckning.

---

## Portabel versionskatalogstruktur

```
YiziMarkdown/
├── YiziMarkdown.exe        # Huvudprogram
├── readme.md               # Projekbeskrivning (den här filen)
├── welcome.md              # Välkomstdokument
├── changelog.md            # Utvecklingslogg
├── user.css                # Anpassade stilar
├── keybindings.json        # Genvägsconfiguration
├── themes/                 # Tema CSS-filer
│   ├── academic.css        # Akademiskt blå (standard)
│   ├── vibrant.css         # Dynamisk orange
│   ├── tech.css            # Tekniskt
│   ├── minimal.css         # Minimalistiskt
│   ├── magazine.css        # Magasin
│   ├── nature.css          # Natur
│   ├── liquidglass.css     # Vätske glas
│   ├── lychee.css          # Litchi röd
│   ├── violet.css          # Viol
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Mint
│   ├── sunset.css          # Solnedgång
│   └── typewriter.css      # Retro skrivmaskin
├── skills/                 # AI-färdigheter (Skill)
│   ├── skills.json         # Färdighetslista
│   ├── slides-outline.md   # Presentation Outlining
│   ├── doc-summary.md      # Dokumentsammanfattning
│   └── polish-writing.md   # Skrivpolering
└── templates/              # Dokumentmallar
    └── default.md          # Standardmall
```

---

## Teknisk stapel

| Lager | Teknologi |
|-------|-----------|
| Skrivbordsramverk | Tauri 2 (Rust) |
| Frontend-ramverk | React 18 + TypeScript |
| Redigerarkärna | CodeMirror 6 |
| Tillståndshantering | Zustand (persist) |
| Stilalternativ | Tailwind CSS + CSS-variabler |
| Markdown-rendering | markdown-it |
| Internationalisering | Egen lättviktig i18n (15 språk) |
| AI-integration | Rust strömmande proxy (OpenAI/Anthropic/Ollama-protokoll) |
| Byggverktyg | Vite |

---

## Utveckling

### Miljökrav

- Node.js 18+
- Rust (stabil)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Starta utvecklingsserver

```bash
cd code
npm install
npm run tauri:dev
```

### Bygg releasversion

**Windows**

```bash
npm run tauri:build
```

Byggprodukter:
- Portabel exe: `src-tauri/target/release/yizimarkdown.exe`
- MSI-installationsprogram: `src-tauri/target/release/bundle/msi/`
- NSIS-installationsprogram: `src-tauri/target/release/bundle/nsis/`

Bygg kopierar manuellt exe och resursfiler till `public/YiziMarkdown-vX.X.X/`-katalogen för distribution.

**macOS (Universell binär, stöder både Intel och Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Byggprodukter:
- Applikationspaket: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Installationsprogram: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### Projektstruktur

```
code/
├── src/                    # Frontend-källkod
│   ├── App.tsx             # Huvudapplikationskomponent
│   ├── components/         # UI-komponenter
│   │   ├── Editor.tsx      # CodeMirror-redigerare + förhandsgranskning
│   │   ├── TabBar.tsx      # Flikfält
│   │   ├── HomePage.tsx    # Hemsida (senaste filer)
│   │   ├── Toolbar.tsx     # Verktygsfält
│   │   ├── Sidebar.tsx     # Sidopanel (disposition + filbläddrare)
│   │   ├── StatusBar.tsx   # Undre statusfält
│   │   └── SettingsModal.tsx # Inställningspanel
│   ├── stores/             # Zustand-tillståndshantering
│   ├── lib/                # Verktygsbibliotek (Markdown-rendering, rubrik-ID)
│   └── styles/             # Globala stilar
├── src-tauri/              # Rust-backend
│   ├── src/main.rs         # Tauri-kommandon (fil-I/O, tema laddning, register osv.)
│   ├── icons/              # Applikationsikoner
│   ├── themes/             # Tema CSS
│   └── templates/          # Dokumentmallar
└── package.json
```

---

## Licens

MIT
