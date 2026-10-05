# Caletzza Theme

Sub-repositorio del theme de Shopify para [caletzza.myshopify.com](https://caletzza.myshopify.com). Fusiona una interfaz de tienda de lencería con las funcionalidades personalizadas de Caletzza (pack builder, COD, prueba social).

## Inspiración visual

- Paleta cálida: marrón `#502f1d`, rosa `#d3aba9`, grises suaves
- Tipografías Poppins (cuerpo) y Rubik (títulos)
- Barra marquee superior, beneficios de envío, grid de categorías
- Colecciones con tabs, banners divididos, barra móvil inferior
- Tarjetas de producto con ratio vertical e imagen hover

## Funcionalidades Caletzza conservadas

| Funcionalidad | Archivos principales |
|---|---|
| Pack Básicas (10 diseños) | `sections/pack-basicas.liquid` |
| Pack Bodys x4 | `sections/pack-bodys4.liquid` |
| Checkout express COD | `snippets/pack-cod-modal.liquid`, `cod-express-app/` |
| Segunda imagen por variante | `snippets/variant-second-image-url.liquid` |
| Popup prueba social | `sections/social-proof-popup.liquid` |
| Countdown promocional | `sections/promo-countdown.liquid`, `sections/progress-bar.liquid` |
| Testimonios | `sections/testimonials-section.liquid` |
| Landings pack | `templates/index.json`, `templates/page.landing-*.json` |

## Templates

| Template | Uso |
|---|---|
| `index.caletzza-store.json` | Homepage tienda estilo Caletzza (borrador) |
| `index.json` | Landing Pack Básicas (funcionalidad actual) |
| `page.landing-basicas-x10.json` | Landing pack básicas |
| `page.landing-bodys-x4.json` | Landing pack bodys |

## Requisitos

- Node.js 22+
- Acceso de administrador o permisos de **Temas** en la tienda

## Comandos

```bash
# Listar temas de la tienda
npm run theme:list

# Vista previa en vivo (hot reload)
npm run theme:dev

# Subir como BORRADOR (no publica)
npm run theme:push:draft

# Validar el theme
npm run theme:check

# Deploy habitual (código: liquid, js, css) — NO toca reglas ni personalización del editor
npm run theme:push:code

# Subida amplia segura — mismas protecciones que push:code
npm run theme:push:full
```

### Protección de personalización y reglas de precio

Por defecto **no se sobrescriben** al subir el tema:

- Ajustes del editor (`config/settings_data.json`)
- Templates JSON (home, colecciones, etc.)
- Cabecera, pie y **reglas de precio por colección** (`discount-rules-group.json`)

Los precios y cantidades los define el merchant en **Personalizar tema → Reglas de precio (global)**.

Solo con solicitud explícita:

```bash
# Subir reglas desde el repo (pisa el editor)
ALLOW_THEME_RULES_OVERWRITE=1 npm run theme:push:rules

# Subida total incluyendo personalización
npm run theme:push:full:overwrite-custom
```

## Autenticación (primer paso obligatorio)

La primera vez que ejecutes un comando, Shopify te pedirá iniciar sesión:

1. Ejecuta `npm run theme:list` en la terminal
2. Se mostrará un **código de verificación** y un enlace
3. Abre el enlace e inicia sesión con la cuenta de Caletzza
4. Introduce el código cuando te lo pida

## Flujo de trabajo recomendado

1. Edita archivos en `sections/`, `templates/`, `assets/`, etc.
2. `npm run theme:dev` — previsualiza cambios en tiempo real
3. `npm run theme:push:draft` — sube a un tema **no publicado** (borrador)
4. Revisa en Admin → Temas → Caletzza Theme (borrador)
5. Publica manualmente solo cuando estés conforme

> **Importante:** Este theme se sube como borrador. No se publica automáticamente.

## Configuración

La tienda está configurada en `shopify.theme.toml`:

```toml
[environments.default]
store = "caletzza.myshopify.com"
# theme = ""  # Dejar vacío para crear/subir como borrador
```

## Secciones Caletzza nuevas

- `caletzza-marquee-bar` — Barra de anuncios con scroll continuo
- `caletzza-shipping-bar` — Beneficios (envío, pago, cambios)
- `caletzza-category-grid` — Grid visual de categorías
- `caletzza-tabs-collection` — Productos destacados con tabs
- `caletzza-split-banner` — Banners divididos 50/50
- `caletzza-mobile-toolbar` — Navegación inferior móvil
- `caletzza-collection-banner` — Banner superior compacto por colección (escritorio + móvil)
- `caletzza-unit-price-table` — Tabla de precios por unidades

## Colecciones (banner + tabla de precios)

### Banner superior compacto

En **Personalizar tema → Colecciones → Banner colección (Caletzza)**:

1. Ajusta altura: ~140px escritorio / ~100px móvil (banner bajo, estilo Caletzza)
2. Agrega un **bloque por colección** (ej. Bodys):
   - Colección: `bodys` / `bodies`
   - Imagen escritorio y móvil (formato panorámico, ratio ~4:1)
   - Título opcional sobre la imagen

Template dedicado: `collection.bodys.json` (asignable en Admin → Colecciones → Bodys).

### Tabla de precios por unidades

Referencia de ingeniería inversa: usan precios por volumen de Shopify (`quantity_price_breaks`) en productos pack; en colección se muestra tabla promocional manual.

Configurar en **Tabla precios por unidades**:

| Unidades | Precio c/u | Total |
|----------|-----------|-------|
| 1 | $72.900 | $72.900 |
| 3 | $69.900 | $209.700 |
| … | … | … |

- Cada fila puede asignarse a una colección específica
- Etiquetas: «Ahorra», «Mejor precio»
- En página de producto: activar «Usar precios por volumen del producto» para leer breaks de Shopify Admin automáticamente

## Checkout express COD

Ver [cod-express-app/README.md](cod-express-app/README.md) para la app de pedidos COD.

## Segunda imagen de variaciones

1. **Configuración → Datos personalizados → Variantes → Agregar definición**
2. Nombre: `Segunda imagen`, namespace `custom`, tipo **Archivo** (imagen)
3. Asignar imagen por color/talla en cada variante
