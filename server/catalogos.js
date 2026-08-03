// Carga de catálogos reales (tipos, contextos, bancos, grupos/subcategorías)
// para que ningún clasificador automático —Groq en la ingesta de mail, o el
// agente conversacional— pueda producir un valor fuera del catálogo.
// cargarCatalogos() vivía como función privada en server/ingesta.js; se
// extrajo acá para que el agente (server/agente.js) la comparta sin duplicar
// las queries.

import sql from './db/client.js'

export async function cargarCatalogos() {
  const [tipos, contextos, bancos, grupos, subcategorias] = await Promise.all([
    sql`SELECT nombre FROM catalogo_tipo ORDER BY orden`,
    sql`SELECT nombre FROM catalogo_contexto ORDER BY orden`,
    sql`SELECT nombre FROM catalogo_banco ORDER BY orden`,
    sql`SELECT id, nombre FROM catalogo_grupo ORDER BY orden`,
    sql`SELECT id, grupo_id, nombre FROM catalogo_subcategoria ORDER BY grupo_id, orden`,
  ])

  return {
    tipos: tipos.map(t => t.nombre),
    contextos: contextos.map(c => c.nombre),
    bancos: bancos.map(b => b.nombre),
    grupos: grupos.map(g => ({
      id: g.id,
      nombre: g.nombre,
      subcategorias: subcategorias
        .filter(s => s.grupo_id === g.id)
        .map(s => ({ id: s.id, nombre: s.nombre })),
    })),
  }
}
