import { useState, useEffect, useCallback } from 'react'

export function useCatalogos() {
  const [grupos, setGrupos] = useState([])
  const [tipos, setTipos] = useState([])
  const [bancos, setBancos] = useState([])
  const [contextos, setContextos] = useState([])
  const [cargado, setCargado] = useState(false)

  const recargarGrupos = useCallback(() => {
    fetch('/api/catalogos/grupos').then(r => r.json()).then(setGrupos)
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/catalogos/grupos').then(r => r.json()),
      fetch('/api/catalogos/tipos').then(r => r.json()),
      fetch('/api/catalogos/bancos').then(r => r.json()),
      fetch('/api/catalogos/contextos').then(r => r.json()),
    ]).then(([g, t, b, ctx]) => {
      setGrupos(g)
      setTipos(t.map(x => x.id))
      setBancos(b.map(x => x.id))
      setContextos(ctx.map(x => x.id))
      setCargado(true)
    }).catch(() => setCargado(true))
  }, [])

  // Derived: GRUPOS_PRESUPUESTO shape { grupo: [subcats] }
  const gruposPresupuesto = Object.fromEntries(
    grupos.map(g => [g.id, g.subcategorias.map(s => s.nombre)])
  )

  return { grupos, gruposPresupuesto, tipos, bancos, contextos, cargado, recargarGrupos }
}
