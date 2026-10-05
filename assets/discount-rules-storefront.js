(function (global) {
  function formatMoney(cents, currency) {
    var amount = Number(cents || 0) / 100;
    try {
      return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: currency || (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || "COP",
        maximumFractionDigits: 0
      }).format(amount);
    } catch (error) {
      return "$" + Math.round(amount).toLocaleString("es-CO");
    }
  }

  function toNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback || 0;
  }

  function getEngine() {
    return global.DiscountRules || global.PackDiscountRules || null;
  }

  function waitForEngine(callback) {
    var engine = getEngine();
    if (engine) {
      callback(engine);
      return;
    }

    document.addEventListener("discount-rules:ready", function handler() {
      document.removeEventListener("discount-rules:ready", handler);
      callback(getEngine());
    });
  }

  function ensureSaleMarkup(priceRoot, regularText, saleText) {
    var saleWrap = priceRoot.querySelector(".price__sale");
    if (!saleWrap) {
      saleWrap = document.createElement("div");
      saleWrap.className = "price__sale";
      priceRoot.querySelector(".price__container").appendChild(saleWrap);
    }

    var compareNode = saleWrap.querySelector(".price-item--regular");
    if (!compareNode) {
      compareNode = document.createElement("s");
      compareNode.className = "price-item price-item--regular";
      saleWrap.appendChild(compareNode);
    }

    var saleNode = saleWrap.querySelector(".price-item--sale");
    if (!saleNode) {
      saleNode = document.createElement("span");
      saleNode.className = "price-item price-item--sale price-item--last";
      saleWrap.appendChild(saleNode);
    }

    compareNode.textContent = regularText;
    saleNode.textContent = saleText;
  }

  function setPriceNode(priceRoot, unitPrice, originalUnitPrice, quantity, options) {
    if (!priceRoot) {
      return;
    }

    options = options || {};
    var qty = toNumber(quantity, 1);
    var hasDiscount = originalUnitPrice > unitPrice;
    var displayTotal = unitPrice * qty;
    var originalTotal = originalUnitPrice * qty;
    var prefix = options.fromPrefix ? "Desde " : "";

    priceRoot.classList.toggle("price--on-sale", hasDiscount);
    priceRoot.classList.toggle("discount-rules--active", hasDiscount);

    var regularItem = priceRoot.querySelector(".price__regular .price-item--regular");

    if (hasDiscount) {
      ensureSaleMarkup(
        priceRoot,
        formatMoney(originalTotal),
        prefix + formatMoney(displayTotal)
      );
      if (regularItem) {
        regularItem.textContent = prefix + formatMoney(displayTotal);
      }
    } else if (regularItem) {
      regularItem.textContent = formatMoney(displayTotal);
    }
  }

  function enhanceCard(cardNode, engine) {
    var productContext = engine.getProductContextFromNode(cardNode);
    var originalPrice = toNumber(cardNode.dataset.variantPrice, productContext.variantPrice);
    if (!originalPrice) {
      return;
    }

    var pricing = engine.getBestCardPrice
      ? engine.getBestCardPrice(originalPrice, productContext, { scope: "storefront" })
      : engine.getLowestTierPrice(originalPrice, productContext, { scope: "storefront" });

    if (!pricing.appliedTier || pricing.unitPrice >= originalPrice) {
      return;
    }

    var priceRoot = cardNode.querySelector(".price");
    setPriceNode(priceRoot, pricing.unitPrice, originalPrice, 1, {
      fromPrefix: Boolean(pricing.fromPrice)
    });

    var badge = cardNode.querySelector("[data-discount-rules-badge]");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "discount-rules__badge badge price__badge-sale color-accent-1";
      badge.setAttribute("data-discount-rules-badge", "");
      badge.textContent = pricing.appliedTier.label || "Descuento por cantidad";
      if (priceRoot) {
        priceRoot.appendChild(badge);
      }
    }
  }

  function enhanceCards(engine) {
    document.querySelectorAll("[data-discount-rules-card]").forEach(function (cardNode) {
      enhanceCard(cardNode, engine);
    });
  }

  function updateProductPrice(engine, productRoot) {
    var productContext = engine.getProductContextFromNode(productRoot);
    var quantityInput = document.querySelector(productRoot.dataset.quantityInput || "input[name='quantity']");
    var quantity = quantityInput ? toNumber(quantityInput.value, 1) : 1;
    var originalPrice = toNumber(productRoot.dataset.variantPrice, productContext.variantPrice);
    if (!originalPrice) {
      return;
    }

    productContext.variantPrice = originalPrice;
    var result = engine.getUnitPriceForQuantity(originalPrice, quantity, productContext, {
      scope: "storefront",
      paymentMethod: "online"
    });

    var priceRoot = productRoot.querySelector(".price") || productRoot;
    setPriceNode(priceRoot, result.unitPrice, result.originalUnitPrice, quantity);
    updateTierTableActiveRow(productRoot, quantity);
  }

  function formatTierQuantityLabel(row) {
    if (row.min === row.max) {
      return String(row.min);
    }
    return row.min + " - " + row.max;
  }

  function tierBillableQuantity(row) {
    if (row.min === row.max) {
      return row.min;
    }
    return row.max;
  }

  function renderCollectionTierTable(tableNode, engine) {
    var collectionHandle = String(tableNode.dataset.collectionHandle || "");
    var referencePrice = toNumber(tableNode.dataset.variantPrice, 0);
    var showTotal = tableNode.dataset.showTotal === "true";
    var sampleTags = String(tableNode.dataset.sampleTags || "")
      .split(",")
      .map(function (tag) {
        return tag.trim();
      })
      .filter(Boolean);
    var sampleTitle = String(tableNode.dataset.sampleTitle || "");
    var body = tableNode.querySelector("[data-discount-rules-collection-tier-body]");
    var header = tableNode.closest(".cz-collection-header");
    var panel = tableNode.closest(".cz-collection-header__pricing");

    if (!body || !collectionHandle) {
      finalizeCollectionHeader(header, panel, tableNode, false);
      return false;
    }

    var productContext = {
      collectionHandles: [collectionHandle],
      tags: sampleTags,
      title: sampleTitle,
      variantPrice: referencePrice
    };

    var rows = [];
    if (engine.getTierRowsForCollection) {
      rows = engine.getTierRowsForCollection(collectionHandle, {
        scope: "storefront",
        referencePrice: referencePrice,
        tags: sampleTags,
        title: sampleTitle
      });
    }

    // Fallback: reglas por tag / title_prefix (ej. Bodys = tag caletzza-bodys)
    if ((!rows || !rows.length) && engine.getTierRowsForProduct) {
      rows = engine.getTierRowsForProduct(productContext, { scope: "storefront" });
    }

    if (!rows.length) {
      finalizeCollectionHeader(header, panel, tableNode, false);
      return false;
    }

    body.innerHTML = rows
      .map(function (row, index) {
        var qtyLabel = formatTierQuantityLabel(row);
        var billQty = tierBillableQuantity(row);
        var unitText = formatMoney(row.unitPrice);
        var totalText = formatMoney(row.unitPrice * billQty);
        var highlightClass = row.highlight ? " is-highlight" : "";
        var activeClass = index === 0 ? " is-active" : "";
        var badgeMarkup = row.label
          ? '<span class="cz-unit-price-table__badge">' + row.label + "</span>"
          : "";

        return (
          '<div class="cz-unit-price-table__row' +
          highlightClass +
          activeClass +
          '" role="row" data-tier-row data-min="' +
          row.min +
          '" data-max="' +
          row.max +
          '">' +
          '<span class="cz-unit-price-table__qty" role="cell">' +
          qtyLabel +
          badgeMarkup +
          "</span>" +
          '<span class="cz-unit-price-table__price" role="cell">' +
          unitText +
          "</span>" +
          (showTotal
            ? '<span class="cz-unit-price-table__total" role="cell">' + totalText + "</span>"
            : "") +
          "</div>"
        );
      })
      .join("");

    tableNode.hidden = false;
    finalizeCollectionHeader(header, panel, tableNode, true);

    var manualWrap = panel ? panel.querySelector("[data-cz-collection-pricing-manual-wrap]") : null;
    if (manualWrap) {
      manualWrap.hidden = true;
    }

    return true;
  }

  function finalizeCollectionHeader(header, panel, tableNode, rendered) {
    if (!header) {
      return;
    }

    if (rendered) {
      if (panel) {
        panel.hidden = false;
      }
      header.classList.remove("cz-collection-header--banner-only");
      return;
    }

    if (tableNode) {
      tableNode.hidden = true;
    }

    if (panel) {
      var manualWrap = panel.querySelector("[data-cz-collection-pricing-manual-wrap]");
      if (manualWrap && !manualWrap.hidden) {
        panel.hidden = false;
        header.classList.remove("cz-collection-header--banner-only");
        return;
      }
      panel.hidden = true;
    }

    header.classList.add("cz-collection-header--banner-only");
  }

  function renderCollectionTierTables(engine) {
    var rendered = false;

    document.querySelectorAll("[data-discount-rules-collection-tier-table]").forEach(function (tableNode) {
      if (renderCollectionTierTable(tableNode, engine)) {
        rendered = true;
      }
    });

    return rendered;
  }

  function updateTierTableActiveRow(productRoot, quantity) {
    var table = productRoot.parentElement
      ? productRoot.parentElement.querySelector("[data-discount-rules-tier-table]")
      : document.querySelector("[data-discount-rules-tier-table]");

    if (!table) {
      return;
    }

    var qty = toNumber(quantity, 1);
    table.querySelectorAll("[data-tier-row]").forEach(function (row) {
      var min = toNumber(row.dataset.min, 0);
      var max = toNumber(row.dataset.max, 999999);
      row.classList.toggle("discount-rules-tier-table__row--active", qty >= min && qty <= max);
    });
  }

  function bindProductPage(engine) {
    var productRoot = document.querySelector("[data-discount-rules-product]");
    if (!productRoot) {
      return;
    }

    var quantityInput = document.querySelector(
      productRoot.dataset.quantityInput || "#Quantity-" + (productRoot.dataset.sectionId || "")
    );

    if (!quantityInput) {
      quantityInput = document.querySelector("input[name='quantity']");
    }

    function refresh() {
      updateProductPrice(engine, productRoot);
    }

    refresh();

    if (quantityInput) {
      quantityInput.addEventListener("change", refresh);
      quantityInput.addEventListener("input", refresh);
    }

    if (typeof subscribe === "function" && typeof PUB_SUB_EVENTS !== "undefined") {
      subscribe(PUB_SUB_EVENTS.variantChange, function (event) {
        if (!event || !event.data || !event.data.variant) {
          return;
        }
        productRoot.dataset.variantPrice = String(event.data.variant.price || "");
        window.setTimeout(refresh, 50);
        window.setTimeout(refresh, 250);
      });

      subscribe(PUB_SUB_EVENTS.quantityUpdate, function () {
        window.setTimeout(refresh, 0);
      });
    }

    document.addEventListener("product-info:loaded", refresh);
  }

  function logDesignMode(engine) {
    if (!window.Shopify || !window.Shopify.designMode) {
      return;
    }

    var rules = engine.getRules("storefront");
    if (!rules.length) {
      console.warn(
        "DiscountRules: no hay reglas activas para tienda. Revisa que la regla este en Activa y tenga filtro/coleccion/producto configurado."
      );
      return;
    }

    console.info("DiscountRules: reglas de tienda cargadas", rules.length, rules);
  }

  function init(engine) {
    if (!engine) {
      return;
    }

    logDesignMode(engine);
    enhanceCards(engine);
    renderCollectionTierTables(engine);
    bindProductPage(engine);
  }

  function boot() {
    waitForEngine(init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("shopify:section:load", boot);
  document.addEventListener("discount-rules:ready", boot);
})(window);
