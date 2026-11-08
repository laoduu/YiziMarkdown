# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](../../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md) | [Русский](./readme-ru.md)

**Sito ufficiale:** https://md.yizigpt.com

YiziMarkdown è un editor Markdown multipiattaforma incentrato sulla scrittura. Lo stesso file `.md` offre sette modalità di presentazione: `modifica sorgente`, `rilettura affiancata`, `scrittura in tempo reale`, `anteprima finale`, `presentazione a diapositive`, `lettura in stile libro` e una `modalità zen` che lascia solo il testo, per concentrarsi sulla scrittura.

- **Windows**: installabile (pacchetto NSIS con aggiornamento in-app in un clic) oppure archivio portatile da estrarre e avviare
- **macOS**: pacchetto universal binary, nativo sia su Intel sia su Apple Silicon
- **Linux**: `deb` per Debian e `AppImage` senza installazione (Ubuntu 22.04+ / Debian 12+, per ora solo amd64)

Perché sviluppare un altro editor Markdown? Le alternative in circolazione sono o poco gradevoli alla vista o sovraccariche di funzioni, ed è difficile trovarne una che unisca semplicità, bellezza e facilità d'uso. Così è nato YiziMarkdown, con tre convinzioni: **un'interfaccia curata**, **funzioni potenti**, **scenari d'uso molteplici**.

Ecco quindi il `YiziMarkdown` di oggi: `3 sistemi coperti`, `7 modalità d'uso`, `16 lingue dell'interfaccia`, `15 temi chiaro/scuro`, `5 AI Skill`, `7 formati di esportazione`, e in più funzioni originali come l'assistente IA integrato e l'archiviazione cloud, oltre a documentazione aperta su temi, skill e presentazioni, con cui potete costruire esperienze d'uso davvero fuori dal comune.

Non è più un semplice editor Markdown, ma un'applicazione polivalente che copre davvero i vostri scenari documentali: creazione, lavoro e vita quotidiana.

---

## Sette modalità: un documento, sette presentazioni

Il valore di Markdown non sta solo nella scrittura, ma anche in chi lo legge e in come lo si mostra. YiziMarkdown offre sette presentazioni dello stesso documento: le prime quattro sono viste di modifica, che alternano sorgente e risultato; le ultime tre sono scenari autonomi, che trasformano il documento in diapositive, in pagine di libro o lo riducono al solo testo.

| Modalità | In una frase | Accesso | Ideale per |
|------|-----------|------|---------|
| Sorgente | Modificare direttamente il Markdown originale | `F3` / pulsanti vista | Rifinire la struttura, sostituzioni in blocco, modificare il frontmatter |
| Affiancato | Scrivi a sinistra, confronti subito a destra | `F3` / pulsanti vista | Correggere l'impaginazione, scrivere seguendo un modello |
| In tempo reale | WYSIWYG, i marcatori si nascondono da soli | `F3` / pulsanti vista | Scrittura di testi lunghi, scrittura concentrata |
| Anteprima | Mostra solo l'impaginazione finale | `F3` / pulsanti vista | Controllare il risultato, rileggere tutto |
| Presentazione | Il documento proiettato così com'è in diapositive | `Ctrl+Alt+P` / barra strumenti | Condividere, relazionare, insegnare |
| Lettura | Il documento composto come un libro sfogliabile | `Ctrl+Alt+R` / barra strumenti | Letture lunghe, EPUB, lettura immersiva |
| Zen | Sparisce tutta l'interfaccia, resta il testo | `F9` / barra strumenti | Scrittura profonda |

`F3` cicla tra Sorgente / Affiancato / In tempo reale / Anteprima; presentazione, lettura e zen hanno ingressi indipendenti e non entrano in conflitto.

---

## Markdown: quattro capacità in una

![Quattro modalità a confronto](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

Sorgente, affiancato, tempo reale e anteprima condividono lo stesso motore di editing e lo stesso set di capacità Markdown; cambia solo la densità d'informazione: dai marcatori completamente esposti al risultato completamente impaginato. Si può passare da una all'altra in qualsiasi momento, e la vista mantiene il più possibile la posizione corrente.

### Modalità sorgente: vedere tutto ciò che serve

- Motore CodeMirror 6: evidenziazione della sintassi, abbinamento delle parentesi, completamento automatico
- Numeri di riga e ritorno a capo attivabili separatamente; ideale per ritocchi riga per riga e riscritture in blocco
- Il frontmatter YAML è mostrato così com'è: per modificare i metadati non serve indovinare il formato
- Tabelle, blocchi di codice e formule restano in forma sorgente: la scelta più controllabile con strutture complesse

### Modalità affiancata: scrivere e confrontare

- Sorgente a sinistra, anteprima a destra, aggiornata a ogni digitazione
- Lo scorrimento sincronizzato è guidato dall'indice; cambiando vista si torna alla posizione corrente
- Ideale per correggere l'impaginazione o ristrutturare un documento esistente

### Modalità in tempo reale: quello che vedi è quello che ottieni

- I marcatori Markdown si nascondono durante la digitazione e ricompaiono quando il cursore si allontana, per restare sul contenuto
- 4 animazioni di comparsa dei marcatori (focus / lampo / bagliore / increspatura), con anteprima e scelta nelle impostazioni
- Il frontmatter YAML viene reso come pannello di proprietà modificabile in stile Obsidian: 7 tipi (auto / testo / numero / casella di controllo / data / data e ora / elenco), con il tipo memorizzato globalmente per nome di proprietà

### Modalità anteprima: solo il risultato

- Markdown reso mentre scrivi, le caselle degli elenchi di attività sono cliccabili
- Immagini da percorso locale, immagini remote e SVG rese automaticamente (jpg / png / gif / webp / svg / bmp)
- Il frontmatter è nascosto automaticamente: quello che vedi è l'impaginazione finale

### Capacità condivise dalle quattro viste

- **Cerca e sostituisci**: navigazione tra le occorrenze, sostituzione totale
- **Formattazione dalla barra strumenti**: grassetto, corsivo, barrato, codice in linea, applicati subito alla selezione
- **Blocchi di codice arricchiti**: evidenziazione highlight.js, etichetta della lingua, pulsante di copia, attivazione del ritorno a capo
- **Selettore di tabelle**: griglia 8×8 da cui scegliere, numero di righe e colonne visibile a colpo d'occhio, aggiunta e rimozione di righe e colonne, menu contestuale completo con il tasto destro
- **Formule e diagrammi**: KaTeX in linea `$...$` / in blocco `$$...$$`, diagrammi Mermaid di flusso, di sequenza, di Gantt, delle classi, a torta e altri, con colori che seguono il tema
- **Barra di formattazione comprimibile**: si ripiega quando la finestra si stringe, e si può riaprire anche a mano
- **Numeri di riga e ritorno a capo**: attivabili nelle impostazioni
- **Navigazione dall'indice**: la gerarchia dei titoli viene dal documento ed è sincronizzata con la posizione di scorrimento

---

## Modalità presentazione: le note diventano diapositive in un clic

![Modalità presentazione](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

Non serve più esportare le note in PPT: con lo skill dell'assistente IA integrato, un clic le condensa in una versione presentazione; passando alla modalità presentazione, il documento diventa subito una proiezione a schermo intero. Paginazione, colonne e layout sono dedotti automaticamente dalla struttura Markdown; per un controllo esatto si usano le direttive nei commenti HTML.

### Il contenuto è la diapositiva

- Nessun formato aggiuntivo: `---` (riga orizzontale) cambia diapositiva
- Un `***` da solo su una riga divide la diapositiva in colonne, fino a 4
- Il motore analizza la struttura della pagina e sceglie il layout: titoli, elenchi, tabelle, codice, immagini e diagrammi hanno ciascuno il proprio

### 14 layout

Copertina, pagina di capitolo, pagina finale, indice, contenuto, elenco, tabella dati, roadmap, testo + immagine, immagine, citazione, codice, diagramma (Mermaid), formula.

- Tranne «testo + immagine», che richiede `<!-- layout: figure -->` esplicito, tutti i layout sono dedotti dal contenuto
- Le pagine di contenuto sono allineate a sinistra, con il titolo sottolineato nel colore del tema
- Le pagine citazione hanno grandi virgolette in diagonale: apertura in alto a sinistra, chiusura in basso a destra, contenuto centrato verticalmente
- La copertina legge `author` / `date` dal front matter

### Controllo tipografico durante la proiezione

- Regolazioni HUD: font (segui il tema / senza grazie / con grazie / monospazio), peso, corpo, larghezza e altezza dell'area di contenuto (50%–95%)
- Le modifiche si applicano in tempo reale e restano valide per la proiezione successiva
- Il codice in linea troppo lungo va a capo invece di essere tagliato dal bordo della pagina
- Direttive esplicite: `<!-- layout: xxx -->` forza il layout, `<!-- align: left|center|right -->` allinea l'intera pagina

### Proiezione e navigazione

- Nome del capitolo in basso a sinistra + numero di pagina, barra di avanzamento nel colore del tema in basso
- `T` apre il pannello dell'indice; `G` o il campo in basso permette di saltare a una pagina
- La rotellina del mouse cambia pagina: prima scorre il contenuto, alla fine cambia pagina
- `F` schermo intero / ripristino, da qualsiasi stato della finestra, normale o massimizzata
- All'uscita viene ripristinato lo stato precedente della finestra; il pulsante di uscita in alto a destra scompare dopo 1,5 s di inattività
- Ereditarietà del tema: i colori dei titoli seguono il tema, e durante la proiezione si possono comunque cambiare tema e chiaro/scuro

---

## Modalità lettura: il documento composto come un libro sfogliabile

![Modalità lettura](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

La modalità lettura non è un «anteprima a schermo intero»: il testo viene davvero impaginato in pagine fisse, con copertina, frontespizio, indice, numeri di pagina, carta ed effetti di sfogliamento.

- Accesso: pulsante libro nella barra strumenti o `Ctrl+Alt+R`; `Esc` esce e ripristina la vista precedente
- Impaginazione: un bordo sottile con margini uguali racchiude le pagine, le due pagine si uniscono con un'unica linea centrale; titolo del libro in alto a sinistra, capitolo / numero di pagina in basso a sinistra, HUD in basso a destra, nelle stesse posizioni della modalità presentazione
- Copertina, frontespizio e indice generati automaticamente: il titolo viene dal `title` del front matter o dal primo H1, l'indice è costruito dai titoli con i numeri di pagina e viene spezzato da solo quando è troppo lungo
- Impaginazione reale: doppia pagina affiancata (pagina singola nelle finestre strette), con numeri di pagina e avanzamento della lettura

### Animazioni di sfogliamento

4 opzioni, scelte nelle impostazioni, scorrimento orizzontale per impostazione predefinita:

- **Scorrimento orizzontale** (predefinito): la pagina intera trasla, netto e rapido
- **Sfogliamento 3D**: il foglio si solleva dall'angolo in basso a destra e si piega attorno alla linea centrale, con sollevamento della pagina, luce e ombra (attorno al dorso in modalità pagina singola)
- **Dissolvenza** / **Zoom**: transizioni più discrete

Premere più volte non fa mai saltare pagine; i salti da indice, numeri di pagina e note non riproducono alcuna animazione.

### Regole di impaginazione a livello di pagina

I paragrafi si spezzano per riga, i titoli non restano mai soli, le intestazioni di tabella si ripetono nella pagina successiva, i blocchi di codice proseguono riga per riga, gli elenchi voce per voce, le immagini intere si ridimensionano in proporzione; i paragrafi del corpo ricevono un rientro di due caratteri alla prima riga, non ripetuto nelle pagine successive.

### Navigazione e dettagli

- Pannello dell'indice: `T` per aprirlo, titoli elencati per livello con il numero di pagina, un clic per andarci
- `G` o il campo del numero di pagina salta alla pagina indicata
- Andata e ritorno delle note: cliccando un richiamo si va alla pagina della definizione, evidenziata, con un pulsante «torna al richiamo»; anche i collegamenti interni saltano pagina per pagina
- HUD di lettura: in basso a destra, chiaro/scuro, tema, font (tema / con grazie / senza grazie / monospazio), corpo e interlinea, validi solo per questa sessione di lettura
- Memoria della posizione: pagina / capitolo memorizzati per documento e ripristinati al rientro
- Comandi: frecce, PageUp / PageDown, spazio, rotellina, e clic sul bordo sinistro o destro della pagina

### EPUB

Aprendo un `.epub` si entra direttamente in modalità lettura: si usa il tema di lettura dell'applicazione (il CSS dell'editore viene ignorato) e vengono letti la copertina incorporata, l'indice di navigazione, le immagini, le formule, gli SVG Mermaid, le note e i link tra capitoli. Gli EPUB con DRM e a impaginazione fissa (fumetti / libri illustrati) non sono ancora supportati.

---

## Modalità zen: resta solo il testo

![Modalità zen](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

Si entra con `F9` o con il pulsante zen nella barra strumenti. Barra strumenti, barra delle schede, pannello laterale, pannello IA e barra di stato si ripiegano verso i bordi dello schermo e svaniscono a strati, lasciando solo il testo; tutto questo **senza cambiare il layout**, il testo non si sposta di un solo pixel.

- **Il mondo c'è ancora**: avvicinando il puntatore a un qualsiasi bordo dello schermo (alto / sinistra / destra / basso) l'area corrispondente riappare sul posto; si ritira circa 1,2 s dopo che il puntatore si allontana
- **Un interruttore permanente**: il pulsante zen non scompare e resta al suo posto (con un leggerissimo alone pulsante tutt'intorno), sia come ancora dello stato «sei in modalità zen» sia come via d'uscita; anche `F9` / `Esc` escono
- **Al servizio della sola scrittura**: disponibile solo in sorgente / tempo reale; passando alla modalità affiancata o all'anteprima, o entrando in lettura / presentazione, si esce automaticamente
- **Una superficie più pulita**: numeri di riga e linee verticali della barra laterale nascosti, vignettatura molto tenue, puntatore nascosto dopo 2 s di immobilità; la barra di scorrimento verticale diventa una sottilissima linea che appare durante lo scorrimento o vicino al bordo destro

---

## File e scrittura

### File e schede multiple

- **Apertura**: `.md` / `.markdown` / `.txt` / `.epub`, con gli EPUB che entrano subito in modalità lettura
- **Modalità istanza singola**: più file aperti confluiscono nella finestra esistente, e un file già aperto viene portato sulla scheda corrispondente
- **Barra delle schede**: cambio, chiusura, creazione, riordino tramite trascinamento
- **Pagina iniziale**: elenco dei file recenti, con dimensione e data di modifica
- **Stato di salvataggio**: punto pulsante per i file non salvati, animazione ✅ dopo il salvataggio
- **Conferma di chiusura**: salva / non salvare / annulla in caso di modifiche non salvate

### Nuovi documenti e modelli

- Una nuova scheda vuota mostra «Nuovo file senza titolo»
- Il menu «Nuovo da modello» della barra strumenti crea un documento dalla struttura Markdown del modello; si può definire un modello predefinito in Impostazioni → Generali, dopodiché `Ctrl+N` lo applica automaticamente
- I modelli risiedono nella cartella utente: basta inserirvi file `.md`, oppure crearli e modificarli in Impostazioni → Modelli

### Incollare e diventa Markdown

Il testo formattato copiato da pagine web, Word / DOCX, Google Docs, Notion e simili viene convertito in memoria in Markdown pulito (titoli / elenchi / tabelle / codice / citazioni / link); una sorgente Markdown già esistente e il testo semplice vengono incollati così come sono.

### Salvataggio ed esportazione

- **Salva / salvataggio automatico**: salvataggio manuale + intervallo configurabile (5–180 s, 60 s predefiniti)
- **Salva con nome**: al salvataggio di un nuovo file si apre automaticamente la finestra «Salva con nome»
- **Esportazione**: HTML / Markdown / testo semplice / Word (DOCX) / PDF / PPTX / EPUB
  - DOCX usa la semantica nativa di Word (elenchi, tabelle, blocchi di codice, citazioni, elenchi di attività), allinea lo stile delle tabelle all'anteprima e supporta immagini da percorso locale, immagini remote e HTML `<img>` (`width` per controllare la larghezza)
  - PDF mantiene la stessa resa dell'anteprima e impagina automaticamente
  - HTML include una scheda indice flottante a sinistra, con un clic che porta alla sezione (il PDF non ha pannello laterale)
  - PPTX eredita tema, chiaro/scuro e layout della modalità presentazione e produce testo, tabelle, immagini, forme ed equazioni native modificabili
  - EPUB è fornito dal plugin integrato; prima dell'esportazione si possono scegliere suddivisione per capitolo / copertina / indice visibile / tema di lettura / informazioni del documento
- **Associazione dei file `.md`**: impostare YiziMarkdown come editor Markdown predefinito del sistema con un clic nelle impostazioni (registro di Windows / LaunchServices di macOS)

### Archiviazione cloud (WebDAV)

- **Browser dei file**: la scheda «Cloud» della barra laterale esplora l'albero delle cartelle del server — apre documenti, crea file / cartelle, rinomina, sposta, elimina; i percorsi profondi si comprimono in «…» con un menu a discesa, e le cartelle si caricano livello per livello
- **Salvataggio nel cloud**: caricamento in un clic di un documento locale, con le immagini referenziate tramite percorsi relativi incluse e la struttura delle cartelle conservata; `Ctrl+S` riscrive direttamente i documenti cloud
- **Protezione dai conflitti**: l'ETag viene confrontato prima del salvataggio; se un altro dispositivo ha modificato il file remoto, una finestra propone «sovrascrivi la versione sul server» o «abbandona le modifiche locali e ricarica», mai una sovrascrittura silenziosa
- **Sicurezza delle credenziali**: nome utente e password vanno nell'archivio credenziali di sistema (Gestione credenziali di Windows / Portachiavi di macOS), mai nei file di configurazione
- **Compatibilità**: servizi WebDAV standard come Nutstore, Nextcloud, Synology (consigliata una password dedicata all'applicazione)

---

## Estensioni e personalizzazione

### Assistente IA (pannello di chat laterale)

- **18 fornitori di LLM + servizio personalizzato**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen (Tongyi), Zhipu GLM, Moonshot Kimi, Volcano Ark, SiliconFlow, MiniMax, Xiaomi MiMo, Meituan LongCat, OpenRouter, OpenCode Go, Ollama (locale); il «servizio personalizzato» accetta i protocolli compatibili con OpenAI o Anthropic, con Base URL, ID del modello e chiave inseriti a mano
- **Conversazione in streaming**: il pulsante robot della barra strumenti apre il pannello di destra, le risposte arrivano in streaming e si possono fermare in qualsiasi momento
- **Processo di ragionamento**: reasoning / thinking dei modelli di ragionamento mostrati in un blocco comprimibile, chiuso per impostazione predefinita
- **Sicurezza delle chiavi**: le chiavi API risiedono nel portachiavi di sistema, con salvataggio, cancellazione e verifica in un clic; gli endpoint locali (llama.cpp / LM Studio / vLLM e simili) possono restare vuoti
- **Riferimento al documento corrente**: se selezionato, il documento diventa contesto, con limite configurabile (64K–512K / illimitato) e numero di turni di contesto (0–20, 3 predefiniti)
- **Uso del risultato**: copia, inserimento alla posizione del cursore o creazione di un nuovo documento in un clic

### Skill IA

Il pulsante ⚡ nella casella di input apre il menu degli skill; il tag dello skill scelto viene inserito alla posizione del cursore e il suo prompt viene iniettato nel contesto. Per personalizzare basta mettere `skills.json` e i prompt `.md` nella cartella `skills/`. Cinque skill sono integrati: «Estrazione presentazione», «Riassunto documento», «Riscrittura e rifinitura», «Traduzione integrale» e «Formattazione Markdown».

### Plugin

- **Capacità di base integrate per impostazione predefinita**: KaTeX / Mermaid / note / elenchi di attività / TOC e altre funzioni semantiche del documento non dipendono dagli interruttori dei plugin
- **Plugin integrato**: esportazione EPUB (attivo per impostazione predefinita, disattivabile nella pagina Plugin; il menu di esportazione della barra strumenti compare solo quando è attivo)
- **Standard dei plugin**: manifest (versione / versione API / momento di attivazione / permessi / capacità) → controllo di idoneità → attivazione pigra → registrazione delle capacità → pulizia alla disattivazione; la versione attuale carica solo i plugin compilati nell'applicazione

### Temi e aspetto

- **15 temi integrati**: Prism vetro liquido (predefinito), Blu accademico, Arancione vivace, Tecnologico, Minimalista, Magazine, Naturale, Rosso litchi, Viola, Cyberpunk, Facebook, Matrix, Menta ghiacciata, Tramonto dorato, Macchina da scrivere retrò — ognuno con una palette chiara e una scura
- **Modalità scura / chiara**: cambio con un tasto (`F2`)
- **Font personalizzati**: font, corpo e interlinea impostati separatamente per sorgente e anteprima
- **Tema personalizzato**: scrivi il CSS in Impostazioni → Aspetto → CSS personalizzato e salva; viene generato un «tema personalizzato» sulla base del tema corrente — puoi incollare un tema intero o ritoccare solo qualche colore, con effetto immediato
- **Estensione dei temi**: inserisci un `.css` in `themes/` e registralo in `themes/theme.json`, viene riconosciuto al riavvio; il sistema di token e le convenzioni sono descritti in `docs/THEME-DESIGN-SPEC.md`

### Lingue e interfaccia

- **16 lingue dell'interfaccia**: cinese semplificato (predefinito), cinese tradizionale, English, 日本語, 한국어, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська, Русский
- Cambio con un clic in Impostazioni → Generali → Lingua dell'interfaccia, con effetto immediato; testi dell'interfaccia, pannello dei tasti di scelta rapida e descrizioni dei plugin seguono la lingua
- **Rilevamento al primo avvio**: in assenza di una lingua scelta nel programma di installazione si usa la lingua di sistema, con ripiego su English se non è nell'elenco supportato; ogni voce di lingua riporta anche l'etichetta inglese `Language`, per trovarla in fretta anche con interfaccia in cinese
- **Scala dell'interfaccia**: 80%–120% (100% predefinito), scala solo testi e icone dell'interfaccia, senza toccare le dimensioni dei pannelli né il contenuto dei documenti
- **Pannello delle impostazioni**: Generali, Aspetto, Editor, Modalità in tempo reale, Assistente IA, Cloud, Plugin, Tasti di scelta rapida, Modelli, Documentazione, Informazioni, Prodotti, con anteprima immediata delle impostazioni

---

## Tasti di scelta rapida

| Tasto | Funzione | Tasto | Funzione |
|--------|------|--------|------|
| Ctrl+N | Nuovo file | Ctrl+B | Grassetto |
| Ctrl+O | Apri file | Ctrl+I | Corsivo |
| Ctrl+S | Salva file | Ctrl+- | Barrato |
| Ctrl+Shift+S | Salva con nome | Ctrl++ | Codice in linea |
| Ctrl+W | Chiudi scheda | Ctrl+1 | Titolo di livello 1 |
| Ctrl+H | Esporta HTML | Ctrl+2 | Titolo di livello 2 |
| Ctrl+M | Esporta Markdown | Ctrl+3 | Titolo di livello 3 |
| Ctrl+Z | Annulla | Ctrl+. | Elenco puntato |
| Ctrl+Y | Ripeti | Ctrl+0 | Elenco numerato |
| Ctrl+F | Cerca | Ctrl+' | Citazione |
| Ctrl+\ | Mostra / nascondi barra laterale | Ctrl+K | Link |
| F1 | Elenco completo dei tasti | Ctrl+` | Blocco di codice |
| F2 | Passa a chiaro / scuro | Ctrl+T | Tabella |
| F3 | Cicla le quattro viste di modifica | Ctrl+L | Riga orizzontale |
| F9 | Modalità zen (solo sorgente / tempo reale) | Ctrl+Alt+P | Modalità presentazione |
| F11 | Attiva / disattiva schermo intero | Ctrl+Alt+R | Modalità lettura |
| Ins | Menu slash | F12 | Strumenti per sviluppatori |

I tasti si personalizzano in Impostazioni → Tasti di scelta rapida: assegnazione visiva di 36 action, registrazione dei tasti, rilevamento dei conflitti e ripristino dei valori predefiniti.

---

## Struttura delle cartelle

La versione portatile, dopo l'estrazione:

```
YiziMarkdown/
├── YiziMarkdown.exe        # Programma principale
├── readme.md               # Descrizione del progetto (questo file)
├── welcome.md              # Documento di benvenuto
├── docs/                   # Documentazione (THEME-DESIGN-SPEC.md, specifica di design dei temi, ecc.)
├── user.css                # Stili personalizzati dell'utente
├── keybindings.json        # Configurazione dei tasti
├── themes/                 # File CSS dei temi
│   ├── liquidglass-prism.css # Prism vetro liquido (predefinito)
│   ├── academic.css        # Blu accademico
│   ├── vibrant.css         # Arancione vivace
│   ├── tech.css            # Tecnologico
│   ├── minimal.css         # Minimalista
│   ├── magazine.css        # Magazine
│   ├── nature.css          # Naturale
│   ├── lychee.css          # Rosso litchi
│   ├── violet.css          # Viola
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Menta ghiacciata
│   ├── sunset.css          # Tramonto dorato
│   └── typewriter.css      # Macchina da scrivere retrò
├── skills/                 # Skill IA
│   ├── skills.json         # Elenco degli skill
│   ├── slides-outline.md   # Estrazione presentazione
│   ├── doc-summary.md      # Riassunto documento
│   ├── polish-writing.md   # Riscrittura e rifinitura
│   ├── translate-fulltext.md # Traduzione integrale
│   └── markdown-format.md  # Formattazione Markdown
└── templates/              # Modelli di documento integrati (sincronizzati nella cartella utente al primo avvio)
    ├── default.md          # Modello predefinito
    └── Slide-Template.md   # Modello di presentazione
```

> Nota: gli skill IA e i modelli di documento risiedono in realtà nella **cartella utente** — in Windows / macOS `~/Documents/yizimarkdown/skills/` e `.../templates/`; in Linux `yizimarkdown/` nella cartella documenti XDG (ad es. `~/Documenti/yizimarkdown/`), con ripiego su `~/.local/share/yizimarkdown/` quando non esiste una cartella documenti. (Le cartelle con lo stesso nome nella cartella del programma sono risorse integrate, sincronizzate al primo avvio.) Mettete i vostri contenuti personali nella cartella utente: aggiornamenti e reinstallazioni non li sovrascriveranno.

---

## Stack tecnico

| Livello | Tecnologia |
|------|------|
| Framework desktop | Tauri 2 (Rust) |
| Framework frontend | React 18 + TypeScript |
| Motore dell'editor | CodeMirror 6 |
| Gestione dello stato | Zustand (persist) |
| Stili | Tailwind CSS + variabili CSS |
| Rendering Markdown | markdown-it |
| Internazionalizzazione | i18n leggero interno (16 lingue) |
| Integrazione IA | proxy di streaming Rust (protocolli OpenAI / Anthropic / Ollama) |
| Strumento di build | Vite |

---

## Sviluppo

### Requisiti

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Avviare il server di sviluppo

```bash
cd code
npm install
npm run tauri:dev
```

### Icona nel dock in fase di sviluppo su Linux (facoltativo)

Desktop come elementary / GNOME cercano, in base al `WM_CLASS` della finestra, un file `.desktop` con lo stesso nome e la relativa `Icon`; una build di sviluppo non ha programma di installazione e quindi nemmeno `.desktop`, così il dock mostra solo un'icona generica (lo `_NET_WM_ICON` della finestra è già fornito lato Rust, i pacchetti di installazione non sono interessati). Da eseguire una volta:

```bash
npm run dev:icon           # scrive ~/.local/share/applications/yizimarkdown-dev.desktop
npm run dev:icon:remove    # annulla
```

Poi riavviate la finestra di sviluppo e il dock mostra l'icona dell'applicazione.

### Compilare una versione di distribuzione

**Windows**

```bash
npm run tauri:build
```

Artefatti di build:
- exe portatile: `src-tauri/target/release/yizimarkdown.exe`
- pacchetto di installazione NSIS: `src-tauri/target/release/bundle/nsis/`

Programma di installazione: alla prima installazione si sceglie prima la lingua (16 opzioni, tutte le lingue dell'interfaccia più il portoghese brasiliano); i testi della procedura guidata e la lingua del primo avvio dopo l'installazione seguono questa scelta, e aggiornamenti / aggiornamenti automatici non azzerano la lingua già scelta. Icone e grafiche di barra laterale / intestazione sono in `src-tauri/installer/`; dopo aver cambiato i colori del marchio, rigenerarle con `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1`.

Dopo la compilazione, copiate manualmente l'exe e i file di risorse nella cartella `public/YiziMarkdown-vX.X.X/` per la distribuzione.

**macOS (universal binary, Intel e Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artefatti di build:
- pacchetto applicazione: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- pacchetto di installazione: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux (deb + AppImage)**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

Artefatti di build (**per ora solo amd64 / x86_64**; il `deb` `arm64` e l'`AppImage` `aarch64` per ARM non sono pubblicati):
- pacchetto Debian: `src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb` (circa 16 MB, installato in `/usr/bin`, registra la voce di menu, l'icona e le associazioni dei file `.md` / `.epub`)
- versione portatile senza installazione: `src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage` (circa 100 MB, include GTK / WebKit e i componenti media GStreamer, doppio clic per avviare)

Attenzione: **la compilazione deve avvenire su Ubuntu 22.04**. Un binario compilato su 24.04 richiede glibc 2.39 e non parte su Ubuntu 22.04 (2.35) / Debian 12 (2.36); anche la dipendenza `libwebkit2gtk-4.1-0` del `deb` fissa lo stesso limite minimo (Debian 11 dispone solo di webkit 4.0). Nessun `rpm` per ora: Fedora / openSUSE usano nomi di dipendenze diversi e richiederebbero una manutenzione separata.

### Struttura del progetto

```
code/
├── src/                    # Codice sorgente del frontend
│   ├── App.tsx             # Componente principale dell'applicazione
│   ├── components/         # Componenti dell'interfaccia
│   │   ├── Editor.tsx      # Editor CodeMirror + anteprima
│   │   ├── Reader.tsx      # Modalità lettura (impaginazione / sfogliamento)
│   │   ├── Slideshow.tsx   # Modalità presentazione
│   │   ├── TabBar.tsx      # Barra delle schede
│   │   ├── HomePage.tsx    # Pagina iniziale (file recenti)
│   │   ├── Toolbar.tsx     # Barra strumenti
│   │   ├── Sidebar.tsx     # Barra laterale (indice + browser dei file)
│   │   ├── StatusBar.tsx   # Barra di stato in basso
│   │   └── SettingsModal.tsx # Pannello delle impostazioni
│   ├── stores/             # Gestione dello stato con Zustand
│   ├── lib/                # Librerie di utilità (rendering Markdown, temi, modalità zen, ecc.)
│   └── styles/             # Stili globali
├── src-tauri/              # Backend Rust
│   ├── src/main.rs         # Comandi Tauri (lettura / scrittura file, caricamento temi, registro, ecc.)
│   ├── icons/              # Icone dell'applicazione
│   ├── themes/             # CSS dei temi (con metadati theme.json)
│   └── templates/          # Modelli di documento
├── docs/                   # Documentazione (changelog / readme i18n multilingue / THEME-DESIGN-SPEC.md)
└── package.json
```

---

## Versione e aggiornamenti

Le installazioni Windows si aggiornano in un clic dall'applicazione; macOS, Linux e le versioni portatili controllano `latest.json` all'avvio, segnalano in basso a destra la nuova versione e aprono la pagina di download corrispondente (sostituzione manuale, senza installazione automatica; il `deb` e l'`AppImage` di Linux seguono entrambi questo canale).

---

## Licenza

MIT
