(function () {
  var SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL"];

  function detectSizeOptionIndex(options) {
    if (!options || !options.length) {
      return -1;
    }

    for (var index = 0; index < options.length; index += 1) {
      var name = String(options[index].name || "").toLowerCase();
      if (name.indexOf("talla") !== -1 || name.indexOf("size") !== -1) {
        return index;
      }
    }

    return -1;
  }

  function sortSizes(sizes) {
    return sizes.slice().sort(function (a, b) {
      var aKey = String(a).toUpperCase();
      var bKey = String(b).toUpperCase();
      var aIndex = SIZE_ORDER.indexOf(aKey);
      var bIndex = SIZE_ORDER.indexOf(bKey);

      if (aIndex === -1 && bIndex === -1) {
        return String(a).localeCompare(String(b), "es", { numeric: true });
      }
      if (aIndex === -1) {
        return 1;
      }
      if (bIndex === -1) {
        return -1;
      }
      return aIndex - bIndex;
    });
  }

  function shuffle(items) {
    var array = items.slice();

    for (var i = array.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }

    return array;
  }

  function getVariantsForSize(product, sizeValue, sizeIndex) {
    if (sizeIndex === -1) {
      return (product.variants || []).filter(function (variant) {
        return variant.available;
      });
    }

    return (product.variants || []).filter(function (variant) {
      return variant.available && variant.options && variant.options[sizeIndex] === sizeValue;
    });
  }

  function buildSimpleSelections(products, slotCount) {
    var pool = products.filter(function (product) {
      return product.default_variant_id && product.available;
    });

    if (!pool.length) {
      return { error: "No hay productos disponibles para escoger." };
    }

    var shuffled = shuffle(pool);
    var selections = [];

    for (var i = 0; i < slotCount; i += 1) {
      var product = shuffled[i % shuffled.length];
      selections.push({
        slotIndex: i,
        variantId: product.default_variant_id,
        image: product.img,
        name: product.name
      });
    }

    return { selections: selections };
  }

  function buildVariableSelections(products, slotCount, sizeValue) {
    var sizeIndex = -1;

    products.some(function (product) {
      var index = detectSizeOptionIndex(product.options);
      if (index !== -1) {
        sizeIndex = index;
        return true;
      }
      return false;
    });

    if (sizeIndex !== -1 && !sizeValue) {
      return { error: "Selecciona una talla para continuar." };
    }

    var eligible = products.filter(function (product) {
      return getVariantsForSize(product, sizeValue, sizeIndex).length > 0;
    });

    if (!eligible.length) {
      return { error: "No hay productos disponibles para esa talla." };
    }

    var shuffled = shuffle(eligible);
    var selections = [];

    for (var i = 0; i < slotCount; i += 1) {
      var product = i < shuffled.length ? shuffled[i] : shuffled[Math.floor(Math.random() * shuffled.length)];
      var variants = getVariantsForSize(product, sizeValue, sizeIndex);
      var variant = variants[Math.floor(Math.random() * variants.length)];

      selections.push({
        slotIndex: i,
        productId: product.id,
        variantId: variant.id,
        image: variant.image || product.img,
        name: product.name
      });
    }

    return { selections: selections };
  }

  function waitForBuilder(section, attempts) {
    var preferredMode = section.dataset.packTarget || "";
    var normalizedMode = preferredMode === "basicas" ? "simple" : preferredMode === "bodys" ? "variable" : "";
    var builder =
      window.PackPage && typeof window.PackPage.getPackBuilderForNode === "function"
        ? window.PackPage.getPackBuilderForNode(section, normalizedMode)
        : null;

    if (builder && builder.getProducts().length) {
      return Promise.resolve(builder);
    }

    if ((attempts || 0) >= 40) {
      return Promise.resolve(builder);
    }

    return new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve(waitForBuilder(section, (attempts || 0) + 1));
      }, 150);
    });
  }

  function initPackAutoPick(section) {
    if (!section || section.dataset.initialized === "true") {
      return;
    }

    section.dataset.initialized = "true";

    var openButton = section.querySelector("[data-auto-pick-open]");
    var modal = section.querySelector("[data-auto-pick-modal]");
    var closeButton = section.querySelector("[data-auto-pick-close]");
    var sizesNode = section.querySelector("[data-auto-pick-sizes]");
    var noSizesNode = section.querySelector("[data-auto-pick-no-sizes]");
    var messageNode = section.querySelector("[data-auto-pick-message]");
    var confirmButton = section.querySelector("[data-auto-pick-confirm]");
    var selectedSize = "";
    var currentBuilder = null;

    if (!openButton || !modal || !confirmButton) {
      return;
    }

    function setMessage(text, type) {
      if (!messageNode) {
        return;
      }

      messageNode.hidden = !text;
      messageNode.textContent = text || "";
      messageNode.classList.toggle("pack-auto-pick__message--error", type === "error");
      messageNode.classList.toggle("pack-auto-pick__message--info", type === "info");
    }

    function openModal() {
      modal.hidden = false;
      document.body.classList.add("pack-modal-open");
    }

    function closeModal() {
      modal.hidden = true;
      document.body.classList.remove("pack-modal-open");
      setMessage("", "");
    }

    function renderSizes(sizes) {
      if (!sizesNode) {
        return;
      }

      if (!sizes.length) {
        sizesNode.innerHTML = "";
        if (noSizesNode) {
          noSizesNode.hidden = false;
        }
        return;
      }

      if (noSizesNode) {
        noSizesNode.hidden = true;
      }

      sizesNode.innerHTML = sizes
        .map(function (size) {
          var activeClass = selectedSize === size ? " pack-auto-pick__size--active" : "";
          return (
            '<button type="button" class="pack-auto-pick__size' +
            activeClass +
            '" data-size-value="' +
            String(size).replace(/"/g, "&quot;") +
            '">' +
            size +
            "</button>"
          );
        })
        .join("");
    }

    function prepareModal() {
      setMessage("", "");
      selectedSize = "";
      openButton.disabled = true;

      return waitForBuilder(section).then(function (builder) {
        currentBuilder = builder;
        openButton.disabled = false;

        if (!builder) {
          setMessage("No encontramos un pack en esta pagina. Agrega la seccion Pack basicas o Pack bodys.", "error");
          renderSizes([]);
          return;
        }

        if (!builder.getProducts().length) {
          setMessage("El pack aun esta cargando productos. Intenta de nuevo en un momento.", "error");
          renderSizes([]);
          return;
        }

        var sizes = sortSizes(builder.getAvailableSizes());
        renderSizes(sizes);

        if (sizes.length) {
          selectedSize = sizes[Math.floor((sizes.length - 1) / 2)] || sizes[0];
          renderSizes(sizes);
          setMessage(section.dataset.sizeHint || "Selecciona tu talla y nosotros escogemos los diseños.", "info");
        } else {
          setMessage(
            section.dataset.noSizeHint ||
              "Escogeremos diseños al azar de la coleccion del pack.",
            "info"
          );
        }
      });
    }

    openButton.addEventListener("click", function () {
      prepareModal().then(function () {
        openModal();
      });
    });

    if (closeButton) {
      closeButton.addEventListener("click", closeModal);
    }

    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        closeModal();
      }
    });

    if (sizesNode) {
      sizesNode.addEventListener("click", function (event) {
        var sizeButton = event.target.closest("[data-size-value]");
        if (!sizeButton) {
          return;
        }

        selectedSize = sizeButton.dataset.sizeValue || "";
        renderSizes(sortSizes(currentBuilder ? currentBuilder.getAvailableSizes() : []));
        setMessage("", "");
      });
    }

    confirmButton.addEventListener("click", function () {
      if (!currentBuilder) {
        setMessage("No hay un pack disponible para completar.", "error");
        return;
      }

      var products = currentBuilder.getProducts();
      var slotCount = currentBuilder.getSlotCount();
      var result =
        currentBuilder.packMode === "variable"
          ? buildVariableSelections(products, slotCount, selectedSize)
          : buildSimpleSelections(products, slotCount);

      if (result.error) {
        setMessage(result.error, "error");
        return;
      }

      confirmButton.disabled = true;
      currentBuilder.fillSelections(result.selections);

      if (currentBuilder.packSection && window.PackPage && typeof window.PackPage.scrollToPack === "function") {
        window.PackPage.scrollToPack(currentBuilder.packSection);
      }

      closeModal();
      confirmButton.disabled = false;
    });
  }

  function initAllPackAutoPick() {
    document.querySelectorAll(".pack-auto-pick").forEach(initPackAutoPick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllPackAutoPick);
  } else {
    initAllPackAutoPick();
  }

  document.addEventListener("shopify:section:load", function (event) {
    initPackAutoPick(event.target.querySelector(".pack-auto-pick"));
  });
})();
