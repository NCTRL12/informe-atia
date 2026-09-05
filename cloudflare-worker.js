// Worker de Cloudflare para el botón "Eliminar" del Informe de Averías ATIA.
//
// Qué hace: recibe un POST con {password, recordId}, comprueba la contraseña
// contra un secreto guardado en el propio Worker (nunca visible en la web
// pública) y, si es correcta, borra ese registro en Airtable usando un
// token de Airtable que también vive solo aquí, en el Worker — nunca en el
// código de la web.
//
// Variables de entorno que hay que configurar en Cloudflare (Settings ->
// Variables and Secrets del Worker), como "Secret" (no como texto plano):
//   DELETE_PASSWORD   -> la contraseña que pide el botón "Eliminar"
//   AIRTABLE_TOKEN     -> un Personal Access Token de Airtable con permiso
//                         de ESCRITURA (data.records:write) sobre esta base
//                         (el token que ya usa GitHub Actions es de solo
//                         lectura y no sirve para borrar; hace falta uno
//                         nuevo, o ampliar el existente, con ese permiso)
//
// Sustituye ALLOWED_ORIGIN si algún día cambias de dominio para la web.

const ALLOWED_ORIGIN = "https://nctrl12.github.io";
const BASE_ID = "appBQRwCmRwyzg180";
const TABLE_ID = "tblj3eagIgj8WOc5d";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return json(405, { error: "Método no permitido" });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json(400, { error: "JSON inválido" });
    }

    const { password, recordId } = body || {};

    if (!env.DELETE_PASSWORD || !env.AIRTABLE_TOKEN) {
      return json(500, { error: "El Worker no tiene configurados DELETE_PASSWORD / AIRTABLE_TOKEN" });
    }

    if (!password || password !== env.DELETE_PASSWORD) {
      return json(401, { error: "Contraseña incorrecta" });
    }

    if (!recordId || !/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
      return json(400, { error: "recordId inválido" });
    }

    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
    );

    if (!airtableRes.ok) {
      const detail = await airtableRes.text();
      return json(airtableRes.status, { error: "Airtable no pudo borrar el registro", detail });
    }

    return json(200, { ok: true });
  },
};
