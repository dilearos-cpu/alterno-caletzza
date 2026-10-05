(function () {
  var secondsCache = {};
  var secondsInflight = {};

  function softMatch(a, b) {
    a = String(a == null ? "" : a);
    b = String(b == null ? "" : b);
    if (a === b) {
      return true;
    }
    a = a.toLowerCase().replace(/\s+/g, " ").trim();
    b = b.toLowerCase().replace(/\s+/g, " ").trim();
    if (a === b) {
      return true;
    }
    return a.replace(/\s+/g, "-") === b.replace(/\s+/g, "-");
  }

  function lookupSecond(map, value) {
    if (!map || !value) {
      return "";
    }
    if (map[value]) {
      return map[value];
    }
    return Object.keys(map).find(function (key) {
      return softMatch(key, value);
    })
      ? map[
          Object.keys(map).find(function (key) {
            return softMatch(key, value);
          })
        ]
      : "";
  }

  function buildSecondByColor(product) {
    var map = {};
    var colorIndex = typeof product.color_option_index === "number" ? product.color_option_index : 0;

    (product.variants || []).forEach(function (variant) {
      if (!variant.second_image) {
        return;
      }
      var colorValue = variant.options && variant.options[colorIndex];
      if (colorValue) {
        map[colorValue] = variant.second_image;
      }
    });

    if (product.second_by_color) {
      Object.keys(product.second_by_color).forEach(function (key) {
        map[key] = product.second_by_color[key];
      });
    }

    return map;
  }

  function mergeSecondsIntoProduct(product, payload) {
    if (!product || !payload) {
      return product;
    }

    product.color_option_index =
      typeof payload.color_option_index === "number" ? payload.color_option_index : product.color_option_index || 0;
    product.second_by_color = Object.assign({}, product.second_by_color || {}, payload.second_by_color || {});

    if (payload.variants && product.variants) {
      product.variants.forEach(function (variant) {
        var match = payload.variants.find(function (item) {
          return String(item.id) === String(variant.id);
        });
        if (match && match.second_image) {
          variant.second_image = match.second_image;
        }
      });
    }

    return product;
  }

  function detectColorOptionIndex(options) {
    if (!options || !options.length) {
      return 0;
    }

    for (var index = 0; index < options.length; index += 1) {
      var name = String(options[index].name || "").toLowerCase();
      if (name.indexOf("talla") !== -1 || name.indexOf("size") !== -1) {
        continue;
      }
      return index;
    }

    return 0;
  }

  function preloadSecondImages(map) {
    if (!map) {
      return;
    }

    Object.keys(map).forEach(function (key) {
      var url = map[key];
      if (!url) {
        return;
      }
      var img = new Image();
      img.decoding = "async";
      img.src = url;
    });
  }

  function fetchProductSeconds(product, section) {
    if (!product || !product.handle) {
      return Promise.resolve(product);
    }

    var cacheKey = String(product.id);
    if (secondsCache[cacheKey]) {
      return Promise.resolve(mergeSecondsIntoProduct(product, secondsCache[cacheKey]));
    }

    if (secondsInflight[cacheKey]) {
      return secondsInflight[cacheKey].then(function (payload) {
        return mergeSecondsIntoProduct(product, payload);
      });
    }

    var namespace = (section && section.dataset.metafieldNamespace) || "custom";
    var metafieldKey = (section && section.dataset.metafieldKey) || "custom_second_image";
    var secondsUrl =
      "/products/" +
      encodeURIComponent(product.handle) +
      "?view=pack-seconds&ns=" +
      encodeURIComponent(namespace) +
      "&key=" +
      encodeURIComponent(metafieldKey);

    secondsInflight[cacheKey] = fetch(secondsUrl)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("No se pudieron cargar las segundas imagenes.");
        }
        return response.json();
      })
      .then(function (payload) {
        secondsCache[cacheKey] = payload;
        delete secondsInflight[cacheKey];
        if (payload && payload.second_by_color) {
          preloadSecondImages(payload.second_by_color);
        }
        return payload;
      })
      .catch(function () {
        delete secondsInflight[cacheKey];
        return null;
      });

    return secondsInflight[cacheKey].then(function (payload) {
      return payload ? mergeSecondsIntoProduct(product, payload) : product;
    });
  }

  function isProductInStock(product) {
    if (!product || !product.default_variant_id) {
      return false;
    }

    if (product.variants && product.variants.length > 1) {
      return product.variants.some(function (variant) {
        return variant.available;
      });
    }

    return Boolean(product.available);
  }

  function transformShopifyProduct(product) {
    var firstImage = product.images && product.images.length ? product.images[0].src : "";
    var variants = (product.variants || []).map(function (variant) {
      var optionValues = [variant.option1, variant.option2, variant.option3].filter(function (value) {
        return value !== null && value !== undefined && value !== "";
      });

      return {
        id: variant.id,
        title: variant.title,
        available: variant.available,
        image: variant.featured_image && variant.featured_image.src ? variant.featured_image.src : "",
        second_image: "",
        price: Math.round(parseFloat(variant.price || 0) * 100),
        options: optionValues
      };
    });

    var transformed = {
      id: product.id,
      handle: product.handle,
      name: product.title,
      img: firstImage,
      available: product.available,
      is_variable: variants.length > 1,
      color_option_index: detectColorOptionIndex(product.options || []),
      second_by_color: {},
      default_variant_id: variants[0] ? variants[0].id : null,
      variants: variants,
      options: (product.options || []).map(function (option) {
        return {
          name: option.name,
          values: option.values
        };
      })
    };

    return isProductInStock(transformed) ? transformed : null;
  }

  function fetchCollectionProducts(handle, limit) {
    var collected = [];
    var page = 1;

    function fetchPage() {
      var remaining = limit - collected.length;
      var requestLimit = remaining > 250 ? 250 : remaining;

      return fetch(
        "/collections/" + encodeURIComponent(handle) + "/products.json?limit=" + requestLimit + "&page=" + page
      )
        .then(function (response) {
          if (!response.ok) {
            throw new Error("No se pudieron cargar mas productos.");
          }
          return response.json();
        })
        .then(function (data) {
          if (!data.products || !data.products.length) {
            return collected;
          }

          data.products.forEach(function (product) {
            var transformed = transformShopifyProduct(product);
            if (transformed) {
              collected.push(transformed);
            }
          });

          if (collected.length >= limit || data.products.length < requestLimit) {
            return collected.slice(0, limit);
          }

          page += 1;
          return fetchPage();
        });
    }

    return fetchPage();
  }

  function initPackUI(section) {
    if (!section || section.dataset.initialized === "true" || section.dataset.empty === "true") {
      return;
    }

    section.dataset.initialized = "true";

    var productsNode = section.querySelector("[data-pack-products]");
    if (!productsNode) {
      return;
    }

    var messageNode = section.querySelector("[data-pack-message]");

    function showInitMessage(text) {
      if (!messageNode) {
        return;
      }

      messageNode.hidden = false;
      messageNode.textContent = text;
      messageNode.classList.add("pack-ui__message--error");
    }

    var products = [];
    var productsLimit = Number(section.dataset.productsLimit || 50);
    var collectionHandle = section.dataset.collectionHandle || "";

    try {
      products = JSON.parse(productsNode.textContent).filter(function (product) {
        return isProductInStock(product);
      });
    } catch (error) {
      console.error("Pack Bodys 4: no se pudo leer el catalogo de productos.", error);
      showInitMessage("No se pudieron cargar los productos del pack. Recarga la pagina o revisa la seccion.");
      return;
    }

    function bootstrapPackUI() {
      products = products.filter(function (product) {
        return isProductInStock(product);
      });

      if (!products.length && productsLimit > 0) {
        showInitMessage("No hay productos disponibles en esta coleccion.");
      }
    var slotCount = Number(section.dataset.slotCount || 4);
    var cartUrl = section.dataset.cartUrl || "/cart/add.js";
    var checkoutUrl = section.dataset.checkoutUrl || "/checkout";
    var buyButton = section.querySelector(".pack-button--buy");
    var resetButton = section.querySelector(".pack-button--reset");
    var slots = Array.prototype.slice.call(section.querySelectorAll(".slot"));
    var productsModal = section.querySelector("[data-pack-modal]");
    var variantsModal = section.querySelector("[data-variant-modal]");
    var productsGrid = section.querySelector("[data-products-grid]");
    var paginationNode = section.querySelector("[data-pagination]");
    var variantContent = section.querySelector("[data-variant-content]");
    var codEnabled = section.dataset.codEnabled !== "false";
    var codCheckout = null;
    if (codEnabled && window.PackCodCheckout) {
      try {
        codCheckout = window.PackCodCheckout.create(section, {
          orderEndpoint: section.dataset.codEndpoint || "/apps/cod-express",
          checkoutEndpoint: "/apps/cod-express/checkout",
          checkoutFallback: "https://cod-express-r15e.onrender.com/checkout",
          collectionHandle: collectionHandle,
          // Flete fijo $26.000 (centavos Shopify) incluido en el total; oculto en UI.
          shippingFlat: 2600000,
          taxRatePercent: 0,
          disableTax: true,
          hideItemPrices: true,
          showNetSubtotal: true,
          concealShippingFee: true,
          pricingPaymentMethod: "cod",
          packKind: "bodys",
          freeShippingThreshold: 0,
          currency: section.dataset.codCurrency || "COP",
          packLabel: section.dataset.codPackLabel || "Pack Bodys",
          submitLabel: section.dataset.codSubmitLabel || "Confirmar pedido COD",
          onlineSubmitLabel: section.dataset.codOnlineSubmitLabel || "Continuar al pago seguro",
          loadingLabel: section.dataset.codLoadingLabel || "Procesando...",
          onlineLoadingLabel: "Redirigiendo al checkout...",
          paymentNoteCod: section.dataset.codPaymentNote || "",
          paymentNoteOnline: section.dataset.codOnlinePaymentNote || "",
          enableOnlinePayment: section.dataset.codEnableOnline !== "false",
          showCheckoutFallback: section.dataset.codFallback !== "false",
          storefrontToken: section.dataset.codStorefrontToken || "",
          storefrontApiUrl:
            "/api/" + (section.dataset.codStorefrontApi || "2025-01") + "/graphql.json",
          cartUrl: cartUrl,
          checkoutUrl: checkoutUrl
        });
      } catch (error) {
        console.error("Pack Bodys 4: no se pudo iniciar checkout COD.", error);
      }
    }

    var currentState = {
      currentSlot: null,
      selected: {},
      currentPage: 1,
      perPage: 20,
      currentProduct: null
    };

    function showMessage(text, isError) {
      if (!messageNode) {
        return;
      }

      messageNode.hidden = !text;
      messageNode.textContent = text || "";
      messageNode.classList.toggle("pack-ui__message--error", Boolean(text && isError));
      messageNode.classList.toggle("pack-ui__message--success", Boolean(text && !isError));
    }

    function openModal(modal) {
      modal.hidden = false;
      document.body.classList.add("pack-modal-open");
    }

    function closeModal(modal) {
      modal.hidden = true;
      if (productsModal.hidden && variantsModal.hidden) {
        document.body.classList.remove("pack-modal-open");
      }
    }

    function isSelectedProduct(product) {
      return Object.keys(currentState.selected).some(function (slot) {
        var entry = currentState.selected[slot];
        if (typeof entry === "object") {
          return entry.product_id === product.id;
        }
        return entry === product.default_variant_id;
      });
    }

    function renderProducts() {
      if (!products.length) {
        productsGrid.innerHTML = '<p class="pack-ui__empty">No hay productos disponibles en esta coleccion.</p>';
        paginationNode.innerHTML = "";
        return;
      }

      var start = (currentState.currentPage - 1) * currentState.perPage;
      var items = products.slice(start, start + currentState.perPage);

      productsGrid.innerHTML = items.map(function (product) {
        var selectedClass = isSelectedProduct(product) ? " prod--selected" : "";
        var imageMarkup = product.img ? '<img src="' + product.img + '" alt="' + product.name + '">' : '<div class="prod__placeholder">Sin imagen</div>';
        return (
          '<button type="button" class="prod' +
          selectedClass +
          '" data-product-id="' +
          product.id +
          '">' +
          imageMarkup +
          "<p>" +
          product.name +
          "</p></button>"
        );
      }).join("");

      var totalPages = Math.max(1, Math.ceil(products.length / currentState.perPage));
      paginationNode.innerHTML =
        '<button type="button" class="pack-page-button" data-page="prev"' +
        (currentState.currentPage === 1 ? " disabled" : "") +
        ">Anterior</button>" +
        "<span>Pagina " +
        currentState.currentPage +
        " de " +
        totalPages +
        "</span>" +
        '<button type="button" class="pack-page-button" data-page="next"' +
        (currentState.currentPage === totalPages ? " disabled" : "") +
        ">Siguiente</button>";
    }

    function fillSlot(slotNode, image, alt) {
      slotNode.innerHTML = image
        ? '<img src="' + image + '" alt="' + (alt || "Producto seleccionado") + '">'
        : '<span class="slot__plus">+</span>';
      slotNode.classList.toggle("slot--filled", Boolean(image));
    }

    function syncPromoSlots() {
      if (!window.PromoCountdown) {
        return;
      }

      window.PromoCountdown.setSlotsFilled(Object.keys(currentState.selected).length);
    }

    function resetSelections() {
      currentState.selected = {};
      slots.forEach(function (slot) {
        fillSlot(slot, null);
      });
      showMessage("", false);
      if (window.PromoCountdown) {
        window.PromoCountdown.resetSlots();
      }
    }

    function chooseSimpleProduct(product) {
      if (!product.default_variant_id) {
        showMessage("Este producto no tiene una variante disponible.", true);
        return;
      }

      if (!product.available) {
        showMessage("Este producto no esta disponible.", true);
        return;
      }
      fillSlot(currentState.currentSlot, product.img, product.name);
      currentState.selected[currentState.currentSlot.dataset.slot] = product.default_variant_id;
      syncPromoSlots();
      closeModal(productsModal);
    }

    function findMatchingVariant(product, chosenValues) {
      return product.variants.find(function (variant) {
        return chosenValues.every(function (value, index) {
          return variant.options[index] === value;
        });
      });
    }

    function getSecondImageUrl(product, variant, chosenValues) {
      if (!product) {
        return "";
      }

      var colorIndex = typeof product.color_option_index === "number" ? product.color_option_index : 0;
      var colorValue = chosenValues[colorIndex] || chosenValues[0] || "";
      var map = buildSecondByColor(product);
      var url = lookupSecond(map, colorValue);

      if (!url && variant && variant.second_image) {
        url = variant.second_image;
      }

      return url || "";
    }

    function updateSecondPreview(product, variant, chosenValues) {
      var secondWrap = variantContent.querySelector("[data-variant-second-wrap]");
      var secondPreview = variantContent.querySelector("[data-variant-second-preview]");
      if (!secondWrap || !secondPreview) {
        return;
      }

      var url = getSecondImageUrl(product, variant, chosenValues);
      if (!url) {
        secondWrap.hidden = true;
        secondWrap.classList.add("is-empty");
        secondPreview.removeAttribute("src");
        return;
      }

      secondPreview.src = url;
      secondWrap.hidden = false;
      secondWrap.classList.remove("is-empty");
    }

    function renderVariantPicker(product) {
      currentState.currentProduct = product;

      fetchProductSeconds(product, section).then(function (readyProduct) {
        currentState.currentProduct = readyProduct;

        var optionMarkup = readyProduct.options.map(function (option, index) {
          var options = option.values.map(function (value) {
            return '<option value="' + value + '">' + value + "</option>";
          }).join("");

          return (
            '<label class="variant-picker__label">' +
            option.name +
            '<select class="variant-picker__select" data-option-index="' +
            index +
            '">' +
            options +
            "</select></label>"
          );
        }).join("");

        variantContent.innerHTML =
          '<div class="variant-picker">' +
          '<div class="variant-picker__media">' +
          (readyProduct.img
            ? '<img class="variant-picker__image" data-variant-preview src="' +
              readyProduct.img +
              '" alt="' +
              readyProduct.name +
              '">'
            : "") +
          '<div class="variant-picker__second is-empty" data-variant-second-wrap hidden>' +
          '<img class="variant-picker__second-image" data-variant-second-preview alt="Segunda imagen">' +
          "</div>" +
          "</div>" +
          "<h3>" +
          readyProduct.name +
          "</h3>" +
          optionMarkup +
          '<button type="button" class="pack-button pack-button--select-variant" data-select-variant>Seleccionar</button>' +
          "</div>";

        updateVariantPreview();
        openModal(variantsModal);
      });
    }

    function updateVariantPreview() {
      if (!currentState.currentProduct) {
        return;
      }

      var selects = Array.prototype.slice.call(variantContent.querySelectorAll(".variant-picker__select"));
      var chosenValues = selects.map(function (select) {
        return select.value;
      });
      var variant = findMatchingVariant(currentState.currentProduct, chosenValues);
      var preview = variantContent.querySelector("[data-variant-preview]");
      var button = variantContent.querySelector("[data-select-variant]");

      if (!variant) {
        if (button) {
          button.disabled = true;
          button.textContent = "Seleccionar";
          button.classList.remove("pack-button--sold-out");
        }
        updateSecondPreview(currentState.currentProduct, null, chosenValues);
        return;
      }

      if (preview && variant.image) {
        preview.src = variant.image;
      }

      updateSecondPreview(currentState.currentProduct, variant, chosenValues);

      if (button) {
        button.disabled = !variant.available;
        button.textContent = variant.available ? "Seleccionar" : "Agotado";
        button.classList.toggle("pack-button--sold-out", !variant.available);
      }
    }

    function chooseVariant() {
      var selects = Array.prototype.slice.call(variantContent.querySelectorAll(".variant-picker__select"));
      var chosenValues = selects.map(function (select) {
        return select.value;
      });
      var variant = findMatchingVariant(currentState.currentProduct, chosenValues);

      if (!variant) {
        showMessage("No existe esa combinacion.", true);
        return;
      }

      if (!variant.available) {
        showMessage("La variante seleccionada no esta disponible.", true);
        return;
      }

      currentState.selected[currentState.currentSlot.dataset.slot] = {
        product_id: currentState.currentProduct.id,
        variant_id: variant.id
      };
      fillSlot(currentState.currentSlot, variant.image || currentState.currentProduct.img, currentState.currentProduct.name);
      syncPromoSlots();
      closeModal(variantsModal);
      closeModal(productsModal);
      showMessage("", false);
    }

    function validateSelection() {
      var ids = Object.keys(currentState.selected).sort().map(function (key) {
        return currentState.selected[key];
      });

      if (ids.length !== slotCount) {
        showMessage("Debes seleccionar " + slotCount + " productos.", true);
        return null;
      }

      return ids.map(function (entry) {
        return {
          id: typeof entry === "object" ? entry.variant_id : entry,
          quantity: 1
        };
      });
    }

    function addPackToCart() {
      var items = validateSelection();
      if (!items) {
        return;
      }

      if (codCheckout) {
        codCheckout.open(items, products, {
          onComplete: function () {
            resetSelections();
            showMessage("Pedido registrado correctamente.", false);
          }
        });
        return;
      }

      buyButton.disabled = true;
      buyButton.textContent = section.dataset.buttonLoadingText || "Procesando...";
      showMessage("", false);

      fetch(cartUrl + ".js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ items: items })
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("No se pudo agregar el pack al carrito.");
          }
          return response.json();
        })
        .then(function () {
          window.location.href = checkoutUrl;
        })
        .catch(function (error) {
          showMessage(error.message, true);
        })
        .finally(function () {
          buyButton.disabled = false;
          buyButton.textContent = section.dataset.buttonDefaultText || "Comprar ahora";
        });
    }

    slots.forEach(function (slot) {
      slot.addEventListener("click", function () {
        currentState.currentSlot = slot;
        renderProducts();
        openModal(productsModal);
      });
    });

    productsModal.addEventListener("click", function (event) {
      if (event.target === productsModal || event.target.closest("[data-close-products]")) {
        closeModal(productsModal);
      }

      var productButton = event.target.closest(".prod");
      if (!productButton) {
        return;
      }

      var product = products.find(function (item) {
        return String(item.id) === productButton.dataset.productId;
      });

      if (!product) {
        return;
      }

      if (product.is_variable) {
        renderVariantPicker(product);
      } else {
        chooseSimpleProduct(product);
      }
    });

    variantsModal.addEventListener("click", function (event) {
      if (event.target === variantsModal || event.target.closest("[data-close-variants]")) {
        closeModal(variantsModal);
      }

      if (event.target.closest("[data-select-variant]")) {
        chooseVariant();
      }
    });

    paginationNode.addEventListener("click", function (event) {
      var pageButton = event.target.closest("[data-page]");
      if (!pageButton) {
        return;
      }

      var totalPages = Math.max(1, Math.ceil(products.length / currentState.perPage));
      if (pageButton.dataset.page === "next" && currentState.currentPage < totalPages) {
        currentState.currentPage += 1;
      }
      if (pageButton.dataset.page === "prev" && currentState.currentPage > 1) {
        currentState.currentPage -= 1;
      }
      renderProducts();
    });

    variantContent.addEventListener("change", function (event) {
      if (event.target.matches(".variant-picker__select")) {
        updateVariantPreview();
      }
    });

    resetButton.addEventListener("click", resetSelections);
    buyButton.addEventListener("click", addPackToCart);

    window.PackCheckout = window.PackCheckout || {};
    window.PackCheckout.triggerBuy = function () {
      buyButton.click();
    };

    function getAvailableSizes() {
      var sizes = [];
      var seen = {};

      products.forEach(function (product) {
        if (!product.options || !product.options.length) {
          return;
        }

        product.options.forEach(function (option, optionIndex) {
          var optionName = String(option.name || "").toLowerCase();
          if (optionName.indexOf("talla") === -1 && optionName.indexOf("size") === -1) {
            return;
          }

          (option.values || []).forEach(function (value) {
            if (!value || seen[value]) {
              return;
            }

            var hasAvailable = (product.variants || []).some(function (variant) {
              return (
                variant.available &&
                variant.options &&
                variant.options[optionIndex] === value
              );
            });

            if (hasAvailable) {
              seen[value] = true;
              sizes.push(value);
            }
          });
        });
      });

      return sizes;
    }

    function fillSelections(selections) {
      resetSelections();

      (selections || []).forEach(function (selection) {
        var slotNode = slots[selection.slotIndex];
        if (!slotNode) {
          return;
        }

        var slotKey = slotNode.dataset.slot;
        if (selection.productId) {
          currentState.selected[slotKey] = {
            product_id: selection.productId,
            variant_id: selection.variantId
          };
        } else {
          currentState.selected[slotKey] = selection.variantId;
        }

        fillSlot(slotNode, selection.image, selection.name);
      });

      syncPromoSlots();
      showMessage("", false);
    }

    if (window.PackPage && typeof window.PackPage.registerPackBuilder === "function") {
      window.PackPage.registerPackBuilder(section.dataset.sectionId, {
        packMode: "variable",
        packSection: section,
        getProducts: function () {
          return products;
        },
        getSlotCount: function () {
          return slotCount;
        },
        getAvailableSizes: getAvailableSizes,
        fillSelections: fillSelections
      });
    }
    }

    if (collectionHandle && productsLimit > products.length) {
      fetchCollectionProducts(collectionHandle, productsLimit)
        .then(function (fetchedProducts) {
          if (fetchedProducts.length) {
            products = fetchedProducts.filter(function (product) {
              return isProductInStock(product);
            });
          }
          bootstrapPackUI();
        })
        .catch(function (error) {
          console.error("Pack Bodys 4: error cargando productos extra.", error);
          bootstrapPackUI();
        });
      return;
    }

    bootstrapPackUI();
  }

  function initAllPackSections() {
    document.querySelectorAll('.pack-ui[data-pack-mode="variable"]').forEach(initPackUI);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllPackSections);
  } else {
    initAllPackSections();
  }

  document.addEventListener("shopify:section:load", function (event) {
    initPackUI(event.target.querySelector('.pack-ui[data-pack-mode="variable"]'));
  });
})();
