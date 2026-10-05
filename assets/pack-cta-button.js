(function () {
  function bindButtonAction(buttonNode, targetPack) {
    if (!buttonNode || buttonNode.dataset.bound === "true") {
      return;
    }

    buttonNode.dataset.bound = "true";

    if (buttonNode.dataset.ctaAction === "link") {
      return;
    }

    buttonNode.addEventListener("click", function (event) {
      var action = buttonNode.dataset.ctaAction;
      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === "trigger_buy") {
        if (window.PackPage && window.PackPage.triggerPackBuy(targetPack)) {
          return;
        }

        if (window.PackCheckout && typeof window.PackCheckout.triggerBuy === "function") {
          window.PackCheckout.triggerBuy();
          return;
        }

        var buyButton = window.PackPage ? window.PackPage.getPackBuyButton(targetPack) : null;
        if (buyButton) {
          buyButton.click();
        }
        return;
      }

      if (action === "scroll_pack") {
        if (window.PackPage && window.PackPage.scrollToPack(targetPack)) {
          return;
        }

        if (targetPack) {
          targetPack.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  }

  function initPackCta(section) {
    if (!section || section.dataset.initialized === "true") {
      return;
    }

    section.dataset.initialized = "true";

    var mode = section.dataset.positionMode || "fixed";
    var triggerMode = section.dataset.floatTrigger || "pack_buy";
    var packTarget = section.dataset.packTarget || "auto";
    var preferredMode = packTarget === "basicas" ? "simple" : packTarget === "bodys" ? "variable" : "";
    var targetPack =
      window.PackPage && typeof window.PackPage.getPackSectionForCta === "function"
        ? window.PackPage.getPackSectionForCta(section, preferredMode)
        : null;
    var anchorNode = section.querySelector("[data-cta-anchor]");
    var floatingNode = section.querySelector("[data-cta-floating]");
    var inlineButton = section.querySelector("[data-cta-button-inline]");
    var floatingButton = section.querySelector("[data-cta-button-floating]");

    if (!anchorNode) {
      return;
    }

    bindButtonAction(inlineButton, targetPack);
    bindButtonAction(floatingButton, targetPack);

    function getTriggerNode() {
      if (triggerMode === "pack_buy" || triggerMode === "pack_slots") {
        if (window.PackPage && typeof window.PackPage.getPackTriggerNode === "function") {
          return window.PackPage.getPackTriggerNode(triggerMode, targetPack);
        }
      }

      return anchorNode;
    }

    function setFloatingVisible(visible) {
      if (!floatingNode) {
        return;
      }

      floatingNode.classList.toggle("pack-cta__floating--visible", Boolean(visible));
      floatingNode.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    function updateFloatingState() {
      if (mode !== "fixed_floating") {
        setFloatingVisible(false);
        return;
      }

      var triggerNode = getTriggerNode();
      if (!triggerNode) {
        setFloatingVisible(false);
        return;
      }

      var triggerRect = triggerNode.getBoundingClientRect();
      var viewportHeight = window.innerHeight;

      if (triggerRect.top >= viewportHeight) {
        setFloatingVisible(false);
        return;
      }

      if (triggerRect.bottom <= 0) {
        setFloatingVisible(true);
        return;
      }

      setFloatingVisible(false);
    }

    if (mode === "fixed_floating" && floatingNode) {
      updateFloatingState();
      window.addEventListener("scroll", updateFloatingState, { passive: true });
      window.addEventListener("resize", updateFloatingState);

      section.addEventListener("shopify:section:unload", function () {
        window.removeEventListener("scroll", updateFloatingState);
        window.removeEventListener("resize", updateFloatingState);
      });
    }
  }

  function initAllPackCtas() {
    document.querySelectorAll(".pack-cta").forEach(initPackCta);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllPackCtas);
  } else {
    initAllPackCtas();
  }

  document.addEventListener("shopify:section:load", function (event) {
    initPackCta(event.target.querySelector(".pack-cta"));
  });
})();
