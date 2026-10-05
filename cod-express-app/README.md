# COD Express — checkout contra entrega para Pack Bodys

App minima estilo **EasySell COD Form**: el theme abre un formulario express y esta app crea el pedido en Shopify como **pago pendiente (COD)** sin salir de la landing.

## Arquitectura

```
Pack Bodys → Comprar ahora → Modal COD (theme)
  → POST /apps/cod-express/order (app proxy)
  → draftOrderCreate + draftOrderComplete(paymentPending: true)
  → Pedido real en Admin + pantalla de gracias en el theme
```

## 1. Desplegar la app

```bash
cd cod-express-app
npm install
cp .env.example .env
```

Configura `.env`:

| Variable | Descripcion |
|----------|-------------|
| `SHOPIFY_SHOP_DOMAIN` | `caletzza.myshopify.com` |
| `SHOPIFY_ADMIN_API_TOKEN` | Token de app personalizada o instalada |
| `SHOPIFY_API_SECRET` | Client secret de la app (para validar app proxy) |

Scopes requeridos: `write_draft_orders`, `write_orders`, `read_products`, `write_discounts`, `read_discounts`.

Para descuentos en checkout nativo, despliega tambien la extension `extensions/quantity-discount`. Ver [NATIVE-CHECKOUT-DISCOUNTS.md](NATIVE-CHECKOUT-DISCOUNTS.md).

Despliega el servidor (Railway, Render, Fly.io, etc.) y actualiza `shopify.app.toml` con tu URL.

## 2. Instalar en la tienda

```bash
shopify app config link
shopify app deploy
```

O crea una **app personalizada** en Admin → Configuración → Apps y canales de ventas → Desarrollar apps, con los scopes anteriores.

Configura **App proxy** en la app:

| Campo | Valor |
|-------|-------|
| Subpath prefix | `apps` |
| Subpath | `cod-express` |
| Proxy URL | `https://TU_HOST/proxy/order` |

## 3. Theme

El theme ya incluye:

- `snippets/pack-cod-modal.liquid`
- `assets/pack-cod-checkout.js` / `.css`
- Integracion en `sections/pack-bodys4.liquid`

Sube el theme:

```bash
npm run theme:push
```

En el editor del theme, seccion **Pack Bodys 4** → **Checkout express COD**:

- Activar checkout COD
- URL app proxy: `/apps/cod-express/order`
- Costo de envio (en centavos Shopify)

## 4. Probar

1. Arma un pack completo en la landing.
2. Clic en **Comprar ahora**.
3. Completa el formulario COD.
4. Debe aparecer confirmacion con numero de pedido.
5. Verifica en Admin → Pedidos (estado: pago pendiente).

## Fallback

Si la app no responde, el formulario muestra **Continuar al checkout de Shopify** (opcional en settings).

## Mercado Libre Express

Pago in-modal (Payment Brick) sin checkout nativo. Ver [MERCADOLIBRE-EXPRESS.md](MERCADOLIBRE-EXPRESS.md).

## Desarrollo local

```bash
ALLOW_UNSIGNED_PROXY=true npm run dev
```

Para probar sin proxy, POST directo a `http://localhost:3000/order`.
