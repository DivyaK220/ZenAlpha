require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const db = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

db.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err.message);
});
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;


if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error("Missing configuration. Copy .env.example to .env and fill in its values.");
  process.exit(1);
}

app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(session({
  name: "zenalpha.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

// Hash the configured password when the server starts; never store it in frontend code.
const adminPasswordHashPromise = bcrypt.hash(ADMIN_PASSWORD, 12);

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

app.use("/assets", express.static(path.join(__dirname, "public", "assets")));

app.get("/", (req, res) => {
  res.redirect("/register");
});

app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "register.html"));
});

app.post("/register", async (req, res) => {
  const companyName = String(req.body.companyName || "").trim();
  const fullName = String(req.body.fullName || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  if (!companyName || !fullName || !email || !password) {
    return res.status(400).send("Please fill in all required fields.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).send("Please enter a valid email address.");
  }

  if (password.length < 8) { 
    return res.status(400).send("Password must be at least 8 characters.");
  }

  if (password !== confirmPassword) {
    return res.status(400).send("Passwords do not match.");
  }

  if (companyName.length > 150 || fullName.length > 150 ||
      email.length > 255 || phone.length > 30) {
    return res.status(400).send("One or more fields are too long.");
  }

  let client;
  let transactionStarted = false;

  try {
    client = await db.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const passwordHash = await bcrypt.hash(password, 12);

    const companyResult = await client.query(  
      `INSERT INTO companies (company_name, email, phone)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [companyName, email, phone || null]
    );

    const companyId = companyResult.rows[0].id;

    await client.query(
      `INSERT INTO users
         (company_id, full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'admin')`,
      [companyId, fullName, email, passwordHash]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.redirect(303, "/login?registered=1");
  } catch (err) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    if (err.code === "23505") {
      return res.status(409).send(
        "This email is already registered. Please sign in or use another email."
      );
    }

    console.error("Registration error:", err.message);
    return res.status(500).send(
      "Registration failed. Please try again."
    );
  } finally {
    if (client) client.release();
  }
});


app.post("/login", async (req, res) => {
  const email = String(
    req.body.email || req.body.username || ""
  ).trim().toLowerCase();

  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      message: "Enter your registered email and password."
    });
  }

  try {
    const result = await db.query(
      `SELECT
         u.id,
         u.company_id,
         u.full_name,
         u.email,
         u.password_hash,
         u.role,
         u.status AS user_status,
         c.company_name,
         c.status AS company_status
       FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE LOWER(u.email) = $1
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        ok: false,
        message: "Incorrect email or password."
      });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (
      !validPassword ||
      user.user_status !== "active" ||
      user.company_status !== "active"
    ) {
      return res.status(401).json({
        ok: false,
        message: "Incorrect email or password, or account inactive."
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({
          ok: false,
          message: "Could not start your session. Please try again."
        });
      }

      req.session.user = {
        userId: user.id,
        companyId: user.company_id,
        username: user.email,
        fullName: user.full_name,
        companyName: user.company_name,
        role: user.role
      };

      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({
            ok: false,
            message: "Could not save your session. Please try again."
          });
        }

        return res.json({
          ok: true,
          redirect: "/dashboard"
        });
      });
    });
  } catch (err) {
    console.error("Login database error:", err.message);

    return res.status(500).json({
      ok: false,
      message: "Sign-in is temporarily unavailable. Please try again."
    });
  }
});

app.get("/dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "dashboard.html"));
});

const operationPages = {
  "inbound": { title: "Inbound Hub", heading: "Receive incoming bags", description: "Register bags received at your hub.", formTitle: "Bag receiving details", fields: [["Bag / manifest ID","text"],["Origin hub","text"],["Received date","date"],["Number of parcels","number"]] },
  "cash-desk": { title: "Cash Desk", heading: "Daily cash collection", description: "Record cash collected by staff or riders.", formTitle: "Cash collection entry", fields: [["Rider / staff name","text"],["Jobsheet ID","text"],["Amount collected (₹)","number"],["Collection date","date"]] },
  "forward-delivery": { title: "Dispatch Center · Forward Delivery", heading: "Assign forward deliveries", description: "Prepare outgoing shipments for a rider.", formTitle: "Forward delivery assignment", fields: [["Shipment / jobsheet ID","text"],["Assign agent","text"],["Destination area","text"],["Dispatch date","date"]] },
  "return-pickup": { title: "Dispatch Center · Return Pickup", heading: "Assign a return pickup", description: "Arrange pickup for a return shipment.", formTitle: "Return pickup assignment", fields: [["Return / shipment ID","text"],["Assign agent","text"],["Pickup address / area","text"],["Pickup date","date"]] },
  "jobsheets-active": { title: "Jobsheet Control · Active", heading: "Active jobsheets", description: "Review jobsheets currently in progress.", formTitle: "Find a jobsheet", fields: [["Jobsheet ID","text"],["Agent name","text"],["Date","date"]] },
  "jobsheets-drafts": { title: "Jobsheet Control · Drafts", heading: "Draft jobsheets", description: "Review jobsheets that are not yet finalized.", formTitle: "Find a draft jobsheet", fields: [["Draft ID","text"],["Created by","text"],["Date","date"]] },
  "jobsheets-archived": { title: "Jobsheet Control · Archived", heading: "Archived jobsheets", description: "Review inactive or completed jobsheets.", formTitle: "Find an archived jobsheet", fields: [["Jobsheet ID","text"],["Agent name","text"],["Date","date"]] },
  "earnings": { title: "Earnings & Rewards · Earnings", heading: "Earnings overview", description: "Prepare a staff or rider earnings summary.", formTitle: "Earnings lookup", fields: [["Staff / rider ID","text"],["Period start","date"],["Period end","date"]] },
  "incentives": { title: "Earnings & Rewards · Rewards", heading: "Performance rewards", description: "Review incentive eligibility and reward details.", formTitle: "Reward lookup", fields: [["Staff / rider ID","text"],["Incentive period","text"],["Delivered shipments","number"]] },
  "returns": { title: "Returns & Reconciliation · Returns", heading: "Returns & undelivered", description: "Review return-to-origin and undelivered shipment records.", formTitle: "Find a return shipment", fields: [["Shipment ID","text"],["Return reason","text"],["Last updated","date"]] },
  "cash-transfer": { title: "Returns & Reconciliation · Cash Transfer", heading: "Transfer cash", description: "Prepare a cash handover record for reconciliation.", formTitle: "Cash transfer details", fields: [["Transferred by","text"],["Received by","text"],["Amount (₹)","number"],["Transfer date","date"],["Reference / notes","text"]] },
  "staff-riders": {
  title: "Staff & Riders",
  heading: "Manage your team",
  description: "Manage your company's staff, supervisors and delivery riders.",
  formTitle: "Staff & Riders Directory",
  fields: []
}
};

/* ==========================================
   ZENALPHA STAFF & RIDERS API
   ========================================== */

// 1. GET: Load staff and riders
app.get("/api/staff-riders", requireLogin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, full_name, phone, role, status, created_at
       FROM staff_riders
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [req.session.user.companyId]
    );

    res.json({
      ok: true,
      staff: result.rows
    });

  } catch (err) {
    console.error("Load staff error:", err);

    res.status(500).json({
      ok: false,
      message: "Could not load staff records."
    });
  }
});


// 2. POST: Add a staff member or rider
app.post("/api/staff-riders", requireLogin, async (req, res) => {
  const fullName = String(req.body.fullName || "").trim();
  const phone = String(req.body.phone || "").trim();
  const role = String(req.body.role || "").trim().toLowerCase();

  if (!fullName || !phone || !role) {
    return res.status(400).json({
      ok: false,
      message: "Name, phone and role are required."
    });
  }

  if (fullName.length > 150 || phone.length > 20) {
    return res.status(400).json({
      ok: false,
      message: "Name or phone number is too long."
    });
  }

  if (!["staff", "rider", "supervisor"].includes(role)) {
    return res.status(400).json({
      ok: false,
      message: "Invalid team role."
    });
  }

  try {
    const result = await db.query(
      `INSERT INTO staff_riders
       (company_id, full_name, phone, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, phone, role, status, created_at`,
      [
        req.session.user.companyId,
        fullName,
        phone,
        role
      ]
    );

    res.status(201).json({
      ok: true,
      message: "Team member added successfully.",
      staff: result.rows[0]
    });

  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "This phone number is already registered."
      });
    }

    console.error("Create staff error:", err);

    res.status(500).json({
      ok: false,
      message: "Could not save the team member."
    });
  }
});


// 3. PATCH: Activate or deactivate a team member
app.patch("/api/staff-riders/:id/status", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body.status || "").trim().toLowerCase();

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({
      ok: false,
      message: "Invalid staff record."
    });
  }

  if (!["active", "inactive"].includes(status)) {
    return res.status(400).json({
      ok: false,
      message: "Invalid status."
    });
  }

  try {
    const result = await db.query(
      `UPDATE staff_riders
       SET status = $1
       WHERE id = $2 AND company_id = $3
       RETURNING id, full_name, phone, role, status`,
      [
        status,
        id,
        req.session.user.companyId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "Team member not found."
      });
    }

    res.json({
      ok: true,
      staff: result.rows[0]
    });

  } catch (err) {
    console.error("Update staff status error:", err);

    res.status(500).json({
      ok: false,
      message: "Could not update team member status."
    });
  }
});

/* ==========================================
   ZENALPHA JOBSHEET MANAGEMENT API
   ========================================== */

// 1. Load active riders for the logged-in company
app.get("/api/riders", requireLogin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, full_name, phone
       FROM staff_riders
       WHERE company_id = $1
         AND role = 'rider'
         AND status = 'active'
       ORDER BY full_name ASC`,
      [req.session.user.companyId]
    );

    res.json({ ok: true, riders: result.rows });
  } catch (err) {
    console.error("Load riders error:", err);
    res.status(500).json({
      ok: false,
      message: "Could not load active riders."
    });
  }
});


// 2. Create a jobsheet with multiple shipments
app.post("/api/jobsheets", requireLogin, async (req, res) => {
  const companyId = req.session.user.companyId;
  const userId = req.session.user.userId;

  const jobsheetNumber = String(
    req.body.jobsheetNumber || ""
  ).trim();

  const jobsheetDate = String(
    req.body.jobsheetDate || ""
  ).trim();

  const riderId = Number(req.body.riderId);
  const shipments = req.body.shipments;

  if (
    !jobsheetNumber ||
    jobsheetNumber.length > 100 ||
    !jobsheetDate ||
    !Number.isSafeInteger(riderId) ||
    riderId <= 0 ||
    !Array.isArray(shipments) ||
    shipments.length === 0 ||
    shipments.length > 500
  ) {
    return res.status(400).json({
      ok: false,
      message: "Enter valid jobsheet details and at least one shipment."
    });
  }

  // Validate shipment details before opening the transaction
  const trackingNumbers = new Set();

  for (const shipment of shipments) {
    if (!shipment || typeof shipment !== "object" || Array.isArray(shipment)) {
  return res.status(400).json({
    ok: false,
    message: "Invalid shipment details."
  });
}
    const trackingNumber = String(
      shipment.trackingNumber || ""
    ).trim();

    const codAmount = Number(shipment.codAmount ?? 0);

    if (
      !trackingNumber ||
      trackingNumber.length > 150 ||
      trackingNumbers.has(trackingNumber) ||
      !Number.isFinite(codAmount) ||
      codAmount < 0
    ) {
      return res.status(400).json({
        ok: false,
        message: "Check shipment tracking numbers and COD amounts."
      });
    }

    trackingNumbers.add(trackingNumber);

    if (
      String(shipment.recipientName || "").length > 150 ||
      String(shipment.recipientPhone || "").length > 30 ||
      String(shipment.destinationArea || "").length > 150
    ) {
      return res.status(400).json({
        ok: false,
        message: "One or more shipment details are too long."
      });
    }
  }

  let client;

  try {
    client = await db.connect();
    await client.query("BEGIN");

    // Confirm rider belongs to this company and is active
    const riderResult = await client.query(
      `SELECT id
       FROM staff_riders
       WHERE id = $1
         AND company_id = $2
         AND role = 'rider'
         AND status = 'active'`,
      [riderId, companyId]
    );

    if (riderResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message: "Selected rider is not active or does not belong to your company."
      });
    }

    // Create jobsheet
    const jobsheetResult = await client.query(
      `INSERT INTO jobsheets
       (company_id, jobsheet_number, jobsheet_date,
        assigned_rider_id, status, created_by_user_id)
       VALUES ($1, $2, $3, $4, 'draft', $5)
       RETURNING id, jobsheet_number, jobsheet_date,
                 assigned_rider_id, status`,
      [
        companyId,
        jobsheetNumber,
        jobsheetDate,
        riderId,
        userId
      ]
    );

    const jobsheet = jobsheetResult.rows[0];

    // Add all shipments to this jobsheet
    for (const shipment of shipments) {
      await client.query(
        `INSERT INTO shipments
         (company_id, jobsheet_id, tracking_number,
          recipient_name, recipient_phone,
          destination_address, destination_area,
          status, cod_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 'pending_pickup', $8)`,
        [
          companyId,
          jobsheet.id,
          String(shipment.trackingNumber).trim(),
          String(shipment.recipientName || "").trim() || null,
          String(shipment.recipientPhone || "").trim() || null,
          String(shipment.destinationAddress || "").trim() || null,
          String(shipment.destinationArea || "").trim() || null,
          Number(shipment.codAmount ?? 0)
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      message: "Jobsheet created successfully.",
      jobsheet,
      shipmentCount: shipments.length
    });

  } catch (err) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    if (err.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "This jobsheet number or a shipment tracking number already exists."
      });
    }

    console.error("Create jobsheet error:", err);

    res.status(500).json({
      ok: false,
      message: "Could not create jobsheet. Please check the details and try again."
    });

  } finally {
    if (client) client.release();
  }
});


// 3. View jobsheets for the logged-in company
app.get("/api/jobsheets", requireLogin, async (req, res) => {
  const companyId = req.session.user.companyId;
  const status = String(req.query.status || "").trim();

  const allowedStatuses = [
    "draft",
    "active",
    "completed",
    "archived"
  ];

  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({
      ok: false,
      message: "Invalid jobsheet status."
    });
  }

  try {
    const result = await db.query(
      `SELECT
         j.id,
         j.jobsheet_number,
         j.jobsheet_date,
         j.status,
         j.created_at,
         r.full_name AS rider_name,
         r.phone AS rider_phone,
         COUNT(s.id)::integer AS shipment_count
       FROM jobsheets j
       LEFT JOIN staff_riders r
         ON r.id = j.assigned_rider_id
        AND r.company_id = j.company_id
       LEFT JOIN shipments s
         ON s.jobsheet_id = j.id
        AND s.company_id = j.company_id
       WHERE j.company_id = $1
         AND ($2 = '' OR j.status = $2)
       GROUP BY j.id, r.full_name, r.phone
       ORDER BY j.created_at DESC`,
      [companyId, status]
    );

    res.json({
      ok: true,
      jobsheets: result.rows
    });

  } catch (err) {
    console.error("Load jobsheets error:", err);

    res.status(500).json({
      ok: false,
      message: "Could not load jobsheets."
    });
  }
});

app.get("/operations/:page", requireLogin, (req, res) => {
  if (!operationPages[req.params.page]) return res.status(404).send("Operation page not found.");
  res.sendFile(path.join(__dirname, "views", "operation.html"));
});

app.get("/api/operation/:page", requireLogin, (req, res) => {
  const page = operationPages[req.params.page];
  if (!page) return res.status(404).json({ message: "Operation page not found." });
  res.json(page);
});

app.get("/api/me", requireLogin, (req, res) => {
  res.json({ username: req.session.user.username, role: req.session.user.role });
});

// Sample dashboard figures only. Real delivery records will be connected in a later step.
app.get("/api/dashboard", requireLogin, (req, res) => {
  res.json({
    stats: [
      { label: "Total Shipments", value: "1,284", note: "Sample data" },
      { label: "Out for Delivery", value: "186", note: "Sample data" },
      { label: "Delivered Today", value: "342", note: "Sample data" },
      { label: "Cash to Reconcile", value: "₹48,650", note: "Sample data" }
    ],
    shipments: [
      { id: "ZA-10284", destination: "Bengaluru South", rider: "Rider 01", status: "Out for delivery" },
      { id: "ZA-10283", destination: "Jayanagar", rider: "Rider 04", status: "Delivered" },
      { id: "ZA-10282", destination: "Vijayanagar", rider: "Rider 02", status: "In transit" },
      { id: "ZA-10281", destination: "Banashankari", rider: "Rider 07", status: "Pending pickup" }
    ]
  });
});

app.post("/logout", requireLogin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("zenalpha.sid");
    res.json({ ok: true, redirect: "/login" });
  });
});

app.use((req, res) => {
  res.status(404).send("Page not found. <a href='/'>Go to ZenAlpha</a>");
});

app.listen(PORT, async () => {
  console.log(`ZenAlpha is running at http://localhost:${PORT}`);
  console.log(`Login username: ${ADMIN_USERNAME}`);

  try {
    const result = await db.query(
      "SELECT current_database() AS database"
    );

    console.log(
      "PostgreSQL connected successfully:",
      result.rows[0].database
    );
  } catch (err) {
    console.error("PostgreSQL connection failed:", err.message);
  }

  console.log("For safety, do not deploy with the sample password or session secret.");
});