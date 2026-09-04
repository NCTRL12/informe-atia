// Descarga el registro de averías ATIA desde Airtable y genera data.json
// para que index.html lo muestre. Lo ejecuta automáticamente el workflow
// de GitHub Actions (.github/workflows/update.yml) cada hora.
//
// Requiere Node 18+ (fetch incluido) y la variable de entorno AIRTABLE_TOKEN
// con un Personal Access Token de Airtable con permiso de lectura
// (data.records:read) sobre esta base.

const TOKEN = process.env.AIRTABLE_TOKEN;
if (!TOKEN) {
  console.error("Falta la variable de entorno AIRTABLE_TOKEN.");
  process.exit(1);
}

const BASE_ID = "appBQRwCmRwyzg180";
const TABLE_ID = "tblj3eagIgj8WOc5d";

// IDs de campo de la tabla "Registro" (no cambian aunque se renombren los campos)
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
  CODIGO_INTRO: "fldkAmZKqbVPJd04x"
};

// La API pública de Airtable devuelve los campos de selección única (Estado,
// Parada) como texto simple casi siempre, pero por si acaso aceptamos también
// la forma {id, name} para no romper el sitio si Airtable cambia el formato.
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

async function fetchAllRecords() {
  let all = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable respondió ${res.status}: ${body}`);
    }
    const data = await res.json();
    all = all.concat(data.records || []);
    offset = data.offset;
  } while (offset);
  return all;
}

const raw = await fetchAllRecords();
console.log(`Descargados ${raw.length} registros de Airtable.`);

const records = raw.map((r) => {
  const cv = r.fields || {};
  const attachments = cv[F.FOTO] || [];
  return {
    id: r.id,
    num: cv[F.ID] ?? null,
    emplazamiento: text(cv[F.EMPLAZAMIENTO]),
    cliente: text(cv[F.CLIENTE]),
    maquina: text(cv[F.MAQUINA]),
    paro: selectName(cv[F.PARO]),
    descripcion: text(cv[F.DESCRIPCION]),
    fecha: cv[F.FECHA] || null,
    duracion: cv[F.DURACION] ?? null,
    estado: selectName(cv[F.ESTADO]) || "Pendiente",
    reportado: text(cv[F.IDENTIFICATE]),
    codigo: text(cv[F.CODIGO_INTRO]),
    adjuntos: attachments.map((a) => ({ filename: a.filename, type: a.type, url: a.url }))
  };
});

records.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));

const bundle = {
  generatedAt: new Date().toISOString(),
  records
};

const fs = await import("node:fs/promises");
await fs.writeFile("data.json", JSON.stringify(bundle), "utf8");
console.log(`Guardados ${records.length} registros en data.json.`);
