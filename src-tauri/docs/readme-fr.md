# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)

[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)


**Site officiel :** https://md.yizigpt.com

Un éditeur `Markdown` élégant et raffiné multiplateforme, supportant Windows portable et macOS. Pas d'installation requise, décompresser et l'utiliser directement, alliant esthétique et fonctionnalité. Sous Windows, installation possible ou téléchargement d'une archive compressée pour une utilisation immédiate ; macOS propose un paquet d'installation binaire universel, natif pour Intel et Apple Silicon.

Pourquoi développer un éditeur `Markdown` ?

Il existe de nombreux éditeurs `Markdown` sur le marché, mais la plupart soit ont une interface peu attrayante, soit sont surchargés de fonctionnalités, rendant difficile la recherche d'un outil à la fois simple, esthétique et agréable à utiliser.

C'est ainsi qu'est né YiziMarkdown.

Nous avons créé une expérience extrêmement élégante pour le mode WYSIWYG ; nous supportons également une fonctionnalité de présentation rapide à la PPT, permettant de basculer rapidement en mode présentation pour les documents rédigés, facilitant ainsi le partage et les rapports. Essayez-le pour le savoir.

---

## Fonctionnalités

### Interface multilingue

- **15 langues d'interface** : Simplifié chinois (par défaut), Traditionnel chinois, English, 日本語, 한국어, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська
- Paramètres → Général → Changement de langue d'interface en un clic, effet immédiat ; tous les textes de l'interface, le panneau de raccourcis clavier et les descriptions des plugins s'adaptent à la langue

### Assistant IA (panneau de chat latéral)

- **17 fournisseurs de modèles IA + service personnalisé** : OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Tongyi Qianwen, Zhipu GLM, Moonshot Kimi, Volcano Ark, SiliconFlow, MiniMax, OpenRouter, OpenCode Go, Ollama (local) ; le « service personnalisé » supporte les protocoles compatibles OpenAI et Anthropic, avec saisie manuelle de l'URL de base, de l'ID du modèle et de la clé, compatible avec n'importe quel service tiers
- **Compétences IA (Skill)** : le bouton ⚡ dans la zone de saisie ouvre le menu des compétences, la balise de la compétence sélectionnée est insérée au curseur, et le prompt est automatiquement injecté dans le contexte ; placez des fichiers `skills.json` + `.md` dans le répertoire `skills/` pour personnaliser les compétences. 3 compétences intégrées : « Synthèse de présentation », « Résumé de document », « Enrichissement et réécriture »
- **Dialogue en flux** : le bouton robot dans la barre d'outils ouvre le panneau IA à droite, les réponses sont affichées en flux temps réel, arrêt possible à tout moment
- **Affichage du processus de réflexion** : le contenu de réflexion (reasoning/thinking) des modèles de raisonnement est affiché sous forme de blocs réductibles, réduit par défaut, sans affecter la lecture du contenu
- **Sécurité des clés API** : les clés API sont stockées dans le coffre-fort du système (OS keychain), avec support pour sauvegarde, effacement et vérification en un clic ; les clés pour les points de terminaison locaux (llama.cpp / LM Studio / vLLM, etc.) peuvent rester vides
- **Référence du document courant** : cochez pour envoyer le document courant comme contexte à l'IA, avec configuration de la limite de référence (64K~512K/illimité) et du nombre de tours de contexte (0~20 tours, par défaut 3)
- **Sauvegarde des résultats** : les réponses peuvent être copiées, insérées au curseur dans le document, ou créées en tant que nouveau document en un clic

### Édition et prévisualisation

- **Édition en code source** : noyau CodeMirror 6, coloration syntaxique, appariement de parenthèses, complétion automatique
- **Mode temps réel (WYSIWYG)** : édition ce que vous voyez est ce que vous obtenez, masquage automatique des balises Markdown lors de la saisie, concentration sur la création de contenu
- **Animations du mode temps réel** : 4 schémas d'animation pour l'apparition des balises (focus/flash/lueur/ondulation), prévisualisation et changement dans les paramètres
- **Prévisualisation en temps réel** : rendu Markdown en temps réel, support des cases à cocher pour les listes de tâches
- **Cinq modes de vue** : source / côte à côte / temps réel (WYSIWYG) / prévisualisation / présentation (diaporama plein écran), changement en un clic
- **Synchronisation de défilement guidée par le plan** : double liaison gauche-droite dans le mode côte à côte, positionnement automatique sur la position courante lors du changement de vue
- **Recherche et remplacement** : support de navigation entre correspondances, remplacement global
- **Formatage rapide via la barre d'outils** : gras, italique, barré, code en ligne, sélection du texte pour appliquer immédiatement
- **Rendu d'images locales** : rendu automatique des images en chemin local en mode prévisualisation (jpg/png/gif/webp/svg/bmp)
- **Numéros de ligne / Retour à la ligne** : tous deux activables/désactivables dans les paramètres
- **Amélioration des blocs de code** : coloration syntaxique (highlight.js), étiquette de langue, bouton de copie, basculement du retour à la ligne
- **Repli de la barre d'outils de formatage** : repli automatique lorsque la largeur de la fenêtre est insuffisante, support du déploiement/repli manuel
- **Filtrage du Frontmatter** : filtrage automatique du YAML frontmatter en mode prévisualisation/côte à côte/temps réel

### Formules mathématiques et graphiques

- **Formules KaTeX** : plugin KaTeX intégré, rendu en temps réel des formules LaTeX en ligne `$...$` et en bloc `$$...$$`
- **Graphiques Mermaid** : plugin Mermaid intégré, rendu automatique en graphiques visuels des diagrammes de flux, diagrammes de séquence, diagrammes de Gantt, diagrammes de classes, camemberts, etc., support de multiples configurations de thèmes
- **Sélecteur de lignes et colonnes pour les tableaux** : le bouton tableau de la barre d'outils ouvre une grille 8×8, cliquez pour insérer un tableau du nombre de lignes et colonnes correspondant

### Mode présentation (diaporama)

- **Piloté par Markdown pur** : aucun format supplémentaire nécessaire, `---` (ligne horizontale) pour les sauts de page, le moteur analyse la structure complète de la page et choisit automatiquement la mise en page
- **14 mises en page automatiques** : couverture, page de chapitre, page de fin, table des matières, contenu, liste, tableau de données, feuille de route, image-texte, image, citation, code, graphique (mermaid), formule
- **Page de contenu alignée à gauche + soulignement d'accentuation** : titre aligné en haut à gauche avec soulignement de couleur thématique, corps du texte aligné à gauche, lecture confortable
- **Page citation avec guillemets en diagonale** : guillemet supérieur accroché en haut à gauche, guillemet inférieur accroché en bas à droite, contenu centré verticalement
- **Instructions explicites** : `<!-- layout: xxx -->` pour forcer la mise en page, `<!-- align: left|center|right -->` pour l'alignement de la page entière (commentaire HTML, invisible lors du rendu)
- **Méta couverture** : le frontmatter fournit `author`/`date`, affichés automatiquement sur la couverture
- **Pied de page et progression** : nom du chapitre + numéro de page en bas à gauche, barre de progression de couleur thématique en bas
- **Défilement à la molette** : le contenu défile d'abord lorsqu'il est scrollable, puis la page change aux limites
- **Héritage du thème** : la couleur des titres change précisément selon le thème (supporté par les 15 thèmes), changement de thème/clair-sombre possible pendant la présentation
- **Basculement plein écran** : touche F pour plein écran/restauration, support de l'entrée fiable depuis tout état de fenêtre (normal/maximisé)
- **Bouton de sortie** : affichage d'un bouton de sortie semi-transparent en haut à droite lors de l'activité de la souris, masquage automatique après 1,5 seconde d'inactivité
- **Restauration de l'état de la fenêtre** : restauration automatique de l'état de la fenêtre avant l'entrée en sortie de présentation (plein écran/maximisé/normal)

### Système de plugins

- Architecture modulaire avec deux plugins principaux intégrés : KaTeX et Mermaid
- L'onglet « Plugins » du panneau de paramètres permet le contrôle d'activation/désactivation et la configuration des plugins
- Chargement dynamique à la demande des plugins, les plugins désactivés n'occupent pas de ressources

### Gestion multi-fichiers

- **Mode instance unique** : l'ouverture de plusieurs fichiers ne lance plus plusieurs fenêtres, fusion automatique dans l'instance existante, positionnement automatique sur l'onglet correspondant pour les fichiers rouverts
- **Barre d'onglets** : gestion des fichiers ouverts en haut, changement, fermeture, création
- **Page d'accueil** : liste des fichiers récemment ouverts, avec taille et date de modification
- **Indicateur d'état de sauvegarde** : animation de point respirant pour les fichiers non sauvegardés, animation de confirmation ✅ après sauvegarde
- **Confirmation de fermeture** : pour les fichiers non sauvegardés, boîte de dialogue de confirmation sauvegarder/ne pas sauvegarder/annuler

### Opérations sur les fichiers

- **Ouvrir** : supporte .md / .markdown / .txt
- **Nouveau** : nouvel onglet vide affichant « Nouveau fichier sans nom »
- **Nouveau à partir d'un modèle** : menu déroulant « Nouveau à partir d'un modèle » dans la barre d'outils, création d'un nouveau document selon la structure Markdown du modèle sélectionné ; possibilité de définir un modèle par défaut dans Paramètres → Général, puis `Ctrl+N` l'appliquera automatiquement
- **Sauvegarde / Sauvegarde automatique** : sauvegarde manuelle + sauvegarde automatique configurable par intervalle (5~180 secondes, par défaut 60 secondes)
- **Enregistrer sous** : la boîte de dialogue « Enregistrer sous » s'affiche automatiquement lors de la première sauvegarde d'un nouveau fichier
- **Export** : trois formats - HTML / Markdown / Texte brut
- **Association de fichiers .md** : configuration en un clic comme éditeur Markdown par défaut du système, double-clic sur .md pour ouvrir directement (registre Windows / LaunchServices macOS)

### Personnalisation de l'apparence

- **Quinze thèmes intégrés** : Académique (défaut), Vibrant Orange, Tech, Minimaliste, Magazine, Nature, Verre Liquide, Litchi Rouge, Violet, Cyberpunk, Facebook, Matrix, Mint Glacé, Coucher de Soleil, Vintage Typewriter, chacun avec deux palettes clair et sombre
- **Mode sombre / clair** : chaque thème possède deux palettes clair et sombre
- **Personnalisation des polices** : paramètres de police, taille et interligne séparés pour les modes source et prévisualisation
- **CSS personnalisé** : `user.css` est appliqué après tous les thèmes, avec la priorité la plus élevée
- **Extension de thèmes** : placez des fichiers `.css` dans le répertoire `themes/`, ajoutez les paramètres du thème dans `themes/theme.json`, reconnaissance automatique après redémarrage

### Autres

- **Modèles de document** : placez des fichiers `.md` dans le répertoire `templates/`, disponibles lors de la création
- **Système de raccourcis clavier** : panneau de configuration visuel des raccourcis, support de 30 actions personnalisables, enregistrement de touches, détection de conflits et restauration par défaut
- **Panneau de paramètres** : plusieurs onglets - Général, Apparence, Éditeur, Mode temps réel, IA, Plugins, Raccourcis clavier, Modèles, À propos, etc., aperçu en temps réel des paramètres

---

## Raccourcis clavier

| Raccourci | Fonction |
|-----------|----------|
| Ctrl+N | Nouveau fichier |
| Ctrl+O | Ouvrir un fichier |
| Ctrl+S | Sauvegarder |
| Ctrl+Shift+S | Enregistrer sous |
| Ctrl+W | Fermer l'onglet |
| Ctrl+H | Exporter en HTML |
| Ctrl+M | Exporter en Markdown |
| Ctrl+Z | Annuler |
| Ctrl+Y | Rétablir |
| Ctrl+F | Rechercher |
| Ctrl+\ | Basculer la barre latérale |
| Ctrl+B | Gras |
| Ctrl+I | Italique |
| Ctrl+- | Barré |
| Ctrl++ | Code en ligne |
| Ctrl+1 | Titre de niveau 1 |
| Ctrl+2 | Titre de niveau 2 |
| Ctrl+3 | Titre de niveau 3 |
| Ctrl+. | Liste à puces |
| Ctrl+0 | Liste numérotée |
| Ctrl+' | Citation |
| Ctrl+K | Lien |
| Ctrl+` | Bloc de code |
| Ctrl+T | Tableau |
| Ctrl+L | Ligne horizontale |
| F1 | Liste des raccourcis clavier |
| F2 | Basculer mode sombre/clair |
| F3 | Cycle des modes de vue |
| Ctrl+Alt+P | Mode présentation (diaporama) |
| Ins | Menu barre oblique |
| F12 | Outils de développement |

Les raccourcis clavier peuvent être personnalisés dans Paramètres → Raccourcis clavier, avec support de la configuration visuelle et de la détection de conflits.

---

## Structure du répertoire portable

```
YiziMarkdown/
├── YiziMarkdown.exe        # Programme principal
├── readme.md               # Description du projet (ce fichier)
├── welcome.md              # Document d'accueil
├── changelog.md            # Journal de développement
├── user.css                # Styles personnalisés utilisateur
├── keybindings.json        # Configuration des raccourcis clavier
├── themes/                 # Fichiers CSS de thèmes
│   ├── academic.css        # Académique (défaut)
│   ├── vibrant.css         # Vibrant Orange
│   ├── tech.css            # Tech
│   ├── minimal.css         # Minimaliste
│   ├── magazine.css        # Magazine
│   ├── nature.css          # Nature
│   ├── liquidglass.css     # Verre Liquide
│   ├── lychee.css          # Litchi Rouge
│   ├── violet.css          # Violet
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Mint Glacé
│   ├── sunset.css          # Coucher de Soleil
│   └── typewriter.css      # Vintage Typewriter
├── skills/                 # Compétences IA (Skill)
│   ├── skills.json         # Liste des compétences
│   ├── slides-outline.md   # Synthèse de présentation
│   ├── doc-summary.md      # Résumé de document
│   └── polish-writing.md   # Enrichissement et réécriture
└── templates/              # Modèles de documents
    └── default.md          # Modèle par défaut
```

---

## Pile technologique

| Couche | Technologie |
|--------|-------------|
| Framework desktop | Tauri 2 (Rust) |
| Framework frontend | React 18 + TypeScript |
| Moteur d'éditeur | CodeMirror 6 |
| Gestion d'état | Zustand (persist) |
| Solution de style | Tailwind CSS + Variables CSS |
| Rendu Markdown | markdown-it |
| Internationalisation | i18n léger développé en interne (15 langues) |
| Intégration IA | Proxy en flux Rust (protocoles OpenAI/Anthropic/Ollama) |
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

### Construire la version de production

**Windows**

```bash
npm run tauri:build
```

Artefacts de construction :
- Version portable exe : `src-tauri/target/release/yizimarkdown.exe`
- Paquet d'installation MSI : `src-tauri/target/release/bundle/msi/`
- Paquet d'installation NSIS : `src-tauri/target/release/bundle/nsis/`

Après la construction, copiez manuellement l'exe et les fichiers de ressources dans le répertoire `public/YiziMarkdown-vX.X.X/` pour la distribution.

**macOS (binaire universel, supportant Intel et Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artefacts de construction :
- Paquet applicatif : `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Paquet d'installation : `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### Structure du projet

```
code/
├── src/                    # Code source frontend
│   ├── App.tsx             # Composant principal de l'application
│   ├── components/         # Composants UI
│   │   ├── Editor.tsx      # Éditeur CodeMirror + prévisualisation
│   │   ├── TabBar.tsx      # Barre d'onglets
│   │   ├── HomePage.tsx    # Page d'accueil (fichiers récents)
│   │   ├── Toolbar.tsx     # Barre d'outils
│   │   ├── Sidebar.tsx     # Barre latérale (plan + exploration de fichiers)
│   │   ├── StatusBar.tsx   # Barre d'état en bas
│   │   └── SettingsModal.tsx # Panneau de paramètres
│   ├── stores/             # Gestion d'état Zustand
│   ├── lib/                # Bibliothèque d'utilitaires (rendu markdown, ID de titres)
│   └── styles/             # Styles globaux
├── src-tauri/              # Backend Rust
│   ├── src/main.rs         # Commandes Tauri (lecture/écriture de fichiers, chargement de thèmes, registre, etc.)
│   ├── icons/              # Icônes de l'application
│   ├── themes/             # CSS des thèmes
│   └── templates/          # Modèles de documents
└── package.json
```

---

## Licence

MIT
