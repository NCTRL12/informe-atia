// Worker de Cloudflare del Informe de Averias ATIA.
//
// Hace dos cosas, y en ambas la contrasena y el token de Airtable viven solo
// aqui dentro (como secretos), nunca en el codigo publico de la web:
//
//   GET  /avisos  -> devuelve los avisos LEIDOS EN VIVO de Airtable, para que
//                    el boton "Actualizar" traiga datos del momento y no la
//                    copia que se regenera cada 5 minutos.
//   POST /        -> comprueba la contrasena y borra un aviso en Airtable.
//
// Secretos que hay que configurar en Cloudflare (Settings -> Variables and
// Secrets), marcados como "Secret":
//   DELETE_PASSWORD  -> la contrasena del boton "Eliminar"
//   AIRTABLE_TOKEN   -> token de Airtable con permiso data.records:write
//                       (el de escritura sirve tambien para leer)

const ALLOWED_ORIGIN = "https://nctrl12.github.io";
const BASE_ID = "appBQRwCmRwyzg180";
const TABLE_ID = "tblj3eagIgj8WOc5d";

// IDs de campo de la tabla "Registro" (no cambian aunque se renombren)
const F = {
  EMPLAZAMIENTO: "fldEAxNkEHX33zId1",
  ID: "fldvjq0oiwaCU8ZFW",
  CLIENTE: "fldh8LEvAirQvW8Tj",
  MAQUINA: "fldjq5CPUIiaI0PxC",
  PARO: "fldA2h6a4VgHIRjfo",
  DESCRIPCION: "fldOp6mDEQEmKf8kP",
  FOTO: "fldO0ltdUIabz1sib",
  FECHA: "fldv4gKa9Bv41bf3E",
  DURACION: "fldA72wrXA3SGiNdO",
  ESTADO: "fldjdNQR3wDLkrgRM",
  IDENTIFICATE: "fldAdHQhD33OvVZxt",
  CODIGO_INTRO: "fldkAmZKqbVPJd04x",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({}, corsHeaders(), {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    }),
  });
}

function selectName(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v.name) return v.name;
  return "";
}
function text(v) {
  if (v == null) return "";
  return typeof v === "string" ? v.trim() : String(v);
}

async function leerAirtable(token) {
  let all = [];
  let offset;
  do {
    const url = new URL("https://api.airtable.com/v0/" + BASE_ID + "/" + TABLE_ID);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) throw new Error("Airtable respondio " + res.status);
    const data = await res.json();
    all = all.concat(data.records || []);
    offset = data.offset;
  } while (offset);

  const records = all.map(function (r) {
    const cv = r.fields || {};
    const adj = cv[F.FOTO] || [];
    return {
      id: r.id,
      num: cv[F.ID] != null ? cv[F.ID] : null,
      emplazamiento: text(cv[F.EMPLAZAMIENTO]),
      cliente: text(cv[F.CLIENTE]),
      maquina: text(cv[F.MAQUINA]),
      paro: selectName(cv[F.PARO]),
      descripcion: text(cv[F.DESCRIPCION]),
      fecha: cv[F.FECHA] || null,
      duracion: cv[F.DURACION] != null ? cv[F.DURACION] : null,
      estado: selectName(cv[F.ESTADO]) || "Pendiente",
      reportado: text(cv[F.IDENTIFICATE]),
      codigo: text(cv[F.CODIGO_INTRO]),
      adjuntos: adj.map(function (a) { return { filename: a.filename, type: a.type, url: a.url }; }),
    };
  });

  records.sort(function (a, b) {
    return String(b.fecha || "").localeCompare(String(a.fecha || ""));
  });

  return { generatedAt: new Date().toISOString(), envivo: true, records: records };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (!env.AIRTABLE_TOKEN) {
      return json(500, { error: "Falta AIRTABLE_TOKEN en el Worker" });
    }

    // --- Lectura en vivo para el boton "Actualizar" ---
    if (request.method === "GET") {
      try {
        return json(200, await leerAirtable(env.AIRTABLE_TOKEN));
      } catch (e) {
        return json(502, { error: "No se pudo leer Airtable", detail: String(e && e.message) });
      }
    }

    // --- Borrado de un aviso ---
    if (request.method !== "POST") {
      return json(405, { error: "Metodo no permitido" });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json(400, { error: "JSON invalido" });
    }

    const password = body && body.password;
    const recordId = body && body.recordId;

    if (!env.DELETE_PASSWORD) {
      return json(500, { error: "Falta DELETE_PASSWORD en el Worker" });
    }
    if (!password || password !== env.DELETE_PASSWORD) {
      return json(401, { error: "Contrasena incorrecta" });
    }
    if (!recordId || !/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
      return json(400, { error: "recordId invalido" });
    }

    const res = await fetch(
      "https://api.airtable.com/v0/" + BASE_ID + "/" + TABLE_ID + "/" + recordId,
      { method: "DELETE", headers: { Authorization: "Bearer " + env.AIRTABLE_TOKEN } }
    );

    if (!res.ok) {
      const detail = await res.text();
      return json(res.status, { error: "Airtable no pudo borrar el registro", detail: detail });
    }

    return json(200, { ok: true });
  },
};
