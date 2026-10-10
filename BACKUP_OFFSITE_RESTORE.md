# Respaldo externo y recuperación de MiAlbumOnePiece

**Verificado el 10/10/2026:** `audit_backup_20261010.backup_inventory` contiene 18 tablas y 11.390 registros. `audit_backup_20261010.backup_metadata` incluye definiciones de funciones, políticas, columnas, índices, restricciones y fuentes de Edge Functions. El respaldo masivo del 09/10/2026 era anterior (13 tablas, 6.266 filas). Ninguno constituye una copia externa.

Rama de seguridad de código: `backup-before-tech-fixes-2026-10-10`, commit `d17505b246f4da10973991455c31f5f6980971df`.

## Exportación cifrada fuera de Supabase

`scripts/offsite-supabase-backup.sh` hace `pg_dump` consistente (`public`, `auth`, `storage`), cifra el flujo con `age`, envía solo el cifrado por `rclone` y valida el checksum remoto. **No se ha ejecutado una copia externa**: faltan destino y credenciales autorizadas. Ejecutarlo exclusivamente en un runner privado con PostgreSQL 17, `age`, `rclone` y permisos mínimos.

Configurar mediante gestor de secretos (jamás Git ni consola pública) `SUPABASE_DATABASE_URL`, `AGE_RECIPIENT` (clave pública de cifrado) y `OFFSITE_DEST` (destino independiente de Supabase con acceso restringido, retención/versionado e idealmente protección contra borrado). Ejecutar `bash scripts/offsite-supabase-backup.sh`. `AGE_IDENTITY_FILE` es opcional para comprobar `pg_restore --list` y debe permanecer únicamente en un host aislado.

Además se deben respaldar aparte: ficheros binarios de Supabase Storage (el volcado SQL solo almacena sus metadatos), fuentes/versiones Edge, configuración Auth y secretos necesarios para reconstruir un proyecto. Exportar estos elementos de forma cifrada y probar sus checksums; no incluirlos en el repositorio.

## Restauración verificable

1. Recuperar archivo cifrado del repositorio externo, verificar SHA-256 y en host aislado ejecutar `age -d -i /ruta/clave-privada backup.dump.age | pg_restore --list`.
2. Crear un entorno **de prueba**, jamás el proyecto productivo, de PostgreSQL/Supabase compatible. Restaurar `pg_restore --no-owner --no-acl` con credenciales autorizadas, previa preparación de extensiones y esquemas gestionados. Restaurar aparte objetos de Storage y Edge Functions.
3. Comparar conteos, claves e integridad referencial, comprobar RLS/GRANT, realizar login de cuentas de prueba y recorrer colección, mazos, torneos y trades. Evitar exponer filas personales en logs.
4. Solo tras ensayo documentado declarar recuperabilidad; nunca sobrescribir producción sin aprobación explícita, detención de escrituras y copia nueva de los datos actuales.

Guardar la clave privada y las credenciales **fuera de GitHub**. No publicar volcados, logs con datos, backups ni secretos en Actions.
