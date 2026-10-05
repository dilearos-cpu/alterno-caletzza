# Mercado Libre Express (checkout in-modal)

Pago con **Mercado Pago Checkout API / Payment Brick** dentro del modal de las landings.
El comprador **no** va al checkout nativo de Shopify. Al aprobarse el pago, la app crea un pedido **pagado** en Shopify etiquetado como metodo offline **Mercado Libre Express**.

## Flujo

```
Landing → Comprar ahora → Modal express
  → datos de envio
  → Payment Brick (Mercado Pago)
  → POST action=mercadopago_pay
  → MP /v1/payments (approved)
  → draftOrderCreate + draftOrderComplete(paymentPending: false)
  → Pedido Shopify PAID + tags MercadoLibre-Express / MP-Paid
```

## 1. Credenciales Mercado Pago

En [Mercado Pago Developers](https://www.mercadopago.com.co/developers) crea (o usa) una aplicacion y copia:

| Variable | Donde |
|----------|--------|
| `MERCADOPAGO_ACCESS_TOKEN` | Credenciales de produccion (o test) — **solo servidor** |
| `MERCADOPAGO_PUBLIC_KEY` | Public Key — se expone al Brick del theme |
| `MERCADOPAGO_SHOPIFY_GATEWAY_NAME` | Opcional. Default: `Mercado Libre Express` |

Agregalas en Render (o tu host) al servicio `cod-express-app` y redespliega.

## 2. Metodo de pago offline en Shopify

En la tienda (**solo DEV** si estas probando ahi):

1. **Admin → Configuracion → Pagos → Metodos de pago manuales**
2. Agrega un metodo llamado exactamente: `Mercado Libre Express`
3. Guarda

El pedido se marca como **pagado** via Admin API. Tags/atributos:

- `MercadoLibre-Express`, `MP-Paid`, `Pack-Express`
- `payment_method` = `Mercado Libre Express`
- `mp_payment_id` = id del pago en Mercado Pago

## 3. Theme: un metodo por landing

En el editor, seccion Pack Bodys / Pack Basicas → **Metodo(s) de pago en el express**:

| Valor | Que muestra |
|-------|-------------|
| `Solo contra entrega (COD)` | Solo COD |
| `Solo Mercado Libre Express (Brick)` | Solo Brick ML (recomendado para digitar solo ML) |
| `COD + Mercado Libre Express` | Selector con ambos |
| `COD + checkout Shopify (invoice legacy)` | COD + invoice nativo (comportamiento viejo) |

Templates del repo:

- `page.landing-bodys-x4.json` → `mercadopago`
- `page.landing-basicas-x10.json` → `cod`

## 4. Probar en DEV

1. Credenciales MP + redeploy app
2. Sube theme a `tienda-dev-cuunda` (no tocar produccion Caletzza)
3. Abre landing Bodys → arma pack → Comprar ahora
4. Completa datos → Brick → paga (tarjeta de prueba si usas sandbox)
5. Verifica Admin → Pedidos: pagado, tags `MercadoLibre-Express`

## Notas

- Pagos `pending` / `in_process` (ej. PSE) **no** crean pedido hasta `approved`. El modal avisa.
- Webhooks de acreditacion diferida se pueden agregar despues (`/webhooks/mercadopago`).
- Nunca uses `caletzza.myshopify.com` para pruebas de este flujo salvo peticion explicita.
