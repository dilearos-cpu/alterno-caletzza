#!/usr/bin/env bash
# Sube SOLO código a un borrador versionado Caletzza 1.0.0.N
#
# Flujo seguro:
#   1) Duplica el tema LIVE (copia completa: templates, banners, settings)
#   2) Sube solo liquid/css/js a esa copia
# Así el borrador se puede previsualizar y publicar sin romper la tienda.
#
# Nunca publica solo. Tú activas el borrador en Admin → Temas.
set -euo pipefail
cd "$(dirname "$0")/.."

THEME_ENV="${THEME_ENV:-production}"
VERSION_FILE=".theme-draft-version"
LIVE_THEME_ID="${LIVE_THEME_ID:-148217954454}"
LIVE_THEME_NAME="${LIVE_THEME_NAME:-Caletzza Theme (migrado dem 2026-08-16)}"

if [[ "${ALLOW_THEME_LIVE_PUSH:-}" == "1" ]]; then
  echo "⚠ ALLOW_THEME_LIVE_PUSH=1 → redirigiendo a push live."
  exec bash scripts/theme-push-code-live.sh
fi

# Versión actual → próximo 4º segmento
if [[ -n "${DRAFT_THEME_VERSION:-}" ]]; then
  NEXT_VERSION="$DRAFT_THEME_VERSION"
else
  CURRENT="1.0.0.0"
  if [[ -f "$VERSION_FILE" ]]; then
    CURRENT="$(tr -d '[:space:]' < "$VERSION_FILE")"
  fi
  # Solo 4 segmentos: 1.0.0.N — el último campo NO debe absorber resto
  A="$(echo "$CURRENT" | cut -d. -f1)"
  B="$(echo "$CURRENT" | cut -d. -f2)"
  C="$(echo "$CURRENT" | cut -d. -f3)"
  D="$(echo "$CURRENT" | cut -d. -f4)"
  A="${A:-1}"
  B="${B:-0}"
  C="${C:-0}"
  D="${D:-0}"
  D=$((10#$D + 1))
  NEXT_VERSION="${A}.${B}.${C}.${D}"
fi

DRAFT_THEME_NAME="Caletzza ${NEXT_VERSION}"

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

echo "→ Creando borrador desde LIVE: «${LIVE_THEME_NAME}» (#${LIVE_THEME_ID})"
echo "  Nombre nuevo: «${DRAFT_THEME_NAME}»"

DUP_JSON="$(npx shopify theme duplicate -e "$THEME_ENV" -t "$LIVE_THEME_ID" -n "$DRAFT_THEME_NAME" -f -j 2>&1)"
echo "$DUP_JSON" | tail -c 1200; echo

DRAFT_ID="$(printf '%s' "$DUP_JSON" | python3 -c '
import json, sys
raw = sys.stdin.read()
start = raw.find("{")
end = raw.rfind("}")
if start < 0 or end < 0:
    raise SystemExit("No JSON in duplicate output")
data = json.loads(raw[start : end + 1])
theme = data.get("theme") or data
tid = theme.get("id") or data.get("id")
if not tid:
    # Some CLI versions nest differently
    if isinstance(data.get("theme"), dict):
        tid = data["theme"].get("id")
if not tid:
    raise SystemExit("No theme id in duplicate output: " + raw[:500])
print(tid)
')"

if [[ -z "${DRAFT_ID}" ]]; then
  echo "✖ No se pudo obtener el ID del borrador duplicado."
  exit 1
fi

echo "→ Subiendo solo código (liquid/css/js) al borrador #${DRAFT_ID}"
echo "  Protegido: templates, config, header/footer, reglas de precio."

npx shopify theme push -e "$THEME_ENV" \
  -t "$DRAFT_ID" \
  --json \
  "${IGNORE_FLAGS[@]}"

echo "$NEXT_VERSION" > "$VERSION_FILE"
echo "✓ Borrador listo: «${DRAFT_THEME_NAME}» (#${DRAFT_ID})"
echo "  Preview: https://caletzza.myshopify.com?preview_theme_id=${DRAFT_ID}"
echo "  Actívalo tú en Admin → Temas cuando quieras. NO publiques un push solo-código sin duplicar live."
