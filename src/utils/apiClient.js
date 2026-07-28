export async function apiFetch(path, options = {}) {
  const res = await fetch(path, options)
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'))
  }
  return res
}

export async function apiJson(path, options = {}) {
  const res = await apiFetch(path, options)
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = body?.error || `Error ${res.status}`
    throw new Error(message)
  }
  return body
}
