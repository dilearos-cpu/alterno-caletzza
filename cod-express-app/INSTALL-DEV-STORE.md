# COD Express — instalación en tienda dev

## Estado actual

- App **COD Express** desplegada en Dev Dashboard (org Cuunda)
- Extensión **quantity-discount** activa
- App **instalada** en `tienda-dev-cuunda.myshopify.com`
- App proxy debe apuntar a `https://theme-caletzza-sh.onrender.com/proxy/order`

## Configuración obligatoria (checkout nativo)

El carrito del tema **solo muestra** el descuento. El checkout nativo lo aplica la Shopify Function
vía descuento automático **Descuento por cantidad Caletzza**.

### 1. Render (`theme-caletzza-sh`)

| Variable | Valor |
|----------|-------|
| `SHOPIFY_SHOP_DOMAIN` | `tienda-dev-cuunda.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | Client ID del Dev Dashboard |
| `SHOPIFY_CLIENT_SECRET` | Client secret del Dev Dashboard |
| `SHOPIFY_API_SECRET` | Mismo valor que `SHOPIFY_CLIENT_SECRET` |
| `SHOPIFY_API_VERSION` | `2025-10` (soporta `functionHandle`) |
| `DISCOUNT_FUNCTION_HANDLE` | `quantity-discount` |

```bash
curl https://theme-caletzza-sh.onrender.com/health
# {"ok":true,"shop":"tienda-dev-cuunda.myshopify.com",...}

curl https://theme-caletzza-sh.onrender.com/discount-status
# discountStatus debe ser "ACTIVE" tras la primera visita al carrito
```

### 2. App proxy (Dev Dashboard / `shopify.app.toml`)

| Campo | Valor |
|-------|-------|
| **Proxy URL** | `https://theme-caletzza-sh.onrender.com/proxy/order` |
| **Subpath** | `cod-express` |
| **Prefix** | `apps` |

Rutas que deben responder:

- `POST /apps/cod-express/sync-rules` → guarda metafield + activa descuento automático
- `POST /apps/cod-express/order` → checkout COD express

Tras cambiar el proxy, publica la versión de la app y reinstala si hace falta.

### 3. Desplegar Function

```bash
cd cod-express-app
npm install
npx shopify app deploy --allow-updates
```

### 4. Verificar en Admin

1. **Apps** → COD Express instalada
2. **Descuentos** → **Descuento por cantidad Caletzza** en estado **Activo**
3. Colección `bodys` con productos BODY (si no existe, el servidor usa fallback `title:BODY*`)
4. Carrito → Network `sync-rules` → `200` con `discountStatus: "ACTIVE"`
5. **Pagar** → checkout nativo muestra descuento por línea

## Flujo

1. Tema emite reglas JSON (`data-discount-rules`)
2. `discount-rules-cart.js` POST a `/apps/cod-express/sync-rules`
3. App escribe metafield `caletzza.discount_rules` (con `product_ids` resueltos)
4. App crea/activa descuento automático ligado a Function `quantity-discount`
5. Checkout nativo ejecuta la Function → aplica «Descuento por cantidad»

## Comandos útiles

```bash
cd cod-express-app
npx shopify app deploy --allow-updates
npx shopify app info
curl https://theme-caletzza-sh.onrender.com/discount-status
```
