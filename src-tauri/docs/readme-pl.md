# YiziMarkdown

![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)

[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)

**Oficjalna strona internetowa:** https://md.yizigpt.com

Prosty i elegancki跨platformowy edytor Markdown, wspierający wersje przenośne dla Windows oraz macOS. Nie wymaga instalacji - wystarczy rozpakować, aby zacząć używać. Łączy estetyczny wygląd z funkcjonalnością. Dla Windows dostępna jest zarówno wersja instalowana, jak i przenośna; macOS oferuje uniwersalne pakiety instalacyjne, które natywnie działają na procesorach Intel i Apple Silicon.

Dlaczego stworzyliśmy edytor Markdown?

Na rynku istnieje wiele edytorów Markdown, ale ich interfejsy są zazwyczaj mało atrakcyjne lub zbyt złożone i przeładowane funkcjami. Trudno znaleźć narzędzie, które łączy prostotę, piękny wygląd i intuicyjną obsługę.

Właśnie dlatego powstał YiziMarkdown.

Stworzyliśmy niezwykle eleganckie doświadczenie w trybie edycji WYSIWYG. Ponadto wspieramy szybkie prezentacje w stylu PPT - gotowe notatki i dokumenty można łatwo przełączyć w tryb prezentacji, co ułatwia udostępnianie i raportowanie. Spróbuj, a przekonasz się sam.

---

## Funkcje

### Wielojęzyczny interfejs

- **15 języków interfejsu**: Chiński uproszczony (domyślny), Chiński tradycyjny, Angielski, Japoński, Koreański, Niemiecki, Francuski, Hiszpański, Portugalski, Włoski, Polski, Holenderski, Turecki, Szwedzki, Ukraiński
- Ustawienia → Ogólne → przełączanie języka jednym kliknięciem, natychmiastowa zmiana; wszystkie teksty interfejsu, panele skrótów i opisy wtyczek automatycznie dostosowują się do wybranego języka

### Asystent AI (panel czatu bocznego)

- **17 dostawców modeli AI + własna usługa**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Tongyi Qianwen, Zhipu GLM, Moonshot Kimi, Volcano Ark, SiliconFlow, MiniMax, OpenRouter, OpenCode Go, Ollama (lokalnie); "Własna usługa" obsługuje protokoły OpenAI/Anthropic - wpisz własny Base URL, ID modelu i klucz, aby połączyć się z dowolną usługą stron trzecich
- **Umiejętności AI (Skill)**: przycisk ⚡ w polu tekstowym otwiera menu umiejętności; wybrana umiejętność wstawia tag w miejscu kursora, a prompt automatycznie dodaje kontekst; umieść pliki `skills.json` i `.md` z promptami w katalogu `skills/`, aby tworzyć własne umiejętności. Wbudowane 3 umiejętności: „Ekstrakcja prezentacji", „Podsumowanie dokumentu", „Korekta i przeredagowanie"
- **Strumieniowe rozmowy**: przycisk robota na pasku narzędzi otwiera prawy panel AI; odpowiedzi generowane w czasie rzeczywistym, możliwość zatrzymania w dowolnym momencie
- **Wyświetlanie procesu myślenia**: treść rozumowania (reasoning/thinking) prezentowana w składanych sekcjach, domyślnie zwinięta, nie zakłóca czytania treści głównej
- **Bezpieczeństwo kluczy API**: klucze API przechowywane w systemowym pęku kluczy (OS keychain), obsługa jednoklikowego zapisu, czyszczenia i weryfikacji; klucze dla endpointów lokalnych (llama.cpp, LM Studio, vLLM itp.) mogą pozostać puste
- **Cytowanie bieżącego dokumentu**: zaznacz, aby wysłać bieżący dokument jako kontekst do AI; konfigurowalne limity cytowania (64K~512K/bez limitu) i liczba rund kontekstu (0~20, domyślnie 3)
- **Zapis wyników**: odpowiedzi można kopiować, wstawiać w miejsce kursora lub jednym kliknięciem tworzyć nowy dokument

### Edycja i podgląd

- **Edycja kodu źródłowego**: rdzeń CodeMirror 6, podświetlanie składni, dopasowywanie nawiasów, autouzupełnianie
- **Tryb na żywo (WYSIWYG)**: edycja What-You-See-Is-What-You-Get; automatyczne ukrywanie znaczników Markdown podczas pisania, skupienie na treści
- **Animacje trybu na żywu**: 4 schematy animacji pojawiania się znaczników (focusing/flash/glow/ripple), podgląd i przełączanie w ustawieniach
- **Podgląd na żywu**: natychmiastowe renderowanie Markdown; obsługa interaktywnych list zadań (checkbox)
- **Pięć trybów widoku**: źródło / obok siebie / na żywo (WYSIWYG) / podgląd / prezentacja (pełnoekranowe slajdy) - przełączanie jednym kliknięciem
- **Synchronizacja przewijania za pomocą konspektu**: w trybie obok siebie oba panele współdziałają; automatyczne pozycjonowanie przy przełączaniu widoków
- **Wyszukiwanie i zamiana**: nawigacja między dopasowaniami, zamiana wszystkich
- **Skróty na pasku narzędzi**: pogrubienie, kursywa, przekreślenie, kod w linii - zaznacz tekst i formatuj jednym kliknięciem
- **Renderowanie lokalnych obrazów**: w trybie podglądu automatyczne renderowanie obrazów z lokalnych ścieżek (jpg/png/gif/webp/svg/bmp)
- **Numery linii / zawijanie tekstu**: oba opcje można włączyć/wyłączyć w ustawieniach
- **Ulepszone bloki kodu**: podświetlanie składni (highlight.js), etykiety języka, przycisk kopiowania, przełączanie zawijania tekstu
- **Zwijanie paska narzędzi formatowania**: automatyczne zwijanie przy małej szerokości okna, obsługa ręcznego rozwijania/zwijania
- **Filtrowanie frontmatter**: automatyczne filtrowanie YAML frontmatter w trybach podglądu/obok siebie/na żywu

### Wzory matematyczne i wykresy

- **Wzory KaTeX**: wbudowana wtyczka KaTeX, natychmiastowe renderowanie wzorów LaTeX inline `$...$` i blokowych `$$...$$`
- **Wykresy Mermaid**: wbudowana wtyczka Mermaid, automatyczne renderowanie diagramów przepływu, sekwencji, Gantta, klas, kołowych itp. jako wizualnych wykresów; obsługa wielu motywów
- **Selektor wierszy/kolumn tabel**: przycisk tabeli na pasku narzędzi otwiera siatkę 8×8; kliknij, aby wstawić tabelę o wybranej liczbie wierszy i kolumn

### Tryb prezentacji (slajdy)

- **Napędzany czystym Markdown**: nie wymaga żadnych dodatkowych formatów; `---` (linia pozioma) jako separator stron; silnik analizuje strukturę strony i automatycznie wybiera układ
- **14 automatycznych układów**: strona tytułowa, strona rozdziału, strona końcowa, spis treści, zawartość, lista, tabela danych, roadmapa, tekst-zdjęcie, obraz, złota myśl, kod, wykres (Mermaid), wzór
- **Zawartość wyrównana do lewej + podkreślenie akcentowe**: tytuł wyrównany do lewego górnego rogu z podkreśleniem w kolorze motywu, treść wyrównana do lewej - wygodna do czytania
- **Złota myśl z ukośnymi cudzysłowami**: górny cudzysłów zawieszony w lewym górnym rogu, dolny w prawym dolnym; treść wycentrowana pionowo
- **Jawne polecenia**: `<!-- layout: xxx -->` wymusza układ, `<!-- align: left|center|right -->` wyrównuje całą stronę (komentarze HTML, niewidoczne po renderowaniu)
- **Metadane strony tytułowej**: front matter dostarcza `author`/`date`, strona tytułowa wyświetla je automatycznie
- **Stopka i postęp**: w lewym dolnym rogu nazwa rozdziału + numer strony; na dole pasek postępu w kolorze motywu
- **Przewijanie stron kółkiem myszy**: gdy treść może być przewijana, najpierw przewija się treść; po osiągnięciu granicy następuje przejście na następną stronę
- **Dziedziczenie motywu**: kolory tytułów precyzyjnie zmieniają się z motywem (obsługiwane we wszystkich 15 motywach); w prezentacji można przełączać motyw/jasność
- **Przełączanie pełnoekranowe**: klawisz F przełącza pełny ekran/przywraca; niezawodne przejście z dowolnego stanu okna (zwykłe/zmaksymalizowane)
- **Przycisk wyjścia**: półprzezroczysty przycisk wyjścia w prawym górnym rogu przy ruchu myszy; automatyczne ukrycie po 1,5 s bezczynności
- **Przywracanie stanu okna**: po wyjściu z prezentacji automatyczne przywrócenie stanu okna sprzed wejścia (pełny ekran/zmaksymalizowane/zwykłe)

### System wtyczek

- Architektura wtyczkowa; wbudowane dwie główne wtyczki: KaTeX i Mermaid
- Strona „Wtyczki" w panelu ustawień obsługuje włączanie/wyłączanie i konfigurację wtyczek
- Wtyczki ładowane dynamicznie; wyłączone nie zajmują zasobów

### Zarządzanie wieloma plikami

- **Tryb jednej instancji**: otwieranie wielu plików nie uruchamia wielu okien; automatyczne scalanie z istniejącą instancją; ponownie otwarty plik automatycznie定位 do odpowiedniej karty
- **Karty (Tab)**: zarządzanie otwartymi plikami na górnym pasku; przełączanie, zamykanie, tworzenie nowych
- **Strona główna**: lista ostatnio otwartych plików z rozmiarem i czasem modyfikacji
- **Wskaźnik stanu zapisu**: animacja oddychającego okrągłu dla niezapisanych plików; animacja potwierdzenia ✅ po zapisie
- **Potwierdzenie zamknięcia**: przy zamykaniu niezapisanego pliku pojawia się okno potwierdzenia zapisz/nie zapisz/anuluj

### Operacje na plikach

- **Otwieranie**: obsługa .md / .markdown / .txt
- **Tworzenie**: nowa pusta karta z etykietą „Nienazwany nowy plik"
- **Tworzenie z szablonu**: menu rozwijane „Utwórz z szablonu" na pasku narzędzi; tworzenie nowego dokumentu na podstawie wybranego szablonu Markdown;也可以 w Ustawienia → Ogólne ustawić domyślny szablon; potem `Ctrl+N` automatycznie go zastosuje
- **Zapis / automatyczny zapis**: ręczny zapis + automatyczny zapis w konfigurowalnych odstępach (5~180 s, domyślnie 60 s)
- **Zapis jako**: automatyczne otwieranie okna „Zapis jako" przy zapisie nowego pliku
- **Eksport**: trzy formaty - HTML / Markdown / tekst plain
- **Powiązanie .md**: jednym kliknięciem ustaw edytor Markdown jako domyślny w systemie; kliknięcie dwukrotne .md otwiera bezpośrednio (rejestr Windows / LaunchServices macOS)

### Personalizacja wyglądu

- **15 wbudowanych motywów**: Akademicki niebieski (domyślny), Energiczny pomarańczowy, Technologiczny, Minimalistyczny, Magazynowy, Naturalny, Szklany płynny, Czerwień liczi, Fioletowy, Cyberpunk, Facebook, Matrix, Miętowy smoothie, Zachodzące słońce, Retro maszyna do pisania; każdy z dwoma wersjami kolorystycznymi (jasna/ciemna)
- **Tryb ciemny/jasny**: każdy motyw ma dwie wersje kolorystyczne
- **Dostosowanie czcionki**: osobne ustawienia czcionki, rozmiaru i interlinii dla trybu źródła i podglądu
- **Własny CSS**: `user.css` nakłada się po wszystkich motywach, najwyższy priorytet
- **Rozszerzanie motywów**: umieść pliki `.css` w katalogu `themes/` i dodaj parametry motywu w `themes/theme.json`; po restarcie automatyczne rozpoznanie

### Inne

- **Szablony dokumentów**: umieść pliki `.md` w katalogu `templates/`, aby wybrać je przy tworzeniu nowego dokumentu
- **System skrótów klawiszowych**: wizualny panel konfiguracji skrótów; obsługa 30 akcji z własnymi przypisaniami, nagrywaniem klawiszy, wykrywaniem konfliktów i przywracaniem ustawień domyślnych
- **Panel ustawień**: zakładki Ogólne, Wygląd, Edytor, Tryb na żywo, AI, Wtyczki, Skróty, Szablony, O programie; natychmiastowy podgląd zmian

---

## Skróty klawiszowe

| Skrót | Funkcja |
|--------|---------|
| Ctrl+N | Nowy plik |
| Ctrl+O | Otwórz plik |
| Ctrl+S | Zapisz plik |
| Ctrl+Shift+S | Zapisz jako |
| Ctrl+W | Zamknij kartę |
| Ctrl+H | Eksportuj HTML |
| Ctrl+M | Eksportuj Markdown |
| Ctrl+Y | Cofnij |
| Ctrl+Z | Ponów |
| Ctrl+F | Szukaj |
| Ctrl+\ | Przełącz panel boczny |
| Ctrl+B | Pogrubienie |
| Ctrl+I | Kursywa |
| Ctrl+- | Przekreślenie |
| Ctrl++ | Kod w linii |
| Ctrl+1 | Nagłówek poziomu 1 |
| Ctrl+2 | Nagłówek poziomu 2 |
| Ctrl+3 | Nagłówek poziomu 3 |
| Ctrl+. | Lista nieuporządkowana |
| Ctrl+0 | Lista uporządkowana |
| Ctrl+' | Cytat |
| Ctrl+K | Link |
| Ctrl+` | Blok kodu |
| Ctrl+T | Tabela |
| Ctrl+L | Linia pozioma |
| F1 | Pełna lista skrótów |
| F2 | Przełącz tryb jasny/ciemny |
| F3 | Przełącz widok cyklicznie |
| Ctrl+Alt+P | Tryb prezentacji (slajdy) |
| Ins | Menu ukośnika |
| F12 | Narzędzia deweloperskie |

Skróty klawiszowe można dostosować w Ustawienia → Skróty; obsługa wizualnej konfiguracji i wykrywania konfliktów.

---

## Struktura katalogów wersji przenośnej

```
YiziMarkdown/
├── YiziMarkdown.exe        # Program główny
├── readme.md               # Opis projektu (ten plik)
├── welcome.md              # Dokument powitalny
├── changelog.md            # Dziennik zmian
├── user.css                # Własny styl użytkownika
├── keybindings.json        # Konfiguracja skrótów
├── themes/                 # Pliki CSS motywów
│   ├── academic.css        # Akademicki niebieski (domyślny)
│   ├── vibrant.css         # Energiczny pomarańczowy
│   ├── tech.css            # Technologiczny
│   ├── minimal.css         # Minimalistyczny
│   ├── magazine.css        # Magazynowy
│   ├── nature.css          # Naturalny
│   ├── liquidglass.css     # Szklany płynny
│   ├── lychee.css          # Czerwień liczi
│   ├── violet.css          # Fioletowy
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Miętowy smoothie
│   ├── sunset.css          # Zachodzące słońce
│   └── typewriter.css      # Retro maszyna do pisania
├── skills/                 # Umiejętności AI (Skill)
│   ├── skills.json         # Lista umiejętności
│   ├── slides-outline.md   # Ekstrakcja prezentacji
│   ├── doc-summary.md      # Podsumowanie dokumentu
│   └── polish-writing.md   # Korekta i przeredagowanie
└── templates/              # Szablony dokumentów
    └── default.md          # Domyślny szablon
```

---

## Stos technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Framework desktopowy | Tauri 2 (Rust) |
| Framework frontendowy | React 18 + TypeScript |
| Rdzeń edytora | CodeMirror 6 |
| Zarządzanie stanem | Zustand (persist) |
| Schemat stylów | Tailwind CSS + zmienne CSS |
| Renderowanie Markdown | markdown-it |
| Internacjonalizacja | własna lekka i18n (15 języków) |
| Integracja AI | strumieniowy proxy Rust (protokoły OpenAI/Anthropic/Ollama) |
| Narzędzia budujące | Vite |

---

## Rozwój

### Wymagania środowiskowe

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Uruchomienie serwera deweloperskiego

```bash
cd code
npm install
npm run tauri:dev
```

### Budowanie wersji produkcyjnej

**Windows**

```bash
npm run tauri:build
```

Artefakty buildu:
- wersja przenośna exe: `src-tauri/target/release/yizimarkdown.exe`
- pakiet instalacyjny MSI: `src-tauri/target/release/bundle/msi/`
- pakiet instalacyjny NSIS: `src-tauri/target/release/bundle/nsis/`

Po zbudowaniu ręcznie skopiuj exe i pliki zasobów do katalogu `public/YiziMarkdown-vX.X.X/` do dystrybucji.

**macOS (uniwersalny binarny, obsługuje Intel i Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artefakty buildu:
- pakiet aplikacji: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- pakiet instalacyjny: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### Struktura projektu

```
code/
├── src/                    # Kod źródłowy frontendu
│   ├── App.tsx             # Główny komponent aplikacji
│   ├── components/         # Komponenty UI
│   │   ├── Editor.tsx      # Edytor CodeMirror + podgląd
│   │   ├── TabBar.tsx      # Pasek kart
│   │   ├── HomePage.tsx    # Strona główna (ostatnie pliki)
│   │   ├── Toolbar.tsx     # Pasek narzędzi
│   │   ├── Sidebar.tsx     # Panel boczny (konspekt + przegląd plików)
│   │   ├── StatusBar.tsx   # Dolny pasek stanu
│   │   └── SettingsModal.tsx # Panel ustawień
│   ├── stores/             # Zarządzanie stanem Zustand
│   ├── lib/                # Biblioteki narzędziowe (renderowanie markdown, ID nagłówków)
│   └── styles/             # Style globalne
├── src-tauri/              # Backend Rust
│   ├── src/main.rs         # Polecenia Tauri (odczyt/zapis plików, ładowanie motywów, rejestr itp.)
│   ├── icons/              # Ikony aplikacji
│   ├── themes/             # CSS motywów
│   └── templates/          # Szablony dokumentów
└── package.json
```

---

## Licencja

MIT
