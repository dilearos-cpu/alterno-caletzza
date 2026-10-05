# Landing Bonus — Especificación funcional (WooCommerce)

**Plugin:** Landing Bonus  
**Autor:** Diego Arango  
**Paridad con:** Landing Caletzza (Shopify theme `Dawn + Packs + COD Express`)

---

## 1. Checkout COD Modal

### Comportamiento
- Al pulsar **Comprar ahora** con el pack completo → abre modal fullscreen/lightbox (no sale de la landing).
- Formulario: nombre, teléfono, email, departamento, ciudad, dirección, notas.
- Resumen lateral: líneas del pack, subtotal, IVA (% configurable), envío, total.
- Envío gratis si subtotal ≥ umbral → mostrar **"Te obsequiamos el envío"**.
- IVA: mostrar en UI pero no duplicar línea manual en el pedido WC (subtotal productos + envío; impuestos según config WC).
- Al confirmar → crear pedido `wc_create_order()` con estado `pending` y método **COD** (Contra entrega).
- Pantalla de éxito centrada con número de pedido.
- Opcional v2: botón pago online (redirigir a checkout WC con productos en carrito).

### Admin
- Título/subtítulo del modal
- % IVA, costo envío fijo, umbral envío gratis
- Colores acento
- Campos obligatorios on/off
- Email de notificación

### Técnico WC
```php
// Hook AJAX
add_action('wp_ajax_landing_bonus_create_cod_order', '...');
add_action('wp_ajax_nopriv_landing_bonus_create_cod_order', '...');
```
- Validar nonce
- `WC_Order::add_product()` por cada ítem del pack
- `set_payment_method('cod')` o gateway custom
- Guardar meta `_landing_bonus_source` = pack

### Referencia Shopify
- `assets/pack-cod-checkout.js`
- `snippets/pack-cod-modal.liquid`
- `cod-express-app/server.js` (lógica totales)

---

## 2. Barra progreso + contador 24h

### Comportamiento
- Contador h:m:s con duración configurable (default 24h).
- Persistencia en `localStorage` (clave por página/shortcode id).
- Barra 0–100% = `slots_llenos / unidades_objetivo`.
- Colores: &lt;50% rojo, 50–99% amarillo, 100% verde.
- Al 100%: mensaje personalizado; clic en barra = mismo evento que comprar pack.
- API JS global:
```js
window.LandingBonusCountdown = {
  setSlotsFilled(n) {},
  resetSlots() {}
};
```
- El pack builder llama `setSlotsFilled` al llenar/borrar slots.

### Admin / shortcode
`[landing_bonus_countdown id="promo1" units="4" hours="24"]`

| Setting | Descripción |
|---|---|
| units | Unidades para 100% (4, 10…) |
| duration_hours | Duración timer |
| progress_prefix/suffix | "Llevas" / "completado" |
| completion_message | Texto al 100% |
| colors low/mid/high | Colores barra |
| timer_number_size | Tamaño números |
| timer_label_size | Tamaño "horas", "minutos"… |

### Referencia Shopify
- `sections/promo-countdown.liquid`
- `assets/promo-countdown.js`

---

## 3. Recuadro estrellas Google

### Comportamiento
- Card blanco, borde gris, sombra suave.
- 5 estrellas SVG doradas.
- Texto: `{prefix} {numero} {frase}` → "mas de **5.000** clientes felices".
- Título opcional arriba (tamaño y alineación).
- Animación flotación leve (`prefers-reduced-motion` respetado).

### Shortcode
`[landing_bonus_google_badge]`

| Setting | Default |
|---|---|
| prefix_text | mas de |
| customer_count | 5.000 |
| phrase_text | clientes felices |
| show_heading | false |
| heading_text | — |
| heading_font_size | 24px |
| phrase_font_size | 16px |
| enable_animation | true |

### Referencia Shopify
- `sections/google-rating-badge.liquid`

---

## 4. Botón flotante estilo RSI

### Comportamiento
- Botón inline donde se coloca el shortcode.
- Segundo botón en contenedor `position:fixed; bottom:0` (oculto por defecto).
- Aparece flotante cuando el usuario scrollea **más allá** del botón "Comprar" del pack (`float_trigger: pack_buy`).
- Desaparece al volver a ver el botón comprar.
- Animación shake en versión flotante.
- Acción por defecto: **enlace URL** (no checkout).
- Opciones: enlace, scroll al pack, disparar compra pack.

### Shortcode
`[landing_bonus_floating_button url="/mi-pagina" label="Compra aqui | Paga en casa"]`

| Setting | Descripción |
|---|---|
| position_mode | fixed / fixed_floating |
| float_trigger | pack_buy / cta_section |
| button_background_color | #FFDE21 |
| border, radius, icon | Estilo RSI |
| section_background_color | Fondo sección |
| floating_background_color | Fondo barra inferior |

### Referencia Shopify
- `sections/pack-cta-button.liquid`
- `assets/pack-cta-button.js`

---

## 5. Popup prueba social

### Comportamiento
- Toast esquina (default bottom-left).
- Mensaje: `{name} ha comprado un {pack} hace {time} en {city}`.
- Delay inicial, intervalo min–max aleatorio, duración visible.
- Lista ciudades Colombia, nombres, frases de tiempo.
- Campañas múltiples por `shortcode_id` (pack 4 uds, pack 10 uds…).
- Cerrar manual + auto-hide.
- Mobile/desktop toggle.

### Shortcode
`[landing_bonus_social_proof pack_label="pack de básicas" units="10"]`

### Referencia Shopify
- `sections/social-proof-popup.liquid`
- `assets/social-proof-popup.js`

---

## Estructura de archivos propuesta

```
landing-bonus/
├── landing-bonus.php
├── readme.txt
├── includes/
│   ├── class-landing-bonus.php
│   ├── class-admin-settings.php
│   ├── class-assets.php
│   ├── class-shortcodes.php
│   ├── modules/
│   │   ├── class-module-cod-modal.php
│   │   ├── class-module-countdown.php
│   │   ├── class-module-google-badge.php
│   │   ├── class-module-floating-button.php
│   │   └── class-module-social-proof.php
│   └── ajax/
│       └── class-ajax-cod-order.php
├── assets/
│   ├── css/
│   └── js/
├── templates/
│   ├── cod-modal.php
│   └── admin-settings.php
└── languages/
    └── landing-bonus.pot
```

---

## Panel admin (tabs)

1. **General** — Activar módulos on/off
2. **COD Modal** — IVA, envío, textos, colores
3. **Contador** — Defaults globales
4. **Google Badge** — Defaults
5. **Botón flotante** — Defaults
6. **Prueba social** — Ciudades, nombres, plantilla
7. **Shortcodes** — Documentación copiable

---

## Hooks para desarrolladores

```php
do_action('landing_bonus_before_cod_order', $cart_items, $customer_data);
do_action('landing_bonus_after_cod_order', $order_id);
apply_filters('landing_bonus_cod_shipping_cost', $cost, $subtotal);
apply_filters('landing_bonus_social_proof_message', $message, $campaign);
```

---

## Checklist v1

- [ ] Plugin activable sin errores
- [ ] COD modal crea pedido WC real
- [ ] Contador sincroniza con pack
- [ ] 5 shortcodes funcionan en Elementor
- [ ] Responsive mobile
- [ ] Traducible (text domain)
- [ ] Nonces y sanitización
- [ ] readme.txt

---

## Fuera de alcance v1 (v2)

- Pack builder completo (asumir shortcode existente o tema)
- Pago Mercado Pago embebido
- Editor Gutenberg blocks (solo shortcodes v1)
- Multisite
