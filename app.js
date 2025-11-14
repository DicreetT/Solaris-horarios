// ---- Config básica ----
const USERS = {
  anabella: {
    id: "anabella",
    name: "Anabella",
    role: "Operativa · Producción / logística",
    avatar: "👓",
  },
  fer: {
    id: "fer",
    name: "Fer",
    role: "Operativo · Ventas",
    avatar: "🙂",
  },
  esteban: {
    id: "esteban",
    name: "Esteban",
    role: "Operativo · Sistemas / soporte",
    avatar: "💻",
  },
  itzi: {
    id: "itzi",
    name: "Itzi",
    role: "Operativa · Atención / clientes",
    avatar: "📱",
  },
};

const STORAGE_KEY = "solaris-control-horario-v1";

// data.records[userId][date] = {
//   punches: [ "08:30", "13:00", ... ],
//   absence: { type, note } | null,
//   vacation: { status: 'pending'|'approved'|'rejected', note } | null
// }

let state = {
  records: {},
};

let currentUserId = null;
let workerSelectedDate = null;
let adminSelectedDate = null;

// Mes actual para vistas
let workerMonth = new Date();
let adminMonth = new Date();

// ---- Utilidades ----

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
    }
  } catch (e) {
    console.warn("No se pudo cargar estado:", e);
  }
  if (!state.records) state.records = {};
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatDateISO(date) {
  return date.toISOString().slice(0, 10);
}

function formatDatePretty(date) {
  return date.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMonthLabel(date) {
  return date.toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
}

function pad(n) {
  return n.toString().padStart(2, "0");
}

function todayDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getRecord(userId, dateStr, createIfMissing = false) {
  if (!state.records[userId]) {
    if (!createIfMissing) return null;
    state.records[userId] = {};
  }
  if (!state.records[userId][dateStr]) {
    if (!createIfMissing) return null;
    state.records[userId][dateStr] = {
      punches: [],
      absence: null,
      vacation: null,
    };
  }
  return state.records[userId][dateStr];
}

// Para saber el "status" del día
function getDayStatus(userId, dateStr) {
  const rec = getRecord(userId, dateStr, false);
  if (!rec) return null;

  if (rec.vacation && rec.vacation.status === "approved") return "vacation-approved";
  if (rec.vacation && rec.vacation.status === "pending") return "vacation-pending";
  if (rec.absence) return "absence";
  if (rec.punches && rec.punches.length > 0) return "worked";
  return null;
}

// ---- Referencias DOM ----

const userSelectPanel = document.getElementById("user-select");
const workerPanel = document.getElementById("worker-dashboard");
const adminPanel = document.getElementById("admin-dashboard");

const userCards = document.querySelectorAll(".user-card");

const backToUsersBtn = document.getElementById("back-to-users");
const backToUsersAdminBtn = document.getElementById("back-to-users-admin");

const workerAvatarEl = document.getElementById("worker-avatar");
const workerNameEl = document.getElementById("worker-name");
const workerRoleEl = document.getElementById("worker-role");
const currentMonthLabelEl = document.getElementById("current-month-label");

const workerCalendarEl = document.getElementById("worker-calendar");
const workerPrevMonthBtn = document.getElementById("worker-prev-month");
const workerNextMonthBtn = document.getElementById("worker-next-month");
const workerTodayBtn = document.getElementById("worker-today");

const selectedDayLabelEl = document.getElementById("selected-day-label");
const dayRecordsListEl = document.getElementById("day-records-list");

const btnClockIn = document.getElementById("btn-clock-in");
const btnClockOut = document.getElementById("btn-clock-out");
const btnMarkAbsence = document.getElementById("btn-mark-absence");
const btnRequestVacation = document.getElementById("btn-request-vacation");

// Admin
const adminMonthLabelEl = document.getElementById("admin-month-label");
const adminCalendarEl = document.getElementById("admin-calendar");
const adminPrevMonthBtn = document.getElementById("admin-prev-month");
const adminNextMonthBtn = document.getElementById("admin-next-month");
const adminTodayBtn = document.getElementById("admin-today");
const adminSelectedDayLabelEl = document.getElementById("admin-selected-day-label");
const adminDayDetailEl = document.getElementById("admin-day-detail");
const vacationRequestsEl = document.getElementById("vacation-requests");
const absenceListEl = document.getElementById("absence-list");
const btnExportCsv = document.getElementById("btn-export-csv");

// Modales
const modalOverlay = document.getElementById("modal-overlay");

// Ausencia
const modalAbsence = document.getElementById("modal-absence");
const absenceTypeEl = document.getElementById("absence-type");
const absenceNoteEl = document.getElementById("absence-note");
const absenceCancelBtn = document.getElementById("absence-cancel");
const absenceSaveBtn = document.getElementById("absence-save");

// Vacaciones
const modalVacation = document.getElementById("modal-vacation");
const vacationDateLabelEl = document.getElementById("vacation-date-label");
const vacationNoteEl = document.getElementById("vacation-note");
const vacationCancelBtn = document.getElementById("vacation-cancel");
const vacationSaveBtn = document.getElementById("vacation-save");

// ---- Navegación entre paneles ----

function showPanel(panelName) {
  userSelectPanel.classList.remove("active");
  workerPanel.classList.remove("active");
  adminPanel.classList.remove("active");

  if (panelName === "users") userSelectPanel.classList.add("active");
  if (panelName === "worker") workerPanel.classList.add("active");
  if (panelName === "admin") adminPanel.classList.add("active");
}

userCards.forEach((card) => {
  card.addEventListener("click", () => {
    const userId = card.getAttribute("data-user");
    if (userId === "admin") {
      currentUserId = "admin";
      showPanel("admin");
      renderAdminMonth();
      renderAdminVacationRequests();
      renderAdminAbsences();
    } else {
      currentUserId = userId;
      workerSelectedDate = todayDate();
      setupWorkerHeader();
      renderWorkerMonth();
      renderWorkerDaySummary();
      showPanel("worker");
    }
  });
});

backToUsersBtn.addEventListener("click", () => {
  currentUserId = null;
  showPanel("users");
});

backToUsersAdminBtn.addEventListener("click", () => {
  currentUserId = null;
  showPanel("users");
});

// ---- Worker header ----

function setupWorkerHeader() {
  const user = USERS[currentUserId];
  if (!user) return;

  workerNameEl.textContent = user.name;
  workerRoleEl.textContent = user.role;

  workerAvatarEl.innerHTML = `<span>${user.avatar}</span>`;
  workerAvatarEl.classList.add("avatar");
}

// ---- Calendario genérico ----

function renderCalendar(container, date, onSelectDay, statusResolver) {
  container.innerHTML = "";

  const year = date.getFullYear();
  const month = date.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const firstWeekday = firstDay.getDay(); // 0 domingo
  const daysInMonth = lastDay.getDate();

  const weekdays = ["L", "M", "X", "J", "V", "S", "D"];

  weekdays.forEach((name) => {
    const el = document.createElement("div");
    el.textContent = name;
    el.className = "day-name";
    container.appendChild(el);
  });

  // huecos previos
  const emptyBefore = (firstWeekday + 6) % 7; // para empezar en lunes
  for (let i = 0; i < emptyBefore; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    container.appendChild(empty);
  }

  const todayStr = formatDateISO(todayDate());

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const dateStr = formatDateISO(d);

    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.textContent = day.toString();

    if (dateStr === todayStr) {
      cell.classList.add("today");
    }

    const status = statusResolver ? statusResolver(dateStr) : null;
    if (status) {
      cell.classList.add(`status-${status}`);
      const dot = document.createElement("span");
      dot.className = "status-dot";
      cell.appendChild(dot);
    }

    cell.addEventListener("click", () => {
      onSelectDay(d, cell);
    });

    container.appendChild(cell);
  }
}

// ---- Worker calendar ----

function renderWorkerMonth() {
  currentMonthLabelEl.textContent = formatMonthLabel(workerMonth);

  const selectedDateStr = workerSelectedDate ? formatDateISO(workerSelectedDate) : null;

  renderCalendar(
    workerCalendarEl,
    workerMonth,
    (d, cell) => {
      workerSelectedDate = d;
      highlightSelectedDay(workerCalendarEl, cell);
      renderWorkerDaySummary();
    },
    (dateStr) => getDayStatus(currentUserId, dateStr)
  );

  // Marcar seleccionado
  if (selectedDateStr) {
    const cells = workerCalendarEl.querySelectorAll(".calendar-day");
    let idx = 0;
    const year = workerMonth.getFullYear();
    const month = workerMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const emptyBefore = (firstDay.getDay() + 6) % 7;
    cells.forEach((c, i) => {
      if (!c.classList.contains("empty") && !c.classList.contains("day-name")) {
        const d = i - 7 - emptyBefore + 1;
        const dateOfCell = new Date(year, month, d);
        const iso = formatDateISO(dateOfCell);
        if (iso === selectedDateStr) {
          highlightSelectedDay(workerCalendarEl, c);
        }
      }
    });
  }
}

function highlightSelectedDay(container, cell) {
  const all = container.querySelectorAll(".calendar-day");
  all.forEach((c) => c.classList.remove("selected"));
  cell.classList.add("selected");
}

workerPrevMonthBtn.addEventListener("click", () => {
  workerMonth = new Date(workerMonth.getFullYear(), workerMonth.getMonth() - 1, 1);
  renderWorkerMonth();
});

workerNextMonthBtn.addEventListener("click", () => {
  workerMonth = new Date(workerMonth.getFullYear(), workerMonth.getMonth() + 1, 1);
  renderWorkerMonth();
});

workerTodayBtn.addEventListener("click", () => {
  workerMonth = todayDate();
  workerSelectedDate = todayDate();
  renderWorkerMonth();
  renderWorkerDaySummary();
});

// ---- Worker day summary ----

function renderWorkerDaySummary() {
  if (!workerSelectedDate) {
    selectedDayLabelEl.textContent = "Selecciona un día";
    dayRecordsListEl.innerHTML = "";
    return;
  }

  const dateStr = formatDateISO(workerSelectedDate);
  selectedDayLabelEl.textContent = formatDatePretty(workerSelectedDate);

  const record = getRecord(currentUserId, dateStr, false);
  dayRecordsListEl.innerHTML = "";

  if (!record || (record.punches.length === 0 && !record.absence && !record.vacation)) {
    const li = document.createElement("li");
    li.textContent = "No hay registros para este día.";
    li.style.fontStyle = "italic";
    li.style.color = "#6b7280";
    dayRecordsListEl.appendChild(li);
    return;
  }

  if (record.punches.length > 0) {
    record.punches.forEach((t, idx) => {
      const li = document.createElement("li");
      const label = idx % 2 === 0 ? "Entrada" : "Salida";
      li.innerHTML = `
        <span class="label">${label}</span>
        <span class="meta">${t} h</span>
      `;
      dayRecordsListEl.appendChild(li);
    });
  }

  if (record.absence) {
    const li = document.createElement("li");
    li.style.background = "#fef9c3";

    const typeMap = {
      salud: "Salud",
      personal: "Motivo personal",
      cita: "Cita",
      otro: "Otro",
    };

    li.innerHTML = `
      <span class="label">Ausencia (${typeMap[record.absence.type] || "Otro"})</span>
      <span class="meta">${record.absence.note || "Sin comentario"}</span>
    `;
    dayRecordsListEl.appendChild(li);
  }

  if (record.vacation) {
    const li = document.createElement("li");
    li.style.background = "#fce7f3";
    const statusText =
      record.vacation.status === "pending"
        ? "Pendiente de aprobación"
        : record.vacation.status === "approved"
        ? "Aprobada"
        : "Rechazada";

    li.innerHTML = `
      <span class="label">Vacaciones (${statusText})</span>
      <span class="meta">${record.vacation.note || "Sin comentario"}</span>
    `;
    dayRecordsListEl.appendChild(li);
  }
}

// ---- Fichar entrada/salida ----

btnClockIn.addEventListener("click", () => {
  if (!workerSelectedDate) return;
  const now = new Date();
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dateStr = formatDateISO(workerSelectedDate);

  const rec = getRecord(currentUserId, dateStr, true);
  rec.punches.push(timeStr);

  // Si había ausencia, podríamos mantenerla, pero normalmente no
  saveState();
  renderWorkerMonth();
  renderWorkerDaySummary();
});

btnClockOut.addEventListener("click", () => {
  if (!workerSelectedDate) return;
  const now = new Date();
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dateStr = formatDateISO(workerSelectedDate);

  const rec = getRecord(currentUserId, dateStr, true);
  rec.punches.push(timeStr);
  saveState();
  renderWorkerMonth();
  renderWorkerDaySummary();
});

// ---- Ausencia ----

btnMarkAbsence.addEventListener("click", () => {
  if (!workerSelectedDate) return;
  openModal(modalAbsence);
});

absenceCancelBtn.addEventListener("click", () => {
  closeModal(modalAbsence);
});

absenceSaveBtn.addEventListener("click", () => {
  if (!workerSelectedDate) return;
  const dateStr = formatDateISO(workerSelectedDate);
  const rec = getRecord(currentUserId, dateStr, true);

  rec.absence = {
    type: absenceTypeEl.value,
    note: absenceNoteEl.value.trim(),
  };

  saveState();
  absenceNoteEl.value = "";
  closeModal(modalAbsence);
  renderWorkerMonth();
  renderWorkerDaySummary();
});

// ---- Vacaciones ----

btnRequestVacation.addEventListener("click", () => {
  if (!workerSelectedDate) return;
  const pretty = formatDatePretty(workerSelectedDate);
  vacationDateLabelEl.textContent = `Día seleccionado: ${pretty}`;
  openModal(modalVacation);
});

vacationCancelBtn.addEventListener("click", () => {
  closeModal(modalVacation);
});

vacationSaveBtn.addEventListener("click", () => {
  if (!workerSelectedDate) return;
  const dateStr = formatDateISO(workerSelectedDate);
  const rec = getRecord(currentUserId, dateStr, true);

  rec.vacation = {
    status: "pending",
    note: vacationNoteEl.value.trim(),
  };

  saveState();
  vacationNoteEl.value = "";
  closeModal(modalVacation);
  renderWorkerMonth();
  renderWorkerDaySummary();
  renderAdminVacationRequests(); // por si se abre luego
});

// ---- Modales helpers ----

function openModal(modal) {
  modal.classList.remove("hidden");
  modalOverlay.classList.remove("hidden");
}

function closeModal(modal) {
  modal.classList.add("hidden");
  modalOverlay.classList.add("hidden");
}

// Cerrar modales si se pulsa fuera
modalOverlay.addEventListener("click", () => {
  [modalAbsence, modalVacation].forEach((m) => m.classList.add("hidden"));
  modalOverlay.classList.add("hidden");
});

// ---- Admin calendar ----

function renderAdminMonth() {
  adminMonthLabelEl.textContent = formatMonthLabel(adminMonth);

  const usersIds = Object.keys(USERS);

  renderCalendar(
    adminCalendarEl,
    adminMonth,
    (d, cell) => {
      adminSelectedDate = d;
      highlightSelectedDay(adminCalendarEl, cell);
      renderAdminDayDetail();
    },
    (dateStr) => {
      // Resolver estado acumulado del equipo: prioridad vacaciones > ausencia > trabajo
      let hasVacationApproved = false;
      let hasVacationPending = false;
      let hasAbsence = false;
      let hasWorked = false;

      usersIds.forEach((uid) => {
        const rec = getRecord(uid, dateStr, false);
        if (!rec) return;
        if (rec.vacation?.status === "approved") hasVacationApproved = true;
        else if (rec.vacation?.status === "pending") hasVacationPending = true;
        if (rec.absence) hasAbsence = true;
        if (rec.punches && rec.punches.length > 0) hasWorked = true;
      });

      if (hasVacationApproved) return "vacation-approved";
      if (hasVacationPending) return "vacation-pending";
      if (hasAbsence) return "absence";
      if (hasWorked) return "worked";
      return null;
    }
  );
}

adminPrevMonthBtn.addEventListener("click", () => {
  adminMonth = new Date(adminMonth.getFullYear(), adminMonth.getMonth() - 1, 1);
  renderAdminMonth();
});

adminNextMonthBtn.addEventListener("click", () => {
  adminMonth = new Date(adminMonth.getFullYear(), adminMonth.getMonth() + 1, 1);
  renderAdminMonth();
});

adminTodayBtn.addEventListener("click", () => {
  adminMonth = todayDate();
  adminSelectedDate = todayDate();
  renderAdminMonth();
  renderAdminDayDetail();
});

// ---- Admin día concreto ----

function renderAdminDayDetail() {
  adminDayDetailEl.innerHTML = "";

  if (!adminSelectedDate) {
    adminSelectedDayLabelEl.textContent = "Haz clic en un día para ver detalle";
    return;
  }

  const dateStr = formatDateISO(adminSelectedDate);
  adminSelectedDayLabelEl.textContent = formatDatePretty(adminSelectedDate);

  const usersIds = Object.keys(USERS);
  let hasSomething = false;

  usersIds.forEach((uid) => {
    const user = USERS[uid];
    const rec = getRecord(uid, dateStr, false);
    if (!rec) return;

    hasSomething = true;

    const li = document.createElement("li");

    const punchesText =
      rec.punches && rec.punches.length > 0
        ? rec.punches.join(" · ") + " h"
        : "Sin fichajes";

    let extraLines = "";

    if (rec.absence) {
      extraLines += `<span class="meta">Ausencia: ${rec.absence.type} (${rec.absence.note || "sin nota"})</span>`;
    }

    if (rec.vacation) {
      const statusText =
        rec.vacation.status === "pending"
          ? "Vacaciones (pendiente)"
          : rec.vacation.status === "approved"
          ? "Vacaciones (aprobadas)"
          : "Vacaciones (rechazadas)";
      extraLines += `<span class="meta">${statusText}: ${
        rec.vacation.note || "sin comentario"
      }</span>`;
    }

    li.innerHTML = `
      <span class="label">${user.name}</span>
      <span class="meta">${punchesText}</span>
      ${extraLines}
    `;

    adminDayDetailEl.appendChild(li);
  });

  if (!hasSomething) {
    const li = document.createElement("li");
    li.textContent = "Nadie tiene registros para este día.";
    li.style.fontStyle = "italic";
    li.style.color = "#6b7280";
    adminDayDetailEl.appendChild(li);
  }
}

// ---- Admin: solicitudes de vacaciones ----

function renderAdminVacationRequests() {
  vacationRequestsEl.innerHTML = "";

  const usersIds = Object.keys(USERS);
  const items = [];

  usersIds.forEach((uid) => {
    const userRecords = state.records[uid] || {};
    Object.entries(userRecords).forEach(([dateStr, rec]) => {
      if (rec.vacation && rec.vacation.status === "pending") {
        items.push({ userId: uid, dateStr, rec });
      }
    });
  });

  if (items.length === 0) {
    vacationRequestsEl.classList.add("empty-state");
    vacationRequestsEl.innerHTML =
      '<p class="small-muted">No hay solicitudes pendientes.</p>';
    return;
  }

  vacationRequestsEl.classList.remove("empty-state");

  items
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    .forEach(({ userId, dateStr, rec }) => {
      const user = USERS[userId];
      const div = document.createElement("div");
      div.className = "request-item";

      const pretty = new Date(dateStr).toLocaleDateString("es-ES", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      div.innerHTML = `
        <h4>${user.name} · ${pretty}</h4>
        <p>${rec.vacation.note || "Sin comentario"}</p>
      `;

      const actions = document.createElement("div");
      actions.className = "request-actions";

      const btnApprove = document.createElement("button");
      btnApprove.className = "primary-btn";
      btnApprove.textContent = "Aprobar";
      btnApprove.addEventListener("click", () => {
        rec.vacation.status = "approved";
        saveState();
        renderAdminVacationRequests();
        renderAdminMonth();
      });

      const btnReject = document.createElement("button");
      btnReject.className = "outline-btn";
      btnReject.textContent = "Rechazar";
      btnReject.addEventListener("click", () => {
        rec.vacation.status = "rejected";
        saveState();
        renderAdminVacationRequests();
        renderAdminMonth();
      });

      actions.appendChild(btnApprove);
      actions.appendChild(btnReject);
      div.appendChild(actions);

      vacationRequestsEl.appendChild(div);
    });
}

// ---- Admin: ausencias ----

function renderAdminAbsences() {
  absenceListEl.innerHTML = "";

  const usersIds = Object.keys(USERS);
  const items = [];

  usersIds.forEach((uid) => {
    const userRecords = state.records[uid] || {};
    Object.entries(userRecords).forEach(([dateStr, rec]) => {
      if (rec.absence) {
        items.push({ userId: uid, dateStr, rec });
      }
    });
  });

  if (items.length === 0) {
    absenceListEl.classList.add("empty-state");
    absenceListEl.innerHTML =
      '<p class="small-muted">No hay ausencias registradas todavía.</p>';
    return;
  }

  absenceListEl.classList.remove("empty-state");

  items
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    .forEach(({ userId, dateStr, rec }) => {
      const user = USERS[userId];
      const div = document.createElement("div");
      div.className = "request-item";

      const pretty = new Date(dateStr).toLocaleDateString("es-ES", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const typeMap = {
        salud: "Salud",
        personal: "Motivo personal",
        cita: "Cita",
        otro: "Otro",
      };

      div.innerHTML = `
        <h4>${user.name} · ${pretty}</h4>
        <p><strong>${typeMap[rec.absence.type] || "Otro"}</strong> — ${
        rec.absence.note || "Sin comentario"
      }</p>
      `;

      absenceListEl.appendChild(div);
    });
}

// ---- Exportar CSV ----

btnExportCsv.addEventListener("click", () => {
  const rows = [];
  rows.push([
    "Usuario",
    "Fecha",
    "Fichajes (horas)",
    "Ausencia (tipo)",
    "Ausencia (nota)",
    "Vacaciones (estado)",
    "Vacaciones (nota)",
  ]);

  Object.keys(USERS).forEach((uid) => {
    const user = USERS[uid];
    const userRecords = state.records[uid] || {};
    Object.entries(userRecords).forEach(([dateStr, rec]) => {
      rows.push([
        user.name,
        dateStr,
        (rec.punches || []).join(" / "),
        rec.absence ? rec.absence.type : "",
        rec.absence ? rec.absence.note || "" : "",
        rec.vacation ? rec.vacation.status : "",
        rec.vacation ? rec.vacation.note || "" : "",
      ]);
    });
  });

  const csv = rows
    .map((r) =>
      r
        .map((field) => {
          const v = String(field ?? "");
          if (v.includes(",") || v.includes(";") || v.includes('"')) {
            return `"${v.replace(/"/g, '""')}"`;
          }
          return v;
        })
        .join(";")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "solaris-control-horario.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ---- Init ----

loadState();

workerMonth = todayDate();
adminMonth = todayDate();

showPanel("users");
