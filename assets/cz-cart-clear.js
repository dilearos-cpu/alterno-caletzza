/**
 * Vaciar carrito (botón) + auto-clear tras 5 min sin agregar ítems.
 */
(function (global) {
  var IDLE_MS = 5 * 60 * 1000;
  var STORAGE_KEY = "cz_cart_last_add_at";
  var CHECK_MS = 15000;
  var clearing = false;
  var checkTimer = null;

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function now() {
    return Date.now();
  }

  function readLastAdd() {
    var raw = 0;
    try {
      raw = Number(global.localStorage.getItem(STORAGE_KEY) || 0);
    } catch (error) {
      raw = 0;
    }
    return raw > 0 ? raw : 0;
  }

  function writeLastAdd(ts) {
    try {
      global.localStorage.setItem(STORAGE_KEY, String(ts || now()));
    } catch (error) {
      /* ignore */
    }
  }

  function clearLastAdd() {
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* ignore */
    }
  }

  function cartHasItems() {
    var drawer = qs("cart-drawer");
    if (drawer && !drawer.classList.contains("is-empty")) {
      return true;
    }
    var bubble = qs(".cart-count-bubble span[aria-hidden='true'], .cart-count-bubble span:first-child");
    if (bubble) {
      var n = parseInt(String(bubble.textContent || "").replace(/\D/g, ""), 10);
      if (n > 0) {
        return true;
      }
    }
    return false;
  }

  function markItemAdded() {
    writeLastAdd(now());
    scheduleIdleCheck();
  }

  function sectionIds() {
    return ["cart-drawer", "cart-icon-bubble"];
  }

  function refreshCartUi(sections) {
    if (!sections) {
      global.location.reload();
      return;
    }

    var drawer = qs("cart-drawer");
    if (drawer && sections["cart-drawer"]) {
      var doc = new DOMParser().parseFromString(sections["cart-drawer"], "text/html");
      var nextDrawer = doc.querySelector("#CartDrawer");
      var currentDrawer = document.getElementById("CartDrawer");
      if (nextDrawer && currentDrawer) {
        currentDrawer.innerHTML = nextDrawer.innerHTML;
      }
      drawer.classList.add("is-empty");
      var overlay = qs("#CartDrawer-Overlay", drawer);
      if (overlay) {
        overlay.addEventListener("click", function () {
          if (typeof drawer.close === "function") {
            drawer.close();
          }
        });
      }
    }

    if (sections["cart-icon-bubble"]) {
      var bubbleHost =
        document.getElementById("shopify-section-cart-icon-bubble") ||
        document.querySelector(".shopify-section:has(#cart-icon-bubble)") ||
        qs("#cart-icon-bubble") && qs("#cart-icon-bubble").closest(".shopify-section");
      if (bubbleHost) {
        var bubbleDoc = new DOMParser().parseFromString(sections["cart-icon-bubble"], "text/html");
        var nextSection = bubbleDoc.querySelector(".shopify-section") || bubbleDoc.body;
        if (nextSection) {
          bubbleHost.innerHTML = nextSection.innerHTML;
        }
      }
    }

    var wrap = qs("[data-cz-cart-clear-wrap]");
    if (wrap) {
      wrap.hidden = true;
    }
    if (global.DiscountRulesCart && typeof global.DiscountRulesCart.scheduleRefresh === "function") {
      global.DiscountRulesCart.scheduleRefresh();
    }
    if (global.publish && global.PUB_SUB_EVENTS && global.PUB_SUB_EVENTS.cartUpdate) {
      try {
        global.publish(global.PUB_SUB_EVENTS.cartUpdate, {
          source: "cz-cart-clear",
          cartData: { item_count: 0 }
        });
      } catch (error) {
        /* ignore */
      }
    }
  }

  function fetchSections() {
    var root = (global.Shopify && global.Shopify.routes && global.Shopify.routes.root) || "/";
    var url = root + "?sections=" + sectionIds().join(",");
    return fetch(url, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) {
        throw new Error("No se pudieron refrescar las secciones del carrito.");
      }
      return res.json();
    });
  }

  function clearCart(opts) {
    if (clearing) {
      return Promise.resolve(false);
    }
    opts = opts || {};
    clearing = true;
    var btn = qs("[data-cz-cart-clear]");
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
    }

    return fetch("/cart/clear.js", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      credentials: "same-origin"
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("No se pudo vaciar el carrito.");
        }
        return fetchSections();
      })
      .then(function (sections) {
        clearLastAdd();
        refreshCartUi(sections);
        if (!opts.silent && opts.closeDrawer !== false) {
          var drawer = qs("cart-drawer");
          if (drawer && typeof drawer.close === "function") {
            drawer.close();
          }
        }
        return true;
      })
      .catch(function (error) {
        console.warn("cz-cart-clear:", error && error.message ? error.message : error);
        if (!opts.silent) {
          global.alert("No se pudo vaciar el carrito. Intenta de nuevo.");
        }
        return false;
      })
      .finally(function () {
        clearing = false;
        if (btn) {
          btn.disabled = false;
          btn.removeAttribute("aria-busy");
        }
        scheduleIdleCheck();
      });
  }

  function idleExpired() {
    if (!cartHasItems()) {
      return false;
    }
    var last = readLastAdd();
    if (!last) {
      // Carrito con ítems pero sin marca: iniciar ventana desde ahora.
      writeLastAdd(now());
      return false;
    }
    return now() - last >= IDLE_MS;
  }

  function scheduleIdleCheck() {
    if (checkTimer) {
      global.clearTimeout(checkTimer);
      checkTimer = null;
    }
    if (!cartHasItems()) {
      return;
    }
    var last = readLastAdd() || now();
    if (!readLastAdd()) {
      writeLastAdd(last);
    }
    var remaining = Math.max(1000, IDLE_MS - (now() - last));
    checkTimer = global.setTimeout(function () {
      if (idleExpired()) {
        clearCart({ silent: true, closeDrawer: true });
        return;
      }
      scheduleIdleCheck();
    }, Math.min(remaining, CHECK_MS));
  }

  function bindClearButton() {
    document.addEventListener("click", function (event) {
      var btn = event.target && event.target.closest ? event.target.closest("[data-cz-cart-clear]") : null;
      if (!btn) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      clearCart({ silent: false, closeDrawer: false });
    });
  }

  function patchFetchForAdds() {
    if (!global.fetch || global.fetch.__czCartClearPatched) {
      return;
    }
    var original = global.fetch.bind(global);
    function patched(input, init) {
      var url = typeof input === "string" ? input : input && input.url ? input.url : "";
      return original(input, init).then(function (response) {
        try {
          if (response && response.ok && /\/cart\/(add|add\.js)/i.test(String(url))) {
            markItemAdded();
          }
        } catch (error) {
          /* ignore */
        }
        return response;
      });
    }
    patched.__czCartClearPatched = true;
    global.fetch = patched;
  }

  function bindPubSub() {
    document.addEventListener("cart:updated", function () {
      // No marcar como "add" genérico; solo agenda chequeo.
      scheduleIdleCheck();
    });
    if (global.subscribe && global.PUB_SUB_EVENTS && global.PUB_SUB_EVENTS.cartUpdate) {
      try {
        global.subscribe(global.PUB_SUB_EVENTS.cartUpdate, function (payload) {
          if (payload && payload.source === "cz-cart-clear") {
            return;
          }
          scheduleIdleCheck();
        });
      } catch (error) {
        /* ignore */
      }
    }
  }

  function syncClearWrapVisibility() {
    var wrap = qs("[data-cz-cart-clear-wrap]");
    if (!wrap) {
      return;
    }
    wrap.hidden = !cartHasItems();
  }

  function init() {
    bindClearButton();
    patchFetchForAdds();
    bindPubSub();
    syncClearWrapVisibility();
    if (cartHasItems()) {
      if (!readLastAdd()) {
        writeLastAdd(now());
      }
      scheduleIdleCheck();
    }
    global.CzCartClear = {
      clear: clearCart,
      markItemAdded: markItemAdded,
      scheduleIdleCheck: scheduleIdleCheck
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
