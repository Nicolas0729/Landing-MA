// Pone nombre a las fotos nuevas del Drive mirando la prenda con Claude y lo guarda en data/names.json.
// Lo ejecuta la tarea de GitHub .github/workflows/name-photos.yml; necesita ANTHROPIC_API_KEY.
// Uso: node scripts/name-photos.mjs [--dry-run]   (--dry-run solo lista las fotos sin nombre)
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const NAMES_FILE = new URL("../data/names.json", import.meta.url);
const { loadCatalog } = require("../api/catalog.js");

const names = JSON.parse(fs.readFileSync(NAMES_FILE, "utf8"));
const products = await loadCatalog();
const unnamed = products.filter(p => !names[p.id]);
console.log(`::notice::${products.length} fotos en Drive, ${unnamed.length} sin nombre`);
if (!unnamed.length || process.argv.includes("--dry-run")) {
  unnamed.forEach(p => console.log(`- ${p.id} (${p.cat})`));
  process.exit(0);
}
if (!process.env.ANTHROPIC_API_KEY) {
  // Aviso en vez de error para que la tarea programada no falle cada 15 min mientras no exista el secreto
  console.log("::warning::Falta ANTHROPIC_API_KEY: agrega el secreto en GitHub (Settings → Secrets and variables → Actions).");
  process.exit(0);
}

const { default: Anthropic } = await import("@anthropic-ai/sdk");
const client = new Anthropic();

async function nameFor(p) {
  const img = await fetch(`https://lh3.googleusercontent.com/d/${p.id}=w800`);
  if (!img.ok) throw new Error(`No se pudo descargar la foto (${img.status})`);
  const media_type = (img.headers.get("content-type") || "image/jpeg").split(";")[0];
  const data = Buffer.from(await img.arrayBuffer()).toString("base64");
  // Nombres de la misma categoría como ejemplo del estilo que ya usa la landing
  const examples = [...new Set(Object.entries(names).filter(([id]) => products.some(x => x.id === id && x.cat === p.cat)).map(([, n]) => n))];

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type, data } },
        { type: "text", text:
`Esta es la foto de un producto del catálogo de una tienda colombiana de ropa deportiva femenina, en la categoría "${p.cat}".
Escribe el nombre corto de la prenda para mostrarlo en la tarjeta del producto: tipo de prenda, el detalle que la distingue (corte, tiras, ribete, escote, etc.) y el color, en español y en minúsculas salvo la primera letra.
Si la foto muestra varios colores del mismo modelo, termina con "· colores" o "· N colores".
Sigue el mismo estilo de estos nombres que ya existen en esta categoría:
${examples.map(n => `- ${n}`).join("\n") || "- (todavía no hay)"}
Responde solo con el nombre, sin comillas ni explicación.` },
      ],
    }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude no nombró esta foto (refusal)");
  const text = response.content.filter(b => b.type === "text").map(b => b.text).join(" ").trim();
  const name = text.split("\n")[0].replace(/^["'«“]|["'»”.]$/g, "").trim();
  if (!name || name.length > 70) throw new Error(`Respuesta inesperada: ${JSON.stringify(text)}`);
  return name;
}

let added = 0;
for (const p of unnamed) {
  try {
    names[p.id] = await nameFor(p);
    added++;
    console.log(`::notice::${p.cat}: ${names[p.id]}`);
  } catch (err) {
    // La foto sigue mostrándose con el nombre de su categoría; se reintenta en la próxima ejecución
    // ::error:: lo muestra como anotación en la ejecución de GitHub
    console.log(`::error::No se pudo nombrar ${p.id} (${p.cat}): ${String(err.message).replace(/\r?\n/g, " ")}`);
  }
}
if (added) fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 2) + "\n");
console.log(`${added} nombres nuevos guardados`);
