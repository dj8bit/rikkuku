(() => {
  if (!("serviceWorker" in navigator)) return;

  const LOCAL_VERSION = "1.0.5";
  let refreshing = false;
  let hadController = Boolean(navigator.serviceWorker.controller);

  async function clearCachesAndUnregister() {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  }

  async function hardReloadForUpdate() {
    if (refreshing) return;
    refreshing = true;
    try {
      await clearCachesAndUnregister();
    } catch {
      // 続行
    }
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  }

  /** サーバー上の version.json と照合（SW更新漏れの保険） */
  async function checkPublishedVersion() {
    try {
      const res = await fetch(`./version.json?_=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.version && data.version !== LOCAL_VERSION) {
        await hardReloadForUpdate();
      }
    } catch {
      // オフライン時は無視
    }
  }

  async function checkForUpdates(registration) {
    try {
      await registration.update();
    } catch {
      // オフライン時などは無視
    }

    if (registration.waiting && navigator.serviceWorker.controller) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }

  function watchRegistration(registration) {
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;

      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          worker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });

    checkForUpdates(registration);
    checkPublishedVersion();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkForUpdates(registration);
        checkPublishedVersion();
      }
    });
    window.addEventListener("focus", () => {
      checkForUpdates(registration);
      checkPublishedVersion();
    });
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    // 起動直後にもバージョン確認（SW登録前）
    checkPublishedVersion();

    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then(watchRegistration)
      .catch(() => {});
  });
})();
