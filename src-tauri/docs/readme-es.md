# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)


[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)


**Sitio web oficial:** https://md.yizigpt.com

Un editor `Markdown` elegante y minimalista multiplataforma, compatible con Windows (versión portátil) y macOS. No requiere instalación, basta con descomprimir para usarlo, combinando estética y funcionalidad. Windows permite instalación o descarga de archivo comprimido para uso directo; macOS ofrece paquete de instalación binario universal, ejecución nativa tanto en Intel como en Apple Silicon.

¿Por qué desarrollar un editor `Markdown`?

Existen muchos editores `Markdown` en el mercado, pero la mayoría tiene interfaces poco atractivas o funcionalidades excesivamente complejas, y es difícil encontrar una herramienta que sea a la vez sencilla, estética y fácil de usar.

Así nació YiziMarkdown.

Creamos una experiencia extremadamente elegante para el modo WYSIWYG; además, soporta capacidad de presentación tipo PPT. Los documentos y notas escritos pueden cambiar rápidamente al modo de presentación, facilitando la sharing y la reportes. Solo sabrás cuando lo pruebes.

---

## Características

### Interfaz multilingüe

- **15 idiomas de interfaz**: Chino simplificado (predeterminado), 繁體中文, English, 日本語, 한국어, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська
- Configuración → General → Cambio de idioma con un clic, efecto inmediato; todos los textos de la interfaz, paneles de atajos de teclado y descripciones de plugins se adaptan al idioma seleccionado

### Asistente AI (panel lateral de chat)

- **17 proveedores de modelos grandes + servicio personalizado**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Tongyi Qianwen, Zhipu GLM, Moonshot Kimi, Volcano Ark, Silicon Flow, MiniMax, OpenRouter, OpenCode Go, Ollama (local); El "servicio personalizado" soporta protocolos compatibles con OpenAI/Anthropic, permite configurar URL base, ID del modelo y clave API, compatible con cualquier servicio de terceros
- **Habilidades AI (Skill)**: El botón ⚡ en el campo de entrada abre el menú de habilidades; al seleccionar una, la etiqueta de la habilidad se inserta en el cursor y el prompt se inyecta automáticamente en el contexto. Coloca `skills.json` + archivos `.md` de prompts en el directorio `skills/` para personalizar habilidades. Incluye 3 habilidades integradas: "Extracción de presentaciones", "Resumen de documentos" y "Pulir/redactar"
- **Conversación en flujo continuo**: El botón de robot en la barra de herramientas abre el panel AI a la derecha; las respuestas se transmiten en tiempo real, detenibles en cualquier momento
- **Visualización del proceso de pensamiento**: El contenido de razonamiento/pensamiento de los modelos de inferencia se muestra en bloques colapsables, colapsado por defecto, sin interferir con la lectura del contenido principal
- **Seguridad de claves API**: Las claves API se almacenan en el llavero del sistema (OS keychain), soportando guardado, eliminación y verificación con un clic; Las claves de puntos de conexión locales (llama.cpp / LM Studio / vLLM, etc.) pueden dejarse en blanco
- **Citar documento actual**: Al marcar, se envía el documento actual como contexto al AI, configurable con límite de citas (64K~512K/sin límite) y número de turnos de contexto (0~20 turnos, predeterminado 3)
- **Almacenamiento de resultados**: Las respuestas pueden copiarse, insertarse en el documento en el cursor o crearse como nuevo documento con un clic

### Edición y vista previa

- **Edición de código fuente**: Núcleo CodeMirror 6, resaltado de sintaxis, coincidencia de paréntesis, autocompletado
- **Modo en tiempo real (WYSIWYG)**: Edición lo que ves es lo que obtienes, ocultación automática de marcadores Markdown al escribir, enfocado en la creación de contenido
- **Animación del modo en tiempo real**: 4 esquemas de animación de marcadores (enfoque/destello/brillo/ondulación), previsualización y cambio en configuración
- **Vista previa en tiempo real**: Markdown se renderiza al escribir, soporta interacción con casillas de verificación de listas de tareas
- **Cinco modos de vista**: Fuente / Lado a lado / En tiempo real (WYSIWYG) / Vista previa / Presentación (diapositivas a pantalla completa), cambio con un clic
- **Sincronización de desplazamiento guiada por esquema**: En modo lado a lado, los paneles izquierdo y derecho se sincronizan bidireccionalmente; al cambiar de vista, se posiciona automáticamente en la posición actual
- **Búsqueda y reemplazo**: Soporta navegación entre coincidencias y reemplazo de todos
- **Formato rápido de barra de herramientas**: Negrita, cursiva, tachado, código en línea; seleccionar texto y aplicar directamente
- **Renderizado de imágenes locales**: En modo de vista previa, renderiza automáticamente imágenes de rutas locales (jpg/png/gif/webp/svg/bmp)
- **Números de línea / ajuste de texto**: Ambos configurables en ajustes
- **Mejora de bloques de código**: Resaltado de sintaxis (highlight.js), etiquetas de idioma, botón de copiar, ajuste de texto
- **Plegado de barra de herramientas de formato**: Se pliega automáticamente cuando el ancho de la ventana es insuficiente, soporta despliegue/plegamiento manual
- **Filtrado de Frontmatter**: Filtra automáticamente el frontmatter YAML en modos de vista previa/lado a lado/en tiempo real

### Fórmulas matemáticas y gráficos

- **Fórmulas KaTeX**: Plugin KaTeX integrado, renderizado en tiempo real de fórmulas LaTeX en línea `$...$` y de bloque `$$...$$`
- **Gráficos Mermaid**: Plugin Mermaid integrado, renderizado automático de diagramas de flujo, diagramas de secuencia, diagramas de Gantt, diagramas de clases, gráficos circulares, etc., soporta múltiples configuraciones de temas
- **Selector de filas y columnas de tablas**: El botón de tabla en la barra de herramientas abre una cuadrícula 8×8; hacer clic inserta una tabla con el número de filas y columnas correspondiente

### Modo de presentación (diapositivas)

- **Impulsado por Markdown puro**: No requiere ningún formato adicional, `---` (línea horizontal) para separar páginas; el motor analiza la estructura de toda la página y selecciona automáticamente el diseño
- **14 diseños automáticos**: Portada, página de capítulo, página final, índice, contenido, lista, tabla de datos, hoja de ruta, imagen con texto, imagen, cita destacada, código, gráfico (mermaid), fórmula
- **Páginas de contenido alineadas a la izquierda + subrayado de énfasis**: Títulos alineados a la esquina superior izquierda con subrayado del color del tema, contenido alineado a la izquierda, cómodo para la lectura
- **Páginas de citas con comillas diagonales**: Comillas superiores en la esquina superior izquierda, comillas inferiores en la esquina inferior derecha, contenido centrado verticalmente
- **Instrucciones explícitas**: `<!-- layout: xxx -->` para forzar diseño, `<!-- align: left|center|right -->` para alineación de página completa (comentarios HTML, invisibles en el renderizado)
- **Metadatos de portada**: Front matter proporciona `author`/`date`, la portada los muestra automáticamente
- **Pie de página y progreso**: Nombre del capítulo + número de página en la esquina inferior izquierda, barra de progreso del color del tema en la parte inferior
- **Paginación con rueda del ratón**: Cuando el contenido es desplazable, primero se desplaza el contenido; al llegar al límite, cambia de página
- **Herencia de temas**: Los colores de los títulos cambian con precisión según el tema (15 temas soportados), se puede cambiar el tema/modo claro-oscuro durante la presentación
- **Alternar pantalla completa**: Tecla F para pantalla completa/restaurar, soporta entrada confiable desde cualquier estado de ventana (normal/maximizada)
- **Botón de salida**: Aparece un botón de salida semitransparente en la esquina superior derecha cuando el ratón está activo, se oculta automáticamente tras 1.5 segundos sin interacción
- **Restauración de estado de ventana**: Al salir de la presentación, restaura automáticamente el estado de ventana anterior (pantalla completa/maximizada/normal)

### Sistema de plugins

- Arquitectura modular con plugins, plugins KaTeX y Mermaid integrados como núcleo
- La página "Plugins" del panel de configuración permite habilitar/deshabilitar y configurar plugins
- Los plugins se cargan dinámicamente según necesidad, los deshabilitados no consumen recursos

### Gestión de múltiples archivos

- **Modo de instancia única**: Al abrir múltiples archivos no se inician múltiples ventanas, se fusionan automáticamente en la instancia existente; los archivos abiertos repetidamente se localizan en la pestaña correspondiente
- **Barra de pestañas**: Gestiona múltiples archivos abiertos en la parte superior, cambiar, cerrar, crear nuevos
- **Página de inicio**: Lista de archivos abiertos recientemente, con tamaño del archivo y hora de modificación
- **Indicador de estado de guardado**: Animación de punto respiratorio para archivos no guardados, animación de confirmación ✅ tras guardar
- **Confirmación de cierre**: Al cerrar archivos no guardados, aparece diálogo de confirmación guardar/no guardar/cancelar

### Operaciones de archivos

- **Abrir**: Soporta .md / .markdown / .txt
- **Crear nuevo**: Nueva pestaña en blanco, muestra "Nuevo archivo sin nombre"
- **Crear desde plantilla**: Menú desplegable "Crear desde plantilla" en la barra de herramientas; crea un nuevo documento según la estructura Markdown de la plantilla seleccionada; también se puede establecer una plantilla predeterminada en Configuración → General, y luego `Ctrl+N` la aplica automáticamente
- **Guardar / autoguardado**: Guardado manual + autoguardado configurable por intervalo (5~180 segundos, predeterminado 60 segundos)
- **Guardar como**: Al guardar archivos nuevos aparece automáticamente el diálogo de guardar como
- **Exportar**: Tres formatos: HTML / Markdown / texto plano
- **Asociación de archivos .md**: Configurar con un clic como editor Markdown predeterminado del sistema; hacer doble clic en .md para abrir directamente (registro de Windows / macOS LaunchServices)

### Personalización de apariencia

- **Quince temas integrados**: Azul académico (predeterminado), naranja vibrante, estilo tecnológico, minimalista, estilo revista, estilo natural, vidrio líquido, rojo lichi, violeta, cyberpunk, Facebook, Matrix, menta, atardecer dorado, typewriter vintage; cada uno con esquemas de colores claro y oscuro
- **Modo oscuro / claro**: Cada tema tiene esquemas de colores claro y oscuro
- **Personalización de fuentes**: Configuración separada de fuente, tamaño y interlineado para modo fuente y vista previa
- **CSS personalizado**: `user.css` se aplica después de todos los temas, con la máxima prioridad
- **Extensión de temas**: Coloca archivos `.css` en el directorio `themes/` y agrega parámetros del tema en `themes/theme.json`; se reconocen automáticamente tras reiniciar

### Otros

- **Plantillas de documentos**: Coloca archivos `.md` en el directorio `templates/`; se pueden seleccionar al crear nuevos documentos
- **Sistema de atajos de teclado**: Panel de configuración visual de atajos, soporta personalización de 30 acciones, grabación de teclas, detección de conflictos y restauración de valores predeterminados
- **Panel de configuración**: Múltiples pestañas: General, Apariencia, Editor, Modo en tiempo real, AI, Plugins, Atajos de teclado, Plantillas, Acerca de; vista previa en tiempo real de los ajustes

---

## Atajos de teclado

| Atajo | Función |
|--------|------|
| Ctrl+N | Crear archivo nuevo |
| Ctrl+O | Abrir archivo |
| Ctrl+S | Guardar archivo |
| Ctrl+Shift+S | Guardar como |
| Ctrl+W | Cerrar pestaña |
| Ctrl+H | Exportar HTML |
| Ctrl+M | Exportar Markdown |
| Ctrl+Z | Deshacer |
| Ctrl+Y | Rehacer |
| Ctrl+F | Buscar |
| Ctrl+\ | Alternar barra lateral |
| Ctrl+B | Negrita |
| Ctrl+I | Cursiva |
| Ctrl+- | Tachado |
| Ctrl++ | Código en línea |
| Ctrl+1 | Encabezado nivel 1 |
| Ctrl+2 | Encabezado nivel 2 |
| Ctrl+3 | Encabezado nivel 3 |
| Ctrl+. | Lista sin orden |
| Ctrl+0 | Lista ordenada |
| Ctrl+' | Cita |
| Ctrl+K | Enlace |
| Ctrl+` | Bloque de código |
| Ctrl+T | Tabla |
| Ctrl+L | Línea horizontal |
| F1 | Lista completa de atajos |
| F2 | Alternar modo claro/oscuro |
| F3 | Ciclar entre vistas |
| Ctrl+Alt+P | Modo de presentación (diapositivas) |
| Ins | Menú slash |
| F12 | Herramientas de desarrollador |

Los atajos de teclado se pueden personalizar en Configuración → Atajos de teclado, soportando configuración visual y detección de conflictos.

---

## Estructura de directorio de la versión portátil

```
YiziMarkdown/
├── YiziMarkdown.exe        # Programa principal
├── readme.md               # Descripción del proyecto (este archivo)
├── welcome.md              # Documento de bienvenida
├── changelog.md            # Registro de desarrollo
├── user.css                # Estilos personalizados del usuario
├── keybindings.json        # Configuración de atajos de teclado
├── themes/                 # Archivos CSS de temas
│   ├── academic.css        # Azul académico (predeterminado)
│   ├── vibrant.css         # Naranja vibrante
│   ├── tech.css            # Estilo tecnológico
│   ├── minimal.css         # Minimalista
│   ├── magazine.css        # Estilo revista
│   ├── nature.css          # Estilo natural
│   ├── liquidglass.css     # Vidrio líquido
│   ├── lychee.css          # Rojo lichi
│   ├── violet.css          # Violeta
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Menta
│   ├── sunset.css          # Atardecer dorado
│   └── typewriter.css      # Typewriter vintage
├── skills/                 # Habilidades AI (Skill)
│   ├── skills.json         # Lista de habilidades
│   ├── slides-outline.md   # Extracción de presentaciones
│   ├── doc-summary.md      # Resumen de documentos
│   └── polish-writing.md   # Pulir/redactar
└── templates/              # Plantillas de documentos
    └── default.md          # Plantilla predeterminada
```

---

## Stack tecnológico

| Capa | Tecnología |
|------|------|
| Framework de escritorio | Tauri 2 (Rust) |
| Framework frontend | React 18 + TypeScript |
| Núcleo del editor | CodeMirror 6 |
| Gestión de estado | Zustand (persist) |
| Esquema de estilos | Tailwind CSS + variables CSS |
| Renderizado de Markdown | markdown-it |
| Internacionalización | i18n ligero propio (15 idiomas) |
| Integración AI | Proxy en flujo continuo en Rust (protocolos OpenAI/Anthropic/Ollama) |
| Herramienta de construcción | Vite |

---

## Desarrollo

### Requisitos del entorno

- Node.js 18+
- Rust (estable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Iniciar servidor de desarrollo

```bash
cd code
npm install
npm run tauri:dev
```

### Construir versión de lanzamiento

**Windows**

```bash
npm run tauri:build
```

Productos de construcción:
- Versión portátil exe: `src-tauri/target/release/yizimarkdown.exe`
- Paquete de instalación MSI: `src-tauri/target/release/bundle/msi/`
- Paquete de instalación NSIS: `src-tauri/target/release/bundle/nsis/`

Tras la construcción, copiar manualmente el exe y archivos de recursos al directorio `public/YiziMarkdown-vX.X.X/` para distribución.

**macOS (binario universal, compatible con Intel y Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Productos de construcción:
- Paquete de aplicación: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Paquete de instalación: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### Estructura del proyecto

```
code/
├── src/                    # Código fuente frontend
│   ├── App.tsx             # Componente principal de la aplicación
│   ├── components/         # Componentes de interfaz
│   │   ├── Editor.tsx      # Editor CodeMirror + vista previa
│   │   ├── TabBar.tsx      # Barra de pestañas
│   │   ├── HomePage.tsx    # Página de inicio (archivos recientes)
│   │   ├── Toolbar.tsx     # Barra de herramientas
│   │   ├── Sidebar.tsx     # Barra lateral (esquema + explorador de archivos)
│   │   ├── StatusBar.tsx   # Barra de estado inferior
│   │   └── SettingsModal.tsx # Panel de configuración
│   ├── stores/             # Gestión de estado Zustand
│   ├── lib/                # Biblioteca de utilidades (renderizado markdown, IDs de encabezados)
│   └── styles/             # Estilos globales
├── src-tauri/              # Backend Rust
│   ├── src/main.rs         # Comandos Tauri (lectura/escritura de archivos, carga de temas, registro, etc.)
│   ├── icons/              # Iconos de la aplicación
│   ├── themes/             # CSS de temas
│   └── templates/          # Plantillas de documentos
└── package.json
```

---

## Licencia

MIT
