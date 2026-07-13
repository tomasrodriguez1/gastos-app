# Changelog

## Unreleased

- Nueva página `/log`: log de últimos gastos ingresados (todos los meses, ordenado por `created_at`), con resaltado de gastos nuevos desde la última visita y edición/borrado inline. Acceso desde botón "Log" en `/gastos`.
- Fix: `useGastosLocales.agregar()` generaba `created_at` en un formato inconsistente con el que devuelve el servidor, lo que podía hacer que un gasto manual recién creado se ordenara antes de tiempo en vistas ordenadas por fecha de inserción.
- Estandarización de documentación al estándar Zalantos.
- Actualización de `.env.example` (eliminado token real, agregadas variables detectadas).
- Documentación canónica movida a `docs/`.
