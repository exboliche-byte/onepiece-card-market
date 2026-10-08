# Copia de seguridad integral del código — 2026-10-08

- **Proyecto:** MiAlbumOnePiece
- **Repositorio:** `exboliche-byte/onepiece-card-market`
- **Referencia original `main`:** `5edd35b4dc575d2655374fa41862f36be003acf8`
- **Rama protegida como instantánea:** `backup-full-2026-10-08`
- **Producción Vercel:** `onepiece-card-market.vercel.app`, proyecto `prj_D2GiNEA7iwIbSy3vrac6KnjERajo`.
- **Base de datos:** Supabase, fuera del repositorio. Esta copia **no incluye** los registros de usuarios, colecciones, mazos, credenciales ni claves secretas de producción. El conector Supabase no devolvió proyectos accesibles al generar esta instantánea.

## Contenido del archivo generado por GitHub Actions

- `source.zip`: todos los archivos versionados del repositorio en la rama de la copia, incluidos scripts, catálogo, datos de precios y configuración versionada.
- `history.bundle`: historial completo de Git y referencias recuperadas en la ejecución, verificable con `git bundle verify`.
- `manifest.txt`: identificador del commit y referencias de restauración.

Los archivos se almacenan como **artefacto privado de GitHub Actions**, con caducidad según la retención configurada (hasta 90 días). Descárgalos y guárdalos fuera de GitHub para tener una copia realmente independiente del repositorio.

## Cómo restaurar el código

1. Guardar primero la versión de producción actual.
2. Crear una rama temporal desde `backup-full-2026-10-08` o restaurar los archivos desde `source.zip`. No modificar `main` sin una petición explícita.
3. Para recuperar historial de Git desde el bundle: `git clone history.bundle restored-project`.
4. Conectar el nuevo entorno Vercel y sus variables de entorno originales por separado.
5. Restaurar la base de datos de Supabase desde un respaldo independiente realizado en su panel/CLI o en la cuenta con acceso al proyecto.

**Importante:** restaurar el código no restaura automáticamente usuarios, sesiones, colecciones ni mazos guardados en Supabase. Nunca incluya secretos en un backup público.
