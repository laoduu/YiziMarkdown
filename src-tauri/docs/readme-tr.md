# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)

[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)

**Resmi Web Sitesi:** https://md.yizigpt.com

Basit ve şık, çapraz platform `Markdown` düzenleyicisi. Windows taşınabilir sürümünü ve macOS sürümünü destekler. Kurulum gerektirmez, sıkıştırılmış dosyayı çıkarıp kullanabilirsiniz; güzellik ve işlevselliği bir arada sunar. Windows için kurulum yapılabilir veya sıkıştırılmış dosya olarak indirilip çıkarılabilir; macOS, Intel ve Apple Silicon üzerinde native olarak çalışan evrensel ikili kurulum paketi sunar.

Neden bir `Markdown` düzenleyicisi geliştirdik?

Piyasadaki birçok `Markdown` düzenleyicisinin ya arayüz görünümü yetersizdir ya da işlevsel olarak karmaşıktır; hem basit, hem güzel, hem de kullanımı kolay bir düzenleme aracı bulmak zordur.

İşte bu yüzden YiziMarkdown doğdu.

WYSIWYG modu için son derece şık bir deneyim yarattık; ayrıca PPT benzeri hızlı sunum yeteneği de sunuyor, böylece yazdığınız notları ve belgeleri sunum moduna hızla geçirebilir, paylaşım ve raporlama yapabilirsiniz. Deneyince anlarsınız.

---

## Özellikler

### Çok Dilli Arayüz

- **15 arayüz dili**: Basit Çince (varsayılan), Geleneksel Çince, İngilizce, Japonca, Korece, Almanca, Fransızca, İspanyolca, Portekizce, İtalyanca, Lehçe, Felemenkçe, Türkçe, İsveççe, Ukraynaca
- Ayarlar → Genel → Arayüz dilini tek tıkla değiştirme, anında etkili olur; tüm arayüz metinleri, kısayol tuşu panelleri ve eklenti açıklamaları dil ile senkronize çalışır

### Yapay Zeka Asistanı (Yan Sohbet Paneli)

- **17 büyük model sağlayıcısı + özel hizmet**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen, Zhipu GLM, Moonshot Kimi, Volcano Engine, SiliconFlow, MiniMax, OpenRouter, OpenCode Go, Ollama (yerel); "Özel hizmet" OpenAI uyumlu / Anthropic uyumlu protokolleri destekler, Base URL, model ID ve anahtarı kendiniz girerek herhangi bir üçüncü taraf hizmetine bağlanabilirsiniz
- **Yapay Zeka Becerileri (Skill)**: Giriş kutusundaki ⚡ düğmesine tıklayarak beceri menüsünü açın, seçildikten sonra beceri etiketi imlece eklenir ve istemci otomatik olarak bağlama enjekte edilir; `skills/` dizinine `skills.json` + `.md` istemci dosyaları koyarak becerileri özelleştirebilirsiniz. Dahili "Sunum Özetleme", "Belge Özeti", "Yazıyı Geliştirme" olmak üzere 3 beceri
- **Akışlı sohbet**: Araç çubuğundaki robot düğmesine tıklayarak sağ taraftaki yapay zeka panelini açın, yanıtlar gerçek zamanlı olarak akış olarak çıktılır, istediğiniz zaman durdurabilirsiniz
- **Düşünme süreci gösterimi**: Çıkarma modelinin düşünce içeriği (reasoning/thinking) katlanabilir blok olarak gösterilir, varsayılan olarak kapalıdır, ana metin okumasını etkilemez
- **Anahtar güvenliği**: API anahtarları sistem anahtar zincirinde (OS keychain) saklanır, tek tıkla kaydetme, temizleme ve doğrulama desteklenir; yerel uç noktalar (llama.cpp / LM Studio / vLLM vb.) anahtarları boş bırakılabilir
- **Mevcut belgeye atıfta bulunma**: İşaretledikten sonra mevcut belgeyi yapay zekaya bağlam olarak gönderin, atıf sınırını (64K~512K/sınırsız) ve bağlam tur sayısını (0~20 tur, varsayılan 3 tur) yapılandırabilirsiniz
- **Sonuç kaydetme**: Yanıtlar kopyalanabilir, belge imlecine eklenebilir veya tek tıkla yeni belge olarak oluşturulabilir

### Düzenleme ve Önizleme

- **Kaynak kodu düzenleme**: Çekirdek CodeMirror 6, sözdizimi vurgulama, parantez eşleştirme, otomatik tamamlama
- **Gerçek zamanlı mod (WYSIWYG)**: Gördüğünüz gibi düzenleme, yazarken Markdown işaretlerini otomatik olarak gizler, içerik oluşturmaya odaklanın
- **Gerçek zamanlı mod animasyonları**: 4 işaret görünüm animasyonu şeması (Odaklama/Parlama/Işıldama/Dalgacık), ayarlarda önizleme ve değiştirme yapılabilir
- **Gerçek zamanlı önizleme**: Markdown yazdıkça render edilir, etkileşimli görev listesi onay kutularını destekler
- **Beş görünüm modu**: Kaynak代码 / Yan yana / Gerçek zamanlı (WYSIWYG) / Önizleme / Sunum (tam ekran slayt), tek tıkla geçiş
- **Dış hat kaydırma senkronizasyonu**: Yan yana modunda sol ve sağ paneller çift yönlü bağlıdır, görünümler geçiş yaparken otomatik olarak mevcut konuma konumlanır
- **Arama ve değiştirme**: Eşleşme navigasyonunu destekler, tümünü değiştir
- **Araç çubuğu hızlı biçimlendirme**: Kalın, italik, üstü çizili, satır içi kod, seçili metni hemen sarar
- **Yerel görsel işleme**: Önizleme modu yerel yollu görselleri (jpg/png/gif/webp/svg/bmp) otomatik olarak render eder
- **Satır numaraları / Sözcük kaydırma**: İkisi de ayarlardan açılıp kapatılabilir
- **Kod bloğu geliştirmesi**: Sözdizimi vurgulama (highlight.js), dil etiketi, kopyalama düğmesi, sözcük kaydırma açma/kapama
- **Biçimlendirme araç çubuğu katlama**: Pencere genişliği yetersiz olduğunda otomatik olarak katlanır, manuel açma/kapama desteklenir
- **Frontmatter filtreleme**: Önizleme/yan yana/gerçek zamanlı modlarda YAML frontmatter otomatik olarak filtrelenir

### Matematik Formülleri ve Grafikler

- **KaTeX formülleri**: Dahili KaTeX eklentisi, satır içi `$...$` ve blok düzeyinde `$$...$$` LaTeX formülleri gerçek zamanlı olarak render edilir
- **Mermaid grafikleri**: Dahili Mermaid eklentisi, akış diyagramları, zaman çizelgesi, Gantt diyagramı, sınıf diyagramı, pasta grafiği vb. görsel grafiklere otomatik olarak dönüştürülür, çoklu tema yapılandırması desteklenir
- **Tablo satır/sütun seçici**: Araç çubuğundaki tablo düğmesi 8×8 ızgarayı açar, fare ile tıklayarak ilgili satır/sütun sayısına sahip tabloyu ekleyebilirsiniz

### Sunum Modu (Slayt)

- **Saf Markdown ile çalışır**: Herhangi bir ek format gerektirmez, `---` (yatay ayırıcı) sayfa ayırır, motor tüm sayfa yapısını analiz ederek otomatik olarak düzen seçer
- **14 otomatik düzen**: Kapak, bölüm sayfası, kapanış sayfası, içindekiler, içerik, liste, veri tablosu, yol haritası, görsel-metin, görsel, alıntı, kod, grafik (mermaid), formül
- **İçerik sayfası sol hizalama + vurgu altı çizgi**: Başlık sol üstte tema rengiyle altı çizili olarak hizalanır, içerik sol hizalı, okuma konforlu
- **Alıntı sayfası çapraz büyük tırnak işaretleri**: Üst tırnak sol üst köşeye, alt tırnak sağ alt köşeye asılır, içerik dikey olarak ortalanır
- **Açık komutlar**: `<!-- layout: xxx -->` ile zorunlu düzen, `<!-- align: left|center|right -->` ile tüm sayfa hizalama (HTML yorumu, render edilmez)
- **Kapak meta bilgisi**: Front matter `author`/`date` sağlar, kapakta otomatik olarak gösterilir
- **Alt bilgi ve ilerleme**: Sol altta bölüm adı + sayfa numarası, altta tema renginde ilerleme çubuğu
- **Fare tekerleği ile sayfa çevirme**: İçerik kaydırılabilirken önce içeriği kaydırın, sınıra ulaştığında sayfayı çevirin
- **Tema devralma**: Başlık renkleri temaya göre hassas olarak değişir (15 tema desteklenir), sunum içinde tema/parlaklık değiştirilebilir
- **Tam ekran geçişi**: F tuşu ile tam ekran/normal mod, herhangi bir pencere durumundan (normal/maksimum) güvenilir geçiş
- **Çıkış düğmesi**: Fare hareket ettiğinde sağ üstte yarı saydam çıkış düğmesi görünür, 1.5 saniye hareketsizlikten sonra otomatik gizlenir
- **Pencere durumu geri yükleme**: Sunumdan çıkışta, girilmeden önceki pencere durumuna otomatik olarak geri döner (tam ekran/maksimum/normal)

### Eklenti Sistemi

- Eklentili mimari, dahili KaTeX ve Mermaid olmak üzere iki çekirdek eklenti
- Ayarlar panelinde "Eklentiler" sayfası etkinleştirme/kapama kontrolü ve eklenti yapılandırması destekler
- Eklentiler talep üzerine dinamik olarak yüklenir, etkinleştirilmezse kaynak kullanmaz

### Çoklu Dosya Yönetimi

- **Tek örnekleme modu**: Çoklu dosya açma artık birden fazla pencere başlatmaz, mevcut örneğe otomatik olarak birleştirilir, tekrar açılan dosya ilgili sekmeye otomatik olarak konumlanır
- **Sekme çubuğu**: Üstte birden fazla açık dosyayı yönetin, geçiş yapın, kapatın, yeni oluşturun
- **Ana sayfa**: Son açılan dosya listesi, dosya boyutu ve değişiklik zamanı dahil
- **Kaydetme durumu göstergesi**: Kaydedilmemiş dosyalarda nefes alma nokta animasyonu, kaydettikten sonra onay animasyonu
- **Kapatma onayı**: Kaydedilmemiş dosya kapatılırken Kaydet / Kaydetme / İptal onayı istenir

### Dosya İşlemleri

- **Açma**: .md / .markdown / .txt desteği
- **Yeni oluşturma**: Yeni boş sekme oluşturur, "Adsız yeni dosya" gösterir
- **Şablondan yeni oluşturma**: Araç çubuğundaki "Şablondan yeni oluştur" açılır menüsü, seçilen şablona göre yeni belge oluşturmak için Markdown yapısını kullanır; ayrıca Ayarlar → Genel'de varsayılan şablonu ayarlayabilir, ardından `Ctrl+N` ile otomatik olarak uygulanır
- **Kaydetme / Otomatik kaydetme**: Manuel kaydetme + yapılandırılabilir aralıklarla otomatik kaydetme (5~180 saniye, varsayılan 60 saniye)
- **Farklı kaydetme**: Yeni dosya kaydedilirken otomatik olarak "Farklı kaydet" iletişim kutusu açılır
- **Dışa aktarma**: HTML / Markdown / Düz metin olmak üzere üç format
- **.md dosya ilişkilendirmesi**: Ayarlardan tek tıkla sistem varsayılanı Markdown düzenleyicisi olarak ayarlanır, .md çift tıklanarak doğrudan açılır (Windows kayıt defteri / macOS LaunchServices)

### Görünüm Özelleştirme

- **On beş dahili tema**: Akademik Mavi (varsayılan), Canlı Turuncu, Teknolojik, Minimalist, Dergi, Doğal, Sıvı Cam, Lychee Kırmızısı, Mor, Siberpunk, Facebook, Matrix, Nane Smoothie, Günbatımı Eritmesi, Retro Daktilo; her birinin aydınlık ve koyu olmak üzere iki renk şeması
- **Koyu / Aydınlık modu**: Her temanın aydınlık ve koyu olmak üzere iki renk şeması
- **Yazı tipi özelleştirme**: Kaynak ve önizleme modları için ayrı ayrı yazı tipi, punto ve satır yüksekliği ayarı
- **Özel CSS**: `user.css`, tüm temaların üzerine uygulanır, en yüksek önceliğe sahiptir
- **Tema genişletme**: `themes/` dizinine `.css` dosyaları koyarak ve `themes/theme.json` dosyasına tema parametreleri ekleyerek yeniden başlatma sonrası otomatik olarak tanınır

### Diğer

- **Belge şablonları**: `templates/` dizinine `.md` dosyaları koyarak, yeni oluştururken seçilebilir
- **Kısayol tuşu sistemi**: Görsel kısayol tuşu yapılandırma paneli, 30 eylem için özelleştirilmiş bağlama, tuş kaydetme, çakışma algılama ve varsayılanlara geri dönme desteği
- **Ayarlar paneli**: Genel, görünüm, düzenleyici, gerçek zamanlı mod, yapay zeka, eklentiler, kısayol tuşları, şablonlar, hakkında vb. çoklu sekme sayfaları, ayarlar anında önizleme

---

## Kısayol Tuşları

| Kısayol Tuşu | İşlev |
|--------------|-------|
| Ctrl+N | Yeni dosya oluştur |
| Ctrl+O | Dosya aç |
| Ctrl+S | Dosyayı kaydet |
| Ctrl+Shift+S | Farklı kaydet |
| Ctrl+W | Sekmeyi kapat |
| Ctrl+H | HTML olarak dışa aktar |
| Ctrl+M | Markdown olarak dışa aktar |
| Ctrl+Z | Geri al |
| Ctrl+Y | İleri al |
| Ctrl+F | Ara |
| Ctrl+\ | Kenar çubuğunu değiştir |
| Ctrl+B | Kalın |
| Ctrl+I | İtalik |
| Ctrl+- | Üstü çizili |
| Ctrl++ | Satır içi kod |
| Ctrl+1 | Birinci düzey başlık |
| Ctrl+2 | İkinci düzey başlık |
| Ctrl+3 | Üçüncü düzey başlık |
| Ctrl+. | Sırasız liste |
| Ctrl+0 | Sıralı liste |
| Ctrl+' | Alıntı |
| Ctrl+K | Bağlantı |
| Ctrl+` | Kod bloğu |
| Ctrl+T | Tablo |
| Ctrl+L | Ayırıcı çizgi |
| F1 | Kısayol tuşu listesi |
| F2 | Koyu/aydınlık modunu değiştir |
| F3 | Görünümleri döngüsel olarak değiştir |
| Ctrl+Alt+P | Sunum modu (slayt) |
| F12 | Tarayıcı geliştirici araçları |

Kısayol tuşları Ayarlar → Kısayol Tuşları bölümünden özelleştirilebilir, görsel yapılandırma ve çakışma algılama desteklenir.

---

## Taşınabilir Sürüm Dizin Yapısı

```
YiziMarkdown/
├── YiziMarkdown.exe        # Ana program
├── readme.md               # Proje açıklaması (bu dosya)
├── welcome.md              # Hoş geldiniz belgesi
├── changelog.md            # Geliştirme günlüğü
├── user.css                # Kullanıcı özel stil dosyası
├── keybindings.json        # Kısayol tuşu yapılandırması
├── themes/                 # Tema CSS dosyaları
│   ├── academic.css        # Akademik Mavi (varsayılan)
│   ├── vibrant.css         # Canlı Turuncu
│   ├── tech.css            # Teknolojik
│   ├── minimal.css         # Minimalist
│   ├── magazine.css        # Dergi
│   ├── nature.css          # Doğal
│   ├── liquidglass.css     # Sıvı Cam
│   ├── lychee.css          # Lychee Kırmızısı
│   ├── violet.css          # Mor
│   ├── cyberpunk.css       # Siberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Nane Smoothie
│   ├── sunset.css          # Günbatımı Eritmesi
│   └── typewriter.css      # Retro Daktilo
├── skills/                 # Yapay Zeka Becerileri (Skill)
│   ├── skills.json         # Beceri listesi
│   ├── slides-outline.md   # Sunum özetleme
│   ├── doc-summary.md      # Belge özeti
│   └── polish-writing.md   # Yazıyı geliştirme
└── templates/              # Belge şablonları
    └── default.md          # Varsayılan şablon
```

---

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Masaüstü çerçevesi | Tauri 2 (Rust) |
| Ön yüz çerçevesi | React 18 + TypeScript |
| Düzenleyici çekirdeği | CodeMirror 6 |
| Durum yönetimi | Zustand (persist) |
| Stil şeması | Tailwind CSS + CSS değişkenleri |
| Markdown işleme | markdown-it |
| Uluslararasılaştırma | Hafif i18n (15 dil) |
| Yapay zeka entegrasyonu | Rust akışlı proxy (OpenAI/Anthropic/Ollama protokolü) |
| Geliştirme araçları | Vite |

---

## Geliştirme

### Gereksinimler

- Node.js 18+
- Rust (kararlı)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Geliştirme sunucusunu başlatma

```bash
cd code
npm install
npm run tauri:dev
```

### Dağıtım sürümü oluşturma

**Windows**

```bash
npm run tauri:build
```

Oluşturulan dosyalar:
- Taşınabilir exe: `src-tauri/target/release/yizimarkdown.exe`
- MSI kurulum paketi: `src-tauri/target/release/bundle/msi/`
- NSIS kurulum paketi: `src-tauri/target/release/bundle/nsis/`

Oluşturma sonrası exe ve kaynak dosyaları `public/YiziMarkdown-vX.X.X/` dizinine manuel olarak kopyalayarak dağıtın.

**macOS (evrensel ikili, Intel ve Apple Silicon desteği)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Oluşturulan dosyalar:
- Uygulama paketi: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Kurulum paketi: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### Proje Yapısı

```
code/
├── src/                    # Ön yüz kaynak kodu
│   ├── App.tsx             # Ana uygulama bileşeni
│   ├── components/         # UI bileşenleri
│   │   ├── Editor.tsx      # CodeMirror düzenleyici + önizleme
│   │   ├── TabBar.tsx      # Sekme çubuğu
│   │   ├── HomePage.tsx    # Ana sayfa (son dosyalar)
│   │   ├── Toolbar.tsx     # Araç çubuğu
│   │   ├── Sidebar.tsx     # Kenar çubuğu (dış hat + dosya gezgini)
│   │   ├── StatusBar.tsx   # Alt durum çubuğu
│   │   └── SettingsModal.tsx # Ayarlar paneli
│   ├── stores/             # Zustand durum yönetimi
│   ├── lib/                # Araç kütüphanesi (Markdown işleme, başlık ID'si)
│   └── styles/             # Genel stiller
├── src-tauri/              # Rust arka yüzü
│   ├── src/main.rs         # Tauri komutları (dosya okuma/yazma, tema yükleme, kayıt defteri vb.)
│   ├── icons/              # Uygulama simgeleri
│   ├── themes/             # Tema CSS dosyaları
│   └── templates/          # Belge şablonları
└── package.json
```

---

## Lisans

MIT