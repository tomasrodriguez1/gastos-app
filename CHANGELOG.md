# Changelog

## Unreleased

- Fix: el FGP solo propone mover al fondo TC los gastos confirmados e impagos del ciclo financiero actual; excluye ciclos ya cerrados y cargos ya pagados también en la API.
- Navegación reorganizada por tarea: grupos para el día, planificación y análisis en desktop; barra mobile con acceso rápido para registrar gastos, bandeja priorizada y menú de secciones secundarias.
- Vista `/agente`: layout en dos columnas (chat a la izquierda, bandeja a la derecha en desktop; en móvil el chat queda arriba).
- Agente conversacional: triage de bandeja (`resumir_bandeja`, filtros/offset), consultas de solo lectura del ciclo (`resumen_ciclo`, `buscar_gastos`) y aviso server-side de duplicados al crear un gasto (`buscarSimilares` + `ignorar_duplicado`). El agente sigue sin confirmar gastos.
- Nueva página `/log`: log de últimos gastos ingresados (todos los meses, ordenado por `created_at`), con resaltado de gastos nuevos desde la última visita y edición/borrado inline. Acceso desde botón "Log" en `/gastos`.
- Fix: `useGastosLocales.agregar()` generaba `created_at` en un formato inconsistente con el que devuelve el servidor, lo que podía hacer que un gasto manual recién creado se ordenara antes de tiempo en vistas ordenadas por fecha de inserción.
- Estandarización de documentación al estándar Zalantos.
- Actualización de `.env.example` (eliminado token real, agregadas variables detectadas).
- Documentación canónica movida a `docs/`.

- Fix: `useGastosLocales.agregar()` generaba `created_at` en un formato inconsistente con el que devuelve el servidor, lo que podía hacer que un gasto manual recién creado se ordenara antes de tiempo en vistas ordenadas por fecha de inserción.
- Estandarización de documentación al estándar Zalantos.
- Actualización de `.env.example` (eliminado token real, agregadas variables detectadas).
- Documentación canónica movida a `docs/`.
