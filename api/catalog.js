// Catálogo en vivo desde la carpeta pública de Google Drive.
// Cada subcarpeta es una categoría y cada foto es un producto. El nombre del archivo da el nombre y el precio de la prenda:
// "Body cuello redondo café - $75.000", "$75.000 body cuello redondo café", "$128.000 C/U set leggings",
// solo "$75.000" o solo "Body halter lila".
// Si el archivo no trae nombre se usa data/names.json (id de Drive → nombre) y, si tampoco está ahí, la categoría.
const NAMES = require("../data/names.json");

const ROOT = "1QnbwsuoM7DG5SRlIuxPK-Ld1GJjZ5o7x";
// Nombre de la carpeta en Drive (normalizado) → categoría de la landing
const CATS = {
  "bodies": "Bodies",
  "chaquetas deportivas": "Chaquetas deportivas",
  "crop top": "Crop tops",
  "crop tops": "Crop tops",
  "enterizo manga larga": "Enterizos manga larga",
  "enterizos manga larga": "Enterizos manga larga",
  "enterizos cortos": "Enterizos cortos",
  "enterizos largos": "Enterizos largos",
  "set short": "Set short",
  "sets deportivos": "Sets deportivos",
};
const SINGULAR = { "Bodies": "Body", "Chaquetas deportivas": "Chaqueta deportiva", "Crop tops": "Crop top", "Enterizos manga larga": "Enterizo manga larga", "Enterizos cortos": "Enterizo corto", "Enterizos largos": "Enterizo largo", "Set short": "Set short", "Sets deportivos": "Set deportivo" };

const decode = s => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
// Quita negritas Unicode (𝗕𝗼𝗱𝗶𝗲𝘀) y emojis del nombre de la carpeta
const clean = s => decode(s).normalize("NFKC").replace(/[^\p{L}\p{N}\s/]/gu, "").replace(/\s+/g, " ").trim();
const catName = title => { const c = clean(title); return CATS[c.toLowerCase()] || c; };

async function listFolder(id) {
  const r = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}`, { headers: { "Accept-Language": "es" } });
  if (!r.ok) throw new Error(`Drive respondió ${r.status} para la carpeta ${id}`);
  const html = await r.text();
  return [...html.matchAll(/<div class="flip-entry" id="entry-([^"]+)".*?<a href="([^"]+)".*?<div class="flip-entry-title">([^<]*)<\/div>/gs)]
    .map(([, id, href, title]) => ({ id, title: decode(title).trim(), folder: href.includes("/folders/") }));
}

// Nombres automáticos de cámara o del celular, que no son el nombre de la prenda
const AUTO_NAME = /^([0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}|(img|dsc|dscn|pxl|photo|foto|image|imagen|whatsapp|screenshot|captura)([\s_.-].*|\d.*)?|[\d\s_.-]+)$/i;

const SEP = /^[\s\-–—|:,]+|[\s\-–—|:,]+$/g;
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

function parseTitle(title) {
  const base = title.replace(/\.(jpe?g|png|webp|heic|heif|gif)$/i, "").trim();
  const m = base.match(/\$\s*([\d.,]+)(.*)$/);
  const price = m ? +m[1].replace(/[.,]/g, "") : 0;
  // Lo que va antes y después del precio, sin el guion o separador que lo une al precio
  const before = (m ? base.slice(0, m.index) : base).replace(SEP, "");
  let after = m ? m[2].replace(SEP, "") : "", note = "";
  // "C/U" (cada uno) es una nota que se muestra junto al precio, no parte del nombre
  const cu = after.match(/^c\/u\.?(\s+|$)/i);
  if (cu) { note = "c/u"; after = after.slice(cu[0].length).replace(SEP, ""); }
  // El nombre puede ir antes ("Body café - $75.000") o después del precio ("$75.000 body café");
  // si va antes, lo que sigue al precio es una nota
  let name = before;
  if (before) note = [note, after].filter(Boolean).join(" ");
  else name = after;
  return { name: name && !AUTO_NAME.test(name) ? capitalize(name) : "", price, note };
}

async function loadCatalog() {
  const folders = (await listFolder(ROOT)).filter(e => e.folder);
  const lists = await Promise.all(folders.map(f => listFolder(f.id)));
  const products = [];
  folders.forEach((f, i) => {
    const cat = catName(f.title);
    const files = lists[i].filter(e => !e.folder).map(e => ({ ...e, ...parseTitle(e.title) }));
    // Fotos sin precio en el nombre toman el precio de la carpeta cuando todas las que lo tienen coinciden; si no, "Consultar precio"
    const priced = [...new Set(files.filter(e => e.price).map(e => e.price + "|" + e.note))];
    const [folderPrice, folderNote] = priced.length === 1 ? priced[0].split("|") : [0, ""];
    files.forEach(e => {
      const price = e.price || +folderPrice, note = e.price ? e.note : folderNote;
      products.push({ id: e.id, name: e.name || NAMES[e.id] || SINGULAR[cat] || cat, cat, price, note, img: `https://lh3.googleusercontent.com/d/${e.id}=w600` });
    });
  });
  return products;
}

module.exports = async (req, res) => {
  try {
    const products = await loadCatalog();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    // El navegador la reutiliza 1 minuto; Vercel la guarda 5 minutos y la renueva en segundo plano
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=86400");
    res.end(JSON.stringify({ updated: new Date().toISOString(), products }));
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: err.message }));
  }
};
module.exports.loadCatalog = loadCatalog;
module.exports.parseTitle = parseTitle;
