/**
 * Aviso de envío antes del checkout draft.
 * storefront → envío no incluido; landing → envío gratis.
 */
(function (global) {
  var STYLE_ID = "cz-checkout-shipping-notice-style";
  var ROOT_ID = "cz-checkout-shipping-notice";
  var activeRoot = null;

  var MESSAGES = {
    storefront: "El valor del pedido no incluye el flete",
    landing: "Recuerda, el envío de tu pedido es GRATIS."
  };

  function ensureStyles() {
    var css =
      "#" +
      ROOT_ID +
      "{position:fixed;inset:0;z-index:1000025;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(40,24,16,.55);}" +
      "#" +
      ROOT_ID +
      "[hidden]{display:none!important;}" +
      "#" +
      ROOT_ID +
      " .cz-ship-notice__dialog{width:min(440px,100%);background:#fffaf6;color:#3b2418;border-radius:16px;padding:30px 24px 24px;box-shadow:0 18px 48px rgba(40,24,16,.28);font-family:inherit;}" +
      "#" +
      ROOT_ID +
      " .cz-ship-notice__title{margin:0 0 16px;font-size:1.75rem;font-weight:700;letter-spacing:.01em;line-height:1.25;}" +
      "#" +
      ROOT_ID +
      " .cz-ship-notice__text{margin:0 0 26px;font-size:1.45rem;font-weight:600;line-height:1.4;}" +
      "#" +
      ROOT_ID +
      " .cz-ship-notice__actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}" +
      "#" +
      ROOT_ID +
      " .cz-ship-notice__btn{appearance:none;border:0;border-radius:999px;padding:14px 20px;font-size:1.1rem;font-weight:600;cursor:pointer;line-height:1.25;}" +
      "#" +
      ROOT_ID +
      " .cz-ship-notice__btn--primary{max-width:100%;text-align:center;white-space:normal;}" +
      "#" +
      ROOT_ID +
      " .cz-ship-notice__btn--ghost{background:transparent;color:#6b4a38;}" +
      "#" +
      ROOT_ID +
      " .cz-ship-notice__btn--primary{background:#3b2418;color:#fffaf6;}" +
      "#" +
      ROOT_ID +
      " .cz-ship-notice__btn--primary:hover{background:#2a1810;}" +
      "#" +
      ROOT_ID +
      " .cz-ship-notice__btn:disabled{opacity:.7;cursor:wait;}";

    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  function closeSlideCart() {
    var drawer = document.querySelector("cart-drawer");
    if (drawer && typeof drawer.close === "function") {
      try {
        drawer.close();
      } catch (error) {
        /* ignore */
      }
    }
    document.body.classList.remove("overflow-hidden");
  }

  function removeRoot() {
    var existing = document.getElementById(ROOT_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    activeRoot = null;
  }

  function setBusy(busy, label) {
    if (!activeRoot) {
      return;
    }
    var primary = activeRoot.querySelector("[data-cz-ship-continue]");
    var cancel = activeRoot.querySelector("[data-cz-ship-cancel]");
    if (primary) {
      primary.disabled = !!busy;
      if (busy && label) {
        primary.textContent = label;
      } else if (!busy) {
        primary.textContent = "Continuar";
      }
    }
    if (cancel) {
      cancel.disabled = !!busy;
      cancel.hidden = !!busy;
    }
  }

  function close() {
    removeRoot();
  }

  /**
   * @param {"storefront"|"landing"} source
   * @returns {Promise<boolean>} true si continúa al checkout
   */
  function show(source) {
    ensureStyles();
    removeRoot();
    closeSlideCart();

    var key = source === "landing" ? "landing" : "storefront";
    var message = MESSAGES[key];
    var title = key === "landing" ? "Envío gratis" : "Información de envío";

    return new Promise(function (resolve) {
      var root = document.createElement("div");
      root.id = ROOT_ID;
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-labelledby", "cz-ship-notice-title");

      root.innerHTML =
        '<div class="cz-ship-notice__dialog">' +
        '<h2 class="cz-ship-notice__title" id="cz-ship-notice-title">' +
        title +
        "</h2>" +
        '<p class="cz-ship-notice__text"></p>' +
        '<div class="cz-ship-notice__actions">' +
        '<button type="button" class="cz-ship-notice__btn cz-ship-notice__btn--ghost" data-cz-ship-cancel>Cancelar</button>' +
        '<button type="button" class="cz-ship-notice__btn cz-ship-notice__btn--primary" data-cz-ship-continue>Continuar</button>' +
        "</div></div>";

      root.querySelector(".cz-ship-notice__text").textContent = message;

      window.setTimeout(function () {
        document.body.appendChild(root);
        activeRoot = root;

        var settled = false;
        function finish(ok) {
          if (settled) {
            return;
          }
          settled = true;
          document.removeEventListener("keydown", onKey);
          if (!ok) {
            removeRoot();
          }
          resolve(ok);
        }

        function onKey(event) {
          if (event.key === "Escape") {
            finish(false);
          }
        }

        root.querySelector("[data-cz-ship-cancel]").addEventListener("click", function () {
          finish(false);
        });
        root.querySelector("[data-cz-ship-continue]").addEventListener("click", function () {
          setBusy(true, "Aguarda, estamos aplicando los descuentos para alistar tu pedido...");
          finish(true);
        });
        root.addEventListener("click", function (event) {
          if (event.target === root) {
            finish(false);
          }
        });
        document.addEventListener("keydown", onKey);

        var primary = root.querySelector("[data-cz-ship-continue]");
        if (primary && primary.focus) {
          primary.focus();
        }
      }, 80);
    });
  }

  global.CzCheckoutShippingNotice = {
    show: show,
    setBusy: setBusy,
    close: close,
    messages: MESSAGES
  };
})(window);
