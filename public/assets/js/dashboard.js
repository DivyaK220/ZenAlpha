async function loadDashboard() {
  try {
    const meResponse = await fetch("/api/me");

    if (meResponse.status === 401 || meResponse.redirected) {
      window.location.href = "/login";
      return;
    }

    if (!meResponse.ok) {
      throw new Error("Could not load dashboard.");
    }

    const me = await meResponse.json();

    document.getElementById("staffName").textContent =
      me.username || "Administrator";

    document.getElementById("staffRole").textContent =
      me.role || "ZenAlpha staff";

    document.getElementById("todayDate").textContent =
      new Intl.DateTimeFormat("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(new Date());

    await loadOverviewJobsheets("active");

  } catch (error) {
    console.error("Dashboard error:", error);
  }
}


/* ==========================================
   ZENALPHA JOBSHEETS OVERVIEW
   ========================================== */

async function loadOverviewJobsheets(status = "active") {
  const rows = document.getElementById("jobsheetRows");

  if (!rows) return;

  // ZenAlpha demonstration data
  const demoJobsheets = [
    {
      id: 1,
      jobsheet_number: "ZA-JS-1001",
      rider_name: "Rahul Kumar",
      rider_phone: "9876543210",
      shipment_count: 24,
      status: "active",
      created_at: "2026-11-04T09:30:00"
    },
    {
      id: 2,
      jobsheet_number: "ZA-JS-1002",
      rider_name: "Arjun S",
      rider_phone: "9876501234",
      shipment_count: 18,
      status: "active",
      created_at: "2026-11-04T10:15:00"
    },
    {
      id: 3,
      jobsheet_number: "ZA-JS-1003",
      rider_name: "Kiran Kumar",
      rider_phone: "9988776655",
      shipment_count: 31,
      status: "active",
      created_at: "2026-11-04T08:00:00"
    },
    {
      id: 4,
      jobsheet_number: "ZA-JS-1004",
      rider_name: "Athiesh",
      rider_phone: "9988776897",
      shipment_count: 20,
      status: "active",
      created_at: "2026-11-04T11:00:00"
    }
  ];

  let jobsheets = [];

  try {
    const response = await fetch(
      `/api/jobsheets?status=${encodeURIComponent(status)}`
    );

    if (response.status === 401 || response.redirected) {
      window.location.href = "/login";
      return;
    }

    const data = await response.json();

    // Use real data if available
    if (response.ok && data.ok && data.jobsheets?.length) {
      jobsheets = data.jobsheets;
    }

  } catch (error) {
    console.warn("Could not load live jobsheets. Showing demo data.", error);
  }

  // Show demo data when there is no real data
  if (!jobsheets.length && status === "active") {
    jobsheets = demoJobsheets;
  }

  // If another tab has no real data
  if (!jobsheets.length) {
    rows.innerHTML = `
      <tr>
        <td colspan="9">No ${escapeHtml(status)} jobsheets found.</td>
      </tr>
    `;
    return;
  }

  rows.innerHTML = jobsheets.map((jobsheet, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(jobsheet.jobsheet_number)}</td>
      <td>${escapeHtml(jobsheet.rider_name || "Not assigned")}</td>
      <td>Runsheet</td>
      <td>${escapeHtml(jobsheet.rider_phone || "-")}</td>
      <td>${Number(jobsheet.shipment_count || 0)}</td>
      <td>
        <span class="jobsheet-status ${escapeHtml(jobsheet.status)}">
          ${escapeHtml(formatJobsheetStatus(jobsheet.status))}
        </span>
      </td>
      <td>${escapeHtml(formatJobsheetDateTime(jobsheet.created_at))}</td>
      <td>
        <button
          type="button"
          class="primary-button jobsheet-action"
          data-id="${Number(jobsheet.id)}"
        >
          View
        </button>
      </td>
    </tr>
  `).join("");
}

/* ==========================================
   JOBSHEET TABS
   ========================================== */

function initializeJobsheetTabs() {

  const tabs = document.querySelectorAll(".jobsheet-tab");

  tabs.forEach(tab => {

    tab.addEventListener("click", () => {

      document
        .querySelectorAll(".jobsheet-tab")
        .forEach(button => button.classList.remove("active"));

      tab.classList.add("active");

      loadOverviewJobsheets(tab.dataset.status);

    });

  });
}


/* ==========================================
   FORMAT FUNCTIONS
   ========================================== */

function formatJobsheetStatus(status) {

  const labels = {
    draft: "Draft",
    active: "Active",
    completed: "Completed",
    archived: "Archived"
  };

  return labels[status] || status;
}


function formatJobsheetDateTime(value) {

  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}


/* ==========================================
   SAFELY DISPLAY TEXT
   ========================================== */

function escapeHtml(value) {

  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}


/* ==========================================
   LOGOUT
   ========================================== */

document.getElementById("logoutButton").addEventListener(
  "click",
  async () => {

    try {
      await fetch("/logout", {
        method: "POST"
      });

      window.location.href = "/login";

    } catch {
      window.location.href = "/login";
    }

  }
);


/* ==========================================
   MOBILE SIDEBAR
   ========================================== */

document.getElementById("menuButton").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});


document.querySelectorAll(".sidebar a").forEach(link => {

  link.addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("open");
  });

});


/* ==========================================
   SIDEBAR DROPDOWNS
   ========================================== */

document.querySelectorAll(".nav-toggle").forEach(button => {

  button.addEventListener("click", () => {

    const expanded =
      button.getAttribute("aria-expanded") === "true";

    button.setAttribute(
      "aria-expanded",
      String(!expanded)
    );

    const submenu = document.getElementById(
      button.getAttribute("aria-controls")
    );

    if (submenu) {
      submenu.hidden = expanded;
    }

  });

});


/* ==========================================
   START DASHBOARD
   ========================================== */

initializeJobsheetTabs();
loadDashboard();