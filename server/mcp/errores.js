// Error de una tool MCP con su `code` (validacion | no_encontrado | conflicto | duplicado | …).
// En archivo propio para que tools.js y toolsClases.js lo compartan sin import circular.
export class ErrorTool extends Error {
  constructor(code, message, data) {
    super(message)
    this.code = code
    this.data = data
  }
}
