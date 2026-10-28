// Content script injected into La Bóveda (laboveda.vercel.app)

console.log("[La Bóveda Extension] Content script successfully loaded on:", window.location.href);

function getClassesFromStorage() {
  try {
    const raw = localStorage.getItem("boveda_tutor_classes");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("[La Bóveda Extension] Error reading localStorage:", e);
  }
  return [];
}

/**
 * Extracts classes directly from the DOM of La Bóveda
 * Works on both "Lista" view and "Calendario" view (side panel).
 */
function extractClassesFromDom() {
  const extracted = [];
  const seen = new Set();

  const candidateElements = document.querySelectorAll(".group, div[class*='rounded-'], div[class*='glass-panel']");

  candidateElements.forEach(item => {
    const text = item.innerText || "";
    const dateMatches = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g);
    if (!dateMatches || dateMatches.length !== 1) return;

    const timeMatch = text.match(/\b(\d{1,2}):(\d{2})\b/);
    if (!timeMatch) return;

    const nameEl = item.querySelector(".font-semibold, .font-bold, h3, h4");
    if (!nameEl) return;

    let studentName = nameEl.innerText.trim();
    if (!studentName || studentName.length < 2 || /^(CET|Privada|Presencial|Virtual|Pres\.|Virt\.|Total|Clases del Mes)$/i.test(studentName)) {
      return;
    }

    const [d, m, y] = dateMatches[0].split("/");
    const isoDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const time = timeMatch[0];
    const dateTime = `${isoDate}T${time}`;

    const dedupeKey = `${studentName.toLowerCase()}_${dateTime}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const isPresencial = /presencial|pres\./i.test(text);
    const isCet = /CET/i.test(text) || Boolean(item.querySelector("[class*='bg-emerald-400']"));

    extracted.push({
      id: `dom_${dedupeKey}`,
      studentName,
      dateTime,
      modality: isPresencial ? "presencial" : "virtual",
      type: isCet ? "CET" : "privada",
      duration: 60
    });
  });

  return extracted;
}

function getAllClasses() {
  const storageClasses = getClassesFromStorage();
  if (storageClasses.length > 0) return storageClasses;
  return extractClassesFromDom();
}

function syncToBackground() {
  const classes = getAllClasses();
  if (classes.length > 0) {
    chrome.runtime.sendMessage({
      action: "SAVE_BOVEDA_CLASSES",
      classes
    });
  }
}

// Initial sync attempts
setTimeout(syncToBackground, 800);
setTimeout(syncToBackground, 2500);

// Auto-sync whenever user changes month, views or classes in La Bóveda
let syncDebounce;
const domObserver = new MutationObserver(() => {
  clearTimeout(syncDebounce);
  syncDebounce = setTimeout(() => {
    syncToBackground();
  }, 400);
});

if (document.body) {
  domObserver.observe(document.body, { childList: true, subtree: true });
} else {
  window.addEventListener("DOMContentLoaded", () => {
    domObserver.observe(document.body, { childList: true, subtree: true });
  });
}

// Listen to storage events
window.addEventListener("storage", (e) => {
  if (e.key === "boveda_tutor_classes") {
    syncToBackground();
  }
});

// Fallback: fill and submit the Form if direct event isn't supported yet
function fillAndSubmitBovedaForm(data, callback) {
  function setVal(el, val) {
    if (!el) return;
    const proto = el instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLSelectElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, val);
    else el.value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const studentInput = document.getElementById("form-student-name") || document.querySelector("input[placeholder*='alumno' i]");
  const subjectInput = document.getElementById("form-subject") || document.querySelector("input[placeholder*='materia' i]");
  const dateInput = document.getElementById("form-date") || document.querySelector("input[type='date']");
  const timeInput = document.getElementById("form-start-time") || document.querySelector("input[type='time']");
  const durationSelect = document.getElementById("form-duration") || document.querySelector("select");
  const typeCetBtn = document.getElementById("form-type-cet");
  const modalityBtn = data.modality === "presencial"
    ? document.getElementById("form-modality-presencial")
    : document.getElementById("form-modality-virtual");
  const saveBtn = document.getElementById("btn-save-class") || document.querySelector("button[type='submit']");

  if (!saveBtn) {
    callback({ success: false, error: "No se encontró el formulario en la pestaña de La Bóveda." });
    return;
  }

  if (studentInput) setVal(studentInput, data.studentName || "");
  if (subjectInput) setVal(subjectInput, data.subject || "Matemática");
  if (dateInput && data.dateTime) setVal(dateInput, data.dateTime.slice(0, 10));
  if (timeInput && data.dateTime) setVal(timeInput, data.dateTime.slice(11, 16));
  if (durationSelect && data.duration) setVal(durationSelect, String(data.duration));

  if (typeCetBtn) typeCetBtn.click();
  if (modalityBtn) modalityBtn.click();

  setTimeout(() => {
    saveBtn.click();
    setTimeout(() => {
      callback({ success: true, via: "form_submission" });
    }, 700);
  }, 200);
}

// Respond to background queries
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "EXTRACT_CLASSES") {
    const classes = getAllClasses();
    sendResponse({
      success: true,
      classes,
      count: classes.length
    });
    return true;
  }

  if (request.action === "CREATE_CLASS_IN_BOVEDA") {
    const data = request.classData;
    console.log("[La Bóveda Extension] Received request to create class:", data);

    let responded = false;

    // 1. Try CustomEvent mechanism
    const onResponse = (e) => {
      if (responded) return;
      responded = true;
      window.removeEventListener("boveda:create-class-response", onResponse);
      const res = e.detail;
      console.log("[La Bóveda Extension] Direct creation response:", res);
      syncToBackground();
      sendResponse(res);
    };

    window.addEventListener("boveda:create-class-response", onResponse);
    window.dispatchEvent(new CustomEvent("boveda:create-class", { detail: data }));

    // 2. Fallback: If no event response within 700ms, use DOM form autofill & submit
    setTimeout(() => {
      if (responded) return;
      console.log("[La Bóveda Extension] No custom event response, attempting form fallback...");

      try {
        fillAndSubmitBovedaForm(data, (formResult) => {
          if (!responded) {
            responded = true;
            window.removeEventListener("boveda:create-class-response", onResponse);
            syncToBackground();
            sendResponse(formResult);
          }
        });
      } catch (err) {
        if (!responded) {
          responded = true;
          window.removeEventListener("boveda:create-class-response", onResponse);
          sendResponse({ success: false, error: err.message });
        }
      }
    }, 700);

    return true;
  }
});
