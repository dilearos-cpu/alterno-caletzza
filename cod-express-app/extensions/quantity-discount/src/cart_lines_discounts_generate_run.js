import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";

/**
 * @typedef {object} Tier
 * @property {number} min
 * @property {number} max
 * @property {string} type
 * @property {number} value
 * @property {string} [label]
 */

/**
 * @typedef {object} DiscountRule
 * @property {string} [id]
 * @property {string} [title]
 * @property {boolean} [enabled]
 * @property {string} [scope]
 * @property {number} [priority]
 * @property {boolean} [exclusive]
 * @property {string} [count_mode]
 * @property {{ type?: string, collection?: string, collections?: string[], collection_id?: string, collection_ids?: string[], product_id?: string|number, product_handle?: string, product_ids?: (string|number)[], title_prefixes?: string[], tag?: string }} [filter]
 * @property {Tier[]} [ranges]
 * @property {{ type?: string, value?: string|number }[]} [conditions]
 */

/**
 * @param {unknown} value
 * @param {number} [fallback]
 */
function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {unknown} value
 */
function toLower(value) {
  return String(value || "").toLowerCase();
}

/**
 * @param {unknown} value
 */
function normalizeExclusive(value) {
  if (value === true || value === 1) {
    return true;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return false;
}

/**
 * @param {unknown} scope
 */
function normalizeScope(scope) {
  const value = String(scope || "pack").toLowerCase();
  if (value === "storefront" || value === "pack" || value === "both") {
    return value;
  }
  return "pack";
}

/**
 * @param {DiscountRule} rule
 */
function normalizeFilter(rule) {
  const filter = rule.filter || {};
  if (filter.type) {
    return filter;
  }
  if (filter.collection) {
    return {
      type: "collection",
      collection: filter.collection,
      collections: filter.collections || [filter.collection],
      product_ids: filter.product_ids || []
    };
  }
  return { type: "all_products" };
}

/**
 * @param {string} gid
 */
function numericIdFromGid(gid) {
  const match = String(gid || "").match(/\/(\d+)$/);
  return match ? match[1] : "";
}

/**
 * @param {string} title
 * @param {string[]} prefixes
 */
function titleMatchesPrefixes(title, prefixes) {
  const normalizedTitle = String(title || "").trim();
  if (!normalizedTitle || !prefixes.length) {
    return false;
  }

  return prefixes.some((prefix) => {
    const needle = String(prefix || "").trim();
    return needle && normalizedTitle.toLowerCase().startsWith(needle.toLowerCase());
  });
}

/**
 * Match title_prefixes against title OR handle (cuando el input no trae title).
 * @param {string} title
 * @param {string} handle
 * @param {string[]} prefixes
 */
function textMatchesPrefixes(title, handle, prefixes) {
  if (titleMatchesPrefixes(title, prefixes)) {
    return true;
  }
  const normalizedHandle = String(handle || "").trim().toLowerCase().replace(/-/g, " ");
  if (!normalizedHandle || !prefixes.length) {
    return false;
  }
  return prefixes.some((prefix) => {
    const needle = String(prefix || "").trim().toLowerCase();
    return needle && (normalizedHandle.startsWith(needle) || normalizedHandle.includes(` ${needle}`) || normalizedHandle.includes(needle));
  });
}

/**
 * @param {unknown} value
 */
function toIdSet(value) {
  /** @type {Set<string>} */
  const ids = new Set();
  (Array.isArray(value) ? value : []).forEach((id) => {
    const raw = String(id || "").trim();
    if (!raw) {
      return;
    }
    ids.add(raw);
    const numeric = numericIdFromGid(raw);
    if (numeric) {
      ids.add(numeric);
    }
  });
  return ids;
}

/**
 * @param {unknown} value
 */
function toTagSet(value) {
  /** @type {Set<string>} */
  const tags = new Set();
  (Array.isArray(value) ? value : []).forEach((tag) => {
    const normalized = toLower(String(tag || "").trim());
    if (normalized) {
      tags.add(normalized);
    }
  });
  return tags;
}

/**
 * @param {DiscountRule} rule
 * @param {{ productId?: string, productHandle?: string, title?: string, productTitle?: string, memberCollectionIds?: string[], memberTags?: string[] }} productContext
 */
function matchesFilter(rule, productContext) {
  const filter = normalizeFilter(rule);
  const filterType = filter.type || "all_products";

  if (filterType === "all_products") {
    return true;
  }

  const contextId = String(productContext.productId || "");
  const contextHandle = toLower(productContext.productHandle || "");
  const contextTitle = String(productContext.productTitle || productContext.title || "");
  const memberCollectionIds = toIdSet(productContext.memberCollectionIds || []);
  const memberTags = toTagSet(productContext.memberTags || []);

  if (filterType === "tag") {
    // Primario: hasTags nativo de la Function (escala a cualquier tamaño).
    const ruleTags = toTagSet([
      filter.tag || "",
      ...((filter.tags || []))
    ]);
    for (const tag of ruleTags) {
      if (memberTags.has(tag)) {
        return true;
      }
    }
    // Secundario: membresía de colección conocida (Bodys/Básicas).
    const ruleCollectionIds = toIdSet([
      ...(filter.collection_ids || []),
      filter.collection_id || ""
    ]);
    for (const collectionId of ruleCollectionIds) {
      if (memberCollectionIds.has(collectionId)) {
        return true;
      }
    }
    // Terciario: prefijo de título del editor del tema.
    const prefixes = (filter.title_prefixes || []).map(String).filter(Boolean);
    if (textMatchesPrefixes(contextTitle, contextHandle, prefixes)) {
      return true;
    }
    // Respaldo: handle del producto (p.ej. body-una-tira) vs colección/tag.
    const handles = [
      filter.collection,
      ...(Array.isArray(filter.collections) ? filter.collections : []),
      filter.tag || "",
      ...((filter.tags || []))
    ]
      .map((handle) => toLower(String(handle || "").replace(/^caletzza-/, "")))
      .filter(Boolean);
    if (contextHandle && handles.some((handle) => {
      // bodys ↔ body-una-tira
      const stem = handle.endsWith("s") ? handle.slice(0, -1) : handle;
      return contextHandle.includes(handle) || (stem && contextHandle.includes(stem));
    })) {
      return true;
    }
    // Respaldo positivo de IDs chicos; miss no rechaza.
    const productIds = toIdSet(filter.product_ids || []);
    if (contextId && productIds.has(contextId)) {
      return true;
    }
    return false;
  }

  if (filterType === "collection") {
    const ruleCollectionIds = toIdSet([
      ...(filter.collection_ids || []),
      filter.collection_id || ""
    ]);
    for (const collectionId of ruleCollectionIds) {
      if (memberCollectionIds.has(collectionId)) {
        return true;
      }
    }

    const prefixes = (filter.title_prefixes || []).map(String).filter(Boolean);
    if (textMatchesPrefixes(contextTitle, contextHandle, prefixes)) {
      return true;
    }

    // Respaldo: handle de colección / producto cuando inCollections no viene en el input.
    const handles = [
      filter.collection,
      ...(Array.isArray(filter.collections) ? filter.collections : [])
    ]
      .map((handle) => toLower(handle))
      .filter(Boolean);
    if (contextHandle && handles.some((handle) => {
      const stem = handle.endsWith("s") ? handle.slice(0, -1) : handle;
      return contextHandle.includes(handle) || (stem && contextHandle.includes(stem));
    })) {
      return true;
    }

    const productIds = toIdSet(filter.product_ids || []);
    if (contextId && productIds.has(contextId)) {
      return true;
    }

    return false;
  }

  if (filterType === "product") {
    const productIds = toIdSet(filter.product_ids || []);
    if (contextId && productIds.has(contextId)) {
      return true;
    }
    const productId = String(filter.product_id || "");
    const productHandle = toLower(filter.product_handle || "");
    return (
      (productId && contextId && contextId === productId) ||
      (productHandle && contextHandle && contextHandle === productHandle)
    );
  }

  return false;
}

/**
 * @param {Tier[]} ranges
 * @param {number} quantity
 */
function findMatchingTier(ranges, quantity) {
  const qty = toNumber(quantity, 0);
  let match = null;
  for (const tier of ranges || []) {
    const min = toNumber(tier.min, 0);
    const max = toNumber(tier.max, 999999);
    if (qty >= min && qty <= max) {
      match = tier;
    }
  }
  return match;
}

/**
 * @param {number} originalUnitPrice
 * @param {Tier|null} tier
 */
function applyTierToUnitPrice(originalUnitPrice, tier) {
  if (!tier) {
    return originalUnitPrice;
  }

  const type = tier.type || "fixed_price_per_item";
  const value = toNumber(tier.value, 0) / 100;

  if (type === "fixed_price_per_item") {
    return value;
  }

  if (type === "percentage") {
    return originalUnitPrice * (1 - value / 100);
  }

  if (type === "fixed_discount") {
    return Math.max(0, originalUnitPrice - value);
  }

  return originalUnitPrice;
}

/**
 * @param {DiscountRule} rule
 * @param {{ paymentMethod?: string, totalQuantity?: number }} context
 */
function matchesConditions(rule, context) {
  const conditions = rule.conditions || [];
  if (!conditions.length) {
    return true;
  }

  return conditions.every((condition) => {
    if (!condition || !condition.type) {
      return true;
    }

    if (condition.type === "payment_method") {
      return String(context.paymentMethod || "") === String(condition.value || "");
    }

    if (condition.type === "min_quantity") {
      return toNumber(context.totalQuantity, 0) >= toNumber(condition.value, 0);
    }

    return true;
  });
}

/**
 * @param {DiscountRule[]} sortedRules
 * @param {{ productId?: string, productHandle?: string, quantity?: number, memberCollectionIds?: string[], memberTags?: string[], productTitle?: string, title?: string }} productContext
 * @param {{ paymentMethod?: string }} context
 */
function findBestRuleForItem(sortedRules, productContext, context) {
  for (const rule of sortedRules) {
    if (!matchesFilter(rule, productContext)) {
      continue;
    }

    if (
      !matchesConditions(rule, {
        paymentMethod: context.paymentMethod || "online",
        totalQuantity: toNumber(productContext.quantity, 1)
      })
    ) {
      continue;
    }

    return rule;
  }

  return null;
}

/**
 * @param {import("../generated/api").CartInput["cart"]["lines"]} cartLines
 * @param {DiscountRule[]} rules
 */
function buildDiscountCandidates(cartLines, rules) {
  /** @type {{ key: string, lineId: string, quantity: number, title: string, originalUnitPrice: number, unitPrice: number, productId: string, productHandle: string, productTitle: string, memberCollectionIds: string[], memberTags: string[] }[]} */
  const itemState = cartLines.map((line) => {
    const merchandise = line.merchandise;
    const product =
      merchandise && merchandise.__typename === "ProductVariant" ? merchandise.product : null;
    const originalUnitPrice = toNumber(line.cost?.amountPerQuantity?.amount, 0);
    const memberCollectionIds = (product?.inCollections || [])
      .filter((entry) => entry && entry.isMember)
      .map((entry) => String(entry.collectionId || ""))
      .filter(Boolean);
    const memberTags = (product?.hasTags || [])
      .filter((entry) => entry && entry.hasTag)
      .map((entry) => String(entry.tag || ""))
      .filter(Boolean);

    return {
      key: line.id,
      lineId: line.id,
      quantity: toNumber(line.quantity, 1),
      title: product ? String(product.title || "") : "",
      originalUnitPrice,
      unitPrice: originalUnitPrice,
      productId: product ? numericIdFromGid(product.id) : "",
      productHandle: product ? String(product.handle || "") : "",
      productTitle: product ? String(product.title || "") : "",
      memberCollectionIds,
      memberTags
    };
  });

  // Toda regla en el metafield del descuento aplica en checkout.
  // El scope (storefront/pack/both) solo filtra la UI del tema; no bloquear aquí.
  const sortedRules = rules
    .filter((rule) => rule && rule.enabled !== false)
    .sort((a, b) => toNumber(b.priority, 0) - toNumber(a.priority, 0));

  /** @type {Record<string, number[]>} */
  const groups = {};
  sortedRules.forEach((rule) => {
    groups[String(rule.id || "")] = [];
  });

  itemState.forEach((item, index) => {
    const rule = findBestRuleForItem(
      sortedRules,
      {
        productId: item.productId,
        productHandle: item.productHandle,
        productTitle: item.productTitle,
        title: item.title,
        quantity: item.quantity,
        memberCollectionIds: item.memberCollectionIds,
        memberTags: item.memberTags
      },
      { paymentMethod: "online" }
    );
    if (!rule) {
      return;
    }
    groups[String(rule.id || "")].push(index);
  });

  sortedRules.forEach((rule) => {
    const indices = groups[String(rule.id || "")] || [];
    if (!indices.length) {
      return;
    }

    const matchedQuantity = indices.reduce((sum, index) => {
      return sum + itemState[index].quantity;
    }, 0);

    if (
      !matchesConditions(rule, {
        paymentMethod: "online",
        totalQuantity: matchedQuantity
      })
    ) {
      return;
    }

    const countMode = rule.count_mode || "filter_set";

    if (countMode === "individual_product") {
      indices.forEach((index) => {
        const item = itemState[index];
        const tier = findMatchingTier(rule.ranges, item.quantity);
        if (!tier) {
          return;
        }
        const unitPrice = applyTierToUnitPrice(item.originalUnitPrice, tier);
        if (unitPrice < item.unitPrice) {
          itemState[index] = Object.assign({}, item, { unitPrice });
        }
      });
      return;
    }

    const tier = findMatchingTier(rule.ranges, matchedQuantity);
    if (!tier) {
      return;
    }

    indices.forEach((index) => {
      const item = itemState[index];
      const unitPrice = applyTierToUnitPrice(item.originalUnitPrice, tier);
      if (unitPrice < item.unitPrice) {
        itemState[index] = Object.assign({}, item, { unitPrice });
      }
    });
  });

  /** @type {import("../generated/api").ProductDiscountCandidate[]} */
  const candidates = [];

  itemState.forEach((item) => {
    const discountPerUnit = item.originalUnitPrice - item.unitPrice;
    if (discountPerUnit <= 0.0001) {
      return;
    }

    candidates.push({
      message: "Descuento por cantidad",
      targets: [
        {
          cartLine: {
            id: item.lineId
          }
        }
      ],
      value: {
        fixedAmount: {
          amount: String(discountPerUnit),
          appliesToEachItem: true
        }
      }
    });
  });

  return candidates;
}

/**
 * @param {unknown} metafield
 * @returns {DiscountRule[]}
 */
function parseRulesMetafield(metafield) {
  if (!metafield || typeof metafield !== "object") {
    return [];
  }

  const field = /** @type {{ jsonValue?: unknown, value?: string }} */ (metafield);

  if (Array.isArray(field.jsonValue)) {
    return field.jsonValue;
  }

  if (typeof field.jsonValue === "string") {
    try {
      const parsed = JSON.parse(field.jsonValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  if (typeof field.value === "string" && field.value) {
    try {
      const parsed = JSON.parse(field.value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * @param {import("../generated/api").CartInput} input
 * @returns {DiscountRule[]}
 */
function readRulesFromInput(input) {
  const discount = input?.discount || {};
  // Orden: app-owned en discount → shop caletzza (lo que esta tienda ya entrega).
  const candidates = [
    discount.metafield,
    input?.shop?.metafield
  ];

  for (const metafield of candidates) {
    const rules = parseRulesMetafield(metafield);
    if (rules.length) {
      return rules;
    }
  }

  return [];
}

/**
 * @param {import("../generated/api").CartInput} input
 */
export function cartLinesDiscountsGenerateRun(input) {
  if (!input.cart?.lines?.length) {
    return { operations: [] };
  }

  const discountClasses = input.discount?.discountClasses || [];
  const hasProductDiscountClass =
    discountClasses.includes(DiscountClass.Product) ||
    discountClasses.includes("PRODUCT") ||
    discountClasses.includes("Product") ||
    // Si Shopify no envía classes, no bloquear: el descuento ya es PRODUCT.
    discountClasses.length === 0;
  if (!hasProductDiscountClass) {
    return { operations: [] };
  }

  const rules = readRulesFromInput(input);
  if (!rules.length) {
    return { operations: [] };
  }

  const candidates = buildDiscountCandidates(input.cart.lines, rules);
  if (!candidates.length) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All
        }
      }
    ]
  };
}
