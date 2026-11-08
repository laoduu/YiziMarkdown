# YiziMarkdown


![imagem](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](../../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md) | [Русский](./readme-ru.md)

**Site oficial:** https://md.yizigpt.com

O YiziMarkdown é um editor Markdown multiplataforma centrado na escrita. Um mesmo arquivo `.md` oferece sete formas de se apresentar: `edição de código`, `revisão lado a lado`, `escrita em tempo real`, `pré-visualização final`, `apresentação em slides`, `leitura como livro` e um `modo zen` que deixa só o texto para você se concentrar em escrever.

- **Windows**: instalável (pacote NSIS com atualização em um clique dentro do aplicativo) ou versão portátil em zip: extraia e use
- **macOS**: pacote binário universal, nativo tanto em Intel quanto em Apple Silicon
- **Linux**: `deb` para distribuições Debian e `AppImage` sem instalação (Ubuntu 22.04+ / Debian 12+, no momento apenas amd64)

Por que criar outro editor Markdown? As opções do mercado ou não são agradáveis aos olhos, ou são carregadas e inchadas de recursos, e é difícil achar uma ferramenta que combine simplicidade, beleza e uma experiência de uso fluida. Foi assim que nasceu o YiziMarkdown, com três compromissos firmes: **interface bonita**, **recursos poderosos** e **muitos cenários de uso**.

Assim chegamos ao `YiziMarkdown` de hoje: `3 sistemas`, `7 modos de uso`, `16 idiomas de interface`, `15 temas claros e escuros`, `5 Skills de IA` e `7 formatos de exportação`. Além disso, traz recursos inovadores como o assistente de IA e o armazenamento na nuvem, junto com documentação aberta sobre temas, skills e apresentações, para você construir experiências de uso ainda mais singulares.

Isto já não é um editor Markdown simples, mas um aplicativo versátil, capaz de cobrir de verdade os mais diversos cenários de documentos na sua criação, no trabalho e na vida.

---

## Sete modos: um documento, sete formas de apresentar

O valor do Markdown não está apenas em escrever, mas também em para quem e como ele é mostrado. O YiziMarkdown oferece sete formas de apresentar o mesmo documento: as quatro primeiras são visões de edição, que alternam entre o código-fonte e o resultado final; as três últimas são cenários independentes, que transformam o documento em slides, páginas de livro ou simplesmente deixam só o texto.

| Modo | Em uma frase | Entrada | Ideal para |
|------|-----------|------|------|
| Código | Editar o Markdown original diretamente | `F3` / botões de visualização | Refinar a estrutura, substituições em massa, editar o front matter |
| Lado a lado | Escrever à esquerda, comparar na hora à direita | `F3` / botões de visualização | Revisar a diagramação, escrever com base em um modelo |
| Tempo real | WYSIWYG, as marcas se ocultam sozinhas | `F3` / botões de visualização | Escrita de textos longos, redação concentrada |
| Pré-visualização | Mostra apenas a diagramação final | `F3` / botões de visualização | Conferir o resultado, ler o texto inteiro |
| Apresentação | O documento direto como slides | `Ctrl+Alt+P` / barra de ferramentas | Compartilhar, reportar, dar aula |
| Leitura | O documento diagramado como um livro que se folheia | `Ctrl+Alt+R` / barra de ferramentas | Leituras longas, EPUB, leitura imersiva |
| Zen | A interface inteira sai, só o texto fica | `F9` / barra de ferramentas | Escrita profunda |

`F3` alterna ciclicamente entre Código / Lado a lado / Tempo real / Pré-visualização; Apresentação, Leitura e Zen têm entradas próprias e não entram em conflito.

---

## Markdown: quatro em um

![Comparação dos quatro modos](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

Código, Lado a lado, Tempo real e Pré-visualização compartilham o mesmo núcleo de edição e o mesmo conjunto de recursos Markdown. A diferença está só na densidade de informação: das marcas totalmente expostas ao resultado final diagramado. Dá para alternar a qualquer momento, e a visão mantém a posição atual tanto quanto possível.

### Modo Código: tudo à vista

- Núcleo CodeMirror 6: destaque de sintaxe, correspondência de parênteses, preenchimento automático
- Números de linha e quebra automática de linha podem ser ativados de forma independente; ideal para refinar linha por linha e reescrever em massa
- O front matter YAML é exibido como está, sem adivinhar o formato ao editar metadados
- Tabelas, blocos de código e fórmulas aparecem como código-fonte: a opção mais controlável para estruturas complexas

### Modo Lado a lado: escrever e conferir

- Código à esquerda, pré-visualização à direita, atualizada a cada digitação
- A sincronização de rolagem é guiada pela estrutura do documento, e ao trocar de visão o app volta à posição atual
- Ideal para revisar a diagramação ou reestruturar com base em um documento existente

### Modo Tempo real: o que você vê é o que você tem

- Ao digitar, as marcas Markdown se ocultam automaticamente e reaparecem quando o cursor sai, mantendo o foco no conteúdo
- 4 animações originais de aparecimento das marcas (Foco / Flash / Brilho / Onda), com pré-visualização e troca nos ajustes
- O front matter YAML é renderizado como um painel de propriedades editável no estilo Obsidian: 7 tipos (automático / texto / número / caixa de seleção / data / data e hora / lista), e o tipo é memorizado globalmente pelo nome da propriedade

### Modo Pré-visualização: só o resultado

- O Markdown é renderizado enquanto você escreve; as caixas de seleção das listas de tarefas podem ser marcadas com um clique
- Imagens de caminhos locais, imagens da web e SVG são renderizadas automaticamente (jpg / png / gif / webp / svg / bmp)
- O front matter é ocultado automaticamente: o que você vê é a diagramação final

### O que as quatro visões compartilham

- **Busca e substituição**: navegação entre ocorrências, substituir tudo
- **Formatação pela barra de ferramentas**: negrito, itálico, tachado, código embutido — aplicados na seleção na hora
- **Blocos de código aprimorados**: destaque de sintaxe do highlight.js, etiqueta de linguagem, botão de copiar, alternância da quebra de linha
- **Seletor de tabela**: grade de 8×8 para inserir com um clique, com linhas e colunas à vista, adicionar ou remover linhas e colunas, e um menu de contexto completo
- **Fórmulas e diagramas**: KaTeX embutido `$...$` / em bloco `$$...$$`, e Mermaid para diagramas de fluxo, de sequência, de Gantt, de classes, gráficos de pizza e mais, com as cores do tema
- **Barra de formatação recolhível**: recolhe sozinha quando a janela estreita, e também pode ser expandida manualmente
- **Números de linha e quebra automática**: ativáveis nos ajustes
- **Navegação pela estrutura**: a hierarquia de títulos vem da estrutura do documento e acompanha a posição de rolagem

---

## Modo Apresentação: transforme as notas em slides com um clique

![Modo apresentação](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

Não é mais preciso exportar as notas para o PPT: com a skill do assistente de IA integrado, elas são condensadas em uma versão enxuta de apresentação com um clique; ao mudar para o modo Apresentação, o documento se torna imediatamente slides em tela cheia. A paginação, as colunas e os layouts são inferidos automaticamente da estrutura Markdown, e as diretivas em comentários HTML entram em cena quando é preciso controle exato.

### O conteúdo vira slides

- Nenhum formato extra é necessário: `---` (linha horizontal) inicia um novo slide
- Um `***` sozinho na linha divide o slide em colunas, até 4
- O mecanismo analisa a estrutura da página e escolhe o layout: títulos, listas, tabelas, código, imagens e diagramas têm o seu

### 14 layouts

Capa, página de seção, página final, agenda, conteúdo, lista, tabela de dados, roadmap, texto + imagem, imagem, citação, código, diagrama (Mermaid), fórmula.

- Exceto «texto + imagem», que exige `<!-- layout: figure -->` explícito, todos os layouts são inferidos do conteúdo
- As páginas de conteúdo são alinhadas à esquerda e o título tem um sublinhado na cor do tema
- As páginas de citação trazem aspas grandes na diagonal: a de abertura no canto superior esquerdo e a de fechamento no canto inferior direito, com o conteúdo centralizado na vertical
- A capa lê automaticamente `author` / `date` do front matter

### Controle de tipografia durante a apresentação

- HUD ajustável: fonte (seguir o tema / sem serifa / com serifa / monoespaçada), peso, tamanho e largura/altura da área de conteúdo (50%–95%)
- Os ajustes valem na hora e ficam salvos para a próxima apresentação
- Código embutido muito longo quebra em várias linhas em vez de ser cortado na borda
- Diretivas explícitas: `<!-- layout: xxx -->` força um layout e `<!-- align: left|center|right -->` alinha a página inteira

### Apresentação e navegação

- Nome do capítulo e número da página no canto inferior esquerdo; barra de progresso na cor do tema na parte inferior
- `T` abre a gaveta da agenda; `G` ou o campo na parte inferior pula para uma página
- Roda do mouse vira os slides: primeiro rola o conteúdo e, ao chegar ao limite, vira a página
- `F` alterna tela cheia e restauração, funcionando a partir de qualquer estado da janela (normal, maximizada, etc.)
- Ao sair, o estado anterior da janela é restaurado; o botão de sair no canto superior direito se oculta após 1,5 s sem atividade
- Temas herdados: as cores dos títulos acompanham o tema, e dá para trocar tema e modo claro/escuro durante a apresentação

---

## Modo Leitura: o documento vira um livro que se folheia

![Modo leitura](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

O modo Leitura não é uma pré-visualização em tela cheia: o texto é realmente diagramado em páginas fixas, com capa, folha de rosto, sumário, números de página e animações de papel e de virar página.

- Entrada: botão de livro na barra de ferramentas ou `Ctrl+Alt+R`; `Esc` sai e restaura a visão anterior
- Diagramação: uma moldura fina com margens iguais nos quatro lados envolve as páginas; duas páginas se unem com uma única linha no canal central; título do livro no canto superior esquerdo, capítulo / número da página no canto inferior esquerdo e HUD no canto inferior direito, nas mesmas posições do modo Apresentação
- Capa, folha de rosto e sumário são gerados automaticamente: o título vem do front matter `title` ou do primeiro H1, o sumário é montado a partir dos títulos com números de página e é paginado quando fica longo
- Paginação real: páginas duplas frente a frente (página única em janelas estreitas), com números de página e progresso de leitura

### Animações de virada de página

4 opções, trocadas nos ajustes; o padrão é o deslizamento horizontal:

- **Deslizamento horizontal** (padrão): a página inteira desliza, direto e rápido
- **Virada 3D**: a folha se ergue do canto inferior direito e dobra em torno do canal central, com elevação, luz e sombra (no modo de página única, em torno da lombada)
- **Fade** / **Zoom**: transições mais discretas

Pressionamentos repetidos não pulam páginas; saltos pelo sumário, números de página e notas de rodapé não reproduzem animação.

### Regras de paginação no nível da página

Parágrafos são divididos por linha, títulos nunca ficam órfãos, cabeçalhos de tabela se repetem nas páginas seguintes, blocos de código continuam linha a linha, listas continuam item a item e imagens inteiras são escalonadas proporcionalmente; os parágrafos do corpo ganham recuo de dois caracteres na primeira linha, que não se repete nas páginas de continuação.

### Navegação e detalhes

- Gaveta de sumário: `T` abre, títulos listados por hierarquia com o número da página, clique para ir direto
- `G` ou o campo de número de página pula para a página indicada
- Ida e volta de notas de rodapé: clicar em uma referência leva à página da definição e a destaca, com um botão «voltar à referência»; âncoras internas também pulam por página
- HUD de leitura: no canto inferior direito, alterna claro/escuro, tema, fonte (tema / com serifa / sem serifa / monoespaçada), tamanho e entrelinha, valendo só para esta sessão de leitura
- Memória de posição: página / capítulo lembrados por documento e restaurados ao entrar de novo
- Controles: setas, PageUp / PageDown, espaço, roda do mouse e clique nas bordas esquerda ou direita da página

### EPUB

Abrir um `.epub` entra direto no modo Leitura: usa o tema de leitura do aplicativo (ignorando o CSS da editora), e lê a capa embutida, o sumário de navegação, imagens, fórmulas, SVG do Mermaid, notas de rodapé e links entre capítulos. EPUB com DRM e de layout fixo (quadrinhos / livros ilustrados) ainda não são suportados.

---

## Modo Zen: só o texto

![Modo zen](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

Entre com `F9` ou com o botão de modo zen na barra de ferramentas. A barra de ferramentas, a barra de abas, a barra lateral, o painel de IA e a barra de status se recolhem e desaparecem em direção às bordas da tela, camada por camada, deixando apenas o texto; todo o processo **não altera o layout**, e o texto não se move um único pixel.

- **O mundo continua lá**: ao encostar o ponteiro em qualquer borda da tela (cima / esquerda / direita / baixo), a região correspondente reaparece no lugar; ela se recolhe cerca de 1,2 s depois que o ponteiro se afasta
- **Um interruptor permanente**: o botão do modo zen não some e fica onde estava (com uma ondulação de respiração bem leve ao redor), servindo tanto de âncora de «você está no modo zen» quanto de saída; `F9` / `Esc` também saem
- **Só para escrever**: disponível apenas em Código / Tempo real; ao mudar para Lado a lado, Pré-visualização, ou entrar em Leitura / Apresentação, o modo sai automaticamente
- **Um papel mais limpo**: números de linha e linhas verticais da barra lateral ocultos, vinheta bem leve, ponteiro oculto após 2 s parado, e a barra de rolagem vertical trocada por uma linha fina minimalista que aparece ao rolar ou ao se aproximar da borda direita

---

## Arquivos e escrita

### Arquivos e abas

- **Abrir**: `.md` / `.markdown` / `.txt` / `.epub`; EPUB entra direto no modo Leitura
- **Modo de instância única**: vários arquivos abertos são mesclados na janela existente, e um arquivo já aberto é focado na aba correspondente
- **Barra de abas**: alternar, fechar, criar e reordenar arrastando
- **Página inicial**: lista de arquivos abertos recentemente, com tamanho e data de modificação
- **Estado de salvamento**: um ponto que respira enquanto há alterações não salvas e uma confirmação ✅ depois de salvar
- **Confirmação ao fechar**: salvar / não salvar / cancelar quando há alterações não salvas

### Novos documentos e modelos

- Uma aba em branco nova mostra «Arquivo novo sem título»
- O menu «Novo a partir de modelo» na barra de ferramentas cria um documento com a estrutura Markdown do modelo escolhido; também é possível definir um modelo padrão em Configurações → Geral, e então `Ctrl+N` o aplica
- Os modelos ficam no diretório do usuário: basta colocar arquivos `.md`, ou criá-los e editá-los em Configurações → Modelos

### Colar como Markdown

Texto rico copiado de páginas da web, Word / DOCX, Google Docs, Notion e afins é convertido em memória para Markdown limpo ao colar (títulos / listas / tabelas / código / citações / links); código Markdown já existente e texto puro são colados como estão.

### Salvamento e exportação

- **Salvar / salvamento automático**: salvamento manual mais intervalo configurável (5–180 s, padrão 60 s)
- **Salvar como**: ao salvar um arquivo novo, a caixa de diálogo Salvar como abre automaticamente
- **Exportar**: HTML / Markdown / texto puro / Word (DOCX) / PDF / PPTX / EPUB
  - DOCX usa a semântica nativa do Word (listas, tabelas, blocos de código, citações, listas de tarefas), alinha o estilo das tabelas com a pré-visualização e aceita imagens de caminhos locais, imagens da web e `<img>` em HTML (a largura é controlada por `width`)
  - PDF mantém a mesma fidelidade da pré-visualização e pagina automaticamente
  - HTML traz um cartão flutuante de estrutura à esquerda, com clique para ir direto à seção (o PDF não tem barra lateral)
  - PPTX herda o tema, o modo claro/escuro e os layouts do modo Apresentação, e gera texto, tabelas, imagens, formas e fórmulas nativas editáveis
  - EPUB vem do plugin integrado; antes de exportar dá para escolher divisão por capítulos / capa / sumário visível / tema de leitura / informações do documento
- **Associação de arquivos `.md`**: nos ajustes, defina o YiziMarkdown como editor Markdown padrão do sistema (registro do Windows / LaunchServices do macOS)

### Armazenamento na nuvem (WebDAV)

- **Navegador de arquivos**: a aba «Nuvem» na barra lateral navega pela árvore do servidor: abrir documentos, criar arquivos / pastas, renomear, mover, excluir; trilhas de navegação profundas se recolhem em «…» com um menu suspenso, e as pastas carregam sob demanda, nível por nível
- **Salvar na nuvem**: um documento local sobe com um clique, junto com as imagens referenciadas por caminhos relativos, preservando a estrutura de diretórios; em documentos na nuvem, `Ctrl+S` grava direto no servidor
- **Proteção contra conflitos**: antes de salvar, o ETag é comparado; se o arquivo remoto foi alterado por outro dispositivo, uma caixa de diálogo oferece «sobrescrever a versão do servidor» ou «descartar minhas alterações e recarregar», nunca uma sobrescrita silenciosa
- **Segurança das credenciais**: usuário e senha vão para o cofre de credenciais do sistema (Gerenciador de Credenciais do Windows / Keychain do macOS), nunca para arquivos de configuração
- **Compatibilidade**: serviços WebDAV padrão como Nutstore, Nextcloud e Synology (recomenda-se uma senha específica do aplicativo)

---

## Extensões e personalização

### Assistente de IA (painel de chat lateral)

- **18 provedores de modelos + serviço personalizado**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen, Zhipu GLM, Moonshot Kimi, Volcano Engine, SiliconFlow, MiniMax, Xiaomi MiMo, Meituan LongCat, OpenRouter, OpenCode Go e Ollama (local); o «serviço personalizado» aceita protocolos compatíveis com OpenAI ou com Anthropic, com Base URL, ID do modelo e chave próprios
- **Chat em streaming**: o botão de robô na barra de ferramentas abre o painel à direita; as respostas chegam em streaming e podem ser interrompidas a qualquer momento
- **Processo de raciocínio**: o reasoning / thinking dos modelos de raciocínio aparece em um bloco recolhível, recolhido por padrão
- **Segurança das chaves**: as chaves de API ficam no cofre do sistema e podem ser salvas, apagadas e verificadas com um clique; endpoints locais (llama.cpp / LM Studio / vLLM etc.) podem ficar sem chave
- **Referenciar o documento atual**: ao marcar, o documento atual entra como contexto, com limite configurável (64K–512K / ilimitado) e número de turnos de contexto (0–20, padrão 3)
- **Resultado pronto para uso**: copiar, inserir no cursor ou criar um documento novo com um clique

### Skills de IA

O botão ⚡ do campo de entrada abre o menu de skills; a tag da skill escolhida é inserida no cursor e o prompt é injetado no contexto. Para criar as suas, basta colocar `skills.json` e os prompts `.md` no diretório `skills/`. Vêm 5 skills integradas: Roteiro da apresentação, Resumo do documento, Polir a redação, Tradução do texto completo e Formatação de Markdown.

### Plugins

- **Recursos principais integrados**: funções semânticas do documento como KaTeX / Mermaid / notas de rodapé / listas de tarefas / TOC não são afetadas pelos interruptores de plugins
- **Plugin integrado**: exportação para EPUB (ativado por padrão e desativável na página de plugins; enquanto estiver ativo, o menu de exportação aparece na barra de ferramentas)
- **Padrão de plugins**: manifesto (versão / versão da API / momento de ativação / permissões / capacidades) → verificação de elegibilidade → ativação sob demanda → registro de capacidades → limpeza na desativação; a versão atual carrega apenas plugins compilados dentro do aplicativo

### Temas e aparência

- **15 temas integrados**: Prism de vidro líquido (padrão), Azul acadêmico, Laranja vibrante, Tecnológico, Minimalista, Revista, Natureza, Vermelho lichia, Violeta, Cyberpunk, Facebook, Matrix, Menta gelada, Ouro fundido, Máquina de escrever retrô; cada um com paleta clara e escura
- **Modo escuro / claro**: alternância com uma tecla (`F2`)
- **Personalização de fontes**: fonte, tamanho e altura da linha configurados separadamente para código e pré-visualização
- **Tema personalizado**: escreva CSS em Configurações → Aparência → CSS personalizado e salve; um «tema personalizado» é gerado sobre o tema atual, seja colando um tema inteiro, seja ajustando só algumas cores, com efeito imediato
- **Extensão de temas**: coloque um `.css` em `themes/` e registre-o em `themes/theme.json`; ele é reconhecido após reiniciar. O sistema de tokens e as convenções estão em `docs/THEME-DESIGN-SPEC.md`

### Idiomas e interface

- **16 idiomas de interface**: chinês simplificado (padrão), chinês tradicional, English, 日本語, 한국어, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська, Русский
- Troca imediata em Configurações → Geral → Idioma da interface; os textos da interface, o painel de atalhos e as descrições de plugins acompanham o idioma
- **Detecção automática na primeira inicialização**: quando não há idioma do instalador, usa-se o idioma do sistema, com retorno ao inglês se não estiver na lista; cada idioma traz também o rótulo `Language` em inglês, para localizar rápido mesmo com a interface em chinês
- **Tamanho da interface**: 80%–120% (padrão 100%), escalando apenas textos e ícones da interface, sem afetar o tamanho dos painéis nem o conteúdo do documento
- **Painel de configurações**: Geral, Aparência, Editor, Modo Tempo real, Assistente de IA, Nuvem, Plugins, Atalhos, Modelos, Documentos, Sobre, Produtos, com pré-visualização imediata

---

## Atalhos de teclado

| Atalho | Função | Atalho | Função |
|--------|------|--------|------|
| Ctrl+N | Novo arquivo | Ctrl+B | Negrito |
| Ctrl+O | Abrir arquivo | Ctrl+I | Itálico |
| Ctrl+S | Salvar arquivo | Ctrl+- | Tachado |
| Ctrl+Shift+S | Salvar como | Ctrl++ | Código embutido |
| Ctrl+W | Fechar aba | Ctrl+1 | Título 1 |
| Ctrl+H | Exportar HTML | Ctrl+2 | Título 2 |
| Ctrl+M | Exportar Markdown | Ctrl+3 | Título 3 |
| Ctrl+Z | Desfazer | Ctrl+. | Lista não ordenada |
| Ctrl+Y | Refazer | Ctrl+0 | Lista ordenada |
| Ctrl+F | Buscar | Ctrl+' | Citação |
| Ctrl+\ | Alternar barra lateral | Ctrl+K | Link |
| F1 | Guia de atalhos | Ctrl+` | Bloco de código |
| F2 | Alternar modo claro/escuro | Ctrl+T | Tabela |
| F3 | Ciclar as quatro visões de edição | Ctrl+L | Linha horizontal |
| F9 | Modo zen (apenas Código / Tempo real) | Ctrl+Alt+P | Modo Apresentação |
| F11 | Alternar tela cheia | Ctrl+Alt+R | Modo Leitura |
| Ins | Menu de barra | F12 | Ferramentas de desenvolvedor |

Os atalhos podem ser personalizados em Configurações → Atalhos: 36 ações com vinculação visual, gravação de teclas, detecção de conflitos e restauração dos padrões.

---

## Estrutura de diretórios

Depois de extrair a versão portátil:

```
YiziMarkdown/
├── YiziMarkdown.exe        # Programa principal
├── readme.md               # Descrição do projeto (este arquivo)
├── welcome.md              # Documento de boas-vindas
├── docs/                   # Documentação (THEME-DESIGN-SPEC.md, especificação de design de temas, etc.)
├── user.css                # Estilos personalizados do usuário
├── keybindings.json        # Configuração de atalhos
├── themes/                 # Arquivos CSS de temas
│   ├── liquidglass-prism.css # Prism de vidro líquido (padrão)
│   ├── academic.css        # Azul acadêmico
│   ├── vibrant.css         # Laranja vibrante
│   ├── tech.css            # Tecnológico
│   ├── minimal.css         # Minimalista
│   ├── magazine.css        # Revista
│   ├── nature.css          # Natureza
│   ├── lychee.css          # Vermelho lichia
│   ├── violet.css          # Violeta
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Menta gelada
│   ├── sunset.css          # Ouro fundido
│   └── typewriter.css      # Máquina de escrever retrô
├── skills/                 # Skills de IA
│   ├── skills.json         # Lista de skills
│   ├── slides-outline.md   # Roteiro da apresentação
│   ├── doc-summary.md      # Resumo do documento
│   ├── polish-writing.md   # Polir a redação
│   ├── translate-fulltext.md # Tradução do texto completo
│   └── markdown-format.md  # Formatação de Markdown
└── templates/              # Modelos integrados (sincronizados ao diretório do usuário na primeira inicialização)
    ├── default.md          # Modelo padrão
    └── Slide-Template.md   # Modelo de apresentação
```

> Aviso: as skills de IA e os modelos de documentos ficam na verdade no **diretório do usuário**: no Windows / macOS, `~/Documents/yizimarkdown/skills/` e `.../templates/`; no Linux, `yizimarkdown/` dentro do diretório de documentos XDG (p. ex. `~/Documentos/yizimarkdown/`), com `~/.local/share/yizimarkdown/` como alternativa quando o sistema não tem diretório de documentos. (As pastas de mesmo nome no diretório do programa são recursos integrados, sincronizadas para lá na primeira inicialização.) Guarde seu conteúdo personalizado no diretório do usuário para que atualizações e reinstalações não o sobrescrevam.

---

## Stack de tecnologia

| Camada | Tecnologia |
|------|------|
| Framework de desktop | Tauri 2 (Rust) |
| Framework de front-end | React 18 + TypeScript |
| Núcleo do editor | CodeMirror 6 |
| Gerenciamento de estado | Zustand (persist) |
| Estilização | Tailwind CSS + variáveis CSS |
| Renderização Markdown | markdown-it |
| Internacionalização | i18n leve próprio (16 idiomas) |
| Integração de IA | Proxy de streaming em Rust (protocolos OpenAI / Anthropic / Ollama) |
| Ferramenta de build | Vite |

---

## Desenvolvimento

### Requisitos

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Iniciar o servidor de desenvolvimento

```bash
cd code
npm install
npm run tauri:dev
```

### Ícone da dock em desenvolvimento no Linux (opcional)

Ambientes como elementary / GNOME procuram um arquivo `.desktop` correspondente pelo `WM_CLASS` da janela; uma build de desenvolvimento não tem instalador e, portanto, não tem `.desktop`, então a dock mostra apenas um ícone genérico (o `_NET_WM_ICON` da própria janela já é fornecido pelo lado Rust, e os instaladores não são afetados). Execute uma vez:

```bash
npm run dev:icon           # grava ~/.local/share/applications/yizimarkdown-dev.desktop
npm run dev:icon:remove    # desfaz
```

Depois, reinicie a janela de desenvolvimento e a dock mostrará o ícone do aplicativo.

### Compilar uma versão de lançamento

**Windows**

```bash
npm run tauri:build
```

Artefatos:
- Exe portátil: `src-tauri/target/release/yizimarkdown.exe`
- Instalador NSIS: `src-tauri/target/release/bundle/nsis/`

Instalador: a primeira instalação pergunta primeiro o idioma de instalação (16 opções: todos os idiomas da interface mais português do Brasil); os textos do assistente e o idioma da primeira inicialização após a instalação seguem essa escolha, e atualizações / atualizações automáticas nunca redefinem o idioma já escolhido pelo usuário. Os ícones e as imagens da barra lateral / cabeçalho ficam em `src-tauri/installer/`; após mudar as cores da marca, regenere com `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1`.

Depois de compilar, copie manualmente o exe e os arquivos de recursos para o diretório `public/YiziMarkdown-vX.X.X/` para distribuição.

**macOS (binário universal, com suporte a Intel e Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artefatos:
- Pacote do aplicativo: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Instalador: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux (deb + AppImage)**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

Artefatos (**no momento apenas amd64 / x86_64**; o `deb` `arm64` e o AppImage `aarch64` para ARM ainda não são publicados):
- Pacote Debian: `src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb` (cerca de 16 MB, instala em `/usr/bin`, registra item de menu, ícone e associações de arquivos `.md` / `.epub`)
- Versão portátil sem instalação: `src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage` (cerca de 100 MB, traz GTK / WebKit e os componentes de mídia do GStreamer, basta dar dois cliques)

Nota: **é preciso compilar no Ubuntu 22.04**. Binários compilados no 24.04 exigem glibc 2.39 e falham ao iniciar no Ubuntu 22.04 (2.35) / Debian 12 (2.36); a dependência `libwebkit2gtk-4.1-0` do `deb` fixa o mesmo piso no Ubuntu 22.04 / Debian 12 (o Debian 11 só tem webkit 4.0). Não oferecemos `rpm` por enquanto: os nomes de dependências do Fedora / openSUSE são diferentes dos do Debian e exigiriam manutenção separada.

### Estrutura do projeto

```
code/
├── src/                    # Código-fonte do front-end
│   ├── App.tsx             # Componente principal do aplicativo
│   ├── components/         # Componentes de UI
│   │   ├── Editor.tsx      # Editor CodeMirror + pré-visualização
│   │   ├── Reader.tsx      # Modo Leitura (paginação / virada de página)
│   │   ├── Slideshow.tsx   # Modo Apresentação
│   │   ├── TabBar.tsx      # Barra de abas
│   │   ├── HomePage.tsx    # Página inicial (arquivos recentes)
│   │   ├── Toolbar.tsx     # Barra de ferramentas
│   │   ├── Sidebar.tsx     # Barra lateral (estrutura + navegador de arquivos)
│   │   ├── StatusBar.tsx   # Barra de status inferior
│   │   └── SettingsModal.tsx # Painel de configurações
│   ├── stores/             # Gerenciamento de estado Zustand
│   ├── lib/                # Utilitários (renderização Markdown, temas, modo zen, etc.)
│   └── styles/             # Estilos globais
├── src-tauri/              # Backend em Rust
│   ├── src/main.rs         # Comandos do Tauri (leitura/escrita de arquivos, carregamento de temas, registro, etc.)
│   ├── icons/              # Ícones do aplicativo
│   ├── themes/             # CSS de temas (com metadados theme.json)
│   └── templates/          # Modelos de documentos
├── docs/                   # Documentação (changelog / readmes i18n / THEME-DESIGN-SPEC.md)
└── package.json
```

---

## Versão e atualizações

As instalações do Windows aceitam atualização em um clique dentro do aplicativo; macOS, Linux e a versão portátil verificam o `latest.json` ao iniciar e, se houver uma versão nova, mostram um aviso no canto inferior direito que abre a página de download correspondente (substituição manual, sem instalação automática; tanto o `deb` quanto o `AppImage` do Linux seguem esse caminho).

---

## Licença

MIT
