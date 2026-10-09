# Respaldo masivo previo a la auditoría (9 de octubre de 2026)

## Identificadores verificados ANTES de editar la aplicación
- Repositorio: `exboliche-byte/onepiece-card-market`.
- Rama inmóvil de seguridad: `backup-massive-before-audit-2026-10-09`.
- SHA del punto de recuperación: `5d93e8d47a9dc4de124ae49b23d70faa4189ecd2`.
- Vercel: proyecto `prj_D2GiNEA7iwIbSy3vrac6KnjERajo`, equipo `team_IhwcIJ8TqarmbU10eumm98lv`.
- Despliegue anterior verificado `READY`: `dpl_FP59FaRAdoRuZJSu79UJrtri6YiK`, commit `29a59b0671062ce843120d77a91a092575822351`.
- Supabase: proyecto `zawzbdbdbcshljhlvgjx`, estado `ACTIVE_HEALTHY` antes de modificar.
- Instantánea privada: esquema `audit_backup_massive_20261009`; inventario: `audit_backup_massive_20261009.backup_inventory`.
- La migración `massive_pre_audit_backup_20261009` capturó las tablas antes de aplicar funciones nuevas.

## Inventario SQL de la instantánea
```sql
SELECT table_name, row_count, recorded_at
FROM audit_backup_massive_20261009.backup_inventory ORDER BY table_name;
```

En el instante del respaldo se verificaron: perfiles (4), colecciones (861 filas), mazos (9), cartas de mazo (147), torneos (8), enlaces públicos (2), propuestas de intercambio (0), datos de herramientas (1), precios históricos (5.216) y el resto de las 13 tablas de `public`. No hay claves privadas en el repositorio.

## Recuperación segura del código y la web
1. Revisar si hubo escrituras de usuarios posteriores al backup. **Nunca restaurar la base sin autorización explícita:** sustituir el snapshot perdería cambios posteriores.
2. Para volver al código previo, crear una rama o commit de restauración basado en el SHA `5d93e8d...`; no depender de `main` actual. Desplegar a Vercel, comprobar `READY` y URLs/funciones.
3. Como alternativa de emergencia, el despliegue `dpl_FP59FaRAdoRuZJSu79UJrtri6YiK` es la versión anterior conocida de producción.
4. Para revertir funciones SQL nuevas, revisar antes qué versión del frontend necesita cada RPC. No suprimir columnas/tablas nuevas automáticamente.

## Recuperación de los datos de la aplicación
La instantánea privada permite **consultar y reimportar** cada tabla pública; no se ha ejecutado restauración alguna. Restaurar mediante transacción y orden de claves foráneas, con suspensión temporal de escrituras y una segunda copia del estado actual. Para cada tabla, comparar las columnas y su esquema antes de `INSERT ... SELECT`. No hacer `TRUNCATE CASCADE` ciegamente: afectaría a datos posteriores y a tablas nuevas.

Ejemplo de comparación **solo lectura**:
```sql
SELECT (SELECT count(*) FROM public.collection_items) AS current_rows,
       (SELECT count(*) FROM audit_backup_massive_20261009.collection_items) AS backup_rows;
```

La copia incluye datos de la aplicación, no una duplicación externa de todo el servicio administrado de autenticación de Supabase. **No es recuperación total ante la destrucción del proyecto Supabase.** Para ese escenario, se requiere exportación externa mediante mecanismos oficiales de copia administrada y protección cifrada de las credenciales; las herramientas conectadas aquí no proporcionan un `pg_dump` completo ni un archivo externo de `auth`. No afirmar lo contrario.

## Verificación recomendada
- Comprobar filas de backup contra el inventario, RLS, RPC y políticas.
- Verificar que las impresiones exactas `card_id` se mantienen en todo el flujo.
- Comparar el SHA servido por Vercel con el SHA de publicación deseado.
- Hacer una importación de prueba en una cuenta de test antes de una restauración real.

La nueva migración `20261009_atomic_persistence.sql` es aditiva y no altera por sí misma filas existentes.
