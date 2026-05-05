/**
 * Invia eventi di conteggio al backend configurato in stats-config.js
 */
(function () {
  function trackLandingEvent(event, detail) {
    var cfg = window.STATS_CONFIG || {};
    var url = (cfg.endpoint || "").trim();
    if (!url) return;

    var payload = JSON.stringify({
      event: event,
      detail: detail || null,
      page: typeof location !== "undefined" ? location.pathname : "",
    });

    var headers = { "Content-Type": "application/json" };
    if (cfg.secret && String(cfg.secret).trim()) {
      headers["Authorization"] = "Bearer " + String(cfg.secret).trim();
    }

    try {
      fetch(url, {
        method: "POST",
        headers: headers,
        body: payload,
        mode: "cors",
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      /* ignore */
    }
  }

  window.trackLandingEvent = trackLandingEvent;
})();
