# Informe de averías ATIA — sitio autoactualizable

Esta carpeta es un sitio web estático que se actualiza **solo, cada hora,
sin depender de Claude ni de ninguna suscripción**. Un robot de GitHub
(GitHub Actions) consulta tu base de Airtable una vez por hora, guarda los
datos en `data.json`, y GitHub Pages sirve `index.html` con esos datos.

Coste: **0 €**, para siempre, mientras el repositorio sea razonable de
tamaño (esto lo es de sobra).

## Puesta en marcha (una sola vez, unos 10 minutos)

### 1. Crea un token de Airtable de solo lectura

1. Ve a https://airtable.com/create/tokens
2. "Create new token"
3. Nombre: por ejemplo `informe-atia-lectura`
4. En **Scopes**, añade solo: `data.records:read`
5. En **Access**, añade la base "Gestión de Órdenes de Reparación ATIA"
6. Crea el token y **cópialo** (empieza por `pat...`). No lo compartas ni lo
   subas nunca al repositorio.

### 2. Repositorio y archivos

Ya están listos — este mismo repositorio privado, con todos los archivos
subidos.

### 3. Guarda el token como secreto del repositorio

1. En tu repositorio: **Settings → Secrets and variables → Actions**
2. "New repository secret"
3. Nombre: `AIRTABLE_TOKEN`
4. Valor: el token que copiaste en el paso 1
5. Guardar

### 4. Activa GitHub Pages

1. **Settings → Pages**
2. En "Source" elige **Deploy from a branch**
3. Branch: `main`, carpeta: `/ (root)`
4. Guardar. GitHub te dará una URL parecida a
   `https://nctrl12.github.io/informe-atia/` — esa es la que compartes
   con tus jefes.

### 5. Pruébalo a mano una vez

1. En tu repositorio: pestaña **Actions**
2. Elige el workflow "Actualizar informe ATIA"
3. "Run workflow" → "Run workflow" (botón verde)
4. Espera medio minuto y comprueba que aparece un commit nuevo
   "Actualizar datos de averías ATIA" y que `data.json` ya tiene registros.
5. Abre la URL de GitHub Pages del paso 4 y confirma que se ve el informe
   con datos reales.

A partir de aquí, se actualiza solo cada hora sin que tengas que tocar nada.

## Notas

- Los enlaces a fotos y vídeos que da Airtable caducan pasadas unas horas.
  Como esto se regenera cada hora, casi siempre estarán frescos, pero un
  adjunto muy antiguo dentro de esa hora podría no abrirse — es una
  limitación de Airtable, no de este sitio.
- Si algún día cambias el nombre de un campo en Airtable, no pasa nada: el
  script identifica los campos por su ID interno, no por el nombre.
- Si quieres cambiar la frecuencia (por ejemplo cada 4 horas en vez de cada
  hora), edita la línea `cron` en
  `.github/workflows/update.yml` — por ejemplo `0 */4 * * *`.
