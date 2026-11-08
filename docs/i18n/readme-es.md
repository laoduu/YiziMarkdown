# YiziMarkdown


![imagen](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](../../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md) | [Русский](./readme-ru.md)

**Sitio web oficial:** https://md.yizigpt.com

YiziMarkdown es un editor Markdown multiplataforma centrado en la escritura. Un mismo archivo `.md` ofrece siete formas de presentarse: `edición de código`, `revisión lado a lado`, `escritura en vivo`, `vista previa final`, `presentación en diapositivas`, `lectura como libro` y un `modo zen` que deja solo el texto para concentrarse en escribir.

- **Windows**: instalable (paquete NSIS con actualización en un clic dentro de la aplicación) o versión portátil en zip: descomprimir y usar
- **macOS**: paquete binario universal, nativo tanto en Intel como en Apple Silicon
- **Linux**: `deb` para distribuciones Debian y `AppImage` sin instalación (Ubuntu 22.04+ / Debian 12+, por ahora solo amd64)

¿Por qué crear otro editor de Markdown? Las opciones del mercado o no son agradables a la vista, o están recargadas de funciones, y cuesta encontrar una herramienta que sea a la vez limpia, hermosa y cómoda de usar. Así nació YiziMarkdown, con tres principios firmes: **una interfaz atractiva**, **funciones potentes** y **múltiples escenarios de uso**.

Así es el `YiziMarkdown` de hoy: `3 sistemas`, `7 modos de uso`, `16 idiomas de interfaz`, `15 temas claros y oscuros`, `5 Skills de IA` y `7 formatos de exportación`. Además incorpora funciones innovadoras como el asistente de IA y el almacenamiento en la nube, junto con documentación abierta sobre temas, skills y presentaciones, para que construya experiencias de uso únicas.

Ya no es un simple editor de Markdown, sino una aplicación versátil que cubre de verdad sus escenarios documentales de creación, trabajo y vida cotidiana.

---

## Siete modos: un documento, siete formas de presentarlo

El valor de Markdown no está solo en escribir, sino también en para quién y cómo se muestra. YiziMarkdown ofrece siete formas de presentar un mismo documento: las cuatro primeras son vistas de edición que alternan entre el código fuente y el resultado final; las tres últimas son escenarios independientes que convierten el documento en diapositivas, páginas de libro o simplemente en el texto.

| Modo | En una frase | Acceso | Ideal para |
|------|-----------|------|------|
| Código | Editar el Markdown original directamente | `F3` / botones de vista | Refinar la estructura, reemplazos masivos, editar el front matter |
| Lado a lado | Escribir a la izquierda, comparar al instante a la derecha | `F3` / botones de vista | Revisar la maquetación, escribir contra una plantilla |
| En vivo | WYSIWYG, las marcas se ocultan solas | `F3` / botones de vista | Escritura de textos largos, redacción concentrada |
| Vista previa | Muestra solo la maquetación final | `F3` / botones de vista | Revisar el resultado, leer de principio a fin |
| Presentación | El documento como presentación de diapositivas | `Ctrl+Alt+P` / barra de herramientas | Compartir, informar, dar clase |
| Lectura | El documento como un libro que se puede hojear | `Ctrl+Alt+R` / barra de herramientas | Lecturas largas, EPUB, lectura inmersiva |
| Zen | La interfaz desaparece, solo queda el texto | `F9` / barra de herramientas | Escritura profunda |

`F3` alterna cíclicamente entre Código / Lado a lado / En vivo / Vista previa; Presentación, Lectura y Zen tienen accesos propios y no entran en conflicto.

---

## Markdown: cuatro en uno

![Comparación de los cuatro modos](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

Código, Lado a lado, En vivo y Vista previa comparten el mismo núcleo de edición y el mismo conjunto de capacidades Markdown. La diferencia está solo en la densidad de información: desde las marcas totalmente expuestas hasta el resultado final maquetado. Puede cambiar en cualquier momento, y la vista conservará su posición en la medida de lo posible.

### Modo Código: todo a la vista

- Núcleo CodeMirror 6: resaltado de sintaxis, emparejamiento de paréntesis, autocompletado
- Números de línea y ajuste de línea se activan por separado; ideal para refinar línea a línea y reescribir en bloque
- El front matter YAML se muestra tal cual, sin adivinar el formato al editar metadatos
- Tablas, bloques de código y fórmulas se muestran como código fuente: la opción más controlable para estructuras complejas

### Modo Lado a lado: escribir y comparar

- Código a la izquierda, vista previa a la derecha, actualizada al escribir
- La sincronización de desplazamiento la marca el esquema; al cambiar de vista se vuelve a la posición actual
- Ideal para revisar la maquetación o reestructurar contra un documento existente

### Modo En vivo: lo que ves es lo que obtienes

- Las marcas de Markdown se ocultan al escribir y reaparecen al salir el cursor, para centrarse en el contenido
- 4 animaciones originales de aparición de marcas (Enfoque / Destello / Brillo / Onda), con vista previa y cambio en la configuración
- El front matter YAML se renderiza como un panel de propiedades editable al estilo Obsidian: 7 tipos (automático / texto / número / casilla / fecha / fecha y hora / lista), y el tipo se recuerda globalmente por nombre de propiedad

### Modo Vista previa: solo el resultado

- Markdown se renderiza al escribir; las casillas de las listas de tareas se marcan con un clic
- Las imágenes de rutas locales, las remotas y los SVG se renderizan automáticamente (jpg / png / gif / webp / svg / bmp)
- El front matter se oculta automáticamente: lo que ve es el formato final

### Lo que comparten las cuatro vistas

- **Buscar y reemplazar**: navegación entre coincidencias, reemplazar todo
- **Formato desde la barra de herramientas**: negrita, cursiva, tachado, código en línea; se aplica al instante a la selección
- **Bloques de código mejorados**: resaltado de sintaxis de highlight.js, etiqueta de lenguaje, botón de copia, alternar ajuste de línea
- **Selector de tablas**: cuadrícula de 8×8 para insertar con un clic, filas y columnas a la vista, añadir o quitar filas y columnas, y un menú contextual completo
- **Fórmulas y diagramas**: KaTeX en línea `$...$` / en bloque `$$...$$`, y Mermaid para diagramas de flujo, de secuencia, de Gantt, de clases, circulares y más, con colores del tema
- **Barra de formato plegable**: se contrae sola al estrecharse la ventana y también se puede desplegar a mano
- **Números de línea y ajuste de línea**: se activan en la configuración
- **Navegación por esquema**: la jerarquía de títulos viene de la estructura del documento y sigue la posición de desplazamiento

---

## Modo Presentación: convertir las notas en diapositivas con un clic

![Modo presentación](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

Ya no hace falta exportar las notas a PPT: con las skills del asistente de IA integrado se condensan en una versión de presentación en un clic; al cambiar al modo Presentación, el documento se convierte al instante en diapositivas a pantalla completa. La paginación, las columnas y los diseños se infieren automáticamente de la estructura Markdown, y las directivas en comentarios HTML permiten un control preciso cuando haga falta.

### El contenido vira diapositivas

- No se necesita ningún formato adicional: `---` (línea horizontal) separa diapositivas
- Una línea con solo `***` divide la diapositiva en columnas, hasta 4
- El motor analiza la estructura de la página y elige el diseño: títulos, listas, tablas, código, imágenes y diagramas tienen el suyo

### 14 diseños

Portada, página de sección, página final, agenda, contenido, lista, tabla de datos, hoja de ruta, texto + imagen, imagen, cita destacada, código, diagrama (Mermaid), fórmula.

- Salvo «texto + imagen», que requiere `<!-- layout: figure -->` explícito, todos los diseños se infieren del contenido
- Las páginas de contenido se alinean a la izquierda y el título lleva un subrayado del color del tema
- Las páginas de cita destacada llevan comillas grandes en diagonal: la de apertura arriba a la izquierda y la de cierre abajo a la derecha, con el contenido centrado verticalmente
- La portada lee automáticamente `author` / `date` del front matter

### Control tipográfico durante la presentación

- HUD ajustable: fuente (seguir el tema / sin serifa / con serifa / monoespaciada), grosor, tamaño y ancho/alto del área de contenido (50%–95%)
- Los ajustes se aplican al instante y se conservan para la siguiente presentación
- El código en línea largo se ajusta en varias líneas en lugar de quedar cortado en el borde
- Directivas explícitas: `<!-- layout: xxx -->` fuerza un diseño y `<!-- align: left|center|right -->` alinea toda la página

### Presentación y navegación

- Nombre del capítulo y número de página abajo a la izquierda; barra de progreso del color del tema en la parte inferior
- `T` abre el cajón de la agenda; `G` o el campo inferior permiten saltar a una página
- Rueda del ratón para pasar diapositivas: primero desplaza el contenido y, al llegar al límite, cambia de página
- `F` alterna pantalla completa y restauración, y funciona desde cualquier estado de ventana (normal, maximizada, etc.)
- Al salir se restaura el estado de ventana anterior; el botón de salida de la esquina superior derecha se oculta tras 1,5 s sin actividad
- Los temas se heredan: los colores de los títulos siguen el tema, y el tema y el modo claro/oscuro se pueden cambiar durante la presentación

---

## Modo Lectura: el documento como un libro que se hojea

![Modo lectura](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

El modo Lectura no es una vista previa a pantalla completa: el texto se maqueta de verdad en páginas fijas, con portada, portadilla, índice, números de página y animaciones de papel y de paso de hoja.

- Acceso: el botón de libro en la barra de herramientas o `Ctrl+Alt+R`; `Esc` sale y restaura la vista anterior
- Maquetación: un borde fino con márgenes iguales en los cuatro lados envuelve las páginas; dos páginas se unen con una sola línea en el canal central; el título del libro arriba a la izquierda, el capítulo / número de página abajo a la izquierda y el HUD abajo a la derecha, en las mismas posiciones que en Presentación
- Portada, portadilla e índice se generan automáticamente: el título se toma del front matter `title` o del primer H1, el índice se construye a partir de los títulos con números de página y se pagina si es muy largo
- Paginación real: doble página enfrentada (página única en ventanas estrechas), con números de página y progreso de lectura

### Animaciones de paso de página

4 opciones, que se cambian en la configuración; por defecto, deslizamiento horizontal:

- **Deslizamiento horizontal** (por defecto): toda la página se desplaza, limpio y rápido
- **Volteo 3D**: la hoja se levanta desde la esquina inferior derecha y se dobla alrededor del canal central, con elevación, luz y sombra (en modo de página única, alrededor del lomo)
- **Fundido** / **Zoom**: transiciones más discretas

Las pulsaciones repetidas no saltan páginas; los saltos desde el índice, los números de página y las notas al pie no reproducen animación.

### Reglas de paginación a nivel de página

Los párrafos se dividen por líneas, los títulos nunca quedan solos, las cabeceras de tabla se repiten en las páginas siguientes, los bloques de código continúan línea a línea, las listas continúan elemento a elemento y las imágenes completas se escalan proporcionalmente; los párrafos del cuerpo llevan una sangría de dos caracteres en la primera línea que no se repite en las páginas de continuación.

### Navegación y detalles

- Cajón del índice: `T` lo abre; los títulos se listan por jerarquía con su número de página y se salta con un clic
- `G` o el campo de número de página salta a la página indicada
- Ida y vuelta de notas al pie: al hacer clic en una referencia se salta a la página de la definición y se resalta, con un botón «volver a la referencia»; los anclajes internos también saltan por página
- HUD de lectura: abajo a la derecha se cambian claro/oscuro, tema, fuente (tema / con serifa / sin serifa / monoespaciada), tamaño y espaciado entre líneas; solo afecta a esta sesión de lectura
- Memoria de posición: se recuerda la página / capítulo por documento y se restaura al volver a entrar
- Controles: teclas de dirección, PageUp / PageDown, espacio, rueda del ratón, y clic en los bordes izquierdo o derecho de la página

### EPUB

Abrir un `.epub` entra directamente en el modo Lectura: se usa el tema de lectura de la aplicación (se ignora el CSS del editor), y se leen la portada incrustada, el índice de navegación, las imágenes, las fórmulas, el SVG de Mermaid, las notas al pie y los enlaces entre capítulos. Los EPUB con DRM y de maquetación fija (cómics / libros ilustrados) aún no son compatibles.

---

## Modo Zen: solo queda el texto

![Modo zen](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

Se entra con `F9` o con el botón de modo zen de la barra de herramientas. La barra de herramientas, la barra de pestañas, la barra lateral, el panel de IA y la barra de estado se pliegan y se desvanecen hacia los bordes de la pantalla por capas, dejando solo el texto; todo el proceso **no cambia la maquetación**: el texto no se mueve ni un píxel.

- **El mundo sigue ahí**: al acercar el puntero a cualquiera de los bordes de la pantalla (arriba / izquierda / derecha / abajo), esa zona reaparece en su sitio; se retira unos 1,2 s después de alejarlo
- **Un interruptor permanente**: el botón de modo zen no desaparece y permanece donde estaba (con una ondulación de respiración muy tenue alrededor); sirve a la vez de ancla de «estás en modo zen» y de salida; `F9` / `Esc` también salen
- **Solo para escribir**: disponible únicamente en Código / En vivo; al pasar a Lado a lado, Vista previa, o al entrar en Lectura / Presentación, se sale automáticamente
- **Un papel más limpio**: se ocultan los números de línea y las líneas verticales de la barra lateral, se añade una viñeta muy tenue, el puntero se oculta tras 2 s de inactividad y la barra de desplazamiento vertical se sustituye por una fina línea minimalista que aparece al desplazarse o al acercarse al borde derecho

---

## Archivos y escritura

### Archivos y pestañas

- **Abrir**: `.md` / `.markdown` / `.txt` / `.epub`; un EPUB entra directamente en el modo Lectura
- **Modo de instancia única**: al abrir varios archivos se combinan en la ventana existente, y un archivo ya abierto se enfoca en su pestaña
- **Barra de pestañas**: cambiar, cerrar, crear y reordenar arrastrando
- **Página de inicio**: lista de archivos abiertos recientemente, con tamaño y fecha de modificación
- **Estado de guardado**: un punto que respira mientras hay cambios sin guardar y una confirmación ✅ al guardar
- **Confirmación al cerrar**: guardar / no guardar / cancelar si hay cambios sin guardar

### Documentos nuevos y plantillas

- Una pestaña nueva en blanco muestra «Archivo nuevo sin título»
- El menú «Nuevo desde plantilla» de la barra de herramientas crea un documento con la estructura Markdown de la plantilla elegida; también se puede fijar una plantilla predeterminada en Configuración → General, y luego `Ctrl+N` la aplica
- Las plantillas se guardan en el directorio del usuario: basta dejar archivos `.md`, o crearlas y editarlas en Configuración → Plantillas

### Pegar como Markdown

El texto enriquecido copiado de páginas web, Word / DOCX, Google Docs, Notion y similares se convierte en memoria a Markdown limpio al pegarlo (títulos / listas / tablas / código / citas / enlaces); el código Markdown existente y el texto sin formato se pegan tal cual.

### Guardar y exportar

- **Guardar / guardado automático**: guardado manual más un intervalo configurable (5–180 s, 60 s por defecto)
- **Guardar como**: al guardar un archivo nuevo se abre automáticamente el diálogo Guardar como
- **Exportar**: HTML / Markdown / texto sin formato / Word (DOCX) / PDF / PPTX / EPUB
  - DOCX usa la semántica nativa de Word (listas, tablas, bloques de código, citas, listas de tareas), alinea el estilo de las tablas con la vista previa y admite imágenes de rutas locales, remotas e `<img>` de HTML (el ancho se controla con `width`)
  - PDF mantiene la misma fidelidad que la vista previa y pagina automáticamente
  - HTML incluye una tarjeta flotante de esquema a la izquierda, con un clic para ir a la sección (el PDF no incluye barra lateral)
  - PPTX hereda el tema, el modo claro/oscuro y los diseños del modo Presentación, y genera texto, tablas, imágenes, formas y fórmulas nativas editables
  - EPUB lo aporta un plugin integrado; antes de exportar se puede elegir la división por capítulos / portada / índice visible / tema de lectura / información del documento
- **Asociación de archivos `.md`**: en la configuración se puede establecer YiziMarkdown como editor Markdown predeterminado del sistema (registro de Windows / LaunchServices de macOS)

### Almacenamiento en la nube (WebDAV)

- **Explorador de archivos**: la pestaña «Nube» de la barra lateral permite navegar el árbol del servidor: abrir documentos, crear archivos / carpetas, renombrar, mover y eliminar; las rutas de navegación profundas se pliegan en «…» con un desplegable, y las carpetas se cargan de forma diferida por niveles
- **Guardar en la nube**: un documento local se sube con un clic, junto con las imágenes a las que hace referencia con rutas relativas, manteniendo la estructura de directorios; en documentos en la nube, `Ctrl+S` escribe directamente en el servidor
- **Protección contra conflictos**: antes de guardar se compara el ETag; si el archivo remoto ha sido modificado desde otro dispositivo, un diálogo ofrece «sobrescribir la versión del servidor» o «descartar mis cambios y recargar», sin sobrescritura silenciosa
- **Seguridad de credenciales**: el nombre de usuario y la contraseña se guardan en el almacén de credenciales del sistema (Administrador de credenciales de Windows / Llavero de macOS), nunca en archivos de configuración
- **Compatibilidad**: servicios WebDAV estándar como Nutstore, Nextcloud y Synology (se recomienda una contraseña específica para la aplicación)

---

## Extensiones y personalización

### Asistente de IA (panel de chat lateral)

- **18 proveedores de modelos + servicio personalizado**: OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek, Qwen, Zhipu GLM, Moonshot Kimi, Volcano Engine, SiliconFlow, MiniMax, Xiaomi MiMo, Meituan LongCat, OpenRouter, OpenCode Go y Ollama (local); el «servicio personalizado» admite protocolos compatibles con OpenAI o con Anthropic, con Base URL, ID de modelo y clave propios
- **Chat en streaming**: el botón de robot de la barra de herramientas abre el panel derecho; las respuestas se emiten en streaming y se pueden detener en cualquier momento
- **Proceso de razonamiento**: el reasoning / thinking de los modelos de razonamiento se muestra en un bloque plegable, contraído por defecto
- **Seguridad de las claves**: las claves API se guardan en el llavero del sistema y se pueden guardar, borrar y verificar con un clic; en endpoints locales (llama.cpp / LM Studio / vLLM, etc.) se pueden dejar vacías
- **Referenciar el documento actual**: al marcarlo, el documento actual se envía como contexto, con límite configurable (64K–512K / ilimitado) y número de turnos de contexto (0–20, 3 por defecto)
- **Resultado listo para usar**: copiar, insertar en el cursor o crear un documento nuevo con un clic

### Skills de IA

El botón ⚡ del campo de entrada abre el menú de skills; la etiqueta de la skill elegida se inserta en el cursor y su prompt se inyecta en el contexto. Para definir las propias, basta poner `skills.json` y los prompts `.md` en el directorio `skills/`. Se incluyen 5 skills: Esquema de presentación, Resumen de documento, Pulir la redacción, Traducción de texto completo y Formateo de Markdown.

### Plugins

- **Capacidades principales integradas**: funciones semánticas del documento como KaTeX / Mermaid / notas al pie / listas de tareas / TOC no se ven afectadas por los interruptores de plugins
- **Plugin integrado**: exportación a EPUB (activado por defecto y desactivable en la página de plugins; mientras esté activo, aparece el menú de exportación en la barra de herramientas)
- **Estándar de plugins**: manifest (versión / versión de API / momento de activación / permisos / capacidades) → comprobación de elegibilidad → activación diferida → registro de capacidades → limpieza al desactivar; la versión actual solo carga plugins compilados dentro de la aplicación

### Temas y apariencia

- **15 temas integrados**: Prism de cristal líquido (predeterminado), Azul académico, Naranja vibrante, Tecnológico, Minimalista, Revista, Natural, Rojo lichi, Violeta, Cyberpunk, Facebook, Matrix, Menta helada, Oro fundido, Máquina de escribir retro; cada uno con paleta clara y oscura
- **Modo oscuro / claro**: cambio con una tecla (`F2`)
- **Personalización de fuentes**: fuente, tamaño y altura de línea se configuran por separado para el código y la vista previa
- **Tema personalizado**: escriba CSS en Configuración → Apariencia → CSS personalizado y guarde; se genera un «tema personalizado» sobre el tema actual, ya sea pegando un tema completo o retocando unos pocos colores, con efecto inmediato
- **Extensión de temas**: deje un `.css` en `themes/` y regístrelo en `themes/theme.json`; se reconocerá tras reiniciar. El sistema de tokens y las convenciones están en `docs/THEME-DESIGN-SPEC.md`

### Idiomas e interfaz

- **16 idiomas de interfaz**: chino simplificado (predeterminado), chino tradicional, English, 日本語, 한국어, Deutsch, Français, Español, Português, Italiano, Polski, Nederlands, Türkçe, Svenska, Українська, Русский
- Cambio inmediato en Configuración → General → Idioma de la interfaz; los textos de la interfaz, el panel de atajos y las descripciones de plugins siguen el idioma
- **Detección automática en el primer inicio**: si no hay idioma del instalador, se usa el idioma del sistema y se recurre al inglés si no está en la lista; cada idioma incluye además la etiqueta inglesa `Language` para localizarlo rápido incluso con la interfaz en chino
- **Tamaño de la interfaz**: 80%–120% (100% por defecto); solo escala los textos e iconos de la interfaz, sin afectar el tamaño de los paneles ni el contenido del documento
- **Panel de configuración**: General, Apariencia, Editor, Modo En vivo, Asistente de IA, Nube, Plugins, Atajos, Plantillas, Documentos, Acerca de, Productos, con vista previa inmediata

---

## Atajos de teclado

| Atajo | Función | Atajo | Función |
|--------|------|--------|------|
| Ctrl+N | Nuevo archivo | Ctrl+B | Negrita |
| Ctrl+O | Abrir archivo | Ctrl+I | Cursiva |
| Ctrl+S | Guardar archivo | Ctrl+- | Tachado |
| Ctrl+Shift+S | Guardar como | Ctrl++ | Código en línea |
| Ctrl+W | Cerrar pestaña | Ctrl+1 | Título 1 |
| Ctrl+H | Exportar HTML | Ctrl+2 | Título 2 |
| Ctrl+M | Exportar Markdown | Ctrl+3 | Título 3 |
| Ctrl+Z | Deshacer | Ctrl+. | Lista sin orden |
| Ctrl+Y | Rehacer | Ctrl+0 | Lista ordenada |
| Ctrl+F | Buscar | Ctrl+' | Cita |
| Ctrl+\ | Alternar barra lateral | Ctrl+K | Enlace |
| F1 | Guía de atajos | Ctrl+` | Bloque de código |
| F2 | Alternar modo claro/oscuro | Ctrl+T | Tabla |
| F3 | Ciclar las cuatro vistas de edición | Ctrl+L | Línea horizontal |
| F9 | Modo zen (solo Código / En vivo) | Ctrl+Alt+P | Modo Presentación |
| F11 | Alternar pantalla completa | Ctrl+Alt+R | Modo Lectura |
| Ins | Menú de barra | F12 | Herramientas de desarrollo |

Los atajos se pueden personalizar en Configuración → Atajos: asignación visual de 36 acciones, grabación de teclas, detección de conflictos y restauración de los valores predeterminados.

---

## Estructura de directorios

Tras descomprimir la versión portátil:

```
YiziMarkdown/
├── YiziMarkdown.exe        # Programa principal
├── readme.md               # Descripción del proyecto (este archivo)
├── welcome.md              # Documento de bienvenida
├── docs/                   # Documentación (THEME-DESIGN-SPEC.md, especificación de diseño de temas, etc.)
├── user.css                # Estilos personalizados del usuario
├── keybindings.json        # Configuración de atajos
├── themes/                 # Archivos CSS de temas
│   ├── liquidglass-prism.css # Prism de cristal líquido (predeterminado)
│   ├── academic.css        # Azul académico
│   ├── vibrant.css         # Naranja vibrante
│   ├── tech.css            # Tecnológico
│   ├── minimal.css         # Minimalista
│   ├── magazine.css        # Revista
│   ├── nature.css          # Natural
│   ├── lychee.css          # Rojo lichi
│   ├── violet.css          # Violeta
│   ├── cyberpunk.css       # Cyberpunk
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # Matrix
│   ├── mint.css            # Menta helada
│   ├── sunset.css          # Oro fundido
│   └── typewriter.css      # Máquina de escribir retro
├── skills/                 # Skills de IA
│   ├── skills.json         # Lista de skills
│   ├── slides-outline.md   # Esquema de presentación
│   ├── doc-summary.md      # Resumen de documento
│   ├── polish-writing.md   # Pulir la redacción
│   ├── translate-fulltext.md # Traducción de texto completo
│   └── markdown-format.md  # Formateo de Markdown
└── templates/              # Plantillas integradas (se sincronizan al directorio del usuario en el primer inicio)
    ├── default.md          # Plantilla predeterminada
    └── Slide-Template.md   # Plantilla de presentación
```

> Aviso: las skills de IA y las plantillas de documentos se guardan en realidad en el **directorio del usuario**: en Windows / macOS, `~/Documents/yizimarkdown/skills/` y `.../templates/`; en Linux, `yizimarkdown/` dentro del directorio de documentos XDG (p. ej. `~/Documentos/yizimarkdown/`), con `~/.local/share/yizimarkdown/` como respaldo si el sistema no tiene directorio de documentos. (Las carpetas del mismo nombre en el directorio del programa son recursos integrados que se sincronizan allí en el primer inicio.) Guarde su contenido personalizado en el directorio del usuario para que las actualizaciones y reinstalaciones no lo sobrescriban.

---

## Stack tecnológico

| Capa | Tecnología |
|------|------|
| Marco de escritorio | Tauri 2 (Rust) |
| Framework frontend | React 18 + TypeScript |
| Núcleo del editor | CodeMirror 6 |
| Gestión de estado | Zustand (persist) |
| Estilos | Tailwind CSS + variables CSS |
| Renderizado Markdown | markdown-it |
| Internacionalización | i18n ligero propio (16 idiomas) |
| Integración de IA | Proxy de streaming en Rust (protocolos OpenAI / Anthropic / Ollama) |
| Herramienta de compilación | Vite |

---

## Desarrollo

### Requisitos

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Iniciar el servidor de desarrollo

```bash
cd code
npm install
npm run tauri:dev
```

### Icono de la barra de tareas en desarrollo en Linux (opcional)

Escritorios como elementary / GNOME buscan un archivo `.desktop` coincidente por el `WM_CLASS` de la ventana; una compilación de desarrollo no tiene instalador y por tanto no tiene `.desktop`, así que el dock solo muestra un icono genérico (el `_NET_WM_ICON` de la propia ventana ya lo añade el lado de Rust, y los instaladores no se ven afectados). Ejecute una vez:

```bash
npm run dev:icon           # escribe ~/.local/share/applications/yizimarkdown-dev.desktop
npm run dev:icon:remove    # deshacer
```

Después, reinicie la ventana de desarrollo y el dock mostrará el icono de la aplicación.

### Compilar una versión de lanzamiento

**Windows**

```bash
npm run tauri:build
```

Artefactos:
- Exe portátil: `src-tauri/target/release/yizimarkdown.exe`
- Instalador NSIS: `src-tauri/target/release/bundle/nsis/`

Instalador: la primera instalación pregunta primero el idioma de instalación (16 opciones: todos los idiomas de la interfaz más portugués de Brasil); los textos del asistente y el idioma del primer inicio tras la instalación siguen esa elección, y las actualizaciones / autoactualizaciones nunca restablecen el idioma ya elegido por el usuario. Los iconos y las imágenes de la barra lateral / cabecera están en `src-tauri/installer/`; tras cambiar los colores de marca, regenérelos con `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1`.

Tras compilar, copie manualmente el exe y los archivos de recursos en el directorio `public/YiziMarkdown-vX.X.X/` para distribuirlos.

**macOS (binario universal, compatible con Intel y Apple Silicon)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

Artefactos:
- Paquete de aplicación: `src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- Instalador: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux (deb + AppImage)**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

Artefactos (**por ahora solo amd64 / x86_64**; el `deb` `arm64` y el AppImage `aarch64` para ARM aún no se publican):
- Paquete Debian: `src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb` (unos 16 MB, se instala en `/usr/bin`, registra la entrada de menú, el icono y las asociaciones de archivos `.md` / `.epub`)
- Versión portátil sin instalación: `src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage` (unos 150 MB, incluye GTK / WebKit y los componentes multimedia de GStreamer, se ejecuta con doble clic)

Nota: **hay que compilar en Ubuntu 22.04**. Los binarios compilados en 24.04 requieren glibc 2.39 y fallan al arrancar en Ubuntu 22.04 (2.35) / Debian 12 (2.36); la dependencia `libwebkit2gtk-4.1-0` del `deb` fija el mismo mínimo en Ubuntu 22.04 / Debian 12 (Debian 11 solo tiene webkit 4.0). No se ofrece `rpm` por ahora: los nombres de dependencias de Fedora / openSUSE son distintos de los de Debian y requerirían mantenimiento aparte.

### Estructura del proyecto

```
code/
├── src/                    # Código fuente del frontend
│   ├── App.tsx             # Componente principal de la aplicación
│   ├── components/         # Componentes de UI
│   │   ├── Editor.tsx      # Editor CodeMirror + vista previa
│   │   ├── Reader.tsx      # Modo Lectura (paginación / paso de página)
│   │   ├── Slideshow.tsx   # Modo Presentación
│   │   ├── TabBar.tsx      # Barra de pestañas
│   │   ├── HomePage.tsx    # Página de inicio (archivos recientes)
│   │   ├── Toolbar.tsx     # Barra de herramientas
│   │   ├── Sidebar.tsx     # Barra lateral (esquema + explorador de archivos)
│   │   ├── StatusBar.tsx   # Barra de estado inferior
│   │   └── SettingsModal.tsx # Panel de configuración
│   ├── stores/             # Gestión de estado Zustand
│   ├── lib/                # Utilidades (renderizado Markdown, temas, modo zen, etc.)
│   └── styles/             # Estilos globales
├── src-tauri/              # Backend en Rust
│   ├── src/main.rs         # Comandos de Tauri (lectura/escritura de archivos, carga de temas, registro, etc.)
│   ├── icons/              # Iconos de la aplicación
│   ├── themes/             # CSS de temas (con metadatos theme.json)
│   └── templates/          # Plantillas de documentos
├── docs/                   # Documentación (changelog / readmes i18n / THEME-DESIGN-SPEC.md)
└── package.json
```

---

## Versión y actualizaciones

Las instalaciones de Windows admiten actualización con un clic desde la aplicación; macOS, Linux y la versión portátil comprueban `latest.json` al iniciarse y, si hay una versión nueva, muestran un aviso en la esquina inferior derecha que abre la página de descarga correspondiente (sustitución manual, sin instalación automática; tanto el `deb` como el `AppImage` de Linux siguen esta vía).

---

## Licencia

MIT
