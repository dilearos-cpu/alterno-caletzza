(function () {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isSimpleShopifyProduct(product) {
    return !product.variants || product.variants.length <= 1;
  }

  function transformSimpleProduct(product) {
    if (!isSimpleShopifyProduct(product)) {
      return null;
    }

    var firstImage = product.images && product.images.length ? product.images[0].src : "";
    var variant = product.variants && product.variants[0] ? product.variants[0] : null;

    if (!variant || !variant.id || !variant.available) {
      return null;
    }

    return {
      id: product.id,
      handle: product.handle,
      name: product.title,
      img: firstImage,
      available: Boolean(variant.available),
      default_variant_id: variant.id,
      price: Number(variant.price || 0)
    };
  }

  function fetchSimpleCollectionProducts(handle, limit) {
    var collected = [];
    var page = 1;
    var hasMorePages = true;

    function fetchPage() {
      if (!hasMorePages || collected.length >= limit) {
        return Promise.resolve(collected.slice(0, limit));
      }

      return fetch(
        "/collections/" + encodeURIComponent(handle) + "/products.json?limit=250&page=" + page
      )
        .then(function (response) {
          if (!response.ok) {
            throw new Error("No se pudieron cargar mas productos.");
          }
          return response.json();
        })
        .then(function (data) {
          if (!data.products || !data.products.length) {
            hasMorePages = false;
            return collected.slice(0, limit);
          }

          data.products.forEach(function (product) {
            if (collected.length >= limit) {
              return;
            }

            var transformed = transformSimpleProduct(product);
            if (transformed) {
              collected.push(transformed);
            }
          });

          if (data.products.length < 250) {
            hasMorePages = false;
          } else {
            page += 1;
          }

          return fetchPage();
        });
    }

    return fetchPage();
  }

  function initPackBasicas(section) {
    if (!section || section.dataset.initialized === "true" || section.dataset.empty === "true") {
      return;
    }

    var productsNode = section.querySelector("[data-pack-products]");
    if (!productsNode) {
      return;
    }

    section.dataset.initialized = "true";

    var messageNode = section.querySelector("[data-pack-message]");
    var products = [];
    var productsLimit = Number(section.dataset.productsLimit || 50);
    var collectionHandle = section.dataset.collectionHandle || "";
    var renderProductsRef = null;

    function showInitMessage(text) {
      if (!messageNode) {
        return;
      }

      messageNode.hidden = false;
      messageNode.textContent = text;
      messageNode.classList.add("pack-ui__message--error");
    }

    try {
      products = JSON.parse(productsNode.textContent).filter(function (product) {
        return Boolean(product.default_variant_id) && product.available;
      });
    } catch (error) {
      console.error("Pack Basicas: no se pudo leer el catalogo de productos.", error);
      showInitMessage("No se pudieron cargar los productos del pack. Recarga la pagina o revisa la seccion.");
      return;
    }

    function findProductById(productId) {
      var targetId = String(productId);
      return products.find(function (item) {
        return String(item.id) === targetId;
      });
    }

    function bootstrapPackUI() {
      products = products.filter(function (product) {
        return Boolean(product.default_variant_id) && product.available;
      });

      if (!products.length && productsLimit > 0) {
        showInitMessage("No hay productos simples disponibles en esta coleccion.");
      }

      var slotCount = Number(section.dataset.slotCount || 4);
      var cartUrl = section.dataset.cartUrl || "/cart/add.js";
      var checkoutUrl = section.dataset.checkoutUrl || "/checkout";
      var buyButton = section.querySelector(".pack-button--buy");
      var resetButton = section.querySelector(".pack-button--reset");
      var slots = Array.prototype.slice.call(section.querySelectorAll(".slot"));
      var productsModal = section.querySelector("[data-pack-modal]");
      var productsGrid = section.querySelector("[data-products-grid]");
      var paginationNode = section.querySelector("[data-pagination]");
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
            packKind: "basicas",
            freeShippingThreshold: 0,
            currency: section.dataset.codCurrency || "COP",
            packLabel: section.dataset.codPackLabel || "Pack Basicas",
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
          console.error("Pack Basicas: no se pudo iniciar checkout COD.", error);
        }
      }

      var currentState = {
        currentSlot: null,
        selected: {},
        currentPage: 1,
        perPage: 40
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

      function openModal() {
        productsModal.hidden = false;
        document.body.classList.add("pack-modal-open");
      }

      function closeModal() {
        productsModal.hidden = true;
        document.body.classList.remove("pack-modal-open");
      }

      function isSelectedProduct(product) {
        return Object.keys(currentState.selected).some(function (slot) {
          return String(currentState.selected[slot]) === String(product.default_variant_id);
        });
      }

      function renderProducts() {
        if (!products.length) {
          productsGrid.innerHTML = '<p class="pack-ui__empty">No hay productos simples en esta coleccion.</p>';
          paginationNode.innerHTML = "";
          return;
        }

        var start = (currentState.currentPage - 1) * currentState.perPage;
        var items = products.slice(start, start + currentState.perPage);

        productsGrid.innerHTML = items
          .map(function (product) {
            var selectedClass = isSelectedProduct(product) ? " prod--selected" : "";
            var safeName = escapeHtml(product.name);
            var imageMarkup = product.img
              ? '<img src="' + escapeHtml(product.img) + '" alt="' + safeName + '">'
              : '<div class="prod__placeholder">Sin imagen</div>';
            return (
              '<button type="button" class="prod' +
              selectedClass +
              '" data-product-id="' +
              String(product.id) +
              '">' +
              imageMarkup +
              "<p>" +
              safeName +
              "</p></button>"
            );
          })
          .join("");

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

      renderProductsRef = renderProducts;

      function fillSlot(slotNode, image, alt) {
        slotNode.innerHTML = image
          ? '<img src="' + image + '" alt="' + escapeHtml(alt || "Producto seleccionado") + '">'
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

      function chooseProduct(product) {
        if (!product || !product.default_variant_id) {
          showMessage("Este producto no tiene una variante disponible.", true);
          return;
        }

        if (!product.available) {
          showMessage("Este producto no esta disponible.", true);
          return;
        }

        if (!currentState.currentSlot) {
          showMessage("Selecciona primero un espacio del pack.", true);
          return;
        }

        fillSlot(currentState.currentSlot, product.img, product.name);
        currentState.selected[currentState.currentSlot.dataset.slot] = product.default_variant_id;
        syncPromoSlots();
        closeModal();
        showMessage("", false);
      }

      function validateSelection() {
        var ids = Object.keys(currentState.selected)
          .sort()
          .map(function (key) {
            return currentState.selected[key];
          });

        if (ids.length !== slotCount) {
          showMessage("Debes seleccionar " + slotCount + " productos.", true);
          return null;
        }

        return ids.map(function (variantId) {
          return {
            id: variantId,
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
          currentState.currentPage = 1;
          renderProducts();
          openModal();
        });
      });

      productsModal.addEventListener("click", function (event) {
        var productButton = event.target.closest(".prod");
        if (productButton) {
          event.preventDefault();
          event.stopPropagation();
          var product = findProductById(productButton.dataset.productId);
          if (product) {
            chooseProduct(product);
          }
          return;
        }

        if (event.target === productsModal || event.target.closest("[data-close-products]")) {
          closeModal();
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

      resetButton.addEventListener("click", resetSelections);
      buyButton.addEventListener("click", addPackToCart);

      window.PackCheckout = window.PackCheckout || {};
      window.PackCheckout.triggerBuy = function () {
        buyButton.click();
      };

      function fillSelections(selections) {
        resetSelections();

        (selections || []).forEach(function (selection) {
          var slotNode = slots[selection.slotIndex];
          if (!slotNode) {
            return;
          }

          currentState.selected[slotNode.dataset.slot] = selection.variantId;
          fillSlot(slotNode, selection.image, selection.name);
        });

        syncPromoSlots();
        showMessage("", false);
      }

      if (window.PackPage && typeof window.PackPage.registerPackBuilder === "function") {
        window.PackPage.registerPackBuilder(section.dataset.sectionId, {
          packMode: "simple",
          packSection: section,
          getProducts: function () {
            return products;
          },
          getSlotCount: function () {
            return slotCount;
          },
          getAvailableSizes: function () {
            return [];
          },
          fillSelections: fillSelections
        });
      }
    }

    bootstrapPackUI();

    if (collectionHandle && productsLimit > products.length) {
      fetchSimpleCollectionProducts(collectionHandle, productsLimit)
        .then(function (fetchedProducts) {
          if (fetchedProducts.length) {
            products = fetchedProducts.filter(function (product) {
              return Boolean(product.default_variant_id) && product.available;
            });
          }

          if (renderProductsRef) {
            renderProductsRef();
          }
        })
        .catch(function (error) {
          console.error("Pack Basicas: error cargando productos extra.", error);
        });
    }
  }

  function initAllPackBasicas() {
    document.querySelectorAll('.pack-ui[data-pack-mode="simple"]').forEach(initPackBasicas);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllPackBasicas);
  } else {
    initAllPackBasicas();
  }

  document.addEventListener("shopify:section:load", function (event) {
    initPackBasicas(event.target.querySelector('.pack-ui[data-pack-mode="simple"]'));
  });
})();