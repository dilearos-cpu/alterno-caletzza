# Landing Bonus — Prompt para nuevo chat

Copia y pega todo el bloque siguiente en un **chat nuevo** de Cursor (proyecto WooCommerce separado).

---

## Prompt

```
Quiero desarrollar un plugin de WordPress/WooCommerce llamado **Landing Bonus**.

- **Autor:** Diego Arango
- **Text Domain:** landing-bonus
- **Slug:** landing-bonus
- **Versión inicial:** 1.0.0
- **Requisitos:** WordPress 6.0+, WooCommerce 8.0+, PHP 8.0+

### Objetivo

Replicar en WooCommerce las funcionalidades de conversión que ya existen en las landing pages de Shopify (Caletzza), para usarlas en landings de Elementor / páginas de pack.

### Módulos obligatorios (v1)

1. **Checkout COD Modal** — Al pulsar "Comprar" en un pack, abrir modal estilo EasySell (no redirigir al checkout clásico). Crear pedido WooCommerce con método de pago COD, campos de envío Colombia, resumen con subtotal + IVA + envío, envío gratis configurable, mensaje de éxito.

2. **Barra progreso + contador 24h** — Timer persistente (localStorage) + barra que sube % según slots llenos del pack. Colores rojo/amarillo/verde. Mensaje al 100%. Sincronización con el pack builder vía JS global.

3. **Recuadro estrellas Google** — Badge ⭐⭐⭐⭐⭐ + "más de X clientes felices". Título opcional, animación leve, todo configurable desde admin.

4. **Botón flotante estilo RSI** — Fijo en página + copia flotante abajo al pasar el botón comprar del pack. Shake, enlace personalizable, colores/borde/icono.

5. **Popup prueba social** — Toast "{nombre} ha comprado un {pack} hace {tiempo} en {ciudad}". Intervalos, ciudades, nombres, campañas por shortcode.

### Entregables

- Plugin instalable (`landing-bonus/landing-bonus.php`)
- Panel de administración (Ajustes → Landing Bonus)
- Shortcodes documentados para Elementor
- Assets CSS/JS propios, sin jQuery si es posible
- Hooks/filtros para extensibilidad
- readme.txt estilo WordPress.org

### Referencia de implementación Shopify (paridad funcional)

El comportamiento ya está probado en este repo Shopify. Usar como spec:

| Módulo WC | Archivos referencia Shopify |
|---|---|
| COD Modal | `assets/pack-cod-checkout.js`, `snippets/pack-cod-modal.liquid`, `cod-express-app/server.js` |
| Barra + contador | `sections/promo-countdown.liquid`, `assets/promo-countdown.js` |
| Recuadro Google | `sections/google-rating-badge.liquid` |
| Botón RSI | `sections/pack-cta-button.liquid`, `assets/pack-cta-button.js` |
| Prueba social | `sections/social-proof-popup.liquid`, `assets/social-proof-popup.js` |

### Shortcodes propuestos

- `[landing_bonus_countdown units="4"]`
- `[landing_bonus_google_badge]`
- `[landing_bonus_floating_button]`
- `[landing_bonus_social_proof]`
- El pack builder y COD modal se enganchan al botón `.landing-bonus-pack-buy` o shortcode `[landing_bonus_pack]`

### Integración pack + COD

El pack builder puede ser shortcode `[landing_bonus_pack collection="slug" slots="4"]` o integrarse con pack existente del sitio. Al completar slots y pulsar comprar → `LandingBonus.openCodModal(cartItems)`.

### Empieza por

1. Scaffold del plugin (header WP, autoload, activación)
2. Clase settings en admin con tabs por módulo
3. Módulo COD Modal (prioridad máxima)
4. Resto de módulos en orden
5. Documentación de instalación

Trabaja en español. Commits claros. No uses código de Shopify copiado literal: adapta a APIs de WooCommerce (`wc_create_order`, payment gateways, etc.).
```

---

## Notas para el nuevo chat

- Abre un **repositorio o carpeta nueva** solo para WordPress (no mezclar con el theme Shopify).
- Adjunta o enlaza este archivo y `SPEC-FUNCIONAL.md` del mismo directorio.
- Si ya tienes pack builder WooCommerce en el sitio, indica su selector/clase del botón comprar.
