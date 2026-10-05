(function () {
  var MOBILE_BREAKPOINT = 767;
  var MOBILE_SLIDES = 2;
  var SLIDE_GAP = 10;

  function getVisibleCount(section, slideCount) {
    var desktopCount = Number(section.dataset.slidesPerView || 1);
    var requested = window.innerWidth <= MOBILE_BREAKPOINT ? MOBILE_SLIDES : desktopCount;
    return Math.max(1, Math.min(requested, 4, slideCount));
  }

  function getGap(track) {
    var gapValue = window.getComputedStyle(track).columnGap || window.getComputedStyle(track).gap || SLIDE_GAP + "px";
    var parsed = parseFloat(gapValue);
    return Number.isFinite(parsed) ? parsed : SLIDE_GAP;
  }

  function destroyCarousel(section) {
    if (section && typeof section._photoCarouselDestroy === "function") {
      section._photoCarouselDestroy();
      section._photoCarouselDestroy = null;
    }
  }

  function whenViewportReady(viewport, callback) {
    var attempts = 0;

    function check() {
      attempts += 1;
      if (viewport.getBoundingClientRect().width > 0 || attempts > 30) {
        callback();
        return;
      }
      requestAnimationFrame(check);
    }

    check();
  }

  function initCarousel(section) {
    if (!section) {
      return;
    }

    destroyCarousel(section);

    var viewport = section.querySelector(".photo-carousel__viewport");
    var track = section.querySelector("[data-carousel-track]");
    var originalSlides = Array.prototype.slice.call(section.querySelectorAll("[data-carousel-slide]:not([data-carousel-clone])"));

    if (!viewport || !track || !originalSlides.length) {
      return;
    }

    var dotsContainer = section.querySelector("[data-carousel-dots]");
    var autoplaySpeed = Number(section.dataset.autoplaySpeed || 4000);
    var pauseOnHover = section.dataset.pauseOnHover === "true";
    var totalSlides = originalSlides.length;
    var visibleCount = 1;
    var cloneCount = 0;
    var currentIndex = 0;
    var timer = null;
    var isHovered = false;
    var resizeObserver = null;
    var isTransitioning = false;

    function applyVisibleCount() {
      visibleCount = getVisibleCount(section, totalSlides);
      viewport.style.setProperty("--slides-per-view", String(visibleCount));
      return visibleCount;
    }

    function getStepSize() {
      var viewportWidth = viewport.getBoundingClientRect().width;
      var gap = getGap(track);
      var slideWidth = (viewportWidth - gap * (visibleCount - 1)) / visibleCount;
      return slideWidth + gap;
    }

    function getLogicalIndex() {
      if (!cloneCount) {
        return currentIndex;
      }
      return ((currentIndex - cloneCount) % totalSlides + totalSlides) % totalSlides;
    }

    function getAllSlides() {
      return Array.prototype.slice.call(track.querySelectorAll("[data-carousel-slide]"));
    }

    function removeClones() {
      Array.prototype.slice.call(track.querySelectorAll("[data-carousel-clone]")).forEach(function (clone) {
        clone.remove();
      });
    }

    function buildInfiniteTrack() {
      removeClones();
      applyVisibleCount();

      if (totalSlides <= visibleCount) {
        cloneCount = 0;
        currentIndex = 0;
        return;
      }

      cloneCount = visibleCount;

      var leadingFragment = document.createDocumentFragment();
      var trailingFragment = document.createDocumentFragment();

      for (var leadingIndex = totalSlides - cloneCount; leadingIndex < totalSlides; leadingIndex += 1) {
        var leadingClone = originalSlides[leadingIndex].cloneNode(true);
        leadingClone.setAttribute("data-carousel-clone", "leading");
        leadingClone.removeAttribute("data-shopify-editor-block");
        leadingFragment.appendChild(leadingClone);
      }

      for (var trailingIndex = 0; trailingIndex < cloneCount; trailingIndex += 1) {
        var trailingClone = originalSlides[trailingIndex].cloneNode(true);
        trailingClone.setAttribute("data-carousel-clone", "trailing");
        trailingClone.removeAttribute("data-shopify-editor-block");
        trailingFragment.appendChild(trailingClone);
      }

      track.insertBefore(leadingFragment, track.firstChild);
      track.appendChild(trailingFragment);
      currentIndex = cloneCount;
    }

    function setTransform(animate) {
      var offset = currentIndex * getStepSize();
      track.style.transition = animate ? "transform 0.6s ease" : "none";
      track.style.transform = "translate3d(-" + offset + "px, 0, 0)";
    }

    function updateDots() {
      if (!dotsContainer) {
        return;
      }

      var logicalIndex = getLogicalIndex();
      Array.prototype.forEach.call(dotsContainer.children, function (dot, dotIndex) {
        dot.classList.toggle("is-active", dotIndex === logicalIndex);
      });
    }

    function renderDots() {
      if (!dotsContainer) {
        return;
      }

      var html = "";
      for (var index = 0; index < totalSlides; index += 1) {
        html +=
          '<button type="button" class="photo-carousel__dot' +
          (index === getLogicalIndex() ? " is-active" : "") +
          '" data-dot-index="' +
          index +
          '" aria-label="Ir a la imagen ' +
          (index + 1) +
          '"></button>';
      }

      dotsContainer.innerHTML = html;
    }

    function normalizeIndex(animate) {
      if (!cloneCount) {
        setTransform(animate);
        updateDots();
        return;
      }

      if (currentIndex >= totalSlides + cloneCount) {
        currentIndex -= totalSlides;
        setTransform(false);
        track.offsetHeight;
        setTransform(animate);
      } else if (currentIndex < cloneCount) {
        currentIndex += totalSlides;
        setTransform(false);
        track.offsetHeight;
        setTransform(animate);
      } else {
        setTransform(animate);
      }

      updateDots();
    }

    function goTo(index, animate) {
      if (totalSlides <= visibleCount) {
        currentIndex = 0;
        setTransform(false);
        updateDots();
        return;
      }

      if (cloneCount) {
        currentIndex = cloneCount + ((index % totalSlides) + totalSlides) % totalSlides;
      } else {
        currentIndex = index;
      }

      normalizeIndex(animate !== false);
    }

    function nextSlide() {
      if (totalSlides <= visibleCount || isTransitioning) {
        return;
      }

      isTransitioning = true;
      currentIndex += 1;
      setTransform(true);
    }

    function prevSlide() {
      if (totalSlides <= visibleCount || isTransitioning) {
        return;
      }

      isTransitioning = true;
      currentIndex -= 1;
      setTransform(true);
    }

    function onTransitionEnd(event) {
      if (event.target !== track) {
        return;
      }

      isTransitioning = false;
      normalizeIndex(false);
    }

    function stopAutoplay() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function startAutoplay() {
      stopAutoplay();

      if (totalSlides <= visibleCount) {
        return;
      }

      timer = setInterval(function () {
        if (!pauseOnHover || !isHovered) {
          nextSlide();
        }
      }, autoplaySpeed);
    }

    function refreshCarousel() {
      buildInfiniteTrack();
      renderDots();
      normalizeIndex(false);
      startAutoplay();
    }

    function onSectionClick(event) {
      if (event.target.closest("[data-carousel-prev]")) {
        event.preventDefault();
        prevSlide();
        startAutoplay();
        return;
      }

      if (event.target.closest("[data-carousel-next]")) {
        event.preventDefault();
        nextSlide();
        startAutoplay();
        return;
      }

      var dot = event.target.closest("[data-dot-index]");
      if (dot) {
        event.preventDefault();
        goTo(Number(dot.dataset.dotIndex), true);
        startAutoplay();
      }
    }

    function onResize() {
      refreshCarousel();
    }

    track.addEventListener("transitionend", onTransitionEnd);
    section.addEventListener("click", onSectionClick);

    if (pauseOnHover) {
      section.addEventListener("mouseenter", function () {
        isHovered = true;
      });
      section.addEventListener("mouseleave", function () {
        isHovered = false;
      });
    }

    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(viewport);
    } else {
      window.addEventListener("resize", onResize);
    }

    section._photoCarouselDestroy = function () {
      stopAutoplay();
      track.removeEventListener("transitionend", onTransitionEnd);
      section.removeEventListener("click", onSectionClick);
      removeClones();
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", onResize);
      }
    };

    whenViewportReady(viewport, refreshCarousel);
  }

  function initAllCarousels(root) {
    var scope = root || document;
    scope.querySelectorAll(".photo-carousel").forEach(initCarousel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initAllCarousels();
    });
  } else {
    initAllCarousels();
  }

  document.addEventListener("shopify:section:load", function (event) {
    initAllCarousels(event.target);
  });

  document.addEventListener("shopify:section:unload", function (event) {
    var carousel = event.target.querySelector(".photo-carousel");
    destroyCarousel(carousel);
  });
})();
