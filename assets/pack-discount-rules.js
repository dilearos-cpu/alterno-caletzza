(function (global) {
  var rules = [];
  var collectionProductCache = {};
  var collectionProductRequests = {};

  function toNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback || 0;
  }

  function toLower(value) {
    return String(value || "").toLowerCase();
  }

  function normalizeExclusive(value) {
    if (value === true || value === 1) {
      return true;
    }
    if (typeof value === "string") {
      return value.toLowerCase() === "true" || value === "1";
    }
    return false;
  }

  function normalizeScope(scope) {
    var value = String(scope || "pack").toLowerCase();
    if (value === "storefront" || value === "pack" || value === "both") {
      return value;
    }
    return "pack";
  }

  function normalizeFilter(rule) {
    var filter = rule.filter || {};
    if (filter.type) {
      return filter;
    }

    if (filter.collection) {
      return {
        type: "collection",
        collection: filter.collection,
        collections: filter.collections || [filter.collection]
      };
    }

    return {
      type: "all_products"
    };
  }

  function getCollectionHandles(filter) {
    var handles = [];
    if (filter.collection) {
      handles.push(filter.collection);
    }
    if (Array.isArray(filter.collections)) {
      handles = handles.concat(filter.collections);
    }
    return handles.map(toLower).filter(Boolean);
  }

  function getRuleTitlePrefixes(filter) {
    return (filter.title_prefixes || [])
      .map(function (prefix) {
        return String(prefix || "").trim();
      })
      .filter(Boolean);
  }

  function productMatchesTitlePrefixes(filter, productContext) {
    var prefixes = getRuleTitlePrefixes(filter);
    if (!prefixes.length) {
      return false;
    }

    var title = String(productContext.title || productContext.productTitle || "").trim();
    if (!title) {
      return false;
    }

    return prefixes.some(function (prefix) {
      return title.toLowerCase().indexOf(prefix.toLowerCase()) === 0;
    });
  }

  function fetchCollectionProductIdsPage(handle, page) {
    return fetch(
      "/collections/" +
        encodeURIComponent(handle) +
        "/products.json?limit=250&page=" +
        page,
      { headers: { Accept: "application/json" } }
    ).then(function (response) {
      if (!response.ok) {
        throw new Error("collection products failed");
      }
      var contentType = String(response.headers.get("content-type") || "");
      if (contentType.indexOf("application/json") === -1) {
        throw new Error("collection products returned non-json");
      }
      return response.json();
    });
  }

  function fetchAllCollectionProductIds(handle) {
    var page = 1;
    var ids = [];

    function fetchPage() {
      return fetchCollectionProductIdsPage(handle, page).then(function (payload) {
        var products = payload.products || [];
        products.forEach(function (product) {
          ids.push(String(product.id));
        });
        if (products.length < 250) {
          return ids;
        }
        page += 1;
        return fetchPage();
      });
    }

    return fetchPage();
  }

  function fetchCollectionProductIds(handle) {
    var normalizedHandle = toLower(handle);
    if (!normalizedHandle) {
      return Promise.resolve([]);
    }
    if (collectionProductCache[normalizedHandle]) {
      return Promise.resolve(collectionProductCache[normalizedHandle]);
    }
    if (collectionProductRequests[normalizedHandle]) {
      return collectionProductRequests[normalizedHandle];
    }

    collectionProductRequests[normalizedHandle] = fetchAllCollectionProductIds(normalizedHandle)
      .then(function (ids) {
        collectionProductCache[normalizedHandle] = ids;
        return ids;
      })
      .catch(function () {
        // No cachear fracaso como lista vacia: permite fallback por title_prefixes.
        delete collectionProductCache[normalizedHandle];
        return [];
      })
      .finally(function () {
        delete collectionProductRequests[normalizedHandle];
      });

    return collectionProductRequests[normalizedHandle];
  }

  function productMatchesCollectionFilter(filter, productContext) {
    var contextId = String(productContext.productId || "");

    // 1) Prefijo de título (rápido y no depende de /products.json).
    if (productMatchesTitlePrefixes(filter, productContext)) {
      return true;
    }

    // 2) product_ids embebidos en la regla del tema.
    var productIds = (filter.product_ids || []).map(function (id) {
      return String(id);
    });
    if (productIds.length && contextId && productIds.indexOf(contextId) !== -1) {
      return true;
    }

    var ruleCollections = getCollectionHandles(filter);
    if (!ruleCollections.length) {
      return false;
    }

    // 3) Handles de colección del producto (si el tema los expone).
    var productCollections = (productContext.collectionHandles || []).map(toLower);
    if (!productCollections.length && productContext.collectionHandle) {
      productCollections = [toLower(productContext.collectionHandle)];
    }

    if (productCollections.length) {
      var matchedByHandles = ruleCollections.some(function (handle) {
        return productCollections.indexOf(handle) !== -1;
      });
      if (matchedByHandles) {
        return true;
      }
      // No cortar aquí: handles incompletos no deben bloquear products.json.
    }

    // 4) Cache de /collections/{handle}/products.json (undefined = aún no cargado).
    if (contextId) {
      var matchedByCache = ruleCollections.some(function (handle) {
        var cachedIds = collectionProductCache[toLower(handle)];
        return Array.isArray(cachedIds) && cachedIds.indexOf(contextId) !== -1;
      });
      if (matchedByCache) {
        return true;
      }
    }

    return false;
  }

  function preloadCollectionProductIdsFromRules(activeRules) {
    var handles = [];
    (activeRules || []).forEach(function (rule) {
      var filter = normalizeFilter(rule);
      if ((filter.type || "") !== "collection") {
        return;
      }
      getCollectionHandles(filter).forEach(function (handle) {
        if (handles.indexOf(handle) === -1) {
          handles.push(handle);
        }
      });
    });

    return Promise.all(handles.map(fetchCollectionProductIds));
  }

  function matchesScope(rule, scope) {
    var ruleScope = normalizeScope(rule.scope);
    var targetScope = normalizeScope(scope);

    if (targetScope === "both") {
      return true;
    }

    return ruleScope === targetScope || ruleScope === "both";
  }

  function matchesFilter(rule, productContext) {
    productContext = productContext || {};
    var filter = normalizeFilter(rule);
    var filterType = filter.type || "all_products";

    if (filterType === "all_products") {
      return true;
    }

    if (filterType === "collection") {
      return productMatchesCollectionFilter(filter, productContext);
    }

    if (filterType === "product") {
      var productId = String(filter.product_id || "");
      var productHandle = toLower(filter.product_handle || filter.product || "");
      var contextId = String(productContext.productId || "");
      var contextHandle = toLower(productContext.productHandle || "");

      return (
        (productId && contextId && contextId === productId) ||
        (productHandle && contextHandle && contextHandle === productHandle)
      );
    }

    if (filterType === "tag") {
      var tags = (productContext.tags || []).map(toLower);
      var ruleTags = [];
      if (filter.tag) {
        ruleTags.push(toLower(filter.tag));
      }
      if (Array.isArray(filter.tags)) {
        ruleTags = ruleTags.concat(filter.tags.map(toLower));
      }
      ruleTags = ruleTags.filter(Boolean);

      if (ruleTags.length && tags.some(function (tag) {
        return ruleTags.indexOf(tag) !== -1;
      })) {
        return true;
      }

      // Fallback: title_prefixes (ej. BODY… en colección Bodies)
      if (productMatchesTitlePrefixes(filter, productContext)) {
        return true;
      }

      return false;
    }

    // Si la regla trae title_prefixes aunque el type no sea tag
    if (productMatchesTitlePrefixes(filter, productContext)) {
      return true;
    }

    return false;
  }

  function matchesPackCollection(rule, context) {
    var filter = normalizeFilter(rule);
    if (filter.type !== "collection" && filter.collection) {
      filter.type = "collection";
    }

    if (filter.type === "all_products") {
      return true;
    }

    if (filter.type === "collection") {
      var collectionHandle = toLower(context.collectionHandle || "");
      var ruleCollections = getCollectionHandles(filter).map(toLower).filter(Boolean);
      if (!ruleCollections.length) {
        return true;
      }
      if (!collectionHandle) {
        return false;
      }
      return ruleCollections.indexOf(collectionHandle) !== -1;
    }

    return matchesFilter(rule, context);
  }

  function registerRules(newRules, options) {
    options = options || {};
    var normalized = (newRules || [])
      .filter(function (rule) {
        return rule && rule.enabled !== false;
      })
      .map(function (rule) {
        return Object.assign({}, rule, {
          scope: normalizeScope(rule.scope),
          exclusive: normalizeExclusive(rule.exclusive),
          filter: normalizeFilter(rule)
        });
      });

    if (options.replace) {
      rules = normalized.sort(function (a, b) {
        return toNumber(b.priority, 0) - toNumber(a.priority, 0);
      });
      return;
    }

    var merged = rules.slice();
    normalized.forEach(function (rule) {
      var existingIndex = merged.findIndex(function (item) {
        return String(item.id || "") === String(rule.id || "");
      });
      if (existingIndex === -1) {
        merged.push(rule);
      } else {
        merged[existingIndex] = rule;
      }
    });

    rules = merged.sort(function (a, b) {
      return toNumber(b.priority, 0) - toNumber(a.priority, 0);
    });
  }

  function getRules(scope) {
    if (!scope) {
      return rules.slice();
    }

    return rules.filter(function (rule) {
      return matchesScope(rule, scope);
    });
  }

  function countLineItems(lineItems) {
    return lineItems.reduce(function (sum, item) {
      return sum + toNumber(item.quantity, 1);
    }, 0);
  }

  function findMatchingTier(ranges, quantity) {
    var qty = toNumber(quantity, 0);
    var match = null;

    (ranges || []).forEach(function (tier) {
      var min = toNumber(tier.min, 0);
      var max = toNumber(tier.max, 999999);
      if (qty >= min && qty <= max) {
        match = tier;
      }
    });

    return match;
  }

  function matchesConditions(rule, context) {
    var conditions = rule.conditions || [];
    if (!conditions.length) {
      return true;
    }

    return conditions.every(function (condition) {
      if (!condition || !condition.type) {
        return true;
      }

      if (condition.type === "payment_method") {
        return String(context.paymentMethod || "") === String(condition.value || "");
      }

      if (condition.type === "min_quantity") {
        return context.totalQuantity >= toNumber(condition.value, 0);
      }

      if (condition.type === "product_in_cart") {
        var ids = condition.variant_ids || condition.product_ids || [];
        return ids.some(function (id) {
          return context.variantIds.indexOf(String(id)) !== -1;
        });
      }

      return true;
    });
  }

  function applyTierToUnitPrice(originalUnitPrice, tier) {
    if (!tier) {
      return originalUnitPrice;
    }

    var type = tier.type || "fixed_price_per_item";
    var value = toNumber(tier.value, 0);

    if (type === "fixed_price_per_item") {
      return value;
    }

    if (type === "percentage") {
      return Math.round(originalUnitPrice * (1 - value / 100));
    }

    if (type === "fixed_discount") {
      return Math.max(0, originalUnitPrice - value);
    }

    return originalUnitPrice;
  }

  function normalizeLineItem(item) {
    var quantity = toNumber(item.quantity, 1);
    var linePrice = toNumber(item.price, 0);
    var unitPrice = toNumber(item.unitPrice, 0);

    if (!unitPrice && quantity > 0) {
      unitPrice = Math.round(linePrice / quantity);
    }

    return {
      variantId: item.variantId,
      productId: item.productId,
      productHandle: item.productHandle,
      collectionHandles: item.collectionHandles || [],
      tags: item.tags || [],
      quantity: quantity,
      title: item.title || "",
      variantTitle: item.variantTitle || "",
      image: item.image || "",
      unitPrice: unitPrice,
      originalUnitPrice: unitPrice,
      price: unitPrice * quantity,
      compareAtUnitPrice: 0,
      tierLabel: ""
    };
  }

  function getProductContextFromNode(node) {
    if (!node) {
      return {};
    }

    var productInfo = node.closest("product-info");
    var productId = node.dataset.productId || (productInfo ? productInfo.dataset.productId : "") || "";
    var productHandle = node.dataset.productHandle || "";

    if (!productHandle && productInfo && productInfo.dataset.url) {
      var urlMatch = String(productInfo.dataset.url).match(/\/products\/([^/?#]+)/);
      if (urlMatch) {
        productHandle = urlMatch[1];
      }
    }

    return {
      productId: productId,
      productHandle: productHandle,
      collectionHandles: String(node.dataset.collectionHandles || "")
        .split(",")
        .map(function (value) {
          return value.trim();
        })
        .filter(Boolean),
      tags: String(node.dataset.tags || "")
        .split(",")
        .map(function (value) {
          return value.trim();
        })
        .filter(Boolean),
      variantPrice: toNumber(node.dataset.variantPrice, 0)
    };
  }

  function getUnitPriceForQuantity(originalUnitPrice, quantity, productContext, options) {
    options = options || {};
    var scope = options.scope || "storefront";
    var paymentMethod = options.paymentMethod || "online";
    var qty = toNumber(quantity, 1);
    var unitPrice = toNumber(originalUnitPrice, 0);
    var appliedRule = null;
    var appliedTier = null;

    for (var index = 0; index < rules.length; index += 1) {
      var rule = rules[index];

      if (!matchesScope(rule, scope)) {
        continue;
      }

      if (!matchesFilter(rule, productContext)) {
        continue;
      }

      if (
        !matchesConditions(rule, {
          paymentMethod: paymentMethod,
          totalQuantity: qty,
          variantIds: productContext.variantId ? [String(productContext.variantId)] : [],
          collectionHandle: (productContext.collectionHandles || [])[0] || ""
        })
      ) {
        continue;
      }

      var tier = findMatchingTier(rule.ranges, qty);
      if (!tier) {
        continue;
      }

      unitPrice = applyTierToUnitPrice(unitPrice, tier);
      appliedRule = rule;
      appliedTier = tier;

      if (rule.exclusive) {
        break;
      }
    }

    return {
      unitPrice: unitPrice,
      originalUnitPrice: toNumber(originalUnitPrice, 0),
      quantity: qty,
      appliedRule: appliedRule,
      appliedTier: appliedTier,
      discountAmount: Math.max(0, toNumber(originalUnitPrice, 0) - unitPrice)
    };
  }

  function getLowestTierPrice(originalUnitPrice, productContext, options) {
    options = options || {};
    return getUnitPriceForQuantity(originalUnitPrice, options.quantity || 1, productContext, {
      scope: options.scope || "storefront",
      paymentMethod: options.paymentMethod || "online"
    });
  }

  function getBestCardPrice(originalUnitPrice, productContext, options) {
    options = options || {};
    var scope = options.scope || "storefront";
    var base = toNumber(originalUnitPrice, 0);
    var best = getUnitPriceForQuantity(base, 1, productContext, {
      scope: scope,
      paymentMethod: "online"
    });
    var lowest = best;

    getRules(scope).forEach(function (rule) {
      if (!matchesFilter(rule, productContext)) {
        return;
      }

      (rule.ranges || []).forEach(function (tier) {
        var unitPrice = applyTierToUnitPrice(base, tier);
        if (unitPrice < lowest.unitPrice) {
          lowest = {
            unitPrice: unitPrice,
            originalUnitPrice: base,
            appliedTier: tier,
            appliedRule: rule
          };
        }
      });
    });

    return {
      unitPrice: best.unitPrice,
      originalUnitPrice: base,
      appliedTier: best.appliedTier,
      appliedRule: best.appliedRule,
      fromPrice: lowest.unitPrice < best.unitPrice ? lowest.unitPrice : null
    };
  }

  function getTierRowsForProduct(productContext, options) {
    options = options || {};
    var scope = options.scope || "storefront";
    var originalUnitPrice = toNumber(productContext.variantPrice, 0);
    var rows = [];

    getRules(scope).forEach(function (rule) {
      if (!matchesFilter(rule, productContext)) {
        return;
      }

      (rule.ranges || []).forEach(function (tier) {
        rows.push({
          rule: rule,
          tier: tier,
          min: toNumber(tier.min, 0),
          max: toNumber(tier.max, 999999),
          label: tier.label || "",
          unitPrice: applyTierToUnitPrice(originalUnitPrice, tier),
          originalUnitPrice: originalUnitPrice
        });
      });
    });

    rows.sort(function (a, b) {
      return a.min - b.min;
    });

    return rows;
  }

  function getTierRowsForCollection(collectionHandle, options) {
    options = options || {};
    var scope = options.scope || "storefront";
    var handle = toLower(collectionHandle);
    var referencePrice = toNumber(options.referencePrice, 0);
    var paymentMethod = options.paymentMethod || "online";
    var matchedRules = [];
    var filterContext = {
      collectionHandles: handle ? [handle] : [],
      tags: options.tags || [],
      title: options.title || ""
    };

    if (!handle && !(filterContext.tags && filterContext.tags.length) && !filterContext.title) {
      return [];
    }

    for (var index = 0; index < rules.length; index += 1) {
      var rule = rules[index];

      if (rule.enabled === false) {
        continue;
      }

      if (!matchesScope(rule, scope)) {
        continue;
      }

      if (!matchesFilter(rule, filterContext)) {
        continue;
      }

      if (
        !matchesConditions(rule, {
          paymentMethod: paymentMethod,
          totalQuantity: 0,
          variantIds: [],
          collectionHandle: handle
        })
      ) {
        continue;
      }

      matchedRules.push(rule);

      if (rule.exclusive) {
        break;
      }
    }

    if (!matchedRules.length) {
      return [];
    }

    var rows = [];
    matchedRules.forEach(function (matchedRule) {
      if (!matchedRule.ranges || !matchedRule.ranges.length) {
        return;
      }

      matchedRule.ranges.forEach(function (tier) {
        rows.push({
          rule: matchedRule,
          tier: tier,
          min: toNumber(tier.min, 0),
          max: toNumber(tier.max, 999999),
          label: tier.label || "",
          highlight: Boolean(tier.highlight),
          unitPrice: applyTierToUnitPrice(referencePrice, tier),
          originalUnitPrice: referencePrice
        });
      });
    });

    rows.sort(function (a, b) {
      return a.min - b.min;
    });

    return rows;
  }

  function hasDiscountRulesForCollection(collectionHandle, options) {
    return getTierRowsForCollection(collectionHandle, options).length > 0;
  }

  function normalizeMoneyFromCart(amount) {
    var value = toNumber(amount, 0);
    if (!value) {
      return 0;
    }
    // Shopify Ajax Cart: precios en centavos (COP 35000 -> 3500000).
    // Solo escalar si el valor parece pesos enteros (p.ej. 35000), no si ya viene en centavos.
    if (value > 0 && value < 100000) {
      return value * 100;
    }
    return value;
  }

  function normalizeCartLineItem(item) {
    var handle = "";
    var url = item.url || "";
    var match = url.match(/\/products\/([^/?#]+)/);
    if (match) {
      handle = match[1];
    }

    var unitPrice = normalizeMoneyFromCart(item.original_price || item.price);

    return {
      key: item.key || "",
      variantId: item.variant_id || item.id,
      productId: item.product_id,
      productHandle: handle,
      quantity: toNumber(item.quantity, 1),
      title: item.product_title || item.title || "",
      variantTitle: item.variant_title || "",
      image: item.featured_image && item.featured_image.url ? item.featured_image.url : item.image || "",
      collectionHandles: item.collectionHandles || [],
      tags: item.tags || [],
      unitPrice: unitPrice,
      originalUnitPrice: unitPrice,
      price: unitPrice * toNumber(item.quantity, 1),
      compareAtUnitPrice: 0,
      tierLabel: "",
      ruleId: null
    };
  }

  function findBestRuleForItem(item, activeRules, context) {
    context = context || {};

    for (var index = 0; index < activeRules.length; index += 1) {
      var rule = activeRules[index];

      if (!matchesFilter(rule, item)) {
        continue;
      }

      if (
        !matchesConditions(rule, {
          paymentMethod: context.paymentMethod || "online",
          totalQuantity: toNumber(item.quantity, 1),
          variantIds: context.variantIds || [],
          collectionHandle: (item.collectionHandles || [])[0] || ""
        })
      ) {
        continue;
      }

      return rule;
    }

    return null;
  }

  function applyRuleGroupToItems(itemState, indices, rule, paymentMethod, variantIds) {
    if (!indices.length) {
      return false;
    }

    var matchedQuantity = indices.reduce(function (sum, index) {
      return sum + itemState[index].quantity;
    }, 0);

    if (
      !matchesConditions(rule, {
        paymentMethod: paymentMethod,
        totalQuantity: matchedQuantity,
        variantIds: variantIds,
        collectionHandle: ""
      })
    ) {
      return false;
    }

    var countMode = rule.count_mode || "filter_set";
    var ruleApplied = false;
    var appliedTier = null;

    if (countMode === "individual_product") {
      indices.forEach(function (index) {
        var item = itemState[index];
        var itemTier = findMatchingTier(rule.ranges, item.quantity);
        if (!itemTier) {
          return;
        }
        var unitPrice = applyTierToUnitPrice(item.originalUnitPrice, itemTier);
        itemState[index] = Object.assign({}, item, {
          unitPrice: unitPrice,
          price: unitPrice * item.quantity,
          compareAtUnitPrice: item.originalUnitPrice,
          tierLabel: itemTier.label || "",
          ruleId: rule.id
        });
        appliedTier = itemTier;
        ruleApplied = true;
      });
    } else {
      var tier = findMatchingTier(rule.ranges, matchedQuantity);
      if (tier) {
        indices.forEach(function (index) {
          var item = itemState[index];
          var unitPrice = applyTierToUnitPrice(item.originalUnitPrice, tier);
          itemState[index] = Object.assign({}, item, {
            unitPrice: unitPrice,
            price: unitPrice * item.quantity,
            compareAtUnitPrice: item.originalUnitPrice,
            tierLabel: tier.label || "",
            ruleId: rule.id
          });
        });
        appliedTier = tier;
        ruleApplied = true;
      }
    }

    return ruleApplied ? appliedTier : false;
  }

  function applyStorefrontCartRules(cartItems, options) {
    options = options || {};
    var paymentMethod = options.paymentMethod || "online";

    var storefrontRules = rules.filter(function (rule) {
      return matchesScope(rule, "storefront");
    });

    function runRules() {
      var itemState = (cartItems || []).map(normalizeCartLineItem);
      var variantIds = itemState.map(function (item) {
        return String(item.variantId);
      });
      var originalSubtotal = itemState.reduce(function (sum, item) {
        return sum + item.originalUnitPrice * item.quantity;
      }, 0);
      var appliedRule = null;
      var appliedTier = null;
      var groups = {};

      storefrontRules.forEach(function (rule) {
        groups[String(rule.id || "")] = [];
      });

      itemState.forEach(function (item, index) {
        var rule = findBestRuleForItem(item, storefrontRules, {
          paymentMethod: paymentMethod,
          variantIds: variantIds
        });
        if (!rule) {
          return;
        }
        groups[String(rule.id || "")].push(index);
      });

      storefrontRules.forEach(function (rule) {
        var indices = groups[String(rule.id || "")] || [];
        var tier = applyRuleGroupToItems(itemState, indices, rule, paymentMethod, variantIds);
        if (tier) {
          appliedRule = rule;
          appliedTier = tier;
        }
      });

      var subtotal = itemState.reduce(function (sum, item) {
        return sum + item.price;
      }, 0);

      return {
        lineItems: itemState,
        originalSubtotal: originalSubtotal,
        subtotal: subtotal,
        discountTotal: Math.max(0, originalSubtotal - subtotal),
        appliedRule: appliedRule,
        appliedTier: appliedTier,
        totalQuantity: countLineItems(itemState)
      };
    }

    return preloadCollectionProductIdsFromRules(storefrontRules).then(runRules);
  }

  function applyRules(lineItems, context) {
    context = context || {};
    var collectionHandle = toLower(context.collectionHandle || "");
    var paymentMethod = context.paymentMethod || "cod";
    var normalized = (lineItems || []).map(normalizeLineItem);
    var variantIds = normalized.map(function (item) {
      return String(item.variantId);
    });
    var totalQuantity = countLineItems(normalized);
    var appliedRule = null;
    var appliedTier = null;

    var originalSubtotal = normalized.reduce(function (sum, item) {
      return sum + item.originalUnitPrice * item.quantity;
    }, 0);

    for (var index = 0; index < rules.length; index += 1) {
      var rule = rules[index];

      if (!matchesScope(rule, "pack")) {
        continue;
      }

      if (!matchesPackCollection(rule, context)) {
        continue;
      }

      if (
        !matchesConditions(rule, {
          paymentMethod: paymentMethod,
          totalQuantity: totalQuantity,
          variantIds: variantIds,
          collectionHandle: collectionHandle
        })
      ) {
        continue;
      }

      var countMode = rule.count_mode || "filter_set";
      var tier = null;
      var updated = normalized;

      if (countMode === "individual_product") {
        updated = normalized.map(function (item) {
          var itemTier = findMatchingTier(rule.ranges, item.quantity);
          var unitPrice = applyTierToUnitPrice(item.originalUnitPrice, itemTier);
          return Object.assign({}, item, {
            unitPrice: unitPrice,
            price: unitPrice * item.quantity,
            compareAtUnitPrice: item.originalUnitPrice,
            tierLabel: itemTier ? itemTier.label || "" : ""
          });
        });
        tier = findMatchingTier(rule.ranges, totalQuantity);
      } else {
        tier = findMatchingTier(rule.ranges, totalQuantity);
        if (tier) {
          updated = normalized.map(function (item) {
            var unitPrice = applyTierToUnitPrice(item.originalUnitPrice, tier);
            return Object.assign({}, item, {
              unitPrice: unitPrice,
              price: unitPrice * item.quantity,
              compareAtUnitPrice: item.originalUnitPrice,
              tierLabel: tier.label || ""
            });
          });
        }
      }

      if (tier || countMode === "individual_product") {
        normalized = updated;
        appliedRule = rule;
        appliedTier = tier;
        if (rule.exclusive) {
          break;
        }
      }
    }

    var subtotal = normalized.reduce(function (sum, item) {
      return sum + item.price;
    }, 0);

    return {
      lineItems: normalized,
      originalSubtotal: originalSubtotal,
      subtotal: subtotal,
      discountTotal: Math.max(0, originalSubtotal - subtotal),
      appliedRule: appliedRule,
      appliedTier: appliedTier,
      totalQuantity: totalQuantity
    };
  }

  function readRulesFromDocument() {
    var nodes = document.querySelectorAll("[data-discount-rules], [data-pack-discount-rules]");
    var merged = [];

    nodes.forEach(function (node) {
      try {
        var parsed = JSON.parse(node.textContent || "[]");
        if (Array.isArray(parsed)) {
          merged = merged.concat(
            parsed.map(function (rule) {
              if (!rule.scope && node.hasAttribute("data-pack-discount-rules")) {
                return Object.assign({}, rule, { scope: "pack" });
              }
              return rule;
            })
          );
        }
      } catch (error) {
        console.error("PackDiscountRules: no se pudieron leer las reglas.", error);
      }
    });

    return merged;
  }

  function initFromDocument() {
    registerRules(readRulesFromDocument(), { replace: true });
    if (!rules.length) {
      console.warn(
        "DiscountRules: no se cargaron reglas. Revisa la seccion «Reglas de precio (global)» en el editor del tema."
      );
    } else {
      preloadCollectionProductIdsFromRules(rules);
    }
    document.dispatchEvent(
      new CustomEvent("discount-rules:ready", {
        detail: {
          rules: getRules()
        }
      })
    );
  }

  var api = {
    registerRules: registerRules,
    getRules: getRules,
    applyRules: applyRules,
    applyStorefrontCartRules: applyStorefrontCartRules,
    getUnitPriceForQuantity: getUnitPriceForQuantity,
    getLowestTierPrice: getLowestTierPrice,
    getBestCardPrice: getBestCardPrice,
    getTierRowsForProduct: getTierRowsForProduct,
    getTierRowsForCollection: getTierRowsForCollection,
    hasDiscountRulesForCollection: hasDiscountRulesForCollection,
    getProductContextFromNode: getProductContextFromNode,
    initFromDocument: initFromDocument
  };

  global.PackDiscountRules = api;
  global.DiscountRules = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFromDocument);
  } else {
    initFromDocument();
  }

  document.addEventListener("shopify:section:load", initFromDocument);
})(window);
