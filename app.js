/* ==========================================================
   MoceanLuxe — app.js
   Vanilla JS · no dependencies
   ========================================================== */

/* ----------------------------------------------------------
   CONFIG — edit these before going live
   ---------------------------------------------------------- */

// TODO: Create a form at https://formspree.io and paste its ID here (e.g. "xyzabcd").
const FORMSPREE_ID = "YOUR_FORMSPREE_ID";
const FORMSPREE_ENDPOINT = `https://formspree.io/f/${FORMSPREE_ID}`;

// TODO: WhatsApp / SMS dispatch number — digits only, with country code, no "+" (e.g. "13055550123").
// TODO: Confirm this number is WhatsApp-enabled (the WhatsApp button uses wa.me with it).
const DISPATCH_PHONE = "13059880285";

// TODO: Payment instructions shown after signing and printed on the contract.
const PAYMENT_INSTRUCTIONS = {
  stripe: "Secure card payment link will be sent by dispatch — TODO: replace with your Stripe Payment Link (https://buy.stripe.com/...)",
  zelle: "Zelle: TODO@moceanluxe.com (MoceanLuxe LLC) — include your Contract Ref in the memo",
  wire: "Wire / ACH: TODO Bank Name · Routing TODO · Account TODO · Beneficiary: MoceanLuxe LLC",
};

// TODO: Legal entity details printed on the contract.
const COMPANY = {
  legalName: "MoceanLuxe LLC",
  address: "Miami, Florida", // TODO: full business address
  email: "reservations@moceanluxe.com", // TODO
  phoneDisplay: "305.988.0285",
  instagram: "@MOCEANLUXE",
  instagramUrl: "https://instagram.com/moceanluxe",
  availability: "Available 24/7 · South Florida",
};

const VEHICLE = "Premium Black Chevy Suburban Z71";

const SERVICE_AREA = {
  label: "Tri-County South Florida Service",
  counties: "Miami-Dade, Broward & Palm Beach County",
};

// TODO: Confirm your cancellation policy with counsel.
const CANCELLATION_POLICY =
  "Cancellations made 72 hours or more before the scheduled pickup receive a full refund less one day of the $45 Commercial Fleet Insurance & Prep fee. Cancellations made less than 72 hours before pickup, or no-shows, are charged the first day's base rate, chauffeur gratuity, and insurance surcharge in full.";

/* ----------------------------------------------------------
   PRICING
   ---------------------------------------------------------- */
const PRICING = {
  baseDaily: 600,
  weeklyDaily: 550,            // Weekly VIP Rate, applied automatically at weeklyMinDays+
  weeklyMinDays: 7,
  gratuityRate: 0.18,          // 18% of base rate
  fleetDaily: 45,              // Commercial Fleet Insurance & Prep (insurance + fuel staging + sanitization)
  includedHours: 10,
  includedMiles: 300,
  overtimeHourly: 75,
  excessMile: 3.5,
  smokingFee: 150,             // smoking / vaping in vehicle
  deepCleaningFee: 150,        // smoke odor, spills, or excessive interior mess
  securityHold: 500,
  minDays: 1,
  maxDays: 14,
};

const ADDONS = [
  { id: "fbo",      name: "MIA / Opa-locka Private FBO Meet & Greet",            price: 125, per: "booking" },
  { id: "dual",     name: "24/7 Dual-Driver Standby Upgrade (No Overtime Caps)", price: 200, per: "day" },
  { id: "security", name: "Armed Executive Security Escort (FL Class \"G\")",    price: 350, per: "day" },
  { id: "bar",      name: "In-Vehicle VIP Bar & Refreshment Stocking",           price: 150, per: "booking" },
];

/* ----------------------------------------------------------
   STATE
   ---------------------------------------------------------- */
const state = {
  days: 1,
  addons: new Set(),
  ref: makeRef(),
  locked: false,
  signedAt: null,
};

/* ----------------------------------------------------------
   HELPERS
   ---------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
// Whole dollars by default; shows cents only when needed (e.g. $3.50/mi)
const usd = (n) => {
  const cents = Math.round(n * 100);
  return "$" + (cents % 100 === 0
    ? (cents / 100).toLocaleString("en-US")
    : (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
};

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function makeRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(4);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  const code = Array.from(buf, (n) => chars[n % chars.length]).join("");
  return `ML-${new Date().getFullYear()}-${code}`;
}

function parseLocalDate(v) {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtDate(d) {
  return d ? d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" }) : "";
}
function fmtTime(v) {
  if (!v) return "";
  const [h, m] = v.split(":").map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function normName(s) { return String(s || "").trim().replace(/\s+/g, " ").toLowerCase(); }

/* ----------------------------------------------------------
   QUOTE CALCULATION
   ---------------------------------------------------------- */
function calcQuote() {
  const d = state.days;
  const weekly = d >= PRICING.weeklyMinDays;
  const dailyRate = weekly ? PRICING.weeklyDaily : PRICING.baseDaily;
  const base = dailyRate * d;
  const savings = (PRICING.baseDaily - dailyRate) * d;
  const gratuity = base * PRICING.gratuityRate;
  const fleet = PRICING.fleetDaily * d;
  const opsTotal = gratuity + fleet;

  const addonLines = ADDONS.filter((a) => state.addons.has(a.id)).map((a) => ({
    ...a,
    total: a.per === "day" ? a.price * d : a.price,
  }));
  const addonsTotal = addonLines.reduce((s, a) => s + a.total, 0);

  return {
    days: d,
    weekly,
    dailyRate,
    savings,
    base,
    gratuity,
    fleet,
    opsTotal,
    addonLines,
    addonsTotal,
    grandTotal: base + opsTotal + addonsTotal,
    deposit: PRICING.securityHold,
  };
}

function lineItems(q) {
  const dayWord = q.days === 1 ? "day" : "days";
  const items = [
    { group: "Base Rate" },
    {
      label: q.weekly ? "Black Suburban Z71 + Chauffeur — Weekly VIP Rate" : `${VEHICLE} + Private Chauffeur`,
      note: `${q.days} ${dayWord} × ${usd(q.dailyRate)}/day · ${PRICING.includedHours} hrs & ${PRICING.includedMiles} mi/day${q.weekly ? ` · Save ${usd(q.savings)}` : ""}`,
      amount: q.base,
    },
    { group: "Operational Fees" },
    { label: "Chauffeur Gratuity & Service (18%)", note: `18% of ${usd(q.base)} base rate`, amount: q.gratuity },
    { label: `Commercial Fleet Insurance & Prep (${usd(PRICING.fleetDaily)}/day)`, note: `Livery insurance, fuel staging & sanitization · ${usd(PRICING.fleetDaily)} × ${q.days}`, amount: q.fleet },
  ];
  if (q.addonLines.length) {
    items.push({ group: "VIP Add-Ons" });
    q.addonLines.forEach((a) =>
      items.push({ label: a.name, note: a.per === "day" ? `${usd(a.price)}/day × ${q.days}` : "Per booking", amount: a.total })
    );
  }
  return items;
}

/* ----------------------------------------------------------
   RENDER: QUOTE
   ---------------------------------------------------------- */
function renderAddons() {
  $("#addons").innerHTML = ADDONS.map(
    (a) => `
    <label class="addon">
      <input type="checkbox" value="${a.id}" ${state.addons.has(a.id) ? "checked" : ""} />
      <span class="addon-name">${esc(a.name)}</span>
      <span class="addon-price">+${usd(a.price)}${a.per === "day" ? "/day" : ""}</span>
    </label>`
  ).join("");
}

/** Fill static rate text in the page (data-rate="key") from PRICING — single source of truth. */
function renderStaticRates() {
  const P = PRICING;
  const map = {
    baseDaily: usd(P.baseDaily),
    weeklyDaily: usd(P.weeklyDaily),
    overtime: `${usd(P.overtimeHourly)}/hr`,
    excessMile: `${usd(P.excessMile)}/mi`,
    smoking: usd(P.smokingFee),
    deepClean: usd(P.deepCleaningFee),
    includedMiles: String(P.includedMiles),
    includedMilesShort: `${P.includedMiles} mi`,
    serviceArea: SERVICE_AREA.counties,
    serviceAreaLabel: SERVICE_AREA.label,
    hold: usd(P.securityHold),
    fleetDaily: `${usd(P.fleetDaily)}/day`,
    gratuity: `${Math.round(P.gratuityRate * 100)}%`,
  };
  $$("[data-rate]").forEach((el) => { if (map[el.dataset.rate]) el.textContent = map[el.dataset.rate]; });
}

function renderQuote() {
  const q = calcQuote();
  const rows = lineItems(q)
    .map((it) =>
      it.group
        ? `<tr class="group"><th colspan="2">${esc(it.group)}</th></tr>`
        : `<tr><th scope="row">${esc(it.label)}<small>${esc(it.note)}</small></th><td>${usd(it.amount)}</td></tr>`
    )
    .join("");
  const subtotal = `<tr class="subtotal"><th scope="row">Base + Operational Fees${q.addonsTotal ? " + Add-Ons" : ""}</th><td>${usd(q.grandTotal)}</td></tr>`;
  $("#invoiceBody").innerHTML = rows + subtotal;

  const total = usd(q.grandTotal);
  const gt = $("#grandTotal");
  if (gt.textContent !== total) {
    gt.textContent = total;
    gt.classList.remove("total-flash"); void gt.offsetWidth; gt.classList.add("total-flash");
  }
  $("#summaryDays").textContent = `${q.days} ${q.days === 1 ? "Day" : "Days"}`;

  // Weekly VIP Rate badge / unlock nudge
  const wb = $("#weeklyBadge");
  wb.hidden = !q.weekly;
  if (q.weekly) wb.innerHTML = `<span class="wb-check" aria-hidden="true">✓</span> Weekly VIP Rate Applied <b>Save ${usd(q.savings)}</b>`;
  const nudge = $("#weeklyNudge");
  nudge.hidden = q.weekly;
  if (!q.weekly) nudge.innerHTML = `Book ${PRICING.weeklyMinDays}+ days to unlock the <b>${usd(PRICING.weeklyDaily)}/day Weekly VIP Rate</b> — save ${usd((PRICING.baseDaily - PRICING.weeklyDaily) * PRICING.weeklyMinDays)}+.`;

  $("#signTotal").textContent = total;
  $("#stickyTotal").textContent = total;

  // pills / custom inputs
  $$(".pill").forEach((p) => p.setAttribute("aria-checked", String(Number(p.dataset.days) === q.days)));
  $("#daysRange").value = q.days;
  if (document.activeElement !== $("#daysInput")) $("#daysInput").value = q.days;
  $("#daysOut").textContent = q.days;

  renderContract();
}

/* ----------------------------------------------------------
   CLIENT DATA
   ---------------------------------------------------------- */
function getClient() {
  return {
    name: $("#clientName").value.trim(),
    email: $("#clientEmail").value.trim(),
    phone: $("#clientPhone").value.trim(),
    passengers: $("#passengers").value,
    date: $("#pickupDate").value,
    time: $("#pickupTime").value,
    location: $("#pickupLocation").value.trim(),
    notes: $("#notes").value.trim(),
  };
}

function serviceEnd(dateStr, days) {
  const d = parseLocalDate(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + days - 1);
  return d;
}

/* ----------------------------------------------------------
   RENDER: CONTRACT (screen)
   ---------------------------------------------------------- */
function fill(value, placeholder) {
  return value ? `<span class="fill">${esc(value)}</span>` : `<span class="fill empty">[${esc(placeholder)}]</span>`;
}

function contractTableHTML(q, cls = "c-table") {
  const rows = lineItems(q)
    .filter((it) => !it.group)
    .map((it) => `<tr><td>${esc(it.label)}<br><small>${esc(it.note)}</small></td><td>${usd(it.amount)}</td></tr>`)
    .join("");
  return `<table class="${cls}"><tbody>${rows}
    <tr class="c-total t"><td>GRAND TOTAL (charged)</td><td>${usd(q.grandTotal)}</td></tr>
    <tr><td>Refundable Security Deposit (authorization hold only)</td><td>${usd(q.deposit)}</td></tr>
  </tbody></table>`;
}

function renderContract() {
  const q = calcQuote();
  const c = getClient();
  const start = parseLocalDate(c.date);
  const end = serviceEnd(c.date, q.days);
  const P = PRICING;

  $("#contractRef").textContent = state.ref;

  $("#contractText").innerHTML = `
    <h3>MoceanLuxe Private Chauffeur &amp; Vehicle Service Agreement</h3>
    <p class="c-sub">Contract Ref ${esc(state.ref)} · Miami-Dade County, Florida</p>

    <p>This Private Chauffeur &amp; Vehicle Service Agreement (the "Agreement") is entered into between <b>${esc(COMPANY.legalName)}</b> ("MoceanLuxe," "we," or "us") and ${fill(c.name, "Client Full Name")} ("Client"), reachable at ${fill(c.email, "Email")} and ${fill(c.phone, "Phone")}.</p>

    <h4>1. Reservation Details</h4>
    <p>MoceanLuxe will provide one (1) dedicated <b>${VEHICLE}</b> (or a comparable premium black SUV under Section 9) <b>with a vetted, licensed private chauffeur</b>. This is a chauffeured service only: the vehicle is operated exclusively by MoceanLuxe's chauffeur, and Client and passengers may not drive or operate the vehicle at any time. Service area: <b>${esc(SERVICE_AREA.counties)}</b> (${esc(SERVICE_AREA.label)}); travel outside this area is available only by prior arrangement with dispatch. Service runs for <b>${q.days} consecutive day${q.days === 1 ? "" : "s"}</b>, beginning ${fill(fmtDate(start), "Pickup Date")} at ${fill(fmtTime(c.time), "Pickup Time")}${end && q.days > 1 ? ` and concluding ${fill(fmtDate(end), "")}` : ""}. Initial pickup location: ${fill(c.location, "Pickup Location")}. Passengers: <b>${esc(c.passengers)}</b> (maximum 6).${c.notes ? ` Itinerary notes: ${fill(c.notes, "")}.` : ""}</p>

    <h4>2. Itemized Fees (Disclosed in Full)</h4>
    ${contractTableHTML(q)}

    <h4>3. Included Service, Overtime &amp; Mileage</h4>
    <p>Each service day includes up to <b>${P.includedHours} hours</b> of chauffeur service and <b>${P.includedMiles} miles</b>. Service beyond ${P.includedHours} hours in a day is billed at <b>${usd(P.overtimeHourly)} per hour</b> (in 30-minute increments after the first hour). Mileage beyond ${P.includedMiles} miles in a day is billed at <b>${usd(P.excessMile)} per mile</b>. Unused hours or miles do not carry over between days.${state.addons.has("dual") ? " Client has selected the 24/7 Dual-Driver Standby Upgrade; daily overtime-hour caps are waived, while excess mileage still applies." : ""}</p>

    <h4>4. Chauffeur Service &amp; Gratuity</h4>
    <p>A mandatory <b>18% Chauffeur Gratuity &amp; Service</b> charge, calculated on the base rate (${usd(q.gratuity)} for this reservation), is included in the Grand Total and is paid to chauffeur staff. Additional gratuity is at Client's discretion.</p>
    <p>A <b>Commercial Fleet Insurance &amp; Prep</b> fee of <b>${usd(P.fleetDaily)} per day</b> (${usd(q.fleet)} for this reservation) covers commercial livery insurance, fuel staging, and vehicle sanitization.${q.weekly ? ` The <b>Weekly VIP Rate</b> of ${usd(P.weeklyDaily)}/day has been applied for this ${q.days}-day reservation (savings of ${usd(q.savings)}).` : ""}</p>

    <h4>5. Payment &amp; Security Deposit Authorization</h4>
    <p>Client authorizes MoceanLuxe to charge the Grand Total of <b>${usd(q.grandTotal)}</b> to Client's designated payment method, and to place a <b>${usd(P.securityHold)} refundable security authorization hold</b>. The hold is released within seven (7) business days after service concludes, less any documented overtime, excess mileage, damage, cleaning, or fines incurred under this Agreement, each of which will be itemized to Client in writing.</p>

    <h4>6. Cancellation</h4>
    <p>${esc(CANCELLATION_POLICY)}</p>

    <h4>7. Vehicle Care, Interior Damage &amp; Smoking</h4>
    <p>Smoking or vaping of any substance is prohibited in the vehicle. Smoking or vaping in the vehicle will incur a <b>${usd(P.smokingFee)} Smoking Fee</b>. Smoke odor, spills, or excessive interior mess requiring deep cleaning will incur a <b>${usd(P.deepCleaningFee)} Deep-Cleaning Fee</b>. Each fee is assessed separately where applicable. Physical damage to the vehicle caused by Client or Client's guests will be billed at documented repair cost and may be deducted from the security deposit. Photographs will be provided as documentation.</p>

    <h4>8. Conduct &amp; Safety</h4>
    <p>The chauffeur may refuse or end service, without refund, if any passenger engages in unlawful, unsafe, or abusive conduct, carries illegal substances, or exceeds the 6-passenger limit. All passengers must comply with Florida seatbelt laws. Open alcohol is permitted only where lawful for chartered passenger vehicles and never for the chauffeur.${state.addons.has("security") ? " Armed security personnel provided under this Agreement hold a valid Florida Class \"G\" Statewide Firearm License and operate under their licensing agency's policies." : ""}</p>

    <h4>9. Liability &amp; Force Majeure</h4>
    <p>MoceanLuxe maintains commercial livery insurance as required by law. MoceanLuxe is not liable for delays caused by traffic, weather, road closures, law enforcement activity, flight delays, or other events outside its reasonable control, nor for personal items left in the vehicle. If the vehicle becomes unavailable for mechanical reasons, MoceanLuxe will provide a comparable replacement vehicle as promptly as practicable.</p>

    <h4>10. Fee Disclosure &amp; Chargeback Waiver Acknowledgment</h4>
    <p>Client acknowledges that <b>every line-item fee</b> — including the daily base rate, 18% chauffeur gratuity &amp; service, ${usd(P.fleetDaily)}/day commercial fleet insurance &amp; prep, selected add-ons, overtime and excess-mileage rates, ${usd(P.smokingFee)} smoking fee, ${usd(P.deepCleaningFee)} deep-cleaning fee, and security hold terms — was <b>clearly disclosed, itemized, and agreed to prior to service</b>. Client agrees to contact MoceanLuxe directly at ${esc(COMPANY.email)} to resolve any billing question before initiating a payment dispute, and waives any chargeback claim asserting that the disclosed and agreed charges were unauthorized, undisclosed, or not as described. This signed Agreement, with its timestamp and audit data, may be submitted as evidence in response to any dispute.</p>

    <h4>11. Governing Law &amp; Venue</h4>
    <p>This Agreement is governed by the laws of the <b>State of Florida</b>. Any dispute shall be resolved exclusively in the state or federal courts located in Miami-Dade County, Florida, and the prevailing party is entitled to recover reasonable attorneys' fees and costs.</p>

    <h4>12. Electronic Signature</h4>
    <p>The parties agree that this Agreement may be executed electronically pursuant to the federal E-SIGN Act and the Florida Uniform Electronic Transaction Act (§668.50, Fla. Stat.). Client's drawn signature, typed legal name, ISO timestamp, browser user-agent, and Contract Reference ID together constitute Client's binding signature.</p>

    <h4>13. Entire Agreement</h4>
    <p>This Agreement is the entire agreement between the parties regarding the reservation described above and supersedes all prior discussions. Any modification must be in writing and acknowledged by both parties (including by text or email).</p>
  `;
}

/* ----------------------------------------------------------
   SIGNATURE PAD (mouse + touch via Pointer Events)
   ---------------------------------------------------------- */
const sig = {
  canvas: null, ctx: null, pad: null,
  strokes: [], current: null, drawing: false,

  init() {
    this.pad = $("#sigPad");
    this.canvas = $("#sigCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.resize();

    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => this.start(e));
    c.addEventListener("pointermove", (e) => this.move(e));
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => c.addEventListener(t, () => this.end()));
    // Prevent page scroll while signing on iOS
    c.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    c.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => this.resize(), 120); });
  },

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  },

  point(e) {
    const r = this.canvas.getBoundingClientRect();
    // store normalized coords so strokes survive resize
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, p: e.pressure || 0.5 };
  },

  start(e) {
    if (state.locked) return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.drawing = true;
    this.current = [this.point(e)];
    this.strokes.push(this.current);
    this.pad.classList.add("has-ink");
    this.pad.classList.remove("invalid");
    this.redraw();
  },

  move(e) {
    if (!this.drawing) return;
    e.preventDefault();
    const evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    evts.forEach((ev) => this.current.push(this.point(ev)));
    this.redraw();
  },

  end() { this.drawing = false; this.current = null; },

  /** Draw all strokes onto ctx. Coordinates map normalized (0–1) → px via w/h and offset ox/oy. */
  paint(ctx, w, h, { color, width, glow, ox = 0, oy = 0 }) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
    const X = (p) => p.x * w - ox, Y = (p) => p.y * h - oy;
    this.strokes.forEach((s) => {
      if (!s.length) return;
      ctx.beginPath();
      if (s.length === 1) {
        ctx.arc(X(s[0]), Y(s[0]), width / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.moveTo(X(s[0]), Y(s[0]));
      for (let i = 1; i < s.length - 1; i++) {
        ctx.quadraticCurveTo(X(s[i]), Y(s[i]), (X(s[i]) + X(s[i + 1])) / 2, (Y(s[i]) + Y(s[i + 1])) / 2);
      }
      const last = s[s.length - 1];
      ctx.lineTo(X(last), Y(last));
      ctx.stroke();
    });
    ctx.restore();
  },

  redraw() {
    const r = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, r.width, r.height);
    // Neon cyan ink on dark glass
    this.paint(this.ctx, r.width, r.height, { color: "#00E5FF", width: 2.6, glow: "rgba(0, 229, 255, 0.85)" });
  },

  clear() {
    if (state.locked) return;
    this.strokes = [];
    this.pad.classList.remove("has-ink");
    this.redraw();
  },

  hasInk() {
    // require a meaningful mark: total points across strokes
    return this.strokes.reduce((n, s) => n + s.length, 0) >= 8;
  },

  /**
   * Returns a tightly-cropped PNG data URL of the signature rendered in clean
   * BLACK ink on a WHITE background — for the printable contract and Formspree payload.
   */
  toDataURL() {
    const r = this.canvas.getBoundingClientRect();
    const scale = 2; // crisp at print resolution
    const w = r.width * scale, h = r.height * scale;
    const pts = this.strokes.flat();
    if (!pts.length) return "";
    const pad = 14 * scale;
    const minX = Math.max(0, Math.min(...pts.map((p) => p.x)) * w - pad);
    const minY = Math.max(0, Math.min(...pts.map((p) => p.y)) * h - pad);
    const maxX = Math.min(w, Math.max(...pts.map((p) => p.x)) * w + pad);
    const maxY = Math.min(h, Math.max(...pts.map((p) => p.y)) * h + pad);

    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(maxX - minX));
    out.height = Math.max(1, Math.round(maxY - minY));
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    this.paint(ctx, w, h, { color: "#111111", width: 2.6 * scale, ox: minX, oy: minY });
    return out.toDataURL("image/png");
  },
};

/* ----------------------------------------------------------
   VALIDATION
   ---------------------------------------------------------- */
function validate() {
  const errors = [];
  const c = getClient();
  const mark = (el, bad) => el.classList.toggle("invalid", bad);

  const checks = [
    ["#clientName", !c.name, "Full name is required."],
    ["#clientEmail", !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email), "A valid email is required."],
    ["#clientPhone", c.phone.replace(/\D/g, "").length < 7, "A valid phone / WhatsApp number is required."],
    ["#pickupDate", !c.date || c.date < todayISO(), "Pickup date is required and cannot be in the past."],
    ["#pickupTime", !c.time, "Pickup time is required."],
    ["#pickupLocation", c.location.length < 3, "Pickup location is required."],
  ];
  checks.forEach(([sel, bad, msg]) => { mark($(sel), bad); if (bad) errors.push(msg); });

  const t = $("#agreeTerms"), ch = $("#agreeCharge");
  mark(t.closest(".check"), !t.checked);
  mark(ch.closest(".check"), !ch.checked);
  if (!t.checked) errors.push("Please agree to the itemized rates and terms.");
  if (!ch.checked) errors.push("Please authorize the charge and security deposit hold.");

  if (!sig.hasInk()) { sig.pad.classList.add("invalid"); errors.push("Please draw your signature in the pad."); }

  const legal = $("#legalName");
  const legalBad = !legal.value.trim() || normName(legal.value) !== normName(c.name);
  mark(legal, legalBad);
  if (legalBad) errors.push("Typed full legal name must match the client name.");

  return errors;
}

function showErrors(errors) {
  const box = $("#formErrors");
  if (!errors.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<b>Please complete the following:</b><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
}

/* ----------------------------------------------------------
   PAYLOAD, SUBMIT & PRINT
   ---------------------------------------------------------- */
function buildPayload(signatureDataUrl) {
  const q = calcQuote();
  const c = getClient();
  return {
    _subject: `New Signed Reservation ${state.ref} — ${c.name} — ${usd(q.grandTotal)}`,
    contractRef: state.ref,
    signedAtISO: state.signedAt,
    userAgent: navigator.userAgent,
    client: { ...c, legalNameTyped: $("#legalName").value.trim() },
    reservation: {
      days: q.days,
      startDate: c.date,
      endDate: (() => { const e = serviceEnd(c.date, q.days); return e ? e.toISOString().slice(0, 10) : ""; })(),
      pickupTime: c.time,
      pickupLocation: c.location,
    },
    lineItems: lineItems(q).filter((i) => !i.group).map((i) => ({ item: i.label, detail: i.note, amount: i.amount })),
    addons: q.addonLines.map((a) => a.name),
    grandTotal: q.grandTotal,
    securityHold: q.deposit,
    terms: {
      includedHoursPerDay: PRICING.includedHours,
      includedMilesPerDay: PRICING.includedMiles,
      overtimeHourly: PRICING.overtimeHourly,
      excessMileRate: PRICING.excessMile,
      smokingFee: PRICING.smokingFee,
      deepCleaningFee: PRICING.deepCleaningFee,
      serviceArea: SERVICE_AREA.counties,
      governingLaw: "Florida",
    },
    acknowledgments: {
      agreedToItemizedTerms: $("#agreeTerms").checked,
      authorizedChargeAndHold: $("#agreeCharge").checked,
    },
    signatureDataUrl,
  };
}

async function submitToFormspree(payload) {
  if (FORMSPREE_ID === "YOUR_FORMSPREE_ID") {
    console.info("[MoceanLuxe] Formspree ID not configured — payload not sent. Payload:", payload);
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch(FORMSPREE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok };
  } catch (err) {
    console.error("[MoceanLuxe] Formspree submit failed:", err);
    return { ok: false };
  }
}

function dispatchMessage() {
  const q = calcQuote();
  const c = getClient();
  return [
    `MoceanLuxe Reservation — ${state.ref}`,
    `Vehicle: ${VEHICLE} · With Private Chauffeur`,
    `Client: ${c.name}`,
    `Pickup: ${fmtDate(parseLocalDate(c.date))} at ${fmtTime(c.time)}`,
    `Location: ${c.location}`,
    `Duration: ${q.days} day(s) · ${c.passengers} passenger(s)`,
    q.addonLines.length ? `Add-ons: ${q.addonLines.map((a) => a.name).join("; ")}` : null,
    `Grand Total: ${usd(q.grandTotal)} + ${usd(q.deposit)} refundable hold`,
    `Contract signed: ${state.signedAt}`,
    `Please confirm my chauffeur & vehicle. Thank you.`,
  ].filter(Boolean).join("\n");
}

function buildPrintContract(sigUrl) {
  const q = calcQuote();
  const c = getClient();
  const P = PRICING;
  const start = parseLocalDate(c.date);
  const end = serviceEnd(c.date, q.days);

  $("#printContract").innerHTML = `
    <div class="pc-head">
      <div class="pc-brand">Mocean Luxe<small>South Florida</small></div>
      <div class="pc-title">Private Chauffeur &amp; Vehicle Service Agreement<small>Contract Ref <b>${esc(state.ref)}</b> · ${esc(COMPANY.legalName)} · ${esc(COMPANY.address)}</small></div>
    </div>

    <div class="pc-cols">
      <div class="pc-box">
        <h6>Client</h6>
        <dl class="pc-kv">
          <dt>Name</dt><dd>${esc(c.name)}</dd>
          <dt>Email</dt><dd>${esc(c.email)}</dd>
          <dt>Phone</dt><dd>${esc(c.phone)}</dd>
          <dt>Passengers</dt><dd>${esc(c.passengers)}</dd>
        </dl>
      </div>
      <div class="pc-box">
        <h6>Reservation</h6>
        <dl class="pc-kv">
          <dt>Pickup</dt><dd>${esc(fmtDate(start))}, ${esc(fmtTime(c.time))}</dd>
          <dt>Ends</dt><dd>${esc(fmtDate(end))}</dd>
          <dt>Location</dt><dd>${esc(c.location)}</dd>
          <dt>Duration</dt><dd>${q.days} day(s) · Black Suburban Z71 · With Driver</dd>
        </dl>
      </div>
    </div>

    <div class="pc-box">
      <h6>Itemized Charges</h6>
      ${contractTableHTML(q, "pc-table")}
    </div>

    <div class="pc-terms">
      <p><b>1. Service.</b> One dedicated ${VEHICLE} with vetted, licensed chauffeur. Chauffeured service only — Client may not operate the vehicle. Service area: ${esc(SERVICE_AREA.counties)}; outside travel by prior arrangement only. Each day includes ${P.includedHours} hours and ${P.includedMiles} miles; unused time/miles do not carry over.</p>
      <p><b>2. Overtime &amp; Mileage.</b> ${usd(P.overtimeHourly)}/hr beyond ${P.includedHours} hrs per day; ${usd(P.excessMile)}/mi beyond ${P.includedMiles} mi per day.${state.addons.has("dual") ? " Dual-Driver Standby selected: overtime caps waived." : ""}</p>
      <p><b>3. Gratuity &amp; Fleet Prep.</b> Mandatory 18% chauffeur gratuity &amp; service on the base rate (${usd(q.gratuity)}) and ${usd(P.fleetDaily)}/day commercial fleet insurance &amp; prep (${usd(q.fleet)}) are included in the Grand Total.${q.weekly ? ` Weekly VIP Rate ${usd(P.weeklyDaily)}/day applied.` : ""}</p>
      <p><b>4. Payment &amp; Hold.</b> Client authorizes charge of ${usd(q.grandTotal)} and a ${usd(P.securityHold)} refundable authorization hold, released within 7 business days less itemized overtime, mileage, damage, cleaning, or fines.</p>
      <p><b>5. Cancellation.</b> ${esc(CANCELLATION_POLICY)}</p>
      <p><b>6. Interior Damage &amp; Smoking.</b> No smoking/vaping. ${usd(P.smokingFee)} Smoking Fee for smoking/vaping; ${usd(P.deepCleaningFee)} Deep-Cleaning Fee for smoke odor, spills, or excessive interior mess (each assessed separately); physical damage billed at documented repair cost.</p>
      <p><b>7. Conduct.</b> Chauffeur may end service without refund for unlawful, unsafe, or abusive conduct or exceeding 6 passengers.</p>
      <p><b>8. Liability.</b> MoceanLuxe carries commercial livery insurance and is not liable for delays beyond its reasonable control or personal items left in the vehicle.</p>
      <p><b>9. Disclosure &amp; Chargeback Waiver.</b> Client confirms all line-item fees, rates, and hold terms were clearly disclosed, itemized, and agreed to prior to service; agrees to contact MoceanLuxe before any payment dispute; and waives chargeback claims that agreed charges were unauthorized or undisclosed.</p>
      <p><b>10. Governing Law.</b> Florida law governs; exclusive venue in Miami-Dade County, Florida; prevailing party recovers reasonable attorneys' fees.</p>
      <p><b>11. E-Signature.</b> Executed electronically under the E-SIGN Act and Fla. Stat. §668.50. This is the entire agreement.</p>
    </div>

    <div class="pc-ack">
      <div>☑ I have reviewed and agree to all itemized daily rates, 18% chauffeur gratuity, insurance surcharges, overtime/mileage rates, and security hold terms.</div>
      <div>☑ I authorize MoceanLuxe to charge the agreed total and place the refundable security deposit hold on my payment method.</div>
    </div>

    <div class="pc-sign">
      <div>
        <div class="pc-sig-img"><img id="pcSigImg" alt="Client signature" src="${sigUrl}"></div>
        <small>Client Signature — ${esc($("#legalName").value.trim())}</small>
      </div>
      <div class="pc-audit">
        CONTRACT REF: ${esc(state.ref)}<br>
        SIGNED (ISO): ${esc(state.signedAt)}<br>
        USER-AGENT: ${esc(navigator.userAgent)}
      </div>
    </div>

    <div class="pc-foot">Call or Text ${esc(COMPANY.phoneDisplay)} · ${esc(COMPANY.instagram)} · ${esc(COMPANY.availability)} · ${esc(COMPANY.email)}<br>Payment: ${esc(PAYMENT_INSTRUCTIONS.zelle)} · ${esc(PAYMENT_INSTRUCTIONS.wire)}</div>
  `;
}

function printContract() {
  const img = $("#pcSigImg");
  const go = () => window.print();
  if (img && !img.complete) img.addEventListener("load", go, { once: true });
  else go();
}

function lockForm() {
  state.locked = true;
  $$("#quoteForm input, #quoteForm select, #quoteForm textarea, #quoteForm button, #agreeTerms, #agreeCharge, #legalName").forEach((el) => (el.disabled = true));
  $("#signBtn").hidden = true;
  $("#clearSig").hidden = true;
  sig.pad.style.cursor = "default";
}

async function handleSign() {
  if (state.locked) return;
  const errors = validate();
  showErrors(errors);
  if (errors.length) {
    $("#formErrors").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const btn = $("#signBtn");
  btn.disabled = true;
  btn.textContent = "Locking Reservation…";

  state.signedAt = new Date().toISOString();
  renderContract();
  const sigUrl = sig.toDataURL();
  const payload = buildPayload(sigUrl);
  buildPrintContract(sigUrl);

  const result = await submitToFormspree(payload);
  lockForm();

  const c = getClient();
  const msg = encodeURIComponent(dispatchMessage());
  $("#waBtn").href = `https://wa.me/${DISPATCH_PHONE}?text=${msg}`;
  // iOS uses "&body=", Android "?body=" — "?&body=" works on both
  $("#smsBtn").href = `sms:+${DISPATCH_PHONE}?&body=${msg}`;

  $("#successMsg").innerHTML = result.ok
    ? `Thank you, ${esc(c.name.split(" ")[0])}. Contract <b>${esc(state.ref)}</b> has been signed and sent to dispatch. Download your signed copy and tap below to confirm with your chauffeur team.`
    : `Thank you, ${esc(c.name.split(" ")[0])}. Contract <b>${esc(state.ref)}</b> is signed. Download your signed copy, then tap WhatsApp or SMS below to send it to dispatch and confirm your chauffeur.`;

  $("#paymentBox").innerHTML = `
    <h5>Payment Options</h5>
    <ul>
      <li>${esc(PAYMENT_INSTRUCTIONS.stripe)}</li>
      <li>${esc(PAYMENT_INSTRUCTIONS.zelle)}</li>
      <li>${esc(PAYMENT_INSTRUCTIONS.wire)}</li>
    </ul>`;

  $("#successPanel").hidden = false;
  $("#successPanel").scrollIntoView({ behavior: "smooth", block: "center" });

  // Auto-open the print dialog for the signed contract (Save as PDF)
  setTimeout(printContract, 500);
}

/* ----------------------------------------------------------
   EVENTS
   ---------------------------------------------------------- */
function setDays(n) {
  const v = Math.min(PRICING.maxDays, Math.max(PRICING.minDays, Math.round(Number(n) || PRICING.minDays)));
  state.days = v;
  renderQuote();
}

function bindEvents() {
  $$(".pill").forEach((p) => p.addEventListener("click", () => setDays(p.dataset.days)));
  $("#daysRange").addEventListener("input", (e) => setDays(e.target.value));
  $("#daysInput").addEventListener("input", (e) => { if (e.target.value !== "") setDays(e.target.value); });
  $("#daysInput").addEventListener("blur", (e) => { e.target.value = state.days; });

  $("#addons").addEventListener("change", (e) => {
    if (e.target.matches("input[type=checkbox]")) {
      e.target.checked ? state.addons.add(e.target.value) : state.addons.delete(e.target.value);
      renderQuote();
    }
  });

  ["#clientName", "#clientEmail", "#clientPhone", "#passengers", "#pickupDate", "#pickupTime", "#pickupLocation", "#notes"].forEach((sel) => {
    $(sel).addEventListener("input", () => { $(sel).classList.remove("invalid"); renderContract(); });
  });
  ["#agreeTerms", "#agreeCharge"].forEach((sel) =>
    $(sel).addEventListener("change", (e) => e.target.closest(".check").classList.remove("invalid"))
  );
  $("#legalName").addEventListener("input", (e) => e.target.classList.remove("invalid"));

  $("#clearSig").addEventListener("click", () => sig.clear());
  $("#signBtn").addEventListener("click", handleSign);
  $("#printBtn").addEventListener("click", printContract);

  // Sticky CTA: hide while the quote summary or sign card is on screen
  const cta = $("#stickyCta");
  if ("IntersectionObserver" in window) {
    const visible = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? visible.add(en.target) : visible.delete(en.target)));
      cta.classList.toggle("hide", visible.size > 0);
    }, { threshold: 0.15 });
    [$("#quoteSummary"), $(".sign-card")].forEach((el) => io.observe(el));
  }
}

/* ----------------------------------------------------------
   INIT
   ---------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();
  $("#pickupDate").min = todayISO();
  // Image slots: hide any image that hasn't been dropped into assets/ yet, revealing the styled fallback
  $$("img[data-fallback]").forEach((img) => {
    const miss = () => img.classList.add("missing");
    img.addEventListener("error", miss, { once: true });
    if (img.complete && img.naturalWidth === 0) miss();
  });
  renderAddons();
  renderStaticRates();
  bindEvents();
  sig.init();
  renderQuote();
});
