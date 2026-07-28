export async function cargarDeDisco(clave) {
  try {
    const res = await fetch(`/api/datos?clave=${clave}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function guardarEnDisco(clave, datos) {
  const res = await fetch(`/api/datos?clave=${clave}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`POST /api/datos?clave=${clave} falló ${res.status}:`, body)
    throw new Error(`No se pudo guardar ${clave}`)
  }
  return res
}

export async function actualizarGastoRemoto(id, changes) {
  const res = await fetch(`/api/gastos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`PATCH /api/gastos/${id} falló ${res.status}:`, body)
    throw new Error(`No se pudo actualizar el gasto ${id}`)
  }
  return res.json()
}

export async function eliminarGastoRemoto(id) {
  const res = await fetch(`/api/gastos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`DELETE /api/gastos/${id} falló ${res.status}:`, body)
  }
}

export async function guardarPresupuestoCiclo(ciclo, datos) {
  return fetch(`/api/presupuesto/${ciclo}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  }).catch(() => {})
}
