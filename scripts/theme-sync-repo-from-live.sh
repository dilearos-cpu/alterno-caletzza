#!/usr/bin/env bash
# Sincroniza el repo con el tema LIVE actual (fuente de verdad).
# No sube nada a Shopify. Úsalo cuando el repo se haya desfasado del live.
set -euo pipefail
cd "$(dirname "$0")/.."

THEME_ENV="${THEME_ENV:-production}"
LIVE_THEME_ID="${LIVE_THEME_ID:-148217954454}"
SNAP_DIR="${SNAP_DIR:-$(mktemp -d /tmp/caletzza-live-snap.XXXXXX)}"

echo "→ Descargando tema LIVE #${LIVE_THEME_ID} en ${SNAP_DIR}"
mkdir -p "$SNAP_DIR"
cp shopify.theme.toml "$SNAP_DIR/" 2>/dev/null || true

npx shopify theme pull -e "$THEME_ENV" -t "$LIVE_THEME_ID" --path "$SNAP_DIR" --force

THEME_DIRS=(assets sections snippets layout templates config locales)
for dir in "${THEME_DIRS[@]}"; do
  if [[ -d "$SNAP_DIR/$dir" ]]; then
    echo "→ Sync $dir/"
    rm -rf "$dir"
    cp -a "$SNAP_DIR/$dir" "$dir"
  fi
done

# Archivos sueltos del tema en raíz (si existen)
for f in .shopifyignore; do
  if [[ -f "$SNAP_DIR/$f" ]]; then
    # Conservamos el .shopifyignore del repo (política de deploy), no el del pull.
    :
  fi
done

echo "✓ Repo sincronizado desde LIVE #${LIVE_THEME_ID}"
echo "  Revisa con: git status"
echo "  Luego: git add assets sections snippets layout templates config locales && git commit"
