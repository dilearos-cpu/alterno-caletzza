import crypto from "crypto";
import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || "tienda-dev-cuunda.myshopify.com";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || "";
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || "";
const API_SECRET = process.env.SHOPIFY_API_SECRET || CLIENT_SECRET;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-10";
const APP_URL = (process.env.APP_URL || process.env.APPLICATION_URL || "https://theme-caletzza-sh.onrender.com").replace(
  /\/$/,
  ""
);
const OAUTH_SCOPES =
  process.env.OAUTH_SCOPES ||
  "write_draft_orders,write_orders,read_products,write_products,write_discounts,read_discounts,write_app_proxy";
const DISCOUNT_RULES_NAMESPACE = process.env.DISCOUNT_RULES_NAMESPACE || process.env.COD_METAFIELD_NAMESPACE || "caletzza";
// La Function lee el metafield app-owned ($app). El namespace "caletzza" queda como respaldo en shop.
const DISCOUNT_FUNCTION_METAFIELD_NAMESPACE =
  process.env.DISCOUNT_FUNCTION_METAFIELD_NAMESPACE || "$app";
const DISCOUNT_RULES_KEY = "discount_rules";
const FUNCTION_INPUT_KEY = "function_input";
const AUTOMATIC_DISCOUNT_TITLE =
  process.env.AUTOMATIC_DISCOUNT_TITLE ||
  (SHOP_DOMAIN.includes("tienda-dev-cuunda")
    ? "Descuento por cantidad Caletzza Dev"
    : "Descuento por cantidad Caletzza");
const DISCOUNT_FUNCTION_HANDLE = process.env.DISCOUNT_FUNCTION_HANDLE || "quantity-discount";
const DISCOUNT_FUNCTION_TITLE = process.env.DISCOUNT_FUNCTION_TITLE || "Descuento por cantidad";
const OFFLINE_TOKENS_PATH =
  process.env.SHOPIFY_OFFLINE_TOKENS_PATH || path.join(__dirname, "data", "shop-offline-tokens.json");
const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || "";
const MP_PUBLIC_KEY = process.env.MERCADOPAGO_PUBLIC_KEY || "";
const MP_GATEWAY_NAME = process.env.MERCADOPAGO_SHOPIFY_GATEWAY_NAME || "Mercado Libre Express";
const MP_API_BASE = (process.env.MERCADOPAGO_API_BASE || "https://api.mercadopago.com").replace(/\/$/, "");

let cachedFunctionId = process.env.DISCOUNT_FUNCTION_ID || "";
const tokenCacheByShop = new Map();
/** @type {Map<string, string>} shop -> offline access token (OAuth) */
const offlineTokenByShop = new Map();

function loadOfflineTokensFromDisk() {
  try {
    if (!fs.existsSync(OFFLINE_TOKENS_PATH)) {
      return;
    }
    const parsed = JSON.parse(fs.readFileSync(OFFLINE_TOKENS_PATH, "utf8"));
    if (parsed && typeof parsed === "object") {
      for (const [shop, token] of Object.entries(parsed)) {
        if (typeof shop === "string" && shop.endsWith(".myshopify.com") && typeof token === "string" && token) {
          offlineTokenByShop.set(shop, token);
        }
      }
    }
  } catch (error) {
    console.warn("No se pudieron cargar tokens offline:", error.message);
  }
}

function persistOfflineTokens() {
  try {
    fs.mkdirSync(path.dirname(OFFLINE_TOKENS_PATH), { recursive: true });
    const payload = Object.fromEntries(offlineTokenByShop.entries());
    fs.writeFileSync(OFFLINE_TOKENS_PATH, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.warn("No se pudieron guardar tokens offline:", error.message);
  }
}

function seedOfflineTokensFromEnv() {
  // SHOPIFY_OFFLINE_TOKEN_CALETZZA / SHOPIFY_OFFLINE_TOKENS_JSON='{"shop":"shpat_..."}'
  const caletzzaToken = process.env.SHOPIFY_OFFLINE_TOKEN_CALETZZA || process.env.SHOPIFY_ADMIN_API_TOKEN_CALETZZA;
  if (caletzzaToken) {
    offlineTokenByShop.set("caletzza.myshopify.com", caletzzaToken);
  }
  if (process.env.SHOPIFY_OFFLINE_TOKENS_JSON) {
    try {
      const parsed = JSON.parse(process.env.SHOPIFY_OFFLINE_TOKENS_JSON);
      for (const [shop, token] of Object.entries(parsed || {})) {
        if (typeof token === "string" && token) {
          offlineTokenByShop.set(shop, token);
        }
      }
    } catch (error) {
      console.warn("SHOPIFY_OFFLINE_TOKENS_JSON invalido:", error.message);
    }
  }
}

seedOfflineTokensFromEnv();
loadOfflineTokensFromDisk();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Storefront (tema) puede llamar sync/preview por URL absoluta en Render.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
});

function resolveShopDomain(req) {
  const shop = req?.query?.shop;
  if (typeof shop === "string" && shop.endsWith(".myshopify.com")) {
    return shop;
  }
  const headerShop = req?.headers?.["x-shopify-shop-domain"];
  if (typeof headerShop === "string" && headerShop.endsWith(".myshopify.com")) {
    return headerShop;
  }
  const bodyShop = req?.body?.shop;
  if (typeof bodyShop === "string" && bodyShop.endsWith(".myshopify.com")) {
    return bodyShop;
  }
  return SHOP_DOMAIN;
}

function getOfflineToken(shopDomain) {
  return offlineTokenByShop.get(shopDomain) || "";
}

function setOfflineToken(shopDomain, accessToken) {
  if (!shopDomain || !accessToken) {
    return;
  }
  offlineTokenByShop.set(shopDomain, accessToken);
  persistOfflineTokens();
  tokenCacheByShop.set(shopDomain, {
    accessToken,
    expiresAt: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000
  });
}

async function getAccessToken(shopDomain = SHOP_DOMAIN) {
  if (ADMIN_TOKEN && shopDomain === SHOP_DOMAIN) {
    return ADMIN_TOKEN;
  }

  const offline = getOfflineToken(shopDomain);
  if (offline) {
    return offline;
  }

  const cached = tokenCacheByShop.get(shopDomain);
  const now = Date.now();
  if (cached?.accessToken && now < cached.expiresAt - 60000) {
    return cached.accessToken;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      `Sin token para ${shopDomain}. Instala la app (OAuth) o configura SHOPIFY_OFFLINE_TOKEN_CALETZZA / client credentials.`
    );
  }

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `No se pudo obtener el access token para ${shopDomain}.`);
  }

  tokenCacheByShop.set(shopDomain, {
    accessToken: payload.access_token,
    expiresAt: now + Number(payload.expires_in || 86399) * 1000
  });

  return payload.access_token;
}

function buildInstallUrl(shopDomain) {
  if (!CLIENT_ID) {
    throw new Error("Falta SHOPIFY_CLIENT_ID para generar el enlace de instalacion.");
  }
  const redirectUri = `${APP_URL}/auth/callback`;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: OAUTH_SCOPES,
    redirect_uri: redirectUri,
    state: crypto.randomBytes(16).toString("hex")
  });
  return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
}

async function exchangeOAuthCode(shopDomain, code) {
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "No se pudo intercambiar el code OAuth.");
  }
  return payload;
}

function verifyProxySignature(query) {
  if (process.env.ALLOW_UNSIGNED_PROXY === "true") {
    return true;
  }

  if (!API_SECRET) {
    return false;
  }

  const signature = query.signature;
  if (!signature) {
    return false;
  }

  const pairs = Object.keys(query)
    .filter((key) => key !== "signature")
    .sort()
    .map((key) => `${key}=${Array.isArray(query[key]) ? query[key].join(",") : query[key]}`);

  const digest = crypto.createHmac("sha256", API_SECRET).update(pairs.join("")).digest("hex");
  return digest === signature;
}

function variantGid(variantId) {
  return `gid://shopify/ProductVariant/${variantId}`;
}

function moneyFromCents(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function parseProxyBody(req) {
  if (req.body && typeof req.body === "object" && Object.keys(req.body).length) {
    return req.body;
  }

  return {};
}

function isDiscountRulesSyncBody(body) {
  if (!body || typeof body !== "object") {
    return false;
  }
  if (body.action === "sync_discount_rules" || body.discount_rules_sync === true) {
    return true;
  }
  // El tema a veces hace POST de reglas por /order porque /sync-rules 404 en apps COD viejas.
  if (Array.isArray(body.rules) && !body.lineItems) {
    return true;
  }
  return false;
}

async function handleProxyOrder(req, res) {
  try {
    if (!verifyProxySignature(req.query)) {
      console.error("Proxy signature invalid", {
        shop: req.query.shop,
        path_prefix: req.query.path_prefix
      });
      return res.status(401).json({ error: "Firma de app proxy invalida." });
    }

    const body = parseProxyBody(req);
    const shopDomain = resolveShopDomain(req);

    // Permite sincronizar reglas vía /apps/cod-express/order (misma ruta COD que sí existe en proxy).
    if (isDiscountRulesSyncBody(body)) {
      const rules = normalizeRulesPayload(body);
      if (!rules.length) {
        return res.status(400).json({ error: "No se recibieron reglas de descuento." });
      }
      const result = await syncDiscountRules(rules, shopDomain);
      return res.json({ ok: true, ...result });
    }

    // Invoice (Mercado Pago / pago en linea): no completar el pedido, devolver invoiceUrl.
    if (
      body.action === "discounted_checkout" ||
      body.mode === "draft_invoice" ||
      body.invoiceCheckout === true ||
      body.paymentMethod === "online"
    ) {
      const result = await createDiscountedInvoiceCheckout(
        {
          ...body,
          items: body.items || body.lineItems,
          lineItems: body.lineItems || body.items
        },
        shopDomain
      );
      return res.json(result);
    }

    // Mercado Libre Express: Payment Brick in-modal (no checkout nativo).
    if (body.action === "mercadopago_config") {
      if (!MP_PUBLIC_KEY) {
        return res.status(400).json({
          error: "Falta MERCADOPAGO_PUBLIC_KEY en la app COD Express."
        });
      }
      return res.json({
        ok: true,
        publicKey: MP_PUBLIC_KEY,
        gatewayName: MP_GATEWAY_NAME,
        shop: shopDomain
      });
    }

    if (body.action === "mercadopago_pay" || body.paymentMethod === "mercadopago") {
      const result = await processMercadoPagoExpressPayment(body, shopDomain);
      return res.json(result);
    }

    if (!body.lineItems || !body.lineItems.length) {
      return res.status(400).json({ error: "No se recibieron productos. Revisa app proxy POST." });
    }

    const result = await createCodOrder(body, shopDomain);
    return res.json(result);
  } catch (error) {
    console.error("Create order failed:", error.message);
    return res.status(400).json({ error: error.message || "No se pudo crear el pedido." });
  }
}

async function shopifyGraphql(query, variables, shopDomain = SHOP_DOMAIN) {
  const accessToken = await getAccessToken(shopDomain);

  const response = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.errors?.[0]?.message || "Error en Admin API.");
  }

  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message);
  }

  return payload.data;
}

async function createCodOrder(body, shopDomain = SHOP_DOMAIN) {
  const customer = body.customer || {};
  const shippingAddress = body.shippingAddress || {};
  const rawItems = body.lineItems || body.items || [];
  const variantLineItems = rawItems.map((item) => ({
    variantId: variantGid(item.variantId || item.variant_id || item.id),
    quantity: Number(item.quantity || 1)
  }));

  if (!variantLineItems.length) {
    throw new Error("No hay productos en el pedido.");
  }

  const lineItems = variantLineItems.slice();

  let discountTotalCents = Number(body.discountAmount || body.discountTotal || 0);
  try {
    const previewItems = rawItems.map((item) => ({
      key: item.key || "",
      product_id: String(item.product_id || item.productId || ""),
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.unit_price ?? item.unitPrice ?? item.price ?? 0),
      title: item.title || item.product_title || ""
    }));
    const preview = await previewCartDiscounts(
      {
        items: previewItems,
        rules: normalizeRulesPayload(body)
      },
      shopDomain
    );
    if (Number(preview.discountTotal || 0) > 0) {
      discountTotalCents = Number(preview.discountTotal || 0);
    }
  } catch (error) {
    console.warn("No se pudo calcular descuento COD:", error.message);
  }

  const draftInput = {
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    note: [body.packLabel, body.note].filter(Boolean).join(" | ") || undefined,
    tags: ["COD", "Pack-Express", body.packLabel, discountTotalCents > 0 ? "qty-discount" : null].filter(
      Boolean
    ),
    shippingAddress: {
      firstName: customer.firstName || "Cliente",
      lastName: customer.lastName || "COD",
      address1: shippingAddress.address1,
      city: shippingAddress.city,
      province: shippingAddress.province,
      countryCode: "CO",
      zip: shippingAddress.zip || "000000",
      phone: customer.phone || undefined
    },
    lineItems,
    shippingLine: {
      title: "Envio",
      price: moneyFromCents(body.shippingPrice)
    }
  };

  if (discountTotalCents > 0) {
    draftInput.appliedDiscount = {
      title: "Descuento por cantidad",
      description: "Reglas de precio Caletzza",
      valueType: "FIXED_AMOUNT",
      value: Number(moneyFromCents(discountTotalCents))
    };
  }

  const createMutation = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name }
        userErrors { field message }
      }
    }
  `;

  const createData = await shopifyGraphql(createMutation, { input: draftInput }, shopDomain);
  const createResult = createData.draftOrderCreate;

  if (createResult.userErrors?.length) {
    throw new Error(createResult.userErrors.map((error) => error.message).join(" "));
  }

  const draftId = createResult.draftOrder?.id;
  if (!draftId) {
    throw new Error("No se pudo crear el borrador del pedido.");
  }

  const completeMutation = `
    mutation draftOrderComplete($id: ID!) {
      draftOrderComplete(id: $id, paymentPending: true) {
        draftOrder {
          order { id name legacyResourceId }
        }
        userErrors { field message }
      }
    }
  `;

  const completeData = await shopifyGraphql(completeMutation, { id: draftId }, shopDomain);
  const completeResult = completeData.draftOrderComplete;

  if (completeResult.userErrors?.length) {
    throw new Error(completeResult.userErrors.map((error) => error.message).join(" "));
  }

  const order = completeResult.draftOrder?.order;
  if (!order) {
    throw new Error("No se pudo completar el pedido.");
  }

  return {
    orderId: order.legacyResourceId,
    orderName: order.name,
    discountTotal: discountTotalCents,
    shop: shopDomain
  };
}

async function mercadoPagoFetch(pathname, { method = "GET", body } = {}) {
  if (!MP_ACCESS_TOKEN) {
    throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN en la app COD Express.");
  }
  const response = await fetch(`${MP_API_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": crypto.randomUUID()
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      payload?.cause?.[0]?.description ||
      `Mercado Pago HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

/**
 * Cobra con Payment Brick (Checkout API) y crea pedido Shopify PAGADO
 * con gateway offline "Mercado Libre Express" (sin checkout nativo).
 */
async function processMercadoPagoExpressPayment(body, shopDomain = SHOP_DOMAIN) {
  const orderBody = body.order && typeof body.order === "object" ? body.order : body;
  const formData = body.formData && typeof body.formData === "object" ? body.formData : {};
  const currency = String(body.currency || orderBody.currency || "COP").toUpperCase();
  const amountMajor = Number(
    body.amount != null
      ? body.amount
      : Number(orderBody.totalCents || 0) / 100
  );

  if (!(amountMajor > 0)) {
    throw new Error("Monto invalido para Mercado Libre.");
  }

  const paymentPayload = {
    ...formData,
    transaction_amount: amountMajor,
    description: orderBody.packLabel || "Pack Express Caletzza",
    external_reference: `${shopDomain}:${Date.now()}`,
    metadata: {
      shop: shopDomain,
      pack_label: orderBody.packLabel || "",
      source: "landing_express",
      gateway: MP_GATEWAY_NAME
    },
    payer: {
      ...(formData.payer || {}),
      email: formData?.payer?.email || orderBody?.customer?.email,
      first_name: orderBody?.customer?.firstName,
      last_name: orderBody?.customer?.lastName
    }
  };

  const payment = await mercadoPagoFetch("/v1/payments", {
    method: "POST",
    body: paymentPayload
  });

  const status = String(payment.status || "").toLowerCase();
  if (status !== "approved") {
    return {
      ok: false,
      status: "pending",
      mpStatus: payment.status,
      mpPaymentId: payment.id,
      error:
        status === "rejected"
          ? "El pago fue rechazado por Mercado Libre."
          : `Pago en estado ${payment.status || "pendiente"}.`
    };
  }

  const shopifyOrder = await createPaidOfflineOrder(
    {
      ...orderBody,
      note: [
        orderBody.packLabel,
        `${MP_GATEWAY_NAME} (MP #${payment.id})`,
        orderBody.note
      ]
        .filter(Boolean)
        .join(" | "),
      paymentMethodLabel: MP_GATEWAY_NAME,
      mpPaymentId: String(payment.id),
      mpStatus: payment.status
    },
    shopDomain
  );

  return {
    ok: true,
    status: "approved",
    mpPaymentId: payment.id,
    mpStatus: payment.status,
    gatewayName: MP_GATEWAY_NAME,
    ...shopifyOrder
  };
}

/**
 * Pedido Shopify pagado con metodo offline personalizado (no COD pendiente).
 * Usa draftOrder + complete(paymentPending:false) y etiqueta el gateway en nota/tags.
 */
async function createPaidOfflineOrder(body, shopDomain = SHOP_DOMAIN) {
  const customer = body.customer || {};
  const shippingAddress = body.shippingAddress || {};
  const rawItems = body.lineItems || body.items || [];
  const variantLineItems = rawItems.map((item) => ({
    variantId: variantGid(item.variantId || item.variant_id || item.id),
    quantity: Number(item.quantity || 1)
  }));

  if (!variantLineItems.length) {
    throw new Error("No hay productos en el pedido.");
  }

  let discountTotalCents = Number(body.discountAmount || body.discountTotal || 0);
  try {
    const previewItems = rawItems.map((item) => ({
      key: item.key || "",
      product_id: String(item.product_id || item.productId || ""),
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.unit_price ?? item.unitPrice ?? item.price ?? 0),
      title: item.title || item.product_title || ""
    }));
    const preview = await previewCartDiscounts(
      {
        items: previewItems,
        rules: normalizeRulesPayload(body)
      },
      shopDomain
    );
    if (Number(preview.discountTotal || 0) > 0) {
      discountTotalCents = Number(preview.discountTotal || 0);
    }
  } catch (error) {
    console.warn("No se pudo calcular descuento MP express:", error.message);
  }

  const gatewayLabel = body.paymentMethodLabel || MP_GATEWAY_NAME;
  const draftInput = {
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    note: body.note || undefined,
    tags: [
      "MercadoLibre-Express",
      "Pack-Express",
      "MP-Paid",
      body.packLabel,
      discountTotalCents > 0 ? "qty-discount" : null
    ].filter(Boolean),
    customAttributes: [
      { key: "payment_method", value: gatewayLabel },
      { key: "mp_payment_id", value: String(body.mpPaymentId || "") },
      { key: "mp_status", value: String(body.mpStatus || "approved") },
      { key: "checkout_source", value: "landing_express" }
    ],
    shippingAddress: {
      firstName: customer.firstName || "Cliente",
      lastName: customer.lastName || "ML",
      address1: shippingAddress.address1,
      city: shippingAddress.city,
      province: shippingAddress.province,
      countryCode: "CO",
      zip: shippingAddress.zip || "000000",
      phone: customer.phone || undefined
    },
    lineItems: variantLineItems,
    shippingLine: {
      title: "Envio",
      price: moneyFromCents(body.shippingPrice)
    }
  };

  if (discountTotalCents > 0) {
    draftInput.appliedDiscount = {
      title: "Descuento por cantidad",
      description: "Reglas de precio Caletzza",
      valueType: "FIXED_AMOUNT",
      value: Number(moneyFromCents(discountTotalCents))
    };
  }

  const createMutation = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name }
        userErrors { field message }
      }
    }
  `;

  const createData = await shopifyGraphql(createMutation, { input: draftInput }, shopDomain);
  const createResult = createData.draftOrderCreate;
  if (createResult.userErrors?.length) {
    throw new Error(createResult.userErrors.map((error) => error.message).join(" "));
  }

  const draftId = createResult.draftOrder?.id;
  if (!draftId) {
    throw new Error("No se pudo crear el borrador del pedido Mercado Libre.");
  }

  // paymentPending:false => pedido pagado (offline / manual) en Shopify.
  const completeMutation = `
    mutation draftOrderComplete($id: ID!) {
      draftOrderComplete(id: $id, paymentPending: false) {
        draftOrder {
          order { id name legacyResourceId }
        }
        userErrors { field message }
      }
    }
  `;

  const completeData = await shopifyGraphql(completeMutation, { id: draftId }, shopDomain);
  const completeResult = completeData.draftOrderComplete;
  if (completeResult.userErrors?.length) {
    throw new Error(completeResult.userErrors.map((error) => error.message).join(" "));
  }

  const order = completeResult.draftOrder?.order;
  if (!order) {
    throw new Error("No se pudo completar el pedido Mercado Libre.");
  }

  // Refuerza el nombre del metodo de pago en el pedido (columna / notas).
  try {
    await shopifyGraphql(
      `
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id }
          userErrors { field message }
        }
      }
    `,
      {
        input: {
          id: order.id,
          tags: [
            "MercadoLibre-Express",
            "Pack-Express",
            "MP-Paid",
            body.packLabel,
            gatewayLabel
          ].filter(Boolean),
          note: body.note,
          customAttributes: draftInput.customAttributes
        }
      },
      shopDomain
    );
  } catch (error) {
    console.warn("No se pudo etiquetar el pedido MP:", error.message);
  }

  return {
    orderId: order.legacyResourceId,
    orderName: order.name,
    discountTotal: discountTotalCents,
    shop: shopDomain,
    gatewayName: gatewayLabel
  };
}

/**
 * Checkout online sin Shopify Function (tiendas no-Plus):
 * crea un draft order con appliedDiscount y devuelve invoiceUrl.
 */
async function createDiscountedInvoiceCheckout(body, shopDomain = SHOP_DOMAIN) {
  const cartItems = Array.isArray(body.items)
    ? body.items
    : Array.isArray(body.lineItems)
      ? body.lineItems
      : [];

  if (!cartItems.length) {
    throw new Error("No hay productos en el carrito.");
  }

  const previewItems = cartItems.map((item) => {
    const quantity = Number(item.quantity || 1) || 1;
    let unitPrice = Number(item.unit_price ?? item.unitPrice ?? item.price ?? 0);
    if (!unitPrice && item.final_line_price != null) {
      unitPrice = Number(item.final_line_price) / quantity;
    }
    if (!unitPrice && item.original_line_price != null) {
      unitPrice = Number(item.original_line_price) / quantity;
    }
    return {
      key: item.key || "",
      product_id: String(item.product_id || item.productId || ""),
      quantity,
      unit_price: unitPrice,
      title: item.title || item.product_title || ""
    };
  });

  let discountTotalCents = Number(body.discountAmount || body.discountTotal || 0);
  let preview = { discountTotal: 0, subtotal: 0, originalSubtotal: 0 };
  try {
    preview = await previewCartDiscounts(
      {
        items: previewItems,
        rules: normalizeRulesPayload(body),
        includePackRules: body.includePackRules,
        packLabel: body.packLabel,
        invoiceCheckout: body.invoiceCheckout
      },
      shopDomain
    );
    if (!discountTotalCents && Number(preview.discountTotal || 0) > 0) {
      discountTotalCents = Number(preview.discountTotal || 0);
    }
  } catch (error) {
    console.warn("No se pudo calcular descuento invoice:", error.message);
  }

  const lineItems = cartItems.map((item) => {
    const variantId = item.variant_id || item.variantId || item.id;
    if (!variantId) {
      throw new Error("Falta variant_id en un ítem del carrito.");
    }
    return {
      variantId: variantGid(variantId),
      quantity: Number(item.quantity || 1)
    };
  });

  const customer = body.customer || {};
  const shippingAddress = body.shippingAddress || {};
  const shippingPriceCents = Number(body.shippingPrice || 0);
  const taxExempt = body.taxExempt === true || body.taxExempt === "true";

  const draftInput = {
    email: body.email || customer.email || undefined,
    phone: body.phone || customer.phone || undefined,
    note: body.note || "Checkout con descuento por cantidad Caletzza",
    tags: [
      "caletzza-qty-discount",
      "draft-checkout",
      body.packLabel,
      body.paymentMethod === "online" ? "online" : null,
      discountTotalCents > 0 ? "qty-discount" : null
    ].filter(Boolean),
    lineItems,
    allowDiscountCodesInCheckout: true,
    taxExempt
  };

  if (shippingAddress.address1 && shippingAddress.city) {
    draftInput.shippingAddress = {
      firstName: shippingAddress.firstName || customer.firstName || "Cliente",
      lastName: shippingAddress.lastName || customer.lastName || "Caletzza",
      address1: shippingAddress.address1,
      city: shippingAddress.city,
      province: shippingAddress.province,
      countryCode: "CO",
      zip: shippingAddress.zip || "000000",
      phone: body.phone || customer.phone || undefined
    };
  }

  if (shippingPriceCents > 0) {
    draftInput.shippingLine = {
      title: "Envio",
      price: moneyFromCents(shippingPriceCents)
    };
  }

  if (discountTotalCents > 0) {
    draftInput.appliedDiscount = {
      title: "Descuento por cantidad",
      description: "Reglas de precio del tema Caletzza",
      valueType: "FIXED_AMOUNT",
      value: Number(moneyFromCents(discountTotalCents))
    };
  }

  const createMutation = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          name
          invoiceUrl
          totalPrice
        }
        userErrors { field message }
      }
    }
  `;

  const createData = await shopifyGraphql(createMutation, { input: draftInput }, shopDomain);
  let createResult = createData.draftOrderCreate;
  if (createResult.userErrors?.length && draftInput.taxExempt) {
    console.warn(
      "Draft taxExempt rejected, retrying without it:",
      createResult.userErrors.map((error) => error.message).join(" ")
    );
    delete draftInput.taxExempt;
    const retryData = await shopifyGraphql(createMutation, { input: draftInput }, shopDomain);
    createResult = retryData.draftOrderCreate;
  }
  if (createResult.userErrors?.length) {
    throw new Error(createResult.userErrors.map((error) => error.message).join(" "));
  }

  const draft = createResult.draftOrder;
  if (!draft?.invoiceUrl) {
    throw new Error("No se obtuvo invoiceUrl del borrador.");
  }

  return {
    ok: true,
    mode: "draft_invoice",
    shop: shopDomain,
    invoiceUrl: draft.invoiceUrl,
    draftId: draft.id,
    draftName: draft.name,
    discountTotal: discountTotalCents,
    subtotal: preview.subtotal,
    originalSubtotal: preview.originalSubtotal,
    totalPrice: draft.totalPrice
  };
}

function normalizeRulesPayload(body) {
  if (Array.isArray(body)) {
    return body;
  }
  if (Array.isArray(body.rules)) {
    return body.rules;
  }
  return [];
}

async function fetchProductsByTag(tag, shopDomain = SHOP_DOMAIN) {
  const productIds = [];
  let cursor = null;

  do {
    const query = `
      query productsByTag($query: String!, $cursor: String) {
        products(first: 100, after: $cursor, query: $query) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
          }
        }
      }
    `;

    const data = await shopifyGraphql(query, {
      query: `tag:${tag}`,
      cursor
    }, shopDomain);

    const connection = data.products;
    connection.nodes.forEach((product) => {
      const match = String(product.id || "").match(/\/(\d+)$/);
      if (match) {
        productIds.push(match[1]);
      }
    });

    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);

  return productIds;
}

async function fetchProductsByQuery(searchQuery, shopDomain = SHOP_DOMAIN) {
  const productIds = [];
  let cursor = null;

  do {
    const query = `
      query productsByQuery($query: String!, $cursor: String) {
        products(first: 100, after: $cursor, query: $query) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
          }
        }
      }
    `;

    const data = await shopifyGraphql(query, {
      query: searchQuery,
      cursor
    }, shopDomain);

    const connection = data.products;
    connection.nodes.forEach((product) => {
      const match = String(product.id || "").match(/\/(\d+)$/);
      if (match) {
        productIds.push(match[1]);
      }
    });

    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);

  return productIds;
}

function toCollectionGid(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("gid://shopify/Collection/")) {
    return raw;
  }
  if (/^\d+$/.test(raw)) {
    return `gid://shopify/Collection/${raw}`;
  }
  return "";
}

async function fetchCollectionByHandle(handle, shopDomain = SHOP_DOMAIN) {
  const query = `
    query collectionByHandle($handle: String!) {
      collectionByHandle(handle: $handle) {
        id
        handle
      }
    }
  `;
  const data = await shopifyGraphql(query, { handle }, shopDomain);
  return data.collectionByHandle || null;
}

async function fetchProductsByCollection(handle, shopDomain = SHOP_DOMAIN) {
  const productIds = [];
  let cursor = null;

  do {
    const query = `
      query collectionProducts($handle: String!, $cursor: String) {
        collectionByHandle(handle: $handle) {
          id
          products(first: 100, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
            }
          }
        }
      }
    `;

    const data = await shopifyGraphql(query, { handle, cursor }, shopDomain);
    const collection = data.collectionByHandle;
    if (!collection) {
      break;
    }

    const connection = collection.products;
    if (!connection) {
      break;
    }

    connection.nodes.forEach((product) => {
      const match = String(product.id || "").match(/\/(\d+)$/);
      if (match) {
        productIds.push(match[1]);
      }
    });

    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);

  return productIds;
}

const DEFAULT_TAG_BY_HANDLE = {
  bodys: "caletzza-bodys",
  bodies: "caletzza-bodys",
  basicas: "caletzza-basicas"
};

const DEFAULT_COLLECTION_BY_TAG = {
  "caletzza-bodys": "bodys",
  "caletzza-basicas": "basicas"
};

/** Handles antiguos del editor → handle actual en la tienda. */
const COLLECTION_HANDLE_ALIASES = {
  hydrogen: "oversize"
};

function normalizeCollectionHandle(handle) {
  const raw = String(handle || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }
  return COLLECTION_HANDLE_ALIASES[raw] || raw;
}

function preserveCollectionIds(filter) {
  const ids = [];
  const primary = toCollectionGid(filter.collection_id);
  if (primary) {
    ids.push(primary);
  }
  (filter.collection_ids || []).forEach((id) => {
    const gid = toCollectionGid(id);
    if (gid && ids.indexOf(gid) === -1) {
      ids.push(gid);
    }
  });
  return ids;
}

async function enrichDiscountRules(rules, shopDomain = SHOP_DOMAIN) {
  const enriched = [];

  for (const rule of rules) {
    const nextRule = JSON.parse(JSON.stringify(rule || {}));
    const filter = nextRule.filter || {};

    // Si el tema aún manda colección Bodys/Básicas, convertir a tag nativo
    // para no pisar el checkout con product_ids / inCollections.
    if (filter.type === "collection") {
      const handle = normalizeCollectionHandle(
        filter.collection || (filter.collections || [])[0] || ""
      );
      const defaultTag = DEFAULT_TAG_BY_HANDLE[handle];
      if (defaultTag && !filter.tag) {
        filter.type = "tag";
        filter.tag = defaultTag;
        filter.tags = [defaultTag];
        filter.collection = handle;
        filter.collections = [handle];
      } else if (handle && filter.collection) {
        filter.collection = handle;
        filter.collections = [handle];
      }
    }

    if (filter.type === "tag") {
      // Checkout usa title/handle/tag del metafield. No expandir a product_ids.
      const tag = String(filter.tag || "").trim();
      const tags = Array.isArray(filter.tags)
        ? filter.tags.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      if (tag && tags.indexOf(tag) === -1) {
        tags.unshift(tag);
      }
      if (tag) {
        filter.tag = tag;
      }
      if (tags.length) {
        filter.tags = tags;
      }

      const existingIds = preserveCollectionIds(filter);

      // Resolver GIDs de colección conocida como respaldo.
      const handle = normalizeCollectionHandle(
        filter.collection ||
          (Array.isArray(filter.collections) ? filter.collections[0] : "") ||
          DEFAULT_COLLECTION_BY_TAG[String(tag || "").toLowerCase()] ||
          ""
      );
      if (handle) {
        try {
          const collection = await fetchCollectionByHandle(handle, shopDomain);
          const collectionGid = toCollectionGid(collection?.id);
          if (collectionGid) {
            filter.collection = handle;
            filter.collections = [handle];
            filter.collection_id = collectionGid;
            filter.collection_ids = [collectionGid];
          } else if (existingIds.length) {
            filter.collection = handle;
            filter.collections = [handle];
            filter.collection_id = existingIds[0];
            filter.collection_ids = existingIds;
          }
        } catch (error) {
          console.warn("No se pudo resolver colección para tag:", tag, error.message);
          if (existingIds.length) {
            filter.collection_id = existingIds[0];
            filter.collection_ids = existingIds;
          }
        }
      } else if (existingIds.length) {
        filter.collection_id = existingIds[0];
        filter.collection_ids = existingIds;
      }

      delete filter.product_ids;
      nextRule.filter = filter;
    }

    if (filter.type === "collection") {
      const handles = [];
      if (filter.collection) {
        handles.push(normalizeCollectionHandle(filter.collection));
      }
      if (Array.isArray(filter.collections)) {
        handles.push(...filter.collections.map(normalizeCollectionHandle));
      }

      const uniqueHandles = [...new Set(handles.filter(Boolean))];
      const existingIds = preserveCollectionIds(filter);
      const collectionIds = [...existingIds];

      if (uniqueHandles.length) {
        try {
          for (const handle of uniqueHandles) {
            const collection = await fetchCollectionByHandle(handle, shopDomain);
            const collectionGid = toCollectionGid(collection?.id);
            if (collectionGid && collectionIds.indexOf(collectionGid) === -1) {
              collectionIds.push(collectionGid);
            }
          }

          if (collectionIds.length) {
            filter.collection_id = collectionIds[0];
            filter.collection_ids = collectionIds;
          }
          if (uniqueHandles[0]) {
            filter.collection = uniqueHandles[0];
            filter.collections = uniqueHandles;
          }
          delete filter.product_ids;
          nextRule.filter = filter;
        } catch (error) {
          console.warn("No se pudieron resolver colecciones:", uniqueHandles.join(", "), error.message);
          if (existingIds.length) {
            filter.collection_id = existingIds[0];
            filter.collection_ids = existingIds;
            nextRule.filter = filter;
          }
        }
      } else if (existingIds.length) {
        filter.collection_id = existingIds[0];
        filter.collection_ids = existingIds;
        nextRule.filter = filter;
      }
    }

    // Checkout siempre debe aplicar reglas sincronizadas (scope es solo UI del tema).
    if (nextRule.enabled !== false) {
      nextRule.scope = "both";
    }

    enriched.push(nextRule);
  }

  return enriched;
}

function normalizeFunctionId(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const match = raw.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match ? match[1].toLowerCase() : raw.toLowerCase();
}

function functionIdsMatch(left, right) {
  const a = normalizeFunctionId(left);
  const b = normalizeFunctionId(right);
  return Boolean(a && b && a === b);
}

async function ensureDiscountRulesMetafieldDefinition(shopDomain = SHOP_DOMAIN) {
  const query = `
    query discountRulesDefinition {
      metafieldDefinitions(first: 5, ownerType: DISCOUNT, namespace: "${DISCOUNT_RULES_NAMESPACE}", key: "${DISCOUNT_RULES_KEY}") {
        nodes { id }
      }
    }
  `;

  const data = await shopifyGraphql(query, {}, shopDomain);
  if (data.metafieldDefinitions?.nodes?.length) {
    return data.metafieldDefinitions.nodes[0];
  }

  const mutation = `
    mutation discountRulesDefinitionCreate {
      metafieldDefinitionCreate(
        definition: {
          name: "Discount Rules"
          namespace: "${DISCOUNT_RULES_NAMESPACE}"
          key: "${DISCOUNT_RULES_KEY}"
          type: "json"
          ownerType: DISCOUNT
        }
      ) {
        createdDefinition { id namespace key }
        userErrors { field message code }
      }
    }
  `;

  const created = await shopifyGraphql(mutation, {}, shopDomain);
  const result = created.metafieldDefinitionCreate;
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((error) => error.message).join(" "));
  }

  return result.createdDefinition;
}

async function setJsonMetafield(ownerId, namespace, key, value, shopDomain = SHOP_DOMAIN) {
  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphql(
    mutation,
    {
      metafields: [
        {
          ownerId,
          namespace,
          key,
          type: "json",
          value: JSON.stringify(value)
        }
      ]
    },
    shopDomain
  );

  const result = data.metafieldsSet;
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((error) => error.message).join(" "));
  }

  return result.metafields?.[0] || null;
}

function collectRuleCollectionIds(rules) {
  const collectionIds = [];
  (rules || []).forEach((rule) => {
    const filter = rule?.filter || {};
    // Incluye colecciones de respaldo en reglas tag (Bodys/Básicas).
    if (filter.type !== "collection" && filter.type !== "tag") {
      return;
    }
    const primary = toCollectionGid(filter.collection_id);
    if (primary && collectionIds.indexOf(primary) === -1) {
      collectionIds.push(primary);
    }
    (filter.collection_ids || []).forEach((id) => {
      const gid = toCollectionGid(id);
      if (gid && collectionIds.indexOf(gid) === -1) {
        collectionIds.push(gid);
      }
    });
  });
  return collectionIds.slice(0, 100);
}

function collectRuleTags(rules) {
  const tags = [];
  (rules || []).forEach((rule) => {
    const filter = rule?.filter || {};
    if (filter.type !== "tag") {
      return;
    }
    const candidates = [filter.tag, ...(Array.isArray(filter.tags) ? filter.tags : [])];
    candidates.forEach((tag) => {
      const normalized = String(tag || "").trim();
      if (normalized && tags.indexOf(normalized) === -1) {
        tags.push(normalized);
      }
    });
  });
  return tags.slice(0, 100);
}

const DEFAULT_TITLE_PREFIXES_BY_HANDLE = {
  bodys: ["BODY", "Body", "body"],
  bodies: ["BODY", "Body", "body"],
  basicas: ["Camiseta", "camiseta", "CAMISETA"]
};

const DEFAULT_TITLE_PREFIXES_BY_TAG = {
  "caletzza-bodys": ["BODY", "Body", "body"],
  "caletzza-basicas": ["Camiseta", "camiseta", "CAMISETA"]
};

function slimRulesForFunction(rules) {
  // Matching checkout: hasTags (tag) y/o inCollections (colección).
  // Nunca product_ids masivos: ~1000 IDs superan 11M instrucciones WASM.
  return (rules || []).map((rule) => {
    const nextRule = JSON.parse(JSON.stringify(rule || {}));
    const filter = nextRule.filter || {};

    if (filter.type === "tag") {
      const tag = String(filter.tag || "").trim();
      const tags = Array.isArray(filter.tags)
        ? filter.tags.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      if (tag && tags.indexOf(tag) === -1) {
        tags.unshift(tag);
      }
      if (tag) {
        filter.tag = tag;
      }
      if (tags.length) {
        filter.tags = tags;
      }

      // Respaldo título + colección conocida (Bodys/Básicas) si hasTags llega vacío.
      let prefixes = Array.isArray(filter.title_prefixes)
        ? filter.title_prefixes.map(String).filter(Boolean)
        : [];
      tags.forEach((tagName) => {
        const defaults = DEFAULT_TITLE_PREFIXES_BY_TAG[String(tagName || "").toLowerCase()] || [];
        defaults.forEach((prefix) => {
          if (prefixes.indexOf(prefix) === -1) {
            prefixes.push(prefix);
          }
        });
      });
      if (prefixes.length) {
        filter.title_prefixes = prefixes;
      }

      if (!filter.collection) {
        const mapped = DEFAULT_COLLECTION_BY_TAG[String(tag || tags[0] || "").toLowerCase()];
        if (mapped) {
          filter.collection = mapped;
          filter.collections = [mapped];
        }
      }

      const collectionIds = [];
      const primary = toCollectionGid(filter.collection_id);
      if (primary) {
        collectionIds.push(primary);
      }
      (filter.collection_ids || []).forEach((id) => {
        const gid = toCollectionGid(id);
        if (gid && collectionIds.indexOf(gid) === -1) {
          collectionIds.push(gid);
        }
      });
      if (collectionIds.length) {
        filter.collection_id = collectionIds[0];
        filter.collection_ids = collectionIds;
      }

      delete filter.product_ids;
    } else if (filter.type === "collection") {
      const collectionIds = [];
      const primary = toCollectionGid(filter.collection_id);
      if (primary) {
        collectionIds.push(primary);
      }
      (filter.collection_ids || []).forEach((id) => {
        const gid = toCollectionGid(id);
        if (gid && collectionIds.indexOf(gid) === -1) {
          collectionIds.push(gid);
        }
      });
      if (collectionIds.length) {
        filter.collection_id = collectionIds[0];
        filter.collection_ids = collectionIds;
      }

      const handles = [
        filter.collection,
        ...(Array.isArray(filter.collections) ? filter.collections : [])
      ]
        .map((handle) => String(handle || "").trim().toLowerCase())
        .filter(Boolean);

      let prefixes = Array.isArray(filter.title_prefixes)
        ? filter.title_prefixes.map(String).filter(Boolean)
        : [];
      if (!prefixes.length) {
        handles.forEach((handle) => {
          const defaults = DEFAULT_TITLE_PREFIXES_BY_HANDLE[handle] || [];
          defaults.forEach((prefix) => {
            if (prefixes.indexOf(prefix) === -1) {
              prefixes.push(prefix);
            }
          });
        });
      }
      if (prefixes.length) {
        filter.title_prefixes = prefixes;
      }

      delete filter.product_ids;
    } else if (Array.isArray(filter.product_ids) && filter.product_ids.length > 80) {
      delete filter.product_ids;
    } else if (Array.isArray(filter.product_ids)) {
      filter.product_ids = filter.product_ids.map(String).filter(Boolean);
    }

    if (Array.isArray(filter.title_prefixes)) {
      filter.title_prefixes = filter.title_prefixes.map(String).filter(Boolean);
    }

    nextRule.filter = filter;
    return nextRule;
  });
}

async function setShopDiscountRulesMetafield(rules, shopDomain = SHOP_DOMAIN) {
  const shopQuery = `query { shop { id } }`;
  const shopData = await shopifyGraphql(shopQuery, {}, shopDomain);
  const shopId = shopData.shop?.id;

  if (!shopId) {
    throw new Error("No se pudo obtener el ID de la tienda.");
  }

  return setJsonMetafield(shopId, DISCOUNT_RULES_NAMESPACE, DISCOUNT_RULES_KEY, rules, shopDomain);
}

async function setDiscountNodeRulesMetafield(rules, discountNodeId, shopDomain = SHOP_DOMAIN) {
  if (!discountNodeId) {
    throw new Error("No se encontro el descuento automatico para guardar las reglas.");
  }

  const slimRules = slimRulesForFunction(rules);
  const collectionIds = collectRuleCollectionIds(slimRules);
  const ruleTags = collectRuleTags(slimRules);

  // Namespace $app: visible para la Shopify Function del mismo app.
  await setJsonMetafield(
    discountNodeId,
    DISCOUNT_FUNCTION_METAFIELD_NAMESPACE,
    DISCOUNT_RULES_KEY,
    slimRules,
    shopDomain
  );

  // Variables de input: hasTags + inCollections (siempre arrays, nunca null).
  await setJsonMetafield(
    discountNodeId,
    DISCOUNT_FUNCTION_METAFIELD_NAMESPACE,
    FUNCTION_INPUT_KEY,
    { ruleTags, collectionIds },
    shopDomain
  );

  // Respaldo legible en admin (namespace caletzza) + shop.
  try {
    await setJsonMetafield(
      discountNodeId,
      DISCOUNT_RULES_NAMESPACE,
      DISCOUNT_RULES_KEY,
      slimRules,
      shopDomain
    );
  } catch (error) {
    console.warn("No se pudo guardar respaldo caletzza.discount_rules:", error.message);
  }

  return slimRules;
}

async function resolveDiscountFunctionId(shopDomain = SHOP_DOMAIN) {
  const query = `
    query shopifyFunctions {
      shopifyFunctions(first: 25) {
        nodes {
          id
          title
          apiType
        }
      }
    }
  `;

  const data = await shopifyGraphql(query, {}, shopDomain);
  const nodes = data.shopifyFunctions?.nodes || [];
  const match =
    nodes.find((node) => node.title === DISCOUNT_FUNCTION_TITLE) ||
    nodes.find((node) => String(node.title || "").toLowerCase().includes(DISCOUNT_FUNCTION_HANDLE)) ||
    nodes.find((node) => node.apiType === "discount");

  if (!match?.id) {
    // Solo usar env si existe en la tienda; evita DISCOUNT_FUNCTION_ID obsoleto en Render.
    const envId = process.env.DISCOUNT_FUNCTION_ID || cachedFunctionId || "";
    if (envId && nodes.some((node) => functionIdsMatch(node.id, envId))) {
      cachedFunctionId = normalizeFunctionId(envId) ? envId : cachedFunctionId;
      return envId;
    }
    throw new Error(
      `No se encontro la funcion ${DISCOUNT_FUNCTION_TITLE}. Despliega la extension quantity-discount con shopify app deploy o configura DISCOUNT_FUNCTION_ID.`
    );
  }

  const envId = process.env.DISCOUNT_FUNCTION_ID || "";
  if (envId && !functionIdsMatch(envId, match.id)) {
    console.warn(
      `DISCOUNT_FUNCTION_ID env (${envId}) no coincide con la funcion activa (${match.id}). Usando la activa.`
    );
  }

  cachedFunctionId = match.id;
  return cachedFunctionId;
}

async function findAutomaticQuantityDiscount(shopDomain = SHOP_DOMAIN) {
  const query = `
    query discountNodes {
      discountNodes(first: 50, query: "method:automatic") {
        nodes {
          id
          discount {
            __typename
            ... on DiscountAutomaticApp {
              title
              status
              discountId
              appDiscountType {
                functionId
              }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphql(query, {}, shopDomain);
  const nodes = (data.discountNodes?.nodes || []).filter(
    (node) => node.discount?.__typename === "DiscountAutomaticApp" || node.discount?.appDiscountType?.functionId
  );

  let expectedFunctionId = cachedFunctionId || process.env.DISCOUNT_FUNCTION_ID || "";
  if (!expectedFunctionId) {
    try {
      expectedFunctionId = await resolveDiscountFunctionId(shopDomain);
    } catch {
      expectedFunctionId = "";
    }
  }

  const titleNeedle = String(AUTOMATIC_DISCOUNT_TITLE || "").toLowerCase();
  const byTitle = (node) => {
    const title = String(node.discount?.title || "").toLowerCase();
    return (
      node.discount?.title === AUTOMATIC_DISCOUNT_TITLE ||
      (titleNeedle && title.includes(titleNeedle)) ||
      title.includes("descuento por cantidad") ||
      title.includes("caletzza")
    );
  };

  const active = nodes.filter((node) => node.discount?.status === "ACTIVE");
  const pool = active.length ? active : nodes;

  if (expectedFunctionId) {
    const matchingFunction = pool.find((node) =>
      functionIdsMatch(node.discount?.appDiscountType?.functionId, expectedFunctionId)
    );
    if (matchingFunction) {
      return matchingFunction;
    }
  }

  return pool.find(byTitle) || pool[0] || null;
}

async function ensureAutomaticQuantityDiscount(shopDomain = SHOP_DOMAIN) {
  const functionId = await resolveDiscountFunctionId(shopDomain);
  const existing = await findAutomaticQuantityDiscount(shopDomain);

  if (
    existing?.discount?.status === "ACTIVE" &&
    functionIdsMatch(existing.discount.appDiscountType?.functionId, functionId)
  ) {
    return existing.discount;
  }

  const startsAt = new Date().toISOString();

  const mutation = `
    mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        automaticAppDiscount {
          discountId
          title
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphql(mutation, {
    automaticAppDiscount: {
      title: AUTOMATIC_DISCOUNT_TITLE,
      functionId,
      startsAt,
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: false,
        shippingDiscounts: true
      },
      discountClasses: ["PRODUCT"]
    }
  }, shopDomain);

  const result = data.discountAutomaticAppCreate;
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((error) => error.message).join(" "));
  }

  return result.automaticAppDiscount;
}

async function syncDiscountRules(rules, shopDomain = SHOP_DOMAIN) {
  const enrichedRules = await enrichDiscountRules(rules, shopDomain);
  let discountError = null;

  try {
    await ensureDiscountRulesMetafieldDefinition(shopDomain);
  } catch (error) {
    console.warn("No se pudo asegurar la definicion del metafield de descuento:", error.message);
  }

  let discountNode = null;
  try {
    discountNode = await findAutomaticQuantityDiscount(shopDomain);
    const activeFunctionId = await resolveDiscountFunctionId(shopDomain);
    const linkedFunctionId = discountNode?.discount?.appDiscountType?.functionId || "";

    if (
      !discountNode ||
      discountNode.discount?.status !== "ACTIVE" ||
      !functionIdsMatch(linkedFunctionId, activeFunctionId)
    ) {
      await ensureAutomaticQuantityDiscount(shopDomain);
      discountNode = await findAutomaticQuantityDiscount(shopDomain);
    }
  } catch (error) {
    discountError = error.message;
    console.warn("No se pudo verificar el descuento automatico:", error.message);
  }

  let slimRules = null;
  if (discountNode?.id) {
    slimRules = await setDiscountNodeRulesMetafield(enrichedRules, discountNode.id, shopDomain);
  } else {
    discountError = discountError || "No hay descuento automatico ACTIVE para la Function.";
    console.warn("Reglas sin metafield de checkout:", discountError);
  }

  try {
    await setShopDiscountRulesMetafield(slimRules || slimRulesForFunction(enrichedRules), shopDomain);
  } catch (error) {
    console.warn("No se pudo guardar respaldo de reglas en shop metafield:", error.message);
  }

  const discount = discountNode?.discount || null;
  const effectiveRules = slimRules || slimRulesForFunction(enrichedRules);
  const nativeFunctionActive = discount?.status === "ACTIVE" && !discountError;
  return {
    rulesCount: enrichedRules.length,
    collectionIds: collectRuleCollectionIds(effectiveRules),
    ruleTags: collectRuleTags(effectiveRules),
    discountStatus: discount?.status || null,
    discountId: discount?.discountId || null,
    discountNodeId: discountNode?.id || null,
    discountError,
    checkoutMode: nativeFunctionActive ? "native_function" : "draft_invoice",
    rulesSource: discountNode?.id ? "discount_node" : "shop_metafield",
    shop: shopDomain
  };
}

function titleMatchesPrefixes(title, prefixes) {
  const normalizedTitle = String(title || "").trim();
  if (!normalizedTitle || !prefixes?.length) {
    return false;
  }
  return prefixes.some((prefix) => {
    const needle = String(prefix || "").trim();
    return needle && normalizedTitle.toLowerCase().startsWith(needle.toLowerCase());
  });
}

function findMatchingTier(ranges, quantity) {
  const qty = Number(quantity || 0);
  let match = null;
  for (const tier of ranges || []) {
    const min = Number(tier.min || 0);
    const max = Number(tier.max || 999999);
    if (qty >= min && qty <= max) {
      match = tier;
    }
  }
  return match;
}

function applyTierToUnitCents(originalUnitCents, tier) {
  if (!tier) {
    return originalUnitCents;
  }
  const type = tier.type || "fixed_price_per_item";
  const value = Number(tier.value || 0);
  if (type === "fixed_price_per_item") {
    return value;
  }
  if (type === "percentage") {
    return Math.round(originalUnitCents * (1 - value / 100));
  }
  if (type === "fixed_discount") {
    return Math.max(0, originalUnitCents - value);
  }
  return originalUnitCents;
}

async function fetchProductCollectionIds(productIds, shopDomain = SHOP_DOMAIN) {
  const unique = [...new Set((productIds || []).map(String).filter(Boolean))];
  /** @type {Record<string, string[]>} */
  const byProduct = {};
  if (!unique.length) {
    return byProduct;
  }

  // Admin API: hasta ~50 ids por query de products.
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const queryParts = chunk
      .map((id, index) => {
        const gid = id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
        return `p${index}: product(id: "${gid}") { id collections(first: 50) { nodes { id } } }`;
      })
      .join("\n");
    const data = await shopifyGraphql(`query { ${queryParts} }`, {}, shopDomain);
    chunk.forEach((id, index) => {
      const node = data[`p${index}`];
      const numeric = String(id).replace(/.*\//, "");
      const collectionIds = (node?.collections?.nodes || [])
        .map((collection) => toCollectionGid(collection.id))
        .filter(Boolean);
      byProduct[numeric] = collectionIds;
      byProduct[id] = collectionIds;
    });
  }

  return byProduct;
}

async function fetchProductTags(productIds, shopDomain = SHOP_DOMAIN) {
  const unique = [...new Set((productIds || []).map(String).filter(Boolean))];
  /** @type {Record<string, string[]>} */
  const byProduct = {};
  if (!unique.length) {
    return byProduct;
  }

  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const queryParts = chunk
      .map((id, index) => {
        const gid = id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
        return `p${index}: product(id: "${gid}") { id tags }`;
      })
      .join("\n");
    const data = await shopifyGraphql(`query { ${queryParts} }`, {}, shopDomain);
    chunk.forEach((id, index) => {
      const node = data[`p${index}`];
      const numeric = String(id).replace(/.*\//, "");
      const tags = (node?.tags || []).map((tag) => String(tag || "").trim()).filter(Boolean);
      byProduct[numeric] = tags;
      byProduct[id] = tags;
    });
  }

  return byProduct;
}

function parseJsonMetafield(metafield) {
  if (!metafield) {
    return null;
  }
  if (metafield.jsonValue != null) {
    return metafield.jsonValue;
  }
  if (typeof metafield.value === "string" && metafield.value) {
    try {
      return JSON.parse(metafield.value);
    } catch {
      return null;
    }
  }
  return null;
}

async function loadShopDiscountRulesMetafield(shopDomain = SHOP_DOMAIN) {
  const query = `
    query shopDiscountRules {
      shop {
        id
        rules: metafield(namespace: "${DISCOUNT_RULES_NAMESPACE}", key: "${DISCOUNT_RULES_KEY}") {
          jsonValue
          value
        }
      }
    }
  `;
  const data = await shopifyGraphql(query, {}, shopDomain);
  const rulesValue = parseJsonMetafield(data.shop?.rules);
  const rules = Array.isArray(rulesValue) ? rulesValue : [];
  return { rules, shopId: data.shop?.id || null };
}

async function loadCheckoutRules(shopDomain = SHOP_DOMAIN) {
  const discountNode = await findAutomaticQuantityDiscount(shopDomain);

  if (discountNode?.id) {
    const query = `
      query discountRules($id: ID!) {
        discountNode(id: $id) {
          id
          rules: metafield(namespace: "$app", key: "discount_rules") { jsonValue value }
          functionInput: metafield(namespace: "$app", key: "function_input") { jsonValue value }
        }
      }
    `;
    const data = await shopifyGraphql(query, { id: discountNode.id }, shopDomain);
    const node = data.discountNode || {};
    const rulesValue = parseJsonMetafield(node.rules);
    const functionInput = parseJsonMetafield(node.functionInput);
    const rules = Array.isArray(rulesValue) ? rulesValue : [];
    if (rules.length) {
      return { rules, discountNode, functionInput, source: "discount_node" };
    }
  }

  const shopLoaded = await loadShopDiscountRulesMetafield(shopDomain);
  const rules = shopLoaded.rules || [];
  const collectionIds = collectRuleCollectionIds(rules);
  const ruleTags = collectRuleTags(rules);
  return {
    rules,
    discountNode: discountNode || null,
    functionInput: { ruleTags, collectionIds },
    source: rules.length ? "shop_metafield" : "none"
  };
}

async function previewCartDiscounts(body, shopDomain = SHOP_DOMAIN) {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) {
    return {
      lineItems: [],
      originalSubtotal: 0,
      subtotal: 0,
      discountTotal: 0
    };
  }

  let rules = normalizeRulesPayload(body);
  if (!rules.length) {
    const loaded = await loadCheckoutRules(shopDomain);
    rules = loaded.rules;
  } else {
    rules = await enrichDiscountRules(rules, shopDomain);
    rules = slimRulesForFunction(rules);
  }

  rules = (rules || [])
    .filter((rule) => rule && rule.enabled !== false)
    .filter((rule) => {
      const scope = String(rule.scope || "pack").toLowerCase();
      if (body.includePackRules === true || body.packLabel || body.invoiceCheckout === true) {
        return scope === "storefront" || scope === "both" || scope === "pack";
      }
      return scope === "storefront" || scope === "both";
    })
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));

  const productIds = items.map((item) => String(item.product_id || item.productId || "")).filter(Boolean);
  const needsCollections = rules.some((rule) => (rule.filter || {}).type === "collection");
  const needsTags = rules.some((rule) => (rule.filter || {}).type === "tag");
  const membership = needsCollections ? await fetchProductCollectionIds(productIds, shopDomain) : {};
  const tagsByProduct = needsTags ? await fetchProductTags(productIds, shopDomain) : {};

  const normalized = items.map((item) => {
    const quantity = Number(item.quantity || 1);
    let unitPrice = Number(item.unit_price ?? item.unitPrice ?? item.price ?? 0);
    // /cart.js usa centavos Shopify. Si viene en pesos (< 100000), alinear a centavos.
    if (unitPrice > 0 && unitPrice < 100000) {
      unitPrice *= 100;
    }
    const productId = String(item.product_id || item.productId || "");
    const numericId = productId.replace(/.*\//, "");
    const title = String(item.title || item.product_title || "");
    return {
      key: item.key || "",
      productId,
      quantity,
      title,
      originalUnitPrice: unitPrice,
      unitPrice,
      memberCollectionIds: membership[productId] || membership[numericId] || [],
      memberTags: tagsByProduct[productId] || tagsByProduct[numericId] || item.tags || [],
      price: unitPrice * quantity
    };
  });

  /** @type {Record<string, number[]>} */
  const groups = {};
  rules.forEach((rule) => {
    groups[String(rule.id || "")] = [];
  });

  normalized.forEach((item, index) => {
    for (const rule of rules) {
      const filter = rule.filter || {};
      const filterType = filter.type || "collection";
      let matched = false;

      if (filterType === "tag") {
        const ruleTags = [filter.tag, ...(Array.isArray(filter.tags) ? filter.tags : [])]
          .map((tag) => String(tag || "").trim().toLowerCase())
          .filter(Boolean);
        const memberTags = (item.memberTags || []).map((tag) => String(tag || "").trim().toLowerCase());
        const byTag = ruleTags.some((tag) => memberTags.indexOf(tag) !== -1);
        const byTitle = titleMatchesPrefixes(item.title, filter.title_prefixes || []);
        matched = byTag || byTitle;
      } else if (filterType === "collection") {
        const ruleCollectionIds = [
          ...(filter.collection_ids || []),
          filter.collection_id || ""
        ]
          .map(toCollectionGid)
          .filter(Boolean);
        const memberSet = new Set((item.memberCollectionIds || []).map(toCollectionGid));
        const inCollection = ruleCollectionIds.some((id) => memberSet.has(id));
        const byTitle = titleMatchesPrefixes(item.title, filter.title_prefixes || []);
        matched = inCollection || byTitle;
      }

      if (!matched) {
        continue;
      }
      groups[String(rule.id || "")].push(index);
      break;
    }
  });

  rules.forEach((rule) => {
    const indices = groups[String(rule.id || "")] || [];
    if (!indices.length) {
      return;
    }
    const matchedQuantity = indices.reduce((sum, index) => sum + normalized[index].quantity, 0);
    const countMode = rule.count_mode || "filter_set";

    if (countMode === "individual_product") {
      indices.forEach((index) => {
        const item = normalized[index];
        const tier = findMatchingTier(rule.ranges, item.quantity);
        if (!tier) {
          return;
        }
        const unitPrice = applyTierToUnitCents(item.originalUnitPrice, tier);
        normalized[index] = {
          ...item,
          unitPrice,
          price: unitPrice * item.quantity,
          compareAtUnitPrice: item.originalUnitPrice,
          ruleId: rule.id
        };
      });
      return;
    }

    const tier = findMatchingTier(rule.ranges, matchedQuantity);
    if (!tier) {
      return;
    }
    indices.forEach((index) => {
      const item = normalized[index];
      const unitPrice = applyTierToUnitCents(item.originalUnitPrice, tier);
      normalized[index] = {
        ...item,
        unitPrice,
        price: unitPrice * item.quantity,
        compareAtUnitPrice: item.originalUnitPrice,
        ruleId: rule.id
      };
    });
  });

  const originalSubtotal = normalized.reduce((sum, item) => sum + item.originalUnitPrice * item.quantity, 0);
  const subtotal = normalized.reduce((sum, item) => sum + item.price, 0);

  return {
    lineItems: normalized,
    originalSubtotal,
    subtotal,
    discountTotal: Math.max(0, originalSubtotal - subtotal),
    rulesCount: rules.length
  };
}

async function handleSyncRules(req, res) {
  try {
    if (!verifyProxySignature(req.query)) {
      return res.status(401).json({ error: "Firma de app proxy invalida." });
    }

    const shopDomain = resolveShopDomain(req);
    const body = parseProxyBody(req);
    const rules = normalizeRulesPayload(body);

    if (!rules.length) {
      return res.status(400).json({ error: "No se recibieron reglas de descuento." });
    }

    const result = await syncDiscountRules(rules, shopDomain);
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("Sync discount rules failed:", error.message);
    return res.status(400).json({ error: error.message || "No se pudieron sincronizar las reglas." });
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    shop: SHOP_DOMAIN,
    appUrl: APP_URL,
    offlineShops: [...offlineTokenByShop.keys()],
    hasClientId: Boolean(CLIENT_ID)
  });
});

app.get("/auth/install", (req, res) => {
  try {
    const shop =
      (typeof req.query.shop === "string" && req.query.shop.endsWith(".myshopify.com") && req.query.shop) ||
      "caletzza.myshopify.com";
    const url = buildInstallUrl(shop);
    const noRedirect =
      req.query.no_redirect === "true" ||
      req.query.no_redirect === "1" ||
      req.query.no_redirect === "yes";

    if (noRedirect) {
      const storeHandle = shop.replace(".myshopify.com", "");
      return res.json({
        ok: true,
        shop,
        installUrl: url,
        managedInstallUrl: `https://admin.shopify.com/store/${storeHandle}/oauth/install?client_id=${CLIENT_ID}`,
        callback: `${APP_URL}/auth/callback`,
        note: "Abre installUrl o managedInstallUrl estando logueado como staff. Tras Instalar, /auth/callback guarda el token offline."
      });
    }

    return res.redirect(302, url);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/auth/callback", async (req, res) => {
  try {
    const shop = typeof req.query.shop === "string" ? req.query.shop : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!shop.endsWith(".myshopify.com") || !code) {
      return res.status(400).send("Faltan shop o code en el callback OAuth.");
    }
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).send("El servidor no tiene SHOPIFY_CLIENT_ID/SECRET configurados.");
    }

    const tokenPayload = await exchangeOAuthCode(shop, code);
    setOfflineToken(shop, tokenPayload.access_token);

    let syncResult = null;
    let syncError = null;
    try {
      // Activa el descuento automatico ligado a la Function; el tema sincroniza reglas al cargar.
      await ensureAutomaticQuantityDiscount(shop);
      const node = await findAutomaticQuantityDiscount(shop);
      syncResult = {
        shop,
        discountStatus: node?.discount?.status || null,
        discountNodeId: node?.id || null
      };
    } catch (error) {
      syncError = error.message;
    }

    const adminDiscounts = `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/discounts`;
    const storefront = `https://${shop}`;
    return res
      .status(200)
      .type("html")
      .send(`<!doctype html><html><head><meta charset="utf-8"><title>COD Express instalado</title></head>
<body style="font-family:system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem">
  <h1>App instalada en ${shop}</h1>
  <p>Token offline guardado en memoria. Scopes: <code>${tokenPayload.scope || OAUTH_SCOPES}</code></p>
  <p><strong>Importante (Render):</strong> el disco es efímero. Copia el token a la variable de entorno
     <code>SHOPIFY_OFFLINE_TOKEN_CALETZZA</code> del servicio para que no se pierda al redesplegar:</p>
  <pre style="white-space:pre-wrap;word-break:break-all;background:#f4f4f4;padding:0.75rem">${tokenPayload.access_token}</pre>
  <p>Sync Function: ${syncError ? `aviso — ${syncError}` : "OK"} ${syncResult ? JSON.stringify(syncResult) : ""}</p>
  <p>Si la Function no activa (tienda no Plus), el carrito usa checkout por borrador con descuento (invoiceUrl).</p>
  <p><a href="${storefront}">Ir a la tienda</a> · <a href="${adminDiscounts}">Ver descuentos</a></p>
</body></html>`);
  } catch (error) {
    console.error("OAuth callback failed:", error.message);
    return res.status(400).send(`Error OAuth: ${error.message}`);
  }
});

app.get("/install-caletzza", (_req, res) => {
  try {
    const shop = "caletzza.myshopify.com";
    // Prefer managed install URL; fallback authorize.
    const managed = `https://admin.shopify.com/store/caletzza/oauth/install?client_id=${CLIENT_ID}`;
    const authorize = buildInstallUrl(shop);
    return res.json({
      ok: true,
      shop,
      managedInstallUrl: managed,
      authorizeUrl: authorize,
      callback: `${APP_URL}/auth/callback`,
      note: "Abre managedInstallUrl estando logueado como staff de caletzza. Tras instalar, el callback guarda el token y activa el descuento."
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/activate-discount", async (req, res) => {
  try {
    const shopDomain = resolveShopDomain(req);
    if (!getOfflineToken(shopDomain)) {
      return res.status(401).json({
        ok: false,
        error: "No hay token offline para esta tienda. Completa OAuth en /auth/install primero."
      });
    }

    let discountError = null;
    let discount = null;
    try {
      discount = await ensureAutomaticQuantityDiscount(shopDomain);
    } catch (error) {
      discountError = error.message;
    }

    const discountNode = await findAutomaticQuantityDiscount(shopDomain);
    const loaded = await loadCheckoutRules(shopDomain);
    const nativeFunctionActive =
      discountNode?.discount?.status === "ACTIVE" && !discountError;

    return res.json({
      ok: true,
      shop: shopDomain,
      discountStatus: discountNode?.discount?.status || discount?.status || null,
      discountNodeId: discountNode?.id || null,
      discountError,
      checkoutMode: nativeFunctionActive ? "native_function" : "draft_invoice",
      rulesCount: loaded.rules.length,
      rulesSource: loaded.source || "none"
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/discount-status", async (req, res) => {
  try {
    const shopDomain = resolveShopDomain(req);
    const discountNode = await findAutomaticQuantityDiscount(shopDomain);
    const loaded = await loadCheckoutRules(shopDomain);
    const collectionIds = collectRuleCollectionIds(loaded.rules);
    const ruleTags = collectRuleTags(loaded.rules);
    const nativeFunctionActive = discountNode?.discount?.status === "ACTIVE";
    return res.json({
      ok: true,
      shop: shopDomain,
      hasOfflineToken: Boolean(getOfflineToken(shopDomain)),
      discountNodeId: discountNode?.id || null,
      discountStatus: discountNode?.discount?.status || null,
      discountTitle: discountNode?.discount?.title || null,
      functionId: discountNode?.discount?.appDiscountType?.functionId || null,
      checkoutMode: nativeFunctionActive ? "native_function" : "draft_invoice",
      rulesSource: loaded.source || "none",
      rulesCount: loaded.rules.length,
      collectionIds,
      ruleTags,
      functionInput: loaded.functionInput || { ruleTags, collectionIds },
      rules: loaded.rules.map((rule) => ({
        id: rule.id,
        title: rule.title,
        scope: rule.scope,
        type: rule.filter?.type,
        tag: rule.filter?.tag,
        tags: rule.filter?.tags || [],
        collection: rule.filter?.collection,
        collection_ids: rule.filter?.collection_ids || [],
        title_prefixes: rule.filter?.title_prefixes || [],
        ranges: rule.ranges || []
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

async function handlePreviewDiscounts(req, res, { requireProxy = false } = {}) {
  try {
    if (requireProxy && !verifyProxySignature(req.query)) {
      return res.status(401).json({ error: "Firma de app proxy invalida." });
    }
    const body = requireProxy ? parseProxyBody(req) : req.body || {};
    const shopDomain = resolveShopDomain(req);
    const result = await previewCartDiscounts(body, shopDomain);
    return res.json({ ok: true, shop: shopDomain, ...result });
  } catch (error) {
    console.error("Preview discounts failed:", error.message);
    return res.status(400).json({ error: error.message || "No se pudo calcular el preview." });
  }
}

async function handleDiscountedCheckout(req, res, { requireProxy = false } = {}) {
  try {
    if (requireProxy && !verifyProxySignature(req.query)) {
      return res.status(401).json({ error: "Firma de app proxy invalida." });
    }
    const body = requireProxy ? parseProxyBody(req) : req.body || {};
    const shopDomain = resolveShopDomain(req);
    const result = await createDiscountedInvoiceCheckout(body, shopDomain);
    return res.json(result);
  } catch (error) {
    console.error("Discounted checkout failed:", error.message);
    return res.status(400).json({ error: error.message || "No se pudo crear el checkout con descuento." });
  }
}

app.post(["/proxy/order", "/proxy/order/", "/proxy/order/order", "/proxy/order/order/"], handleProxyOrder);
app.post(
  [
    "/proxy/sync-rules",
    "/proxy/sync-rules/",
    "/proxy/order/sync-rules",
    "/proxy/order/sync-rules/"
  ],
  handleSyncRules
);
app.post(
  ["/proxy/preview-discounts", "/proxy/preview-discounts/", "/proxy/order/preview-discounts", "/proxy/order/preview-discounts/"],
  (req, res) => handlePreviewDiscounts(req, res, { requireProxy: true })
);
app.post(
  [
    "/proxy/checkout",
    "/proxy/checkout/",
    "/proxy/order/checkout",
    "/proxy/order/checkout/"
  ],
  (req, res) => handleDiscountedCheckout(req, res, { requireProxy: true })
);

app.post("/sync-rules", async (req, res) => {
  try {
    const rules = normalizeRulesPayload(req.body);
    if (!rules.length) {
      return res.status(400).json({ error: "No se recibieron reglas de descuento." });
    }
    const shopDomain = resolveShopDomain(req);
    const result = await syncDiscountRules(rules, shopDomain);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ error: error.message || "No se pudieron sincronizar las reglas." });
  }
});

app.post("/preview-discounts", (req, res) => handlePreviewDiscounts(req, res, { requireProxy: false }));

app.post("/checkout", (req, res) => handleDiscountedCheckout(req, res, { requireProxy: false }));

app.post("/order", async (req, res) => {
  try {
    const body = req.body || {};
    const shopDomain = resolveShopDomain(req);

    if (body.action === "mercadopago_config") {
      if (!MP_PUBLIC_KEY) {
        return res.status(400).json({
          error: "Falta MERCADOPAGO_PUBLIC_KEY en la app COD Express."
        });
      }
      return res.json({
        ok: true,
        publicKey: MP_PUBLIC_KEY,
        gatewayName: MP_GATEWAY_NAME,
        shop: shopDomain
      });
    }

    if (body.action === "mercadopago_pay" || body.paymentMethod === "mercadopago") {
      const result = await processMercadoPagoExpressPayment(body, shopDomain);
      return res.json(result);
    }

    if (
      body.action === "discounted_checkout" ||
      body.mode === "draft_invoice" ||
      body.invoiceCheckout === true ||
      body.paymentMethod === "online"
    ) {
      const result = await createDiscountedInvoiceCheckout(body, shopDomain);
      return res.json(result);
    }

    const result = await createCodOrder(body, shopDomain);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || "No se pudo crear el pedido." });
  }
});

app.listen(PORT, () => {
  console.log(`COD Express listening on :${PORT} for ${SHOP_DOMAIN}`);
});
