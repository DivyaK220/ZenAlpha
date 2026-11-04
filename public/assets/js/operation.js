
async function initOperationPage() {
  const pageKey = window.location.pathname.split("/").filter(Boolean).pop();

  const title = document.getElementById("pageTitle");
  const heading = document.getElementById("pageHeading");
  const description = document.getElementById("pageDescription");
  const formTitle = document.getElementById("formTitle");
  const fieldsHost = document.getElementById("dynamicFields");
  const form = document.getElementById("operationForm");
  const message = document.getElementById("operationMessage");

  try {
    const meResponse = await fetch("/api/me");

    if (meResponse.status === 401 || meResponse.redirected) {
      window.location.href = "/login";
      return;
    }

    if (!meResponse.ok) {
      throw new Error("Could not verify your login.");
    }

    const me = await meResponse.json();
    document.getElementById("staffName").textContent =
      me.username || "Staff";

    // Dedicated database-connected Staff & Riders screen
    if (pageKey === "staff-riders") {
      title.textContent = "Staff & Riders";
      heading.textContent = "Manage your team";
      description.textContent =
        "Add team members and manage their active status.";
      formTitle.textContent = "Staff & Riders Directory";

      renderStaffManager();
      await loadStaff();
      return;
    }
// Database-connected Jobsheet Management
if (
  ["jobsheets-active", "jobsheets-drafts", "jobsheets-archived"]
    .includes(pageKey)
) {
  renderJobsheetPage(pageKey);
  await loadJobsheets(pageKey);
  return;
}
    // Existing workflow pages continue using their server definitions
    const pageResponse = await fetch(
      `/api/operation/${encodeURIComponent(pageKey)}`
    );

    if (!pageResponse.ok) {
      throw new Error("Could not load this workflow.");
    }

    const page = await pageResponse.json();

    title.textContent = page.title;
    heading.textContent = page.heading;
    description.textContent = page.description;
    formTitle.textContent = page.formTitle;

    fieldsHost.innerHTML = page.fields.map((field, index) => {
      const id = `field-${index}`;

      return `
        <label class="operation-field" for="${id}">
          <span>${escapeHtml(field[0])}</span>
          <input
            id="${id}"
            name="${id}"
            type="${escapeHtml(field[1])}"
            ${field[1] === "number" ? 'min="0" step="any"' : ""}
            required
          >
        </label>
      `;
    }).join("");

    form.onsubmit = event => {
      event.preventDefault();
      message.textContent =
        "Form preview complete. Database saving is not yet connected for this workflow.";
    };

  } catch (error) {
    heading.textContent = error.message;
  }
}

function renderStaffManager() {
  const card = document.querySelector(".operation-card");

  card.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow orange">TEAM MANAGEMENT</p>
        <h2>Staff &amp; Riders Directory</h2>
      </div>
      <span class="sample-tag">LIVE DATABASE</span>
    </div>

    <form id="staffForm" class="operation-form">
      <div class="form-grid">
        <label class="operation-field" for="staffFullName">
          <span>Full name</span>
          <input
            id="staffFullName"
            name="fullName"
            type="text"
            maxlength="150"
            placeholder="Enter full name"
            required
          >
        </label>

        <label class="operation-field" for="staffPhone">
          <span>Phone number</span>
          <input
            id="staffPhone"
            name="phone"
            type="tel"
            maxlength="20"
            placeholder="Enter phone number"
            required
          >
        </label>

        <label class="operation-field" for="staffRoleSelect">
          <span>Team role</span>
          <select id="staffRoleSelect" name="role" required>
            <option value="staff">Staff</option>
            <option value="rider">Delivery Rider</option>
            <option value="supervisor">Supervisor</option>
          </select>
        </label>
      </div>

      <p id="staffMessage" class="form-message" role="status"></p>
      <button class="primary-button" type="submit">Add Team Member</button>
    </form>

    <div style="margin-top:28px">
      <div class="section-heading">
        <div>
          <p class="eyebrow orange">YOUR COMPANY</p>
          <h2>Registered Team Members</h2>
        </div>
        <button type="button" id="refreshStaff" class="primary-button">
          Refresh
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="staffRows">
            <tr><td colspan="5">Loading team members...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("staffForm").addEventListener("submit", addStaff);
  document.getElementById("refreshStaff").addEventListener("click", loadStaff);
}

async function loadStaff() {
  const rows = document.getElementById("staffRows");
  if (!rows) return;

  rows.innerHTML = `<tr><td colspan="5">Loading team members...</td></tr>`;

  try {
    const response = await fetch("/api/staff-riders");

    if (response.status === 401 || response.redirected) {
      window.location.href = "/login";
      return;
    }

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Could not load team members.");
    }

    if (!data.staff.length) {
      rows.innerHTML = `
        <tr>
          <td colspan="5">No team members yet. Add your first member above.</td>
        </tr>
      `;
      return;
    }

    rows.innerHTML = data.staff.map(person => `
      <tr>
        <td>${escapeHtml(person.full_name)}</td>
        <td>${escapeHtml(person.phone)}</td>
        <td>${escapeHtml(formatRole(person.role))}</td>
        <td>${escapeHtml(person.status)}</td>
        <td>
          <button
            type="button"
            class="primary-button staff-status-button"
            data-id="${Number(person.id)}"
            data-status="${person.status === "active" ? "inactive" : "active"}"
          >
            ${person.status === "active" ? "Deactivate" : "Activate"}
          </button>
        </td>
      </tr>
    `).join("");

    rows.querySelectorAll(".staff-status-button").forEach(button => {
      button.addEventListener("click", () => updateStaffStatus(button));
    });

  } catch (error) {
    rows.innerHTML = `
      <tr><td colspan="5">${escapeHtml(error.message)}</td></tr>
    `;
  }
}

async function addStaff(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const message = document.getElementById("staffMessage");
  const submitButton = form.querySelector('button[type="submit"]');

  const payload = {
    fullName: form.fullName.value.trim(),
    phone: form.phone.value.trim(),
    role: form.role.value
  };

  submitButton.disabled = true;
  message.textContent = "Saving team member...";

  try {
    const response = await fetch("/api/staff-riders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (response.status === 401 || response.redirected) {
      window.location.href = "/login";
      return;
    }

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Could not save team member.");
    }

    message.textContent = "Team member added successfully.";
    form.reset();

    await loadStaff();

  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function updateStaffStatus(button) {
  const id = button.dataset.id;
  const status = button.dataset.status;

  button.disabled = true;

  try {
    const response = await fetch(`/api/staff-riders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });

    if (response.status === 401 || response.redirected) {
      window.location.href = "/login";
      return;
    }

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Could not update status.");
    }

    await loadStaff();

  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
}

function formatRole(role) {
  const roles = {
    staff: "Staff",
    rider: "Delivery Rider",
    supervisor: "Supervisor"
  };

  return roles[role] || role;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await fetch("/logout", { method: "POST" });
  window.location.href = "/login";
});

document.getElementById("menuButton").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

initOperationPage();

function renderJobsheetPage(pageKey) {
  const card = document.querySelector(".operation-card");

  const config = {
    "jobsheets-active": {
      title: "Active Jobsheets",
      description: "Monitor your active delivery assignments.",
      status: "active"
    },
    "jobsheets-drafts": {
      title: "Draft Jobsheets",
      description: "Create and manage your saved jobsheets.",
      status: "draft"
    },
    "jobsheets-archived": {
      title: "Archived Jobsheets",
      description: "Review your archived jobsheet records.",
      status: "archived"
    }
  };

  const current = config[pageKey];

  document.getElementById("pageTitle").textContent = current.title;
  document.getElementById("pageHeading").textContent = current.title;
  document.getElementById("pageDescription").textContent =
    current.description;

  card.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow orange">JOBSHEET CONTROL</p>
        <h2>${current.title}</h2>
      </div>
      <span class="sample-tag">LIVE DATABASE</span>
    </div>

    ${pageKey === "jobsheets-drafts" ? `
      <div style="margin-bottom:24px">
        <button type="button" id="showCreateJobsheet"
          class="primary-button">
          + Create Jobsheet
        </button>
      </div>

      <div id="createJobsheetPanel" hidden>
        <h2>Create New Jobsheet</h2>

        <form id="jobsheetForm" class="operation-form">
          <div class="form-grid">
            <label class="operation-field">
              <span>Jobsheet Number</span>
              <input name="jobsheetNumber" type="text"
                maxlength="80" required>
            </label>

            <label class="operation-field">
              <span>Jobsheet Date</span>
              <input name="jobsheetDate" type="date" required>
            </label>

            <label class="operation-field">
              <span>Assign Rider</span>
              <select name="riderId" id="jobsheetRider"
                required>
                <option value="">Loading riders...</option>
              </select>
            </label>
          </div>

          <div class="section-heading" style="margin-top:28px">
            <div>
              <p class="eyebrow orange">SHIPMENT DETAILS</p>
              <h2>Shipments</h2>
            </div>
            <button type="button" id="addShipment"
              class="primary-button">
              + Add Shipment
            </button>
          </div>

          <div id="shipmentFields"></div>

          <p id="jobsheetMessage" class="form-message"
            role="status"></p>

          <button type="submit" class="primary-button">
            Save Jobsheet as Draft
          </button>
        </form>
      </div>
    ` : ""}

    <div style="margin-top:25px">
      <div class="section-heading">
        <div>
          <p class="eyebrow orange">YOUR COMPANY</p>
          <h2>Jobsheet Records</h2>
        </div>
        <button type="button" id="refreshJobsheets"
          class="primary-button">
          Refresh
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Jobsheet Number</th>
              <th>Date</th>
              <th>Assigned Rider</th>
              <th>Shipments</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="jobsheetRows">
            <tr><td colspan="5">Loading jobsheets...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("refreshJobsheets")
    .addEventListener("click", () => loadJobsheets(pageKey));

  if (pageKey === "jobsheets-drafts") {
    document.getElementById("showCreateJobsheet")
      .addEventListener("click", async () => {
        const panel = document.getElementById("createJobsheetPanel");
        panel.hidden = !panel.hidden;

        if (!panel.hidden) {
          await loadAvailableRiders();
        }
      });

    document.getElementById("addShipment")
      .addEventListener("click", addShipmentRow);

    document.getElementById("jobsheetForm")
      .addEventListener("submit", saveJobsheet);
  }
}

async function loadAvailableRiders() {
  const select = document.getElementById("jobsheetRider");

  try {
    const response = await fetch("/api/riders");

    if (response.status === 401 || response.redirected) {
      window.location.href = "/login";
      return;
    }

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Could not load riders.");
    }

    const riders = data.riders || [];

    select.innerHTML = `
      <option value="">Select a rider</option>
      ${riders.map(rider => `
        <option value="${Number(rider.id)}">
          ${escapeHtml(rider.full_name)} -
          ${escapeHtml(rider.phone)}
        </option>
      `).join("")}
    `;

    if (!riders.length) {
      select.innerHTML =
        `<option value="">No active riders available</option>`;
    }

    if (!document.querySelector(".shipment-entry")) {
      addShipmentRow();
    }

  } catch (error) {
    select.innerHTML =
      `<option value="">${escapeHtml(error.message)}</option>`;
  }
}

function addShipmentRow() {
  const host = document.getElementById("shipmentFields");
  const index = host.querySelectorAll(".shipment-entry").length;

  const shipment = document.createElement("div");
  shipment.className = "content-card shipment-entry";
  shipment.style.marginTop = "16px";

  shipment.innerHTML = `
    <div class="section-heading">
      <h3>Shipment ${index + 1}</h3>
      <button type="button" class="primary-button remove-shipment">
        Remove
      </button>
    </div>

    <div class="form-grid">
      <label class="operation-field">
        <span>Tracking Number</span>
        <input name="trackingNumber" maxlength="100" required>
      </label>

      <label class="operation-field">
        <span>Recipient Name</span>
        <input name="recipientName" maxlength="150" required>
      </label>

      <label class="operation-field">
        <span>Recipient Phone</span>
        <input name="recipientPhone" type="tel"
          maxlength="20" required>
      </label>

      <label class="operation-field">
        <span>Destination Address</span>
        <input name="destinationAddress" required>
      </label>

      <label class="operation-field">
        <span>Area</span>
        <input name="area" maxlength="150" required>
      </label>

      <label class="operation-field">
        <span>COD Amount (₹)</span>
        <input name="codAmount" type="number"
          min="0" step="0.01" value="0" required>
      </label>
    </div>
  `;

  shipment.querySelector(".remove-shipment")
    .addEventListener("click", () => {
      shipment.remove();

      host.querySelectorAll(".shipment-entry h3")
        .forEach((heading, i) => {
          heading.textContent = `Shipment ${i + 1}`;
        });
    });

  host.appendChild(shipment);
}

async function saveJobsheet(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const message = document.getElementById("jobsheetMessage");
  const button = form.querySelector('button[type="submit"]');

  const shipmentEntries =
    [...form.querySelectorAll(".shipment-entry")];

  if (!shipmentEntries.length) {
    message.textContent = "Add at least one shipment.";
    return;
  }

  const shipments = shipmentEntries.map(entry => ({
    trackingNumber: entry.querySelector('[name="trackingNumber"]').value.trim(),
    recipientName: entry.querySelector('[name="recipientName"]').value.trim(),
    recipientPhone: entry.querySelector('[name="recipientPhone"]').value.trim(),
    destinationAddress: entry.querySelector('[name="destinationAddress"]').value.trim(),
    area: entry.querySelector('[name="area"]').value.trim(),
    codAmount: entry.querySelector('[name="codAmount"]').value
  }));

  const payload = {
    jobsheetNumber: form.elements.jobsheetNumber.value.trim(),
    jobsheetDate: form.elements.jobsheetDate.value,
    riderId: form.elements.riderId.value,
    shipments
  };

  button.disabled = true;
  message.textContent = "Saving jobsheet...";

  try {
    const response = await fetch("/api/jobsheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (response.status === 401 || response.redirected) {
      window.location.href = "/login";
      return;
    }

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Could not save jobsheet.");
    }

    message.textContent = "Jobsheet saved successfully as a draft.";
    form.reset();

    document.getElementById("shipmentFields").innerHTML = "";
    addShipmentRow();

    await loadJobsheets("jobsheets-drafts");

  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function loadJobsheets(pageKey) {
  const rows = document.getElementById("jobsheetRows");
  if (!rows) return;

  const statusMap = {
    "jobsheets-active": "active",
    "jobsheets-drafts": "draft",
    "jobsheets-archived": "archived"
  };

  rows.innerHTML =
    `<tr><td colspan="5">Loading jobsheets...</td></tr>`;

  try {
    const status = statusMap[pageKey];
    const response = await fetch(
      `/api/jobsheets?status=${encodeURIComponent(status)}`
    );

    if (response.status === 401 || response.redirected) {
      window.location.href = "/login";
      return;
    }

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Could not load jobsheets.");
    }

    const jobsheets = data.jobsheets || [];

    if (!jobsheets.length) {
      rows.innerHTML =
        `<tr><td colspan="5">No ${status} jobsheets found.</td></tr>`;
      return;
    }

    rows.innerHTML = jobsheets.map(job => `
      <tr>
        <td>${escapeHtml(job.jobsheet_number)}</td>
        <td>${escapeHtml(job.jobsheet_date)}</td>
        <td>${escapeHtml(job.rider_name || "Unassigned")}</td>
        <td>${Number(job.shipment_count || 0)}</td>
        <td>${escapeHtml(job.status)}</td>
      </tr>
    `).join("");

  } catch (error) {
    rows.innerHTML = `
      <tr><td colspan="5">${escapeHtml(error.message)}</td></tr>
    `;
  }
}
