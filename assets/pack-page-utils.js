(function (global) {
  function getAllPackSections() {
    return Array.prototype.slice.call(
      document.querySelectorAll('.pack-ui:not([data-empty="true"])')
    );
  }

  function getPackSection() {
    var packs = getAllPackSections();
    return packs.length ? packs[0] : null;
  }

  function findPackInSectionWrapper(wrapper) {
    if (!wrapper) {
      return null;
    }

    if (wrapper.classList && wrapper.classList.contains("pack-ui") && wrapper.dataset.empty !== "true") {
      return wrapper;
    }

    return wrapper.querySelector('.pack-ui:not([data-empty="true"])');
  }

  function walkSectionSiblings(startWrapper, direction) {
    var cursor = startWrapper;

    while (cursor) {
      cursor = direction === "next" ? cursor.nextElementSibling : cursor.previousElementSibling;
      if (!cursor) {
        break;
      }

      var pack = findPackInSectionWrapper(cursor);
      if (pack) {
        return pack;
      }
    }

    return null;
  }

  function getPackSectionForNode(node, preferredMode) {
    var packs = getAllPackSections();
    if (!packs.length) {
      return null;
    }

    if (preferredMode === "simple") {
      var basicasPack = packs.find(function (pack) {
        return pack.dataset.packMode === "simple";
      });
      if (basicasPack) {
        return basicasPack;
      }
    }

    if (preferredMode === "variable") {
      var bodysPack = packs.find(function (pack) {
        return pack.dataset.packMode === "variable";
      });
      if (bodysPack) {
        return bodysPack;
      }
    }

    var wrapper = node.closest(".shopify-section");
    if (wrapper) {
      var nextPack = walkSectionSiblings(wrapper, "next");
      if (nextPack) {
        return nextPack;
      }

      var previousPack = walkSectionSiblings(wrapper, "previous");
      if (previousPack) {
        return previousPack;
      }
    }

    return packs[0];
  }

  function getPackSectionForCta(ctaElement, preferredMode) {
    var packs = getAllPackSections();
    if (!packs.length) {
      return null;
    }

    if (preferredMode === "simple") {
      return (
        packs.find(function (pack) {
          return pack.dataset.packMode === "simple";
        }) || null
      );
    }

    if (preferredMode === "variable") {
      return (
        packs.find(function (pack) {
          return pack.dataset.packMode === "variable";
        }) || null
      );
    }

    var wrapper = ctaElement.closest(".shopify-section");
    if (wrapper) {
      var previousPack = walkSectionSiblings(wrapper, "previous");
      if (previousPack) {
        return previousPack;
      }

      var nextPack = walkSectionSiblings(wrapper, "next");
      if (nextPack) {
        return nextPack;
      }
    }

    return packs[0];
  }

  function getPackBuyButton(packSection) {
    var pack = packSection || getPackSection();
    if (!pack) {
      return null;
    }

    var actionsBuy = pack.querySelector(".pack-actions .pack-button--buy");
    if (actionsBuy) {
      return actionsBuy;
    }

    return pack.querySelector('.pack-button--buy:not([data-select-variant])');
  }

  function getPackSlots(packSection) {
    var pack = packSection || getPackSection();
    return pack ? pack.querySelector(".pack-slots") : null;
  }

  function resolveFloatTriggerMode(triggerMode, packSection) {
    if (triggerMode === "pack_slots" || triggerMode === "cta_section") {
      return triggerMode;
    }

    var pack = packSection || getPackSection();
    if (!pack) {
      return triggerMode;
    }

    if (pack.dataset.packMode === "simple") {
      return "pack_slots";
    }

    return triggerMode;
  }

  function getPackTriggerNode(triggerMode, packSection) {
    var mode = resolveFloatTriggerMode(triggerMode, packSection);

    if (mode === "pack_slots") {
      return getPackSlots(packSection) || getPackBuyButton(packSection);
    }

    if (mode === "pack_buy") {
      return getPackBuyButton(packSection) || getPackSlots(packSection);
    }

    return null;
  }

  function triggerPackBuy(packSection) {
    if (global.PackCheckout && typeof global.PackCheckout.triggerBuy === "function") {
      global.PackCheckout.triggerBuy();
      return true;
    }

    var buyButton = getPackBuyButton(packSection);
    if (buyButton) {
      buyButton.click();
      return true;
    }

    return false;
  }

  function scrollToPack(packSection) {
    var pack = packSection || getPackSection();
    if (!pack) {
      return false;
    }

    pack.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  // Shared across repeated <script> loads of this file (CTA, pack, auto-pick…).
  // A fresh local {} on each load wiped builders registered by pack-basicas/bodys.
  var packBuilderInstances = global.__czPackBuilderInstances || {};
  global.__czPackBuilderInstances = packBuilderInstances;

  function registerPackBuilder(sectionId, api) {
    if (!sectionId || !api) {
      return;
    }

    packBuilderInstances[String(sectionId)] = api;
  }

  function unregisterPackBuilder(sectionId) {
    if (!sectionId) {
      return;
    }

    delete packBuilderInstances[String(sectionId)];
  }

  function getPackBuilder(packSection) {
    if (!packSection || !packSection.dataset.sectionId) {
      return null;
    }

    return packBuilderInstances[packSection.dataset.sectionId] || null;
  }

  function getPackBuilderForNode(node, preferredMode) {
    var pack = getPackSectionForNode(node, preferredMode);
    return getPackBuilder(pack);
  }

  global.PackPage = {
    getAllPackSections: getAllPackSections,
    getPackSection: getPackSection,
    getPackSectionForNode: getPackSectionForNode,
    getPackSectionForCta: getPackSectionForCta,
    getPackBuyButton: getPackBuyButton,
    getPackSlots: getPackSlots,
    resolveFloatTriggerMode: resolveFloatTriggerMode,
    getPackTriggerNode: getPackTriggerNode,
    triggerPackBuy: triggerPackBuy,
    scrollToPack: scrollToPack,
    registerPackBuilder: registerPackBuilder,
    unregisterPackBuilder: unregisterPackBuilder,
    getPackBuilder: getPackBuilder,
    getPackBuilderForNode: getPackBuilderForNode
  };
})(window);
