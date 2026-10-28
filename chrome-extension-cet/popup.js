document.addEventListener("DOMContentLoaded", () => {
  const syncDot = document.getElementById("sync-dot");
  const syncTitle = document.getElementById("sync-title");
  const syncDesc = document.getElementById("sync-desc");
  const btnSync = document.getElementById("btn-sync");
  const btnOpenCet = document.getElementById("btn-open-cet");
  const btnOpenBoveda = document.getElementById("btn-open-boveda");

  function checkSyncStatus() {
    syncTitle.textContent = "Buscando datos...";
    chrome.runtime.sendMessage({ action: "GET_BOVEDA_CLASSES" }, (response) => {
      syncDot.className = "dot";
      if (response && response.success && response.classes && response.classes.length > 0) {
        if (response.source === "live_tab") {
          syncDot.classList.add("online");
          syncTitle.textContent = "🟢 Conectado en vivo";
          syncDesc.textContent = `${response.classes.length} clases sincronizadas desde La Bóveda.`;
        } else {
          syncDot.classList.add("cache");
          syncTitle.textContent = "🟡 Conectado (Caché local)";
          syncDesc.textContent = `${response.classes.length} clases disponibles en memoria.`;
        }
      } else {
        syncDot.classList.add("offline");
        syncTitle.textContent = "🔴 Sin datos de La Bóveda";
        syncDesc.textContent = "Abrí y recargá (F5) la pestaña de laboveda.vercel.app/clases.";
      }
    });
  }

  btnSync.addEventListener("click", () => {
    checkSyncStatus();
  });

  btnOpenCet.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://cet.com.ar/docente/clases" });
  });

  btnOpenBoveda.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://laboveda.vercel.app/clases" });
  });

  checkSyncStatus();
});
