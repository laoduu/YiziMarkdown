# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](../../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md) | [Русский](./readme-ru.md)

**Resmi web sitesi:** https://md.yizigpt.com

YiziMarkdown, yazmayı merkeze alan platformlar arası bir Markdown editörüdür. Aynı `.md` dosyası yedi farklı sunum biçimi sunar: `kaynak düzenleme`, `yan yana düzeltme`, `canlı yazma`, `bitmiş önizleme`, `slayt sunumu`, `kitap gibi okuma` ve yalnızca metni bırakıp yazmaya odaklanan `zen modu`.

- **Windows**: Kurulabilir (NSIS yükleyicisi, uygulama içinden tek tıkla güncelleme desteklenir) veya taşınabilir zip paketini indirip açarak hemen kullanılabilir
- **macOS**: Intel ve Apple Silicon'da yerel olarak çalışan evrensel ikili (universal binary) kurulum paketi sunulur
- **Linux**: Debian tabanlı `deb` ve kurulum gerektirmeyen `AppImage` (Ubuntu 22.04+ / Debian 12+, şimdilik yalnızca amd64)

Neden bir Markdown editörü geliştirelim ki? Piyasadaki seçenekler ya görsel olarak hoş değil ya da gereğinden fazla özellikle şişkin; hem sade ve estetik hem de kullanımı keyifli bir araç bulmak zor. İşte YiziMarkdown böyle doğdu ve üç ilkeye bağlı kaldı: **güzel arayüz**, **güçlü özellikler**, **çok yönlü senaryolar**.

Böylece bugünkü `YiziMarkdown` ortaya çıktı: `3 işletim sistemi desteği`, `7 kullanım modu`, `16 arayüz dili`, `15 açık/koyu çift tonlu tema`, `5 AI Skill`, `7 dışa aktarma biçimi` sunuyor; ayrıca yerleşik AI asistanı, bulut depolama gibi yenilikçi özellikler ve tema, yetenek, sunum gibi açık dokümantasyonla çok daha farklı kullanım deneyimleri oluşturabilirsiniz.

Bu artık basit bir Markdown editörü değil; yaratıcılık, iş ve günlük yaşamınızdaki birçok belge senaryosunu gerçekten kapsayan çok işlevli bir uygulama.

---

## Yedi Mod: Tek Belge, Yedi Sunum

Markdown'ın değeri yalnızca «yazmak»ta değil, «kime, nasıl gösterileceği»nde de yatar. YiziMarkdown aynı belge için yedi sunum biçimi sunar: ilk dördü, kaynak ile bitmiş çıktı arasında gidip gelen düzenleme görünümleridir; son üçü ise belgeyi slayta, kitap sayfasına ya da yalnızca metne dönüştüren bağımsız senaryolardır.

| Mod | Tek cümlelik tanım | Giriş | En uygun olduğu |
|------|-----------|------|------|
| Kaynak | Ham Markdown'ı doğrudan düzenleyin | `F3` / görünüm düğmeleri | Yapıyı ince ayarlama, toplu değiştirme, frontmatter düzenleme |
| Yan yana | Solda yazın, sağda anında karşılaştırın | `F3` / görünüm düğmeleri | Dizgi düzeltmesi, şablonla karşılaştırmalı yazma |
| Canlı | Ne görürseniz onu alırsınız, işaretler otomatik gizlenir | `F3` / görünüm düğmeleri | Uzun metin yazımı, odaklanmış yazma |
| Önizleme | Yalnızca nihai dizgiyi gösterir | `F3` / görünüm düğmeleri | Çıktıyı kontrol etme, metni baştan sona okuma |
| Sunum | Belgeyi doğrudan slayt olarak oynatır | `Ctrl+Alt+P` / araç çubuğu | Paylaşım, raporlama, ders anlatımı |
| Okuma | Belgeyi çevrilebilir bir kitap gibi dizer | `Ctrl+Alt+R` / araç çubuğu | Uzun metin okuma, EPUB, sürükleyici okuma |
| Zen | Tüm arayüzü kaldırır, yalnızca metni bırakır | `F9` / araç çubuğu | Derin yazma |

`F3` kaynak / yan yana / canlı / önizleme arasında döner; sunum, okuma ve zen modunun kendi girişi vardır ve birbirleriyle çakışmaz.

---

## Markdown'ın Dört Temel Yeteneği

![Dört mod karşılaştırması](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

Kaynak, yan yana, canlı ve önizleme aynı editör çekirdeğini ve aynı Markdown yeteneklerini paylaşır; tek fark bilgi yoğunluğudur: tamamen çıplak işaretlerden tamamen dizilmiş çıktıya kadar. İstediğiniz an geçiş yapabilirsiniz; geçiş sırasında görünüm mümkün olduğunca mevcut konumu korur.

### Kaynak Modu: Görmeniz Gereken Her Şey

- CodeMirror 6 çekirdeği: sözdizimi vurgulama, parantez eşleştirme, otomatik tamamlama
- Satır numaraları ve otomatik satır kaydırma bağımsız olarak açılıp kapatılabilir; satır satır ince ayar ve toplu yeniden yazma için uygundur
- YAML frontmatter olduğu gibi gösterilir; meta verileri düzenlerken biçim tahmin etmeniz gerekmez
- Tablolar, kod blokları ve formüller kaynak biçiminde görünür; yapı karmaşıklaştığında en kontrol edilebilir seçenek budur

### Yan Yana Modu: Yazarken Karşılaştır

- Solda kaynak, sağda önizleme; yazdıkça yenilenir
- Kaydırma senkronizasyonu ana hat tarafından yönlendirilir; görünüm değiştirildiğinde otomatik olarak mevcut konuma gidilir
- Dizgi düzeltmesi ve mevcut bir belgeye göre yapıyı değiştirmek için uygundur

### Canlı Mod: Ne Görürsen Onu Alırsın

- Yazarken Markdown işaretleri otomatik gizlenir, imleç ayrılınca geri gelir; odağınız içerikte kalır
- 4 özgün işaret görünme animasyonu (Odak / Flaş / Işıma / Dalgalanma), ayarlarda önizlenebilir ve değiştirilebilir
- YAML front matter, Obsidian tarzı düzenlenebilir özellik paneli olarak işlenir: otomatik / metin / sayı / onay kutusu / tarih / tarih ve saat / liste olmak üzere 7 tür; tür, özellik adına göre global olarak hatırlanır

### Önizleme Modu: Yalnızca Bitmiş Çıktı

- Markdown yazdıkça işlenir; görev listesi onay kutuları doğrudan tıklanabilir
- Yerel yollu görseller, internet görselleri ve SVG otomatik olarak işlenir (jpg / png / gif / webp / svg / bmp)
- frontmatter otomatik gizlenir; gördüğünüz nihai dizgidir

### Dört Görünümün Ortak Yetenekleri

- **Arama ve değiştirme**: eşleşmeler arasında gezinme, tümünü değiştirme
- **Araç çubuğu biçimlendirme**: kalın, italik, üstü çizili, satır içi kod; seçim anında sarılır
- **Kod bloğu geliştirmeleri**: highlight.js sözdizimi vurgulama, dil etiketleri, kopyalama düğmesi, otomatik satır kaydırma geçişi
- **Tablo seçici**: 8×8 ızgaradan tıklayarak ekleme; satır ve sütun sayısı bir bakışta görülür, satır/sütun ekleme-silme ve sağ tık çok işlevli menü eksiksizdir
- **Formüller ve diyagramlar**: KaTeX satır içi `$...$` / blok `$$...$$`; Mermaid akış diyagramları, sıra diyagramları, Gantt şemaları, sınıf diyagramları, pasta grafikleri vb.; renkler temaya uyar
- **Biçim araç çubuğunu daraltma**: pencere daraldığında otomatik olarak toplanır, elle de açılabilir
- **Satır numaraları ve otomatik satır kaydırma**: ayarlardan açılıp kapatılabilir
- **Ana hat gezinme**: başlık hiyerarşisi belge yapısından gelir ve kaydırma konumuyla bağlantılıdır

---

## Sunum Modu: Notlarınızı Tek Tıkla Slayta Dönüştürün

![Sunum modu](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

Yazdığınız notları artık PPT'ye aktarmanız gerekmiyor: yerleşik AI asistanı yeteneğiyle tek tıkla sade bir sunum sürümüne dönüştürün, sunum moduna geçin ve belge anında tam ekran slayta dönüşsün. Sayfalama, sütunlar ve düzen, Markdown yapısından otomatik olarak çıkarılır; hassas kontrol gerektiğinde HTML yorum yönergelerini kullanın.

### İçerik Slaytın Kendisidir

- Ek biçim gerekmez: `---` (yatay ayırıcı) yeni sayfa başlatır
- Sayfa içinde tek başına bir satırda yer alan `***` sütunlara böler, en fazla 4 sütun
- Motor tüm sayfa yapısını analiz eder ve düzeni otomatik seçer: başlık, liste, tablo, kod, görsel ve diyagramların her biri için ayrı düzen vardır

### 14 Düzen

Kapak, bölüm sayfası, kapanış sayfası, gündem, içerik, liste, veri tablosu, yol haritası, metin + görsel, görsel, alıntı, kod, diyagram (Mermaid), formül.

- «Metin + görsel» düzeni `<!-- layout: figure -->` ile açıkça belirtilmelidir; diğer tüm düzenler içerikten otomatik olarak çıkarılır
- İçerik sayfaları sola hizalanır, başlığın altında tema renginde bir alt çizgi bulunur
- Alıntı sayfasında çapraz büyük tırnaklar: açılış tırnağı sol üstte, kapanış tırnağı sağ altta, içerik dikeyde ortalanır
- Kapak, front matter'daki `author` / `date` alanlarını otomatik okur

### Sunum Sırasında Dizgi Kontrolü

- HUD ile ayarlanabilir: yazı tipi (temaya uy / sans-serif / serif / eş aralıklı), yazı kalınlığı, yazı boyutu, içerik alanı genişliği/yüksekliği (%50–%95)
- Değişiklikler anında etkili olur ve kalıcıdır; sonraki sunumlarda da geçerli kalır
- Uzun satır içi kodlar otomatik olarak sarılır, sayfa kenarında kesilmez
- Açık yönergeler: `<!-- layout: xxx -->` düzeni zorlar, `<!-- align: left|center|right -->` tüm sayfayı hizalar

### Sunum ve Gezinme

- Sol altta bölüm adı + sayfa numarası, alt kenarda tema renkli ilerleme çubuğu
- `T` içindekiler çekmecesini açar, `G` veya alt giriş kutusu sayfaya atlar
- Fare tekerleğiyle sayfa çevirme: içerik kaydırılabiliyorsa önce içerik kayar, sınıra gelince sayfa döner
- `F` tam ekran / geri alma; normal, büyütülmüş vb. herhangi bir pencere durumundan girilebilir
- Çıkışta önceki pencere durumu otomatik geri yüklenir; sağ üstteki çıkış düğmesi 1,5 saniye işlem yapılmazsa otomatik gizlenir
- Tema devralma: başlık renkleri temayla değişir; sunum sırasında da tema ve açık/koyu mod değiştirilebilir

---

## Okuma Modu: Belgeyi Çevrilebilir Bir Kitaba Diz

![Okuma modu](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

Okuma modu «tam ekran önizleme» değildir; metni gerçekten sabit sayfalara dizer: kapağı, başlık sayfası, içindekiler, sayfa numaraları, kâğıt ve sayfa çevirme animasyonları vardır.

- Giriş: araç çubuğundaki kitap düğmesi veya `Ctrl+Alt+R`; `Esc` çıkar ve önceki görünümü geri yükler
- Düzen: kitap sayfalarını dört yanı eşit kenar boşluklu ince bir çerçeve sarar; iki sayfa birleşir ve ortada yalnızca tek bir ayırıcı çizgi olur; kitap adı sol üstte, bölüm adı / sayfa numarası sol altta, HUD sağ altta — konumlar sunum moduyla aynıdır
- Kapak, başlık sayfası ve içindekiler sayfası otomatik oluşturulur: kitap adı front matter'daki `title` veya ilk H1'den alınır; içindekiler başlıklara göre sayfa numaralarıyla oluşturulur, çok uzunsa otomatik sayfalanır
- Gerçek sayfalama: iki sayfa açık (dar pencerede otomatik tek sayfa), sayfa numaraları ve okuma ilerlemesi vardır

### Sayfa Çevirme Animasyonları

4 seçenek, ayarlardan değiştirilir, varsayılan yatay kaydırmadır:

- **Yatay kaydırma** (varsayılan): tüm sayfa kayar, net ve hızlı
- **3D çevirme**: yaprak sağ alt köşeden kıvrılır ve orta çizgi etrafında bükülür; çevrilirken kâğıt yüzeyi kalkar, ışık ve gölge alır (tek sayfa modunda kitap sırtı etrafında)
- **Solma** / **Yakınlaştırma**: daha sakin geçişler

Hızlı ardışık basışlar sayfa atlamaz; içindekiler, sayfa numaraları ve dipnotlardan yapılan atlamalarda animasyon oynatılmaz.

### Sayfa Düzeyinde Sayfalama Kuralları

Paragraflar satır bazında bölünür, başlıklar tek başına kalmaz, tablo devam sayfalarında başlık satırı tekrarlanır, kod blokları satır satır devam eder, listeler öğe öğe devam eder, tam blok görseller oransal olarak ölçeklenir; gövde paragraflarına otomatik olarak iki karakterlik ilk satır girintisi uygulanır, devam sayfalarında bu girinti tekrarlanmaz.

### Gezinme ve Ayrıntılar

- İçindekiler çekmecesi: `T` ile açılır, başlık hiyerarşisine göre listelenir ve sayfa numaraları belirtilir; tıklayınca doğrudan gidilir
- `G` veya sayfa numarası giriş kutusu belirtilen sayfaya atlar
- Dipnot gidiş-dönüşü: bir referansa tıklandığında tanım sayfasına gidilir ve vurgulanır, «referansa dön» düğmesi sunulur; iç bağlantılar da sayfa bazında atlar
- Okuma HUD'u: sağ alttan açık/koyu, tema, yazı tipi (tema / serif / sans-serif / eş aralıklı), yazı boyutu ve satır aralığı değiştirilir; yalnızca bu okuma oturumu için geçerlidir
- Konum belleği: belge bazında sayfa / bölüm hatırlanır, tekrar girildiğinde otomatik geri yüklenir
- Kullanım: yön tuşları, PageUp / PageDown, boşluk, fare tekerleği ile sayfa çevirme; sayfanın sol veya sağ kenarına tıklayarak da çevrilebilir

### EPUB

Bir `.epub` açtığınızda doğrudan okuma moduna girilir: uygulamanın okuma teması kullanılır (yayıncı CSS'i yok sayılır), gömülü kapak, gezinti içindekileri, görseller, formüller, Mermaid SVG, dipnotlar ve bölümler arası bağlantılar okunur. DRM şifreli ve sabit düzenli (çizgi roman / resimli kitap) EPUB'lar şimdilik desteklenmez.

---

## Zen Modu: Yalnızca Metin Kalsın

![Zen modu](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

`F9` veya araç çubuğundaki zen modu düğmesiyle girilir. Araç çubuğu, sekme çubuğu, kenar çubuğu, AI paneli ve durum çubuğu katman katman ekran kenarlarına doğru katlanıp solar, yalnızca metin kalır; bu süreçte **düzen değişmez**, metin bir piksel bile kaymaz.

- **Dünya hâlâ orada**: fareyi ekranın herhangi bir kenarına (üst / sol / sağ / alt) yaklaştırın, ilgili bölge yerinde yavaşça geri gelir; yaklaşık 1,2 saniye uzaklaşınca otomatik olarak geri çekilir
- **Kalıcı geçiş**: zen modu düğmesi kaybolmaz, her zaman aynı yerde durur (çevresinde çok hafif bir nefes dalgası); hem «zen modundasınız» durumunun çıpası hem de çıkış yoludur; `F9` / `Esc` ile de çıkılır
- **Yalnızca yazmaya hizmet eder**: yalnızca kaynak / canlı modda kullanılabilir; yan yana veya önizlemeye geçmek ya da okuma / sunuma girmek otomatik olarak çıkar
- **Daha temiz bir kâğıt**: satır numaraları ve kenar çubuğu dikey çizgileri gizlenir, çok hafif bir vinyet, imleç 2 saniye hareketsiz kalınca otomatik gizlenir; dikey kaydırma çubuğu minimal ince bir çubukla değiştirilir, kaydırma sırasında veya sağ kenara yaklaşınca görünür

---

## Dosyalar ve Yazma

### Dosyalar ve Sekmeler

- **Açma**: `.md` / `.markdown` / `.txt` / `.epub` desteklenir; EPUB doğrudan okuma moduna girer
- **Tek örnek modu**: birden fazla dosya açıldığında otomatik olarak mevcut pencereye birleştirilir; zaten açık olan dosya ilgili sekmeye odaklanır
- **Sekme çubuğu**: geçiş, kapatma, yeni oluşturma; sürükleyerek sıralama desteklenir
- **Ana sayfa**: son açılan dosyaların listesi, boyut ve değiştirme zamanıyla birlikte
- **Kaydetme durumu**: kaydedilmemiş dosyalarda nefes alan nokta, kaydettikten sonra ✅ onay animasyonu
- **Kapatma onayı**: kaydedilmemişse «Kaydet» / «Kaydetme» / «İptal» iletişim kutusu çıkar

### Yeni Belgeler ve Şablonlar

- Yeni boş sekme «Adsız yeni dosya» gösterir
- Araç çubuğundaki «Şablondan yeni» şablonun Markdown yapısına göre belge oluşturur; Ayarlar → Genel bölümünde varsayılan şablon da belirlenebilir, ardından `Ctrl+N` otomatik olarak uygular
- Şablonlar kullanıcı dizininde saklanır; bir `.md` dosyası koyarak kullanabilir veya Ayarlar → Şablonlar bölümünde yeni oluşturup düzenleyebilirsiniz

### Yapıştır, Markdown Olsun

Web sayfaları, Word / DOCX, Google Docs, Notion gibi kaynaklardan kopyalanan zengin metin, yapıştırılırken bellekte düzgün Markdown'a dönüştürülür (başlıklar / listeler / tablolar / kod / alıntılar / bağlantılar); mevcut Markdown kaynağı ve düz metin olduğu gibi yapıştırılır.

### Kaydetme ve Dışa Aktarma

- **Kaydet / otomatik kaydet**: elle kaydetme + yapılandırılabilir aralık (5–180 saniye, varsayılan 60 saniye)
- **Farklı kaydet**: yeni dosya kaydedilirken farklı kaydet iletişim kutusu otomatik açılır
- **Dışa aktarma**: HTML / Markdown / düz metin / Word (DOCX) / PDF / PPTX / EPUB
  - DOCX, Word'ün yerel anlamlarını kullanır (listeler, tablolar, kod blokları, alıntılar, görev listeleri); tablo stili önizlemeyle uyumludur; görsellerde yerel yollar, internet görselleri ve HTML `<img>` desteklenir (genişlik `width` ile kontrol edilebilir)
  - PDF, önizlemeyle aynı sadakattedir ve otomatik olarak sayfalanır
  - HTML, solda yüzen bir ana hat kartı içerir; öğeye tıklayınca bölüme gidilir (PDF'te kenar çubuğu yoktur)
  - PPTX, sunum modunun temasını, açık/koyu modunu ve düzenlerini devralır; düzenlenebilir metin, tablolar, görseller, şekiller ve yerel formüller üretir
  - EPUB yerleşik eklenti tarafından sağlanır; dışa aktarmadan önce bölüm bölme / kapak / görünür içindekiler / okuma teması / belge bilgileri seçilebilir
- **.md dosya ilişkilendirmesi**: ayarlardan tek tıkla sistem varsayılan Markdown editörü yapılır (Windows kayıt defteri / macOS LaunchServices)

### Bulut Depolama (WebDAV)

- **Dosya tarayıcısı**: kenar çubuğundaki «Bulut» sekmesi sunucu dizin ağacında gezinir; belge açma, dosya / klasör oluşturma, yeniden adlandırma, taşıma, silme yapılabilir; derin dizinlerde gezinti yolu «…» olarak katlanır ve açılır menüyle atlanabilir, klasörler ihtiyaç duyuldukça katman katman yüklenir
- **Buluta kaydet**: yerel belgeyi tek tıkla yükleyin; metinde göreli olarak başvurulan görseller de dizin yapısı korunarak yüklenir; bulut belgelerinde `Ctrl+S` doğrudan geri yazar
- **Çakışma koruması**: kaydetmeden önce ETag karşılaştırılır; dosya başka bir cihazda değiştirilmişse «sunucu sürümünün üzerine yaz» veya «yerel değişikliklerimi bırak ve yeniden yükle» seçeneği sunulur; asla sessizce üzerine yazılmaz
- **Kimlik bilgisi güvenliği**: kullanıcı adı ve parola sistem kimlik bilgisi deposuna kaydedilir (Windows Kimlik Bilgisi Yöneticisi / macOS Anahtarlık), yapılandırma dosyalarına yazılmaz
- **Uyumluluk**: Nutstore, Nextcloud, Synology gibi standart WebDAV hizmetleri (uygulamaya özel parola kullanılması önerilir)

---

## Uzantılar ve Kişiselleştirme

### AI Asistanı (Yan Sohbet Paneli)

- **18 büyük model sağlayıcısı + özel hizmet**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen, Zhipu GLM, Moonshot Kimi, Volcano Engine, SiliconFlow, MiniMax, Xiaomi MiMo, Meituan LongCat, OpenRouter, OpenCode Go, Ollama (yerel); «özel hizmet» OpenAI uyumlu / Anthropic uyumlu iki protokolü destekler, Base URL, model ID ve anahtar kendiniz girilir
- **Akışlı sohbet**: araç çubuğundaki robot düğmesi sağ paneli açar, yanıtlar gerçek zamanlı akışla çıkar ve istenildiği an durdurulabilir
- **Düşünme süreci**: akıl yürütme modellerinin reasoning / thinking çıktısı katlanabilir blokta gösterilir, varsayılan olarak kapalıdır
- **Anahtar güvenliği**: API anahtarları sistem anahtarlığında saklanır, tek tıkla kaydetme, temizleme ve doğrulama desteklenir; yerel uç noktalar (llama.cpp / LM Studio / vLLM vb.) boş bırakılabilir
- **Mevcut belgeyi referans al**: işaretlendiğinde geçerli belge bağlam olarak gönderilir; başvuru üst sınırı (64K–512K / sınırsız) ve bağlam tur sayısı (0–20, varsayılan 3) yapılandırılabilir
- **Sonucu belgeye aktarma**: kopyala, imleç konumuna ekle veya tek tıkla yeni belge olarak oluştur

### AI Yetenekleri (Skill)

Giriş kutusundaki ⚡ düğmesi yetenek menüsünü açar; seçilen yetenek etiketi imleç konumuna eklenir ve istem (prompt) otomatik olarak bağlama enjekte edilir. `skills/` dizinine `skills.json` + `.md` istemleri koyarak kendinizinkileri tanımlayabilirsiniz. Yerleşik 5 yetenek: «Sunum taslağı çıkarma», «Belge özeti», «Üslup düzeltme», «Tam metin çevirisi», «Markdown biçimlendirme».

### Eklentiler

- **Temel yetenekler varsayılan olarak yerleşiktir**: KaTeX / Mermaid / dipnotlar / görev listeleri / TOC gibi belge anlambilimi işlevleri eklenti anahtarlarından etkilenmez
- **Yerleşik eklenti**: EPUB dışa aktarma (varsayılan olarak etkin, Eklentiler sayfasından kapatılabilir; etkinleştirildiğinde araç çubuğunun dışa aktarma menüsü görünür)
- **Eklenti standardı**: manifest (sürüm / API sürümü / etkinleşme zamanı / izinler / yetenekler) → uygunluk denetimi → ihtiyaç anında etkinleştirme → yetenek kaydı → devre dışı bırakma temizliği; mevcut sürüm yalnızca uygulamaya derlenmiş yerleşik eklentileri yükler

### Temalar ve Görünüm

- **15 yerleşik tema**: Liquid Glass Prism (varsayılan), Akademik Mavi, Canlı Turuncu, Teknoloji, Minimalist, Dergi, Doğa, Liçi Kırmızısı, Menekşe, Cyberpunk, Facebook, Matrix, Nane, Gün Batımı, Retro Daktilo; her birinin açık ve koyu iki renk paleti vardır
- **Koyu / açık mod**: tek tıkla geçiş (`F2`)
- **Yazı tipi özelleştirme**: kaynak ve önizleme için ayrı yazı tipi, yazı boyutu ve satır yüksekliği
- **Özel tema**: Ayarlar → Görünüm → Özel CSS bölümünde yazıp kaydedin; mevcut temayı temel alan bir «özel tema» oluşturulur; tam bir yeni tema yapıştırabilir veya yalnızca birkaç rengi değiştirebilirsiniz, kaydettiğinizde hemen etkili olur
- **Tema uzantısı**: `themes/` dizinine bir `.css` koyun ve `themes/theme.json` dosyasında parametreleri kaydedin; yeniden başlatınca otomatik algılanır; belirteç sistemi ve kurallar için `docs/THEME-DESIGN-SPEC.md` dosyasına bakın

### Diller ve Arayüz

- **16 arayüz dili**: Basitleştirilmiş Çince (varsayılan), Geleneksel Çince, English, 日本語, 한국어, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська, Русский
- Ayarlar → Genel → Arayüz dili ile tek tıkla geçiş yapılır, anında etkili olur; arayüz metinleri, kısayol paneli ve eklenti açıklamaları dile göre değişir
- **İlk açılışta otomatik uyarlama**: yükleyici dil seçimi yoksa sistem diline göre seçilir; desteklenen listede yoksa English'e düşer; dil öğelerinde İngilizce `Language` etiketi de bulunur, Çince arayüzde bile hızlıca bulunabilir
- **Arayüz yazı boyutu**: %80–%120 (varsayılan %100); yalnızca arayüz metinlerini ve simgeleri ölçekler, panel boyutları ve belge içeriği etkilenmez
- **Ayarlar paneli**: Genel, Görünüm, Editör, Canlı Mod, AI Asistanı, Bulut, Eklentiler, Kısayollar, Şablonlar, Belge, Hakkında, Ürün; ayarlar anında önizlenir

---

## Klavye Kısayolları

| Kısayol | İşlev | Kısayol | İşlev |
|--------|------|--------|------|
| Ctrl+N | Yeni dosya | Ctrl+B | Kalın |
| Ctrl+O | Dosya aç | Ctrl+I | İtalik |
| Ctrl+S | Dosyayı kaydet | Ctrl+- | Üstü çizili |
| Ctrl+Shift+S | Farklı kaydet | Ctrl++ | Satır içi kod |
| Ctrl+W | Sekmeyi kapat | Ctrl+1 | Başlık 1 |
| Ctrl+H | HTML dışa aktar | Ctrl+2 | Başlık 2 |
| Ctrl+M | Markdown dışa aktar | Ctrl+3 | Başlık 3 |
| Ctrl+Z | Geri al | Ctrl+. | Sırasız liste |
| Ctrl+Y | Yinele | Ctrl+0 | Sıralı liste |
| Ctrl+F | Ara | Ctrl+' | Alıntı |
| Ctrl+\ | Kenar çubuğunu değiştir | Ctrl+K | Bağlantı |
| F1 | Tüm kısayollar | Ctrl+` | Kod bloğu |
| F2 | Açık/koyu modu değiştir | Ctrl+T | Tablo |
| F3 | Dört düzenleme görünümü arasında döngü | Ctrl+L | Ayırıcı çizgi |
| F9 | Zen modu (yalnızca kaynak / canlı) | Ctrl+Alt+P | Sunum modu (slayt) |
| F11 | Tam ekranı değiştir | Ctrl+Alt+R | Okuma modu |
| Ins | Eğik çizgi menüsü | F12 | Geliştirici araçları |

Kısayollar Ayarlar → Kısayollar bölümünde özelleştirilebilir: 36 action için görsel bağlama, tuş kaydı, çakışma algılama ve varsayılana dönme.

---

## Dizin Yapısı

Taşınabilir sürüm arşivden çıkarıldıktan sonra:

```
YiziMarkdown/
├── YiziMarkdown.exe        # Ana program
├── readme.md               # Proje açıklaması (bu dosya)
├── welcome.md              # Hoş geldin belgesi
├── docs/                   # Belgeler (THEME-DESIGN-SPEC.md tema tasarım kuralları vb.)
├── user.css                # Kullanıcı özel stilleri
├── keybindings.json        # Kısayol yapılandırması
├── themes/                 # Tema CSS dosyaları
│   ├── liquidglass-prism.css # Liquid Glass Prism (varsayılan)
│   ├── academic.css        # Akademik Mavi
│   ├── vibrant.css         # Canlı Turuncu
│   ├── tech.css            # Teknoloji
│   ├── minimal.css         # Minimalist
│   ├── magazine.css        # Dergi
│   ├── nature.css          # Doğa
│   ├── lychee.css          # Liçi Kırmızısı
│   ├── violet.css          # Menekşe
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Nane
│   ├── sunset.css          # Gün Batımı
│   └── typewriter.css      # Retro Daktilo
├── skills/                 # AI yetenekleri (Skill)
│   ├── skills.json         # Yetenek listesi
│   ├── slides-outline.md   # Sunum taslağı çıkarma
│   ├── doc-summary.md      # Belge özeti
│   ├── polish-writing.md   # Üslup düzeltme
│   ├── translate-fulltext.md # Tam metin çevirisi
│   └── markdown-format.md  # Markdown biçimlendirme
└── templates/              # Yerleşik belge şablonları (ilk açılışta kullanıcı dizinine senkronize edilir)
    ├── default.md          # Varsayılan şablon
    └── Slide-Template.md   # Sunum şablonu
```

> İpucu: AI yetenekleri ve belge şablonları aslında **kullanıcı dizininde** saklanır — Windows / macOS'ta `~/Documents/yizimarkdown/skills/` ve `.../templates/`; Linux'ta XDG belgeler dizini altındaki `yizimarkdown/` (ör. `~/Documents/yizimarkdown/`), sistemde belgeler dizini yoksa yedek olarak `~/.local/share/yizimarkdown/`. (Program dizinindeki aynı adlı klasörler yerleşik kaynaklardır ve ilk açılışta oraya senkronize edilir.) Özel içeriklerinizi kullanıcı dizinine koyun; yükseltme / yeniden yükleme sırasında üzerine yazılmaz.

---

## Teknoloji Yığını

| Katman | Teknoloji |
|------|------|
| Masaüstü çerçevesi | Tauri 2 (Rust) |
| Ön uç çerçevesi | React 18 + TypeScript |
| Editör çekirdeği | CodeMirror 6 |
| Durum yönetimi | Zustand (persist) |
| Stil yaklaşımı | Tailwind CSS + CSS değişkenleri |
| Markdown işleme | markdown-it |
| Uluslararasılaştırma | Kendi geliştirdiğimiz hafif i18n (16 dil) |
| AI entegrasyonu | Rust akış proxy'si (OpenAI / Anthropic / Ollama protokolleri) |
| Derleme aracı | Vite |

---

## Geliştirme

### Gereksinimler

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Geliştirme Sunucusunu Başlatma

```bash
cd code
npm install
npm run tauri:dev
```

### Linux Geliştirme Modunda Dock Simgesi (isteğe bağlı)

elementary / GNOME gibi masaüstü ortamları, pencerenin `WM_CLASS` değerine göre aynı adlı `.desktop` dosyasındaki `Icon` alanını arar; geliştirme modunda yükleyici olmadığı için `.desktop` dosyası da yoktur ve Dock yalnızca genel bir simge gösterir (pencerenin kendi `_NET_WM_ICON` değeri Rust tarafında zaten eklenmiştir, yükleyici paketleri etkilenmez). Bir kez çalıştırın:

```bash
npm run dev:icon           # ~/.local/share/applications/yizimarkdown-dev.desktop dosyasını yazar
npm run dev:icon:remove    # geri alır
```

Ardından geliştirme penceresini yeniden başlatın; Dock uygulama simgesini gösterir.

### Yayın Sürümü Oluşturma

**Windows**

```bash
npm run tauri:build
```

Derleme çıktıları:
- Taşınabilir exe: `src-tauri/target/release/yizimarkdown.exe`
- NSIS yükleyicisi: `src-tauri/target/release/bundle/nsis/`

Yükleme sihirbazı: ilk kurulumda önce yükleme dili seçilir (16 seçenek: uygulamanın tüm arayüz dilleri + Brezilya Portekizcesi); sihirbaz metinleri ve kurulum sonrası ilk açılıştaki dil bu seçime uyar; yükseltme / otomatik güncelleme kullanıcının seçtiği dili sıfırlamaz. Simgeler ve kenar çubuğu / üst bilgi görselleri `src-tauri/installer/` dizinindedir; marka renklerini değiştirdikten sonra `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1` ile yeniden oluşturun.

Derlemeden sonra exe ve kaynak dosyalarını dağıtım için `public/YiziMarkdown-vX.X.X/` dizinine elle kopyalayın.

**macOS (evrensel ikili, Intel ve Apple Silicon'u birlikte destekler)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Derleme çıktıları:
- Uygulama paketi: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Yükleyici: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux (deb + AppImage)**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

Derleme çıktıları (**şimdilik yalnızca amd64 / x86_64 sağlanır**; ARM `arm64` deb ve `aarch64` AppImage henüz yayımlanmıyor):
- Debian paketi: `src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb` (yaklaşık 16 MB, `/usr/bin` altına kurulur, menü öğesi, simge ve `.md` / `.epub` dosya ilişkilendirmelerini kaydeder)
- Kurulum gerektirmeyen taşınabilir sürüm: `src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage` (yaklaşık 150 MB, GTK / WebKit ve GStreamer medya bileşenlerini içerir, çift tıklayarak kullanılır)

Not: **Ubuntu 22.04 üzerinde derlenmelidir**. 24.04'te derlenen ikili dosyalar glibc 2.39 gerektirir; Ubuntu 22.04 (2.35) / Debian 12 (2.36) üzerinde doğrudan başlatma başarısız olur; `deb` paketinin `libwebkit2gtk-4.1-0` bağımlılığı da alt sınırı aynı şekilde Ubuntu 22.04 / Debian 12'ye sabitler (Debian 11'de yalnızca webkit 4.0 vardır). `rpm` sağlanmıyor: Fedora / openSUSE'un bağımlılık adları Debian tabanlı dağıtımlardan farklıdır ve ayrı bakım gerektirir.

### Proje Yapısı

```
code/
├── src/                    # Ön uç kaynak kodu
│   ├── App.tsx             # Ana uygulama bileşeni
│   ├── components/         # UI bileşenleri
│   │   ├── Editor.tsx      # CodeMirror editörü + önizleme
│   │   ├── Reader.tsx      # Okuma modu (sayfalama / sayfa çevirme)
│   │   ├── Slideshow.tsx   # Sunum modu
│   │   ├── TabBar.tsx      # Sekme çubuğu
│   │   ├── HomePage.tsx    # Ana sayfa (son dosyalar)
│   │   ├── Toolbar.tsx     # Araç çubuğu
│   │   ├── Sidebar.tsx     # Kenar çubuğu (ana hat + dosya tarayıcısı)
│   │   ├── StatusBar.tsx   # Alt durum çubuğu
│   │   └── SettingsModal.tsx # Ayarlar paneli
│   ├── stores/             # Zustand durum yönetimi
│   ├── lib/                # Yardımcı kitaplıklar (markdown işleme, temalar, zen modu vb.)
│   └── styles/             # Global stiller
├── src-tauri/              # Rust arka ucu
│   ├── src/main.rs         # Tauri komutları (dosya okuma/yazma, tema yükleme, kayıt defteri vb.)
│   ├── icons/              # Uygulama simgeleri
│   ├── themes/             # Tema CSS (theme.json meta verileriyle)
│   └── templates/          # Belge şablonları
├── docs/                   # Belgeler (changelog / i18n çok dilli readme'ler / THEME-DESIGN-SPEC.md)
└── package.json
```

---

## Sürüm ve Güncellemeler

Windows kurulum sürümü uygulama içinden tek tıkla güncellenebilir; macOS, Linux ve taşınabilir sürüm açılışta `latest.json` dosyasını kontrol eder, yeni sürüm varsa sağ altta bildirim gösterir ve ilgili sürümün indirme sayfasını açar (elle değiştirme, otomatik kurulum yok; Linux'un `deb` ve `AppImage` sürümleri de bu kanalı kullanır).

---

## Lisans

MIT
