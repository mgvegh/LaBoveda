// Content script injected into CET (cet.com.ar/docente/clases)

console.log("[CET & La Bóveda] Comparator script loaded.");

let currentBovedaClasses = [];
let lastSyncSource = "none";
let isComparing = false;
let selectedMonthFilter = "all";
let filterOnlySelectedMonth = false;

function isLoginPage() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("login") || path.includes("ingresar") || path.includes("auth")) return true;
  if (document.querySelector('input[type="password"]')) return true;
  const text = document.body ? document.body.innerText : "";
  if (/iniciar sesi[oó]n/i.test(text) && !/mis clases/i.test(text)) return true;
  return false;
}

let isPanelOpen = false;
try {
  const saved = localStorage.getItem("boveda_panel_open");
  if (saved === "true" && !isLoginPage()) {
    isPanelOpen = true;
  }
} catch (e) {}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function formatMonthYear(yearMonthStr) {
  if (!yearMonthStr || yearMonthStr === "all") return "Todos los meses";
  const [y, m] = yearMonthStr.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES[idx] || m} ${y}`;
}

// ─── STRING & NAME NORMALIZATION ─────────────────────────────────────────────

function normalizeStr(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fuzzy matches student names:
 * Handles: "Violeta Corona" vs "Violeta", "Thiago Eisenberg" vs "Thiago", etc.
 */
function isNameMatch(cetName, bovedaName) {
  const c = normalizeStr(cetName);
  const b = normalizeStr(bovedaName);
  if (!c || !b) return false;
  if (c === b) return true;

  // One starts with the other
  if (c.startsWith(b) || b.startsWith(c)) return true;

  const cWords = c.split(" ").filter(w => w.length > 1);
  const bWords = b.split(" ").filter(w => w.length > 1);

  // If first names match (e.g. "Violeta" matches "Violeta Corona")
  if (cWords[0] && bWords[0] && cWords[0] === bWords[0]) return true;

  // If every word of bovedaName is inside CET name
  if (bWords.length > 0 && bWords.every(w => cWords.includes(w))) return true;

  return false;
}

// ─── CET DOM PARSER ──────────────────────────────────────────────────────────

/**
 * Find all class cards rendered on the CET page.
 */
function findCetCards() {
  const candidates = document.querySelectorAll("div, article, section, li");
  const cards = [];

  for (const el of candidates) {
    if (el.closest("#boveda-cet-toolbar") || el.closest("#boveda-missing-modal-overlay")) continue;

    const text = el.innerText || "";
    const hasDate = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(text);
    const hasTime = /\b\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\b/.test(text);
    const hasModalityOrSubject = /presencial|remota|virtual|matemática|tutor/i.test(text);

    if (hasDate && hasTime && hasModalityOrSubject) {
      const dateMatches = text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) || [];
      if (dateMatches.length === 1 && text.length < 1200) {
        cards.push(el);
      }
    }
  }

  const finalCards = cards.filter(card => {
    return !cards.some(other => other !== card && other.contains(card));
  });

  return finalCards;
}

function parseCardData(cardEl) {
  const text = cardEl.innerText || "";

  // 1. Date
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!dateMatch) return null;
  const [_, d, m, y] = dateMatch;
  const isoDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; // YYYY-MM-DD
  const yearMonth = `${y}-${m.padStart(2, "0")}`;

  // 2. Time range
  const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if (!timeMatch) return null;
  const [__, h1, min1, h2, min2] = timeMatch;
  const startTime = `${h1.padStart(2, "0")}:${min1}`;
  const endTime = `${h2.padStart(2, "0")}:${min2}`;

  const startMins = parseInt(h1, 10) * 60 + parseInt(min1, 10);
  const endMins = parseInt(h2, 10) * 60 + parseInt(min2, 10);
  const duration = endMins - startMins > 0 ? endMins - startMins : 60;

  // 3. Modality
  const isPresencial = /presencial/i.test(text);
  const modality = isPresencial ? "presencial" : "virtual";

  // 4. Student Name & Subject
  let studentName = "";
  let subject = "Matemática";

  const dotMatch = text.match(/([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+)\s*·\s*([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+)/);
  if (dotMatch) {
    studentName = dotMatch[1].trim();
    subject = dotMatch[2].split(/\n|\r/)[0].replace(/SECUNDARIO|PRIMARIO|MENOR/gi, "").trim();
  } else {
    const heading = cardEl.querySelector("h1, h2, h3, h4, h5, .font-bold, .font-semibold");
    if (heading && heading.innerText) {
      const parts = heading.innerText.split("·");
      studentName = parts[0].trim();
      if (parts[1]) subject = parts[1].replace(/SECUNDARIO|PRIMARIO|MENOR/gi, "").trim();
    }
  }

  studentName = studentName
    .replace(/\b(SECUNDARIO|PRIMARIO|MENOR|REPROGRAMADA|REPROGRAMAR)\b/gi, "")
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, "")
    .replace(/\d{1,2}:\d{2}/g, "")
    .trim();

  return {
    el: cardEl,
    studentName,
    subject,
    date: isoDate,
    yearMonth,
    startTime,
    endTime,
    duration,
    modality,
    displayDate: `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`
  };
}

// ─── COMPARISON ENGINE ───────────────────────────────────────────────────────

function runComparison() {
  if (isComparing) return;
  isComparing = true;

  const cards = findCetCards();
  const parsedCards = cards.map(c => parseCardData(c)).filter(Boolean);

  // Month aggregation for dropdown
  const monthCounts = {};
  parsedCards.forEach(c => {
    monthCounts[c.yearMonth] = (monthCounts[c.yearMonth] || 0) + 1;
  });
  const availableMonths = Object.keys(monthCounts).sort();
  updateMonthDropdown(availableMonths, monthCounts);

  let exactMatches = 0;
  let diffMatches = 0;
  let missingInBoveda = 0;

  const matchedBovedaIds = new Set();
  const cetDatesSet = new Set(parsedCards.map(c => c.date));

  parsedCards.forEach(card => {
    const belongsToFilteredMonth = selectedMonthFilter === "all" || card.yearMonth === selectedMonthFilter;

    // Visual filtering of other months on the CET page
    if (!belongsToFilteredMonth) {
      if (filterOnlySelectedMonth) {
        card.el.style.display = "none";
      } else {
        card.el.style.display = "";
        card.el.style.opacity = "0.35";
        card.el.style.filter = "grayscale(50%)";
      }
    } else {
      card.el.style.display = "";
      card.el.style.opacity = "1";
      card.el.style.filter = "none";
    }

    // Clear previous badge / container
    const existingContainer = card.el.querySelector(".boveda-badge-container");
    if (existingContainer) existingContainer.remove();
    const existingBadge = card.el.querySelector(".boveda-card-badge");
    if (existingBadge) existingBadge.remove();
    card.el.classList.remove("boveda-cet-card-exact", "boveda-cet-card-diff", "boveda-cet-card-missing");

    // Filter candidate classes in La Bóveda
    const sameDateCandidates = currentBovedaClasses.filter(b => {
      const bDate = (b.dateTime || "").slice(0, 10);
      return bDate === card.date;
    });

    let match = null;
    let matchType = null; // "exact" | "time_diff"

    for (const cand of sameDateCandidates) {
      if (isNameMatch(card.studentName, cand.studentName)) {
        const candTime = (cand.dateTime || "").slice(11, 16);
        if (candTime === card.startTime) {
          match = cand;
          matchType = "exact";
          matchedBovedaIds.add(cand.id);
          break;
        } else if (!match) {
          match = cand;
          matchType = "time_diff";
          matchedBovedaIds.add(cand.id);
        }
      }
    }

    // Badge and container creation
    const container = document.createElement("div");
    container.className = "boveda-badge-container";

    const badge = document.createElement("div");
    badge.className = "boveda-card-badge";

    if (matchType === "exact") {
      if (belongsToFilteredMonth) exactMatches++;
      badge.classList.add("boveda-card-badge-exact");
      badge.innerHTML = `<span>✔ En La Bóveda: <strong>${match.studentName}</strong> (${card.startTime})</span>`;
      card.el.classList.add("boveda-cet-card-exact");
      container.appendChild(badge);
    } else if (matchType === "time_diff") {
      if (belongsToFilteredMonth) diffMatches++;
      const candTime = (match.dateTime || "").slice(11, 16);
      badge.classList.add("boveda-card-badge-diff");
      badge.innerHTML = `<span>⚠️ Diferencia: en La Bóveda figura a las <strong>${candTime}</strong> (CET: ${card.startTime})</span>`;
      card.el.classList.add("boveda-cet-card-diff");
      container.appendChild(badge);
    } else {
      if (belongsToFilteredMonth) missingInBoveda++;
      badge.classList.add("boveda-card-badge-missing");
      badge.innerHTML = `<span>✕ No está en La Bóveda</span>`;
      card.el.classList.add("boveda-cet-card-missing");
      container.appendChild(badge);

      // Button to add class to La Bóveda
      const addBtn = document.createElement("button");
      addBtn.className = "boveda-btn-add-class";
      addBtn.dataset.date = card.date;
      addBtn.dataset.month = card.yearMonth;
      addBtn.innerHTML = `<span>➕ Cargar a La Bóveda</span>`;
      addBtn.title = `Guardar a ${card.studentName} (${card.startTime}) en La Bóveda`;

      addBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        addBtn.disabled = true;
        addBtn.innerHTML = `<span>⏳ Guardando...</span>`;

        const classData = {
          studentName: card.studentName,
          subject: card.subject || "Matemática",
          modality: card.modality,
          dateTime: `${card.date}T${card.startTime}`,
          duration: card.duration || 60,
          notes: ""
        };

        chrome.runtime.sendMessage({
          action: "CREATE_CLASS_IN_BOVEDA",
          classData
        }, (res) => {
          if (res && res.success) {
            addBtn.className = "boveda-btn-add-class success";
            addBtn.innerHTML = `<span>✔ ¡Cargada!</span>`;
            badge.className = "boveda-card-badge boveda-card-badge-exact";
            badge.innerHTML = `<span>✔ En La Bóveda: <strong>${card.studentName}</strong> (${card.startTime})</span>`;
            card.el.classList.remove("boveda-cet-card-missing");
            card.el.classList.add("boveda-cet-card-exact");

            currentBovedaClasses.push({
              id: `created_${Date.now()}`,
              ...classData,
              type: "CET"
            });

            setTimeout(() => runComparison(), 600);
          } else {
            addBtn.disabled = false;
            addBtn.innerHTML = `<span>❌ Error (reintentar)</span>`;
            alert("No se pudo agregar a La Bóveda: " + (res?.error || "Verificá que la pestaña de La Bóveda esté abierta."));
          }
        });
      };

      container.appendChild(addBtn);
    }

    card.el.insertBefore(container, card.el.firstChild);
  });

  // Calculate classes in La Bóveda that are NOT in CET for the dates displayed
  const unmatchedInCet = currentBovedaClasses.filter(b => {
    if (b.type && b.type !== "CET") return false;
    const bDate = (b.dateTime || "").slice(0, 10);
    const bMonth = (b.dateTime || "").slice(0, 7);
    if (selectedMonthFilter !== "all" && bMonth !== selectedMonthFilter) return false;
    return cetDatesSet.has(bDate) && !matchedBovedaIds.has(b.id);
  });

  updateToolbarStats({
    exact: exactMatches,
    diff: diffMatches,
    missing: missingInBoveda,
    unmatchedInCet
  });

  isComparing = false;
}

// ─── TOOLBAR & MODAL UI ──────────────────────────────────────────────────────

function updateMonthDropdown(availableMonths, currentMonthCounts) {
  const select = document.getElementById("boveda-month-select");
  if (!select) return;

  const prevValue = selectedMonthFilter;
  const currentOptionsString = Array.from(select.options).map(o => o.value).join(",");
  const newOptionsString = ["all", ...availableMonths].join(",");

  if (currentOptionsString !== newOptionsString) {
    select.innerHTML = "";
    const totalCount = Object.values(currentMonthCounts).reduce((a, b) => a + b, 0);

    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = `📅 Todos los meses (${totalCount})`;
    select.appendChild(allOpt);

    availableMonths.forEach(mKey => {
      const opt = document.createElement("option");
      opt.value = mKey;
      const count = currentMonthCounts[mKey] || 0;
      opt.textContent = `📅 ${formatMonthYear(mKey)} (${count})`;
      select.appendChild(opt);
    });

    if (availableMonths.includes(prevValue)) {
      select.value = prevValue;
    } else {
      select.value = "all";
      selectedMonthFilter = "all";
    }
  }
}

function createOrGetLauncher() {
  let launcher = document.getElementById("boveda-launcher-btn");
  if (launcher) return launcher;

  launcher = document.createElement("button");
  launcher.id = "boveda-launcher-btn";
  launcher.title = "Abrir / Cerrar comparador con La Bóveda";
  launcher.innerHTML = `
    <span style="font-size: 15px;">⚡</span>
    <span id="boveda-launcher-text">La Bóveda</span>
    <span id="boveda-launcher-badge" class="boveda-launcher-badge" style="display: none;">0</span>
  `;

  launcher.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePanel();
  });

  document.body.appendChild(launcher);
  updateLauncherState();
  return launcher;
}

function updateLauncherState() {
  const launcher = document.getElementById("boveda-launcher-btn");
  if (!launcher) return;
  if (isLoginPage()) {
    launcher.classList.add("boveda-hidden");
  } else {
    launcher.classList.remove("boveda-hidden");
    launcher.classList.toggle("active", isPanelOpen);
  }
}

function togglePanel(forcedState) {
  const toolbar = createOrGetToolbar();
  const launcher = createOrGetLauncher();

  if (typeof forcedState === "boolean") {
    isPanelOpen = forcedState;
  } else {
    isPanelOpen = !isPanelOpen;
  }

  try {
    localStorage.setItem("boveda_panel_open", isPanelOpen ? "true" : "false");
  } catch (e) {}

  if (isPanelOpen) {
    toolbar.classList.remove("boveda-panel-closed");
    launcher.classList.add("active");
  } else {
    toolbar.classList.add("boveda-panel-closed");
    launcher.classList.remove("active");
  }
}

function createOrGetToolbar() {
  let toolbar = document.getElementById("boveda-cet-toolbar");
  if (toolbar) return toolbar;

  toolbar = document.createElement("div");
  toolbar.id = "boveda-cet-toolbar";
  if (!isPanelOpen) {
    toolbar.classList.add("boveda-panel-closed");
  }

  toolbar.innerHTML = `
    <div class="boveda-cet-header">
      <div class="boveda-cet-title">
        <span>⚡ La Bóveda</span>
      </div>
      <div class="boveda-cet-actions">
        <button id="boveda-btn-refresh" class="boveda-cet-btn boveda-cet-btn-primary" title="Volver a sincronizar y comparar">
          🔄 Comparar
        </button>
        <button id="boveda-btn-close" class="boveda-cet-btn boveda-cet-btn-close" title="Cerrar panel">
          ✕
        </button>
      </div>
    </div>

    <div class="boveda-cet-body">
      <div id="boveda-connection-status" class="boveda-cet-status">
        <span class="boveda-status-dot offline"></span>
        <span id="boveda-status-text">Buscando pestaña de La Bóveda...</span>
      </div>

      <div class="boveda-filter-box">
        <div class="boveda-filter-row">
          <label for="boveda-month-select" class="boveda-filter-label">Mes a revisar / cargar:</label>
          <select id="boveda-month-select" class="boveda-month-select">
            <option value="all">📅 Todos los meses</option>
          </select>
        </div>
        <div class="boveda-checkbox-row">
          <label class="boveda-checkbox-label">
            <input type="checkbox" id="boveda-chk-filter-view">
            <span>Ocultar clases de otros meses en pantalla</span>
          </label>
        </div>
      </div>

      <div class="boveda-cet-stats">
        <div class="boveda-stat-card boveda-stat-exact">
          <div id="stat-exact" class="boveda-stat-value">-</div>
          <div class="boveda-stat-label">Coinciden</div>
        </div>
        <div class="boveda-stat-card boveda-stat-diff">
          <div id="stat-diff" class="boveda-stat-value">-</div>
          <div class="boveda-stat-label">Diferencias</div>
        </div>
        <div class="boveda-stat-card boveda-stat-missing">
          <div id="stat-missing" class="boveda-stat-value">-</div>
          <div class="boveda-stat-label">Faltan</div>
        </div>
      </div>

      <div id="boveda-batch-container" style="display: none;">
        <button id="boveda-btn-batch-add" class="boveda-btn-add-all">
          ⚡ Cargar todas las faltantes
        </button>
      </div>

      <div id="boveda-unmatched-container" style="display: none; margin-top: 4px;">
        <div id="boveda-unmatched-btn" class="boveda-missing-alert">
          <span id="boveda-unmatched-text">⚠️ Hay clases en La Bóveda que no están en CET</span>
          <span>Ver →</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(toolbar);

  // Bind toolbar actions
  toolbar.querySelector("#boveda-btn-refresh").addEventListener("click", () => {
    fetchBovedaClasses(true);
  });

  toolbar.querySelector("#boveda-btn-close").addEventListener("click", () => {
    togglePanel(false);
  });

  toolbar.querySelector("#boveda-month-select").addEventListener("change", (e) => {
    selectedMonthFilter = e.target.value;
    runComparison();
  });

  toolbar.querySelector("#boveda-chk-filter-view").addEventListener("change", (e) => {
    filterOnlySelectedMonth = e.target.checked;
    runComparison();
  });

  toolbar.querySelector("#boveda-btn-batch-add").addEventListener("click", () => {
    batchAddMissingClasses();
  });

  return toolbar;
}

function batchAddMissingClasses() {
  const addButtons = Array.from(document.querySelectorAll(".boveda-btn-add-class:not(:disabled):not(.success)"))
    .filter(btn => {
      if (selectedMonthFilter === "all") return true;
      return btn.dataset.month === selectedMonthFilter;
    });

  if (addButtons.length === 0) return;

  const btnBatch = document.getElementById("boveda-btn-batch-add");
  const monthLabel = selectedMonthFilter !== "all" ? ` de ${formatMonthYear(selectedMonthFilter)}` : "";
  if (btnBatch) {
    btnBatch.disabled = true;
    btnBatch.textContent = `⏳ Cargando ${addButtons.length} clases${monthLabel}...`;
  }

  let index = 0;
  function processNext() {
    if (index >= addButtons.length) {
      if (btnBatch) {
        btnBatch.disabled = false;
        btnBatch.textContent = `⚡ Cargar todas${monthLabel}`;
      }
      return;
    }
    const btn = addButtons[index];
    index++;
    if (btn && !btn.disabled) {
      btn.click();
    }
    setTimeout(processNext, 450);
  }
  processNext();
}

function updateToolbarStats({ exact, diff, missing, unmatchedInCet }) {
  createOrGetToolbar();
  document.getElementById("stat-exact").textContent = exact;
  document.getElementById("stat-diff").textContent = diff;
  document.getElementById("stat-missing").textContent = missing;

  const batchCont = document.getElementById("boveda-batch-container");
  const batchBtn = document.getElementById("boveda-btn-batch-add");
  const monthLabel = selectedMonthFilter !== "all" ? ` de ${formatMonthYear(selectedMonthFilter)}` : "";

  if (missing > 0) {
    batchCont.style.display = "block";
    batchBtn.textContent = `⚡ Cargar todas las faltantes${monthLabel} (${missing})`;
  } else {
    batchCont.style.display = "none";
  }

  // Update badge on launcher button
  const launcherBadge = document.getElementById("boveda-launcher-badge");
  if (launcherBadge) {
    if (missing > 0) {
      launcherBadge.style.display = "inline-flex";
      launcherBadge.className = "boveda-launcher-badge missing";
      launcherBadge.textContent = `${missing} faltan`;
    } else if (exact > 0) {
      launcherBadge.style.display = "inline-flex";
      launcherBadge.className = "boveda-launcher-badge ok";
      launcherBadge.textContent = `✔ OK`;
    } else if (diff > 0) {
      launcherBadge.style.display = "inline-flex";
      launcherBadge.className = "boveda-launcher-badge diff";
      launcherBadge.textContent = `${diff} dif.`;
    } else {
      launcherBadge.style.display = "none";
    }
  }

  const unmatchedCont = document.getElementById("boveda-unmatched-container");
  const unmatchedBtn = document.getElementById("boveda-unmatched-btn");
  const unmatchedText = document.getElementById("boveda-unmatched-text");

  if (unmatchedInCet && unmatchedInCet.length > 0) {
    unmatchedCont.style.display = "block";
    unmatchedText.textContent = `⚠️ ${unmatchedInCet.length} en La Bóveda no figuran en CET`;
    unmatchedBtn.onclick = () => showUnmatchedModal(unmatchedInCet);
  } else {
    unmatchedCont.style.display = "none";
  }
}

function updateConnectionStatus(success, count, source) {
  createOrGetToolbar();
  const statusEl = document.getElementById("boveda-status-text");
  const dotEl = document.querySelector(".boveda-status-dot");

  dotEl.className = "boveda-status-dot";

  if (success && count > 0) {
    if (source === "live_tab") {
      dotEl.classList.add("online");
      statusEl.textContent = `🟢 Conectado en vivo (${count} clases totales)`;
    } else {
      dotEl.classList.add("cache");
      statusEl.textContent = `🟡 Sincronizado en caché (${count} clases totales)`;
    }
  } else {
    dotEl.classList.add("offline");
    statusEl.textContent = `🔴 Abrí laboveda.vercel.app/clases para sincronizar`;
  }
}

function showUnmatchedModal(unmatchedList) {
  let overlay = document.getElementById("boveda-missing-modal-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "boveda-missing-modal-overlay";

  const monthSubtitle = selectedMonthFilter !== "all" ? ` [Filtrado: ${formatMonthYear(selectedMonthFilter)}]` : "";

  const itemsHtml = unmatchedList.map(c => {
    const dateFormatted = c.dateTime ? `${c.dateTime.slice(8, 10)}/${c.dateTime.slice(5, 7)}/${c.dateTime.slice(0, 4)}` : "-";
    const timeFormatted = c.dateTime ? c.dateTime.slice(11, 16) : "-";
    return `
      <div class="boveda-unmatched-item">
        <div>
          <div class="boveda-unmatched-name">${c.studentName}</div>
          <div class="boveda-unmatched-meta">
            <span>📅 ${dateFormatted}</span>
            <span>⏰ ${timeFormatted} hs</span>
            <span>(${c.duration || 60} min)</span>
            <span>📍 ${c.modality || "virtual"}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  overlay.innerHTML = `
    <div id="boveda-missing-modal">
      <div class="boveda-modal-header">
        <h3 style="margin:0; font-size: 16px; font-weight: 700;">⚠️ Clases en La Bóveda ausentes en este listado de CET (${unmatchedList.length})${monthSubtitle}</h3>
        <button id="boveda-close-modal" class="boveda-cet-btn" style="font-size: 16px;">✕</button>
      </div>
      <div class="boveda-modal-body">
        <p style="font-size: 13px; color: #94a3b8; margin: 0 0 10px 0;">
          Estas clases están registradas en La Bóveda para el período seleccionado, pero CET no las muestra en esta pestaña (pueden ser clases pasadas no registradas o canceladas):
        </p>
        ${itemsHtml}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector("#boveda-close-modal").onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

// ─── FETCH & OBSERVER ────────────────────────────────────────────────────────

function fetchBovedaClasses(triggerCompare = true) {
  chrome.runtime.sendMessage({ action: "GET_BOVEDA_CLASSES" }, (response) => {
    if (response && response.success && response.classes) {
      currentBovedaClasses = response.classes;
      lastSyncSource = response.source;
      updateConnectionStatus(true, response.classes.length, response.source);
      if (triggerCompare) runComparison();
    } else {
      updateConnectionStatus(false, 0, "none");
    }
  });
}

function init() {
  if (!document.body) {
    window.addEventListener("DOMContentLoaded", init);
    return;
  }
  console.log("[CET & La Bóveda] Initializing launcher and comparator on:", window.location.href);
  createOrGetLauncher();
  createOrGetToolbar();
  updateLauncherState();

  if (!isLoginPage()) {
    fetchBovedaClasses(true);
    setTimeout(() => fetchBovedaClasses(true), 1200);
  }

  let mutationTimeout;
  const observer = new MutationObserver(() => {
    clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(() => {
      updateLauncherState();
      if (!isLoginPage() && currentBovedaClasses.length > 0) {
        runComparison();
      }
    }, 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
