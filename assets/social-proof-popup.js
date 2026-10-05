(function () {
  var DEFAULT_CONFIG = {
    cities: [
      "Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena",
      "Bucaramanga", "Pereira", "Manizales", "Santa Marta", "Ibagué",
      "Cúcuta", "Villavicencio", "Pasto", "Montería", "Armenia"
    ],
    defaultNames: [
      "Juanito", "María", "Carlos", "Laura", "Andrés", "Camila",
      "Diego", "Valentina", "Santiago", "Daniela", "Felipe", "Isabella"
    ],
    messageTemplate: "{name} ha comprado un {pack} hace {time} en {city}",
    timePhrases: [
      "hace un momento", "hace 1 minuto", "hace 2 minutos",
      "hace 5 minutos", "hace 8 minutos", "hace 12 minutos"
    ],
    campaigns: []
  };

  function pickRandom(list) {
    if (!list || !list.length) {
      return "";
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  function cleanList(list) {
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .map(function (item) {
        return String(item || "").trim();
      })
      .filter(Boolean);
  }

  function randomBetween(min, max) {
    var low = Math.min(min, max);
    var high = Math.max(min, max);
    return Math.floor(Math.random() * (high - low + 1)) + low;
  }

  function readConfig(root) {
    var node = root.querySelector("[data-social-proof-config]");
    if (!node) {
      return DEFAULT_CONFIG;
    }

    try {
      var parsed = JSON.parse(node.textContent);
      parsed.cities = cleanList(parsed.cities);
      parsed.defaultNames = cleanList(parsed.defaultNames);
      parsed.timePhrases = cleanList(parsed.timePhrases);
      parsed.campaigns = Array.isArray(parsed.campaigns) ? parsed.campaigns : [];

      if (!parsed.cities.length) {
        parsed.cities = DEFAULT_CONFIG.cities;
      }
      if (!parsed.defaultNames.length) {
        parsed.defaultNames = DEFAULT_CONFIG.defaultNames;
      }
      if (!parsed.timePhrases.length) {
        parsed.timePhrases = DEFAULT_CONFIG.timePhrases;
      }
      if (!parsed.messageTemplate) {
        parsed.messageTemplate = DEFAULT_CONFIG.messageTemplate;
      }

      return parsed;
    } catch (error) {
      return DEFAULT_CONFIG;
    }
  }

  function formatPackLabel(campaign, units) {
    var label = campaign.packLabel || "pack";
    if (units > 1) {
      return label + " x" + units;
    }
    return label;
  }

  function buildMessageHtml(config, campaign) {
    var names = cleanList(campaign.names);
    if (!names.length) {
      names = config.defaultNames;
    }

    var name = pickRandom(names);
    var city = pickRandom(config.cities);
    var time = pickRandom(config.timePhrases);
    var units = Number(campaign.unitsFixed) || 1;

    if (campaign.randomUnits) {
      units = randomBetween(
        Number(campaign.unitsMin) || 2,
        Number(campaign.unitsMax) || 10
      );
    }

    var pack = formatPackLabel(campaign, units);
    var template = config.messageTemplate || DEFAULT_CONFIG.messageTemplate;

    var text = template
      .replace(/\{name\}/g, name)
      .replace(/\{pack\}/g, pack)
      .replace(/\{units\}/g, String(units))
      .replace(/\{time\}/g, time)
      .replace(/\{city\}/g, city);

    return {
      html: text.replace(name, "<strong>" + name + "</strong>"),
      image: campaign.image || null
    };
  }

  function scheduleNext(callback, minSeconds, maxSeconds) {
    var minMs = Math.max(Number(minSeconds) || 12, 1) * 1000;
    var maxMs = Math.max(Number(maxSeconds) || 25, minSeconds) * 1000;
    var delay = randomBetween(minMs, maxMs);
    return window.setTimeout(callback, delay);
  }

  function initPopup(root) {
    if (!root || root.dataset.initialized === "true") {
      return;
    }

    root.dataset.initialized = "true";

    if (root.parentNode && root.parentNode !== document.body) {
      document.body.appendChild(root);
    }

    var toast = root.querySelector(".social-proof-popup__toast");
    var messageNode = root.querySelector(".social-proof-popup__message");
    var imageWrap = root.querySelector(".social-proof-popup__image-wrap");
    var imageNode = root.querySelector(".social-proof-popup__image");
    var closeButton = root.querySelector(".social-proof-popup__close");
    var config = readConfig(root);

    if (!toast || !messageNode) {
      return;
    }

    if (!config.campaigns.length) {
      config.campaigns = [
        {
          packLabel: "pack de bodys",
          unitsFixed: 4,
          randomUnits: false,
          unitsMin: 2,
          unitsMax: 10,
          names: [],
          image: null
        }
      ];
    }

    var displayDuration = Number(root.dataset.displayDuration || 6) * 1000;
    var initialDelay = Number(root.dataset.initialDelay || 5) * 1000;
    var intervalMin = Number(root.dataset.intervalMin || 12);
    var intervalMax = Number(root.dataset.intervalMax || 25);
    var hideTimer = null;
    var cycleTimer = null;
    var isVisible = false;

    function hideToast() {
      if (!isVisible) {
        return;
      }

      isVisible = false;
      toast.classList.remove("is-visible");
      toast.classList.add("is-hiding");

      window.setTimeout(function () {
        toast.hidden = true;
        toast.classList.remove("is-hiding");
      }, 350);
    }

    function showToast() {
      var campaign = pickRandom(config.campaigns);
      var content = buildMessageHtml(config, campaign);

      messageNode.innerHTML = content.html;

      if (content.image && imageWrap && imageNode) {
        imageNode.src = content.image;
        imageNode.alt = "";
        imageWrap.hidden = false;
      } else if (imageWrap) {
        imageWrap.hidden = true;
      }

      toast.hidden = false;
      window.requestAnimationFrame(function () {
        toast.classList.add("is-visible");
      });

      isVisible = true;

      if (hideTimer) {
        window.clearTimeout(hideTimer);
      }

      hideTimer = window.setTimeout(hideToast, displayDuration);
    }

    function startCycle() {
      showToast();
      cycleTimer = scheduleNext(startCycle, intervalMin, intervalMax);
    }

    function stopCycle() {
      if (cycleTimer) {
        window.clearTimeout(cycleTimer);
        cycleTimer = null;
      }
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
      hideToast();
    }

    if (closeButton) {
      closeButton.addEventListener("click", function () {
        hideToast();
      });
    }

    window.setTimeout(startCycle, initialDelay);

    document.addEventListener("shopify:section:unload", function (event) {
      if (event.target && event.target.contains(root)) {
        stopCycle();
      }
    });
  }

  function boot() {
    document.querySelectorAll(".social-proof-popup").forEach(initPopup);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("shopify:section:load", function (event) {
    if (!event.target) {
      return;
    }
    event.target.querySelectorAll(".social-proof-popup").forEach(initPopup);
  });
})();