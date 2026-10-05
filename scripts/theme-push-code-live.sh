#!/usr/bin/env bash
# Sube SOLO código al tema LIVE de Caletzza.
# SOLO usar si el merchant lo pide explícitamente.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${ALLOW_THEME_LIVE_PUSH:-}" != "1" ]]; then
  echo "✖ Push al live bloqueado."
  echo "  Por defecto usamos borrador: npm run theme:push:code"
  echo "  Live solo con: ALLOW_THEME_LIVE_PUSH=1 npm run theme:push:code:live"
  exit 1
fi

THEME_ENV="${THEME_ENV:-production}"

PROTECTED=(
  "config/**"
  "templates/**"
  "sections/header-group.json"
  "sections/footer-group.json"
  "sections/discount-rules-group.json"
  "sections/*-group.json"
  "locales/*.schema.json"
)

IGNORE_FLAGS=()
for path in "${PROTECTED[@]}"; do
  IGNORE_FLAGS+=(--ignore "$path")
done

echo "→ Subiendo código al LIVE. Entorno: ${THEME_ENV}"
echo "  Protegido: templates (banners), config, header/footer, reglas de precio."

npx shopify theme push -e "$THEME_ENV" --allow-live --nodelete --json "${IGNORE_FLAGS[@]}"

echo "✓ Código subido al live. Banners y personalización del editor NO fueron modificados."
