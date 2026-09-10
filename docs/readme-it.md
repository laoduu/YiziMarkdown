# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)

[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)

**Sito ufficiale:** https://md.yizigpt.com

Un editor `Markdown` elegante e minimalista multipiattaforma, supporta versioni Windows portatili e macOS. Non richiede installazione, basta estrarre e utilizzare, unisce estetica e praticità. Windows può essere installato o scaricato come archivio zip per l'estrazione; macOS fornisce un programma di installazione binario universale che funziona nativamente su Intel e Apple Silicon.

Perché sviluppare un editor `Markdown`?

Molti editor `Markdown` sul mercato hanno un'interfaccia esteticamente scadente o sono troppo complessi e pesanti, rendendo difficile trovare uno strumento di modifica che sia semplice, bello e facile da usare.

Così è nato YiziMarkdown.

Abbiamo creato un'esperienza estremamente elegante per la modalità WYSIWYG; supporta anche capacità di presentazione rapide simili a PPT, permettendo di passare rapidamente dalla modalità di modifica a quella di presentazione per condividere e presentare documenti. Prova per credere.

---

## Caratteristiche

### Interfaccia multilingua

- **15 lingue dell'interfaccia**: Cinese semplificato (predefinito), Cinese tradizionale, Inglese, Giapponese, Coreano, Tedesco, Francese, Spagnolo, Portoghese, Italiano, Polacco, Turco, Svedese, Ucraino
- Impostazioni → Generale → Cambio lingua dell'interfaccia con un clic, efficace immediatamente; tutti i testi dell'interfaccia, i pannelli delle scorciatoie e le descrizioni dei plugin si sincronizzano con la lingua

### Assistente AI (Pannello chat laterale)

- **17 principali fornitori di modelli + servizio personalizzato**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen, Zhipu GLM, Moonshot Kimi, Volcano Engine, SiliconFlow, MiniMax, OpenRouter, OpenCode Go, Ollama (locale); il "Servizio personalizzato" supporta protocolli compatibili OpenAI/Anthropic, inserisci Base URL, ID modello e chiave, puoi connetterti a qualsiasi servizio di terze parti
- **Abilità AI (Skill)**: Clicca il pulsante ⚡ nella casella di input per aprire il menu abilità, dopo la selezione il tag dell'abilità viene inserito al cursore e il prompt viene automaticamente iniettato nel contesto; inserisci file `skills.json` + `.md` nella directory `skills/` per personalizzare le abilità. Abilità integrate: "Estrazione presentazione", "Riassunto documento", "Miglioramento scrittura"
- **Conversazione in streaming**: Clicca il pulsante robot nella barra degli strumenti per aprire il pannello AI destro, le risposte vengono generate in tempo reale in streaming, puoi fermarle in qualsiasi momento
- **Visualizzazione del processo di ragionamento**: Il contenuto del ragionamento del modello di ragionamento (reasoning/thinking) viene visualizzato in un blocco comprimibile, compresso predefinitamente, non influenzando la lettura del testo principale
- **Sicurezza delle chiavi**: Le chiavi API vengono salvate nel portachiavi del sistema (portachiavi OS), supportano salvataggio, cancellazione e verifica con un clic; le chiavi degli endpoint locali (llama.cpp / LM Studio / vLLM, ecc.) possono essere lasciate vuote
- **Riferimento al documento corrente**: Dopo aver spuntato, invia il documento corrente come contesto all'AI, puoi configurare il limite di riferimento (64K~512K/senza limite) e i cicli di contesto (0~20 cicli, predefinito 3 cicli)
- **Salvataggio risultati**: Le risposte possono essere copiate, inserite al cursore del documento o create come nuovo documento con un clic

### Modifica e anteprima

- **Modifica codice sorgente**: Nucleo CodeMirror 6, evidenziazione syntax, corris parentesi, completamento automatico
- **Modalità in tempo reale (WYSIWYG)**: Modifica WYSIWYG, nasconde automaticamente i marcatori Markdown durante la digitazione, concentrandosi sulla creazione di contenuti
- **Animazioni modalità in tempo reale**: 4 schemi di animazione per l'apparizione dei marcatori (Fuoco/Bagliore/Luce/Ondata), possono essere visualizzati e cambiati nelle impostazioni
- **Anteprima in tempo reale**: Markdown si rende mancano scrivi, supporta interattività checkbox elenco attività
- **Cinque modalità di visualizzazione**: Sorgente / Affiancata / In tempo reale (WYSIWYG) / Anteprima / Presentazione (slide a schermo intero), cambia con un clic
- **Sincronizzazione scroll guidata da outline**: Nella modalità affiancata, i pannelli sinistro e destro sono collegati bidirezionalmente, si posiziona automaticamente alla posizione corrente quando si cambia visualizzazione
- **Cerca e sostituisci**: Supporta navigazione corrispondenze, sostituisci tutto
- **Formato rapido barra strumenti**: Grassetto, corsivo, barrato, codice inline, avvolgi testo selezionato istantaneamente
- **Rendering immagini locali**: La modalità anteprima renderizza automaticamente immagini con percorso locale (jpg/png/gif/webp/svg/bmp)
- **Numeri di riga / A capo automatico**: Entrambi possono essere attivati/disattivati nelle impostazioni
- **Miglioramento blocchi codice**: Evidenziazione syntax (highlight.js), etichette lingua, pulsante copia, attivazione/disattivazione a capo automatico
- **Barra strumenti formato comprimibile**: Si comprime automaticamente quando la finestra non è sufficientemente larga, supporta espansione/compressione manuale
- **Filtro frontmatter**: Le modalità anteprima/affiancata/in tempo reale filtrano automaticamente il frontmatter YAML

### Formule matematiche e diagrammi

- **Formule KaTeX**: Plugin KaTeX integrato, formule LaTeX inline `$...$` e a blocco `$$...$$` si rendono in tempo reale
- **Diagrammi Mermaid**: Plugin Mermaid integrato, diagrammi di flusso, diagrammi di sequenza, diagrammi Gantt, diagrammi di classi, diagrammi a torta, ecc. si rendono automaticamente in grafici visivi, supporta molteplici configurazioni di temi
- **Selettore righe e colonne tabella**: Clicca il pulsante tabella nella barra strumenti per aprire una griglia 8×8, clicca per inserire una tabella con il numero corrispondente di righe e colonne

### Modalità presentazione (Slide)

- **Puro Markdown guidato**: Non richiede formati aggiuntivi, `---` (linea orizzontale) per la paginazione, il motore analizza l'intera struttura della pagina e seleziona automaticamente il layout
- **14 layout automatici**: Copertina, pagina capitolo, pagina finale, indice, contenuto, elenco, tabella dati, mappa percorsi, testo-immagine, immagine, citazione, codice, diagramma (mermaid), formula
- **Pagina contenuto allineata a sinistra + sottolineatura enfasi**: Titolo allineato in alto a sinistra con sottolineatura colore tema, testo corpo allineato a sinistra, lettura confortevole
- **Pagina citazione grandi virgolette diagonali**: Virgolette di apertura pendono in alto a sinistra, virgolette di chiusura pendono in basso a destra, contenuto verticalmente centrato
- **Istruzioni esplicite**: `<!-- layout: xxx -->` forza il layout, `<!-- align: left|center|right -->` allineamento pagina intera (commenti HTML, invisibili nel rendering)
- **Meta copertina**: Front matter fornisce `author`/`date`, la copertina viene visualizzata automaticamente
- **Pié di pagina e progresso**: Nome capitolo + numero pagina in basso a sinistra, barra di progresso colore tema in basso
- **Cambio pagina con rotella mouse**: Quando il contenuto è scorribile, scorri prima il contenuto, poi cambia pagina al confine
- **Eredità tema**: I colori dei titoli cambiano precisamente con il tema (tutti i 15 temi supportati), puoi cambiare tema/chiaro-scuro durante la presentazione
- **Attivazione schermo intero**: Tasto F schermo intero/ripristina, supporta l'ingresso affidabile da qualsiasi stato della finestra (normale/massimizzato)
- **Pulsante esci**: Pulsante esci semitrasparente appare nell'angolo in alto a destra quando il mouse è attivo, si nasconde automaticamente dopo 1,5 secondi di inattività
- **Ripristino stato finestra**: Ripristina automaticamente allo stato della finestra precedente all'ingresso (schermo intero/massimizzato/normale) quando esci dalla presentazione

### Sistema plugin

- Architettura a plugin, due plugin principali integrati KaTeX e Mermaid
- Pannello impostazioni pagina "Plugin" supporta controllo attivazione/disattivazione e configurazione plugin
- I plugin vengono caricati dinamicamente su richiesta, i plugin disattivati non consumano risorse

### Gestione multiplo file

- **Modalità istanza singola**: L'apertura di più file non avvia più finestre, si fonde automaticamente nell'istanza esistente, i file aperti ripetutamente si posizionano automaticamente nella scheda corrispondente
- **Barra schede**: Gestisce in alto più file aperti, cambia, chiudi, crea nuovo
- **Pagina principale**: Elenco file aperti di recente, include dimensione file e data di modifica
- **Indicatore stato salvataggio**: I file non salvati mostrano animazione punto pulsante, i file salvati mostrano animazione ✅ di conferma
- **Conferma chiusura**: I file non salvati chiedono conferma salva/non salva/annulla quando vengono chiusi

### Operazioni file

- **Apri**: Supporta .md / .markdown / .txt
- **Crea nuovo**: Crea scheda vuota, visualizza "Nuovo file senza nome"
- **Crea da modello**: Menu a tendina "Crea da modello" barra strumenti, crea nuovo documento basato sulla struttura Markdown del modello selezionato; puoi anche impostare il modello predefinito in Impostazioni → Generale, poi `Ctrl+N` lo applica automaticamente
- **Salva / Salvataggio automatico**: Salvataggio manuale + salvataggio automatico con intervallo configurabile (5~180 secondi, predefinito 60 secondi)
- **Salva con nome**: Mostra automaticamente la finestra di dialogo salva con nome quando salvi nuovi file
- **Esporta**: Tre formati HTML / Markdown / Testo semplice
- **Associazione file .md**: Impostalo come editor Markdown predefinito del sistema con un clic nelle impostazioni, doppio clic su .md per aprire direttamente (registro Windows / macOS LaunchServices)

### Personalizzazione aspetto

- **Quindici temi integrati**: Blu Accademico (predefinito), Arancio Vivace, Tecnologico, Minimalista, Rivista, Naturale, Vetro Liquido, Rosso Litchi, Viola, Cyberpunk, Facebook, Matrix, Menta, Tramonto, Macchina da scrivere retro, ogni tema ha schemi di colori chiaro e scuro
- **Modalità scura / chiara**: Ogni tema ha entrambi gli schemi di colori chiaro e scuro
- **Personalizzazione font**: Le modalità sorgente e anteprima possono impostare font, dimensione font e interlinea separatamente
- **CSS personalizzato**: `user.css` sovrascrive dopo tutti i temi, massima priorità
- **Estensione tema**: Inserisci file `.css` nella directory `themes/`, aggiungi parametri tema in `themes/theme.json`, riconosciuto automaticamente dopo il riavvio

### Altri

- **Modelli documento**: Inserisci file `.md` nella directory `templates/`, selezionabili quando crei nuovi documenti
- **Sistema scorciatoie**: Pannello configurazione visuale scorciatoie, supporta associazione personalizzata per 30 azioni, registrazione tasti, rilevamento conflitti e ripristino predefiniti
- **Pannello impostazioni**: Schede Generale, Aspetto, Editor, Modalità in tempo reale, AI, Plugin, Scorciatoie, Modelli, Info e altre, le impostazioni hanno effetto immediato

---

## Scorciatoie

| Scorciatoia | Funzione |
|-------------|----------|
| Ctrl+N | Crea nuovo file |
| Ctrl+O | Apri file |
| Ctrl+S | Salva file |
| Ctrl+Shift+S | Salva con nome |
| Ctrl+W | Chiudi scheda |
| Ctrl+H | Esporta HTML |
| Ctrl+M | Esporta Markdown |
| Ctrl+Z | Annulla |
| Ctrl+Y | Ripristina |
| Ctrl+F | Cerca |
| Ctrl+\ | Attiva/disattiva barra laterale |
| Ctrl+B | Grassetto |
| Ctrl+I | Corsivo |
| Ctrl+- | Barrato |
| Ctrl++ | Codice inline |
| Ctrl+1 | Titolo livello 1 |
| Ctrl+2 | Titolo livello 2 |
| Ctrl+3 | Titolo livello 3 |
| Ctrl+. | Elenco non ordinato |
| Ctrl+0 | Elenco ordinato |
| Ctrl+' | Citazione |
| Ctrl+K | Link |
| Ctrl+` | Blocco codice |
| Ctrl+T | Tabella |
| Ctrl+L | Linea orizzontale |
| F1 | Guida scorciatoie |
| F2 | Attiva/disattiva modalità scura/chiara |
| F3 | Cicla tra le viste |
| Ctrl+Alt+P | Modalità presentazione (slide) |
| Ins | Menu barra |
| F12 | Strumenti sviluppatore |

Le scorciatoie possono essere personalizzate in Impostazioni → Scorciatoie, supportano configurazione visuale e rilevamento conflitti.

---

## Struttura directory versione portatile

```
YiziMarkdown/
├── YiziMarkdown.exe        # Programma principale
├── readme.md               # Descrizione del progetto (questo file)
├── welcome.md              # Documento di benvenuto
├── changelog.md            # Registro sviluppo
├── user.css                # Stili personalizzati utente
├── keybindings.json        # Configurazione scorciatoie
├── themes/                 # File CSS temi
│   ├── academic.css        # Blu Accademico (predefinito)
│   ├── vibrant.css         # Arancio Vivace
│   ├── tech.css            # Tecnologico
│   ├── minimal.css         # Minimalista
│   ├── magazine.css        # Rivista
│   ├── nature.css          # Naturale
│   ├── liquidglass.css     # Vetro Liquido
│   ├── lychee.css          # Rosso Litchi
│   ├── violet.css          # Viola
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Menta
│   ├── sunset.css          # Tramonto
│   └── typewriter.css      # Macchina da scrivere retro
├── skills/                 # Abilità AI (Skill)
│   ├── skills.json         # Elenco abilità
│   ├── slides-outline.md   # Estrazione presentazione
│   ├── doc-summary.md      # Riassunto documento
│   └── polish-writing.md   # Miglioramento scrittura
└── templates/              # Modelli documento
    └── default.md          # Modello predefinito
```

---

## Stack tecnologico

| Livello | Tecnologia |
|---------|------------|
| Framework desktop | Tauri 2 (Rust) |
| Framework frontend | React 18 + TypeScript |
| Nucleo editor | CodeMirror 6 |
| Gestione stato | Zustand (persist) |
| Stili | Tailwind CSS + Variabili CSS |
| Rendering Markdown | markdown-it |
| Internazionalizzazione | i18n leggero personalizzato (15 lingue) |
| Integrazione AI | Proxy streaming Rust (protocolli OpenAI/Anthropic/Ollama) |
| Strumento build | Vite |

---

## Sviluppo

### Requisiti ambiente

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Avvia server sviluppo

```bash
cd code
npm install
npm run tauri:dev
```

### Compila versione release

**Windows**

```bash
npm run tauri:build
```

Artifact build:
- Exe portatile: `src-tauri/target/release/yizimarkdown.exe`
- Pacchetto installatore MSI: `src-tauri/target/release/bundle/msi/`
- Pacchetto installatore NSIS: `src-tauri/target/release/bundle/nsis/`

Dopo la compilazione, copia manualmente l'exe e i file risorse nella directory `public/YiziMarkdown-vX.X.X/` per la distribuzione.

**macOS (Binario universale, supporta sia Intel che Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artifact build:
- Bundle applicazione: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Pacchetto installatore: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### Struttura progetto

```
code/
├── src/                    # Codice sorgente frontend
│   ├── App.tsx             # Componente applicazione principale
│   ├── components/         # Componenti UI
│   │   ├── Editor.tsx      # Editor CodeMirror + anteprima
│   │   ├── TabBar.tsx      # Barra schede
│   │   ├── HomePage.tsx    # Pagina principale (file recenti)
│   │   ├── Toolbar.tsx     # Barra strumenti
│   │   ├── Sidebar.tsx     # Barra laterale (outline + file browser)
│   │   ├── StatusBar.tsx   # Barra stato in basso
│   │   └── SettingsModal.tsx # Pannello impostazioni
│   ├── stores/             # Gestione stato Zustand
│   ├── lib/                # Libreria utilità (rendering Markdown, ID titoli)
│   └── styles/             # Stili globali
├── src-tauri/              # Backend Rust
│   ├── src/main.rs         # Comandi Tauri (I/O file, caricamento temi, registro, ecc.)
│   ├── icons/              # Icone applicazione
│   ├── themes/             # CSS temi
│   └── templates/          # Modelli documento
└── package.json
```

---

## Licenza

MIT