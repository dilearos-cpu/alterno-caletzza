(function () {
  'use strict';

  function initTabs() {
    document.querySelectorAll('[data-cz-tabs]').forEach(function (root) {
      var tabs = root.querySelectorAll('[data-cz-tab]');
      var panels = root.querySelectorAll('[data-cz-panel]');
      if (!tabs.length) return;

      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          var target = tab.getAttribute('data-cz-tab');
          tabs.forEach(function (t) {
            t.classList.toggle('is-active', t === tab);
            t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
          });
          panels.forEach(function (panel) {
            var active = panel.getAttribute('data-cz-panel') === target;
            panel.classList.toggle('is-active', active);
            panel.setAttribute('aria-hidden', active ? 'false' : 'true');
            if (active) {
              panel.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
                img.loading = 'eager';
              });
            }
          });
        });
      });
    });
  }

  function initMobileToolbar() {
    var toolbar = document.querySelector('.cz-mobile-toolbar');
    if (!toolbar) return;

    var path = window.location.pathname;
    toolbar.querySelectorAll('[data-cz-nav]').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      if (href === path || (href !== '/' && path.startsWith(href))) {
        link.classList.add('is-active');
      }
    });
  }

  function initUnitPriceTable() {
    document.querySelectorAll('[data-cz-unit-table]').forEach(function (root) {
      var rows = root.querySelectorAll('.cz-unit-price-table__row');
      rows.forEach(function (row) {
        row.addEventListener('click', function () {
          rows.forEach(function (r) {
            r.classList.remove('is-active');
          });
          row.classList.add('is-active');
        });
      });
    });
  }

  function initSizeGuideModal() {
    document.querySelectorAll('[data-cz-size-guide-open]').forEach(function (trigger) {
      var modal = document.querySelector('[data-cz-size-guide-modal]');
      if (!modal || trigger.dataset.czBound) return;
      trigger.dataset.czBound = 'true';

      trigger.addEventListener('click', function () {
        if (typeof modal.showModal === 'function') {
          modal.showModal();
        } else {
          modal.setAttribute('open', '');
        }
      });
    });

    document.querySelectorAll('[data-cz-size-guide-close]').forEach(function (closeBtn) {
      var modal = closeBtn.closest('[data-cz-size-guide-modal]');
      if (!modal || closeBtn.dataset.czBound) return;
      closeBtn.dataset.czBound = 'true';

      closeBtn.addEventListener('click', function () {
        if (typeof modal.close === 'function') {
          modal.close();
        } else {
          modal.removeAttribute('open');
        }
      });
    });

    document.querySelectorAll('[data-cz-size-guide-modal]').forEach(function (modal) {
      if (modal.dataset.czBound) return;
      modal.dataset.czBound = 'true';
      modal.addEventListener('click', function (event) {
        if (event.target === modal && typeof modal.close === 'function') {
          modal.close();
        }
      });
    });
  }

  function setCardSecondImage(mediaContainer, url) {
    if (!mediaContainer) return;
    var second = mediaContainer.querySelector('[data-cz-card-second-image]');
    if (!url) {
      if (second) second.remove();
      return;
    }
    if (!second) {
      second = document.createElement('img');
      second.className = 'motion-reduce';
      second.setAttribute('data-cz-card-second-image', '');
      second.loading = 'lazy';
      second.alt = '';
      mediaContainer.appendChild(second);
    }
    second.removeAttribute('srcset');
    second.removeAttribute('sizes');
    second.removeAttribute('data-cz-card-second-fallback');
    second.src = url;
  }

  function resolveCardSecondImage(dot) {
    return (
      dot.getAttribute('data-second-image-src') ||
      dot.getAttribute('data-fallback-second-image-src') ||
      ''
    );
  }

  function initProductDualMedia(rootScope) {
    var scope = rootScope && rootScope.querySelectorAll ? rootScope : document;

    scope.querySelectorAll('[data-cz-product-media][data-cz-enable-second-image]').forEach(function (root) {
      var dataEl = root.querySelector('[data-cz-variant-media-data]');
      if (!dataEl) return;

      var payload = {};
      try {
        payload = JSON.parse(dataEl.textContent);
      } catch (error) {
        return;
      }

      function updateGallerySecondImage(url) {
        var slots = root.querySelectorAll('[data-cz-second-media]');
        var images = root.querySelectorAll('[data-cz-second-media-image]');

        // Sin URL real: quitar del DOM para que el slider móvil no muestre un slide blanco
        if (!url) {
          slots.forEach(function (el) {
            el.remove();
          });
          return;
        }

        if (!images.length) {
          // Slot aún no existe en el markup (variante anterior sin metafield)
          return;
        }

        images.forEach(function (img) {
          img.src = url;
          img.removeAttribute('srcset');
        });
        slots.forEach(function (el) {
          el.hidden = false;
          el.style.display = '';
        });
      }

      function applyVariant(variantId) {
        var match = (payload.variants || []).find(function (item) {
          return String(item.id) === String(variantId);
        });
        if (!match) return;
        updateGallerySecondImage(match.second || '');
      }

      function currentVariantId() {
        var input = document.querySelector(
          'product-info input[name="id"], .product-form input[name="id"], form[action*="/cart/add"] input[name="id"]'
        );
        return input && input.value ? input.value : null;
      }

      if (root.dataset.czSecondListeners !== 'true') {
        root.dataset.czSecondListeners = 'true';

        if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          subscribe(PUB_SUB_EVENTS.variantChange, function (event) {
            var variant = event && event.data ? event.data.variant : null;
            if (!variant || !variant.id) return;
            if (!document.body.contains(root)) return;
            applyVariant(variant.id);
          });
        }

        document.addEventListener('change', function (event) {
          var target = event.target;
          if (!target || !target.matches) return;
          if (!target.matches('.cz-variant-picker__radio, variant-selects input[type="radio"]')) return;
          if (!document.body.contains(root)) return;
          setTimeout(function () {
            var id = currentVariantId();
            if (id) applyVariant(id);
          }, 50);
        });
      }

      var initialId = currentVariantId();
      if (initialId) applyVariant(initialId);
    });
  }

  function setCardPrimaryImage(card, src, srcset) {
    if (!src) return;
    var images = card.querySelectorAll('[data-cz-card-image]');
    images.forEach(function (image) {
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
      if (srcset) {
        image.setAttribute('srcset', srcset);
      }
      image.setAttribute('src', src);
      image.src = src;
      if (srcset) image.srcset = srcset;
    });
  }

  function applyCardSwatch(card, dot, swatches) {
    var priceRoot = card.querySelector('[data-cz-card-price]');
    var mediaContainer = card.querySelector('.media--hover-effect');

    if (swatches && swatches.length) {
      swatches.forEach(function (item) {
        item.classList.remove('is-active');
        item.setAttribute('aria-pressed', 'false');
      });
    }
    dot.classList.add('is-active');
    dot.setAttribute('aria-pressed', 'true');

    var src = dot.getAttribute('data-image-src');
    var srcset = dot.getAttribute('data-image-srcset');
    var url = dot.getAttribute('data-product-url');
    setCardPrimaryImage(card, src, srcset);
    if (url) {
      card.querySelectorAll('a[href*="/products/"], [data-cz-card-media-link]').forEach(function (link) {
        link.setAttribute('href', url);
      });
    }
    if (priceRoot) {
      var price = dot.getAttribute('data-price');
      var compare = dot.getAttribute('data-compare-price');
      var regular = priceRoot.querySelector('.price-item--regular');
      var sale = priceRoot.querySelector('.price-item--sale');
      if (regular && price) regular.textContent = price;
      if (sale && price) sale.textContent = price;
      if (compare) {
        var compareEl = priceRoot.querySelector('.price__compare s, .price-item--regular s');
        if (compareEl) compareEl.textContent = compare;
      }
    }
    setCardSecondImage(mediaContainer, resolveCardSecondImage(dot));
  }

  // Expuesto para Compra rápida: al elegir color en el modal, cambia la foto de la card.
  window.czApplyCardImage = function (card, src, productUrl) {
    if (!card || !src) return;
    var images = card.querySelectorAll('[data-cz-card-image]');
    images.forEach(function (image) {
      image.removeAttribute('sizes');
      image.removeAttribute('srcset');
      try {
        image.srcset = '';
      } catch (e) {}
      image.removeAttribute('src');
      image.setAttribute('src', src);
      image.src = src;
    });
    if (productUrl) {
      card.querySelectorAll('a[href*="/products/"], [data-cz-card-media-link]').forEach(function (link) {
        link.setAttribute('href', productUrl);
      });
    }
  };

  function initProductCardSwatches(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-cz-product-card]').forEach(function (card) {
      if (card.dataset.czSwatchesBound === 'true') return;
      var images = card.querySelectorAll('[data-cz-card-image]');
      var mediaContainer = card.querySelector('.media--hover-effect');
      var swatches = card.querySelectorAll('[data-cz-swatches] .cz-card-swatches__dot');
      if (!images.length || !swatches.length) return;

      card.dataset.czSwatchesBound = 'true';
      swatches.forEach(function (dot) {
        ['click', 'pointerdown'].forEach(function (evtName) {
          dot.addEventListener(
            evtName,
            function (event) {
              event.preventDefault();
              event.stopPropagation();
              if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
              }
              if (evtName === 'click') {
                applyCardSwatch(card, dot, swatches);
              }
            },
            true
          );
        });
      });

      var activeDot = card.querySelector('.cz-card-swatches__dot.is-active');
      if (activeDot && mediaContainer) {
        var secondUrl = resolveCardSecondImage(activeDot);
        if (secondUrl) {
          setCardSecondImage(mediaContainer, secondUrl);
        }
      }
    });
  }

  // Captura global: si el stretched link de Dawn gana la carrera, igual interceptamos el swatch.
  if (!window.__czCardSwatchCapture) {
    window.__czCardSwatchCapture = true;
    document.addEventListener(
      'click',
      function (event) {
        var dot = event.target && event.target.closest
          ? event.target.closest('.cz-card-swatches__dot')
          : null;
        if (!dot) return;
        var card = dot.closest('[data-cz-product-card]');
        if (!card) return;
        var swatches = card.querySelectorAll('[data-cz-swatches] .cz-card-swatches__dot');
        event.preventDefault();
        event.stopPropagation();
        applyCardSwatch(card, dot, swatches);
      },
      true
    );
  }

  function bootCaletzzaTheme() {
    initTabs();
    initMobileToolbar();
    initUnitPriceTable();
    initProductCardSwatches();
    initSizeGuideModal();
    initProductDualMedia();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootCaletzzaTheme);
  } else {
    bootCaletzzaTheme();
  }

  document.addEventListener('shopify:section:load', function (event) {
    initProductCardSwatches(event.target);
    initProductDualMedia(event.target);
  });
})();

