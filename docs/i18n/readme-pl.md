# YiziMarkdown


![Obraz](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](../../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md) | [Русский](./readme-ru.md)

**Oficjalna strona:** https://md.yizigpt.com

YiziMarkdown to wieloplatformowy edytor Markdown skoncentrowany na pisaniu. Ten sam plik `.md` można prezentować na siedem sposobów: `edycja źródła`, `korekta obok siebie`, `pisanie na żywo`, `podgląd gotowego dokumentu`, `prezentacja slajdów`, `czytanie jak książki` oraz `tryb Zen`, w którym zostaje tylko tekst i pełne skupienie na pisaniu.

- **Windows**: wersja instalacyjna (pakiet NSIS z aktualizacjami w aplikacji) lub przenośny pakiet ZIP — rozpakuj i uruchom
- **macOS**: uniwersalny pakiet binarny, działający natywnie na Intel i Apple Silicon
- **Linux**: `deb` dla systemów z rodziny Debian oraz niewymagający instalacji `AppImage` (Ubuntu 22.04+ / Debian 12+, obecnie tylko amd64)

Po co tworzyć kolejny edytor Markdown? Dostępne na rynku rozwiązania albo brzydko wyglądają, albo są przeładowane funkcjami — trudno znaleźć narzędzie, które łączy prostotę i estetykę z komfortem pracy. Tak powstał YiziMarkdown, wierny trzem zasadom: **ładny interfejs**, **mocne możliwości**, **wiele zastosowań**.

Tak narodził się obecny `YiziMarkdown`, obejmujący `3 systemy`, `7 trybów pracy`, `16 języków interfejsu`, `15 jasnych i ciemnych motywów`, `5 umiejętności AI (Skill)`, `7 formatów eksportu`, a do tego nowatorskie funkcje, takie jak asystent AI i pamięć w chmurze, oraz otwartą dokumentację motywów, umiejętności i prezentacji — dzięki niej możesz zbudować jeszcze bardziej wyjątkowe doświadczenia.

To już nie jest zwykły edytor Markdown, ale naprawdę wszechstronna aplikacja obejmująca wiele scenariuszy dokumentów — w twórczości, pracy i życiu codziennym.

---

## Siedem trybów: jeden dokument, siedem odsłon

Wartość Markdown nie tkwi wyłącznie w „pisaniu”, ale też w tym, „komu i jak pokazać efekt”. YiziMarkdown daje jeden dokument w siedmiu odsłonach: pierwsze cztery to widoki edycji, przełączane między źródłem a gotowym wynikiem; pozostałe trzy to odrębne scenariusze, które zamieniają dokument w slajdy, strony książki albo zostawiają tylko treść.

| Tryb | W jednym zdaniu | Wejście | Zastosowanie |
|------|-----------|------|------|
| Źródło | Bezpośrednia edycja surowego Markdown | `F3` / przyciski widoku | Precyzyjna praca nad strukturą, masowe zamiany, edycja frontmatter |
| Obok siebie | Piszesz po lewej, od razu porównujesz po prawej | `F3` / przyciski widoku | Korekta układu, pisanie według szablonu |
| Na żywo | WYSIWYG, znaczniki ukrywane automatycznie | `F3` / przyciski widoku | Pisanie długich tekstów, skupiona praca |
| Podgląd | Pokazuje tylko ostateczny układ | `F3` / przyciski widoku | Sprawdzanie gotowego efektu, czytanie całości |
| Prezentacja | Dokument jako gotowy pokaz slajdów | `Ctrl+Alt+P` / pasek narzędzi | Dzielenie się, prezentacje, wykłady |
| Czytanie | Dokument złożony jako książka do przewracania | `Ctrl+Alt+R` / pasek narzędzi | Długie teksty, EPUB, immersyjne czytanie |
| Zen | Znika cały interfejs, zostaje tekst | `F9` / pasek narzędzi | Głębokie pisanie |

`F3` przełącza cyklicznie między trybami Źródło / Obok siebie / Na żywo / Podgląd; Prezentacja, Czytanie i Zen mają osobne wejścia i nie kolidują ze sobą.

---

## Markdown: cztery w jednym

![Porównanie czterech trybów](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

Źródło, Obok siebie, Na żywo i Podgląd dzielą jeden rdzeń edytora i ten sam zestaw możliwości Markdown; różnią się tylko „gęstością informacji” — od całkowicie odkrytych znaczników do pełnego, złożonego efektu. Możesz przełączać się w dowolnym momencie, a widok stara się zachować aktualną pozycję.

### Tryb Źródło: widać wszystko, co trzeba

- Rdzeń CodeMirror 6: podświetlanie składni, dopasowywanie nawiasów, autouzupełnianie
- Numery wierszy i zawijanie wierszy przełączane niezależnie; idealne do precyzyjnej edycji linia po linii i masowych zmian
- YAML frontmatter wyświetlany bez zmian — edycja metadanych nie wymaga zgadywania formatu
- Tabele, bloki kodu i wzory pokazywane jako źródło — dają najwięcej kontroli przy złożonych strukturach

### Tryb Obok siebie: pisz i porównuj

- Źródło po lewej, podgląd po prawej, odświeżanie przy każdej zmianie
- Synchronizacja przewijania oparta na konspekcie; po przełączeniu widoku automatyczne ustawienie aktualnej pozycji
- Idealny do korekty układu i przebudowywania istniejących dokumentów

### Tryb na żywo: co widzisz, to dostajesz

- Znaczniki Markdown ukrywają się podczas wpisywania i wracają, gdy kursor opuści miejsce — skupiasz się na treści
- Oryginalne 4 animacje pojawiania się znaczników (fokus / błysk / poświata / fala), z podglądem i przełączaniem w ustawieniach
- YAML front matter renderuje się jako edytowalny panel właściwości w stylu Obsidian: 7 typów — automatyczny / tekst / liczba / pole wyboru / data / data i czas / lista; typ jest zapamiętywany globalnie po nazwie właściwości

### Tryb Podgląd: tylko gotowy efekt

- Markdown renderowany na bieżąco; pola wyboru list zadań można kliknąć
- Obrazy z lokalnych ścieżek, obrazy sieciowe i SVG renderują się automatycznie (jpg / png / gif / webp / svg / bmp)
- frontmatter ukryty automatycznie — widać dokładnie ostateczny układ

### Wspólne możliwości czterech widoków

- **Wyszukiwanie i zamiana**: nawigacja po wynikach, zamiana wszystkich
- **Formatowanie z paska narzędzi**: pogrubienie, kursywa, przekreślenie, kod w linii — zaznaczenie od razu otoczone znacznikami
- **Rozszerzenia bloków kodu**: podświetlanie składni highlight.js, etykiety języka, przycisk kopiowania, przełącznik zawijania wierszy
- **Selektor tabel**: siatka 8×8 do wstawiania przez kliknięcie, liczba wierszy i kolumn od razu widoczna, dodawanie i usuwanie wierszy oraz kolumn, menu kontekstowe z wieloma funkcjami
- **Wzory i diagramy**: KaTeX w linii `$...$` / blokowo `$$...$$`, Mermaid — diagramy przepływu, sekwencji, Gantta, klasy, kołowe i inne, kolory zgodne z motywem
- **Zwijany pasek formatowania**: automatycznie zwija się przy węższym oknie, można go też rozwinąć ręcznie
- **Numery wierszy i zawijanie**: przełączane w ustawieniach
- **Nawigacja po konspekcie**: hierarchia nagłówków pochodzi ze struktury dokumentu i jest powiązana z pozycją przewijania

---

## Tryb prezentacji: notatki zamieniają się w slajdy

![Tryb prezentacji](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

Gotowych notatek nie trzeba już eksportować do PPT: wbudowana umiejętność AI jednym kliknięciem streszcza je do zwięzłej wersji prezentacji, wystarczy przełączyć tryb prezentacji i dokument natychmiast staje się pełnoekranowym pokazem slajdów. Podział na slajdy, kolumny i układ są automatycznie wnioskowane ze struktury Markdown; do precyzyjnej kontroli służą dyrektywy w komentarzach HTML.

### Treść staje się slajdami

- Żadnego dodatkowego formatowania: `---` (pozioma linia) dzieli slajdy
- Samodzielna linia `***` dzieli slajd na kolumny, maksymalnie 4
- Silnik analizuje strukturę całej strony i automatycznie wybiera układ: nagłówki, listy, tabele, kod, obrazy i diagramy mają własne układy

### 14 układów

Okładka, slajd rozdziału, slajd końcowy, spis treści, treść, lista, tabela danych, mapa drogowa, tekst i obraz, obraz, złota myśl, kod, diagram (Mermaid), wzór.

- Poza „tekst i obraz”, który wymaga jawnego `<!-- layout: figure -->`, wszystkie układy są wnioskowane z treści
- Strony treści wyrównane do lewej, tytuł z podkreśleniem w kolorze motywu
- Slajd złotej myśli ma duże ukośne cudzysłowy ustawione po przekątnej: otwierający w lewym górnym rogu, zamykający w prawym dolnym, treść wyśrodkowana w pionie
- Okładka automatycznie odczytuje `author` / `date` z front matter

### Kontrola typografii podczas prezentacji

- HUD pozwala ustawić: czcionkę (zgodną z motywem / bezszeryfową / szeryfową / o stałej szerokości), grubość, rozmiar, szerokość i wysokość obszaru treści (50%–95%)
- Zmiany działają natychmiast i są zapisywane — kolejny pokaz użyje ich ponownie
- Zbyt długi kod w linii zawija się automatycznie, zamiast być ucinany przy krawędzi strony
- Jawne dyrektywy: `<!-- layout: xxx -->` wymusza układ, `<!-- align: left|center|right -->` wyrównuje całą stronę

### Prezentacja i nawigacja

- Nazwa rozdziału i numer slajdu w lewym dolnym rogu, pasek postępu w kolorze motywu na dole
- `T` otwiera szufladę spisu treści, `G` lub pole u dołu przenosi do slajdu
- Kółko myszy przewraca slajdy: gdy treść można przewijać, najpierw przewija się treść, a po osiągnięciu krawędzi następuje zmiana slajdu
- `F` włącza lub wyłącza pełny ekran, działa z dowolnego stanu okna — normalnego, zmaksymalizowanego itd.
- Po wyjściu automatycznie przywracany jest stan okna sprzed wejścia; przycisk wyjścia w prawym górnym rogu ukrywa się po 1,5 s bezczynności
- Dziedziczenie motywu: kolory tytułów zmieniają się wraz z motywem; motyw i jasność można przełączać także podczas prezentacji

---

## Tryb czytania: dokument złożony jak książka do przewracania

![Tryb czytania](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

Tryb czytania to nie „podgląd pełnoekranowy”, ale prawdziwe składanie treści w stałe strony: z okładką, stroną tytułową, spisem treści, numerami stron oraz efektem papieru i przewracania stron.

- Wejście: przycisk książki na pasku narzędzi lub `Ctrl+Alt+R`; `Esc` zamyka tryb i przywraca poprzedni widok
- Układ: cienka ramka z równymi marginesami otacza strony; dwie strony łączą się, a w środku jest tylko jedna linia podziału; tytuł książki w lewym górnym rogu, nazwa rozdziału / numer strony w lewym dolnym, HUD w prawym dolnym — położenie jak w trybie prezentacji
- Automatyczne tworzenie okładki, strony tytułowej i spisu treści: tytuł pochodzi z front matter `title` lub pierwszego H1, spis treści powstaje z nagłówków wraz z numerami stron i dzieli się automatycznie, gdy jest za długi
- Prawdziwe dzielenie na strony: rozkładówki (w wąskim oknie automatycznie pojedyncza strona), z numerami stron i postępem czytania

### Animacje przewracania stron

4 opcje, przełączane w ustawieniach, domyślnie przesunięcie poziome:

- **Przesunięcie poziome** (domyślne): cała strona przesuwa się — zdecydowanie i szybko
- **Przewracanie 3D**: kartka zwija się od prawego dolnego rogu i zagina wokół środka; podczas przewracania unosi się, z refleksem światła i cieniem (w trybie pojedynczej strony wokół grzbietu)
- **Przenikanie** / **Skalowanie**: spokojniejsze przejścia

Szybkie wielokrotne naciśnięcia nie pomijają stron; przejścia ze spisu treści, numerów stron i przypisów nie odtwarzają animacji.

### Zasady dzielenia na strony

Akapit dzielony wierszami, nagłówki nie pozostają osamotnione, tabela powtarza nagłówek na kolejnej stronie, blok kodu jest kontynuowany wiersz po wierszu, lista pozycja po pozycji, całe obrazy skalowane proporcjonalnie; akapity treści mają automatyczne wcięcie pierwszego wiersza na dwa znaki, niepowtarzane na kolejnej stronie.

### Nawigacja i szczegóły

- Szuflada spisu treści: `T`, pozycje według hierarchii nagłówków z numerami stron, kliknięcie przenosi od razu
- `G` lub pole numeru strony przenosi do wskazanej strony
- Przypisy w obie strony: kliknięcie odwołania przenosi do strony definicji i podświetla ją, dostępny jest przycisk „wróć do odwołania”; wewnętrzne zakotwiczenia również działają strona po stronie
- HUD czytania: w prawym dolnym rogu przełączanie trybu jasnego/ciemnego, motyw, czcionka (motyw / szeryfowa / bezszeryfowa / o stałej szerokości), rozmiar i interlinia — działa tylko na tę sesję czytania
- Pamięć pozycji: numer strony / rozdział zapamiętywany dla dokumentu i przywracany przy kolejnym wejściu
- Sterowanie: klawisze strzałek, PageUp / PageDown, spacja, kółko myszy, a także kliknięcie lewej lub prawej krawędzi strony

### EPUB

Po otwarciu `.epub` od razu przechodzisz do trybu czytania: używany jest motyw czytania aplikacji (CSS wydawcy jest ignorowany), wczytywane są osadzona okładka, nawigacja, obrazy, wzory, Mermaid SVG, przypisy i linki między rozdziałami. EPUB z DRM i o stałym układzie (komiksy / albumy) nie są jeszcze obsługiwane.

---

## Tryb Zen: tylko tekst

![Tryb Zen](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

Włączasz go klawiszem `F9` lub przyciskiem trybu Zen na pasku narzędzi. Pasek narzędzi, pasek kart, pasek boczny, panel AI i pasek stanu zwijają się kolejno ku krawędziom ekranu i znikają, zostawiając tylko treść; cały proces **nie zmienia układu** — tekst nie przesuwa się ani o piksel.

- **Świat wciąż istnieje**: gdy wskaźnik dotknie dowolnej krawędzi ekranu (góra / lewo / prawo / dół), odpowiadający obszar wraca w miejscu; po opuszczeniu chowa się automatycznie po około 1,2 s
- **Stały przełącznik**: przycisk trybu Zen nigdy nie znika i zawsze pozostaje na miejscu (dookoła bardzo delikatna, pulsująca fala) — jest zarówno kotwicą stanu „jesteś w trybie Zen”, jak i wyjściem; `F9` / `Esc` również zamykają tryb
- **Wyłącznie do pisania**: dostępny tylko w trybie źródła i na żywo; przełączenie do trybu obok siebie lub podglądu, a także wejście w czytanie lub prezentację, automatycznie kończy tryb
- **Czystsza kartka**: ukryte numery wierszy i pionowe linie paska bocznego, bardzo delikatne winietowanie, wskaźnik ukrywany po 2 s bezruchu; pionowy pasek przewijania zastąpiony minimalistyczną cienką linią, pojawiającą się podczas przewijania lub przy prawej krawędzi

---

## Pliki i pisanie

### Pliki i wiele kart

- **Otwieranie**: obsługa `.md` / `.markdown` / `.txt` / `.epub`; EPUB od razu przechodzi do trybu czytania
- **Tryb pojedynczej instancji**: wiele otwieranych plików trafia do istniejącego okna, a ponownie otwierany plik jest wskazywany w odpowiedniej karcie
- **Pasek kart**: przełączanie, zamykanie, tworzenie, zmiana kolejności przez przeciąganie
- **Strona startowa**: lista ostatnio otwartych plików z rozmiarem i czasem modyfikacji
- **Stan zapisu**: pulsująca kropka przy niezapisanym pliku, animacja potwierdzenia ✅ po zapisie
- **Potwierdzenie zamknięcia**: zapisz / nie zapisuj / anuluj, gdy plik jest niezapisany

### Nowe pliki i szablony

- Nowa pusta karta pokazuje „Plik bez nazwy”
- „Nowy z szablonu” na pasku narzędzi tworzy dokument zgodnie ze strukturą Markdown szablonu; domyślny szablon można ustawić w Ustawienia → Ogólne, a następnie `Ctrl+N` stosuje go automatycznie
- Szablony są przechowywane w katalogu użytkownika — wystarczy wrzucić `.md`, można też tworzyć / edytować je w Ustawienia → Szablony

### Wklej jako Markdown

Tekst sformatowany skopiowany ze stron internetowych, Word / DOCX, Google Docs, Notion itp. jest podczas wklejania konwertowany w pamięci do uporządkowanego Markdown (nagłówki / listy / tabele / kod / cytaty / linki); istniejące źródło Markdown i czysty tekst są wklejane bez zmian.

### Zapisywanie i eksport

- **Zapis / automatyczny zapis**: ręczny zapis + konfigurowalny interwał (5–180 s, domyślnie 60 s)
- **Zapisz jako**: przy zapisie nowego pliku automatycznie pojawia się okno „Zapisz jako”
- **Eksport**: HTML / Markdown / czysty tekst / Word (DOCX) / PDF / PPTX / EPUB
  - DOCX używa natywnej semantyki Worda (listy, tabele, bloki kodu, cytaty, listy zadań), styl tabel zgodny z podglądem, obrazy z lokalnych ścieżek, obrazy sieciowe i HTML `<img>` (szerokość przez `width`)
  - PDF jest zgodny z podglądem i automatycznie dzieli się na strony
  - HTML zawiera pływającą kartę konspektu po lewej stronie; kliknięcie pozycji przenosi prosto do rozdziału (PDF nie ma paska bocznego)
  - PPTX dziedziczy motyw, jasność i układy trybu prezentacji, generuje edytowalny tekst, tabele, obrazy, kształty i natywne wzory
  - EPUB dostarcza wbudowana wtyczka; przed eksportem można wybrać podział na rozdziały / okładkę / widoczny spis treści / motyw czytania / informacje o dokumencie
- **Skojarzenie plików `.md`**: jednym kliknięciem w ustawieniach ustaw YiziMarkdown jako systemowy domyślny edytor Markdown (rejestr Windows / macOS LaunchServices)

### Pamięć w chmurze (WebDAV)

- **Przeglądarka plików**: zakładka „Chmura” w pasku bocznym przegląda drzewo katalogów serwera — można otwierać dokumenty, tworzyć pliki / foldery, zmieniać nazwy, przenosić i usuwać; głębokie ścieżki nawigacyjne zwijają się do „…”, które rozwija menu do skoku, a foldery są ładowane leniwie poziom po poziomie
- **Zapis do chmury**: lokalny dokument jest przesyłany jednym kliknięciem, wraz z obrazami przywoływanymi w treści przez ścieżki względne, z zachowaniem struktury katalogów; `Ctrl+S` w dokumencie w chmurze zapisuje bezpośrednio na serwer
- **Ochrona przed konfliktami**: przed zapisem porównywany jest ETag; jeśli plik zmieniło inne urządzenie, pojawia się wybór „nadpisz wersję na serwerze” lub „odrzuć lokalne zmiany i wczytaj ponownie” — nigdy ciche nadpisanie
- **Bezpieczeństwo danych logowania**: nazwa użytkownika i hasło trafiają do systemowego magazynu poświadczeń (Menedżer poświadczeń Windows / Pęk kluczy macOS), nie do plików konfiguracyjnych
- **Zgodność**: standardowe usługi WebDAV, takie jak Nutstore (Jianguoyun), Nextcloud czy Synology (zalecane hasło aplikacji)

---

## Rozszerzenia i personalizacja

### Asystent AI (boczny panel czatu)

- **18 dostawców modeli AI + usługa własna**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Tongyi Qianwen (Qwen), Zhipu GLM, Moonshot Kimi, Volcano Engine (Doubao), SiliconFlow, MiniMax, Xiaomi MiMo, Meituan LongCat, OpenRouter, OpenCode Go, Ollama (lokalnie); „Usługa własna” obsługuje protokoły zgodne z OpenAI / Anthropic — własny Base URL, ID modelu i klucz
- **Czat strumieniowy**: przycisk robota na pasku narzędzi otwiera prawy panel, odpowiedzi płyną na żywo i można je zatrzymać w dowolnym momencie
- **Proces myślowy**: reasoning / thinking modeli rozumujących jest wyświetlany w zwijanym bloku, domyślnie zwiniętym
- **Bezpieczeństwo kluczy**: klucze API są przechowywane w systemowym pęku kluczy, z jednym kliknięciem zapisu, czyszczenia i weryfikacji; dla lokalnych punktów końcowych (llama.cpp / LM Studio / vLLM itp.) można zostawić puste
- **Odwołanie do bieżącego dokumentu**: po zaznaczeniu dokument staje się kontekstem, z konfigurowalnym limitem (64K–512K / bez limitu) i liczbą tur kontekstu (0–20, domyślnie 3)
- **Zapis wyniku**: kopiowanie, wstawienie w miejscu kursora lub jednym kliknięciem utworzenie nowego dokumentu

### Umiejętności AI (Skill)

Przycisk ⚡ w polu wprowadzania otwiera menu umiejętności; po wybraniu tag umiejętności trafia w miejsce kursora, a prompt jest automatycznie wstrzykiwany do kontekstu. Wystarczy umieścić `skills.json` + prompty `.md` w katalogu `skills/`, aby zdefiniować własne. Wbudowane są 5 umiejętności: „Szkic prezentacji”, „Podsumowanie dokumentu”, „Redakcja i szlifowanie”, „Tłumaczenie całego tekstu”, „Formatowanie Markdown”.

### Wtyczki

- **Kluczowe możliwości wbudowane**: KaTeX / Mermaid / przypisy / listy zadań / TOC i inne funkcje semantyczne dokumentu nie zależą od przełączników wtyczek
- **Wbudowana wtyczka**: eksport EPUB (domyślnie włączona, można ją wyłączyć na stronie wtyczek; menu eksportu na pasku narzędzi pojawia się dopiero po włączeniu)
- **Standard wtyczek**: manifest (wersja / wersja API / moment aktywacji / uprawnienia / możliwości) → sprawdzenie kwalifikowalności → leniwa aktywacja → rejestracja możliwości → sprzątanie po wyłączeniu; obecna wersja ładuje tylko wtyczki skompilowane w aplikację

### Motywy i wygląd

- **15 wbudowanych motywów**: Liquid Glass Prism (domyślny), Akademicki błękit, Żywiołowy oranż, Tech, Minimalistyczny, Magazynowy, Natura, Czerwone liczi, Fiolet, Cyberpunk, Facebook, Matrix, Mięta, Zachód słońca, Retro maszyna do pisania — każdy w jasnej i ciemnej wersji
- **Tryb ciemny / jasny**: przełączanie jednym klawiszem (`F2`)
- **Personalizacja czcionek**: osobne ustawienia czcionki, rozmiaru i interlinii dla źródła i podglądu
- **Motyw własny**: napisz i zapisz CSS w Ustawienia → Wygląd → Własny CSS, a na bazie obecnego motywu powstanie „motyw własny” — można wkleić cały nowy motyw lub zmienić kilka kolorów; zapis działa natychmiast
- **Rozszerzanie motywów**: wrzuć `.css` do katalogu `themes/` i zarejestruj parametry w `themes/theme.json`, po restarcie motyw zostanie rozpoznany; system tokenów i zasady opisano w `docs/THEME-DESIGN-SPEC.md`

### Języki i interfejs

- **16 języków interfejsu**: chiński uproszczony (domyślny), chiński tradycyjny, English, 日本語, 한국어, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська, Русский
- Ustawienia → Ogólne → Język interfejsu przełącza jednym kliknięciem, działa natychmiast; teksty interfejsu, panel skrótów i opisy wtyczek zmieniają się wraz z językiem
- **Dopasowanie przy pierwszym uruchomieniu**: gdy instalator nie ma języka, wybór następuje według języka systemu; jeśli go nie ma na liście obsługiwanych, używany jest English. Pozycje językowe mają angielską etykietę `Language`, więc można je szybko znaleźć także w chińskim interfejsie
- **Rozmiar interfejsu**: 80%–120% (domyślnie 100%), skaluje tylko tekst i ikony interfejsu, rozmiar paneli i treść dokumentu pozostają bez zmian
- **Panel ustawień**: Ogólne, Wygląd, Edytor, Tryb na żywo, Asystent AI, Chmura, Wtyczki, Skróty, Szablony, Dokumentacja, Wersja i aktualizacje, Inne produkty — ustawienia z natychmiastowym podglądem

---

## Skróty klawiszowe

| Skrót | Funkcja | Skrót | Funkcja |
|--------|------|--------|------|
| Ctrl+N | Nowy plik | Ctrl+B | Pogrubienie |
| Ctrl+O | Otwórz plik | Ctrl+I | Kursywa |
| Ctrl+S | Zapisz plik | Ctrl+- | Przekreślenie |
| Ctrl+Shift+S | Zapisz jako | Ctrl++ | Kod w linii |
| Ctrl+W | Zamknij kartę | Ctrl+1 | Nagłówek 1 |
| Ctrl+H | Eksport HTML | Ctrl+2 | Nagłówek 2 |
| Ctrl+M | Eksport Markdown | Ctrl+3 | Nagłówek 3 |
| Ctrl+Z | Cofnij | Ctrl+. | Lista punktowana |
| Ctrl+Y | Ponów | Ctrl+0 | Lista numerowana |
| Ctrl+F | Wyszukaj | Ctrl+' | Cytat |
| Ctrl+\ | Przełącz pasek boczny | Ctrl+K | Link |
| F1 | Pełna lista skrótów | Ctrl+` | Blok kodu |
| F2 | Przełącz tryb jasny/ciemny | Ctrl+T | Tabela |
| F3 | Cykliczne przełączanie czterech widoków edycji | Ctrl+L | Linia pozioma |
| F9 | Tryb Zen (tylko Źródło / Na żywo) | Ctrl+Alt+P | Tryb prezentacji (slajdy) |
| F11 | Pełny ekran | Ctrl+Alt+R | Tryb czytania |
| Ins | Menu ukośnika | F12 | Narzędzia deweloperskie |

Skróty można dostosować w Ustawienia → Skróty: wizualne wiązanie 36 akcji, nagrywanie klawiszy, wykrywanie konfliktów i przywracanie domyślnych.

---

## Struktura katalogów

Po rozpakowaniu wersji przenośnej:

```
YiziMarkdown/
├── YiziMarkdown.exe        # Program główny
├── readme.md               # Opis projektu (ten plik)
├── welcome.md              # Dokument powitalny
├── docs/                   # Dokumentacja (THEME-DESIGN-SPEC.md, specyfikacja designu motywów itp.)
├── user.css                # Własne style użytkownika
├── keybindings.json        # Konfiguracja skrótów klawiszowych
├── themes/                 # Pliki CSS motywów
│   ├── liquidglass-prism.css # Liquid Glass Prism (domyślny)
│   ├── academic.css        # Akademicki błękit
│   ├── vibrant.css         # Żywiołowy oranż
│   ├── tech.css            # Tech
│   ├── minimal.css         # Minimalistyczny
│   ├── magazine.css        # Magazynowy
│   ├── nature.css          # Natura
│   ├── lychee.css          # Czerwone liczi
│   ├── violet.css          # Fiolet
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Mięta
│   ├── sunset.css          # Zachód słońca
│   └── typewriter.css      # Retro maszyna do pisania
├── skills/                 # Umiejętności AI (Skill)
│   ├── skills.json         # Lista umiejętności
│   ├── slides-outline.md   # Szkic prezentacji
│   ├── doc-summary.md      # Podsumowanie dokumentu
│   ├── polish-writing.md   # Redakcja i szlifowanie
│   ├── translate-fulltext.md # Tłumaczenie całego tekstu
│   └── markdown-format.md  # Formatowanie Markdown
└── templates/              # Wbudowane szablony dokumentów (synchronizowane do katalogu użytkownika przy pierwszym uruchomieniu)
    ├── default.md          # Szablon domyślny
    └── Slide-Template.md   # Szablon prezentacji
```

> Wskazówka: umiejętności AI i szablony dokumentów są w rzeczywistości przechowywane w **katalogu użytkownika** — w Windows / macOS są to `~/Documents/yizimarkdown/skills/` i `.../templates/`; w Linuxie `yizimarkdown/` w katalogu dokumentów XDG (np. `~/Dokumenty/yizimarkdown/`), a gdy system nie ma katalogu dokumentów, używany jest `~/.local/share/yizimarkdown/`. (Foldery o tych samych nazwach w katalogu programu to zasoby wbudowane, synchronizowane tam przy pierwszym uruchomieniu). Własne treści umieszczaj w katalogu użytkownika — aktualizacje / reinstalacja ich nie nadpiszą.

---

## Stos technologiczny

| Warstwa | Technologia |
|------|------|
| Framework pulpitu | Tauri 2 (Rust) |
| Framework front-endu | React 18 + TypeScript |
| Rdzeń edytora | CodeMirror 6 |
| Zarządzanie stanem | Zustand (persist) |
| Stylizacja | Tailwind CSS + zmienne CSS |
| Renderowanie Markdown | markdown-it |
| Internacjonalizacja | Własna lekka implementacja i18n (16 języków) |
| Integracja AI | Strumieniowy proxy w Rust (protokoły OpenAI / Anthropic / Ollama) |
| Narzędzie budowania | Vite |

---

## Programowanie

### Wymagania

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Uruchomienie serwera deweloperskiego

```bash
cd code
npm install
npm run tauri:dev
```

### Ikona w docku w trybie deweloperskim na Linuxie (opcjonalnie)

Środowiska pulpitu, takie jak elementary / GNOME, szukają po `WM_CLASS` okna pliku `.desktop` o tej samej nazwie i jego `Icon`; kompilacja deweloperska nie ma instalatora, więc nie ma też `.desktop`, a dock pokazuje ogólną ikonę (własna `_NET_WM_ICON` okna jest już ustawiana przez warstwę Rust, wersje instalacyjne nie są tym dotknięte). Wykonaj raz:

```bash
npm run dev:icon           # zapisuje ~/.local/share/applications/yizimarkdown-dev.desktop
npm run dev:icon:remove    # cofa zmiany
```

Następnie uruchom ponownie okno dev, a dock pokaże ikonę aplikacji.

### Budowanie wersji wydanej

**Windows**

```bash
npm run tauri:build
```

Artefakty:
- Przenośny exe: `src-tauri/target/release/yizimarkdown.exe`
- Instalator NSIS: `src-tauri/target/release/bundle/nsis/`

Instalator: przy pierwszej instalacji wybierany jest język instalacji (16 opcji: wszystkie języki interfejsu aplikacji + portugalski brazylijski); tekst kreatora i język pierwszego uruchomienia po instalacji są zgodne z tym wyborem; aktualizacje / automatyczne aktualizacje nie resetują wybranego języka. Ikony oraz grafiki paska bocznego / nagłówka znajdują się w `src-tauri/installer/`; po zmianie kolorów marki uruchom ponownie `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1`, aby je wygenerować.

Po zbudowaniu ręcznie skopiuj exe i pliki zasobów do katalogu `public/YiziMarkdown-vX.X.X/` w celu dystrybucji.

**macOS (uniwersalny plik binarny, Intel i Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artefakty:
- Pakiet aplikacji: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Instalator: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux (deb + AppImage)**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

Artefakty (**obecnie dostępne tylko amd64 / x86_64**; deb `arm64` i AppImage `aarch64` dla ARM nie są jeszcze publikowane):
- Pakiet Debian: `src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb` (około 16 MB, instaluje się w `/usr/bin`, rejestruje pozycję menu, ikonę i skojarzenia plików `.md` / `.epub`)
- Przenośny AppImage: `src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage` (około 100 MB, zawiera GTK / WebKit i komponenty multimedialne GStreamer, działa po dwukrotnym kliknięciu)

Uwaga: **buduj na Ubuntu 22.04**. Pliki binarne zbudowane na 24.04 wymagają glibc 2.39 i nie uruchomią się na Ubuntu 22.04 (2.35) / Debianie 12 (2.36); zależność `deb` od `libwebkit2gtk-4.1-0` również wyznacza tę samą minimalną wersję (Debian 11 ma tylko webkit 4.0). `rpm` nie jest obecnie udostępniany: Fedora / openSUSE mają inne nazwy zależności niż systemy z rodziny Debian i wymagałyby osobnej obsługi.

### Struktura projektu

```
code/
├── src/                    # Kod źródłowy front-endu
│   ├── App.tsx             # Główny komponent aplikacji
│   ├── components/         # Komponenty UI
│   │   ├── Editor.tsx      # Edytor CodeMirror + podgląd
│   │   ├── Reader.tsx      # Tryb czytania (podział / przewracanie stron)
│   │   ├── Slideshow.tsx   # Tryb prezentacji
│   │   ├── TabBar.tsx      # Pasek kart
│   │   ├── HomePage.tsx    # Strona startowa (ostatnie pliki)
│   │   ├── Toolbar.tsx     # Pasek narzędzi
│   │   ├── Sidebar.tsx     # Pasek boczny (konspekt + przeglądarka plików)
│   │   ├── StatusBar.tsx   # Dolny pasek stanu
│   │   └── SettingsModal.tsx # Panel ustawień
│   ├── stores/             # Zarządzanie stanem Zustand
│   ├── lib/                # Biblioteki narzędziowe (renderowanie Markdown, motywy, tryb Zen itp.)
│   └── styles/             # Style globalne
├── src-tauri/              # Backend Rust
│   ├── src/main.rs         # Polecenia Tauri (I/O plików, ładowanie motywów, rejestr itp.)
│   ├── icons/              # Ikony aplikacji
│   ├── themes/             # CSS motywów (z metadanymi theme.json)
│   └── templates/          # Szablony dokumentów
├── docs/                   # Dokumentacja (changelog / wielojęzyczne readme i18n / THEME-DESIGN-SPEC.md)
└── package.json
```

---

## Wersje i aktualizacje

Wersja instalacyjna dla Windows obsługuje aktualizacje jednym kliknięciem w aplikacji; macOS, Linux i wersja przenośna sprawdzają `latest.json` przy uruchomieniu, a gdy pojawi się nowa wersja, wyświetlają powiadomienie w prawym dolnym rogu i otwierają stronę pobierania odpowiedniej wersji (wymiana ręczna, bez automatycznej instalacji; zarówno `deb`, jak i `AppImage` dla Linuxa korzystają z tej ścieżki).

---

## Licencja

MIT
