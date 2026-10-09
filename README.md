# MiAlbumOnePiece

PWA móvil para coleccionar, buscar y gestionar cartas de One Piece Card Game.

## Producción
https://onepiece-card-market.vercel.app

## Datos
- Catálogo: \`data/cards.json\`
- Expansiones: \`data/packs.json\`
- Precios de referencia: Cardmarket public data
- Backend de usuario: Supabase

El catálogo se mantiene separado de los datos de colección y mazos para que nuevas cartas no destruyan datos del usuario.

## Desarrollo
La aplicación es una SPA estática con funciones Vercel bajo \`/api\`. Vercel ejecuta `scripts/vercel-build.sh`, que valida el código, ejecuta pruebas y prepara los archivos publicados.

## Recuperación
Consulta [`BACKUP_MASSIVE_20261009.md`](BACKUP_MASSIVE_20261009.md) para restaurar código, despliegue y tablas de la aplicación.
