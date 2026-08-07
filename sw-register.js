(() => {
  if (!("serviceWorker" in navigator)) return;

  let refreshing = false;
  let hadController = Boolean(navigator.serviceWorker.controller);

  async function checkForUpdates(registration) {
    try {
      await registration.update();
    } catch {
      // オフライン時などは無視
    }

    // すでに新しい SW が待機中なら即アクティブ化
    if (registration.waiting && navigator.serviceWorker.controller) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }

  function watchRegistration(registration) {
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;

      worker.addEventListener("statechange", () => {
        // 既存利用者がいるときだけ更新を適用（初回インストールではリロードしない）
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          worker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });

    checkForUpdates(registration);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkForUpdates(registration);
      }
    });
    window.addEventListener("focus", () => checkForUpdates(registration));
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
    navigator.serviceWorker
      .register("./sw.js")
      .then(watchRegistration)
      .catch(() => {});
  });
})();
