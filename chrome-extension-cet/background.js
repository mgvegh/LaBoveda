// Background service worker for CET & La Bóveda Extension

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Extension Background] Installed / Updated.");
});

async function findBovedaTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find(t => t.url && (
    t.url.includes("laboveda.vercel.app") ||
    t.url.includes("localhost") ||
    t.url.includes("vercel.app")
  ));
}

/**
 * Merges newly extracted classes with existing cached classes by key (id or student_dateTime).
 * This ensures that when the user switches months in La Bóveda, classes from previous months are NOT wiped out.
 */
async function mergeClassesIntoStorage(newClasses) {
  if (!newClasses || newClasses.length === 0) {
    const data = await chrome.storage.local.get(["bovedaClasses", "lastSync"]);
    return data.bovedaClasses || [];
  }

  const data = await chrome.storage.local.get(["bovedaClasses"]);
  const existing = data.bovedaClasses || [];
  const map = new Map();

  // 1. Put existing classes into map
  existing.forEach(c => {
    const key = c.id && !c.id.startsWith("dom_")
      ? c.id
      : `${(c.studentName || "").toLowerCase().trim()}_${c.dateTime}`;
    map.set(key, c);
  });

  // 2. Merge / overwrite with new classes
  newClasses.forEach(c => {
    const key = c.id && !c.id.startsWith("dom_")
      ? c.id
      : `${(c.studentName || "").toLowerCase().trim()}_${c.dateTime}`;
    map.set(key, c);
  });

  const merged = Array.from(map.values());
  await chrome.storage.local.set({
    bovedaClasses: merged,
    lastSync: Date.now()
  });

  console.log(`[Extension Background] Total merged classes in cache: ${merged.length} (received ${newClasses.length})`);
  return merged;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SAVE_BOVEDA_CLASSES") {
    (async () => {
      const merged = await mergeClassesIntoStorage(request.classes || []);
      sendResponse({ success: true, count: merged.length });
    })();
    return true;
  }

  if (request.action === "GET_BOVEDA_CLASSES") {
    (async () => {
      try {
        const tab = await findBovedaTab();
        if (tab && tab.id) {
          // Try sending message to content script
          chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_CLASSES" }, async (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: ["content-boveda.js"]
                });

                setTimeout(() => {
                  chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_CLASSES" }, async (retryRes) => {
                    if (retryRes && retryRes.success && retryRes.classes && retryRes.classes.length > 0) {
                      const merged = await mergeClassesIntoStorage(retryRes.classes);
                      sendResponse({ success: true, classes: merged, source: "live_tab" });
                    } else {
                      fallbackToCache(sendResponse);
                    }
                  });
                }, 300);
              } catch (injectErr) {
                fallbackToCache(sendResponse);
              }
            } else {
              // Merge and return accumulated classes
              const merged = await mergeClassesIntoStorage(response.classes || []);
              sendResponse({
                success: true,
                classes: merged,
                source: "live_tab",
                count: merged.length
              });
            }
          });
        } else {
          fallbackToCache(sendResponse);
        }
      } catch (err) {
        fallbackToCache(sendResponse);
      }
    })();
    return true;
  }

  if (request.action === "CREATE_CLASS_IN_BOVEDA") {
    (async () => {
      try {
        const tab = await findBovedaTab();
        if (!tab || !tab.id) {
          sendResponse({
            success: false,
            error: "No se encontró la pestaña de La Bóveda abierta. Por favor abrila en laboveda.vercel.app/clases"
          });
          return;
        }

        chrome.tabs.sendMessage(tab.id, {
          action: "CREATE_CLASS_IN_BOVEDA",
          classData: request.classData
        }, async (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            // Also merge the newly created class into cache immediately
            if (request.classData) {
              await mergeClassesIntoStorage([request.classData]);
            }
            sendResponse(response || { success: true });
          }
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

async function fallbackToCache(sendResponse) {
  const data = await chrome.storage.local.get(["bovedaClasses", "lastSync"]);
  const classes = data.bovedaClasses || [];
  sendResponse({
    success: classes.length > 0,
    classes: classes,
    source: "cache",
    noTab: true,
    count: classes.length,
    lastSync: data.lastSync
  });
}
