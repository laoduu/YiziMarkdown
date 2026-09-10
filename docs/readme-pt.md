# YiziMarkdown

![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)

[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)

**Site oficial:** https://md.yizigpt.com

Um editor `Markdown` elegante e refinado, multiplataforma, com suporte a versão portátil para Windows e versão para macOS. Não requer instalação, basta descompactar e usar, unindo estética e funcionalidade. No Windows, pode ser instalado ou baixado como arquivo compactado para uso imediato; no macOS, é fornecido um pacote de instalação binário universal, executado nativamente tanto em Intel quanto em Apple Silicon.

Por que desenvolver um editor `Markdown`?

Existem muitos editores `Markdown` no mercado, mas a maioria tem interface pouco agradável ou funcionalidades excessivamente complexas. É difícil encontrar uma ferramenta que seja ao mesmo tempo simples, bonita e fácil de usar.

É assim que surgiu o YiziMarkdown.

Criamos uma experiência extremamente elegante para o modo WYSIWYG (o que você vê é o que obtém); além disso, suportamos uma capacidade de apresentação semelhante a PPT, onde os documentos e notas prontos podem ser rapidamente alternados para o modo de apresentação, facilitando compartilhamentos e relatórios. Só experimentando para saber.

---

## Funcionalidades

### Interface Multilíngue

- **15 idiomas de interface**: Chinês simplificado (padrão), Chinês tradicional, Inglês, Japonês, Coreano, Alemão, Francês, Espanhol, Português, Italiano, Polonês, Holandês, Turco, Sueco, Ucraniano
- Configurações → Geral → Alteração de idioma com um clique, efeito imediato; todos os textos da interface, painel de atalhos e descrições de plugins sincronizam com o idioma

### Assistente AI (Painel de chat lateral)

- **17 provedores de modelos de IA + serviço personalizado**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Tongyi Qianwen, Zhipu GLM, Moonshot Kimi, Volcengine Ark, SiliconFlow, MiniMax, OpenRouter, OpenCode Go, Ollama (local); «Serviço personalizado» suporta protocolos compatíveis com OpenAI e Anthropic, preenchendo URL base, ID do modelo e chave, podendo conectar a qualquer serviço de terceiros
- **Habilidades AI (Skill)**: O botão ⚡ na caixa de entrada abre o menu de habilidades; ao selecionar, a tag da habilidade é inserida no cursor e o prompt é injetado automaticamente no contexto; coloque `skills.json` + arquivos `.md` de prompt no diretório `skills/` para personalizar habilidades. Incluídas 3 habilidades: «Extração de apresentação», «Resumo de documento», «Revisão e reescrita»
- **Diálogo em fluxo**: O botão de robô na barra de ferramentas abre o painel AI à direita, com respostas em tempo real em fluxo, podendo parar a qualquer momento
- **Exibição do processo de raciocínio**: O conteúdo de raciocínio dos modelos de inferência (reasoning/thinking) é exibido em blocos recolhíveis, fechados por padrão, sem afetar a leitura do texto
- **Segurança de chaves**: Chaves API armazenadas no chaveiro do sistema (OS keychain), com suporte a salvar, limpar e verificar com um clique; pontos de extremidade locais (llama.cpp / LM Studio / vLLM etc.) podem deixar a chave em branco
- **Referência ao documento atual**: Ao marcar, o documento atual é enviado como contexto para o AI, configurável com limite de referência (64K~512K/ilimitado) e número de rodadas de contexto (0~20, padrão 3)
- **Salvamento de resultados**: As respostas podem ser copiadas, inseridas no documento no cursor, ou criadas como novo documento com um clique

### Edição e Pré-visualização

- **Edição em código-fonte**: Núcleo CodeMirror 6, com destaque de sintaxe, correspondência de parênteses e preenchimento automático
- **Modo em tempo real (WYSIWYG)**: Edição no que você vê é o que obtém, ocultando automaticamente as marcações Markdown ao digitar, focando na criação de conteúdo
- **Animação do modo em tempo real**: 4 esquemas de animação de exibição de marcações (Foco/Brilho/Resplandecer/Ondulação), com visualização e alternância nas configurações
- **Pré-visualização em tempo real**: Markdown é renderizado ao digitar, com suporte a interação de checkboxes em listas de tarefas
- **Cinco modos de visualização**: Código-fonte / Lado a lado / Em tempo real (WYSIWYG) / Pré-visualização / Apresentação (slides em tela cheia), alternância com um clique
- **Sincronização de rolagem guiada por esquema**: No modo lado a lado, os painéis esquerdo e direito se sincronizam bidirecionalmente, posicionando automaticamente na localização atual ao alternar visualização
- **Pesquisa e substituição**: Suporte a navegação por correspondências e substituição de todas
- **Formatação rápida da barra de ferramentas**: Negrito, itálico, tachado, código inline — selecione o texto e aplique imediatamente
- **Renderização de imagens locais**: O modo de pré-visualização renderiza automaticamente imagens de caminhos locais (jpg/png/gif/webp/svg/bmp)
- **Numeração de linhas / Quebra de linha**: Ambos configuráveis nas configurações
- **Aprimoramento de blocos de código**: Destaque de sintaxe (highlight.js), etiqueta de linguagem, botão de cópia, alternância de quebra de linha
- **Recolhimento da barra de ferramentas de formatação**: Recolhe automaticamente quando a largura da janela é insuficiente, com suporte a expandir/recolher manualmente
- **Filtro de Frontmatter**: Modo de pré-visualização/lado a lado/em tempo real filtra automaticamente o frontmatter YAML

### Fórmulas Matemáticas e Gráficos

- **Fórmulas KaTeX**: Plugin KaTeX integrado, renderização em tempo real de fórmulas LaTeX inline `$...$` e em bloco `$$...$$`
- **Gráficos Mermaid**: Plugin Mermaid integrado, renderização automática de fluxogramas, diagramas de sequência, diagramas Gantt, diagramas de classes, gráficos de pizza etc., com suporte a múltiplas configurações de tema
- **Seletor de linhas e colunas de tabela**: O botão de tabela na barra de ferramentas abre uma grade 8×8, clique para inserir tabela com o número correspondente de linhas e colunas

### Modo de Apresentação (Slides)

- **Impulsionado por Markdown puro**: Não requer nenhum formato adicional, `---` (linha horizontal) para quebra de página, o motor analisa a estrutura da página inteira e escolhe automaticamente o layout
- **14 layouts automáticos**: Capa, página de capítulo, página final, sumário, conteúdo, lista, tabela de dados, roteiro, texto com imagem, imagem, citação, código, gráfico (mermaid), fórmula
- **Páginas de conteúdo alinhadas à esquerda + linha de destaque sublinhada**: Título alinhado no canto superior esquerdo com linha de destaque na cor do tema, texto alinhado à esquerda, leitura confortável
- **Páginas de citação com aspas diagonais**: Aspas superiores no canto superior esquerdo, aspas inferiores no canto inferior direito, conteúdo centralizado verticalmente
- **Instruções explícitas**: `<!-- layout: xxx -->` força o layout, `<!-- align: left|center|right -->` alinhamento da página inteira (comentários HTML, invisíveis na renderização)
- **Metadados da capa**: Front matter fornece `author`/`date`, exibidos automaticamente na capa
- **Rodapé e progresso**: Nome do capítulo + número da página no canto inferior esquerdo, barra de progresso na cor do tema na parte inferior
- **Rolar com a roda do mouse**: Quando o conteúdo pode rolar, primeiro rola o conteúdo; ao chegar ao limite, avança a página
- **Herança de tema**: A cor dos títulos varia precisamente com o tema (15 temas suportados), com possibilidade de alternar tema/claro-escuro durante a apresentação
- **Alternância de tela cheia**: Tecla F para tela cheia/restaurar, com suporte a entrar de forma confiável a partir de qualquer estado da janela (normal/maximizada)
- **Botão de saída**: Botão de saída semitransparente no canto superior direito quando o mouse está ativo, ocultando automaticamente após 1,5 segundos sem interação
- **Restauração do estado da janela**: Ao sair da apresentação, restaura automaticamente o estado da janela anterior (tela cheia/maximizada/normal)

### Sistema de Plugins

- Arquitetura baseada em plugins, com os dois plugins principais KaTeX e Mermaid integrados
- Painel de configurações com aba «Plugins» para controle de ativação/desativação e configuração
- Plugins carregados dinamicamente conforme necessário; se desativados, não consomem recursos

### Gestão de Múltiplos Arquivos

- **Modo de instância única**: A abertura de múltiplos arquivos não lança múltiplas janelas, mesclando automaticamente na instância existente; arquivos abertos repetidamente são posicionados automaticamente na aba correspondente
- **Barra de abas (Tab)**: Gerencia múltiplos arquivos abertos no topo, com alternância, fechamento e criação
- **Página inicial**: Lista dos arquivos abertos recentemente, com tamanho e data de modificação
- **Indicador de estado de salvamento**: Animação de ponto pulsante para arquivos não salvos, animação de confirmação ✅ após salvar
- **Confirmação ao fechar**: Ao fechar arquivos não salvos, exibe confirmação salvar/não salvar/cancelar

### Operações de Arquivo

- **Abrir**: Suporte a .md / .markdown / .txt
- **Novo**: Abre nova aba em branco, exibindo «Novo arquivo sem nome»
- **Criar a partir de modelo**: Menu suspensa «Criar a partir de modelo» na barra de ferramentas, cria novo documento com base na estrutura Markdown do modelo selecionado; também é possível definir um modelo padrão em Configurações → Geral, e `Ctrl+N` o aplica automaticamente
- **Salvar / Salvamento automático**: Salvamento manual + salvamento automático com intervalo configurável (5~180 segundos, padrão 60 segundos)
- **Salvar como**: Arquivos novos abrem automaticamente o diálogo «Salvar como» ao salvar
- **Exportar**: Três formatos — HTML / Markdown / Texto puro
- **Associação de arquivos .md**: Configuração com um clique para definir como editor Markdown padrão do sistema; clique duplo em .md abre diretamente (Registro do Windows / LaunchServices do macOS)

### Personalização de Aparência

- **Quinze temas integrados**: Azul Acadêmico (padrão), Laranja Vibrante, Tecnológico, Minimalista, Revista, Natural, Vidro Líquido, Lychee Vermelho, Violeta, Cyberpunk, Facebook, Matrix, Mint Frappe, Pôr do Sol Derretido, Datilografia Vintage — cada um com esquema de cores claro e escuro
- **Modo escuro / claro**: Cada tema possui esquema de cores claro e escuro
- **Personalização de fonte**: Configuração separada de fonte, tamanho e altura de linha nos modos de código-fonte e pré-visualização
- **CSS personalizado**: `user.css` sobrepõe todos os temas, com a maior prioridade
- **Extensão de temas**: Coloque arquivos `.css` no diretório `themes/` e adicione parâmetros do tema em `themes/theme.json`; após reinício, são reconhecidos automaticamente

### Outros

- **Templates de documento**: Coloque arquivos `.md` no diretório `templates/`, disponíveis ao criar novos documentos
- **Sistema de atalhos**: Painel de configuração visual de atalhos, com suporte a personalização de 30 ações, gravação de teclas, detecção de conflitos e restauração de padrões
- **Painel de configurações**: Múltiplas abas — Geral, Aparência, Editor, Modo em tempo real, AI, Plugins, Atalhos, Templates, Sobre — com visualização instantânea das alterações

---

## Atalhos

| Atalho | Função |
|--------|--------|
| Ctrl+N | Novo arquivo |
| Ctrl+O | Abrir arquivo |
| Ctrl+S | Salvar arquivo |
| Ctrl+Shift+S | Salvar como |
| Ctrl+W | Fechar aba |
| Ctrl+H | Exportar HTML |
| Ctrl+M | Exportar Markdown |
| Ctrl+Z | Desfazer |
| Ctrl+Y | Refazer |
| Ctrl+F | Pesquisar |
| Ctrl+\ | Alternar barra lateral |
| Ctrl+B | Negrito |
| Ctrl+I | Itálico |
| Ctrl+- | Tachado |
| Ctrl++ | Código inline |
| Ctrl+1 | Título nível 1 |
| Ctrl+2 | Título nível 2 |
| Ctrl+3 | Título nível 3 |
| Ctrl+. | Lista não ordenada |
| Ctrl+0 | Lista ordenada |
| Ctrl+' | Citação |
| Ctrl+K | Link |
| Ctrl+` | Bloco de código |
| Ctrl+T | Tabela |
| Ctrl+L | Linha horizontal |
| F1 | Lista completa de atalhos |
| F2 | Alternar modo claro/escuro |
| F3 | Ciclar visualizações |
| Ctrl+Alt+P | Modo de apresentação (slides) |
| Ins | Menu de barra |
| F12 | Ferramentas do desenvolvedor |

Os atalhos podem ser personalizados em Configurações → Atalhos, com suporte a configuração visual e detecção de conflitos.

---

## Estrutura de Diretórios da Versão Portátil

```
YiziMarkdown/
├── YiziMarkdown.exe        # Programa principal
├── readme.md               # Descrição do projeto (este arquivo)
├── welcome.md              # Documento de boas-vindas
├── changelog.md            # Registro de desenvolvimento
├── user.css                # Estilos personalizados do usuário
├── keybindings.json        # Configuração de atalhos
├── themes/                 # Arquivos CSS de temas
│   ├── academic.css        # Azul Acadêmico (padrão)
│   ├── vibrant.css         # Laranja Vibrante
│   ├── tech.css            # Tecnológico
│   ├── minimal.css         # Minimalista
│   ├── magazine.css        # Revista
│   ├── nature.css          # Natural
│   ├── liquidglass.css     # Vidro Líquido
│   ├── lychee.css          # Lychee Vermelho
│   ├── violet.css          # Violeta
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Mint Frappe
│   ├── sunset.css          # Pôr do Sol Derretido
│   └── typewriter.css      # Datilografia Vintage
├── skills/                 # Habilidades AI (Skill)
│   ├── skills.json         # Lista de habilidades
│   ├── slides-outline.md   # Extração de apresentação
│   ├── doc-summary.md      # Resumo de documento
│   └── polish-writing.md   # Revisão e reescrita
└── templates/              # Templates de documento
    └── default.md          # Modelo padrão
```

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Framework de desktop | Tauri 2 (Rust) |
| Framework front-end | React 18 + TypeScript |
| Núcleo do editor | CodeMirror 6 |
| Gerenciamento de estado | Zustand (persist) |
| Esquema de estilos | Tailwind CSS + Variáveis CSS |
| Renderização Markdown | markdown-it |
| Internacionalização | i18n leve proprietário (15 idiomas) |
| Integração AI | Proxy em fluxo Rust (protocolos OpenAI/Anthropic/Ollama) |
| Ferramentas de construção | Vite |

---

## Desenvolvimento

### Requisitos do Ambiente

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Iniciar servidor de desenvolvimento

```bash
cd code
npm install
npm run tauri:dev
```

### Construir versão de distribuição

**Windows**

```bash
npm run tauri:build
```

Artefatos de construção:
- Executável portátil: `src-tauri/target/release/yizimarkdown.exe`
- Pacote MSI: `src-tauri/target/release/bundle/msi/`
- Pacote NSIS: `src-tauri/target/release/bundle/nsis/`

Após a construção, copie manualmente o executável e os arquivos de recursos para o diretório `public/YiziMarkdown-vX.X.X/` para distribuição.

**macOS (binário universal, suportando Intel e Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artefatos de construção:
- Pacote de aplicativo: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Pacote de instalação: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### Estrutura do Projeto

```
code/
├── src/                    # Código-fonte front-end
│   ├── App.tsx             # Componente principal da aplicação
│   ├── components/         # Componentes de UI
│   │   ├── Editor.tsx      # Editor CodeMirror + pré-visualização
│   │   ├── TabBar.tsx      # Barra de abas
│   │   ├── HomePage.tsx    # Página inicial (arquivos recentes)
│   │   ├── Toolbar.tsx     # Barra de ferramentas
│   │   ├── Sidebar.tsx     # Barra lateral (esquema + navegação de arquivos)
│   │   ├── StatusBar.tsx   # Barra de status inferior
│   │   └── SettingsModal.tsx # Painel de configurações
│   ├── stores/             # Gerenciamento de estado Zustand
│   ├── lib/                # Bibliotecas utilitárias (renderização markdown, IDs de títulos)
│   └── styles/             # Estilos globais
├── src-tauri/              # Backend Rust
│   ├── src/main.rs         # Comandos Tauri (leitura/escrita de arquivos, carregamento de temas, registro etc.)
│   ├── icons/              # Ícones do aplicativo
│   ├── themes/             # CSS de temas
│   └── templates/          # Templates de documento
└── package.json
```

---

## Licença

MIT
