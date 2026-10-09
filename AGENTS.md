# MiAlbumOnePiece — conexiones y despliegues

Repositorio: `exboliche-byte/onepiece-card-market`, rama `main`.
Producción: https://onepiece-card-market.vercel.app
Vercel project: `prj_D2GiNEA7iwIbSy3vrac6KnjERajo` (equipo `team_IhwcIJ8TqarmbU10eumm98lv`).

## Supabase — acceso administrativo verificado

La web de producción está conectada al proyecto Supabase **One Piece Card Market**.
Project ref: `zawzbdbdbcshljhlvgjx`. Región: `eu-central-1`.

**ATENCIÓN:** La conexión administrativa de Supabase puede devolver `{"projects":[]}` con
`list_projects`, incluso cuando este proyecto existe, está en `ACTIVE_HEALTHY`
y se puede consultar. El listado general y `list_organizations` no representan
necesariamente todos los proyectos accesibles desde esta conexión.

Ante un listado vacío, **NO asumir que Supabase ha caído, que no existe proyecto
o que hay que crear otro**. Primero comprobar en Vercel la variable pública
`SUPABASE_URL` y obtener el *project ref* de su hostname. Utilizar ese ref
directamente con `get_project`, `list_tables`, `execute_sql` y
`apply_migration`. Este procedimiento funcionó el 9 de octubre de 2026.

Nunca imprimir ni cambiar claves privadas de Supabase o Vercel, ni usar
`service_role` en el frontend. Aplicar siempre políticas RLS por
`auth.uid() = user_id` antes de exponer tablas al navegador.

## Herramientas de usuario

`public.user_tools` almacena los dos lados del intercambio y las alertas
de precios en JSONB por usuario, con RLS y control de concurrencia `revision`.
El navegador guarda una copia local únicamente para migración y recuperación
ante fallos. Los mazos accesibles y el análisis de torneos reutilizan las
tablas existentes y los datos públicos, sin duplicar información de usuario.
Migración: `supabase/migrations/20261009_user_tools_sync.sql`.

## Antes de publicar

Guardar una rama de backup en GitHub; hacer cambios mínimos en `main`;
comprobar que `scripts/vercel-build.sh` ejecuta las pruebas y copia todo
archivo referenciado; desplegar en el proyecto Vercel anterior y verificar
`READY` para el SHA nuevo. Los cambios SQL se comprueban con consultas y
los asesores de seguridad de Supabase.
