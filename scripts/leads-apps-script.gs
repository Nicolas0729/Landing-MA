// Apps Script para guardar los registros de la Comunidad MA en esta hoja de Google Sheets.
// 1. En la hoja: Extensiones → Apps Script, borra lo que haya y pega este código.
// 2. Cambia TOKEN por la misma clave que pongas en Vercel como LEADS_TOKEN.
// 3. Implementar → Nueva implementación → Tipo: Aplicación web
//    Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario → Implementar y autoriza.
// 4. Copia la URL de la aplicación web (termina en /exec) y ponla en Vercel como LEADS_SHEET_URL.

const TOKEN = "PEGA_AQUI_TU_CLAVE";

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: "json" }); }
  if (data.token !== TOKEN) return reply({ ok: false, error: "token" });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(["Fecha", "Nombre", "Teléfono", "Origen"]);
    // El apóstrofo guarda el teléfono como texto para que no pierda el +57
    sheet.appendRow([new Date(), String(data.name).slice(0, 60), "'" + data.phone, data.source || ""]);
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
