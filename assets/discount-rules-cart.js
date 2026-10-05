(function (global) {
  var productTagCache = {};
  var lastSummary = null;
  var syncRulesTimer = null;
  var lastSyncedRulesSignature = "";
  var nativeDiscountActive = false;
  var checkoutInFlight = false;

  function getEngine() {
    return global.DiscountRules || global.PackDiscountRules || null;
  }

  function getConfig() {
    var node = document.querySelector("[data-discount-rules-cart-config]");
    var syncRulesEndpoint =
      (node && node.dataset.syncRulesEndpoint) || "/apps/cod-express/sync-rules";
    var previewEndpoint =
      (node && node.dataset.previewDiscountsEndpoint) || "/apps/cod-express/preview-discounts";
    var checkoutEndpoint =
      (node && node.dataset.checkoutEndpoint) || "/apps/cod-express/checkout";
    var syncFallback =
      (node && node.dataset.syncRulesFallback) || "https://cod-express-r15e.onrender.com/sync-rules";
    var previewFallback =
      (node && node.dataset.previewDiscountsFallback) ||
      "https://cod-express-r15e.onrender.com/preview-discounts";
    var checkoutFallback =
      (node && node.dataset.checkoutFallback) || "https://cod-express-r15e.onrender.com/checkout";
    return {
      syncRulesEndpoint: syncRulesEndpoint,
      previewEndpoint: previewEndpoint,
      checkoutEndpoint: checkoutEndpoint,
      syncFallback: syncFallback,
      previewFallback: previewFallback,
      checkoutFallback: checkoutFallback
    };
  }

  function formatMoney(cents) {
    var amount = Number(cents || 0) / 100;
    try {
      return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || "COP",
        maximumFractionDigits: 0
      }).format(amount);
    } catch (error) {
      return "$" + Math.round(amount).toLocaleString("es-CO");
    }
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

  function fetchProductTags(handle) {
    if (!handle) {
      return Promise.resolve([]);
    }
    if (productTagCache[handle]) {
      return Promise.resolve(productTagCache[handle]);
    }
    return fetch("/products/" + encodeURIComponent(handle) + ".js", {
      headers: { Accept: "application/json" }
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("product.js failed");
        }
        return response.json();
      })
      .then(function (product) {
        var tags = String(product.tags || "")
          .split(",")
          .map(function (tag) {
            return tag.trim();
          })
          .filter(Boolean);
        productTagCache[handle] = tags;
        return tags;
      })
      .catch(function () {
        productTagCache[handle] = [];
        return [];
      });
  }

  function enrichCartItems(items) {
    var handles = [];
    items.forEach(function (item) {
      var match = String(item.url || "").match(/\/products\/([^/?#]+)/);
      if (match && handles.indexOf(match[1]) === -1) {
        handles.push(match[1]);
      }
    });

    return Promise.all(handles.map(fetchProductTags)).then(function () {
      return items.map(function (item) {
        var match = String(item.url || "").match(/\/products\/([^/?#]+)/);
        var handle = match ? match[1] : "";
        return Object.assign({}, item, {
          tags: handle ? productTagCache[handle] || [] : []
        });
      });
    });
  }

  function fetchCart() {
    return fetch("/cart.js", {
      headers: { Accept: "application/json" }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("No se pudo leer el carrito.");
      }
      return response.json();
    });
  }

  function postJson(url, payload) {
    var isAbsolute = /^https?:\/\//i.test(String(url || ""));
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      credentials: isAbsolute ? "omit" : "same-origin",
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.text().then(function (text) {
        var payloadResponse = null;
        if (text) {
          try {
            payloadResponse = JSON.parse(text);
          } catch (error) {
            throw new Error("El servidor no respondio JSON (HTTP " + response.status + ").");
          }
        }
        if (!response.ok) {
          throw new Error((payloadResponse && payloadResponse.error) || "Request failed");
        }
        return payloadResponse;
      });
    });
  }

  function buildLocalSummary(engine, cart) {
    return enrichCartItems(cart.items || []).then(function (items) {
      var result = engine.applyStorefrontCartRules(items, { paymentMethod: "online" });
      var resolved =
        result && typeof result.then === "function" ? result : Promise.resolve(result);
      return resolved.then(function (summary) {
        return { summary: summary, items: items };
      });
    });
  }

  function buildSummary(engine, cart) {
    // Solo motor local = reglas del editor (JSON del tema).
    // Evita un 2º paint vía preview API que hacía “saltar” precios en el carrito.
    return buildLocalSummary(engine, cart).then(function (local) {
      return local.summary;
    });
  }

  function readRulesFromDocument() {
    var nodes = document.querySelectorAll("[data-discount-rules], [data-pack-discount-rules]");
    var merged = [];

    nodes.forEach(function (node) {
      try {
        var parsed = JSON.parse(node.textContent || "[]");
        if (Array.isArray(parsed)) {
          merged = merged.concat(parsed);
        }
      } catch (error) {
        console.warn("DiscountRules cart sync:", error.message);
      }
    });

    return merged;
  }

  function scheduleRulesSync() {
    if (syncRulesTimer) {
      window.clearTimeout(syncRulesTimer);
    }

    syncRulesTimer = window.setTimeout(syncDiscountRulesToApp, 400);
  }

  function syncDiscountRulesToApp() {
    var config = getConfig();
    var rules = readRulesFromDocument();

    if (!rules.length) {
      return Promise.resolve(null);
    }

    var signature = JSON.stringify(rules);
    if (signature === lastSyncedRulesSignature) {
      return Promise.resolve(null);
    }

    var body = {
      rules: rules,
      shop: (window.Shopify && window.Shopify.shop) || undefined
    };
    return postJson(config.syncRulesEndpoint, body)
      .catch(function () {
        return postJson(config.syncFallback, body);
      })
      .then(function (payload) {
        nativeDiscountActive = payload && payload.discountStatus === "ACTIVE";
        if (!nativeDiscountActive) {
          console.warn(
            "DiscountRules sync: Function no ACTIVE — checkout usará borrador con descuento.",
            payload.discountError || payload.discountStatus || "sin estado"
          );
          // Aun sin Function, las reglas del tema aplican vía draft invoice.
          lastSyncedRulesSignature = signature;
          return payload;
        }
        lastSyncedRulesSignature = signature;
        console.info(
          "DiscountRules sync OK:",
          payload.rulesCount,
          "reglas,",
          (payload.ruleTags || []).length,
          "tags,",
          (payload.collectionIds || []).length,
          "colecciones,",
          payload.shop || ""
        );
        return payload;
      })
      .catch(function (error) {
        console.warn("DiscountRules sync:", error.message);
        return null;
      });
  }

  function ensureTotalsBlock(container) {
    if (!container) {
      return null;
    }
    var block = container.querySelector("[data-discount-rules-cart-totals]");
    if (block) {
      return block;
    }
    block = document.createElement("div");
    block.className = "discount-rules-cart-totals";
    block.setAttribute("data-discount-rules-cart-totals", "");
    block.hidden = true;
    block.innerHTML =
      '<div class="discount-rules-cart-totals__row discount-rules-cart-totals__row--subtotal">' +
      '<span>Subtotal</span><span data-dr-subtotal></span></div>' +
      '<div class="discount-rules-cart-totals__row discount-rules-cart-totals__row--discount">' +
      '<span>Descuento por cantidad</span><span data-dr-discount></span></div>' +
      '<div class="discount-rules-cart-totals__row discount-rules-cart-totals__row--total">' +
      '<span>Total con descuento</span><strong data-dr-total></strong></div>' +
      '<p class="discount-rules-cart-totals__note">Impuestos y envío se calculan al pagar.</p>';
    container.insertBefore(block, container.firstChild);
    return block;
  }

  function updateTotalsContainers(summary) {
    var containers = document.querySelectorAll(
      "#main-cart-footer .js-contents, .cart-drawer__footer, .discount-rules-cart-totals-host"
    );
    var hasDiscount = !!(summary && summary.discountTotal > 0);

    // Remove legacy inline duplicate totals/lines (old discount-rules-global script).
    document.querySelectorAll("[data-dr-inline-totals], [data-dr-inline-unit]").forEach(function (node) {
      node.remove();
    });

    containers.forEach(function (container) {
      var block = ensureTotalsBlock(container);
      if (!block) {
        return;
      }

      if (!hasDiscount) {
        block.hidden = true;
        container.classList.remove("discount-rules-cart-footer--adjusted");
        return;
      }

      block.hidden = false;
      container.classList.add("discount-rules-cart-footer--adjusted");
      var subtotalNode = block.querySelector("[data-dr-subtotal]");
      var discountNode = block.querySelector("[data-dr-discount]");
      var totalNode = block.querySelector("[data-dr-total]");

      if (subtotalNode) {
        subtotalNode.textContent = formatMoney(summary.originalSubtotal);
      }
      if (discountNode) {
        discountNode.textContent = "-" + formatMoney(summary.discountTotal);
      }
      if (totalNode) {
        totalNode.textContent = formatMoney(summary.subtotal);
      }
    });

    // Hide Dawn native "Total estimado" while rules totals are visible (single source).
    document.querySelectorAll(".cart-drawer__footer .totals, #main-cart-footer .totals").forEach(function (node) {
      node.classList.toggle("discount-rules-cart-totals__native-hidden", hasDiscount);
    });
    document.querySelectorAll(".cart-drawer__footer .tax-note, #main-cart-footer .tax-note").forEach(function (node) {
      node.classList.toggle("discount-rules-cart-totals__native-hidden", hasDiscount);
    });
    document.querySelectorAll(".totals__total-value").forEach(function (node) {
      if (!hasDiscount) {
        node.removeAttribute("data-discount-rules-adjusted-total");
        return;
      }
      node.textContent = formatMoney(summary.subtotal);
      node.setAttribute("data-discount-rules-adjusted-total", "true");
    });
  }

  function updateLineItemPrices(summary) {
    if (!summary || !summary.lineItems) {
      return;
    }

    summary.lineItems.forEach(function (item, index) {
      var lineNumber = index + 1;
      var row =
        document.getElementById("CartItem-" + lineNumber) ||
        document.getElementById("CartDrawer-Item-" + lineNumber) ||
        document.querySelector('[data-cart-item-key="' + item.key + '"]');
      if (!row) {
        return;
      }

      row.setAttribute("data-cart-item-key", item.key || "");

      var hasDiscount = item.unitPrice < item.originalUnitPrice || item.compareAtUnitPrice > item.unitPrice;
      var unitWrap = row.querySelector(".cart-item__details .product-option, .cart-item__discounted-prices");
      var lineWrap = row.querySelector(".cart-item__price-wrapper");

      if (hasDiscount) {
        var detailsCell = row.querySelector(".cart-item__details");
        if (detailsCell) {
          var priceBlock = detailsCell.querySelector("[data-discount-rules-line-unit]");
          if (!priceBlock) {
            priceBlock = document.createElement("div");
            priceBlock.className = "cart-item__discounted-prices";
            priceBlock.setAttribute("data-discount-rules-line-unit", "");
            var anchor = detailsCell.querySelector(".cart-item__name");
            if (anchor && anchor.nextSibling) {
              detailsCell.insertBefore(priceBlock, anchor.nextSibling);
            } else {
              detailsCell.appendChild(priceBlock);
            }
          }
          priceBlock.innerHTML =
            '<s class="cart-item__old-price product-option">' +
            formatMoney(item.originalUnitPrice) +
            '</s><strong class="cart-item__final-price product-option">' +
            formatMoney(item.unitPrice) +
            "</strong>";
          if (unitWrap && unitWrap !== priceBlock && !unitWrap.hasAttribute("data-discount-rules-line-unit")) {
            unitWrap.style.display = "none";
          }
        }

        if (lineWrap) {
          lineWrap.innerHTML =
            '<dl class="cart-item__discounted-prices">' +
            '<dd><s class="cart-item__old-price price price--end">' +
            formatMoney(item.originalUnitPrice * item.quantity) +
            '</s></dd><dd class="price price--end">' +
            formatMoney(item.price) +
            "</dd></dl>";
        }
      }
    });
  }

  var isPaintingCart = false;

  function renderCart(summary) {
    isPaintingCart = true;
    lastSummary = summary;
    try {
      updateLineItemPrices(summary);
      updateTotalsContainers(summary);
      document.dispatchEvent(
        new CustomEvent("discount-rules:cart-updated", {
          detail: { summary: summary }
        })
      );
    } finally {
      window.setTimeout(function () {
        isPaintingCart = false;
      }, 0);
    }
  }

  function refreshCart() {
    var engine = getEngine();
    if (!engine || typeof engine.applyStorefrontCartRules !== "function") {
      return Promise.resolve(null);
    }

    return fetchCart()
      .then(function (cart) {
        if (!cart.items || !cart.items.length) {
          renderCart(null);
          return null;
        }
        return buildSummary(engine, cart).then(function (summary) {
          renderCart(summary);
          return summary;
        });
      })
      .catch(function (error) {
        console.warn("DiscountRules cart:", error.message);
        return null;
      });
  }

  function bindCartEvents() {
    if (typeof subscribe === "function" && typeof PUB_SUB_EVENTS !== "undefined") {
      subscribe(PUB_SUB_EVENTS.cartUpdate, function () {
        // Dawn reemplaza el HTML del drawer después del publish: reaplicar varias veces.
        scheduleRefreshCart();
        hookCartDrawerRefresh(true);
      });
    }

    document.addEventListener("cart:updated", function () {
      scheduleRefreshCart();
    });

    document.addEventListener("shopify:section:load", function () {
      scheduleRefreshCart();
      scheduleRulesSync();
      hookCartDrawerRefresh(true);
      observeCartDom();
    });

    hookCartDrawerRefresh(true);
    patchCartItemsUpdate();
    observeCartDom();
  }

  var refreshCartTimer = null;
  var refreshCartDelays = [80, 400];

  function scheduleRefreshCart() {
    if (refreshCartTimer) {
      window.clearTimeout(refreshCartTimer);
    }
    refreshCartTimer = window.setTimeout(function () {
      refreshCartDelays.forEach(function (delay) {
        window.setTimeout(refreshCart, delay);
      });
    }, 0);
  }

  function hookCartDrawerRefresh(force) {
    var drawer = document.querySelector("cart-drawer");
    if (!drawer) {
      return;
    }
    if (!force && drawer.dataset.discountRulesHooked === "true") {
      return;
    }
    drawer.dataset.discountRulesHooked = "true";

    if (typeof drawer.open === "function" && !drawer.__drOpenHooked) {
      var originalOpen = drawer.open.bind(drawer);
      drawer.open = function () {
        var result = originalOpen.apply(this, arguments);
        scheduleRefreshCart();
        return result;
      };
      drawer.__drOpenHooked = true;
    }

    if (typeof drawer.renderContents === "function" && !drawer.__drRenderHooked) {
      var originalRender = drawer.renderContents.bind(drawer);
      drawer.renderContents = function () {
        var result = originalRender.apply(this, arguments);
        scheduleRefreshCart();
        observeCartDom();
        return result;
      };
      drawer.__drRenderHooked = true;
    }
  }

  function patchCartItemsUpdate() {
    if (typeof customElements === "undefined" || customElements.get("cart-items") == null) {
      return;
    }
    // Parchea el prototipo de cart-items / cart-drawer-items para reaplicar
    // después de que Dawn reemplace el HTML del drawer (race típica).
    ["cart-items", "cart-drawer-items"].forEach(function (tagName) {
      var Ctor = customElements.get(tagName);
      if (!Ctor || !Ctor.prototype || Ctor.prototype.__drPatched) {
        return;
      }
      var proto = Ctor.prototype;
      if (typeof proto.onCartUpdate === "function") {
        var originalOnCartUpdate = proto.onCartUpdate;
        proto.onCartUpdate = function () {
          var result = originalOnCartUpdate.apply(this, arguments);
          scheduleRefreshCart();
          return result;
        };
      }
      if (typeof proto.updateQuantity === "function") {
        var originalUpdateQuantity = proto.updateQuantity;
        proto.updateQuantity = function () {
          var result = originalUpdateQuantity.apply(this, arguments);
          scheduleRefreshCart();
          return result;
        };
      }
      proto.__drPatched = true;
    });
  }

  var cartDomObserver = null;
  function observeCartDom() {
    var roots = [
      document.querySelector("cart-drawer"),
      document.getElementById("CartDrawer"),
      document.getElementById("main-cart-items"),
      document.getElementById("main-cart-footer")
    ].filter(Boolean);

    if (!roots.length) {
      return;
    }

    if (cartDomObserver) {
      cartDomObserver.disconnect();
    }

    var debounceTimer = null;
    cartDomObserver = new MutationObserver(function () {
      if (isPaintingCart) {
        return;
      }
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
      // Dawn reescribe el drawer tras /cart/add: recalcular cuando el DOM cambie.
      debounceTimer = window.setTimeout(function () {
        hookCartDrawerRefresh(true);
        refreshCart();
      }, 150);
    });

    roots.forEach(function (root) {
      cartDomObserver.observe(root, { childList: true, subtree: true });
    });
  }

  function rulesForStorefrontInvoice() {
    return readRulesFromDocument().map(function (rule) {
      var copy = Object.assign({}, rule);
      if (String(copy.scope || "pack").toLowerCase() === "pack") {
        copy.scope = "both";
      }
      return copy;
    });
  }

  function withShopQuery(url, shop) {
    if (!url || !shop) {
      return url;
    }
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "shop=" + encodeURIComponent(shop);
  }

  function isCheckoutTrigger(target) {
    if (!target || !target.closest) {
      return null;
    }
    return (
      target.closest("#CartDrawer-Checkout") ||
      target.closest(".cart__checkout-button") ||
      target.closest('button[name="checkout"]') ||
      target.closest('input[name="checkout"]') ||
      target.closest('button[type="submit"][form="cart"]') ||
      target.closest('a[href="/checkout"]') ||
      target.closest('a[href$="/checkout"]') ||
      target.closest("[data-discount-rules-checkout]")
    );
  }

  function postCheckoutRace(urls, body) {
    return new Promise(function (resolve, reject) {
      var pending = urls.length;
      var settled = false;
      if (!pending) {
        reject(new Error("No hay endpoints de checkout."));
        return;
      }
      urls.forEach(function (url) {
        postJson(url, body).then(
          function (payload) {
            if (settled) {
              return;
            }
            if (payload && payload.invoiceUrl) {
              settled = true;
              resolve(payload);
              return;
            }
            pending -= 1;
            if (pending === 0) {
              reject(new Error((payload && payload.error) || "No se obtuvo invoiceUrl."));
            }
          },
          function () {
            if (settled) {
              return;
            }
            pending -= 1;
            if (pending === 0) {
              reject(new Error("No se obtuvo invoiceUrl."));
            }
          }
        );
      });
    });
  }

  function createStorefrontInvoiceCheckout() {
    var config = getConfig();
    var shop = (window.Shopify && window.Shopify.shop) || "caletzza.myshopify.com";
    var rules = rulesForStorefrontInvoice();

    return fetchCart().then(function (cart) {
      if (!cart || !cart.items || !cart.items.length) {
        throw new Error("El carrito está vacío.");
      }
      var body = {
        shop: shop,
        includePackRules: true,
        invoiceCheckout: true,
        action: "discounted_checkout",
        mode: "draft_invoice",
        checkoutSource: "storefront",
        rules: rules,
        items: cart.items,
        discountAmount: lastSummary ? Number(lastSummary.discountTotal || 0) : 0,
        email: cart.email || undefined
      };
      var urls = [
        withShopQuery(config.checkoutFallback, shop),
        config.checkoutEndpoint
      ];
      return postCheckoutRace(urls, body);
    });
  }

  function confirmShippingNotice(source) {
    var api = global.CzCheckoutShippingNotice;
    if (api && typeof api.show === "function") {
      return api.show(source);
    }
    return Promise.resolve(true);
  }

  function startDiscountedCheckout() {
    if (checkoutInFlight) {
      return Promise.resolve(null);
    }

    checkoutInFlight = true;
    // Preparar el invoice mientras el usuario lee el aviso (ahorra la demora tras Continuar).
    var invoicePromise = createStorefrontInvoiceCheckout();

    return confirmShippingNotice("storefront").then(function (ok) {
      if (!ok) {
        checkoutInFlight = false;
        return null;
      }
      var api = global.CzCheckoutShippingNotice;
      if (api && typeof api.setBusy === "function") {
        api.setBusy(true, "Aguarda, estamos aplicando los descuentos para alistar tu pedido...");
      }
      return invoicePromise;
    }).then(function (payload) {
      if (!payload) {
        return null;
      }
      if (!payload.invoiceUrl) {
        throw new Error((payload && payload.error) || "No se obtuvo invoiceUrl.");
      }
      window.location.href = payload.invoiceUrl;
      return payload;
    }).catch(function (error) {
      console.warn("DiscountRules checkout borrador:", error.message);
      checkoutInFlight = false;
      var api = global.CzCheckoutShippingNotice;
      if (api && typeof api.close === "function") {
        api.close();
      }
      window.alert("No se pudo abrir el checkout con descuento. Intenta de nuevo.");
      return null;
    });
  }

  function bindCheckoutIntercept() {
    if (document.documentElement.dataset.drCheckoutBound === "1") {
      return;
    }
    document.documentElement.dataset.drCheckoutBound = "1";

    document.addEventListener(
      "click",
      function (event) {
        var trigger = isCheckoutTrigger(event.target);
        if (!trigger) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        startDiscountedCheckout();
      },
      true
    );

    document.addEventListener(
      "submit",
      function (event) {
        var form = event.target;
        if (!form || form.id !== "cart") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        startDiscountedCheckout();
      },
      true
    );
  }

  function init() {
    bindCartEvents();
    bindCheckoutIntercept();
    scheduleRulesSync();
    scheduleRefreshCart();
    window.DiscountRulesCart = {
      refresh: refreshCart,
      scheduleRefresh: scheduleRefreshCart,
      startDiscountedCheckout: startDiscountedCheckout
    };
  }

  function boot() {
    waitForEngine(init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("discount-rules:ready", function () {
    boot();
    scheduleRulesSync();
  });
})(window);
