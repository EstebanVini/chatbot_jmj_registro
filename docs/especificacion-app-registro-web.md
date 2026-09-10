# Portal de Registro JMJ Corea 2027

Especificación de implementación para un agente de IA (Claude Code u otro).

---

## 1. Qué se está construyendo y por qué

Existe hoy un bot de registro de peregrinos que funciona sobre WhatsApp. La cuenta de WhatsApp fue bloqueada, así que el canal desaparece. La lógica del registro **no vive en WhatsApp**: vive en un workflow de n8n que lee pasaportes por OCR, valida vigencias y da de alta peregrinos en Odoo. Ese workflow se conserva tal cual.

Lo que hay que construir es un **canal de conversación por web** que ocupe exactamente el lugar que ocupaba Evolution API: recibe lo que la persona escribe o sube, se lo entrega a n8n, y muestra en pantalla lo que n8n contesta.

La decisión de diseño que gobierna todo el proyecto:

> **La aplicación se hace pasar por Evolution API.** Expone los mismos endpoints HTTP que n8n ya llama y emite un webhook con la misma forma de payload. El workflow no se rediseña; solo recibe cuatro ajustes menores documentados en la sección 13.

No es un chat de soporte, no hay agentes humanos, no hay historial entre dispositivos, no hay contraseñas. Es un formulario conversacional de una sola sesión.

**Audiencia:** jóvenes de 16 a 30 años y padres de familia en México, mayoritariamente desde el teléfono, muchas veces con conexión mediocre. **Trabajo primario de la interfaz:** que alguien complete su registro sin dudar en ningún paso.

---

## 2. Arquitectura

```
┌───────────────┐   HTTPS    ┌──────────────────────────┐   webhook   ┌──────────┐
│   Navegador   │◄──────────►│   Portal (Node/Express)  │────────────►│   n8n    │
│  React + SSE  │            │   "shim de Evolution"    │             │ workflow │
└───────────────┘            └──────────────────────────┘◄────────────└──────────┘
                                        │                  sendText        │
                                        │                  sendMedia       │
                                   ┌────▼─────┐            getBase64       ▼
                                   │ SQLite + │                      OCR · Odoo ·
                                   │  /media  │                      Google Sheets
                                   └──────────┘
```

Ciclo completo de un mensaje:

1. La persona escribe en el navegador → `POST /api/messages`.
2. El servidor guarda el mensaje, lo marca como propio (`outbound: false` desde la óptica del bot) y dispara el webhook a n8n.
3. n8n responde `200` de inmediato ("Workflow got started") y sigue procesando en segundo plano.
4. Cuando el workflow tiene algo que decir, llama a `POST /message/sendText/:instance` en el Portal.
5. El Portal guarda ese mensaje y lo empuja por SSE al navegador de **esa** sesión.
6. El navegador lo pinta.

El servidor no espera respuestas. Todo lo que llega del bot llega por push.

---

## 3. Identidad de sesión: la pieza crítica

En WhatsApp el identificador era `remoteJid` (`5215500000000@s.whatsapp.net`) y el workflow deriva de ahí un campo llamado `numero` que usa como dirección de retorno y como llave de la máquina de estados en la Data Table de n8n.

En el Portal:

| Concepto | Valor |
|---|---|
| `sessionId` | UUID v4 generado al registrarse. Es la identidad de **un registro**, no de una persona. |
| `remoteJid` | `` `${sessionId}@web.jmj` `` |
| `numero` (derivado por n8n) | el `sessionId` pelado |
| correo | viaja aparte, en `data.email` |

Consecuencias que hay que respetar:

- El `sessionId` **no puede contener** `@` ni `:`; n8n parte la cadena por esos caracteres. Un UUID v4 es seguro.
- Un mismo correo puede tener N sesiones simultáneas o consecutivas. El correo nunca es llave de nada.
- Dos personas en el mismo navegador (misma cookie) comparten sesión; eso es correcto y esperado. Dos pestañas de la misma sesión deben ver el mismo hilo en vivo.
- El `sessionId` es un secreto de capacidad: quien lo tenga puede leer y escribir en ese registro. Va en cookie `httpOnly`, nunca en la URL.

---

## 4. Stack

| Capa | Elección | Nota |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Sin framework de UI. Sin router: la app tiene dos vistas y se alternan por estado. |
| Estilos | CSS plano con custom properties, un solo archivo de tokens | Nada de Tailwind ni CSS-in-JS para un proyecto de este tamaño. |
| Backend | Node 20 + Express 4 + TypeScript | |
| Persistencia | SQLite vía `better-sqlite3` | Síncrono, sin pool, perfecto para esta carga. |
| Archivos | Disco, `/media/:id` | La BD guarda solo metadatos. |
| Push | Server-Sent Events nativos | No hace falta WebSocket: el tráfico es unidireccional del servidor al cliente. |
| Cookies | `cookie-parser` con cookie firmada | |
| Validación | `zod` en todos los endpoints | |

Sin ORM, sin Redis, sin cola de trabajos, sin Docker Compose de cinco servicios. Un contenedor.

### Estructura

```
portal-jmj/
├── server/
│   ├── src/
│   │   ├── index.ts              arranque y montaje de routers
│   │   ├── db.ts                 esquema + migración idempotente
│   │   ├── config.ts             lee y valida variables de entorno
│   │   ├── sessions.ts           crear, resolver y cerrar sesiones
│   │   ├── bus.ts                registro de clientes SSE por sessionId
│   │   ├── media.ts              guardar, leer y purgar archivos
│   │   ├── outbound.ts           construir y enviar el webhook a n8n
│   │   └── routes/
│   │       ├── app.ts            /api/*   → lo consume el navegador
│   │       └── evolution.ts      /message/*, /chat/*  → lo consume n8n
│   └── package.json
├── web/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx               decide entre Gate y Chat
│   │   ├── api.ts                fetch tipado + suscripción SSE
│   │   ├── components/
│   │   │   ├── EmailGate.tsx
│   │   │   ├── Chat.tsx
│   │   │   ├── Bubble.tsx
│   │   │   ├── Composer.tsx
│   │   │   ├── QuickReplies.tsx
│   │   │   └── Attachment.tsx
│   │   └── styles/tokens.css
│   └── package.json
├── Dockerfile
└── README.md
```

En producción Express sirve el build estático de Vite. Un solo puerto, un solo origen, cero CORS.

---

## 5. Modelo de datos

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,           -- UUID v4
  email         TEXT NOT NULL,
  created_at    TEXT NOT NULL,              -- ISO 8601
  last_seen_at  TEXT NOT NULL,
  closed_at     TEXT,                       -- se llena al completar el registro
  status        TEXT NOT NULL DEFAULT 'activa'   -- activa | completada | cerrada
);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,             -- UUID v4; es el messageId que ve n8n
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  seq         INTEGER NOT NULL,             -- consecutivo por sesión, empieza en 1
  author      TEXT NOT NULL,                -- 'persona' | 'bot'
  kind        TEXT NOT NULL,                -- 'texto' | 'archivo'
  text        TEXT,                         -- cuerpo, o pie de foto si kind='archivo'
  media_id    TEXT REFERENCES media(id),
  media_url   TEXT,                         -- para sendMedia con URL externa
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_seq ON messages(session_id, seq);

CREATE TABLE IF NOT EXISTS media (
  id          TEXT PRIMARY KEY,             -- UUID v4
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  filename    TEXT NOT NULL,
  mimetype    TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  path        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
```

`seq` se asigna dentro de una transacción (`SELECT MAX(seq)+1` y el `INSERT` en el mismo bloque) para que dos escrituras concurrentes no colisionen.

---

## 6. Contrato de API — lo que consume el navegador

Todas las rutas viven bajo `/api`. Todas responden JSON. Los errores usan la forma `{ "error": "codigo_legible", "message": "Texto para mostrar" }`.

### `POST /api/session`

Registra a la persona. No hay confirmación de correo, no hay contraseña.

```jsonc
// petición
{ "email": "maria@example.com" }

// respuesta 201
{
  "sessionId": "b3f1…",
  "email": "maria@example.com",
  "status": "activa"
}
```

Valida el correo con una expresión razonable (algo antes de la arroba, un dominio con punto). Normaliza a minúsculas y recorta espacios. Crea la sesión, fija la cookie y **dispara la frase de activación** (sección 9).

Fija `Set-Cookie: jmj_sid=<firmado>; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000; Path=/`.

### `GET /api/session`

Resuelve la cookie. Responde `200` con la sesión y su historial completo, o `204` sin cuerpo si no hay cookie válida.

```jsonc
{
  "session": { "sessionId": "b3f1…", "email": "maria@example.com", "status": "activa" },
  "messages": [ { "id": "…", "seq": 1, "author": "bot", "kind": "texto", "text": "…", "createdAt": "…" } ]
}
```

### `DELETE /api/session`

Cierra sesión: marca `status = 'cerrada'`, borra la cookie, responde `204`. No borra el historial: si la persona vuelve con otro correo obtiene una sesión nueva y limpia.

### `POST /api/session/nueva`

Inicia otro registro conservando el correo de la sesión actual. Es el botón "Registrar a otra persona". Crea una sesión nueva con el mismo correo, reemplaza la cookie y dispara la frase de activación. Responde igual que `POST /api/session`.

### `POST /api/messages`

Envía un mensaje de la persona. `multipart/form-data` cuando hay archivo, JSON cuando no.

```jsonc
// JSON
{ "text": "Pasaporte" }

// multipart
// campo "file": el archivo    campo "text": pie opcional
```

Guarda el mensaje, responde `202` con el mensaje ya persistido, y dispara el webhook. El navegador pinta la burbuja al recibir el `202`; no espera al bot.

Rechaza con `409` si la sesión está `completada` o `cerrada`.

### `GET /api/stream`

SSE. Emite eventos `mensaje` con el mensaje serializado, y un `ping` cada 25 segundos para que los proxies no corten la conexión.

```
event: mensaje
data: {"id":"…","seq":4,"author":"bot","kind":"texto","text":"…","createdAt":"…"}
```

Acepta `?desde=<seq>` para reenviar lo que el cliente se perdió durante una desconexión. El servidor mantiene un `Map<sessionId, Set<Response>>`; al cerrarse la conexión hay que quitar la referencia o se fuga memoria.

### `GET /media/:id`

Sirve un archivo. Verifica que el `media.session_id` coincida con la sesión de la cookie antes de responder. Sin cookie válida, `404` — no `403`, para no confirmar la existencia del recurso.

---

## 7. Contrato de API — lo que consume n8n

Estas tres rutas replican Evolution API. **La forma de petición y respuesta no se puede cambiar**: el workflow ya está escrito contra ella.

Todas exigen el header `apikey` con el valor de `PORTAL_API_KEY`. Si falta o no coincide, `401`. Compara con `crypto.timingSafeEqual`.

El segmento `:instance` de la ruta se ignora funcionalmente; existe solo por compatibilidad.

### `POST /message/sendText/:instance`

```jsonc
// lo que manda n8n
{ "number": "b3f1…", "text": "Favor de mandar foto de su pasaporte…", "delay": 900 }
```

`number` es el `sessionId`. Guarda el mensaje como `author: 'bot'`, `kind: 'texto'` y lo empuja por SSE. Responde `200` con `{ "ok": true, "messageId": "…" }`.

Si la sesión no existe, responde `404` — pero **nunca** lances un error 5xx: el workflow tiene `retryOnFail` y reintentaría.

`delay` es el tiempo que Evolution simulaba "escribiendo". El Portal lo usa igual: emite primero un evento `escribiendo` por SSE y entrega el mensaje `delay` milisegundos después. Tope de 2000 ms para no hacer esperar de más.

### `POST /message/sendMedia/:instance`

```jsonc
{
  "number": "b3f1…",
  "mediatype": "image",
  "mimetype": "image/jpeg",
  "media": "https://raw.githubusercontent.com/…/Ej_Foto_pasaporte.jpg",
  "fileName": "Ej_Foto_pasaporte.jpg",
  "caption": "Favor de mandar foto de su pasaporte COMPLETA…"
}
```

`media` llega como URL absoluta (así lo usa el workflow para mandar la foto de ejemplo). Guarda `media_url` y el `caption` como `text`, sin descargar nada. El navegador renderiza la imagen desde esa URL.

Contempla también que `media` pueda venir en base64 en el futuro: si no empieza con `http`, guárdalo como archivo local y usa `media_id`.

### `POST /chat/getBase64FromMediaMessage/:instance`

```jsonc
// petición
{ "message": { "key": { "id": "<messageId>" } }, "convertToMp4": false }

// respuesta
{ "base64": "/9j/4AAQSkZJRg…", "mimetype": "image/jpeg" }
```

Busca el mensaje por `id`, resuelve su `media`, lee el archivo y lo devuelve en base64 **sin prefijo `data:`**. El workflow lee `$json.base64` y `$json.mimetype` en la raíz.

Este endpoint se llama **dos veces y en momentos distintos**: una al recibir la foto (para el OCR) y otra minutos después al confirmar con OK (para adjuntar el documento en Odoo). Los archivos por lo tanto tienen que sobrevivir al menos toda la sesión. Ver sección 10.

Si el archivo ya no existe, responde `200` con `{ "base64": "", "mimetype": "" }`. El workflow tiene un IF que detecta el base64 vacío y completa el registro sin adjunto; un error HTTP en cambio dispararía reintentos inútiles.

---

## 8. Payload del webhook hacia n8n

`POST` a `N8N_WEBHOOK_URL`, `Content-Type: application/json`. La forma imita `messages.upsert` de Evolution porque el nodo `Normalize Evolution Event` la parsea directamente.

```jsonc
{
  "instance": "jmj-web",
  "event": "messages.upsert",
  "server_url": "https://registro.eviniegra.software",
  "apikey": "<PORTAL_API_KEY>",
  "sender": "<TRIP_BOT_ID>",
  "data": {
    "key": {
      "remoteJid": "b3f1…@web.jmj",
      "fromMe": false,
      "id": "<messageId>"
    },
    "message": {
      "conversation": "Pasaporte"
    },
    "messageType": "conversation",
    "pushName": "maria@example.com",
    "email": "maria@example.com"
  }
}
```

Reglas de armado:

- **`server_url` y `apikey` son la dirección de retorno.** El workflow toma de aquí a dónde contestar y con qué llave. Por eso el Portal se anuncia a sí mismo. Si esto queda mal, el bot procesa pero nadie ve la respuesta.
- **`sender` debe ser idéntico** al `whatsapp_bot_id` configurado en el viaje dentro de Odoo. De ahí sale la resolución del `trip_id` (`jmj.trip.find_trip_by_whatsapp_bot`). Es una variable de entorno, no un valor inventado.
- Para un archivo, `message` cambia a `{ "imageMessage": { "caption": "<pie o cadena vacía>" } }` y `messageType` a `"imageMessage"`. El workflow solo distingue "es archivo" vs "es texto"; los PDF viajan por esta misma rama y funcionan porque el mimetype real va en la respuesta de `getBase64FromMediaMessage`.
- `fromMe` siempre `false`. Con `true` el workflow descarta el mensaje.
- El webhook se dispara sin bloquear la respuesta al navegador. Si falla, reintenta dos veces con espera de 1s y 3s; si sigue fallando, inserta un mensaje de bot en la sesión avisando que hubo un problema y que lo intente de nuevo.

---

## 9. El flujo conversacional

El workflow arranca mudo hasta recibir una frase de activación. En WhatsApp eso tenía sentido —era un número personal—; en un portal dedicado sobra. La solución que **no toca el workflow**: al crear la sesión, el servidor dispara automáticamente un webhook con el texto

```
Quiero registrarme para la JMJ Corea 2027
```

Ese mensaje **no se guarda en `messages`** y por lo tanto nunca se ve en pantalla. La persona abre la app y lo primero que aparece es el menú de bienvenida del bot, como si el sistema hubiera tomado la iniciativa.

A partir de ahí, la conversación es exactamente la que ya existe:

**Ruta con pasaporte**
```
bot: "Para realizar su registro responda con una de estas opciones: Pasaporte / Sin pasaporte"
persona: "Pasaporte"
bot: [imagen de ejemplo] + "Favor de mandar foto de su pasaporte COMPLETA…"
persona: [sube foto]
bot: "Estos son los datos que leímos… responda OK para completar su registro"
persona: "OK"
bot: "Felicidades! Ha creado correctamente su registro." + enlace del formulario
```

**Ruta sin pasaporte**
```
persona: "Sin pasaporte"
bot: pide nombre completo → fecha de nacimiento → CURP → sexo
bot: "Registro exitoso…" + enlace del formulario
```

### Respuestas rápidas

El texto libre siempre está disponible, pero cuando el último mensaje del bot ofrece opciones cerradas, se muestran botones que envían **exactamente** la cadena que el workflow espera. La detección es por contenido del último mensaje del bot:

| Si el mensaje del bot contiene | Botones |
|---|---|
| `*Pasaporte*` y `*Sin pasaporte*` | `Pasaporte` · `Sin pasaporte` |
| `responda con la palabra *OK*` | `OK` · `Enviar otra foto` |
| `responda *M* para masculino` | `M` · `F` |
| `escriba su *CURP*` | `N/A` |

`Enviar otra foto` abre el selector de archivos en vez de mandar texto.

Esta detección es frágil por naturaleza. Aíslala en un solo módulo `quickReplies.ts` con las reglas en un arreglo, para que cambiar un copy del workflow sea editar una línea.

### Fin del registro

Cuando llega un mensaje de bot que contiene un enlace `http` **y** alguna de las frases de cierre (`Ha creado correctamente su registro`, `Registro exitoso`, `No es posible realizar el registro`), el servidor marca la sesión como `completada`. El compositor se deshabilita y aparecen dos acciones: **Abrir mi formulario** (enlace) y **Registrar a otra persona**.

### Un mensaje a la vez

Mientras haya un mensaje de la persona sin respuesta del bot, el compositor se bloquea y se muestra el indicador de escritura. Dos mensajes seguidos harían que el workflow lea un estado desactualizado de la Data Table y responda incoherencias. Si pasan 45 segundos sin respuesta, se desbloquea y aparece un aviso discreto: *"El registro está tardando más de lo normal. Puede volver a escribir."*

---

## 10. Archivos

- Tipos aceptados: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Cualquier otro se rechaza en cliente y en servidor.
- Tamaño máximo: 12 MB. Valídalo en `multer` y también antes de subir, para poder dar un mensaje claro.
- **Redimensionado en el cliente antes de subir.** Un `canvas` que reduzca el lado mayor a 2000 px y exporte JPEG al 85% deja archivos de 300–600 KB sin perder legibilidad del MRZ, y ahorra el 80% del tiempo de subida en datos móviles. No aplicar a PDF.
- Almacenamiento en `MEDIA_DIR/<sessionId>/<mediaId>`. Nombre en disco por UUID, nunca el nombre original.
- **Retención de 30 días**, no menos. El adjunto se manda a Odoo minutos después de la foto, pero un registro puede quedar a medias y retomarse. Una tarea con `setInterval` cada 6 horas borra archivos y filas de `media` más viejas que `MEDIA_TTL_DAYS`.
- Verifica el mimetype real por los primeros bytes (magic number), no por lo que declara el navegador.

---

## 11. Frontend

### Vista 1 — Puerta de entrada

Una sola pantalla, centrada, sin scroll en un teléfono típico:

```
┌────────────────────────────────┐
│                                │
│   Registro de peregrinos       │
│   JMJ Corea 2027               │
│                                │
│   Escriba su correo para       │
│   comenzar.                    │
│                                │
│   ┌──────────────────────────┐ │
│   │ correo@ejemplo.com       │ │
│   └──────────────────────────┘ │
│   ┌──────────────────────────┐ │
│   │        Comenzar          │ │
│   └──────────────────────────┘ │
│                                │
│   ─────────────────────────    │
│   Toda la comunicación sobre   │
│   su registro y la peregri-    │
│   nación llegará a este        │
│   correo. Revise que esté      │
│   bien escrito.                │
│                                │
│   Puede registrar a varias     │
│   personas con el mismo        │
│   correo.                      │
└────────────────────────────────┘
```

El aviso del correo va **debajo del botón**, separado por una regla, no como un asterisco tímido. Es la única información que la persona no puede corregir después sin ayuda.

`type="email"`, `inputMode="email"`, `autoComplete="email"`, `autoFocus` en escritorio y no en móvil (evita que el teclado tape el aviso). Enter envía.

### Vista 2 — Conversación

```
┌────────────────────────────────┐
│ JMJ Corea 2027   maria@ex.com ⏻│  ← barra fija
├────────────────────────────────┤
│                                │
│  ┌────────────────────────┐    │
│  │ Para realizar su       │    │  ← bot, celadón, izquierda
│  │ registro responda…     │    │
│  └────────────────────────┘    │
│                                │
│         ┌──────────────────┐   │
│         │ Pasaporte        │   │  ← persona, tinta, derecha
│         └──────────────────┘   │
│                                │
│  ┌────────────────────────┐    │
│  │ [imagen de ejemplo]    │    │
│  │ Favor de mandar foto…  │    │
│  └────────────────────────┘    │
│                                │
│  • • •                         │  ← escribiendo
├────────────────────────────────┤
│ [Pasaporte] [Sin pasaporte]    │  ← respuestas rápidas
├────────────────────────────────┤
│ 📎  Escriba su respuesta…   ➤ │
└────────────────────────────────┘
```

Comportamiento:

- Autoscroll al último mensaje, salvo que la persona haya subido a leer; en ese caso, aparece un botón flotante "Ver mensajes nuevos".
- Las imágenes se abren a pantalla completa al tocarlas. Los PDF se muestran como tarjeta con nombre y tamaño, y abren en pestaña nueva.
- El ícono ⏻ de la barra abre un menú con **Salir** y **Registrar a otra persona**. Salir pide confirmación e indica que el registro en curso se conserva y puede retomarse volviendo a entrar con el mismo correo... y aquí hay que ser honestos en el copy: **no se puede**, porque la sesión se identifica por cookie. El texto correcto es: *"Si sale, este registro quedará incompleto y tendrá que empezar de nuevo."*
- La reconexión de SSE es automática con retroceso exponencial (1s, 2s, 4s, tope 10s) y usa `?desde=<último seq>` para no perder mensajes.
- El compositor crece hasta 4 líneas; Enter envía, Shift+Enter salta línea. En móvil, el botón envía y Enter salta línea.

### Estados vacíos y errores

Nada de "Ups, algo salió mal". Cada error dice qué pasó y qué hacer:

- Archivo muy grande → *"La imagen pesa más de 12 MB. Tome la foto de nuevo con menos resolución o recórtela."*
- Tipo no soportado → *"Solo se aceptan fotos JPG o PNG y documentos PDF."*
- Sin conexión → una franja fija arriba: *"Sin conexión. Reintentando."* Se quita sola.

---

## 12. Dirección visual

El sujeto es una peregrinación juvenil católica a Corea. La paleta se apoya en el **celadón coreano** —el verde grisáceo de la cerámica Goryeo— con tinta oscura y un bermellón que solo aparece cuando algo va mal. Deliberadamente lejos del crema con acento terracota y del azul marino con dorado.

```css
:root {
  --tinta:      #16211E;  /* texto principal, burbuja de la persona */
  --papel:      #F1F3F2;  /* fondo de la app */
  --celadon:    #D7E4DE;  /* burbuja del bot */
  --jade:       #1F5E52;  /* botones primarios, enlaces, foco */
  --jade-suave: #E8F0ED;  /* fondos de estado y respuestas rápidas */
  --bermellon:  #C8452F;  /* solo errores y el aviso de vigencia */
  --niebla:     #7C8A85;  /* metadatos, marcas de tiempo, placeholder */
}
```

**Tipografía.** Una sola familia para toda la interfaz: **Public Sans** (400 / 500 / 700), que tiene altura de x generosa y aguanta bien el texto denso en pantallas chicas. La única excepción es el título de la puerta de entrada, en **Bricolage Grotesque** 700 con `letter-spacing: -0.02em`, a 40 px en móvil y 56 px en escritorio. Ahí se gasta toda la audacia del proyecto; el resto es disciplina.

Escala: 13 / 15 / 17 / 22 / 40. Cuerpo del chat a 17 px, que es lo mínimo cómodo para leer datos de pasaporte en un teléfono. Interlineado 1.5 en el cuerpo, 1.1 en el título.

**Forma.** Burbujas con radio 18 px y la esquina del lado de su autor a 4 px, que es lo que las ancla visualmente al remitente. Botones a 10 px. Nada de sombras difusas repartidas: una sola sombra sutil bajo la barra del compositor para separarla del hilo al hacer scroll.

**Ancho.** El hilo se limita a 620 px y se centra. Las burbujas no pasan del 78% de ese ancho.

**Movimiento.** Solo dos momentos: las burbujas entrantes aparecen con una traslación de 6 px y opacidad en 140 ms, y el indicador de escritura tiene sus tres puntos en bucle. Nada más. Respetar `prefers-reduced-motion`.

**Piso de calidad, sin anunciarlo:** contraste AA en todo texto, foco visible con anillo de 2 px en `--jade`, área táctil mínima de 44 px, funciona de 320 px hacia arriba, y el hilo se navega con teclado.

---

## 13. Cambios necesarios en el workflow de n8n

Son cuatro, todos pequeños. El workflow es `vF7ZiCDmy8Kp31qZ` en `n8n-tests.eviniegra.software`.

**1. Nodo `Normalize Evolution Event`** — agregar el correo al objeto que se devuelve. Dentro del `return`, añadir una propiedad:

```js
email: data.email || '',
```

Se propaga solo hasta `Classify Route` porque ese nodo hace `Object.assign({}, msg, {…})`.

**2. Nodos `Build Registration Record` y `Build No Passport Step`** — agregar `email: ctx.email || ''` al JSON que devuelven.

**3. Nodos `Create an item` y `Create No Passport Item`** — el campo `phone` ahora recibiría un UUID, que no sirve de nada. Cambiar el nombre del campo de `phone` a `email` y su valor a `{{ $('Build Registration Record').item.json.email }}` (y su equivalente `Build No Passport Step` en el segundo nodo). El modelo `jmj.passenger` ya tiene campo `email`.

**4. Nodo `Create Passport Document`** — el nombre de archivo está fijo en `pasaporte.jpg`. Ahora pueden llegar PDF. Cambiar `file_name` a:

```
{{ $("Fetch Passport Image For Odoo").item.json.mimetype === "application/pdf" ? "pasaporte.pdf" : "pasaporte.jpg" }}
```

Opcionalmente lo mismo en `Convert Base64 To Image` para el `fileName` que se manda al OCR.

**No cambia nada más.** La máquina de estados, la Data Table, la regla de vigencia del 1 de marzo de 2028, el OCR, Google Sheets y el enlace del formulario web siguen igual.

---

## 14. Configuración

```bash
PORT=3000
PUBLIC_URL=https://registro.eviniegra.software   # se manda como server_url
N8N_WEBHOOK_URL=https://n8n-tests.eviniegra.software/webhook/b2ae7bd7-28f1-4855-bab7-03960e0fa4fd
PORTAL_API_KEY=                                  # 32 bytes aleatorios; n8n lo devuelve en cada llamada
COOKIE_SECRET=                                   # 32 bytes aleatorios
INSTANCE_NAME=jmj-web
TRIP_BOT_ID=                                     # DEBE coincidir con whatsapp_bot_id del viaje en Odoo
ACTIVATION_PHRASE=Quiero registrarme para la JMJ Corea 2027
DB_PATH=/data/portal.db
MEDIA_DIR=/data/media
MEDIA_TTL_DAYS=30
MAX_UPLOAD_MB=12
```

El servidor valida al arrancar que todas existan y que `PORTAL_API_KEY` y `COOKIE_SECRET` midan al menos 32 caracteres. Si falta algo, muere con un mensaje claro en vez de arrancar a medias.

---

## 15. Seguridad

- `helmet` con CSP restrictiva. `img-src` tiene que permitir `raw.githubusercontent.com` porque de ahí sale la foto de ejemplo del pasaporte.
- Límite de tasa: 5 creaciones de sesión por IP cada 10 minutos; 30 mensajes por sesión cada minuto.
- Los endpoints de Evolution comparan la `apikey` en tiempo constante.
- Nunca registrar en logs el contenido de los mensajes ni el base64. Los datos de pasaporte son personales; el log debe traer `sessionId`, `seq` y tamaño, nada más.
- Cookie `httpOnly`, `SameSite=Lax`, `Secure` en producción.
- El `sessionId` no aparece jamás en la URL ni en el HTML renderizado.

---

## 16. Orden de construcción

Cada fase termina en algo verificable. No pasar a la siguiente sin probar la anterior.

**Fase 1 — Esqueleto.** Express + SQLite + variables de entorno + healthcheck. Verificación: `GET /health` responde y la BD se crea sola.

**Fase 2 — Sesiones.** `POST/GET/DELETE /api/session` con cookies. Verificación: con `curl -c/-b` se crea una sesión, se recupera y se cierra.

**Fase 3 — Mensajes y SSE.** `POST /api/messages`, `GET /api/stream`, el bus en memoria. Verificación: dos terminales, una escuchando el stream y otra insertando mensajes; llegan en orden y solo a la sesión correcta.

**Fase 4 — El shim de Evolution.** Las tres rutas de la sección 7, con autenticación. Verificación: `curl` simulando lo que manda n8n produce un evento SSE.

**Fase 5 — El webhook de salida.** Armado del payload y disparo. Verificación: crear una sesión real y comprobar en el historial de ejecuciones de n8n que el workflow entra y contesta el menú de bienvenida.

**Fase 6 — Archivos.** Subida, `getBase64`, retención. Verificación: subir un pasaporte de prueba y comprobar que el OCR lo lee y que el documento aparece en Odoo tras confirmar con OK.

**Fase 7 — Frontend.** Puerta de entrada, conversación, respuestas rápidas, adjuntos.

**Fase 8 — Diseño y pulido.** Tokens, tipografía, estados de error, accesibilidad, prueba en un teléfono real con red lenta.

---

## 17. Criterios de aceptación

- [ ] Al abrir la app por primera vez se pide un correo y nada más. Sin contraseña, sin confirmación.
- [ ] Tras escribir el correo, el primer mensaje del bot aparece en menos de 5 segundos, sin que la persona haya escrito nada.
- [ ] Un registro completo con pasaporte crea el peregrino en Odoo, con la foto adjunta como `jmj.passenger.document` de tipo `passport`, y termina con el enlace del formulario web en pantalla.
- [ ] Un registro completo sin pasaporte crea el peregrino y también entrega el enlace.
- [ ] Tres navegadores distintos registrando al mismo tiempo no cruzan mensajes. Verificar en la Data Table de n8n que hay tres `remote_jid` distintos.
- [ ] Dos registros seguidos con el mismo correo generan dos peregrinos distintos en Odoo, ambos con ese correo.
- [ ] Cerrar el navegador a mitad del registro y volver a abrirlo retoma la conversación completa en el punto exacto.
- [ ] Cerrar sesión y entrar con otro correo empieza una conversación limpia, sin rastro de la anterior.
- [ ] Cortar la red 20 segundos y restablecerla no pierde ningún mensaje del bot.
- [ ] Subir un PDF en lugar de una foto funciona de extremo a extremo y llega a Odoo con extensión `.pdf`.
- [ ] Un pasaporte que vence antes del 1 de marzo de 2028 muestra el mensaje de rechazo por vigencia.
- [ ] La app es usable con teclado y lector de pantalla, y legible a 320 px de ancho.
- [ ] Ningún log contiene datos de pasaporte.

---

## 18. Fuera de alcance

No implementar, aunque parezca natural: cuentas con contraseña, recuperación de acceso, panel de administración, historial entre dispositivos, notificaciones push, envío real de correos desde el Portal, edición o borrado de mensajes, traducción, analítica, ni ningún tipo de chat entre personas. El Portal es un canal de transporte para un formulario conversacional que ya existe. Todo lo demás vive en Odoo.
