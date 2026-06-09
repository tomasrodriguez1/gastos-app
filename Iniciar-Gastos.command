#!/bin/zsh
# Lanzador de Gastos App — doble clic desde el Escritorio

# Finder no carga .zshrc; exponer bun y herramientas de Homebrew manualmente
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"

APP_DIR="/Users/tomasrodriguez/Desktop/Gastos/gastos-app"

cd "$APP_DIR" || {
  echo "Error: no se encontró el directorio $APP_DIR"
  read -r "?Presiona Enter para cerrar..."
  exit 1
}

command -v bun >/dev/null 2>&1 || {
  echo "Error: 'bun' no está en PATH."
  echo "Instálalo en https://bun.sh o ajusta el PATH en este script."
  read -r "?Presiona Enter para cerrar..."
  exit 1
}

# Esperar hasta que Vite responda antes de abrir el navegador
(
  until curl -s "http://localhost:6001" >/dev/null 2>&1; do
    sleep 0.5
  done
  open "http://localhost:6001"
) &

echo "────────────────────────────────────────"
echo "  Gastos App — iniciando..."
echo "  API  → http://localhost:3001"
echo "  App  → http://localhost:6001"
echo "  Ctrl+C para detener"
echo "────────────────────────────────────────"

bun run dev

read -r "?Presiona Enter para cerrar..."
