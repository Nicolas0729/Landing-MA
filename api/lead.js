// Recibe los registros de la sección "Comunidad MA" y los guarda en una hoja de Google Sheets
// a través del Apps Script de scripts/leads-apps-script.gs.
// Variables de entorno en Vercel: LEADS_SHEET_URL (URL del Apps Script publicado) y LEADS_TOKEN (la misma clave que en el script).

async function readBody(req) {
  // En Vercel el cuerpo ya viene en req.body; en el servidor local hay que leerlo del stream
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const send = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: "invalid_json" }); }

  // Campo trampa: solo lo llenan los bots; se responde como si todo saliera bien
  if (body.website) return send(res, 200, { ok: true });

  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const digits = String(body.phone || "").replace(/\D/g, "").replace(/^57(?=3\d{9}$)/, "");
  if (name.length < 2) return send(res, 400, { error: "invalid_name" });
  if (!/^3\d{9}$/.test(digits)) return send(res, 400, { error: "invalid_phone" });

  const url = process.env.LEADS_SHEET_URL, token = process.env.LEADS_TOKEN;
  if (!url || !token) return send(res, 503, { error: "not_configured" });

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, phone: "+57" + digits, source: "landing" }),
      redirect: "follow",
    });
    const text = await r.text();
    let out = null;
    try { out = JSON.parse(text); } catch {}
    if (r.ok && out && out.ok) return send(res, 200, { ok: true });
    // Motivo sin datos sensibles: "token" = la clave no coincide; "no_json" = Apps Script devolvió una página (acceso o URL incorrectos)
    const reason = out ? out.error || "rejected" : "no_json";
    // Título de la página que devolvió Google (ej. inicio de sesión o error del script), útil para diagnosticar
    const page = out ? undefined : (text.match(/<title>([^<]*)<\/title>/i) || [])[1];
    console.error(`Google Sheets respondió ${r.status} (${reason}): ${text.slice(0, 300)}`);
    send(res, 502, { error: "sheet_error", reason, status: r.status, page });
  } catch (err) {
    console.error(err);
    send(res, 502, { error: "sheet_error", reason: "network" });
  }
};
