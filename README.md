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
La aplicación es una SPA estática con funciones Vercel bajo \`/api\`. No necesita un build step.
