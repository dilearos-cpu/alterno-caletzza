# Guía paso a paso — Instalar COD Express en Caletzza

## Resumen

| Paso | Qué haces | Tiempo aprox. |
|------|-----------|---------------|
| A | Crear app personalizada en Shopify Admin | 5 min |
| B | Desplegar servidor en Render | 10 min |
| C | Configurar App Proxy | 3 min |
| D | Probar pedido real | 5 min |

---

## PASO A — Crear la app en Shopify Admin

### A1. Entrar a desarrollar apps

1. Abre **https://admin.shopify.com/store/caletzza**
2. **Configuración** (engranaje abajo a la izquierda)
3. **Apps y canales de ventas**
4. Clic en **Desarrollar apps**
5. Si te pide activar desarrollo de apps → **Permitir desarrollo de apps personalizadas**

### A2. Crear la app

1. **Crear una app** → **Crear app personalizada**
2. Nombre: `COD Express`
3. **Crear app**

### A3. Configurar permisos (scopes)

1. Pestaña **Configuración** → **Configurar Admin API**
2. Activa estos permisos:

```
✅ write_draft_orders   (Borradores de pedidos → Editar)
✅ write_orders         (Pedidos → Editar)
✅ read_products        (Productos → Leer) — opcional
```

3. **Guardar**

### A4. Instalar y copiar credenciales

1. Pestaña **Credenciales de la API**
2. Clic en **Instalar app** → Confirmar
3. **Copia y guarda en un bloc de notas** (no las pierdas):

| Credencial | Dónde está |
|------------|------------|
| **Admin API access token** | Aparece UNA sola vez al instalar. Empieza con `shpat_` |
| **API secret key** | En Credenciales → API secret key |

> ⚠️ El token `shpat_` solo se muestra una vez. Si lo pierdes, debes reinstalar la app.

---

## PASO B — Desplegar en Render (gratis)

### B1. Crear cuenta y conectar repo

1. Ve a **https://render.com** → regístrate (puedes usar GitHub)
2. **New +** → **Blueprint** (o **Web Service**)
3. Conecta el repo **Landing-Neraki-1-**
4. Si usas Blueprint, Render detectará `render.yaml` automáticamente
5. Si usas Web Service manual:

| Campo | Valor |
|-------|-------|
| Name | `cod-express` |
| Root Directory | `cod-express-app` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |

### B2. Variables de entorno en Render

En **Environment** del servicio, agrega:

| Key | Value |
|-----|-------|
| `SHOPIFY_SHOP_DOMAIN` | `caletzza.myshopify.com` |
| `SHOPIFY_ADMIN_API_TOKEN` | `shpat_xxxx` (del Paso A4) |
| `SHOPIFY_API_SECRET` | (API secret del Paso A4) |
| `SHOPIFY_API_VERSION` | `2025-01` |
| `PORT` | `3000` |

### B3. Deploy y copiar URL

1. Clic **Deploy**
2. Espera a que diga **Live** (verde)
3. Copia la URL, ejemplo:
   ```
   https://cod-express.onrender.com
   ```

### B4. Verificar que funciona

Abre en el navegador:

```
https://TU-URL.onrender.com/health
```

Debe mostrar:

```json
{"ok":true,"shop":"caletzza.myshopify.com"}
```

---

## PASO C — Configurar App Proxy en Shopify

### C1. Volver a la app COD Express en Admin

1. **Configuración → Apps y canales de ventas → Desarrollar apps**
2. Abre **COD Express**
3. Pestaña **Configuración**

### C2. App proxy

Busca la sección **App proxy** → **Configurar** (o **Set up**)

| Campo | Valor exacto |
|-------|--------------|
| **Subpath prefix** | `apps` |
| **Subpath** | `cod-express` |
| **Proxy URL** | `https://TU-URL.onrender.com/proxy/order` |

Ejemplo completo del Proxy URL:
```
https://cod-express.onrender.com/proxy/order
```

4. **Guardar**

### C3. Verificar que el proxy responde

La tienda expone esta URL:

```
https://caletzza.myshopify.com/apps/cod-express/order
```

> Un GET vacío puede dar error 401 o 405 — eso es normal. El theme hace **POST** con el formulario.

---

## PASO D — Probar pedido completo

### D1. Theme (si no lo hiciste)

En Theme Editor → Pack Bodys 4 → Checkout express COD:

- ✅ Usar checkout express COD
- URL app proxy: `/apps/cod-express/order`
- IVA: 19%
- Envío: tu costo en centavos

### D2. Hacer pedido de prueba

1. Abre la landing Pack Bodys en la tienda
2. Selecciona los 4 productos
3. **Comprar ahora**
4. Completa el formulario COD
5. **Confirmar pedido COD**

### D3. Resultado esperado

| Qué | Dónde verlo |
|-----|-------------|
| Pantalla "¡Pedido confirmado!" + #número | En la landing |
| Pedido nuevo | Admin → **Pedidos** |
| Estado | **Pago pendiente** |
| Etiquetas | `COD`, `Pack-Express` |
| Línea IVA | En el detalle del pedido |

---

## Solución de problemas

| Error | Causa | Solución |
|-------|-------|----------|
| `Firma de app proxy invalida` | API secret incorrecto | Revisa `SHOPIFY_API_SECRET` en Render |
| `SHOPIFY_ADMIN_API_TOKEN no configurado` | Token vacío en Render | Pega el `shpat_` en variables de entorno |
| `No se pudo crear el pedido` | Scopes faltantes | Reinstala app con `write_draft_orders` + `write_orders` |
| Render "spinning down" | Plan free duerme tras 15 min | Primera petición tarda ~30s, luego funciona |
| Botón fallback aparece | App no responde | Revisa `/health` y app proxy URL |

---

## Checklist final

- [ ] App personalizada creada e instalada en Caletzza
- [ ] Token `shpat_` y API secret guardados
- [ ] Render desplegado con 3 variables de entorno
- [ ] `/health` responde OK
- [ ] App proxy configurado → `/apps/cod-express/order`
- [ ] Pedido de prueba aparece en Admin

---

## Siguiente paso contigo

Cuando llegues al **Paso A4**, pégame (sin el token completo, solo confirma):
- "Ya tengo el token shpat_"
- O dime en qué paso te atascaste y te ayudo
