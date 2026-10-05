(function () {
  var modal = null;
  var product = null;
  var selectedColor = "";
  var selectedSize = "";
  var lastOpener = null;
  var lastCard = null;

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function ensureModal() {
    if (modal) {
      return modal;
    }
    modal = qs("[data-cz-qb-modal]");
    if (!modal) {
      return null;
    }
    modal.addEventListener("click", function (event) {
      if (event.target.closest("[data-cz-qb-close]")) {
        closeModal();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal && !modal.hidden) {
        closeModal();
      }
    });
    qs("[data-cz-qb-colors]", modal).addEventListener("click", function (event) {
      var btn = event.target.closest("[data-color]");
      if (!btn) {
        return;
      }
      selectedColor = btn.getAttribute("data-color");
      renderOptions();
      syncCardImage();
    });
    qs("[data-cz-qb-sizes]", modal).addEventListener("click", function (event) {
      var btn = event.target.closest("[data-size]");
      if (!btn || btn.disabled) {
        return;
      }
      selectedSize = btn.getAttribute("data-size");
      renderOptions();
    });
    qs("[data-cz-qb-submit]", modal).addEventListener("click", submitCart);
    return modal;
  }

  function findVariant() {
    if (!product) {
      return null;
    }
    return (product.variants || []).find(function (variant) {
      var colorOk = !product.colors.length || variant.color === selectedColor;
      var sizeOk = !product.sizes.length || variant.size === selectedSize;
      return colorOk && sizeOk;
    }) || null;
  }

  function findColorImage() {
    if (!product || !selectedColor) {
      return null;
    }
    var colorItem = (product.colors || []).find(function (item) {
      return item.name === selectedColor;
    });
    if (colorItem && colorItem.image) {
      return {
        image: colorItem.image,
        url: colorItem.url || ""
      };
    }
    var variant = (product.variants || []).find(function (item) {
      return item.color === selectedColor && item.image;
    });
    if (variant) {
      return {
        image: variant.image,
        url: variant.url || ""
      };
    }
    return null;
  }

  function syncCardImage() {
    if (!lastCard) {
      return;
    }
    var media = findColorImage();
    if (!media || !media.image) {
      return;
    }
    if (typeof window.czApplyCardImage === "function") {
      window.czApplyCardImage(lastCard, media.image, media.url || "");
    }
    var dots = lastCard.querySelectorAll("[data-cz-swatches] .cz-card-swatches__dot");
    if (!dots.length) {
      return;
    }
    dots.forEach(function (dot) {
      var active = dot.getAttribute("aria-label") === selectedColor;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function variantAvailableFor(color, size) {
    return (product.variants || []).some(function (variant) {
      var colorOk = !color || variant.color === color;
      var sizeOk = !size || variant.size === size;
      return colorOk && sizeOk && variant.available;
    });
  }

  function showError(message) {
    var node = qs("[data-cz-qb-error]", modal);
    if (!node) {
      return;
    }
    node.hidden = !message;
    node.textContent = message || "";
  }

  function renderOptions() {
    var colorWrap = qs("[data-cz-qb-colors]", modal);
    var sizeWrap = qs("[data-cz-qb-sizes]", modal);
    var colorGroup = qs("[data-cz-qb-color-group]", modal);
    var sizeGroup = qs("[data-cz-qb-size-group]", modal);
    var submit = qs("[data-cz-qb-submit]", modal);
    var variant = findVariant();

    colorGroup.hidden = !(product.colors && product.colors.length);
    sizeGroup.hidden = !(product.sizes && product.sizes.length);
    qs("[data-cz-qb-color-label]", modal).textContent = product.colorName || "Color";
    qs("[data-cz-qb-size-label]", modal).textContent = product.sizeName || "Talla";

    colorWrap.innerHTML = (product.colors || [])
      .map(function (item) {
        var active = item.name === selectedColor ? " is-active" : "";
        var available = variantAvailableFor(item.name, "");
        var unavailable = available ? "" : " is-unavailable";
        var style = item.color ? "--cz-swatch-color:" + item.color + ";" : "";
        return (
          '<button type="button" class="cz-qb-modal__swatch' +
          active +
          unavailable +
          '" data-color="' +
          item.name.replace(/"/g, "&quot;") +
          '" style="' +
          style +
          '" aria-label="' +
          item.name.replace(/"/g, "&quot;") +
          (available ? "" : " (agotado)") +
          '" aria-pressed="' +
          (item.name === selectedColor) +
          '"></button>'
        );
      })
      .join("");

    sizeWrap.innerHTML = (product.sizes || [])
      .map(function (size) {
        var available = variantAvailableFor(selectedColor, size);
        var active = size === selectedSize ? " is-active" : "";
        return (
          '<button type="button" class="cz-qb-modal__size' +
          active +
          '" data-size="' +
          size.replace(/"/g, "&quot;") +
          '"' +
          (available ? "" : " disabled") +
          ">" +
          size +
          "</button>"
        );
      })
      .join("");

    if (!variant) {
      submit.disabled = true;
      showError("Esa combinación no está disponible.");
      return;
    }
    if (!variant.available) {
      submit.disabled = true;
      showError("Agotado en esa talla y color.");
      return;
    }
    submit.disabled = false;
    showError("");
  }

  function openModal(data, opener) {
    if (!ensureModal()) {
      return;
    }
    product = data;
    lastOpener = opener || null;
    lastCard = opener ? opener.closest("[data-cz-product-card]") : null;
    var firstAvailable = (product.variants || []).find(function (variant) {
      return variant.available;
    }) || product.variants[0] || {};
    selectedColor = firstAvailable.color || (product.colors[0] && product.colors[0].name) || "";
    selectedSize = firstAvailable.size || product.sizes[0] || "";
    renderOptions();
    syncCardImage();
    modal.hidden = false;
    document.body.classList.add("cz-qb-open");
    var dialog = qs(".cz-qb-modal__dialog", modal);
    if (dialog) {
      dialog.focus();
    }
  }

  function closeModal() {
    if (!modal) {
      return;
    }
    modal.hidden = true;
    document.body.classList.remove("cz-qb-open");
    if (lastOpener) {
      lastOpener.focus();
    }
  }

  function submitCart() {
    var variant = findVariant();
    var submit = qs("[data-cz-qb-submit]", modal);
    if (!variant || !variant.available || !submit || submit.disabled) {
      return;
    }

    var cart = document.querySelector("cart-drawer") || document.querySelector("cart-notification");
    var formData = new FormData();
    formData.append("id", String(variant.id));
    formData.append("quantity", "1");
    if (cart && typeof cart.getSectionsToRender === "function") {
      formData.append(
        "sections",
        cart.getSectionsToRender().map(function (section) {
          return section.id;
        }).join(",")
      );
      formData.append("sections_url", window.location.pathname);
      if (typeof cart.setActiveElement === "function") {
        cart.setActiveElement(document.activeElement);
      }
    }

    submit.disabled = true;
    submit.textContent = "Agregando...";
    showError("");

    fetch((window.routes && window.routes.cart_add_url) || "/cart/add", {
      method: "POST",
      headers: {
        Accept: "application/javascript",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: formData
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (payload) {
        if (payload.status) {
          throw new Error(payload.description || payload.message || "No se pudo agregar.");
        }
        closeModal();
        if (cart && typeof cart.renderContents === "function") {
          cart.renderContents(payload);
          if (cart.classList && cart.classList.contains("is-empty")) {
            cart.classList.remove("is-empty");
          }
        } else {
          window.location.href = (window.routes && window.routes.cart_url) || "/cart";
        }
        if (window.publish && window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) {
          window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
            source: "cz-quick-buy",
            productVariantId: variant.id,
            cartData: payload
          });
        }
      })
      .catch(function (error) {
        showError(error.message || "No se pudo agregar al carrito.");
      })
      .finally(function () {
        submit.disabled = false;
        submit.textContent = "Agregar al carrito";
      });
  }

  function readProduct(button) {
    var wrap = button.closest("[data-cz-quick-buy]");
    if (!wrap) {
      return null;
    }
    var node = wrap.querySelector("script[type='application/json']");
    if (!node) {
      return null;
    }
    try {
      return JSON.parse(node.textContent || "{}");
    } catch (error) {
      return null;
    }
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-cz-quick-buy-open]");
    if (!button) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    var data = readProduct(button);
    if (!data) {
      return;
    }
    openModal(data, button);
  });
})();
