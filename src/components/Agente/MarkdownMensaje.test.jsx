import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'bun:test'
import { MarkdownMensaje } from './MarkdownMensaje.jsx'

function html(texto) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <MarkdownMensaje texto={texto} />
    </MemoryRouter>,
  )
}

test('pinta negrita, listas y un salto de línea simple', () => {
  const salida = html('Listo.\nQuedó **pendiente**.\n\n- uno\n- dos')
  expect(salida).toContain('<strong')
  expect(salida).toContain('pendiente')
  expect(salida).toContain('<br')
  expect(salida).toContain('<li')
  expect(salida).toContain('uno')
})

test('deja el signo $ como monto, no como fórmula', () => {
  const salida = html('Gastaste **$12.000** en almuerzo.')
  expect(salida).toContain('$12.000')
  expect(salida).not.toContain('<math')
})

test('arma una tabla y respeta la alineación de la columna', () => {
  const salida = html('| Comercio | Monto |\n| --- | ---: |\n| Jumbo | $45.990 |')
  expect(salida).toContain('<table')
  expect(salida).toContain('Jumbo')
  expect(salida).toContain('$45.990')
  expect(salida).toContain('text-align:right')
})

test('un bloque de código tiene lenguaje, resaltado y botón de copiar', () => {
  const salida = html('```json\n{ "monto": 12000 }\n```')
  expect(salida).toContain('json')
  expect(salida).toContain('Copiar')
  expect(salida).toContain('hljs')
  expect(salida).toContain('12000')
})

test('el código en línea no se vuelve un bloque', () => {
  const salida = html('El estado es `pendiente`.')
  expect(salida).toContain('<code')
  expect(salida).not.toContain('Copiar')
  expect(salida).toContain('pendiente')
})

test('no ejecuta HTML crudo', () => {
  const salida = html('<script>alert(1)</script>')
  expect(salida).not.toContain('<script')
  expect(salida).not.toContain('javascript:')
})

test('un enlace javascript: no queda como href', () => {
  const salida = html('[tocá](javascript:alert(1))')
  expect(salida).not.toContain('javascript:')
  expect(salida).not.toContain('<a ')
  expect(salida).toContain('tocá')
})

test('un enlace interno de la app navega dentro de la app', () => {
  const salida = html('[la bandeja](/bandeja)')
  expect(salida).toContain('href="/bandeja"')
  expect(salida).not.toContain('target="_blank"')
})

test('un enlace externo abre en otra pestaña', () => {
  const salida = html('[docs](https://example.com/ayuda)')
  expect(salida).toContain('href="https://example.com/ayuda"')
  expect(salida).toContain('target="_blank"')
  expect(salida).toContain('noopener')
})
