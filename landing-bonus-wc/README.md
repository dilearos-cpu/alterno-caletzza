# Landing Bonus (WooCommerce)

Plugin de conversión para landings de pack — **autor Diego Arango**.

Replica en WordPress/WooCommerce las herramientas de las landing Caletzza (Shopify):

| Módulo | Descripción |
|---|---|
| COD Modal | Checkout contra entrega en modal |
| Contador + barra | Timer 24h + progreso del pack |
| Google Badge | Recuadro ⭐ + clientes felices |
| Botón RSI | Flotante estilo Releasit |
| Prueba social | Popup de compras recientes |

## Documentos

- **[CHAT-INICIO.md](./CHAT-INICIO.md)** — Prompt listo para pegar en un chat nuevo de Cursor
- **[SPEC-FUNCIONAL.md](./SPEC-FUNCIONAL.md)** — Especificación detallada por módulo

## Cómo usar este brief

1. Crea un repo o carpeta nueva solo para WordPress (ej. `landing-bonus-wp/`).
2. Abre un **chat nuevo** en Cursor con ese proyecto.
3. Pega el contenido de `CHAT-INICIO.md`.
4. Adjunta `SPEC-FUNCIONAL.md` como contexto.

## Referencia Shopify (este repo)

La implementación de referencia vive en la raíz del theme:

```
sections/promo-countdown.liquid
sections/google-rating-badge.liquid
sections/pack-cta-button.liquid
sections/social-proof-popup.liquid
assets/pack-cod-checkout.js
snippets/pack-cod-modal.liquid
```

## Autor

**Diego Arango**
