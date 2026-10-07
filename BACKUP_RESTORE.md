# Backup de restauración — antes de búsqueda de mazos competitivos

Fecha: 2026-10-07

## Copia exacta

- Rama: `backup-before-competitive-decks-2026-10-07`
- Commit: `0f5e3b7624fc72a9b96f7a3cf63e8bef00a0f2ef`
- Producción asociada antes de esta funcionalidad: `https://onepiece-card-market.vercel.app`

La rama se creó directamente desde el HEAD de `main` antes de implementar la búsqueda/importación de mazos de torneos.

## Cómo restaurar

Si el usuario pide **"restaura la copia de seguridad de este proyecto"**:

1. Comprobar el HEAD actual de `main`.
2. Mover `main` al commit `0f5e3b7624fc72a9b96f7a3cf63e8bef00a0f2ef` usando actualización forzada con protección `expected_sha`.
3. Desplegar exactamente ese commit en el proyecto Vercel `onepiece-card-market` a producción.
4. Confirmar únicamente que el deployment termina en `READY`, salvo que el usuario solicite pruebas adicionales.

## Alcance

Esta restauración revierte el código del repositorio. No borra ni modifica datos persistentes de Supabase, cuentas, colecciones o mazos guardados por usuarios.
