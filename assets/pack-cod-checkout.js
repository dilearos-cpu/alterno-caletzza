(function (global) {
  function formatMoney(cents, currency) {
    var amount = Number(cents || 0) / 100;
    try {
      return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: currency || "COP",
        maximumFractionDigits: 0
      }).format(amount);
    } catch (error) {
      return "$" + Math.round(amount).toLocaleString("es-CO");
    }
  }

  function splitName(fullName) {
    var parts = String(fullName || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) {
      return { firstName: "", lastName: "" };
    }
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: "-" };
    }
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" ")
    };
  }

  function findVariantDetails(products, variantId) {
    var id = String(variantId);
    for (var i = 0; i < products.length; i += 1) {
      var product = products[i];
      var variants = product.variants || [];
      for (var j = 0; j < variants.length; j += 1) {
        if (String(variants[j].id) === id) {
          return {
            product: product,
            variant: variants[j]
          };
        }
      }
      if (String(product.default_variant_id) === id) {
        return {
          product: product,
          variant: {
            id: product.default_variant_id,
            title: "Default",
            price: product.price || 0,
            image: product.img || ""
          }
        };
      }
    }
    return null;
  }

  function cartAddUrl(cartUrl) {
    var base = String(cartUrl || "/cart/add").replace(/\.js$/, "");
    return base + ".js";
  }

  var CO_PROVINCE_CODES = {
    Amazonas: "AMA",
    Antioquia: "ANT",
    Arauca: "ARA",
    Atlantico: "ATL",
    "Bogota D.C.": "DC",
    Bolivar: "BOL",
    Boyaca: "BOY",
    Caldas: "CAL",
    Caqueta: "CAQ",
    Casanare: "CAS",
    Cauca: "CAU",
    Cesar: "CES",
    Choco: "CHO",
    Cordoba: "COR",
    Cundinamarca: "CUN",
    Guainia: "GUA",
    Guaviare: "GUV",
    Huila: "HUI",
    "La Guajira": "LAG",
    Magdalena: "MAG",
    Meta: "MET",
    Narino: "NAR",
    "Norte de Santander": "NSA",
    Putumayo: "PUT",
    Quindio: "QUI",
    Risaralda: "RIS",
    "San Andres": "SAP",
    Santander: "SAN",
    Sucre: "SUC",
    Tolima: "TOL",
    "Valle del Cauca": "VAC",
    Vaupes: "VAU",
    Vichada: "VID"
  };

  function variantGid(variantId) {
    return "gid://shopify/ProductVariant/" + variantId;
  }

  function normalizePhone(phone) {
    var digits = String(phone || "").replace(/\D/g, "");
    if (!digits) {
      return "";
    }
    if (digits.indexOf("57") === 0 && digits.length >= 12) {
      return "+" + digits;
    }
    if (digits.length === 10) {
      return "+57" + digits;
    }
    return "+" + digits;
  }

  function checkoutEmail(customer) {
    if (customer.email) {
      return customer.email;
    }
    var digits = String(customer.phone || "").replace(/\D/g, "");
    if (digits) {
      return "cliente+" + digits + "@checkout.caletzza.local";
    }
    return "cliente@checkout.caletzza.local";
  }

  function buildCheckoutAddressPayload(customer) {
    var provinceCode = CO_PROVINCE_CODES[customer.province] || "CUN";
    var phone = normalizePhone(customer.phone);
    var address2 = customer.note ? String(customer.note).trim() : "";

    return {
      phone: phone,
      deliveryAddress: {
        firstName: customer.names.firstName,
        lastName: customer.names.lastName,
        address1: customer.address1,
        address2: address2,
        city: customer.city,
        provinceCode: provinceCode,
        countryCode: "CO",
        zip: "000000",
        phone: phone
      },
      mailingAddress: {
        firstName: customer.names.firstName,
        lastName: customer.names.lastName,
        address1: customer.address1,
        address2: address2,
        city: customer.city,
        province: customer.province,
        country: "Colombia",
        zip: "000000",
        phone: phone
      },
      selectableAddress: {
        selected: true,
        oneTimeUse: true,
        address: {
          deliveryAddress: {
            firstName: customer.names.firstName,
            lastName: customer.names.lastName,
            address1: customer.address1,
            address2: address2,
            city: customer.city,
            provinceCode: provinceCode,
            countryCode: "CO",
            zip: "000000",
            phone: phone
          }
        }
      }
    };
  }

  function PackCodCheckout(section, config) {
    this.section = section;
    this.config = config || {};
    this.root = section.querySelector("[data-pack-cod]");
    this.dialog = section.querySelector("[data-cod-dialog]");
    this.mainPanel = section.querySelector("[data-cod-main]");
    this.form = section.querySelector("[data-cod-form]");
    this.successPanel = section.querySelector("[data-cod-success]");
    this.errorNode = section.querySelector("[data-cod-error]");
    this.itemsNode = section.querySelector("[data-cod-items]");
    this.itemsWrap = section.querySelector("[data-cod-items-wrap]");
    this.itemsFade = section.querySelector("[data-cod-items-fade]");
    this.itemsHint = section.querySelector("[data-cod-items-hint]");
    this.subtotalNode = section.querySelector("[data-cod-subtotal]");
    this.discountNode = section.querySelector("[data-cod-discount]");
    this.discountRow = section.querySelector("[data-cod-discount-row]");
    this.taxNode = section.querySelector("[data-cod-tax]");
    this.taxRow = section.querySelector("[data-cod-tax-row]");
    this.shippingNode = section.querySelector("[data-cod-shipping]");
    this.totalNode = section.querySelector("[data-cod-total]");
    this.submitButton = section.querySelector("[data-cod-submit]");
    this.fallbackButton = section.querySelector("[data-cod-fallback]");
    this.orderNameNode = section.querySelector("[data-cod-order-name]");
    this.paymentNoteNode = section.querySelector("[data-cod-payment-note]");
    this.paymentsFieldset = section.querySelector("[data-cod-payments]");
    this.grid = section.querySelector(".pack-cod__grid");
    this.pendingItems = [];
    this.pendingLineItems = [];
    this.pendingSummary = null;
    this.onComplete = null;
    this.isLoading = false;
    this.bindEvents();
  }

  PackCodCheckout.prototype.bindEvents = function () {
    var self = this;

    if (!this.root) {
      return;
    }

    this.root.addEventListener("click", function (event) {
      if (event.target === self.root || event.target.closest("[data-cod-close]")) {
        self.close();
      }
    });

    if (this.form) {
      this.form.addEventListener("submit", function (event) {
        event.preventDefault();
        self.submit();
      });

      this.form.addEventListener("change", function (event) {
        if (event.target && event.target.name === "payment_method") {
          self.updatePaymentUI();
          self.refreshSummary();
        }
      });
    }

    if (this.paymentsFieldset) {
      this.paymentsFieldset.addEventListener("click", function (event) {
        var option = event.target.closest(".pack-cod__pay-card");
        if (!option) {
          return;
        }
        var options = self.paymentsFieldset.querySelectorAll(".pack-cod__pay-card");
        options.forEach(function (node) {
          node.classList.toggle("pack-cod__pay-card--active", node === option);
        });
      });
    }

    var doneButton = this.section.querySelector("[data-cod-done]");
    if (doneButton) {
      doneButton.addEventListener("click", function () {
        self.close();
        if (typeof self.onComplete === "function") {
          self.onComplete();
        }
      });
    }

    if (this.fallbackButton) {
      this.fallbackButton.addEventListener("click", function () {
        self.fallbackToCheckout();
      });
    }

    if (this.itemsNode) {
      this.itemsNode.addEventListener("scroll", function () {
        self.updateItemsScrollState();
      });
    }
  };

  PackCodCheckout.prototype.updateItemsScrollState = function () {
    if (!this.itemsNode || !this.itemsWrap) {
      return;
    }

    var list = this.itemsNode;
    var canScroll = list.scrollHeight > list.clientHeight + 2;
    var atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;

    this.itemsWrap.classList.toggle("pack-cod__items-wrap--scrollable", canScroll);
    this.itemsWrap.classList.toggle("pack-cod__items-wrap--at-bottom", !canScroll || atBottom);

    if (this.itemsHint) {
      this.itemsHint.hidden = !canScroll || atBottom;
    }
  };

  PackCodCheckout.prototype.getTaxRate = function () {
    return Number(this.config.taxRatePercent || 19) / 100;
  };

  PackCodCheckout.prototype.getPaymentMethod = function () {
    if (!this.config.enableOnlinePayment || !this.form) {
      return "cod";
    }
    var selected = this.form.querySelector('input[name="payment_method"]:checked');
    return selected && selected.value === "online" ? "online" : "cod";
  };

  PackCodCheckout.prototype.updatePaymentUI = function () {
    if (!this.submitButton) {
      return;
    }

    var method = this.getPaymentMethod();
    var isOnline = method === "online";

    if (this.isLoading) {
      this.submitButton.textContent = isOnline
        ? this.config.onlineLoadingLabel || "Redirigiendo al checkout..."
        : this.config.loadingLabel || "Procesando...";
    } else {
      this.submitButton.textContent = isOnline
        ? this.config.onlineSubmitLabel || "Continuar al pago seguro"
        : this.config.submitLabel || "Confirmar pedido";
    }

    if (this.paymentNoteNode) {
      this.paymentNoteNode.textContent = isOnline
        ? this.config.paymentNoteOnline || "Checkout seguro de Shopify con tus metodos activos."
        : this.config.paymentNoteCod || "Pagas al recibir tu pedido.";
      this.paymentNoteNode.classList.toggle("pack-cod__payment-note--online", isOnline);
    }

    if (this.submitButton) {
      this.submitButton.classList.toggle("pack-cod__submit--online", isOnline);
    }
  };

  PackCodCheckout.prototype.readDiscountRules = function () {
    if (global.PackDiscountRules && typeof global.PackDiscountRules.getRules === "function") {
      var rules = global.PackDiscountRules.getRules();
      if (rules && rules.length) {
        return rules;
      }
    }

    var node = document.querySelector("[data-discount-rules], [data-pack-discount-rules]");
    if (!node) {
      return [];
    }

    try {
      var parsed = JSON.parse(node.textContent || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  };

  PackCodCheckout.prototype.applyPricingRules = function (lineItems) {
    if (!global.PackDiscountRules || typeof global.PackDiscountRules.applyRules !== "function") {
      var fallbackSubtotal = lineItems.reduce(function (sum, item) {
        return sum + Number(item.price || 0);
      }, 0);

      return {
        lineItems: lineItems,
        originalSubtotal: fallbackSubtotal,
        subtotal: fallbackSubtotal,
        discountTotal: 0,
        appliedRule: null,
        appliedTier: null
      };
    }

    return global.PackDiscountRules.applyRules(lineItems, {
      collectionHandle: this.config.collectionHandle || "",
      // Mismo precio de pack para COD y Mercado Pago.
      paymentMethod: this.config.pricingPaymentMethod || this.getPaymentMethod()
    });
  };

  PackCodCheckout.prototype.refreshSummary = function () {
    if (!this.pendingLineItems.length) {
      return;
    }

    var baseItems = this.pendingLineItems.map(function (item) {
      return {
        variantId: item.variantId,
        quantity: item.quantity,
        title: item.title,
        variantTitle: item.variantTitle,
        image: item.image,
        unitPrice: item.originalUnitPrice || item.unitPrice,
        price: (item.originalUnitPrice || item.unitPrice) * item.quantity
      };
    });
    var priced = this.applyPricingRules(baseItems);
    this.renderSummary(priced.lineItems, priced);
  };

  PackCodCheckout.prototype.renderSummary = function (lineItems, pricing) {
    var self = this;
    var subtotal = pricing && typeof pricing.subtotal === "number" ? pricing.subtotal : 0;
    var discountTotal = pricing && typeof pricing.discountTotal === "number" ? pricing.discountTotal : 0;
    var originalSubtotal =
      pricing && typeof pricing.originalSubtotal === "number" ? pricing.originalSubtotal : subtotal;
    var shipping = Number(this.config.shippingFlat || 0);
    // Landings: no sumar IVA (precio de regla ya es el cobrado al cliente).
    var taxRate = this.config.disableTax ? 0 : this.getTaxRate();
    var hideItemPrices = this.config.hideItemPrices !== false;
    // Mostrar subtotal ya con descuento por cantidad (ej. 4 × $23.475).
    var showNetSubtotal = this.config.showNetSubtotal !== false;
    // Flete incluido en el total pero oculto en UI ("Te obsequiamos el envío").
    var concealShippingFee = this.config.concealShippingFee !== false;

    if (!pricing) {
      subtotal = 0;
      lineItems.forEach(function (item) {
        subtotal += Number(item.price || 0);
      });
      originalSubtotal = subtotal;
    }

    this.itemsNode.innerHTML = lineItems
      .map(function (item) {
        var image = item.image
          ? '<img src="' + item.image + '" alt="">'
          : '<div class="pack-cod__item-placeholder"></div>';
        var priceCell = hideItemPrices
          ? ""
          : '<span class="pack-cod__item-price">' +
            formatMoney(item.price, self.config.currency) +
            "</span>";

        return (
          '<li class="pack-cod__item">' +
          image +
          '<div><p class="pack-cod__item-title">' +
          item.title +
          '</p><p class="pack-cod__item-variant">' +
          (item.variantTitle || "") +
          (item.tierLabel ? " · " + item.tierLabel : "") +
          "</p></div>" +
          priceCell +
          "</li>"
        );
      })
      .join("");

    if (
      !concealShippingFee &&
      subtotal >= Number(this.config.freeShippingThreshold || 0) &&
      this.config.freeShippingThreshold
    ) {
      shipping = 0;
    }

    var taxAmount = Math.round(subtotal * taxRate);
    var displayTotal = subtotal + shipping + taxAmount;
    var displaySubtotal = showNetSubtotal ? subtotal : discountTotal > 0 ? originalSubtotal : subtotal;

    this.pendingSummary = {
      subtotal: subtotal,
      originalSubtotal: originalSubtotal,
      discountTotal: discountTotal,
      taxAmount: taxAmount,
      taxRate: taxRate,
      shipping: shipping,
      total: displayTotal,
      appliedRule: pricing ? pricing.appliedRule : null,
      appliedTier: pricing ? pricing.appliedTier : null
    };

    if (this.discountRow) {
      // Con subtotal neto no hace falta la fila de descuento (evita mostrar $140.000).
      this.discountRow.hidden = showNetSubtotal || !(discountTotal > 0);
    }
    if (this.discountNode) {
      this.discountNode.textContent =
        discountTotal > 0
          ? "-" + formatMoney(discountTotal, this.config.currency)
          : formatMoney(0, this.config.currency);
    }
    if (this.subtotalNode) {
      this.subtotalNode.textContent = formatMoney(displaySubtotal, this.config.currency);
    }
    if (this.taxNode) {
      this.taxNode.textContent = formatMoney(taxAmount, this.config.currency);
    }
    if (this.taxRow) {
      this.taxRow.hidden = true;
    }
    if (this.shippingNode) {
      var showAsGift = concealShippingFee || shipping <= 0;
      this.shippingNode.textContent = showAsGift
        ? "Te obsequiamos el envío"
        : formatMoney(shipping, this.config.currency);
      this.shippingNode.classList.toggle("pack-cod__shipping-gift", showAsGift);
    }
    this.totalNode.textContent = formatMoney(displayTotal, this.config.currency);
    this.updateItemsScrollState();
  };

  PackCodCheckout.prototype.buildLineItems = function (cartItems, products) {
    var self = this;
    return cartItems
      .map(function (item) {
        var details = findVariantDetails(products, item.id);
        if (!details) {
          return null;
        }
        return {
          variantId: item.id,
          productId: details.product.id,
          productHandle: details.product.handle || "",
          title: details.product.name,
          quantity: item.quantity || 1,
          variantTitle: details.variant.title,
          image: details.variant.image || details.product.img || "",
          unitPrice: Number(details.variant.price || 0),
          originalUnitPrice: Number(details.variant.price || 0),
          price: Number(details.variant.price || 0) * (item.quantity || 1)
        };
      })
      .filter(Boolean);
  };

  PackCodCheckout.prototype.open = function (cartItems, products, options) {
    if (!this.root || !this.form) {
      return;
    }

    this.onComplete = options && options.onComplete;
    this.pendingItems = cartItems.slice();
    var lineItems = this.buildLineItems(cartItems, products);

    if (!lineItems.length) {
      return;
    }

    this.pendingLineItems = lineItems.map(function (item) {
      return Object.assign({}, item);
    });
    var priced = this.applyPricingRules(this.pendingLineItems);
    this.renderSummary(priced.lineItems, priced);
    this.form.hidden = false;
    this.form.reset();
    this.grid.hidden = false;
    this.hideError();

    if (this.paymentsFieldset) {
      var codRadio = this.form.querySelector('input[name="payment_method"][value="cod"]');
      if (codRadio) {
        codRadio.checked = true;
      }
      var paymentOptions = this.paymentsFieldset.querySelectorAll(".pack-cod__pay-card");
      paymentOptions.forEach(function (node, index) {
        node.classList.toggle("pack-cod__pay-card--active", index === 0);
      });
    }

    this.updatePaymentUI();

    if (this.mainPanel) {
      this.mainPanel.hidden = false;
    }
    if (this.dialog) {
      this.dialog.classList.remove("pack-cod__dialog--success");
    }
    this.successPanel.hidden = true;

    if (this.fallbackButton) {
      this.fallbackButton.hidden = true;
    }
    this.root.hidden = false;
    document.body.classList.add("pack-modal-open");

    var self = this;
    window.requestAnimationFrame(function () {
      self.updateItemsScrollState();
    });
  };

  PackCodCheckout.prototype.close = function () {
    if (!this.root) {
      return;
    }
    this.root.hidden = true;
    document.body.classList.remove("pack-modal-open");
  };

  PackCodCheckout.prototype.showError = function (message) {
    if (!this.errorNode) {
      return;
    }
    this.errorNode.hidden = !message;
    this.errorNode.textContent = message || "";
    if (this.fallbackButton && this.config.showCheckoutFallback) {
      this.fallbackButton.hidden = false;
    }
  };

  PackCodCheckout.prototype.hideError = function () {
    this.showError("");
  };

  PackCodCheckout.prototype.setLoading = function (isLoading) {
    this.isLoading = isLoading;
    if (!this.submitButton) {
      return;
    }
    this.submitButton.disabled = isLoading;
    this.updatePaymentUI();
  };

  PackCodCheckout.prototype.readFormData = function () {
    var formData = new FormData(this.form);
    var fullName = String(formData.get("full_name") || "").trim();
    var names = splitName(fullName);
    return {
      formData: formData,
      fullName: fullName,
      names: names,
      phone: String(formData.get("phone") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      city: String(formData.get("city") || "").trim(),
      province: String(formData.get("province") || "").trim(),
      address1: String(formData.get("address1") || "").trim(),
      note: String(formData.get("note") || "").trim()
    };
  };

  PackCodCheckout.prototype.buildCartAttributes = function (customer) {
    var attributes = {
      "Nombre completo": customer.fullName,
      Telefono: customer.phone,
      Ciudad: customer.city,
      Departamento: customer.province,
      Direccion: customer.address1,
      "Codigo postal": "000000",
      "Pack express": this.config.packLabel || "Pack Bodys",
      "Metodo de pago": "En linea (Shopify Checkout)"
    };

    if (customer.email) {
      attributes.Email = customer.email;
    }
    if (customer.note) {
      attributes["Barrio / Referencia"] = customer.note;
    }

    return attributes;
  };

  PackCodCheckout.prototype.buildCartNote = function (customer) {
    var lines = [
      (this.config.packLabel || "Pack Bodys") + " — pago en linea",
      "Nombre: " + customer.fullName,
      "Telefono: " + customer.phone
    ];

    if (customer.email) {
      lines.push("Email: " + customer.email);
    }

    lines.push(
      "Ciudad: " + customer.city,
      "Departamento: " + customer.province,
      "Direccion: " + customer.address1,
      "Codigo postal: 000000"
    );

    if (customer.note) {
      lines.push("Referencia: " + customer.note);
    }

    return lines.join("\n");
  };

  PackCodCheckout.prototype.fallbackToCheckout = function () {
    var self = this;
    if (!this.pendingItems.length) {
      return;
    }

    this.setLoading(true);
    fetch(cartAddUrl(this.config.cartUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ items: this.pendingItems })
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("No se pudo preparar el carrito.");
        }
        window.location.href = self.config.checkoutUrl || "/checkout";
      })
      .catch(function (error) {
        self.showError(error.message);
      })
      .finally(function () {
        self.setLoading(false);
      });
  };

  function parseOrderResponse(response) {
    return response.text().then(function (text) {
      var data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (error) {
          throw new Error(
            "El servidor no respondio JSON (HTTP " +
              response.status +
              "). Revisa app proxy en Dev Dashboard."
          );
        }
      }

      if (!response.ok) {
        throw new Error((data && data.error) || "No se pudo crear el pedido (HTTP " + response.status + ").");
      }

      return data;
    });
  }

  function uniqueUrls(urls) {
    var seen = {};
    return (urls || []).filter(function (url) {
      if (!url || seen[url]) return false;
      seen[url] = true;
      return true;
    });
  }

  function postOrderWithFallback(urls, payload) {
    var list = uniqueUrls(urls);
    var lastError = new Error("No se pudo crear el pedido.");

    function attempt(index) {
      if (index >= list.length) {
        return Promise.reject(lastError);
      }
      return fetch(list[index], {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload)
      })
        .then(parseOrderResponse)
        .catch(function (error) {
          lastError = error;
          return attempt(index + 1);
        });
    }

    return attempt(0);
  }

  PackCodCheckout.prototype.storefrontGraphql = function (query, variables) {
    var self = this;
    if (!this.config.storefrontToken) {
      return Promise.reject(new Error("Falta el token Storefront API en la configuracion del theme."));
    }

    return fetch(this.config.storefrontApiUrl || "/api/2025-01/graphql.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": this.config.storefrontToken
      },
      body: JSON.stringify({ query: query, variables: variables })
    }).then(function (response) {
      return response.json();
    }).then(function (payload) {
      if (payload.errors && payload.errors.length) {
        throw new Error(payload.errors[0].message);
      }
      return payload.data;
    });
  };

  PackCodCheckout.prototype.showSuccess = function (orderName) {
    if (this.mainPanel) {
      this.mainPanel.hidden = true;
    }
    if (this.dialog) {
      this.dialog.classList.add("pack-cod__dialog--success");
    }
    this.successPanel.hidden = false;
    if (this.orderNameNode && orderName) {
      this.orderNameNode.textContent = "Pedido " + orderName;
    }
  };

  PackCodCheckout.prototype.getShopDomain = function () {
    return (
      (global.Shopify && global.Shopify.shop) ||
      this.config.shopDomain ||
      "caletzza.myshopify.com"
    );
  };

  PackCodCheckout.prototype.getLandingInvoiceDiscount = function () {
    var kind = String(this.config.packKind || this.config.packLabel || "")
      .toLowerCase()
      .replace(/á/g, "a")
      .replace(/é/g, "e")
      .replace(/í/g, "i");
    if (kind.indexOf("basic") !== -1) {
      return 6010000;
    }
    if (kind.indexOf("body") !== -1) {
      return 2010000;
    }
    var packDiscount = this.pendingSummary ? Number(this.pendingSummary.discountTotal || 0) : 0;
    var shipping = this.pendingSummary ? Number(this.pendingSummary.shipping || 0) : 0;
    return Math.max(0, packDiscount - shipping);
  };

  PackCodCheckout.prototype.rulesForInvoice = function () {
    var invoiceDiscount = this.getLandingInvoiceDiscount();
    var original = this.pendingSummary ? Number(this.pendingSummary.originalSubtotal || 0) : 0;
    var items = this.pendingLineItems || [];
    var qty = items.reduce(function (sum, item) {
      return sum + Number(item.quantity || 1);
    }, 0);
    var targetSubtotal = Math.max(0, original - invoiceDiscount);
    var unit = qty > 0 ? Math.round(targetSubtotal / qty) : 0;
    var productIds = items
      .map(function (item) {
        return item.productId;
      })
      .filter(Boolean);
    var prefixes = [];
    items.forEach(function (item) {
      var first = String(item.title || "")
        .trim()
        .split(/\s+/)[0];
      if (first && prefixes.indexOf(first) === -1) {
        prefixes.push(first);
      }
    });

    if (unit > 0 && (productIds.length || prefixes.length)) {
      return [
        {
          id: "landing-invoice-freight",
          title: "Pack landing",
          enabled: true,
          scope: "both",
          exclusive: true,
          priority: 100,
          count_mode: "filter_set",
          filter: {
            type: "collection",
            product_ids: productIds,
            title_prefixes: prefixes
          },
          ranges: [{ min: 1, max: 0, type: "fixed_price_per_item", value: unit, label: "" }]
        }
      ];
    }

    return this.readDiscountRules().map(function (rule) {
      var copy = Object.assign({}, rule);
      if (String(copy.scope || "pack").toLowerCase() === "pack") {
        copy.scope = "both";
      }
      return copy;
    });
  };

  PackCodCheckout.prototype.confirmShippingNotice = function () {
    var api = window.CzCheckoutShippingNotice;
    if (api && typeof api.show === "function") {
      return api.show("landing");
    }
    return Promise.resolve(true);
  };

  PackCodCheckout.prototype.submitOnline = function (customer) {
    var self = this;
    var email = checkoutEmail(customer);
    var shop = this.getShopDomain();
    var lineItems = this.pendingLineItems.map(function (item) {
      return {
        id: item.variantId,
        variant_id: item.variantId,
        variantId: item.variantId,
        product_id: item.productId,
        quantity: item.quantity || 1,
        title: item.title,
        unit_price: item.originalUnitPrice || item.unitPrice
      };
    });
    var payload = {
      shop: shop,
      email: email,
      phone: customer.phone,
      taxExempt: true,
      includePackRules: true,
      invoiceCheckout: true,
      action: "discounted_checkout",
      mode: "draft_invoice",
      paymentMethod: "online",
      checkoutSource: "landing",
      packLabel: this.config.packLabel || "Pack Bodys",
      note: [this.config.packLabel, "Pago en linea", customer.note].filter(Boolean).join(" | "),
      shippingPrice: 0,
      discountAmount: this.getLandingInvoiceDiscount(),
      customer: {
        firstName: customer.names.firstName,
        lastName: customer.names.lastName,
        phone: customer.phone,
        email: email
      },
      shippingAddress: {
        firstName: customer.names.firstName,
        lastName: customer.names.lastName,
        address1: customer.address1,
        city: customer.city,
        province: customer.province,
        country: "Colombia",
        zip: "000000"
      },
      items: lineItems,
      lineItems: lineItems,
      rules: this.rulesForInvoice()
    };

    var checkoutUrls = [
      "https://cod-express-r15e.onrender.com/checkout?shop=" + encodeURIComponent(shop),
      "/apps/cod-express/checkout"
    ];

    function postCheckout(url) {
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        credentials: /^https?:\/\//i.test(url) ? "omit" : "same-origin",
        body: JSON.stringify(payload)
      }).then(parseOrderResponse);
    }

    function raceCheckout() {
      return new Promise(function (resolve, reject) {
        var pending = checkoutUrls.length;
        var settled = false;
        checkoutUrls.forEach(function (url) {
          postCheckout(url).then(
            function (data) {
              if (settled) {
                return;
              }
              if (data && data.invoiceUrl) {
                settled = true;
                resolve(data);
                return;
              }
              pending -= 1;
              if (pending === 0) {
                reject(new Error("No se obtuvo invoiceUrl."));
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

    // Preparar invoice mientras el usuario lee el aviso.
    var invoicePromise = raceCheckout();

    this.confirmShippingNotice().then(function (ok) {
      if (!ok) {
        self.setLoading(false);
        return;
      }
      var api = window.CzCheckoutShippingNotice;
      if (api && typeof api.setBusy === "function") {
        api.setBusy(true, "Aguarda, estamos aplicando los descuentos para alistar tu pedido...");
      }
      return invoicePromise
        .then(function (data) {
          window.location.href = data.invoiceUrl;
        })
        .catch(function (error) {
          console.warn("Invoice checkout failed:", error);
          if (api && typeof api.close === "function") {
            api.close();
          }
          self.setLoading(false);
          self.showError(
            "No se pudo abrir el pago en linea con el precio del pack. Intenta de nuevo o usa contra entrega."
          );
        });
    });
  };

  PackCodCheckout.prototype.submitOnlineFallback = function (customer) {
    var self = this;

    fetch("/cart/clear.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    })
      .catch(function () {
        return null;
      })
      .then(function () {
        return fetch(cartAddUrl(self.config.cartUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ items: self.pendingItems })
        });
      })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("No se pudo agregar el pack al carrito.");
        }
        return fetch("/cart/update.js", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            note: self.buildCartNote(customer),
            attributes: self.buildCartAttributes(customer)
          })
        });
      })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("No se pudo preparar el checkout.");
        }
        window.location.href = self.config.checkoutUrl || "/checkout";
      })
      .catch(function (error) {
        self.showError(
          error.message +
            ". Si el problema continua, usa el checkout alternativo o contacta a la tienda."
        );
      })
      .finally(function () {
        self.setLoading(false);
      });
  };

  PackCodCheckout.prototype.submitCod = function (customer) {
    var self = this;
    var payload = {
      customer: {
        firstName: customer.names.firstName,
        lastName: customer.names.lastName,
        phone: customer.phone,
        email: customer.email
      },
      shippingAddress: {
        address1: customer.address1,
        city: customer.city,
        province: customer.province,
        country: "Colombia",
        zip: ""
      },
      lineItems: this.pendingLineItems.map(function (item) {
        return {
          variantId: item.variantId,
          product_id: item.productId,
          quantity: item.quantity || 1,
          title: item.title,
          unit_price: item.originalUnitPrice || item.unitPrice
        };
      }),
      rules: this.readDiscountRules(),
      note: customer.note,
      shippingPrice: this.pendingSummary ? this.pendingSummary.shipping : 0,
      discountAmount: this.pendingSummary ? this.pendingSummary.discountTotal : 0,
      packLabel: this.config.packLabel || "Pack Bodys"
    };

    var orderUrls = [
      this.config.orderEndpoint || "/apps/cod-express",
      "/apps/cod-express-1",
      "/apps/cod-express-1/order",
      "/apps/cod-express/order"
    ];

    postOrderWithFallback(orderUrls, payload)
      .then(function (data) {
        self.showSuccess(data.orderName);
      })
      .catch(function (error) {
        self.showError(
          error.message +
            ". Si el problema continua, usa el checkout alternativo o contacta a la tienda."
        );
      })
      .finally(function () {
        self.setLoading(false);
      });
  };

  PackCodCheckout.prototype.submit = function () {
    if (!this.form || !this.pendingItems.length) {
      return;
    }

    if (!this.form.reportValidity()) {
      return;
    }

    var customer = this.readFormData();
    var paymentMethod = this.getPaymentMethod();

    this.setLoading(true);
    this.hideError();

    if (paymentMethod === "online") {
      this.submitOnline(customer);
      return;
    }

    this.submitCod(customer);
  };

  global.PackCodCheckout = {
    create: function (section, config) {
      return new PackCodCheckout(section, config);
    },
    formatMoney: formatMoney,
    findVariantDetails: findVariantDetails
  };
})(window);
