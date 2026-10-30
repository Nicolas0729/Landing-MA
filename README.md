# Landing MA

Catálogo de MA ropa deportiva femenina · Inspired by Movement. Publicado en https://catalogoma.vercel.app

## Cómo actualizar el catálogo (desde Google Drive)

Las fotos, precios y nombres salen de la carpeta [Catálogo MA](https://drive.google.com/drive/folders/1QnbwsuoM7DG5SRlIuxPK-Ld1GJjZ5o7x). La landing se actualiza sola en unos 5 minutos.

- **Categoría:** la subcarpeta donde está la foto (Bodies, Crop top, Sets deportivos…).
- **Nombre y precio:** el nombre del archivo, con el formato `Nombre de la prenda - $precio`:
  - `Body cuello redondo café - $75.000`
  - `Set leggings · colores - $128.000 C/U` (lo que va después del precio se muestra como nota)
  - `$75.000` → solo precio; el nombre se mantiene o se usa el de la categoría
  - `Body halter lila` → solo nombre; toma el precio de su carpeta si todas las fotos con precio ahí tienen el mismo, si no dice "Consultar precio"
- **Agregar o quitar una prenda:** subir o borrar la foto en la subcarpeta.

La carpeta debe seguir compartida como "Cualquier persona con el enlace puede ver".

## Archivos

- `index.html`: página con estilos y scripts incluidos. Trae un catálogo de respaldo por si el Drive no responde.
- `api/catalog.js`: función de Vercel que lee el Drive.
- `data/names.json`: nombres de respaldo para fotos cuyo archivo no trae nombre.
- `img/`: fotos del catálogo de respaldo en WebP.
- `logo-mark.webp`, `logo-full.webp`: logo.
