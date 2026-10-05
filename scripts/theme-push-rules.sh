#!/usr/bin/env bash
# Sube SOLO la configuracion de reglas de precio (discount-rules-group.json).
# Requiere ALLOW_THEME_RULES_OVERWRITE=1 — no ejecutar en live sin solicitud explícita.
set -euo pipefail
cd "$(dirname "$0")/.."

RULES_FILE="sections/discount-rules-group.json"
if [[ ! -f "$RULES_FILE" ]]; then
  echo "✗ No existe $RULES_FILE"
  exit 1
fi

if [[ "${ALLOW_THEME_RULES_OVERWRITE:-}" != "1" ]]; then
  echo "✗ Bloqueado: subir reglas de precio sobrescribe lo configurado en el editor del tema."
  echo "  Si el usuario lo pidió explícitamente, ejecuta:"
  echo "  ALLOW_THEME_RULES_OVERWRITE=1 npm run theme:push:rules"
  exit 1
fi

echo "→ Subiendo reglas de precio ($RULES_FILE)..."
npx shopify theme push -e default -t "Caletzza Theme" --allow-live --json \
  --only "$RULES_FILE"

echo "✓ Reglas de precio subidas."
