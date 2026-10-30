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

// Las cuentas de Google Workspace entregan la URL como /a/macros/<dominio>/s/…/exec, que pide iniciar sesión
// a visitantes anónimos; la forma /macros/s/…/exec abre igual para "Cualquier usuario"
const sheetUrl = () => (process.env.LEADS_SHEET_URL || "").trim().replace(/^(https:\/\/script\.google\.com)\/a\/macros\/[^/]+\//, "$1/macros/");

const send = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
};

module.exports = async (req, res) => {
  // Diagnóstico: GET /api/lead?check abre la URL configurada (doGet del Apps Script) sin mostrarla
  if (req.method === "GET" && /[?&]check\b/.test(req.url)) {
    const url = sheetUrl();
    if (!url) return send(res, 200, { configured: false });
    try {
      const r = await fetch(url, { redirect: "follow" });
      const t = await r.text();
      const page = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
      // Últimos 6 caracteres del id de la implementación, para compararla con la URL que se ve en Apps Script
      const id = (url.match(/\/s\/([^/]+)\/exec/) || [])[1] || "";
      return send(res, 200, { configured: true, endsWithExec: /\/exec\/?$/.test(url), idEnd: id.slice(-6), workspaceUrl: /\/a\/macros\//.test(process.env.LEADS_SHEET_URL), status: r.status, page, token: Boolean(process.env.LEADS_TOKEN) });
    } catch (err) { return send(res, 200, { configured: true, error: String(err.message) }); }
  }
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: "invalid_json" }); }

  // Campo trampa: solo lo llenan los bots; se responde como si todo saliera bien
  if (body.website) return send(res, 200, { ok: true });

  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const digits = String(body.phone || "").replace(/\D/g, "").replace(/^57(?=3\d{9}$)/, "");
  if (name.length < 2) return send(res, 400, { error: "invalid_name" });
  if (!/^3\d{9}$/.test(digits)) return send(res, 400, { error: "invalid_phone" });

  const url = sheetUrl(), token = (process.env.LEADS_TOKEN || "").trim();
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
    const page = out ? undefined : [(text.match(/<title>([^<]*)<\/title>/i) || [])[1],
      text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 200)].filter(Boolean).join(" — ");
    console.error(`Google Sheets respondió ${r.status} (${reason}): ${text.slice(0, 300)}`);
    send(res, 502, { error: "sheet_error", reason, status: r.status, page });
  } catch (err) {
    console.error(err);
    send(res, 502, { error: "sheet_error", reason: "network" });
  }
};
