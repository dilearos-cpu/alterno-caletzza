# Descuentos en checkout nativo

La extension `quantity-discount` aplica en el **checkout nativo de Shopify** las reglas del tema.

## Tiendas no-Plus (caletzza producción)

Shopify **no permite activar Functions desde custom apps** en planes distintos de Plus.
En ese caso el flujo es **checkout por borrador (draft invoice)**:

1. El tema sincroniza reglas → `shop.caletzza.discount_rules` (metafield de respaldo).
2. El carrito calcula descuentos en el cliente (motor local + preview API).
3. Al pulsar **Pagar**, si la Function no está ACTIVE, se crea un `draftOrder` con `appliedDiscount` y redirige a `invoiceUrl`.
4. COD Express aplica el mismo descuento al crear pedidos express.

Verificar estado:

```bash
curl "https://theme-caletzza-sh.onrender.com/discount-status?shop=caletzza.myshopify.com"
# checkoutMode: "draft_invoice" | rulesSource: "shop_metafield"
```

Reintentar activación (fallará en no-Plus, pero confirma el modo):

```bash
curl -X POST "https://theme-caletzza-sh.onrender.com/activate-discount" \
  -H "Content-Type: application/json" \
  -d '{"shop":"caletzza.myshopify.com"}'
```

## Flujo Plus / dev (Function nativa)

1. Cada regla del tema usa `filter_type: tag` (ej. `caletzza-bodys`, `caletzza-basicas`).
2. Los productos de esas colecciones llevan el tag correspondiente.
3. Sync guarda reglas en `$app.discount_rules` **sin** listas de `product_ids`.
4. `$app.function_input` expone `{ "ruleTags": [...], "collectionIds": [] }`.
5. La Function pregunta `hasTags(tags: $ruleTags)` por linea de carrito.

Esto escala a colecciones grandes (Basicas ~1000) porque no enumera IDs.

## Despliegue

```bash
cd cod-express-app
npx shopify app deploy -c cod-express-dev --allow-updates --message "Native hasTags discounts"
```

## Rollback a v9 (product_ids / prefijos)

```bash
cd cod-express-app
npx shopify app release -c cod-express-dev --version cod-express-dev-9 --allow-updates --allow-deletes
```

Luego restaurar en `shop.caletzza.discount_rules` la lista de IDs de Bodies si hace falta.

## Tags usados en tienda dev

| Regla | Tag |
|-------|-----|
| Bodys | `caletzza-bodys` |
| Basicas | `caletzza-basicas` |

## Probar

1. 4 Bodies → $30.000/u
2. 4 Camisetas Basicas → $18.000/u
3. Mixto 4+4 → ambos descuentos en carrito y checkout
4. En no-Plus: checkout redirige a invoiceUrl con descuento aplicado
