#!/usr/bin/env bash
# Subida amplia: código + liquid, pero NUNCA personalización del editor
# salvo ALLOW_THEME_CUSTOM_OVERWRITE=1 (solo si el usuario lo pide).
set -euo pipefail
cd "$(dirname "$0")/.."

THEME_ENV="${THEME_ENV:-production}"

if [[ "${ALLOW_THEME_CUSTOM_OVERWRITE:-}" == "1" ]]; then
  echo "⚠️  ALLOW_THEME_CUSTOM_OVERWRITE=1 — se subirá TODO, incluyendo:"
  echo "    • config/settings_data.json"
  echo "    • templates/*.json (banners de colección, home, etc.)"
  echo "    • header-group, footer-group, discount-rules-group"
  echo ""
  npx shopify theme push -e "$THEME_ENV" --allow-live --json
  exit 0
fi

echo "→ Subida completa SEGURA. Entorno: ${THEME_ENV}"
echo "  Protegido: config, templates JSON (banners), header/footer, reglas de precio."
echo "  Para incluir personalización: ALLOW_THEME_CUSTOM_OVERWRITE=1 npm run theme:push:full"
echo ""

npx shopify theme push -e "$THEME_ENV" --allow-live --json \
  --ignore "config/**" \
  --ignore "templates/**" \
  --ignore "sections/header-group.json" \
  --ignore "sections/footer-group.json" \
  --ignore "sections/discount-rules-group.json" \
  --ignore "sections/*-group.json" \
  --ignore "locales/*.schema.json"

echo "✓ Subida completa. Banners y contenido del editor NO fueron modificados."
