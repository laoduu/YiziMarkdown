# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](../../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md) | [Русский](./readme-ru.md)

**Site officiel :** https://md.yizigpt.com

YiziMarkdown est un éditeur Markdown multiplateforme centré sur l'écriture. Un même fichier `.md` offre sept façons de se présenter : `édition source`, `relecture côte à côte`, `écriture en direct`, `aperçu final`, `présentation en diapositives`, `lecture façon livre`, et un `mode zen` qui ne laisse que le texte, pour se concentrer sur l'écriture.

- **Windows** : installable (programme d'installation NSIS, mise à jour en un clic depuis l'application), ou archive portable à décompresser et à lancer
- **macOS** : binaire universel, natif sur Intel comme sur Apple Silicon
- **Linux** : paquet `deb` Debian et `AppImage` sans installation (Ubuntu 22.04+ / Debian 12+, amd64 uniquement pour l'instant)

Pourquoi développer un éditeur Markdown ? Les solutions du marché sont soit peu agréables à l'œil, soit surchargées de fonctions, et il est difficile de trouver un outil qui réunisse simplicité, élégance et prise en main agréable. C'est ainsi qu'est né YiziMarkdown, avec trois exigences : **une interface soignée**, **des fonctions puissantes**, **des usages variés**.

Voilà donc le `YiziMarkdown` d'aujourd'hui : `3 systèmes couverts`, `7 modes d'utilisation`, `16 langues d'interface`, `15 thèmes clair/sombre`, `5 AI Skills`, `7 formats d'export`, et en plus des fonctions originales comme l'assistant IA intégré et le stockage cloud, ainsi que de la documentation ouverte sur les thèmes, les skills et les présentations, avec lesquelles vous pouvez composer des expériences d'usage vraiment singulières.

Ce n'est plus un simple éditeur Markdown, mais une application polyvalente qui couvre réellement vos scénarios documentaires : création, travail et vie quotidienne.

---

## Sept modes : un seul document, sept présentations

La valeur de Markdown ne tient pas seulement à l'écriture, mais aussi à qui le lit et comment il le voit. YiziMarkdown propose sept présentations d'un même document : les quatre premières sont des vues d'édition, qui alternent entre la source et le résultat ; les trois dernières sont des scènes à part entière, qui transforment le document en diapositives, en pages de livre, ou le réduisent au seul texte.

| Mode | En une phrase | Accès | Idéal pour |
|------|-----------|------|---------|
| Source | Éditer directement le Markdown brut | `F3` / boutons de vue | Peaufiner la structure, remplacer en masse, modifier le front matter |
| Côte à côte | Écrire à gauche, comparer aussitôt à droite | `F3` / boutons de vue | Relire la mise en page, écrire d'après un modèle |
| Direct | WYSIWYG, les balises se masquent d'elles-mêmes | `F3` / boutons de vue | Écriture de longs textes, rédaction concentrée |
| Aperçu | N'affiche que la mise en page finale | `F3` / boutons de vue | Vérifier le résultat, relire l'intégralité |
| Diaporama | Le document projeté tel quel en diapositives | `Ctrl+Alt+P` / barre d'outils | Partager, présenter, enseigner |
| Lecture | Le document composé en livre feuilletable | `Ctrl+Alt+R` / barre d'outils | Lectures longues, EPUB, lecture immersive |
| Zen | Toute l'interface disparaît, seul le texte reste | `F9` / barre d'outils | Écriture profonde |

`F3` fait défiler Source / Côte à côte / Direct / Aperçu ; diaporama, lecture et zen ont chacun leur entrée propre et ne se gênent pas.

---

## Markdown : quatre capacités en une

![Quatre modes comparés](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

Source, côte à côte, direct et aperçu partagent le même cœur d'éditeur et le même jeu de capacités Markdown ; seule change la densité d'information : des balises entièrement visibles au résultat entièrement composé. Le basculement est possible à tout moment, et la vue conserve autant que possible la position courante.

### Mode source : voir tout ce qu'il faut voir

- Cœur CodeMirror 6 : coloration syntaxique, correspondance des parenthèses, autocomplétion
- Numéros de ligne et retour à la ligne activables séparément ; idéal pour retoucher ligne par ligne et réécrire en masse
- Le front matter YAML s'affiche tel quel : modifier les métadonnées ne demande aucune devinette de format
- Tableaux, blocs de code et formules restent sous forme source : l'option la plus maîtrisable pour les structures complexes

### Mode côte à côte : écrire et comparer

- Source à gauche, aperçu à droite, rafraîchi à la frappe
- Le défilement synchronisé est piloté par le plan ; changer de vue repositionne sur le point courant
- Idéal pour relire la mise en page ou restructurer d'après un document existant

### Mode direct : ce que vous voyez est ce que vous obtenez

- Les balises Markdown se masquent pendant la frappe et reviennent quand le curseur s'éloigne, pour rester sur le contenu
- 4 animations d'apparition des balises (focus / éclat / lueur / ondulation), prévisualisables et commutables dans les réglages
- Le front matter YAML est rendu en panneau de propriétés modifiable façon Obsidian : 7 types (auto / texte / nombre / case à cocher / date / date et heure / liste), le type étant mémorisé globalement par nom de propriété

### Mode aperçu : seulement le résultat

- Markdown rendu à la volée, cases des listes de tâches cliquables
- Images en chemin local, images distantes et SVG rendus automatiquement (jpg / png / gif / webp / svg / bmp)
- Le front matter est masqué automatiquement : ce que vous voyez est la mise en page finale

### Capacités communes aux quatre vues

- **Recherche et remplacement** : navigation entre les occurrences, tout remplacer
- **Mise en forme par la barre d'outils** : gras, italique, barré, code en ligne, la sélection est enveloppée aussitôt
- **Blocs de code enrichis** : coloration syntaxique highlight.js, étiquette de langage, bouton copier, bascule du retour à la ligne
- **Sélecteur de tableau** : grille 8×8 à sélectionner, nombre de lignes et de colonnes visible d'un coup d'œil, ajout et suppression de lignes et colonnes, menu contextuel complet au clic droit
- **Formules et diagrammes** : KaTeX en ligne `$...$` / en bloc `$$...$$`, diagrammes Mermaid de flux, de séquence, de Gantt, de classes, en camembert, etc., couleurs suivant le thème
- **Barre de formatage repliable** : se replie quand la fenêtre rétrécit, dépliable aussi à la main
- **Numéros de ligne et retour à la ligne** : activables dans les réglages
- **Navigation par le plan** : la hiérarchie des titres vient du document et suit la position de défilement

---

## Mode diaporama : vos notes en diapositives en un clic

![Mode diaporama](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

Plus besoin d'exporter vos notes vers PPT : avec le skill de l'assistant IA intégré, un clic les condense en une version présentation ; passez en mode diaporama et le document devient aussitôt une projection plein écran. Pagination, colonnes et mises en page sont déduites automatiquement de la structure Markdown ; pour un contrôle précis, utilisez les directives en commentaires HTML.

### Le contenu devient la diapositive

- Aucun format supplémentaire : `---` (filet horizontal) change de diapositive
- Un `***` seul sur sa ligne divise la diapositive en colonnes, jusqu'à 4
- Le moteur analyse la structure de la page et choisit la mise en page : titres, listes, tableaux, code, images et diagrammes ont chacun la leur

### 14 mises en page

Couverture, page de chapitre, page de fin, sommaire, contenu, liste, tableau de données, feuille de route, texte + image, image, citation, code, diagramme (Mermaid), formule.

- Sauf « texte + image », qui exige `<!-- layout: figure -->`, toutes les mises en page sont déduites du contenu
- Les pages de contenu sont alignées à gauche, le titre souligné d'un filet à la couleur du thème
- Les pages de citation portent de grands guillemets en diagonale : ouvrant en haut à gauche, fermant en bas à droite, contenu centré verticalement
- La couverture lit `author` / `date` dans le front matter

### Contrôle typographique pendant la projection

- Réglages HUD : police (suivre le thème / sans serif / serif / monospace), graisse, taille, largeur et hauteur de la zone de contenu (50 %–95 %)
- Les ajustements s'appliquent en direct et sont conservés pour la projection suivante
- Le code en ligne trop long passe à la ligne au lieu d'être coupé au bord de la page
- Directives explicites : `<!-- layout: xxx -->` force la mise en page, `<!-- align: left|center|right -->` aligne toute la page

### Projection et navigation

- Nom du chapitre en bas à gauche + numéro de page, barre de progression à la couleur du thème en bas
- `T` ouvre le tiroir du sommaire ; `G` ou le champ en bas permet de sauter à une page
- La molette change de page : le contenu défile d'abord, la page tourne à la limite
- `F` plein écran / restauration, depuis n'importe quel état de fenêtre, normale ou maximisée
- À la sortie, l'état de fenêtre précédent est restauré ; le bouton de sortie en haut à droite disparaît après 1,5 s d'inactivité
- Héritage du thème : les couleurs des titres suivent le thème, et thème comme clair/sombre restent commutables pendant la projection

---

## Mode lecture : le document composé en livre feuilletable

![Mode lecture](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

Le mode lecture n'est pas un « aperçu plein écran » : le texte est réellement composé en pages fixes, avec couverture, page de titre, sommaire, numéros de page, et des effets de papier et de feuilletage.

- Accès : bouton livre de la barre d'outils ou `Ctrl+Alt+R` ; `Esc` quitte et restaure la vue précédente
- Mise en page : un filet fin à marges égales encadre les pages, les deux pages se rejoignent avec une seule ligne de pliure ; titre du livre en haut à gauche, chapitre / numéro de page en bas à gauche, HUD en bas à droite, aux mêmes positions que le mode diaporama
- Couverture, page de titre et sommaire générés automatiquement : le titre vient du `title` du front matter ou du premier H1, le sommaire est bâti sur les titres avec numéros de page et se pagine tout seul quand il est trop long
- Pagination réelle : double page ouverte (page unique en fenêtre étroite), avec numéros de page et progression de lecture

### Animations de feuilletage

4 choix, commutables dans les réglages, glissement horizontal par défaut :

- **Glissement horizontal** (par défaut) : la page entière se translate, net et rapide
- **Feuilletage 3D** : le feuillet se soulève depuis le coin inférieur droit et se plie autour de la pliure, avec relevé de la page, lumière et ombre portée (autour de la reliure en mode page unique)
- **Fondu** / **Zoom** : des transitions plus discrètes

Des appuis répétés ne font jamais sauter de page ; les sauts depuis le sommaire, les numéros de page ou les notes de bas de page ne jouent aucune animation.

### Règles de pagination à l'échelle de la page

Les paragraphes se coupent par ligne, les titres ne restent jamais orphelins, les en-têtes de tableau se répètent sur les pages suivantes, les blocs de code se poursuivent ligne par ligne, les listes élément par élément, les images entières sont mises à l'échelle proportionnellement ; les paragraphes de corps reçoivent un retrait de deux caractères en première ligne, non répété sur les pages suivantes.

### Navigation et détails

- Tiroir du sommaire : `T` l'ouvre, les titres y sont listés par niveau avec leur numéro de page, un clic y mène directement
- `G` ou le champ de numéro de page saute à la page indiquée
- Va-et-vient des notes de bas de page : un clic sur un appel mène à la page de la définition et la surligne, avec un bouton « retour à l'appel » ; les ancres internes sautent aussi page par page
- HUD de lecture : en bas à droite, bascule clair/sombre, thème, police (thème / serif / sans serif / monospace), taille et interligne, pour cette session de lecture uniquement
- Mémoire de position : page / chapitre retenus par document, restaurés à la réouverture
- Commandes : flèches, PageUp / PageDown, espace, molette, et clic sur le bord gauche ou droit de la page

### EPUB

Ouvrir un `.epub` mène directement au mode lecture : le thème de lecture de l'application est utilisé (le CSS de l'éditeur est ignoré), et la couverture intégrée, le sommaire de navigation, les images, les formules, les SVG Mermaid, les notes de bas de page et les liens entre chapitres sont lus. Les EPUB chiffrés par DRM et à mise en page fixe (BD / albums illustrés) ne sont pas encore pris en charge.

---

## Mode zen : ne laisser que le texte

![Mode zen](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

On entre par `F9` ou par le bouton zen de la barre d'outils. Barre d'outils, barre d'onglets, panneau latéral, panneau IA et barre d'état se replient vers les bords de l'écran et s'effacent par couches, ne laissant que le texte ; tout cela **sans changer la mise en page**, le texte ne bouge pas d'un seul pixel.

- **Le monde est toujours là** : approchez le pointeur d'un bord de l'écran (haut / gauche / droite / bas) et la zone correspondante réapparaît sur place ; elle se retire environ 1,2 s après le départ du pointeur
- **Un interrupteur permanent** : le bouton zen ne disparaît pas et reste à sa place (avec une très légère ondulation respiratoire autour), à la fois repère d'état « vous êtes en mode zen » et issue de secours ; `F9` / `Esc` permettent aussi de sortir
- **Au service de l'écriture seule** : disponible en source / direct uniquement ; passer en côte à côte ou en aperçu, ou entrer en lecture / diaporama, en sort automatiquement
- **Une feuille plus nette** : numéros de ligne et filets latéraux masqués, vignettage très léger, pointeur masqué après 2 s d'immobilité ; la barre de défilement verticale devient un mince filet discret, visible pendant le défilement ou près du bord droit

---

## Fichiers et écriture

### Fichiers et onglets multiples

- **Ouverture** : `.md` / `.markdown` / `.txt` / `.epub`, les EPUB entrant directement en mode lecture
- **Mode instance unique** : plusieurs fichiers ouverts fusionnent dans la fenêtre existante, et un fichier déjà ouvert est ciblé dans son onglet
- **Barre d'onglets** : changer, fermer, créer, réordonner par glisser-déposer
- **Page d'accueil** : liste des fichiers récemment ouverts, avec taille et date de modification
- **État d'enregistrement** : point respiratoire pour un fichier non enregistré, animation ✅ après enregistrement
- **Confirmation de fermeture** : enregistrer / ne pas enregistrer / annuler en cas de modifications non enregistrées

### Nouveaux documents et modèles

- Un nouvel onglet vide affiche « Nouveau fichier sans titre »
- Le menu « Nouveau depuis un modèle » de la barre d'outils crée un document d'après la structure Markdown du modèle ; un modèle par défaut peut être défini dans Réglages → Général, après quoi `Ctrl+N` l'applique automatiquement
- Les modèles résident dans le répertoire utilisateur : il suffit d'y déposer des `.md`, ou de les créer / modifier dans Réglages → Modèles

### Coller, et c'est du Markdown

Le texte enrichi copié depuis des pages web, Word / DOCX, Google Docs, Notion ou d'autres sources est converti en mémoire en Markdown propre (titres / listes / tableaux / code / citations / liens) ; une source Markdown existante ou du texte brut est collé tel quel.

### Enregistrement et export

- **Enregistrer / enregistrement automatique** : enregistrement manuel + intervalle configurable (5–180 s, 60 s par défaut)
- **Enregistrer sous** : l'enregistrement d'un nouveau fichier ouvre automatiquement la boîte de dialogue « Enregistrer sous »
- **Export** : HTML / Markdown / texte brut / Word (DOCX) / PDF / PPTX / EPUB
  - DOCX utilise la sémantique native de Word (listes, tableaux, blocs de code, citations, listes de tâches), aligne le style des tableaux sur l'aperçu et prend en charge les images en chemin local, les images distantes et le HTML `<img>` (`width` permettant de contrôler la largeur)
  - PDF restitue fidèlement l'aperçu et pagine automatiquement
  - HTML inclut une carte de plan flottante à gauche, un clic menant à la section (le PDF n'a pas de panneau latéral)
  - PPTX hérite du thème, du mode clair/sombre et des mises en page du mode diaporama, et produit du texte, des tableaux, des images, des formes et des équations natives modifiables
  - EPUB est fourni par le plugin intégré ; avant l'export, choix du découpage par chapitre / de la couverture / du sommaire visible / du thème de lecture / des informations du document
- **Association des fichiers `.md`** : définir YiziMarkdown comme éditeur Markdown par défaut du système en un clic dans les réglages (registre Windows / LaunchServices macOS)

### Stockage cloud (WebDAV)

- **Navigateur de fichiers** : l'onglet « Cloud » de la barre latérale parcourt l'arborescence du serveur — ouvrir des documents, créer fichiers / dossiers, renommer, déplacer, supprimer ; le fil d'Ariane des dossiers profonds se replie en « … » avec un menu déroulant, et les dossiers se chargent par niveaux
- **Enregistrer dans le cloud** : envoi en un clic d'un document local, images référencées en chemin relatif incluses et arborescence préservée ; `Ctrl+S` réécrit directement un document cloud
- **Protection contre les conflits** : l'ETag est comparé avant l'enregistrement ; si un autre appareil a modifié le fichier distant, une boîte propose « écraser la version du serveur » ou « abandonner mes modifications et recharger » — jamais d'écrasement silencieux
- **Sécurité des identifiants** : le nom d'utilisateur et le mot de passe vont dans le magasin d'identifiants du système (Gestionnaire d'identifiants Windows / Trousseau macOS), jamais dans les fichiers de configuration
- **Compatibilité** : services WebDAV standard tels que Nutstore, Nextcloud ou Synology (mot de passe applicatif recommandé)

---

## Extensions et personnalisation

### Assistant IA (panneau de chat latéral)

- **18 fournisseurs de LLM + service personnalisé** : OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen (Tongyi), Zhipu GLM, Moonshot Kimi, Volcano Ark, SiliconFlow, MiniMax, Xiaomi MiMo, Meituan LongCat, OpenRouter, OpenCode Go, Ollama (local) ; le « service personnalisé » accepte les protocoles compatibles OpenAI et Anthropic, avec Base URL, ID de modèle et clé saisis à la main
- **Conversation en flux** : le bouton robot de la barre d'outils ouvre le panneau de droite, les réponses s'affichent en flux et peuvent être arrêtées à tout moment
- **Processus de réflexion** : le reasoning / thinking des modèles de raisonnement s'affiche dans un bloc repliable, replié par défaut
- **Sécurité des clés** : les clés API résident dans le trousseau du système, avec enregistrement, effacement et vérification en un clic ; les points de terminaison locaux (llama.cpp / LM Studio / vLLM, etc.) peuvent rester vides
- **Référencer le document courant** : une fois coché, le document sert de contexte, avec limite configurable (64K–512K / illimitée) et nombre de tours de contexte (0–20, 3 par défaut)
- **Exploiter le résultat** : copier, insérer au curseur, ou créer un nouveau document en un clic

### Compétences IA (Skills)

Le bouton ⚡ de la zone de saisie ouvre le menu des skills ; le tag du skill choisi est inséré au curseur et son prompt est injecté dans le contexte. Placez `skills.json` et des prompts `.md` dans le répertoire `skills/` pour personnaliser. Cinq skills sont intégrés : « Extraction de présentation », « Résumé de document », « Réécriture et polissage », « Traduction intégrale » et « Formatage Markdown ».

### Plugins

- **Capacités de base intégrées par défaut** : KaTeX / Mermaid / notes de bas de page / listes de tâches / TOC et autres fonctions sémantiques du document ne dépendent pas des interrupteurs de plugins
- **Plugin intégré** : export EPUB (activé par défaut, désactivable dans la page Plugins ; le menu d'export de la barre d'outils n'apparaît qu'une fois celui-ci activé)
- **Standard de plugin** : manifest (version / version d'API / moment d'activation / permissions / capacités) → vérification d'éligibilité → activation paresseuse → enregistrement des capacités → nettoyage à la désactivation ; la version actuelle ne charge que les plugins compilés dans l'application

### Thèmes et apparence

- **15 thèmes intégrés** : Prism verre liquide (par défaut), Bleu académique, Orange vibrant, Technologie, Minimaliste, Magazine, Nature, Rouge litchi, Violette, Cyberpunk, Facebook, Matrix, Menthe glacée, Coucher de soleil doré, Machine à écrire rétro — chacun avec une palette claire et une palette sombre
- **Mode sombre / clair** : bascule en un raccourci (`F2`)
- **Polices personnalisées** : police, taille et interligne réglés séparément pour la source et l'aperçu
- **Thème personnalisé** : écrivez du CSS dans Réglages → Apparence → CSS personnalisé puis enregistrez ; un « thème personnalisé » est généré sur la base du thème courant — collez un thème entier ou ajustez seulement quelques couleurs, l'effet est immédiat
- **Extension des thèmes** : déposez un `.css` dans `themes/` et déclarez-le dans `themes/theme.json`, il est reconnu après redémarrage ; le système de jetons et les conventions sont décrits dans `docs/THEME-DESIGN-SPEC.md`

### Langues et interface

- **16 langues d'interface** : chinois simplifié (par défaut), chinois traditionnel, English, 日本語, 한국어, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська, Русский
- Changement en un clic dans Réglages → Général → Langue de l'interface, effet immédiat ; les textes de l'interface, le panneau des raccourcis et les descriptions de plugins suivent
- **Détection au premier lancement** : en l'absence de langue choisie dans le programme d'installation, la langue du système est utilisée, avec repli sur English hors de la liste supportée ; chaque entrée de langue porte aussi le libellé anglais `Language`, pour la retrouver vite même depuis une interface chinoise
- **Taille de l'interface** : 80 %–120 % (100 % par défaut), mettant uniquement à l'échelle les textes et icônes de l'interface, sans toucher à la taille des panneaux ni au contenu des documents
- **Panneau de réglages** : Général, Apparence, Éditeur, Mode direct, Assistant IA, Cloud, Plugins, Raccourcis, Modèles, Documentation, À propos, Produits, avec aperçu immédiat des réglages

---

## Raccourcis clavier

| Raccourci | Fonction | Raccourci | Fonction |
|--------|------|--------|------|
| Ctrl+N | Nouveau fichier | Ctrl+B | Gras |
| Ctrl+O | Ouvrir un fichier | Ctrl+I | Italique |
| Ctrl+S | Enregistrer le fichier | Ctrl+- | Barré |
| Ctrl+Shift+S | Enregistrer sous | Ctrl++ | Code en ligne |
| Ctrl+W | Fermer l'onglet | Ctrl+1 | Titre de niveau 1 |
| Ctrl+H | Exporter en HTML | Ctrl+2 | Titre de niveau 2 |
| Ctrl+M | Exporter en Markdown | Ctrl+3 | Titre de niveau 3 |
| Ctrl+Z | Annuler | Ctrl+. | Liste à puces |
| Ctrl+Y | Rétablir | Ctrl+0 | Liste numérotée |
| Ctrl+F | Rechercher | Ctrl+' | Citation |
| Ctrl+\ | Afficher / masquer la barre latérale | Ctrl+K | Lien |
| F1 | Guide complet des raccourcis | Ctrl+` | Bloc de code |
| F2 | Basculer clair / sombre | Ctrl+T | Tableau |
| F3 | Faire défiler les quatre vues d'édition | Ctrl+L | Filet horizontal |
| F9 | Mode zen (source / direct uniquement) | Ctrl+Alt+P | Mode diaporama |
| F11 | Basculer en plein écran | Ctrl+Alt+R | Mode lecture |
| Ins | Menu slash | F12 | Outils de développement |

Les raccourcis se personnalisent dans Réglages → Raccourcis : attribution visuelle des 36 actions, enregistrement des touches, détection des conflits et restauration des valeurs par défaut.

---

## Structure du répertoire

Après décompression de la version portable :

```
YiziMarkdown/
├── YiziMarkdown.exe        # Programme principal
├── readme.md               # Description du projet (ce fichier)
├── welcome.md              # Document de bienvenue
├── docs/                   # Documentation (THEME-DESIGN-SPEC.md, spécification de design des thèmes, etc.)
├── user.css                # Styles personnalisés de l'utilisateur
├── keybindings.json        # Configuration des raccourcis
├── themes/                 # Fichiers CSS des thèmes
│   ├── liquidglass-prism.css # Prism verre liquide (par défaut)
│   ├── academic.css        # Bleu académique
│   ├── vibrant.css         # Orange vibrant
│   ├── tech.css            # Technologie
│   ├── minimal.css         # Minimaliste
│   ├── magazine.css        # Magazine
│   ├── nature.css          # Nature
│   ├── lychee.css          # Rouge litchi
│   ├── violet.css          # Violette
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Menthe glacée
│   ├── sunset.css          # Coucher de soleil doré
│   └── typewriter.css      # Machine à écrire rétro
├── skills/                 # Skills IA
│   ├── skills.json         # Liste des skills
│   ├── slides-outline.md   # Extraction de présentation
│   ├── doc-summary.md      # Résumé de document
│   ├── polish-writing.md   # Réécriture et polissage
│   ├── translate-fulltext.md # Traduction intégrale
│   └── markdown-format.md  # Formatage Markdown
└── templates/              # Modèles de documents intégrés (synchronisés vers le répertoire utilisateur au premier lancement)
    ├── default.md          # Modèle par défaut
    └── Slide-Template.md   # Modèle de présentation
```

> Remarque : les skills IA et les modèles de documents résident en réalité dans le **répertoire utilisateur** — sous Windows / macOS `~/Documents/yizimarkdown/skills/` et `.../templates/` ; sous Linux, `yizimarkdown/` dans le répertoire de documents XDG (par ex. `~/Documents/yizimarkdown/`), avec repli sur `~/.local/share/yizimarkdown/` quand il n'existe pas de répertoire de documents. (Les dossiers de même nom dans le répertoire du programme sont des ressources intégrées, synchronisées au premier lancement.) Placez vos contenus personnels dans le répertoire utilisateur : mises à niveau et réinstallations ne les écraseront pas.

---

## Stack technique

| Couche | Technologie |
|------|------|
| Cadre de bureau | Tauri 2 (Rust) |
| Cadre frontend | React 18 + TypeScript |
| Cœur de l'éditeur | CodeMirror 6 |
| Gestion d'état | Zustand (persist) |
| Styles | Tailwind CSS + variables CSS |
| Rendu Markdown | markdown-it |
| Internationalisation | i18n léger interne (16 langues) |
| Intégration IA | proxy de flux Rust (protocoles OpenAI / Anthropic / Ollama) |
| Outil de build | Vite |

---

## Développement

### Prérequis

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Lancer le serveur de développement

```bash
cd code
npm install
npm run tauri:dev
```

### Icône du dock en développement sous Linux (facultatif)

Les bureaux comme elementary / GNOME cherchent, d'après le `WM_CLASS` de la fenêtre, un fichier `.desktop` du même nom et son `Icon` ; une version de développement n'a pas de programme d'installation et donc pas de `.desktop`, le dock n'affiche qu'une icône générique (le `_NET_WM_ICON` de la fenêtre est déjà fourni côté Rust, les programmes d'installation ne sont pas concernés). À exécuter une fois :

```bash
npm run dev:icon           # écrit ~/.local/share/applications/yizimarkdown-dev.desktop
npm run dev:icon:remove    # annule
```

Redémarrez ensuite la fenêtre de développement : le dock affiche l'icône de l'application.

### Construire une version de distribution

**Windows**

```bash
npm run tauri:build
```

Artefacts de build :
- exe portable : `src-tauri/target/release/yizimarkdown.exe`
- programme d'installation NSIS : `src-tauri/target/release/bundle/nsis/`

Assistant d'installation : à la première installation, on choisit d'abord la langue (16 choix, toutes les langues d'interface de l'application plus le portugais brésilien) ; les textes de l'assistant et la langue du premier lancement après installation suivent ce choix, et les mises à niveau / mises à jour automatiques ne réinitialisent pas la langue déjà choisie. Icônes et visuels de barre latérale / en-tête se trouvent dans `src-tauri/installer/` ; après modification des couleurs de marque, régénérez-les avec `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1`.

Après compilation, copiez manuellement l'exe et les fichiers de ressources dans le répertoire `public/YiziMarkdown-vX.X.X/` pour la distribution.

**macOS (binaire universel, Intel et Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artefacts de build :
- paquet d'application : `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- programme d'installation : `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux (deb + AppImage)**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

Artefacts de build (**amd64 / x86_64 uniquement pour l'instant** ; le `deb` `arm64` et l'`AppImage` `aarch64` ARM ne sont pas publiés) :
- paquet Debian : `src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb` (environ 16 Mo, installé dans `/usr/bin`, enregistre l'entrée de menu, l'icône et les associations de fichiers `.md` / `.epub`)
- version portable sans installation : `src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage` (environ 150 Mo, embarque GTK / WebKit et les composants média GStreamer, double-clic pour lancer)

Attention : **la compilation doit se faire sous Ubuntu 22.04**. Un binaire compilé sous 24.04 exige glibc 2.39 et échoue au démarrage sous Ubuntu 22.04 (2.35) / Debian 12 (2.36) ; la dépendance `libwebkit2gtk-4.1-0` du `deb` fixe la même limite basse (Debian 11 ne dispose que de webkit 4.0). Pas de `rpm` pour l'instant : Fedora / openSUSE utilisent d'autres noms de dépendances et demanderaient une maintenance séparée.

### Structure du projet

```
code/
├── src/                    # Code source du frontend
│   ├── App.tsx             # Composant principal de l'application
│   ├── components/         # Composants d'interface
│   │   ├── Editor.tsx      # Éditeur CodeMirror + aperçu
│   │   ├── Reader.tsx      # Mode lecture (pagination / feuilletage)
│   │   ├── Slideshow.tsx   # Mode diaporama
│   │   ├── TabBar.tsx      # Barre d'onglets
│   │   ├── HomePage.tsx    # Page d'accueil (fichiers récents)
│   │   ├── Toolbar.tsx     # Barre d'outils
│   │   ├── Sidebar.tsx     # Barre latérale (plan + navigation de fichiers)
│   │   ├── StatusBar.tsx   # Barre d'état en bas
│   │   └── SettingsModal.tsx # Panneau de réglages
│   ├── stores/             # Gestion d'état Zustand
│   ├── lib/                # Bibliothèques utilitaires (rendu Markdown, thèmes, mode zen, etc.)
│   └── styles/             # Styles globaux
├── src-tauri/              # Backend Rust
│   ├── src/main.rs         # Commandes Tauri (lecture / écriture de fichiers, chargement des thèmes, registre, etc.)
│   ├── icons/              # Icônes de l'application
│   ├── themes/             # CSS des thèmes (avec métadonnées theme.json)
│   └── templates/          # Modèles de documents
├── docs/                   # Documentation (changelog / readme i18n multilingues / THEME-DESIGN-SPEC.md)
└── package.json
```

---

## Version et mises à jour

Les installations Windows se mettent à jour en un clic depuis l'application ; macOS, Linux et les versions portables vérifient `latest.json` au lancement, signalent en bas à droite la nouvelle version et ouvrent la page de téléchargement correspondante (remplacement manuel, sans installation automatique ; le `deb` et l'`AppImage` de Linux suivent tous deux ce canal).

---

## Licence

MIT
