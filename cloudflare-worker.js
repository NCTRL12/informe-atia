// Worker de Cloudflare del Informe de Averias ATIA.
//
// Hace dos cosas, y en ambas la contrasena y el token de Airtable viven solo
// aqui dentro (como secretos), nunca en el codigo publico de la web:
//
//   GET  /avisos  -> devuelve los avisos LEIDOS EN VIVO de Airtable, para que
//                    el boton "Actualizar" traiga datos del momento y no la
//                    copia que se regenera cada 5 minutos.
//   POST /        -> comprueba la contrasena y, segun "accion":
//                      "eliminar" (por defecto) -> borra el aviso en Airtable
//                      "estado"                 -> lo pasa a Pendiente o Terminado
//                      "cambiar-clave"          -> cambia la contrasena de una seccion
//
// Las contrasenas viven en una tabla de la propia base llamada "Claves":
// la columna Name lleva el identificador ("eliminar" / "estado") y la columna
// Notes la contrasena. Si esa tabla no existe todavia, o una fila esta vacia,
// se usa DELETE_PASSWORD (el secreto de Cloudflare) como reserva, asi que
// nada deja de funcionar mientras no se configure.
//
// Secretos que hay que configurar en Cloudflare (Settings -> Variables and
// Secrets), marcados como "Secret":
//   DELETE_PASSWORD  -> la contrasena del boton "Eliminar"
//   AIRTABLE_TOKEN   -> token de Airtable con permiso data.records:write
//                       (el de escritura sirve tambien para leer)

const ALLOWED_ORIGIN = "https://nctrl12.github.io";
// Tabla de contrasenas. Se direcciona por NOMBRE, no por id, para no tener que
// tocar nada aqui si se recrea: basta con que exista una tabla asi llamada.
const TABLA_CLAVES = "Claves";
const SECCIONES = ["eliminar", "estado"];
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

// Devuelve { eliminar: {id, valor}, estado: {...} } o null si la tabla no existe.
async function leerClaves(token) {
  const url =
    "https://api.airtable.com/v0/" + BASE_ID + "/" + encodeURIComponent(TABLA_CLAVES) + "?pageSize=100";
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error("Airtable respondio " + res.status);
  const data = await res.json();
  const mapa = {};
  for (const r of data.records || []) {
    const f = r.fields || {};
    const nombre = String(f.Name == null ? "" : f.Name).trim().toLowerCase();
    if (nombre) mapa[nombre] = { id: r.id, valor: String(f.Notes == null ? "" : f.Notes).trim() };
  }
  return mapa;
}

// La contrasena de una seccion: la de la tabla si esta puesta, y si no la de
// reserva guardada en Cloudflare.
function claveDe(mapa, seccion, env) {
  const fila = mapa && mapa[seccion];
  if (fila && fila.valor) return fila.valor;
  return env.DELETE_PASSWORD || "";
}

async function guardarClave(token, mapa, seccion, nueva) {
  const base = "https://api.airtable.com/v0/" + BASE_ID + "/" + encodeURIComponent(TABLA_CLAVES);
  const fila = mapa[seccion];
  const cabeceras = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
  if (fila) {
    return fetch(base + "/" + fila.id, {
      method: "PATCH",
      headers: cabeceras,
      body: JSON.stringify({ fields: { Notes: nueva } }),
    });
  }
  return fetch(base, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify({ records: [{ fields: { Name: seccion, Notes: nueva } }] }),
  });
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
    // Sin "accion" se borra, como antes, para no romper nada que ya funcione.
    const accion = body && body.accion ? String(body.accion) : "eliminar";

    // Validamos la accion ANTES de la contrasena a proposito: asi se puede
    // comprobar desde fuera, sin saber la contrasena, si esta desplegada esta
    // version del Worker (una accion inventada responde 400 y no 401). No se
    // filtra nada: solo dice que nombres de accion existen.
    if (accion !== "eliminar" && accion !== "estado" && accion !== "cambiar-clave") {
      return json(400, { error: "Accion desconocida" });
    }

    if (!env.DELETE_PASSWORD) {
      return json(500, { error: "Falta DELETE_PASSWORD en el Worker" });
    }

    // Las contrasenas de la tabla mandan; si la tabla no existe o falla la
    // lectura, seguimos con la de reserva para no dejar la web inservible.
    let claves = null;
    try {
      claves = await leerClaves(env.AIRTABLE_TOKEN);
    } catch (e) {
      claves = null;
    }

    // --- Cambiar la contrasena de una seccion ---
    if (accion === "cambiar-clave") {
      const seccion = String((body && body.clave) || "");
      if (SECCIONES.indexOf(seccion) === -1) {
        return json(400, { error: "Seccion invalida" });
      }
      const actual = body && body.actual;
      const nueva = body && body.nueva;
      if (!actual || actual !== claveDe(claves, seccion, env)) {
        return json(401, { error: "Contrasena incorrecta" });
      }
      const limpia = typeof nueva === "string" ? nueva.trim() : "";
      if (limpia.length < 4) {
        return json(400, { error: "La contrasena nueva necesita al menos 4 caracteres" });
      }
      if (claves === null) {
        return json(409, {
          error:
            'Falta la tabla "Claves" en Airtable. Crea una tabla con ese nombre en la base y vuelve a intentarlo.',
        });
      }
      const res = await guardarClave(env.AIRTABLE_TOKEN, claves, seccion, limpia);
      if (!res.ok) {
        const detail = await res.text();
        return json(res.status, { error: "Airtable no pudo guardar la contrasena", detail: detail });
      }
      return json(200, { ok: true, clave: seccion });
    }

    if (!password || password !== claveDe(claves, accion, env)) {
      return json(401, { error: "Contrasena incorrecta" });
    }
    if (!recordId || !/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
      return json(400, { error: "recordId invalido" });
    }

    const registro = "https://api.airtable.com/v0/" + BASE_ID + "/" + TABLE_ID + "/" + recordId;

    // --- Cambiar el estado del aviso (Pendiente <-> Terminado) ---
    if (accion === "estado") {
      const estado = body && body.estado;
      if (estado !== "Pendiente" && estado !== "Terminado") {
        return json(400, { error: "Estado invalido" });
      }
      const campos = {};
      campos[F.ESTADO] = estado;
      const res = await fetch(registro, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + env.AIRTABLE_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: campos }),
      });
      if (!res.ok) {
        const detail = await res.text();
        return json(res.status, { error: "Airtable no pudo cambiar el estado", detail: detail });
      }
      return json(200, { ok: true, estado: estado });
    }

    // --- Borrar el aviso ---
    const res = await fetch(registro, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + env.AIRTABLE_TOKEN },
    });

    if (!res.ok) {
      const detail = await res.text();
      return json(res.status, { error: "Airtable no pudo borrar el registro", detail: detail });
    }

    return json(200, { ok: true });
  },
};
