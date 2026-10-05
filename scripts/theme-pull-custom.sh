#!/usr/bin/env bash
# Descarga la personalización hecha en el editor (banners, imágenes, textos).
# No sube nada; solo trae al repo lo que hay en live para respaldo/local.
# Temporalmente aparta .shopifyignore para poder bajar templates ignorados en push.
set -euo pipefail
cd "$(dirname "$0")/.."

THEME_ENV="${THEME_ENV:-production}"
IGNORE_BACKUP=""

cleanup() {
  if [[ -n "${IGNORE_BACKUP:-}" && -f "${IGNORE_BACKUP}" ]]; then
    mv "${IGNORE_BACKUP}" .shopifyignore
    echo "→ .shopifyignore restaurado."
  fi
}
trap cleanup EXIT

if [[ -f .shopifyignore ]]; then
  IGNORE_BACKUP="$(mktemp /tmp/shopifyignore.XXXXXX)"
  mv .shopifyignore "${IGNORE_BACKUP}"
  echo "→ .shopifyignore apartado temporalmente para permitir pull de templates."
fi

echo "→ Descargando personalización del tema live (entorno: ${THEME_ENV})..."
npx shopify theme pull -e "$THEME_ENV" --live \
  --only "config/*.json" \
  --only "templates/*.json" \
  --only "sections/header-group.json" \
  --only "sections/footer-group.json" \
  --only "sections/discount-rules-group.json"

echo "✓ Listo. Revisa con: git diff config/ templates/ sections/"
echo "  Recuerda: estos JSON no se suben con theme:push:code (protegidos)."
