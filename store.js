const KEY_DB = "conacrew.db.v2";
const KEY_USER = "conacrew.user.v2";


function phoneKey(v) {
  let p = String(v || "").replace(/[^\d]/g, "");
  if (p.startsWith("256")) p = "0" + p.slice(3);
  if (p.length === 9) p = "0" + p;
  return p;
}
function ensureDriverLogins(db) {
  if (!db.users) db.users = [];
  if (!db.drivers) db.drivers = [];
  db.drivers.forEach((d) => {
    let u = d.userId && db.users.find((x) => x.id === d.userId);
    if (!u) u = db.users.find((x) => x.role === "driver" && x.driverId === d.id);
    if (!u) {
      u = { id: "u-" + d.id, name: d.name, phone: d.phone || "", pin: "", role: "driver", driverId: d.id, active: true };
      db.users.push(u);
    }
    d.userId = u.id;
    u.driverId = d.id;
    if (u.role !== "driver") u.role = "driver";
  });
  return db;
}
const plateKey = (p) => String(p || "").replace(/\s+/g, "").toUpperCase();
// One-time setup of the current fleet: Paul drives UA 764AN, Meddy drives UA 687BH.
function ensureRoster(db) {
  if (db.rosterV1) return false;
  const pairs = [["Paul", "UA 764AN"], ["Meddy", "UA 687BH"]];
  pairs.forEach(([first, plate]) => {
    let d = db.drivers.find((x) => new RegExp("^\\s*" + first + "\\b", "i").test(x.name || ""));
    if (!d) {
      d = { id: "d-" + first.toLowerCase(), name: first, phone: "", licenceClass: "CM", licenceExpiry: "", assignedTruckId: "", advanceUgx: 0, payType: "trip", monthRateUgx: 0 };
      db.drivers.push(d);
    }
    let t = db.trucks.find((x) => plateKey(x.plate) === plateKey(plate));
    if (!t) {
      t = { id: "t-" + plateKey(plate).toLowerCase(), plate, model: "Sinotruk HOWO", year: 2021, odometerKm: 0, kmPerLitre: 2.9, hp: 370, status: "idle", nextServiceKm: 0, insuranceExpiry: "", roadLicenceExpiry: "", assignedDriverId: "" };
      db.trucks.push(t);
    }
    db.trucks.forEach((x) => { if (x.assignedDriverId === d.id && x.id !== t.id) x.assignedDriverId = ""; });
    d.assignedTruckId = t.id;
    t.assignedDriverId = d.id;
  });
  ensureDriverLogins(db);
  db.rosterV1 = 1;
  return true;
}
// ---- dates: every record keeps the date it happened (default today, never in the future) ----
function todayStr() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dayOf(body, key) {
  const v = String((body && body[key || "date"]) || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return todayStr();
  return v > todayStr() ? todayStr() : v;
}
// One load = one income line, whichever button recorded it
function recordJobIncome(db, job, amount, date, method, reference) {
  if (!amount) return null;
  // only what isn't in yet (a client may already have paid a deposit on the booking)
  const already = (db.cash || []).filter((c) => c.direction === "in" && (c.refId === job.id || c.jobId === job.id) && c.category !== "advance_return").reduce((s, c) => s + (Number(c.amountUgx) || 0), 0);
  const rest = amount - already;
  if (rest <= 0) return null;
  const c = (db.contractors || []).find((x) => x.id === job.contractorId);
  const row = { id: uid("k"), date: date || todayStr(), direction: "in", amountUgx: rest, tag: "trucking", category: "load_income", method: method || "invoice", reference: String(reference || "").slice(0, 60), note: "Load " + (job.code || job.id) + (job.cargo ? " · " + job.cargo : "") + (already ? " · balance" : ""), refId: job.id, jobId: job.id, truckId: job.truckId, payeeName: c ? c.name : "" };
  db.cash.unshift(row);
  return row;
}

// ---- sign-in security ----
const SESSION_HOURS = 24;
const MAX_TRIES = 5;
const isMainAdmin = (u) => !!u && u.role === "admin" && !u.assistant;
function deviceId() {
  let id = "";
  try { id = localStorage.getItem("conacrew.device") || ""; } catch (e) {}
  if (!id) {
    id = "dev-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    try { localStorage.setItem("conacrew.device", id); } catch (e) {}
  }
  return id;
}
function deviceLabel() {
  const ua = navigator.userAgent || "";
  const m = ua.match(/Android [\d.]+; ([^;)]+)/);
  const kind = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : m ? m[1].replace(/ Build.*/, "").trim() : /Android/.test(ua) ? "Android phone" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : /Linux|CrOS/.test(ua) ? "Computer" : "Phone";
  const br = /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : /Firefox/.test(ua) ? "Firefox" : "Browser";
  return kind + " · " + br;
}
function deviceOk(db, user, dev) {
  return (user.devices || []).some((d) => d.id === dev) || (db.trustedDevices || []).some((d) => d.id === dev);
}
function logSignIn(db, user, result, extra) {
  if (!db.loginLog) db.loginLog = [];
  db.loginLog.unshift({ at: new Date().toISOString(), userId: user ? user.id : "", name: user ? user.name : extra && extra.phone || "", result, device: deviceLabel(), deviceId: deviceId(), ...(extra || {}) });
  if (db.loginLog.length > 300) db.loginLog.length = 300;
}
// ---- phone storage: photos and voice notes are big; free space from old finished items if full ----
function stripMedia(db, olderThanDays) {
  const cut = new Date(Date.now() - olderThanDays * 864e5).toISOString().slice(0, 10);
  let n = 0;
  const strip = (o) => { if (!o) return; if (o.photos && Object.keys(o.photos).length) { o.photos = {}; n++; } if (o.voice) { o.voice = ""; n++; } if (o.photo) { o.photo = ""; n++; } o.mediaRemoved = true; };
  (db.fleetTasks || []).forEach((t) => { if (t.status === "closed" && String(t.closedAt || t.doneAt || "") < cut) { strip(t.reply); (t.history || []).forEach((h) => strip(h.reply)); } });
  (db.inspections || []).forEach((r) => { if (String(r.date || "") < cut) strip(r); });
  (db.issues || []).forEach((i) => { if (i.status !== "open" && String(i.date || i.createdAt || "") < cut) strip(i); });
  (db.disbursements || []).forEach((f) => { if (f.status === "closed" && String(f.closedAt || "") < cut) (f.usages || []).forEach(strip); });
  (db.fuelLogs || []).forEach((l) => { if (String(l.date || "") < cut) strip(l); });
  return n;
}
function storeBook(db) {
  const text = JSON.stringify(db);
  try { localStorage.setItem(KEY_DB, text); return db; } catch (e) {}
  for (const days of [60, 30, 14, 7, 0]) {
    if (!stripMedia(db, days)) continue;
    try { db.mediaTrimmedAt = new Date().toISOString(); localStorage.setItem(KEY_DB, JSON.stringify(db)); return db; } catch (e) {}
  }
  throw new Error("This phone's storage for Conacrew is full. Photos and voice notes from old finished items were removed but it is still full — ask the admin.");
}
const hasAdmin = (db) => !!(db && (db.users || []).some((u) => u.role === "admin"));
function pruneFleet(db) {
  ["users", "trucks", "drivers", "jobs", "jobsTrash", "fuelLogs", "fleetTasks", "inspections", "issues", "services", "disbursements", "contractors", "sellers", "mills", "caneBuys", "caneSales", "caneExpenses", "blocks", "farmWorks", "fruitSales", "cash", "payStubs", "notifications", "moneyRequests", "receivables", "harvests", "fieldLogs", "farmInputs", "docs", "bookings"].forEach((k) => {
    if (!db[k]) db[k] = [];
  });
  if (!db.blocks.length) {
    db.blocks = ["B1", "B2", "B3", "B4"].map((id) => ({ id, name: "Block " + id, acres: 0, status: "Producing" }));
  }
  ensureDriverLogins(db);
  return db;
}
function nextLoadCode(db, date, plate) {
  const day = date || todayStr();
  const md = day.slice(5, 7) + day.slice(8, 10);
  const mark = (String(plate || "").replace(/[^A-Za-z]/g, "").slice(-2) || "XX").toUpperCase();
  const prefix = mark + md + "_";
  const n = (db.jobs || []).filter((j) => String(j.code || "").startsWith(prefix)).length + 1;
  return prefix + String(n).padStart(2, "0");
}
function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 8);
}

function deep(v) {
  return JSON.parse(JSON.stringify(v));
}

function estimateFuel(distanceKm, kmPerLitre, dieselUgx) {
  const litres = kmPerLitre > 0 ? distanceKm / kmPerLitre : 0;
  return { litres: Math.round(litres * 10) / 10, fuelUgx: Math.round(litres * dieselUgx) };
}
const HOWO = { 370: { emptyL100: 16, loadedL100: 34 }, 420: { emptyL100: 17, loadedL100: 36 } };
function howoRates(hp) { return Number(hp) >= 400 ? HOWO[420] : HOWO[370]; }
function estimateTripFuel(deadKm, haulKm, hp, dieselUgx) {
  const km = (Number(deadKm) || 0) + (Number(haulKm) || 0);
  const litres = km > 0 ? km / 2.2 : 0;
  return { litres: Math.round(litres * 10) / 10, fuelUgx: Math.round(litres * (Number(dieselUgx) || 0)) };
}

function weekStart() {
  // Monday 00:00 of the current week
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

const PAY_FIELDS = ["payPlan", "tripAllowanceUgx", "monthRateUgx", "perTripUgx", "perSaleUgx", "perSalePct", "payMethod", "payPhone", "bankName", "bankAccount", "accountName"];
function payProfile(rec) {
  const out = {};
  PAY_FIELDS.forEach((k) => { if (rec && rec[k] !== undefined && rec[k] !== "") out[k] = rec[k]; });
  return out;
}
function publicUser(user) {
  return { id: user.id, name: user.name, phone: user.phone, role: user.role, driverId: user.driverId, active: user.active, hasPin: !!user.pin, assistant: !!user.assistant, ...payProfile(user) };
}
// Who was paid and how. Mobile money needs a number, bank needs an account.
const METHOD_NAMES = { cash: "Cash", mtn_momo: "MTN MoMo", airtel_money: "Airtel Money", bank: "Bank transfer", mobile_money: "Mobile money" };
function payeeFrom(body, required) {
  const p = {
    payeeName: String(body.payeeName || "").trim(),
    method: body.method || "cash",
    payeePhone: String(body.payeePhone || "").trim(),
    bankName: String(body.bankName || "").trim(),
    bankAccount: String(body.bankAccount || "").trim(),
    reference: String(body.reference || "").trim(),
  };
  if (required) {
    if (!p.payeeName) throw new Error("Enter the name of the person paid");
    if ((p.method === "mtn_momo" || p.method === "airtel_money") && !p.payeePhone) throw new Error("Enter the mobile money number");
    if (p.method === "bank" && (!p.bankName || !p.bankAccount)) throw new Error("Enter the bank and account number");
  }
  if (p.method !== "bank") { p.bankName = ""; p.bankAccount = ""; }
  if (p.method === "bank" || p.method === "cash") p.payeePhone = p.method === "cash" ? p.payeePhone : "";
  return p;
}
function weekStartOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function homeFor(role) {
  return {
    admin: "app.html#home",
    driver: "app.html#drive",
    cane_manager: "app.html#cane",
    passion_manager: "app.html#passion",
  }[role];
}

function adminKpis(db) {
  const start = weekStart();
  const cashWeek = db.cash
    .filter((c) => new Date(c.date) >= start)
    .reduce((s, c) => s + (c.direction === "in" ? c.amountUgx : -c.amountUgx), 0);
  const tasks = db.fleetTasks || [];
  return {
    cashWeek,
    onRoad: db.trucks.filter((t) => t.status === "on_trip").length,
    idle: db.trucks.filter((t) => t.status === "idle").length,
    workshop: db.trucks.filter((t) => t.status === "workshop").length,
    openTasks: tasks.filter((t) => !["done", "cancelled"].includes(t.status)).length,
    incomingReports: (db.issues || []).filter((i) => i.status === "open" || i.status === "replied").length,
    bought: db.caneBuys
      .filter((b) => !["settled", "seller_paid"].includes(b.status))
      .reduce((s, b) => s + b.expectedTonnes, 0),
    harvestKg: db.harvests.filter((h) => new Date(h.date) >= start).reduce((s, h) => s + h.kg, 0),
  };
}

function caneKpis(db) {
  return {
    bought: db.caneBuys.reduce((s, b) => s + (b.millTonnes || b.expectedTonnes), 0),
    sold: db.caneBuys.reduce((s, b) => s + (b.millTonnes || 0), 0),
    oweSellers: db.caneBuys.filter((b) => !b.sellerPaid).reduce((s, b) => s + b.buyPriceUgx, 0),
    millOwes: db.caneBuys.filter((b) => b.millSaleUgx && !b.millPaid).reduce((s, b) => s + (b.millSaleUgx || 0), 0),
    moving: db.caneBuys.filter((b) => ["cutting", "loading", "in_transit"].includes(b.status)).length,
  };
}

function farmWorksOf(db) {
  return db.farmWorks || [];
}
function harvestedKg(db) {
  const works = farmWorksOf(db);
  if (works.length) return works.filter((w) => w.kind === "harvest").reduce((s, w) => s + (Number(w.kg) || 0), 0);
  return (db.harvests || []).reduce((s, h) => s + (Number(h.kg) || 0), 0);
}
function soldKg(db) {
  return (db.fruitSales || []).reduce((s, x) => s + (Number(x.kg) || 0), 0);
}
function fruitStock(db) {
  return Math.max(0, harvestedKg(db) - soldKg(db));
}
function workCost(db) {
  return farmWorksOf(db).reduce((s, w) => s + (Number(w.costUgx) || 0), 0);
}
function passionKpis(db) {
  const start = weekStart();
  const works = farmWorksOf(db);
  return {
    stockKg: fruitStock(db),
    harvestedKg: harvestedKg(db),
    soldKg: soldKg(db),
    weekKg: works.filter((w) => w.kind === "harvest" && new Date(w.date) >= start).reduce((s, w) => s + (Number(w.kg) || 0), 0),
    weekSales: (db.fruitSales || []).filter((h) => new Date(h.date) >= start).reduce((s, h) => s + (h.amountUgx || 0), 0),
    workCost: workCost(db),
  };
}

function buildAlerts(db) {
  const alerts = [];
  const dueBy = daysFromToday(30); // warn 30 days ahead
  for (const t of db.trucks) {
    if (t.odometerKm >= t.nextServiceKm - 4000) {
      alerts.push({ id: "svc-" + t.id, tone: "warn", text: t.plate + " is near service", href: "#trucks" });
    }
  }
  for (const b of db.caneBuys) {
    if (["cutting", "loading"].includes(b.status)) {
      alerts.push({
        id: "cane-" + b.id,
        tone: "bad",
        text: "Cane " + b.id.toUpperCase() + " must move within 24 hours",
        href: "#cane/" + b.id,
      });
    }
  }
  const mites = db.fieldLogs.find((f) => f.tag === "mites");
  if (mites) alerts.push({ id: "mites", tone: "warn", text: mites.blockId + " has a mite note", href: "#passion" });
  for (const t of db.trucks) {
    if (t.insuranceExpiry && t.insuranceExpiry <= dueBy) {
      alerts.push({ id: "ins-" + t.id, tone: "warn", text: t.plate + " insurance due " + t.insuranceExpiry, href: "#trucks" });
    }
    if (t.roadLicenceExpiry && t.roadLicenceExpiry <= dueBy) {
      alerts.push({ id: "lic-" + t.id, tone: "bad", text: t.plate + " road licence due " + t.roadLicenceExpiry, href: "#trucks" });
    }
  }
  for (const task of (db.fleetTasks || []).filter((x) => !["done", "cancelled"].includes(x.status))) {
    const truck = db.trucks.find((t) => t.id === task.truckId);
    alerts.push({
      id: "task-" + task.id,
      tone: task.priority === "urgent" ? "bad" : "warn",
      text: (truck?.plate || "Truck") + ": " + task.title,
      href: "#trucks",
    });
  }
  const soon = todayStr().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  (db.docs || []).filter((x) => x.expiry && x.expiry <= in30).forEach((x) => {
    alerts.push({ id: "doc-" + x.id, tone: x.expiry < soon ? "bad" : "warn", text: x.title + (x.expiry < soon ? " expired " : " expires ") + x.expiry, href: { trucking: "#trucks-docs", sugarcane: "#cane-docs", passion: "#passion-docs" }[x.tag] });
  });
  return alerts.slice(0, 12);
}

function statement(db) {
  const books = {};
  for (const tag of ["trucking", "sugarcane", "passion", "overhead"]) {
    books[tag] = { in: 0, out: 0, profit: 0 };
  }
  for (const c of db.cash || []) {
    const tag = books[c.tag] ? c.tag : "overhead";
    if (c.direction === "in") books[tag].in += c.amountUgx || 0;
    else books[tag].out += c.amountUgx || 0;
  }
  for (const tag of Object.keys(books)) books[tag].profit = books[tag].in - books[tag].out;
  const owed = (db.receivables || []).filter((r) => r.status === "open").reduce((s, r) => s + (r.amountUgx || 0), 0);
  const inAll = Object.values(books).reduce((s, b) => s + b.in, 0);
  const outAll = Object.values(books).reduce((s, b) => s + b.out, 0);
  return { books, inAll, outAll, profit: inAll - outAll, owed };
}

function scopedDb(db, user) {
  if (user.role === "admin") {
    return {
      role: user.role,
      me: publicUser(user),
      users: (db.users || []).map((u) => (user.assistant ? publicUser(u) : { ...publicUser(u), pinLen: String(u.pin || "").length, devices: u.devices || [], pendingDevices: u.pendingDevices || [], locked: !!u.lockedAt, failCount: u.failCount || 0 })),
      loginLog: user.assistant ? [] : (db.loginLog || []).slice(0, 60),
      trustedDevices: user.assistant ? [] : db.trustedDevices || [],
      docs: db.docs || [],
      bookings: db.bookings || [],
      payInfo: db.payInfo || null,
      dieselDefaultUgx: db.dieselDefaultUgx,
      trucks: db.trucks,
      drivers: db.drivers,
      contractors: db.contractors,
      jobs: db.jobs,
      jobsTrash: db.jobsTrash || [],
      inspections: db.inspections || [],
      payStubs: db.payStubs || [],
      cargoTypes: db.cargoTypes || [],
      fuelLogs: db.fuelLogs,
      sellers: db.sellers,
      mills: db.mills,
      caneBuys: db.caneBuys,
      blocks: db.blocks,
      fieldLogs: db.fieldLogs,
      harvests: db.harvests,
      fruitSales: db.fruitSales,
      farmInputs: db.farmInputs,
      farmWorks: db.farmWorks || [],
      stockKg: fruitStock(db),
      cash: db.cash,
      receivables: db.receivables || [],
      disbursements: db.disbursements || [],
      caneSales: db.caneSales || [],
      caneExpenses: db.caneExpenses || [],
      moneyRequests: db.moneyRequests || [],
      statement: statement(db),
      fleetTasks: db.fleetTasks || [],
      issues: db.issues || [],
      services: db.services || [],
      notifications: db.notifications || [],
      alerts: buildAlerts(db),
      kpis: adminKpis(db),
    };
  }
  if (user.role === "driver") {
    if (!user.driverId) throw new Error("No access");
    const myId = user.driverId;
    const jobs = db.jobs.filter((j) => j.driverId === myId);
    const myDriver = db.drivers.find((d) => d.id === myId);
    if (!myDriver || myDriver.userId !== user.id) throw new Error("No access");
    const rawTruck = db.trucks.find((t) => t.id === myDriver.assignedTruckId) || null;
    const truck = rawTruck
      ? {
          id: rawTruck.id,
          plate: rawTruck.plate,
          model: rawTruck.model,
          odometerKm: rawTruck.odometerKm,
          kmPerLitre: rawTruck.kmPerLitre,
          hp: rawTruck.hp || 370,
          status: rawTruck.status,
        }
      : null;
    return {
      role: user.role,
      me: publicUser(user),
      driver: {
        id: myDriver.id,
        name: myDriver.name,
        phone: myDriver.phone,
        licenceClass: myDriver.licenceClass,
        licenceExpiry: myDriver.licenceExpiry,
        assignedTruckId: myDriver.assignedTruckId,
        advanceUgx: myDriver.advanceUgx,
        payType: myDriver.payType || "trip",
        monthRateUgx: myDriver.monthRateUgx || 0,
        ...payProfile(myDriver),
      },
      truck,
      jobs,
      fuelLogs: db.fuelLogs.filter((f) => f.driverId === myId),
      contractors: (db.contractors || []).map((c) => ({ id: c.id, name: c.name, phone: c.phone || "" })),
      cargoTypes: db.cargoTypes || [],
      dieselDefaultUgx: db.dieselDefaultUgx,
      inspections: (db.inspections || []).filter((x) => x.driverId === myId),
      fleetTasks: (db.fleetTasks || []).filter((t) => t.driverId === myId),
      issues: (db.issues || []).filter((i) => i.driverId === myId),
      notifications: (db.notifications || []).filter((n) => n.toDriverId === myId && n.status !== "cleared"),
      disbursements: (db.disbursements || []).filter((x) => x.toDriverId === myId),
      moneyRequests: (db.moneyRequests || []).filter((r) => r.driverId === myId),
      payStubs: (db.payStubs || []).filter((x) => x.personId === myId),
      docs: (db.docs || []).filter((x) => x.byId === user.id || (truck && x.truckId === truck.id && ["licence", "truck_papers"].includes(x.type))),
    };
  }
  if (user.role === "cane_manager") {
    return {
      role: user.role,
      me: publicUser(user),
      dieselDefaultUgx: db.dieselDefaultUgx,
      sellers: db.sellers,
      mills: db.mills,
      caneBuys: db.caneBuys,
      caneSales: db.caneSales || [],
      caneExpenses: db.caneExpenses || [],
      moneyRequests: (db.moneyRequests || []).filter((r) => r.tag === "sugarcane" && (!r.userId || r.userId === user.id)),
      disbursements: (db.disbursements || []).filter((x) => x.tag === "sugarcane" && x.toUserId === user.id),
      docs: (db.docs || []).filter((x) => x.tag === "sugarcane"),
      jobs: [],
      kpis: caneKpis(db),
      payStubs: (db.payStubs || []).filter((x) => x.role === "cane_manager"),
    };
  }
  return {
    role: user.role,
    me: publicUser(user),
    blocks: db.blocks,
    fieldLogs: db.fieldLogs,
    harvests: db.harvests,
    fruitSales: db.fruitSales,
    farmInputs: db.farmInputs,
    farmWorks: db.farmWorks || [],
    stockKg: fruitStock(db),
    kpis: passionKpis(db),
    payStubs: (db.payStubs || []).filter((x) => x.role === "passion_manager"),
    moneyRequests: (db.moneyRequests || []).filter((r) => r.tag === "passion" && r.userId === user.id),
    disbursements: (db.disbursements || []).filter((x) => x.tag === "passion" && x.toUserId === user.id),
    docs: (db.docs || []).filter((x) => x.tag === "passion"),
    jobs: [],
  };
}

function roleAllowedAction(role, action) {
  const map = {
    admin: ["quote_booking", "decline_booking", "note_booking", "booking_payment", "trash_booking", "restore_booking", "purge_booking", "seen_doc", "save_payinfo", "trust_device", "untrust_device", "save_doc", "delete_doc", "review_fleet_task", "approve_device", "reject_device", "remove_device", "unlock_login", "finalize_request", "close_advance", "decline_advance", "save_login", "pay_worker", "save_pay_profile", "pay_stub", "create_job", "update_job", "add_contractor", "save_truck", "save_driver", "mark_job_paid", "log_scale", "log_invoice", "add_cargo_type", "trash_job", "restore_job", "purge_job", "log_fuel", "create_cane_buy", "update_cane_buy", "record_mill", "pay_seller", "create_cane_sale", "log_cane_expense", "request_money", "decide_request", "log_harvest", "add_field_log", "log_farm_work", "create_fruit_sale", "record_sale_pay", "record_sale_expense", "add_cash", "record_receipt", "send_float", "create_fleet_task", "update_fleet_task", "log_service", "report_issue", "reply_issue"],
    driver: ["read_note", "save_doc", "delete_doc", "request_advance", "submit_inspect", "request_pay", "update_job", "log_fuel", "ack_fleet_task", "complete_fleet_task", "report_issue", "ack_float", "log_float_use", "log_trip_result", "create_job", "add_contractor", "mark_job_paid", "log_scale", "log_invoice", "add_cargo_type", "trash_job"],
    cane_manager: ["save_doc", "delete_doc", "request_advance", "ack_float", "log_float_use", "log_direct_spend", "request_pay", "create_cane_buy", "update_cane_buy", "record_mill", "pay_seller", "create_cane_sale", "log_cane_expense", "request_money"],
    passion_manager: ["save_doc", "delete_doc", "request_advance", "ack_float", "log_float_use", "log_direct_spend", "request_pay", "log_harvest", "add_field_log", "log_farm_work", "create_fruit_sale", "record_sale_pay", "record_sale_expense"],
  };
  return (map[role] || []).includes(action);
}

const TAG_OF_ROLE = { driver: "trucking", cane_manager: "sugarcane", passion_manager: "passion" };
function ownsFloat(fl, user) {
  if (user.role === "admin") return true;
  if (user.role === "driver") return fl.toDriverId === user.driverId;
  return fl.toUserId === user.id && fl.tag === TAG_OF_ROLE[user.role];
}
// Manager spending: from an advance (breakdown only) or from cash on hand such as sale money (counted as money out).
function spendFromAdvanceOrCash(db, user, body, tag, refs) {
  if (body.floatId) {
    const fl = (db.disbursements || []).find((x) => x.id === body.floatId);
    if (!fl || !ownsFloat(fl, user)) throw new Error("Advance not found");
    return { use: addFloatUse(db, fl, body, user) };
  }
  const amount = Number(body.amountUgx) || 0;
  if (amount <= 0) throw new Error("Enter the amount");
  const payee = payeeFrom({ ...body, method: body.method || "cash" }, !!body.payeeName || user.role !== "admin");
  const row = { id: uid("k"), date: dayOf(body), direction: "out", amountUgx: amount, tag, category: body.category || "other", note: String(body.note || "").trim(), source: user.role === "admin" ? "office" : "cash_on_hand", by: user.name, ...payee, ...(refs || {}) };
  db.cash.unshift(row);
  return { cash: row };
}

// Spending recorded against an advance. It explains where the advance went; the money
// already left the business when the advance was sent, so no new cash line is added.
function addFloatUse(db, fl, body, user) {
  if (fl.status === "sent") throw new Error("Confirm you received this advance first");
  if (fl.status === "closed") throw new Error("This advance is closed");
  const amount = Number(body.amountUgx) || 0;
  if (amount <= 0) throw new Error("Enter the amount spent");
  const usedSoFar = (fl.usages || []).reduce((t, u) => t + (u.amountUgx || 0), 0);
  const left = fl.amountUgx - usedSoFar;
  if (amount > left + 0.5) throw new Error("Only UGX " + left.toLocaleString("en-UG") + " left on this advance");
  const payee = payeeFrom({ ...body, method: body.method || "cash" }, true);
  const use = {
    id: uid("fu"), amountUgx: amount, category: body.category || "other",
    note: String(body.note || "").trim(), date: dayOf(body),
    photo: body.photo || "", litres: Number(body.litres) || 0, ...payee,
  };
  fl.usages = fl.usages || [];
  fl.usages.unshift(use);
  fl.status = usedSoFar + amount >= fl.amountUgx ? "spent" : "received";
  if (use.category === "diesel" && use.litres > 0) {
    db.fuelLogs.unshift({ id: uid("f"), truckId: fl.truckId, driverId: fl.toDriverId, litres: use.litres, amountUgx: amount, odometerKm: Number(body.odometerKm) || 0, station: payee.payeeName, date: use.date, floatId: fl.id });
    const truck = db.trucks.find((t) => t.id === fl.truckId);
    if (truck && Number(body.odometerKm) > (truck.odometerKm || 0)) truck.odometerKm = Number(body.odometerKm);
  }
  return use;
}

function applyAction(db, user, body) {
  const action = body.action;
  if (!roleAllowedAction(user.role, action)) throw new Error("No access");
  if (!db.fleetTasks) db.fleetTasks = [];
  if (!db.notifications) db.notifications = [];
  if (!db.issues) db.issues = [];
  if (!db.services) db.services = [];

  if (user.role === "driver") {
    if (!user.driverId) throw new Error("No access");
    const mine = db.drivers.find((d) => d.id === user.driverId && d.userId === user.id);
    if (!mine) throw new Error("No access");
    if (action === "update_job" || action === "mark_job_paid" || action === "log_trip_result" || action === "log_scale" || action === "log_invoice") {
      const job = db.jobs.find((j) => j.id === body.id);
      if (!job || job.driverId !== user.driverId) throw new Error("No access");
    }
    if (action === "save_doc") {
      body.truckId = mine.assignedTruckId || "";
      if (body.jobId && !db.jobs.some((j) => j.id === body.jobId && j.driverId === user.driverId)) body.jobId = "";
    }
    if (action === "ack_fleet_task" || action === "complete_fleet_task") {
      const task = db.fleetTasks.find((t) => t.id === body.id);
      if (!task || task.driverId !== user.driverId) throw new Error("No access");
    }
    if (action === "log_fuel" || action === "report_issue") {
      if (body.truckId && body.truckId !== mine.assignedTruckId) throw new Error("No access");
    }
    if (action === "ack_float" || action === "log_float_use") {
      const fl = (db.disbursements || []).find((x) => x.id === body.id);
      if (!fl || fl.toDriverId !== user.driverId) throw new Error("No access");
    }
    if (action === "create_job") {
      body.driverId = user.driverId;
      body.truckId = mine.assignedTruckId || body.truckId;
    }
    if (action === "trash_job") {
      const job = db.jobs.find((j) => j.id === body.id);
      if (!job || job.driverId !== user.driverId) throw new Error("No access");
      if (job.paid || job.incomeUgx) throw new Error("Paid load stays. Ask the admin.");
      if (job.fromOffice || job.bookingId || job.source !== "driver") throw new Error("Loads from the office stay. Ask the office to remove it.");
    }
    if (body.driverId && body.driverId !== user.driverId) throw new Error("No access");
  }

  if (action === "save_payinfo") {
    if (!isMainAdmin(user)) throw new Error("Only the main admin can change payment details");
    const t = (v, n) => String(v || "").trim().slice(0, n || 80);
    db.payInfo = { airtel: { number: t(body.airtelNumber, 20), name: t(body.airtelName) }, bank: { bank: t(body.bankName), name: t(body.bankAccountName), account: t(body.bankAccount, 30), code: t(body.bankCode, 20) } };
  }
  // a closed booking that never became a load can go to the trash; restore or delete it from there
  if (action === "trash_booking" || action === "restore_booking" || action === "purge_booking") {
    const bk = (db.bookings || []).find((x) => x.id === body.id);
    if (!bk) throw new Error("Booking not found");
    if (bk.jobId || !["declined", "client_declined"].includes(bk.status)) throw new Error("Only closed bookings without a load can be removed");
    if (action === "trash_booking") bk.trashed = { at: todayStr(), by: user.name };
    if (action === "restore_booking") delete bk.trashed;
    if (action === "purge_booking") { if (!bk.trashed) throw new Error("Move it to trash first"); db.bookings = db.bookings.filter((x) => x.id !== bk.id); }
    if (action !== "purge_booking") bk.updatedAt = new Date().toISOString();
  }
  if (action === "booking_payment") {
    const bk = (db.bookings || []).find((x) => x.id === body.id);
    if (!bk) throw new Error("Booking not found");
    const at = new Date().toISOString();
    const c = bk.client || {};
    const job = bk.jobId ? db.jobs.find((j) => j.id === bk.jobId) : null;
    const cashIn = (amt, what, method, ref) => { db.cash.unshift({ id: uid("k"), date: todayStr(), direction: "in", amountUgx: amt, tag: "trucking", category: "load_income", method: method || "cash", reference: ref || "", note: "Booking " + bk.ref + " · " + what, refId: job ? job.id : bk.id, bookingId: bk.id, jobId: job ? job.id : "", truckId: job ? job.truckId : "", payeeName: c.company || c.name || "", by: user.name }); };
    bk.history = bk.history || [];
    const p = bk.payment;
    if (body.kind === "confirm") {
      if (!p || p.status !== "checking") throw new Error("No payment to confirm");
      p.status = "received"; p.receivedAt = at; p.receivedBy = user.name;
      bk.status = job ? "confirmed" : "accepted";
      cashIn(p.due, p.plan === "full" ? "paid 100% (5% off)" : "75% deposit", p.method === "bank" ? "bank" : "airtel_money", p.txn);
      bk.history.push({ at, what: "Payment received · UGX " + p.due.toLocaleString("en-UG"), by: user.name });
    } else if (body.kind === "reject") {
      if (!p || p.status !== "checking") throw new Error("No payment to check");
      p.status = "rejected"; p.note = String(body.note || "We couldn't find this payment.").trim().slice(0, 200);
      bk.status = "quoted";
      bk.history.push({ at, what: "Payment not found · " + p.note, by: user.name });
    } else if (body.kind === "account") {
      if (!bk.quote) throw new Error("Save a quote first");
      bk.payment = { plan: "account", total: bk.quote.amountUgx, due: 0, balance: bk.quote.amountUgx, status: "account", at, by: user.name };
      bk.status = job ? "confirmed" : "accepted";
      bk.history.push({ at, what: "Booked without payment (pays on delivery)", by: user.name });
    } else if (body.kind === "balance") {
      if (!p || !p.balance || p.balancePaidAt) throw new Error("No balance waiting");
      p.balancePaidAt = at;
      cashIn(p.balance, p.plan === "account" ? "paid on delivery" : "balance on delivery", body.method || "cash", body.reference || "");
      if (job) { job.paid = true; job.status = "paid"; job.paidAt = todayStr(); job.paidUgx = p.total; }
      bk.history.push({ at, what: "Balance received · UGX " + p.balance.toLocaleString("en-UG"), by: user.name });
    } else throw new Error("Unknown");
    bk.updatedAt = at;
  }
  if (action === "quote_booking" || action === "decline_booking" || action === "note_booking") {
    const bk = (db.bookings || []).find((x) => x.id === body.id);
    if (!bk) throw new Error("Booking not found");
    const at = new Date().toISOString();
    bk.history = bk.history || [];
    if (action === "quote_booking") {
      const amt = Number(body.amountUgx) || 0;
      if (amt <= 0) throw new Error("Enter the quote amount");
      const days = Math.max(1, Math.min(30, Number(body.validDays) || 3));
      bk.quote = { amountUgx: amt, note: String(body.note || "").trim().slice(0, 300), at, by: user.name, validUntil: new Date(Date.now() + days * 864e5).toISOString().slice(0, 10) };
      bk.status = "quoted";
      bk.clientAnswer = null;
      bk.history.push({ at, what: "Quote sent · UGX " + amt.toLocaleString("en-UG"), by: user.name });
    } else if (action === "decline_booking") {
      bk.status = "declined";
      bk.declineNote = String(body.note || "").trim().slice(0, 300);
      bk.history.push({ at, what: "Declined" + (bk.declineNote ? " · " + bk.declineNote : ""), by: user.name });
    } else {
      bk.history.push({ at, what: String(body.note || "Contacted client").trim().slice(0, 200), by: user.name });
      if (bk.status === "new") bk.status = "seen";
    }
    bk.updatedAt = at;
  }
  if (action === "save_truck") {
    if (!db.trucks) db.trucks = [];
    const plate = String(body.plate || "").trim().toUpperCase().replace(/\s+/g, " ");
    let t = body.id ? db.trucks.find((x) => x.id === body.id) : null;
    if (plate && db.trucks.some((x) => x.id !== (t && t.id) && plateKey(x.plate) === plateKey(plate))) throw new Error("A truck with plate " + plate + " is already saved");
    const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : "");
    if (!t) {
      if (!plate) throw new Error("Enter the number plate");
      t = { id: uid("t"), plate, model: "Sinotruk HOWO 8×4", year: 2021, odometerKm: 0, kmPerLitre: 2.9, hp: 370, status: "idle", nextServiceKm: 0, insuranceExpiry: "", roadLicenceExpiry: "", assignedDriverId: "" };
      db.trucks.push(t);
    } else if (plate) t.plate = plate;
    if (body.model) t.model = String(body.model).trim().slice(0, 60);
    if (body.hp) t.hp = Number(body.hp) >= 400 ? 420 : 370;
    if (body.year) t.year = Number(body.year) || t.year;
    if (body.odometerKm !== undefined && body.odometerKm !== "") t.odometerKm = Number(body.odometerKm) || 0;
    if (body.nextServiceKm !== undefined && body.nextServiceKm !== "") t.nextServiceKm = Number(body.nextServiceKm) || 0;
    if (body.insuranceExpiry !== undefined) t.insuranceExpiry = day(body.insuranceExpiry);
    if (body.roadLicenceExpiry !== undefined) t.roadLicenceExpiry = day(body.roadLicenceExpiry);
    if (body.status && ["idle", "workshop", "parked"].includes(body.status)) t.status = body.status;
    if (body.assignedDriverId !== undefined) {
      t.assignedDriverId = body.assignedDriverId || "";
      (db.trucks || []).forEach((x) => { if (x.id !== t.id && t.assignedDriverId && x.assignedDriverId === t.assignedDriverId) x.assignedDriverId = ""; });
      db.drivers.forEach((d) => {
        if (d.id === t.assignedDriverId) d.assignedTruckId = t.id;
        else if (d.assignedTruckId === t.id) d.assignedTruckId = "";
      });
    }
  }
  if (action === "save_driver") {
    if (!db.drivers) db.drivers = [];
    let d = body.id ? db.drivers.find((x) => x.id === body.id) : null;
    if (!d) throw new Error("Add new drivers on the Team page, so they get a login and PIN");
    {
      d.name = body.name || d.name;
      if (body.phone) d.phone = body.phone;
      if (body.licenseId) d.licenseId = body.licenseId;
      if (body.licensePhoto) d.licensePhoto = body.licensePhoto;
      if (body.licenceExpiry !== undefined) d.licenceExpiry = /^\d{4}-\d{2}-\d{2}$/.test(String(body.licenceExpiry || "")) ? body.licenceExpiry : "";
      if (body.assignedTruckId !== undefined) {
        const before = d.assignedTruckId;
        d.assignedTruckId = body.assignedTruckId || "";
        (db.trucks || []).forEach((t) => { if (t.id === before && t.id !== d.assignedTruckId && t.assignedDriverId === d.id) t.assignedDriverId = ""; });
        if (d.assignedTruckId) db.drivers.forEach((x) => { if (x.id !== d.id && x.assignedTruckId === d.assignedTruckId) x.assignedTruckId = ""; });
      }
      const u = db.users.find((x) => x.id === d.userId);
      if (u) { u.name = d.name; if (body.phone) u.phone = body.phone; }
    }
    if (d.assignedTruckId) {
      const t = db.trucks.find((x) => x.id === d.assignedTruckId);
      if (t) t.assignedDriverId = d.id;
    }
  }

  if (action === "add_contractor") {
    if (!db.contractors) db.contractors = [];
    const name = (body.name || body.contractorName || "").trim();
    if (!name) throw new Error("Contractor name needed");
    let c = db.contractors.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!c) {
      c = { id: uid("co"), name, phone: body.phone || body.contractorPhone || "", note: body.note || "" };
      db.contractors.unshift(c);
    } else {
      if (body.phone || body.contractorPhone) c.phone = body.phone || body.contractorPhone;
    }
    return;
  }

  if (action === "create_job" && body.bookingId && user.role === "admin") {
    // a load from a client booking keeps what the client gave and the agreed price
    const bk = (db.bookings || []).find((x) => x.id === body.bookingId);
    if (!bk) throw new Error("Booking not found");
    if (bk.jobId) throw new Error("This booking already has a load");
    const c = bk.client || {};
    if (!db.contractors) db.contractors = [];
    const digits = (p) => { let d = String(p || "").replace(/\D/g, ""); if (/^0\d{9}$/.test(d)) d = "256" + d.slice(1); else if (/^\d{9}$/.test(d)) d = "256" + d; return d; };
    let co = db.contractors.find((x) => x.phone && digits(x.phone) === digits(c.phone));
    if (!co) { co = { id: uid("co"), name: c.company || c.name, phone: c.phone || "", note: "From booking " + bk.ref }; db.contractors.unshift(co); }
    Object.assign(body, {
      contractorId: co.id, contractorName: "", cargo: bk.cargo, cargoOther: "",
      origin: bk.pickup.name || "Pickup", destination: bk.drop.name || "Drop-off", km: bk.km, kmHaul: bk.km,
      rateUgx: bk.payment && bk.payment.total ? bk.payment.total : bk.quote ? bk.quote.amountUgx : 0,
      notes: [Number(bk.trips) > 1 ? bk.trips + " trips" : "", bk.tonnes ? bk.tonnes + " t per trip" : "", bk.notes || ""].filter(Boolean).join(" · "),
      startDate: bk.date || body.startDate,
    });
  }
  if (action === "create_job") {
    if (!db.contractors) db.contractors = [];
    let contractorId = body.contractorId && body.contractorId !== "new" ? body.contractorId : "";
    const newName = body.contractorId === "new" ? (body.contractorName || "").trim() : "";
    if (newName) {
      let c = db.contractors.find((x) => x.name.toLowerCase() === newName.toLowerCase());
      if (!c) {
        c = { id: uid("co"), name: newName, phone: body.contractorPhone || "", note: "" };
        db.contractors.unshift(c);
      } else if (body.contractorPhone) c.phone = body.contractorPhone;
      contractorId = c.id;
    }
    if (body.cargo === "Other" && (body.cargoOther || "").trim()) {
      if (!db.cargoTypes) db.cargoTypes = [];
      const name = body.cargoOther.trim();
      if (!db.cargoTypes.some((x) => x.toLowerCase() === name.toLowerCase())) db.cargoTypes.unshift(name);
    }
    const startDate = body.startDate || todayStr();
    let truckId = body.truckId || "";
    let driverId = body.driverId || "";
    if (user.role === "driver") {
      driverId = user.driverId;
      const mine = db.drivers.find((d) => d.id === driverId);
      if (!truckId && mine) truckId = mine.assignedTruckId || "";
    }
    const truck = db.trucks.find((t) => t.id === truckId);
    const loadCode = nextLoadCode(db, startDate, truck ? truck.plate : "");
    db.jobs.unshift({
      id: uid("j"),
      code: loadCode,
      contractorId,
      cargo: (body.cargo === "Other" ? (body.cargoOther || "Other") : body.cargo) || body.cargo,
      origin: body.origin,
      destination: body.destination,
      pickupAt: body.pickupAt || "",
      dropAt: body.dropAt || "",
      km: Number(body.km) || 0,
      hoursEst: Number(body.hoursEst) || (Number(body.km) ? Math.round((Number(body.km) / 50) * 10) / 10 : 0),
      rateUgx: Number(body.rateUgx) || 0,
      payBasis: body.payBasis === "tonne" ? "tonne" : "trip",
      payPerTonne: Number(body.payPerTonne) || 0,
      driverId,
      truckId,
      status: "booked",
      paid: false,
      startDate,
      notes: body.notes || "",
      loggedBy: user.name,
      source: user.role === "driver" ? "driver" : "admin",
      tonnesDelivered: Number(body.tonnes) || 0,
      fuelLitres: Number(body.fuelLitres) || 0,
      fuelCostUgx: Number(body.fuelCostUgx) || 0,
      dieselUgxPerLitre: Number(body.dieselUgxPerLitre) || db.dieselDefaultUgx || 0,
      kmToPickup: Number(body.kmToPickup) || 0,
      kmHaul: Number(body.kmHaul) || 0,
    });
    const job0 = db.jobs[0];
    if (body.bookingId && user.role === "admin") {
      const bk = (db.bookings || []).find((x) => x.id === body.bookingId);
      if (bk) {
        job0.bookingId = bk.id; job0.bookingRef = bk.ref; job0.fromOffice = true;
        job0.pickupPin = { lat: bk.pickup.lat, lng: bk.pickup.lng }; job0.dropPin = { lat: bk.drop.lat, lng: bk.drop.lng };

        bk.status = "confirmed"; bk.jobId = job0.id; bk.updatedAt = new Date().toISOString();
        if (bk.payment && bk.payment.total) job0.rateUgx = bk.payment.total; // 100% paid gets the 5% off
        (db.cash || []).forEach((c) => { if (c.bookingId === bk.id) { c.jobId = job0.id; c.truckId = job0.truckId; } });
        if (bk.payment && bk.payment.status === "received" && !bk.payment.balance) job0.prepaid = true; // marked paid once delivered
        (bk.history = bk.history || []).push({ at: bk.updatedAt, what: "Load " + job0.code + " created", by: user.name });
      }
    }
    if (user.role === "admin") job0.fromOffice = true;
    if (job0 && job0.km && !job0.fuelLitres) {
      const truck = db.trucks.find((t) => t.id === job0.truckId) || {};
      const diesel = job0.dieselUgxPerLitre || db.dieselDefaultUgx;
      const dead = job0.kmToPickup || 0;
      const haul = job0.kmHaul || job0.km || 0;
      const f = estimateTripFuel(dead, haul, truck.hp || 370, diesel);
      job0.fuelLitres = f.litres;
      job0.fuelCostUgx = f.fuelUgx;
    }
    if (user.role === "driver") {
      db.notifications.unshift({
        id: uid("n"),
        toRole: "admin",
        type: "load",
        title: "New load",
        body: user.name + " · " + (body.cargo || "Load"),
        status: "unread",
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (action === "trash_job") {
    if (!db.jobsTrash) db.jobsTrash = [];
    const i = db.jobs.findIndex((j) => j.id === body.id);
    if (i < 0) throw new Error("Load not found");
    const job = db.jobs[i];
    if (user.role === "driver" && (job.paid || job.incomeUgx || job.status === "paid")) {
      throw new Error("Paid load stays. Ask the admin.");
    }
    db.jobs.splice(i, 1);
    db.jobsTrash.unshift({ ...job, deletedAt: todayStr(), deletedBy: user.name });
  }

  if (action === "restore_job") {
    if (!db.jobsTrash) db.jobsTrash = [];
    const i = db.jobsTrash.findIndex((j) => j.id === body.id);
    if (i < 0) throw new Error("Not in trash");
    const job = db.jobsTrash[i];
    db.jobsTrash.splice(i, 1);
    delete job.deletedAt;
    delete job.deletedBy;
    db.jobs.unshift(job);
  }

  if (action === "purge_job") {
    if (!db.jobsTrash) db.jobsTrash = [];
    db.jobsTrash = db.jobsTrash.filter((j) => j.id !== body.id);
  }


  if (action === "request_pay") {
    if (!db.payStubs) db.payStubs = [];
    const year = new Date().getFullYear();
    let stub = {
      id: uid("ps"),
      role: user.role,
      personId: user.driverId || user.id,
      personName: user.name,
      kind: body.kind || "trip",
      refId: body.refId || "",
      refLabel: body.refLabel || "",
      amountUgx: Number(body.amountUgx) || 0,
      status: "pending",
      requestedAt: todayStr(),
      paidAt: "",
      year,
    };
    if (user.role === "driver") {
      stub.personId = user.driverId;
      const job = db.jobs.find((j) => j.id === body.refId);
      if (!job || job.driverId !== user.driverId) throw new Error("Load not found");
      if (db.payStubs.some((x) => x.refId === job.id && x.personId === user.driverId && x.status !== "rejected")) throw new Error("Already requested");
      stub.kind = "trip";
      stub.refLabel = (job.cargo || "Load") + " · " + (job.origin || "") + " → " + (job.destination || "");
      stub.amountUgx = Number(body.amountUgx) || job.paidUgx || job.rateUgx || job.incomeUgx || 0;
    }
    if (user.role === "cane_manager") {
      const sale = (db.caneSales || []).find((x) => x.id === body.refId);
      if (!sale) throw new Error("Sale not found");
      if (db.payStubs.some((x) => x.refId === sale.id && x.role === "cane_manager" && x.status !== "rejected")) throw new Error("Already requested");
      stub.kind = "trip";
      stub.refLabel = "Cane sale " + (sale.tonnes || "") + " t";
      stub.amountUgx = Number(body.amountUgx) || sale.totalUgx || sale.amountUgx || 0;
    }
    if (user.role === "passion_manager") {
      const sale = (db.fruitSales || []).find((x) => x.id === body.refId);
      if (!sale) throw new Error("Sale not found");
      if (db.payStubs.some((x) => x.refId === sale.id && x.role === "passion_manager" && x.status !== "rejected")) throw new Error("Already requested");
      stub.kind = "sale";
      stub.refLabel = "Fruit " + (sale.kg || "") + " kg";
      stub.amountUgx = Number(body.amountUgx) || sale.totalUgx || sale.amountUgx || 0;
    }
    if (!stub.amountUgx) throw new Error("Amount needed");
    db.payStubs.unshift(stub);
    if (!db.notifications) db.notifications = [];
    db.notifications.unshift({ id: uid("n"), toRole: "admin", type: "pay", title: "Pay request", body: stub.personName + " · " + stub.refLabel, status: "unread", createdAt: new Date().toISOString() });
  }

  if (action === "pay_stub") {
    if (!db.payStubs) db.payStubs = [];
    if (body.kind === "month") {
      db.payStubs.unshift({
        id: uid("ps"),
        role: "driver",
        personId: body.personId,
        personName: body.personName || "",
        kind: "month",
        refId: body.month || "",
        refLabel: "Month " + (body.month || ""),
        amountUgx: Number(body.amountUgx) || 0,
        status: body.status || "paid",
        requestedAt: todayStr(),
        paidAt: body.status === "pending" ? "" : todayStr(),
        year: new Date().getFullYear(),
      });
    } else {
      const st = db.payStubs.find((x) => x.id === body.id) || db.payStubs.find((x) => x.refId === body.id);
      const job = db.jobs.find((j) => j.id === (body.jobId || body.id) || (st && j.id === st.refId));
      const sale = (db.caneSales || []).find((s) => s.id === body.id || (st && s.id === st.refId));
      const drv = db.drivers.find((d) => d.id === (body.personId || (st && st.personId) || (job && job.driverId)));
      const mgr = (db.users || []).find((u) => u.role === "cane_manager");
      if (!st && !job && !sale) throw new Error("Load not found");
      const phone = (body.phone || (drv && drv.phone) || (mgr && mgr.phone) || (st && st.phone) || "").trim();
      if (drv && phone) drv.phone = phone;
      if (mgr && sale && phone) mgr.phone = phone;
      const amount = Number(body.amountUgx) || (st && st.amountUgx) || 0;
      if (!amount) throw new Error("Enter the pay amount");
      const row = st || { id: uid("ps"), role: sale ? "cane_manager" : "driver", personId: (drv && drv.id) || (mgr && mgr.id), personName: (drv && drv.name) || (mgr && mgr.name), kind: sale ? "sale" : "trip", refId: (job && job.id) || (sale && sale.id), year: new Date().getFullYear() };
      if (!st) db.payStubs.unshift(row);
      row.phone = phone;
      row.method = "mobile_money";
      row.amountUgx = amount;
      row.loadId = (job && job.code) || (sale && sale.tonnes + " t") || row.loadId || row.refLabel;
      row.refLabel = row.loadId;
      row.drop = (job && job.destination) || row.drop || "";
      row.status = "paid";
      row.paidAt = todayStr();
      if (!db.cash) db.cash = [];
      db.cash.unshift({
        id: uid("k"),
        date: row.paidAt,
        direction: "out",
        amountUgx: amount,
        tag: row.role === "cane_manager" ? "sugarcane" : "trucking",
        method: "mobile_money",
        category: "employee_pay",
        note: "Employee pay " + (row.personName || "") + " · " + (row.loadId || ""),
        refId: row.id,
        truckId: job && job.truckId,
      });
      if (!db.notifications) db.notifications = [];
      db.notifications.unshift({
        id: uid("n"),
        toDriverId: row.personId,
        type: "pay",
        title: "Payment sent",
        body: "Load " + (row.loadId || "") + " paid by mobile money to " + phone + ".",
        status: "unread",
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (action === "log_scale") {
    const job = db.jobs.find((j) => j.id === body.id);
    if (!job) throw new Error("Load not found");
    if (user.role === "driver" && job.driverId !== user.driverId) throw new Error("No access");
    const tonnes = Number(body.tonnes) || 0;
    if (tonnes <= 0) throw new Error("Enter tonnes");
    if (!body.scaleTicket) throw new Error("Add the scale ticket");
    job.tonnesDelivered = tonnes;
    job.scaleTicket = body.scaleTicket;
    job.scaledAt = todayStr();
    if (job.payBasis === "tonne" && job.payPerTonne) job.rateUgx = Math.round(tonnes * job.payPerTonne);
    job.incomeUgx = job.rateUgx || 0;
    if (!db.notifications) db.notifications = [];
    db.notifications.unshift({ id: uid("n"), toRole: "admin", type: "scale", title: "Scale ticket", body: (job.code || job.id) + " · " + tonnes + " t", status: "unread", createdAt: new Date().toISOString() });
  }

  if (action === "log_invoice") {
    const job = db.jobs.find((j) => j.id === body.id);
    if (!job) throw new Error("Load not found");
    if (user.role === "driver" && job.driverId !== user.driverId) throw new Error("No access");
    const amount = Number(body.amountUgx) || job.rateUgx || job.incomeUgx || 0;
    if (!amount) throw new Error("Enter the amount");
    if (!body.invoice) throw new Error("Add the invoice");
    job.invoice = body.invoice;
    job.rateUgx = amount;
    job.incomeUgx = amount;
    job.invoicedAt = todayStr();
    if (body.paidNow === "1" || body.paidNow === true) {
      job.paid = true;
      job.status = "paid";
      job.paidAt = job.invoicedAt;
      job.paidUgx = amount;
      recordJobIncome(db, job, amount, job.paidAt, "invoice");
    }
    if (!db.notifications) db.notifications = [];
    db.notifications.unshift({ id: uid("n"), toRole: "admin", type: "invoice", title: job.paid ? "Load paid" : "Invoice in", body: (job.code || job.id) + " · UGX " + amount.toLocaleString("en-UG"), status: "unread", createdAt: new Date().toISOString() });
  }

  if (action === "mark_job_paid") {
    const job = db.jobs.find((j) => j.id === body.id);
    if (!job) throw new Error("Load not found");
    job.paid = true;
    job.status = "paid";
    job.paidAt = dayOf(body, body.paidAt ? "paidAt" : "date");
    job.paidUgx = Number(body.paidUgx) || job.rateUgx || job.incomeUgx || 0;
    job.paidMethod = body.method || job.paidMethod || "";
    // Customer payment only. Driver trip allowance is paid separately on Money › Pay.
    recordJobIncome(db, job, job.paidUgx, job.paidAt, body.method || "invoice", body.reference);
  }

  if (action === "add_cargo_type") {
    if (!db.cargoTypes) db.cargoTypes = [];
    const name = (body.name || "").trim();
    if (name && !db.cargoTypes.some((x) => x.toLowerCase() === name.toLowerCase())) db.cargoTypes.unshift(name);
  }

  if (action === "update_job") {
    const job = db.jobs.find((j) => j.id === body.id);
    if (!job) throw new Error("Load not found");
    if (user.role === "driver" && job.driverId !== user.driverId) throw new Error("No access");
    // trip steps keep their time and who set them; steps nobody tapped are marked as passed
    const STEPS = ["booked", "to_pickup", "loading", "en_route", "delivered"];
    const from = STEPS.indexOf(job.status), to = STEPS.indexOf(body.status);
    if (to >= 0) {
      job.steps = job.steps || {};
      const at = new Date().toISOString();
      for (let i = Math.max(1, from + 1); i < to; i++) if (!job.steps[STEPS[i]]) job.steps[STEPS[i]] = { skipped: true, by: user.name };
      job.steps[body.status] = { at, by: user.name, office: user.role === "admin" };
    }
    job.status = body.status;
    const truck = db.trucks.find((t) => t.id === job.truckId);
    if (truck) {
      if (body.status === "to_pickup") truck.status = "on_trip";
      if (body.status === "loading") truck.status = "loading";
      else if (body.status === "en_route") truck.status = "on_trip";
      else if (["delivered", "invoiced", "paid"].includes(body.status)) truck.status = "idle";
    }
    if (body.status === "delivered") {
      job.deliveredAt = job.deliveredAt || todayStr();
      if (job.prepaid && !job.paid) { job.paid = true; job.paidAt = job.deliveredAt; job.paidUgx = job.rateUgx; } // client paid in full when booking
      if (!db.payStubs) db.payStubs = [];
      const drv = db.drivers.find((d) => d.id === job.driverId);
      if (drv && (drv.payType || "trip") === "trip" && !db.payStubs.some((x) => x.refId === job.id)) {
        db.payStubs.unshift({
          id: uid("ps"),
          role: "driver",
          personId: job.driverId,
          personName: drv.name,
          phone: drv.phone || "",
          kind: "trip",
          refId: job.id,
          refLabel: job.code || job.id,
          loadId: job.code || job.id,
          drop: job.destination || "",
          tripIncome: job.rateUgx || job.incomeUgx || 0,
          amountUgx: 0,
          status: "pending",
          requestedAt: todayStr(),
          paidAt: "",
          year: new Date().getFullYear(),
        });
      }
    }
    if (body.status === "paid") {
      job.paid = true; job.paidAt = job.paidAt || dayOf(body); job.paidUgx = job.paidUgx || job.rateUgx || job.incomeUgx || 0;
      recordJobIncome(db, job, job.paidUgx, job.paidAt, body.method || "cash");
    }
  }

  if (action === "log_fuel" && user.role === "driver" && body.floatId) {
    const fl = (db.disbursements || []).find((x) => x.id === body.floatId && x.toDriverId === user.driverId);
    if (!fl) throw new Error("Advance not found");
    addFloatUse(db, fl, { ...body, category: "diesel", payeeName: body.station || "Fuel station" }, user);
  } else if (action === "log_fuel") {
    const driverId = user.role === "driver" ? user.driverId : body.driverId;
    const log = {
      id: uid("f"),
      truckId: body.truckId,
      driverId,
      litres: Number(body.litres) || 0,
      amountUgx: Number(body.amountUgx) || 0,
      odometerKm: Number(body.odometerKm) || 0,
      station: body.station || "",
      date: dayOf(body),
      photo: body.photo || "",
    };
    db.fuelLogs.unshift(log);
    const truck = db.trucks.find((t) => t.id === log.truckId);
    if (truck && log.odometerKm > truck.odometerKm) truck.odometerKm = log.odometerKm;
    if (user.role === "driver") {
      log.notFromAdvance = true; // driver used money that didn't come through an advance: flag it, don't count it twice
    } else {
      db.cash.unshift({ id: uid("k"), date: log.date, direction: "out", amountUgx: log.amountUgx, tag: "trucking", method: body.method || "cash", category: "diesel", note: "Fuel " + (truck?.plate || log.truckId), refId: log.id, truckId: log.truckId, payeeName: log.station });
    }
  }

  if (action === "create_cane_buy") {
    const type = body.type === "trip" ? "trip" : "acre";
    const kmPerLitre = Number(body.kmPerLitre) || 3.1;
    const diesel = Number(body.dieselUgxPerLitre) || db.dieselDefaultUgx;
    const transportKm = Number(body.transportKm) || 0;
    const fuel = estimateFuel(transportKm, kmPerLitre, diesel);
    const acres = type === "acre" ? Number(body.acres) || 0 : undefined;
    const trips = type === "trip" ? Number(body.tripsAgreed) || 0 : undefined;
    if (!db.sellers) db.sellers = [];
    let sellerId = body.sellerId || "";
    const newName = (body.sellerName || "").trim();
    if (sellerId === "new" && !newName) throw new Error("Enter the new seller's name");
    if (sellerId === "new") sellerId = "";
    if (newName) {
      let s = db.sellers.find((x) => x.name.toLowerCase() === newName.toLowerCase());
      if (!s) {
        s = { id: uid("s"), name: newName, phone: body.sellerPhone || "", location: body.location || "" };
        db.sellers.unshift(s);
      }
      sellerId = s.id;
    }
    const seller = db.sellers.find((x) => x.id === sellerId);
    if (seller && body.sellerPhone) seller.phone = body.sellerPhone;
    db.caneBuys.unshift({
      id: uid("cb"),
      date: dayOf(body),
      type,
      sellerId,
      location: body.location || "",
      acres,
      tripsAgreed: trips,
      expectedTonnes: 0,
      buyPriceUgx: Number(body.buyPriceUgx) || 0,
      buyPriceBasis: type === "acre" ? "per_acre" : "per_trip",
      status: "booked",
      cuttingCostUgx: 0,
      loadingCostUgx: 0,
      transportKm: 0,
      fuelLitres: 0,
      fuelUgx: 0,
      sellerPaid: false,
      millPaid: false,
      createdAt: todayStr(),
    });
  }

  if (action === "update_cane_buy") {
    const buy = db.caneBuys.find((b) => b.id === body.id);
    if (!buy) throw new Error("Buy not found");
    if (body.status) buy.status = body.status;
    ["cuttingCostUgx", "loadingCostUgx", "transportKm", "kmPerLitre", "dieselUgxPerLitre"].forEach((k) => {
      if (body[k] != null && body[k] !== "") buy[k] = Number(body[k]);
    });
    if (body.hiredTruckNote != null) buy.hiredTruckNote = body.hiredTruckNote;
    if (body.cuttingDate) buy.cuttingDate = body.cuttingDate;
    const fuel = estimateFuel(buy.transportKm, buy.kmPerLitre, buy.dieselUgxPerLitre);
    buy.fuelLitres = fuel.litres;
    buy.fuelUgx = fuel.fuelUgx;
  }

  if (action === "record_mill") {
    const buy = db.caneBuys.find((b) => b.id === body.id);
    if (!buy) throw new Error("Buy not found");
    buy.millId = body.millId || buy.millId;
    buy.millTonnes = Number(body.millTonnes) || 0;
    buy.millPriceUgx = Number(body.millPriceUgx) || 0;
    buy.millSaleUgx = Math.round(buy.millTonnes * buy.millPriceUgx);
    buy.status = "weighed";
  }

  if (action === "pay_seller") {
    const buy = db.caneBuys.find((b) => b.id === body.id);
    if (!buy) throw new Error("Buy not found");
    if (buy.sellerPaid) throw new Error("Seller already paid");
    const seller = (db.sellers || []).find((x) => x.id === buy.sellerId);
    const sp = { amountUgx: buy.buyPriceUgx, category: "buy", payeeName: (seller && seller.name) || "Seller", method: body.method || (seller && seller.phone ? "mtn_momo" : "cash"), reference: String(body.reference || "").slice(0, 60), date: body.date || "", payeePhone: (seller && seller.phone) || "", note: "Paid seller · " + (buy.location || buy.id), floatId: body.floatId || "" };
    const done = spendFromAdvanceOrCash(db, user, sp, "sugarcane", { caneBuyId: buy.id, refId: buy.id });
    buy.sellerPaid = true;
    buy.payMethod = sp.method;
    buy.paidFromFloat = body.floatId || "";
    buy.status = buy.millPaid ? "settled" : "seller_paid";
    if (done.cash) done.cash.note = "Paid seller · " + (seller ? seller.name : buy.id);
  }

  if (action === "create_cane_sale") {
    if (!db.caneSales) db.caneSales = [];
    const tonnes = Number(body.tonnes) || 0;
    const price = Number(body.pricePerTonne) || 0;
    if (tonnes <= 0 || price <= 0) throw new Error("Enter tonnes and price");
    const sale = {
      id: uid("cs"),
      date: dayOf(body),
      millId: body.millId || "",
      buyId: body.buyId || "",
      tonnes,
      pricePerTonne: price,
      amountUgx: Math.round(tonnes * price),
      method: body.method || "cash",
      note: body.note || "",
      by: user.name,
      byUserId: user.role === "cane_manager" ? user.id : "",
      cuttingCostUgx: Number(body.cuttingCostUgx) || 0,
      loadingCostUgx: Number(body.loadingCostUgx) || 0,
      transportUgx: Number(body.transportUgx) || 0,
    };
    db.caneSales.unshift(sale);
    const forBuy = sale.buyId && db.caneBuys.find((b) => b.id === sale.buyId);
    if (forBuy) { forBuy.millPaid = true; forBuy.millSaleUgx = forBuy.millSaleUgx || sale.amountUgx; if (forBuy.sellerPaid) forBuy.status = "settled"; }
    if (!db.payStubs) db.payStubs = [];
    const mgr = (db.users || []).find((u) => u.role === "cane_manager" && u.active);
    if (mgr && !db.payStubs.some((x) => x.refId === sale.id)) {
      db.payStubs.unshift({
        id: uid("ps"),
        role: "cane_manager",
        personId: mgr.id,
        personName: mgr.name,
        phone: mgr.phone || "",
        kind: "sale",
        refId: sale.id,
        refLabel: sale.tonnes + " t",
        drop: sale.note || "",
        tripIncome: sale.amountUgx,
        amountUgx: 0,
        status: "pending",
        requestedAt: sale.date,
        paidAt: "",
        year: new Date().getFullYear(),
      });
    }
    if (sale.buyId) {
      const buy = db.caneBuys.find((b) => b.id === sale.buyId);
      if (buy) {
        buy.millTonnes = tonnes;
        buy.millId = sale.millId || buy.millId;
        buy.millPriceUgx = price;
        buy.millSaleUgx = sale.amountUgx;
        buy.cuttingCostUgx = sale.cuttingCostUgx;
        buy.loadingCostUgx = sale.loadingCostUgx;
        buy.fuelUgx = sale.transportUgx;
        buy.status = "weighed";
      }
    }
    db.cash.unshift({
      id: uid("k"),
      date: sale.date,
      direction: "in",
      amountUgx: sale.amountUgx,
      tag: "sugarcane",
      method: sale.method,
      note: "Cane sale " + sale.tonnes + " t",
      caneBuyId: sale.buyId,
      refId: sale.id,
    });
  }

  if (action === "log_cane_expense") {
    if (!db.caneExpenses) db.caneExpenses = [];
    const amount = Number(body.amountUgx) || 0;
    if (amount <= 0) throw new Error("Enter amount");
    const row = {
      id: uid("ce"),
      date: dayOf(body),
      category: body.category || "other",
      amountUgx: amount,
      note: body.note || "",
      buyId: body.buyId || "",
      by: user.name,
    };
    db.caneExpenses.unshift(row);
    db.cash.unshift({
      id: uid("k"),
      date: row.date,
      direction: "out",
      amountUgx: amount,
      tag: "sugarcane",
      method: body.method || "cash",
      note: row.category + (row.note ? " · " + row.note : ""),
      caneBuyId: row.buyId,
      refId: row.id,
    });
  }

  if (action === "request_money") {
    if (!db.moneyRequests) db.moneyRequests = [];
    let lines = body.lines;
    if (typeof lines === "string") {
      try { lines = JSON.parse(lines); } catch (e) { lines = []; }
    }
    lines = (lines || []).filter((l) => l && (Number(l.amountUgx) || 0) > 0).map((l) => ({
      activity: l.activity || "other",
      amountUgx: Number(l.amountUgx) || 0,
    }));
    if (!lines.length) throw new Error("Add at least one activity");
    const total = lines.reduce((s, l) => s + l.amountUgx, 0);
    const req = {
      id: uid("mr"),
      tag: body.tag || "sugarcane",
      date: todayStr(),
      lines,
      totalUgx: total,
      note: body.note || "",
      status: "open",
      by: user.name,
      byRole: user.role,
    };
    db.moneyRequests.unshift(req);
    db.notifications.unshift({
      id: uid("n"),
      toRole: "admin",
      type: "money_request",
      title: "Money request",
      body: req.by + " · UGX " + total.toLocaleString("en-UG"),
      status: "unread",
      createdAt: new Date().toISOString(),
    });
  }

  if (action === "decide_request") {
    const req = (db.moneyRequests || []).find((r) => r.id === body.id);
    if (!req) throw new Error("Request not found");
    req.status = body.status === "rejected" ? "rejected" : "approved";
    req.decidedAt = todayStr();
    if (req.status === "approved") {
      db.cash.unshift({
        id: uid("k"),
        date: req.decidedAt,
        direction: "out",
        amountUgx: req.totalUgx,
        tag: req.tag,
        method: body.method || "cash",
        note: "Approved request · " + req.by,
        refId: req.id,
      });
    }
  }

  if (action === "log_harvest") body.kind = "harvest";
  if (action === "add_field_log") {
    body.kind = body.tag === "prune" ? "prune" : body.tag === "weeding" ? "weed" : "spray";
    body.costUgx = body.costUgx || 0;
  }

  if (action === "log_farm_work" || action === "log_harvest" || action === "add_field_log") {
    if (!db.farmWorks) db.farmWorks = [];
    const kind = body.kind || "weed";
    const allowed = ["harvest", "prune", "spray", "fertilize", "weed"];
    if (!allowed.includes(kind)) throw new Error("Unknown work");
    const kg = kind === "harvest" ? Number(body.kg) || 0 : 0;
    if (kind === "harvest" && kg <= 0) throw new Error("Enter kg picked");
    const rec = {
      id: uid("fw"),
      blockId: body.blockId,
      kind,
      date: dayOf(body),
      costUgx: Number(body.costUgx) || 0,
      kg,
      note: body.note || "",
      by: user.name,
    };
    if (rec.costUgx > 0 && body.floatId) {
      // Labour/inputs paid from the manager's advance: part of that advance, not new money out.
      const fl = (db.disbursements || []).find((x) => x.id === body.floatId);
      if (!fl || !ownsFloat(fl, user)) throw new Error("Advance not found");
      addFloatUse(db, fl, { amountUgx: rec.costUgx, category: kind, payeeName: body.payeeName || "Farm workers", method: body.method || "cash", payeePhone: body.payeePhone || "", note: (rec.note || kind) + " · Block " + (rec.blockId || ""), photo: body.photo || "" }, user);
      rec.floatId = fl.id;
    }
    db.farmWorks.unshift(rec);
    if (rec.costUgx > 0 && !body.floatId) {
      db.cash.unshift({
        id: uid("k"),
        date: rec.date,
        direction: "out",
        amountUgx: rec.costUgx,
        tag: "passion",
        method: body.method || "cash",
        category: kind,
        note: rec.kind + " " + rec.blockId,
        refId: rec.id,
        blockId: rec.blockId,
        source: user.role === "admin" ? "office" : "cash_on_hand",
        payeeName: body.payeeName || "",
      });
    }
  }

  if (action === "create_fruit_sale") {
    if (!db.farmWorks) db.farmWorks = [];
    const kg = Number(body.kg) || 0;
    if (kg <= 0) throw new Error("Enter kg");
    if (kg > fruitStock(db)) throw new Error("Only " + fruitStock(db) + " kg in stock");
    const sale = {
      id: uid("fs"),
      date: dayOf(body),
      buyer: body.buyer || "Buyer",
      kg,
      amountUgx: Number(body.amountUgx) || 0,
      paidUgx: Number(body.paidUgx != null && body.paidUgx !== "" ? body.paidUgx : body.amountUgx) || 0,
      expenseUgx: Number(body.expenseUgx) || 0,
      expenseNote: body.expenseNote || "",
      payMethod: body.payMethod || "cash",
    };
    db.fruitSales.unshift(sale);
    if (sale.paidUgx > 0) {
      db.cash.unshift({
        id: uid("k"),
        date: sale.date,
        direction: "in",
        amountUgx: sale.paidUgx,
        tag: "passion",
        method: sale.payMethod,
        note: sale.buyer + " · " + sale.kg + " kg",
        refId: sale.id,
      });
    }
    if (sale.expenseUgx > 0) {
      db.cash.unshift({
        id: uid("k"),
        date: sale.date,
        direction: "out",
        amountUgx: sale.expenseUgx,
        tag: "passion",
        method: sale.payMethod,
        note: (sale.expenseNote || "Sale cost") + " · " + sale.buyer,
        refId: sale.id,
      });
    }
  }

  if (action === "record_sale_pay") {
    const sale = db.fruitSales.find((x) => x.id === body.id);
    if (!sale) throw new Error("Sale not found");
    const extra = Number(body.paidUgx) || 0;
    sale.paidUgx = (sale.paidUgx || 0) + extra;
    if (extra > 0) {
      db.cash.unshift({
        id: uid("k"),
        date: todayStr(),
        direction: "in",
        amountUgx: extra,
        tag: "passion",
        method: body.method || sale.payMethod || "cash",
        note: "Payment · " + sale.buyer,
        refId: sale.id,
      });
    }
  }

  if (action === "record_sale_expense") {
    const sale = db.fruitSales.find((x) => x.id === body.id);
    if (!sale) throw new Error("Sale not found");
    const extra = Number(body.expenseUgx) || 0;
    sale.expenseUgx = (sale.expenseUgx || 0) + extra;
    if (body.expenseNote) sale.expenseNote = (sale.expenseNote ? sale.expenseNote + "; " : "") + body.expenseNote;
    if (extra > 0) {
      db.cash.unshift({
        id: uid("k"),
        date: todayStr(),
        direction: "out",
        amountUgx: extra,
        tag: "passion",
        method: body.method || "cash",
        note: (body.expenseNote || "Sale cost") + " · " + sale.buyer,
        refId: sale.id,
      });
    }
  }

  if (action === "create_fleet_task") {
    const truck = db.trucks.find((t) => t.id === body.truckId);
    if (!truck) throw new Error("Truck not found");
    const driverId = body.driverId || truck.assignedDriverId || "";
    let parts = body.parts;
    if (typeof parts === "string") parts = parts.split(",");
    parts = (parts || []).map((p) => String(p).trim()).filter(Boolean);
    if (!parts.length && body.part) parts = [body.part];
    const partNames = body.partNames && typeof body.partNames === "object" ? body.partNames : {};
    const instructions = String(body.instructions || body.note || "").trim();
    const kindName = { inspect: "Inspect", service: "Service", repair: "Repair", tyres: "Check tyres", fuel: "Fuel", wash: "Wash", papers: "Papers / licence", other: "Task" }[body.kind] || "Task";
    const title = String(body.title || "").trim() || (parts.length ? kindName + ": " + parts.map((p) => partNames[p] || p).join(", ") : kindName);
    if (!instructions && !parts.length) throw new Error("Write what the driver must do");
    const task = {
      id: uid("ft"),
      truckId: truck.id,
      driverId,
      kind: body.kind || "other",
      title,
      instructions,
      note: instructions,
      parts,
      partNames,
      part: parts[0] || "",
      needPhoto: body.needPhoto === "1" || body.needPhoto === true,
      needVoice: body.needVoice === "1" || body.needVoice === true,
      history: [],
      dueDate: body.dueDate || "",
      priority: body.priority === "urgent" ? "urgent" : "normal",
      status: "open",
      createdBy: user.name,
      createdAt: todayStr(),
      seenAt: "",
      doneAt: "",
      driverNote: "",
    };
    db.fleetTasks.unshift(task);
    if (driverId) {
      db.notifications.unshift({
        id: uid("n"),
        toDriverId: driverId,
        truckId: truck.id,
        taskId: task.id,
        type: "task",
        title: task.priority === "urgent" ? "Urgent from admin" : "New work from admin",
        text: (task.priority === "urgent" ? "URGENT · " : "") + truck.plate + " — " + task.title + (task.instructions ? ": " + task.instructions : ""),
        body: truck.plate + " — " + task.title,
        status: "unread",
        createdAt: new Date().toISOString(),
      });
    }
    if (task.kind === "service" || task.kind === "repair") truck.status = truck.status === "on_trip" ? truck.status : "workshop";
  }

  if (action === "update_fleet_task") {
    const task = db.fleetTasks.find((t) => t.id === body.id);
    if (!task) throw new Error("Task not found");
    if (body.status) task.status = body.status;
    if (body.note != null && body.note !== "") task.note = body.note;
  }

  if (action === "read_note") {
    const n = (db.notifications || []).find((x) => x.id === body.id);
    if (!n || (user.role === "driver" && n.toDriverId !== user.driverId)) throw new Error("Notice not found");
    n.status = "read"; n.readAt = new Date().toISOString();
  }

  if (action === "ack_fleet_task") {
    const task = db.fleetTasks.find((t) => t.id === body.id);
    if (!task) throw new Error("Task not found");
    task.status = "seen";
    task.seenAt = todayStr();
    db.notifications.forEach((n) => {
      if (n.taskId === task.id && n.toDriverId === user.driverId) n.status = "read";
    });
  }


  if (action === "submit_inspect") {
    if (!db.inspections) db.inspections = [];
    const driverId = user.role === "driver" ? user.driverId : body.driverId;
    const truckId = body.truckId;
    const items = body.items && typeof body.items === "object" ? body.items : {};
    Object.keys(body).forEach((k) => {
      if (k.startsWith("p_")) items[k.slice(2)] = body[k];
    });
    const fails = Object.keys(items).filter((k) => items[k] === "fail");
    const warns = Object.keys(items).filter((k) => items[k] === "warn");
    const rec = {
      id: uid("in"),
      truckId,
      driverId,
      by: user.name,
      date: dayOf(body),
      odometerKm: Number(body.odometerKm) || 0,
      items,
      photos: body.photos || {},
      voice: body.voice || "",
      failCount: fails.length,
      warnCount: warns.length,
      note: body.note || "",
      status: fails.length ? "fail" : warns.length ? "warn" : "pass",
    };
    db.inspections.unshift(rec);
    if (!db.notifications) db.notifications = [];
    db.notifications.unshift({
      id: uid("n"),
      toRole: "admin",
      type: "inspect",
      title: rec.status === "fail" ? "Inspect fail" : "Inspect done",
      body: user.name + " · " + rec.failCount + " fail",
      status: "unread",
      createdAt: new Date().toISOString(),
      truckId,
    });
  }

  if (action === "complete_fleet_task") {
    const task = db.fleetTasks.find((t) => t.id === body.id);
    if (!task) throw new Error("Task not found");
    if (user.role === "driver" && task.driverId && task.driverId !== user.driverId) throw new Error("No access");
    const items = body.items && typeof body.items === "object" ? body.items : {};
    const photos = body.photos && typeof body.photos === "object" ? body.photos : {};
    const parts = task.parts || [];
    for (const p of parts) if (!items[p]) throw new Error("Mark every part: OK, needs attention, or not OK");
    if (task.needPhoto) {
      if (parts.length) { for (const p of parts) if (items[p] !== "pass" && !photos[p]) throw new Error("Add a photo for " + ((task.partNames || {})[p] || p)); }
      else if (!photos.work) throw new Error("Add a photo of the work");
    }
    if (task.needVoice && !body.voice && (!parts.length || parts.some((p) => items[p] !== "pass"))) throw new Error("Record a voice note");
    const now = new Date().toISOString();
    const reply = { at: now, by: user.name, items, photos, voice: body.voice || "", voiceSec: Number(body.voiceSec) || 0, note: String(body.driverNote || body.note || "").trim(), odometerKm: Number(body.odometerKm) || 0 };
    task.reply = reply;
    task.history = (task.history || []).concat([{ at: now, by: user.name, what: "replied" }]);
    task.status = "done";
    task.doneAt = todayStr();
    task.driverNote = reply.note;
    if (parts.length) {
      // keep the truck's inspection history complete too
      if (!db.inspections) db.inspections = [];
      const fails = parts.filter((p) => items[p] === "fail"), warns = parts.filter((p) => items[p] === "warn");
      const insp = { id: uid("in"), truckId: task.truckId, driverId: task.driverId || user.driverId, by: user.name, date: todayStr(), odometerKm: reply.odometerKm, items, photos, voice: reply.voice, failCount: fails.length, warnCount: warns.length, note: reply.note, status: fails.length ? "fail" : warns.length ? "warn" : "pass", taskId: task.id, partial: true };
      db.inspections.unshift(insp);
      task.inspectionId = insp.id;
      const truck = db.trucks.find((t) => t.id === task.truckId);
      if (truck && reply.odometerKm > (truck.odometerKm || 0)) truck.odometerKm = reply.odometerKm;
    }
    db.notifications.forEach((n) => {
      if (n.taskId === task.id && n.toDriverId === user.driverId) n.status = "cleared";
    });
    db.notifications.unshift({
      id: uid("n"),
      toDriverId: "",
      toRole: "admin",
      truckId: task.truckId,
      taskId: task.id,
      type: "done",
      title: "Driver replied to a task",
      body: task.title + (task.driverNote ? " — " + task.driverNote : ""),
      status: "unread",
      createdAt: new Date().toISOString(),
    });
  }

  if (action === "save_doc") {
    if (!db.docs) db.docs = [];
    const tag = user.role === "admin" ? body.tag : TAG_OF_ROLE[user.role];
    if (!["trucking", "sugarcane", "passion"].includes(tag)) throw new Error("Choose the business");
    const title = String(body.title || "").trim();
    if (!title) throw new Error("Give the document a name");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ""))) throw new Error("Enter the document date");
    if (!body.file) throw new Error("Attach a photo or PDF of the document");
    if (String(body.file).length > 1600000) throw new Error("That file is too big. Use a photo, or a PDF under 1 MB.");
    const doc = {
      id: uid("doc"), tag, type: body.type || "other", title, date: dayOf(body), amountUgx: Number(body.amountUgx) || 0,
      party: String(body.party || "").trim(), number: String(body.number || "").trim(),
      expiry: /^\d{4}-\d{2}-\d{2}$/.test(String(body.expiry || "")) ? body.expiry : "",
      truckId: body.truckId || "", jobId: body.jobId || "", caneBuyId: body.caneBuyId || "", blockId: body.blockId || "",
      file: body.file, fileName: String(body.fileName || "").slice(0, 80), mime: String(body.mime || ""),
      note: String(body.note || "").trim(), by: user.name, byId: user.id, byRole: user.assistant ? "admin" : user.role, addedAt: new Date().toISOString(),
    };
    db.docs.unshift(doc);
  }

  if (action === "seen_doc") {
    const doc = (db.docs || []).find((x) => x.id === body.id);
    if (!doc) throw new Error("Document not found");
    doc.seenAt = new Date().toISOString(); doc.seenBy = user.name;
  }

  if (action === "delete_doc") {
    const doc = (db.docs || []).find((x) => x.id === body.id);
    if (!doc) throw new Error("Document not found");
    if (user.role !== "admin" && doc.byId !== user.id) throw new Error("Only the admin or the person who added it can remove it");
    db.docs = db.docs.filter((x) => x.id !== doc.id);
  }

  if (action === "review_fleet_task") {
    const task = db.fleetTasks.find((t) => t.id === body.id);
    if (!task) throw new Error("Task not found");
    const now = new Date().toISOString();
    body.decision = body.decision || body.status;
    if (body.decision === "accept") {
      task.status = "closed"; task.closedAt = todayStr();
      task.history = (task.history || []).concat([{ at: now, by: user.name, what: "accepted" }]);
    } else if (body.decision === "back") {
      const why = String(body.reason || "").trim();
      if (!why) throw new Error("Say what still needs doing");
      task.history = (task.history || []).concat([{ at: now, by: user.name, what: "sent back", reason: why, reply: task.reply }]);
      task.status = "open"; task.reply = null; task.doneAt = ""; task.sentBack = why;
      if (task.driverId) db.notifications.unshift({ id: uid("n"), toDriverId: task.driverId, truckId: task.truckId, taskId: task.id, type: "task", title: "Task sent back", text: "Sent back: " + task.title + " — " + why, status: "unread", createdAt: now });
    } else throw new Error("Choose accept or send back");
  }

  if (action === "log_service") {
    const truck = db.trucks.find((t) => t.id === body.truckId);
    if (!truck) throw new Error("Truck not found");
    const rec = {
      id: uid("sv"),
      truckId: truck.id,
      date: dayOf(body),
      kind: body.kind || "service",
      odometerKm: Number(body.odometerKm) || truck.odometerKm,
      costUgx: Number(body.costUgx) || 0,
      note: body.note || "",
      garage: body.garage || "",
    };
    db.services.unshift(rec);
    if (rec.odometerKm > truck.odometerKm) truck.odometerKm = rec.odometerKm;
    if (body.nextServiceKm) truck.nextServiceKm = Number(body.nextServiceKm);
    else truck.nextServiceKm = truck.odometerKm + 10000;
    truck.status = "idle";
    if (rec.costUgx) {
      db.cash.unshift({
        id: uid("k"),
        date: rec.date,
        direction: "out",
        amountUgx: rec.costUgx,
        tag: "trucking",
        method: body.method || "cash",
        note: "Service " + truck.plate,
        refId: rec.id,
      });
    }
  }

  if (action === "report_issue") {
    const truckId = body.truckId || (user.role === "driver" ? db.drivers.find((d) => d.id === user.driverId)?.assignedTruckId : "");
    const truck = db.trucks.find((t) => t.id === truckId);
    if (!truck) throw new Error("Truck not found");
    const issue = {
      id: uid("is"),
      truckId: truck.id,
      driverId: user.role === "driver" ? user.driverId : body.driverId || truck.assignedDriverId || "",
      title: body.title || "Issue on truck",
      note: body.note || "",
      severity: body.severity || "normal",
      status: "open",
      date: todayStr(),
      by: user.name,
      photos: Array.isArray(body.photos) ? body.photos.slice(0, 4) : [],
      voice: body.voice || "",
      voiceSec: Number(body.voiceSec) || 0,
      replies: [],
    };
    db.issues.unshift(issue);
    if (user.role === "driver") {
      db.notifications.unshift({
        id: uid("n"),
        toRole: "admin",
        toDriverId: "",
        truckId: truck.id,
        type: "issue",
        title: "Driver reported an issue",
        body: truck.plate + " — " + issue.title,
        status: "unread",
        createdAt: new Date().toISOString(),
      });
    } else if (issue.driverId) {
      db.notifications.unshift({
        id: uid("n"),
        toDriverId: issue.driverId,
        truckId: truck.id,
        type: "issue",
        title: "Admin flagged a truck issue",
        body: truck.plate + " — " + issue.title,
        status: "unread",
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (action === "reply_issue") {
    const issue = db.issues.find((i) => i.id === body.id);
    if (!issue) throw new Error("Report not found");
    if (!issue.replies) issue.replies = [];
    issue.replies.unshift({
      id: uid("rp"),
      by: user.name,
      text: body.text || body.nextStep || "",
      date: todayStr(),
    });
    issue.status = body.close ? "closed" : "replied";
    if (issue.driverId) {
      db.notifications.unshift({
        id: uid("n"),
        toDriverId: issue.driverId,
        truckId: issue.truckId,
        type: "reply",
        title: "Admin reply",
        body: issue.replies[0].text,
        status: "unread",
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (action === "add_cash") {
    if (!db.receivables) db.receivables = [];
    const row = {
      id: uid("k"),
      date: dayOf(body),
      direction: body.direction || "out",
      amountUgx: Number(body.amountUgx) || 0,
      tag: body.tag || "overhead",
      method: body.method || "cash",
      note: body.note || "",
      category: body.category || "",
      truckId: body.truckId || "",
      caneBuyId: body.caneBuyId || "",
      jobId: body.jobId || "",
      blockId: body.blockId || "",
      driverId: body.driverId || "",
    };
    if (row.direction === "out") {
      if (row.amountUgx <= 0) throw new Error("Enter the amount");
      Object.assign(row, payeeFrom(body, body.payee === "1"));
    }
    db.cash.unshift(row);
    if (row.direction === "out" && (body.awaitPay === true || body.awaitPay === "1" || body.awaitPay === "on")) {
      db.receivables.unshift({
        id: uid("rv"),
        cashId: row.id,
        tag: row.tag,
        amountUgx: row.amountUgx,
        truckId: row.truckId,
        jobId: row.jobId,
        caneBuyId: row.caneBuyId,
        note: row.note,
        status: "open",
        date: row.date,
      });
    }
  }

  if (action === "trust_device" || action === "untrust_device") {
    if (!isMainAdmin(user)) throw new Error("Only the main admin can trust a computer");
    db.trustedDevices = (db.trustedDevices || []).filter((d) => d.id !== body.deviceId);
    if (action === "trust_device") {
      db.trustedDevices.push({ id: body.deviceId, label: String(body.label || "Computer").slice(0, 60), addedAt: new Date().toISOString(), by: user.name });
      // anyone waiting on this computer is let in too
      (db.users || []).forEach((u) => { u.pendingDevices = (u.pendingDevices || []).filter((d) => d.id !== body.deviceId); });
    }
    logSignIn(db, user, action === "trust_device" ? "computer_trusted" : "computer_untrusted", { by: user.name });
  }

  if (["save_login", "approve_device", "reject_device", "remove_device", "unlock_login"].includes(action) && user.assistant) throw new Error("Only the main admin manages logins");

  if (action === "save_login") {
    const name = String(body.name || "").trim();
    const phone = phoneKey(body.phone);
    const pin = String(body.pin || "").trim();
    let u = body.id ? db.users.find((x) => x.id === body.id) : null;
    const wantAssistant = !u && body.role === "admin2";
    const role = u ? u.role : wantAssistant ? "admin" : body.role;
    if (!["driver", "cane_manager", "passion_manager", "admin"].includes(role)) throw new Error("Choose a role");
    if (!u && role === "admin" && !wantAssistant) throw new Error("Only one main admin login");
    // Admin II manages drivers and managers, but only the main admin can add or change admin logins
    if (user.assistant && (wantAssistant || (u && u.role === "admin" && u.id !== user.id))) throw new Error("Only the main admin can add or change admin logins");
    if (!name && !u) throw new Error("Enter the name");
    if (!phone) throw new Error("Enter the phone number they will sign in with");
    if (db.users.some((x) => x !== u && phoneKey(x.phone) === phone && x.active !== false)) throw new Error("Another login already uses " + phone);
    if (pin && !/^\d{6}$/.test(pin)) throw new Error("PIN must be exactly 6 digits");
    if (!u && !pin) throw new Error("Set a PIN for the new login");
    if (!u) { u = { id: uid("u"), role, active: true, pin: "" }; if (wantAssistant) u.assistant = true; db.users.push(u); }
    if (name) u.name = name;
    u.phone = phone;
    if (pin) { u.pin = pin; u.failCount = 0; u.lockedAt = ""; }
    if (body.active !== undefined && (u.role !== "admin" || (u.assistant && !user.assistant))) u.active = body.active === "1" || body.active === true;
    if (role === "driver") {
      let d = db.drivers.find((x) => x.id === u.driverId);
      if (!d) {
        d = { id: uid("d"), userId: u.id, name: u.name, phone, licenceClass: "CM", licenceExpiry: "", assignedTruckId: "", advanceUgx: 0, payType: "trip", monthRateUgx: 0 };
        db.drivers.unshift(d);
        u.driverId = d.id;
      }
      d.name = u.name; d.phone = phone; d.userId = u.id;
      if (body.truckId !== undefined) {
        db.trucks.forEach((t) => { if (t.assignedDriverId === d.id) t.assignedDriverId = ""; });
        d.assignedTruckId = body.truckId || "";
        const t = db.trucks.find((x) => x.id === body.truckId);
        if (t) {
          db.drivers.forEach((o) => { if (o !== d && o.assignedTruckId === t.id) o.assignedTruckId = ""; });
          t.assignedDriverId = d.id;
        }
      }
    }
  }

  if (["approve_device", "reject_device", "remove_device", "unlock_login"].includes(action)) {
    const u = (db.users || []).find((x) => x.id === body.userId);
    if (!u) throw new Error("Login not found");
    if (user.assistant && u.role === "admin" && u.id !== user.id) throw new Error("Only the main admin can change admin logins");
    u.devices = u.devices || []; u.pendingDevices = u.pendingDevices || [];
    if (action === "approve_device") {
      const d = u.pendingDevices.find((x) => x.id === body.deviceId);
      if (!d) throw new Error("Phone request not found");
      u.pendingDevices = u.pendingDevices.filter((x) => x.id !== d.id);
      u.devices.push({ ...d, approvedAt: new Date().toISOString(), approvedBy: user.name });
      logSignIn(db, u, "phone_approved", { by: user.name, device: d.label, deviceId: d.id });
    }
    if (action === "reject_device") u.pendingDevices = u.pendingDevices.filter((x) => x.id !== body.deviceId);
    if (action === "remove_device") { u.devices = u.devices.filter((x) => x.id !== body.deviceId); logSignIn(db, u, "phone_removed", { by: user.name }); }
    if (action === "unlock_login") { u.failCount = 0; u.lockedAt = ""; logSignIn(db, u, "unlocked", { by: user.name }); }
  }

  if (action === "save_pay_profile") {
    const rec = body.who === "driver" ? db.drivers.find((d) => d.id === body.id) : (db.users || []).find((u) => u.id === body.id);
    if (!rec) throw new Error("Worker not found");
    ["payPlan", "payMethod", "payPhone", "bankName", "bankAccount", "accountName"].forEach((k) => { if (body[k] !== undefined) rec[k] = String(body[k]).trim(); });
    ["tripAllowanceUgx", "monthRateUgx", "perTripUgx", "perSaleUgx", "perSalePct"].forEach((k) => { if (body[k] !== undefined) rec[k] = Number(body[k]) || 0; });
    if (body.who === "driver" && body.payPlan) rec.payType = body.payPlan === "month" ? "month" : "trip";
  }

  if (action === "pay_worker") {
    if (!db.payStubs) db.payStubs = [];
    const kind = body.kind; // trip | month | cane_trip | sale
    const amount = Number(body.amountUgx) || 0;
    if (amount <= 0) throw new Error("Enter the amount to pay");
    const payee = payeeFrom(body, true);
    const today = dayOf(body);
    let role, person, refId = body.refId || "", loadId = "", refLabel = "", drop = "", tag, tripIncome = 0, truckId = "", jobId = "";
    if (kind === "trip" || kind === "month") {
      role = "driver";
      person = db.drivers.find((d) => d.id === body.personId);
      if (!person) throw new Error("Driver not found");
      tag = "trucking";
      if (kind === "trip") {
        const job = db.jobs.find((j) => j.id === refId);
        if (!job || job.driverId !== person.id) throw new Error("Load not found for this driver");
        if (!(["delivered", "invoiced", "paid"].includes(job.status) || job.paid)) throw new Error("Only delivered loads can be paid");
        loadId = job.code || job.id; refLabel = "Trip allowance · Load " + loadId;
        drop = (job.origin || "") + " → " + (job.destination || ""); tripIncome = job.paidUgx || job.rateUgx || job.incomeUgx || 0;
        truckId = job.truckId || ""; jobId = job.id;
      } else {
        if (!/^\d{4}-\d{2}$/.test(refId)) throw new Error("Choose the month");
        refLabel = "Monthly salary · " + new Date(refId + "-15").toLocaleString("en-UG", { month: "long", year: "numeric" });
      }
    } else if (kind === "cane_trip") {
      role = "cane_manager"; tag = "sugarcane";
      person = (db.users || []).find((u) => u.id === body.personId && u.role === "cane_manager");
      const sale = (db.caneSales || []).find((x) => x.id === refId);
      if (!person || !sale) throw new Error("Trip not found");
      refLabel = "Delivered trip · " + (sale.tonnes || 0) + " t · " + sale.date; tripIncome = sale.amountUgx || 0;
    } else if (kind === "sale") {
      role = "passion_manager"; tag = "passion";
      person = (db.users || []).find((u) => u.id === body.personId && u.role === "passion_manager");
      const sale = (db.fruitSales || []).find((x) => x.id === refId);
      if (!person || !sale) throw new Error("Sale not found");
      refLabel = "Fruit sale · " + (sale.kg || 0) + " kg · " + (sale.buyer || "") + " · " + sale.date; tripIncome = sale.amountUgx || 0;
    } else throw new Error("Unknown payment");
    const same = (x) => x.personId === person.id && x.refId === refId && (x.kind === kind || (kind === "cane_trip" && x.role === "cane_manager") || (kind === "sale" && x.role === "passion_manager") || (kind === "trip" && x.kind === "trip"));
    if (db.payStubs.some((x) => same(x) && x.status === "paid" && (x.method || x.paidVia))) throw new Error("This was already paid");
    let stub = db.payStubs.find((x) => same(x) && x.status !== "paid");
    if (!stub) { stub = { id: uid("ps"), requestedAt: today }; db.payStubs.unshift(stub); }
    Object.assign(stub, {
      role, personId: person.id, personName: person.name, kind, refId, refLabel, loadId, drop, tripIncome,
      amountUgx: amount, status: "paid", paidAt: today, year: new Date().getFullYear(), paidVia: "payroll",
      phone: payee.payeePhone, note: body.note || "", ...payee,
    });
    db.cash.unshift({
      id: uid("k"), date: today, direction: "out", amountUgx: amount, tag, category: "employee_pay",
      note: refLabel + " · " + person.name, refId: stub.id, truckId, jobId, driverId: role === "driver" ? person.id : "", ...payee,
    });
    if (body.remember === "1") {
      person.payMethod = payee.method;
      if (payee.payeePhone) person.payPhone = payee.payeePhone;
      if (payee.method === "bank") { person.bankName = payee.bankName; person.bankAccount = payee.bankAccount; }
      person.accountName = payee.payeeName;
    }
    if (role === "driver") {
      const how = (METHOD_NAMES[payee.method] || payee.method) + (payee.payeePhone ? " " + payee.payeePhone : payee.bankAccount ? " · " + payee.bankName + " " + payee.bankAccount : "");
      db.notifications.unshift({ id: uid("n"), toDriverId: person.id, type: "pay", title: "Payment sent", text: refLabel + " · UGX " + amount.toLocaleString("en-UG") + " · " + how, body: refLabel, status: "unread", createdAt: new Date().toISOString() });
    }
  }

  if (action === "send_float") {
    // Admin sends trip money to a driver. This is the ONLY place the money is counted as going out.
    if (!db.disbursements) db.disbursements = [];
    const amount = Number(body.amountUgx) || 0;
    if (amount <= 0) throw new Error("Enter the amount");
    const tag = ["trucking", "sugarcane", "passion"].includes(body.tag) ? body.tag : "trucking";
    const reqPre = body.requestId ? (db.moneyRequests || []).find((r) => r.id === body.requestId) : null;
    const mgrRole = { sugarcane: "cane_manager", passion: "passion_manager" }[tag];
    const drv = tag === "trucking"
      ? db.drivers.find((d) => d.id === (body.toDriverId || body.driverId))
      : (db.users || []).find((u) => u.id === (body.toUserId || (reqPre && reqPre.userId)) && u.role === mgrRole)
        || (!body.toUserId && (db.users || []).find((u) => u.role === mgrRole && u.active !== false));
    if (!drv) throw new Error(tag === "trucking" ? "Choose the driver" : "Choose who receives the money");
    const method = body.method || "mtn_momo";
    const phone = String(body.payeePhone || "").trim();
    if ((method === "mtn_momo" || method === "airtel_money") && !phone) throw new Error("Enter the driver's mobile money number");
    if (method === "bank" && (!String(body.bankName || "").trim() || !String(body.bankAccount || "").trim())) throw new Error("Enter the bank and account number");
    const req = body.requestId ? (db.moneyRequests || []).find((r) => r.id === body.requestId && (r.status === "open" || r.status === "partial")) : null;
    if (body.requestId && !req) throw new Error("This request is already settled");
    const asked = req ? Number(req.amountUgx || req.totalUgx) || 0 : 0;
    const sentBefore = req ? Number(req.sentUgx) || 0 : 0;
    if (req && amount > asked - sentBefore + 0.5) throw new Error("Only UGX " + (asked - sentBefore).toLocaleString("en-UG") + " is still requested. Send extra money without a request.");
    const fl = {
      id: uid("fl"),
      tag,
      activity: body.activity || (req && (req.activity || (req.lines && req.lines[0] && req.lines[0].activity))) || "other",
      amountUgx: amount,
      toDriverId: tag === "trucking" ? drv.id : "",
      toUserId: tag === "trucking" ? "" : drv.id,
      truckId: tag === "trucking" ? body.truckId || drv.assignedTruckId || "" : "",
      jobId: body.jobId || (req && req.jobId) || "",
      caneBuyId: body.caneBuyId || (req && req.caneBuyId) || "",
      blockId: body.blockId || (req && req.blockId) || "",
      note: body.note || (req && req.note) || "",
      status: "sent",
      date: dayOf(body),
      usages: [],
      requestId: req ? req.id : "",
      payeeName: drv.name,
      method,
      payeePhone: method === "mtn_momo" || method === "airtel_money" ? phone : "",
      bankName: method === "bank" ? String(body.bankName).trim() : "",
      bankAccount: method === "bank" ? String(body.bankAccount).trim() : "",
      reference: String(body.reference || "").trim(),
    };
    if (body.saveNumber === "1" && fl.payeePhone) { drv.payPhone = fl.payeePhone; drv.payMethod = method; }
    if (req) {
      req.sentUgx = sentBefore + amount;
      req.floatIds = (req.floatIds || []).concat(fl.id);
      req.floatId = fl.id;
      req.decidedAt = fl.date;
      const short = req.sentUgx < asked;
      req.status = !short ? "sent" : body.final === "1" ? "final" : "partial";
      fl.requestedUgx = asked;
      fl.part = short && body.final !== "1" ? "partial" : short ? "final" : "full";
    }
    db.disbursements.unshift(fl);
    db.cash.unshift({
      id: uid("k"), date: fl.date, direction: "out", amountUgx: amount, tag,
      category: fl.activity, note: "Advance to " + drv.name + (fl.note ? " · " + fl.note : ""),
      truckId: fl.truckId, jobId: fl.jobId, caneBuyId: fl.caneBuyId, blockId: fl.blockId, driverId: fl.toDriverId, userId: fl.toUserId, refId: fl.id,
      payeeName: fl.payeeName, method: fl.method, payeePhone: fl.payeePhone, bankName: fl.bankName, bankAccount: fl.bankAccount, reference: fl.reference,
    });
    const how = (METHOD_NAMES[method] || method) + (fl.payeePhone ? " " + fl.payeePhone : "");
    if (tag === "trucking") db.notifications.unshift({
      id: uid("n"), toDriverId: drv.id, truckId: fl.truckId, type: "float", title: "Money sent",
      text: "Advance UGX " + amount.toLocaleString("en-UG") + " sent by " + how + (req ? (req.status === "partial" ? " (part of your UGX " + asked.toLocaleString("en-UG") + " request, rest to follow)" : req.status === "final" ? " (final for your UGX " + asked.toLocaleString("en-UG") + " request)" : "") : "") + ". Confirm it on Advance.",
      body: "UGX " + amount.toLocaleString("en-UG"), status: "unread", createdAt: new Date().toISOString(),
    });
  }

  if (action === "request_advance") {
    const amount = Number(body.amountUgx) || 0;
    if (amount <= 0) throw new Error("Enter how much you need");
    const tag = TAG_OF_ROLE[user.role];
    if (!tag) throw new Error("No access");
    const drv = user.role === "driver" ? db.drivers.find((d) => d.id === user.driverId) : null;
    if (!db.moneyRequests) db.moneyRequests = [];
    const req = {
      id: uid("mr"), tag, date: todayStr(),
      driverId: user.role === "driver" ? user.driverId : "", userId: user.role === "driver" ? "" : user.id,
      truckId: (drv && drv.assignedTruckId) || "", jobId: body.jobId || "", caneBuyId: body.caneBuyId || "", blockId: body.blockId || "",
      activity: body.activity || "other", amountUgx: amount, totalUgx: amount,
      lines: [{ activity: body.activity || "other", amountUgx: amount }],
      note: String(body.note || "").trim(), status: "open", by: user.name, byRole: user.role,
      neededBy: /^\d{4}-\d{2}-\d{2}$/.test(String(body.neededBy || "")) ? body.neededBy : "", requestedAt: new Date().toISOString(),
    };
    db.moneyRequests.unshift(req);
    db.notifications.unshift({ id: uid("n"), toRole: "admin", type: "money_request", title: "Money request", body: user.name + " · UGX " + amount.toLocaleString("en-UG"), status: "unread", createdAt: new Date().toISOString() });
  }

  if (action === "decline_advance") {
    const req = (db.moneyRequests || []).find((r) => r.id === body.id && r.status === "open");
    if (!req) throw new Error("Request not found");
    req.status = "rejected";
    req.decidedAt = todayStr();
    req.reason = String(body.reason || "").trim();
    if (req.driverId) db.notifications.unshift({ id: uid("n"), toDriverId: req.driverId, type: "float", title: "Request declined", text: "Your request for UGX " + (req.amountUgx || req.totalUgx || 0).toLocaleString("en-UG") + " was declined" + (req.reason ? ": " + req.reason : "."), status: "unread", createdAt: new Date().toISOString() });
  }

  if (action === "log_direct_spend") {
    const tag = user.role === "admin" ? (body.tag || "overhead") : TAG_OF_ROLE[user.role];
    spendFromAdvanceOrCash(db, user, { ...body, floatId: "" }, tag, { caneBuyId: body.caneBuyId || "", blockId: body.blockId || "", jobId: body.jobId || "", truckId: body.truckId || "" });
  }

  if (action === "finalize_request") {
    // Part was sent; the rest will not be paid. Not declined, settled at the amount sent.
    const req = (db.moneyRequests || []).find((r) => r.id === body.id && r.status === "partial");
    if (!req) throw new Error("Request not found");
    req.status = "final";
    req.decidedAt = todayStr();
    req.reason = String(body.reason || "").trim();
    if (req.driverId) db.notifications.unshift({ id: uid("n"), toDriverId: req.driverId, type: "float", title: "Request settled", text: "Your request was settled at UGX " + (req.sentUgx || 0).toLocaleString("en-UG") + " (asked UGX " + (req.amountUgx || req.totalUgx || 0).toLocaleString("en-UG") + ").", status: "unread", createdAt: new Date().toISOString() });
  }

  if (action === "close_advance") {
    const fl = (db.disbursements || []).find((x) => x.id === body.id);
    if (!fl) throw new Error("Advance not found");
    if (fl.status === "closed") throw new Error("Already closed");
    const used = (fl.usages || []).reduce((t, u) => t + (u.amountUgx || 0), 0);
    const left = Math.max(0, fl.amountUgx - used);
    const back = Number(body.returnedUgx) || 0;
    if (back < 0 || back > left) throw new Error("Returned cash can be 0 to " + left.toLocaleString("en-UG"));
    fl.status = "closed";
    fl.closedAt = dayOf(body);
    fl.returnedUgx = back;
    fl.closeNote = String(body.note || "").trim();
    if (back > 0) {
      const who = db.drivers.find((d) => d.id === fl.toDriverId) || (db.users || []).find((u) => u.id === fl.toUserId);
      db.cash.unshift({ id: uid("k"), date: fl.closedAt, direction: "in", amountUgx: back, tag: fl.tag || "trucking", category: "advance_return", method: body.method || "cash", note: "Advance balance returned · " + (who ? who.name : ""), refId: fl.id, driverId: fl.toDriverId || "", userId: fl.toUserId || "", truckId: fl.truckId || "" });
    }
  }

  if (action === "ack_float") {
    const fl = (db.disbursements || []).find((x) => x.id === body.id);
    if (!fl || !ownsFloat(fl, user)) throw new Error("Not found");
    fl.status = "received";
    fl.receivedAt = todayStr();
  }

  if (action === "log_float_use") {
    const fl = (db.disbursements || []).find((x) => x.id === body.id);
    if (!fl || !ownsFloat(fl, user)) throw new Error("Advance not found");
    addFloatUse(db, fl, body, user);
  }

  if (action === "log_trip_result") {
    const job = db.jobs.find((j) => j.id === body.id);
    if (!job) throw new Error("Load not found");
    job.tonnesDelivered = Number(body.tonnesDelivered) || 0;
    job.payPerTonne = Number(body.payPerTonne) || 0;
    job.incomeUgx = Math.round((job.tonnesDelivered || 0) * (job.payPerTonne || 0)) || Number(body.incomeUgx) || job.rateUgx || 0;
    job.status = "delivered";
    job.deliveredAt = job.deliveredAt || dayOf(body);
    job.paid = true; job.paidAt = dayOf(body); job.paidUgx = job.incomeUgx;
    recordJobIncome(db, job, job.incomeUgx, job.paidAt, body.method || "cash");
  }

  if (action === "record_receipt") {
    if (!db.receivables) db.receivables = [];
    const rec = db.receivables.find((r) => r.id === body.id);
    if (!rec) throw new Error("Not found");
    rec.status = "paid";
    rec.paidDate = todayStr();
    db.cash.unshift({
      id: uid("k"),
      date: rec.paidDate,
      direction: "in",
      amountUgx: rec.amountUgx,
      tag: rec.tag,
      method: body.method || "cash",
      note: "Contractor paid · " + (rec.note || rec.id),
      truckId: rec.truckId || "",
      jobId: rec.jobId || "",
      refId: rec.id,
    });
  }
}

// ---- office sync: phones send only what changed; the server merges record by record ----
const KEY_BASE = "conacrew.base.v1";
const SYNC_URL = "/.netlify/functions/sync";
const MEDIA_URL = "/.netlify/functions/media";
const SYNC_LOCAL = new Set(["updatedAt", "mediaTrimmedAt", "_meta"]);
const MEDIA_MIN = 1500;
const isRecList = (v) => Array.isArray(v) && v.every((x) => x && typeof x === "object" && !Array.isArray(x) && (typeof x.id === "string" || typeof x.id === "number"));
function hashOf(v) {
  const s = JSON.stringify(v === undefined ? null : v);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}
// small SHA-256 (for checking a PIN on a phone that is offline)
function sha256hex(str) {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const bytes = Array.from(unescape(encodeURIComponent(str)), (c) => c.charCodeAt(0));
  const l = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (l >>> (i * 8)) & 255);
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    const w = [];
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3); const s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H = H.map((x, i) => (x + [a, b, c, d, e, f, g, h][i]) | 0);
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}
function readBase() {
  try { const b = JSON.parse(localStorage.getItem(KEY_BASE) || "null"); if (b && b.h) return b; } catch (e) {}
  return { seq: 0, skew: 0, h: {}, t: {} };
}
function writeBase(b) { try { localStorage.setItem(KEY_BASE, JSON.stringify(b)); } catch (e) {} }
// What this phone changed since the last sync
function diffBook(db, base) {
  const ch = { set: {}, del: {}, top: {}, topU: {} };
  let n = 0;
  for (const k of Object.keys(db)) {
    if (SYNC_LOCAL.has(k)) continue;
    const v = db[k];
    if (isRecList(v) && !(k in base.t)) {
      const bh = base.h[k] || {};
      const seen = new Set();
      v.forEach((r) => { seen.add(String(r.id)); if (bh[r.id] !== hashOf(r)) { (ch.set[k] = ch.set[k] || []).push(r); n++; } });
      Object.keys(bh).forEach((id) => { if (!seen.has(id)) { (ch.del[k] = ch.del[k] || []).push(id); n++; } });
    } else if (base.t[k] !== hashOf(v)) { ch.top[k] = v; n++; }
  }
  return n ? ch : null;
}
async function liftMediaIn(value, token, depth) {
  depth = depth || 0;
  if (depth > 6 || value == null) return value;
  if (typeof value === "string") {
    if (value.length < MEDIA_MIN || !value.startsWith("data:")) return value;
    const res = await fetch(MEDIA_URL, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify({ data: value }) });
    if (!res.ok) throw Object.assign(new Error("media upload " + res.status), { status: res.status });
    return (await res.json()).url || value;
  }
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) value[i] = await liftMediaIn(value[i], token, depth + 1); return value; }
  if (typeof value === "object") { for (const k of Object.keys(value)) value[k] = await liftMediaIn(value[k], token, depth + 1); return value; }
  return value;
}
const hasDataUrl = (v) => JSON.stringify(v).indexOf('"data:') >= 0;
// Put the office's answer into this phone's book. `pre` holds each record's fingerprint at send time:
// a record edited again while the request was on its way keeps the newer phone copy (it goes up next time).
function applyDelta(db, base, d, pre) {
  const preOf = (k, id) => (pre.h[k] && id in pre.h[k] ? pre.h[k][id] : (pre.base.h[k] || {})[id]);
  let foreign = 0;
  const mine = (k, id) => pre.h[k] && id in pre.h[k];
  if (d.full) {
    const out = {};
    SYNC_LOCAL.forEach((k) => { if (k in db) out[k] = db[k]; });
    base.h = {}; base.t = {};
    for (const [k, recs] of Object.entries(d.set || {})) {
      base.h[k] = {};
      const local = new Map((Array.isArray(db[k]) ? db[k] : []).filter((r) => r && r.id != null).map((r) => [String(r.id), r]));
      const list = [];
      recs.forEach((r) => {
        base.h[k][r.id] = hashOf(r);
        const cur = local.get(String(r.id));
        local.delete(String(r.id));
        if (!pre.replace && cur && preOf(k, r.id) !== undefined && hashOf(cur) !== preOf(k, r.id)) list.push(cur); else { list.push(r); if (!cur || hashOf(cur) !== hashOf(r)) foreign++; }
      });
      // new on this phone while the request was on its way: keep
      if (!pre.replace) local.forEach((r, id) => { if (preOf(k, id) === undefined) list.unshift(r); });
      out[k] = list;
    }
    for (const [k, v] of Object.entries(d.top || {})) { out[k] = v; base.t[k] = hashOf(v); if (hashOf(db[k]) !== base.t[k] && !(pre.t && k in pre.t)) foreign++; }
    if (!pre.replace) for (const k of Object.keys(db)) if (!(k in out)) out[k] = db[k]; // keys the office doesn't have yet
    base.seq = d.seq;
    return { db: out, foreign };
  }
  for (const [k, recs] of Object.entries(d.set || {})) {
    if (!Array.isArray(db[k]) || !isRecList(db[k])) db[k] = [];
    if (!base.h[k]) base.h[k] = {};
    recs.forEach((r) => {
      const i = db[k].findIndex((x) => String(x.id) === String(r.id));
      const cur = i >= 0 ? db[k][i] : null;
      base.h[k][r.id] = hashOf(r);
      if (cur && preOf(k, r.id) !== undefined && hashOf(cur) !== preOf(k, r.id)) return; // edited again meanwhile
      if (!mine(k, r.id)) foreign++;
      if (i >= 0) db[k][i] = r; else db[k].unshift(r);
    });
  }
  for (const [k, ids] of Object.entries(d.del || {})) {
    if (!Array.isArray(db[k])) continue;
    const gone = new Set(ids.map(String));
    const before = db[k].length;
    db[k] = db[k].filter((x) => !gone.has(String(x.id)));
    if (db[k].length !== before) foreign++;
    if (base.h[k]) gone.forEach((id) => { delete base.h[k][id]; });
  }
  for (const [k, v] of Object.entries(d.top || {})) {
    base.t[k] = hashOf(v);
    if (pre.t && k in pre.t && hashOf(db[k]) !== pre.t[k]) continue;
    if (hashOf(db[k]) !== base.t[k]) foreign++;
    db[k] = v;
    if (base.h[k]) delete base.h[k];
  }
  base.seq = d.seq;
  return { db, foreign };
}

const Conacrew = {
  seed: null,
  // background: show the app from this phone's copy straight away and sync with the office behind it
  init(opts) {
    if (!this._local) this._local = this.initLocal();
    if (!this._net) this._net = this._local.then(() => this.initNet());
    return opts && opts.background ? this._local : this._net;
  },
  async initLocal() {
    const res = await fetch("./seed.json");
    this.seed = await res.json();
    if (!localStorage.getItem(KEY_DB)) {
      const fresh = pruneFleet(deep(this.seed));
      fresh.bookVersion = 2;
      fresh.updatedAt = 0; // an empty new phone is never "newer" than the office book
      storeBook(fresh);
    } else {
      const db = JSON.parse(localStorage.getItem(KEY_DB));
      ["fleetTasks", "notifications", "issues", "services", "farmWorks", "receivables", "disbursements", "caneSales", "caneExpenses", "moneyRequests", "jobsTrash", "cargoTypes", "payStubs", "inspections"].forEach((k) => {
        if (!db[k]) db[k] = this.seed[k] || [];
      });
      pruneFleet(db);
      storeBook(db);
    }
  },
  async initNet() {
    await this.probe();
    if (this.server === "empty" || this.token()) await this.syncNow();
    const db = this.db();
    if (hasAdmin(db) && ensureRoster(db)) this.push(db);
    this.autoSync();
  },
  // server: "ok" (office book reachable) | "empty" (server has no book yet) | "none" (no sync server: this phone only)
  //         | "offline" | "signin" (signed in without the office: sign in again to sync)
  server: "",
  lastOk: 0,
  syncing: null,
  again: false,
  token() { const s = this.session(); return (s && s.token) || ""; },
  async probe() {
    try {
      const res = await fetch(SYNC_URL, { cache: "no-store" });
      if (!res.ok) { this.server = res.status === 404 ? "none" : "offline"; return; }
      const j = await res.json().catch(() => null);
      if (!j || j.server !== 2) { this.server = "none"; return; } // old sync function: not supported
      this.server = j.exists ? (this.token() || !this.session() ? "ok" : "signin") : "empty";
    } catch (e) { this.server = "offline"; }
    this.emit();
  },
  emit(name) { try { window.dispatchEvent(new CustomEvent(name || "conacrew:sync", { detail: { server: this.server, lastOk: this.lastOk } })); } catch (e) {} },
  syncNow() {
    if (this.syncing) { this.again = true; return this.syncing; }
    this.syncing = (async () => {
      try { do { this.again = false; await this.syncOnce(); } while (this.again); }
      catch (e) { if (this.server === "ok") this.server = "offline"; }
      finally { this.syncing = null; this.emit(); }
    })();
    return this.syncing;
  },
  async pull() { await this.syncNow(); },
  async syncOnce() {
    if (this.server === "" || this.server === "offline") await this.probe();
    if (this.server === "none" || this.server === "offline") return;
    let db = this.db();
    const base = readBase();
    if (this.server === "empty") {
      // First time: the main admin's phone starts the office book
      const real = this.realUser();
      if (!real || !isMainAdmin(real) || !hasAdmin(db)) return;
      if (hasDataUrl(db)) { await liftMediaIn(db, ""); storeBook(db); }
      const res = await fetch(SYNC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "seed", book: db, userId: real.id, deviceId: deviceId() }) });
      if (res.status === 409) { this.server = "ok"; this.again = true; return; }
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || "seed failed");
      const s = this.session(); s.token = d.token; this.setSession(s);
      const got = applyDelta(db, base, d, { h: {}, t: {}, base: { h: {}, t: {} } });
      base.skew = d.now - Date.now();
      storeBook(pruneFleet(got.db)); writeBase(base);
      this.server = "ok"; this.lastOk = Date.now();
      return;
    }
    const token = this.token();
    if (!token) { this.server = "signin"; return; }
    const fresh = this._fresh;
    const ch = fresh ? null : diffBook(db, base);
    const pre = fresh ? { h: {}, t: {}, base: { h: {}, t: {} }, replace: true } : { h: {}, t: {}, base: JSON.parse(JSON.stringify(base)) };
    if (ch) {
      const at = Date.now() + (base.skew || 0);
      if (base.seq) { Object.values(ch.set).forEach((recs) => recs.forEach((r) => { r._u = at; })); Object.keys(ch.top).forEach((k) => { ch.topU[k] = at; }); }
      ch.delU = {}; Object.entries(ch.del).forEach(([c, ids]) => ids.forEach((id) => { ch.delU[c + ":" + id] = at; }));
      if (hasDataUrl(ch.set) || hasDataUrl(ch.top)) await liftMediaIn(ch, token); // photos go up on their own
      storeBook(db);
      Object.entries(ch.set).forEach(([k, recs]) => { pre.h[k] = {}; recs.forEach((r) => { pre.h[k][r.id] = hashOf(r); }); });
      Object.keys(ch.top).forEach((k) => { pre.t[k] = hashOf(ch.top[k]); });
    }
    const res = await fetch(SYNC_URL, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ op: "sync", since: fresh ? 0 : base.seq, changes: ch || {} }) });
    if (res.status === 401) {
      // token expired, phone removed or login turned off: this person must sign in again
      const s = this.session(); if (s) { delete s.token; this.setSession(s); }
      this.logout(); this.server = "ok"; this.emit("conacrew:signin"); return;
    }
    const d = await res.json();
    if (d.empty) { this.server = "empty"; this.again = true; return; }
    if (!res.ok || d.error) throw new Error(d.error || "sync failed");
    db = this.db(); // the phone may have saved more while waiting
    const got = applyDelta(db, base, d, pre);
    base.skew = d.now - Date.now();
    storeBook(pruneFleet(got.db)); writeBase(base);
    this._fresh = false;
    this.server = "ok"; this.lastOk = Date.now();
    if (got.foreign) this.emit("conacrew:changed");
  },
  autoSync() {
    if (this._auto || typeof window === "undefined") return;
    this._auto = true;
    const tick = () => { if (!document.hidden && this.session() && this.server !== "none") this.syncNow(); };
    setInterval(tick, 45000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
    window.addEventListener("online", () => { this.server = ""; tick(); });
  },
  push(db) {
    if (!hasAdmin(db)) { storeBook(db); return; } // never upload an empty book
    db.updatedAt = Date.now();
    storeBook(db);
    if (this.server === "none") return;
    clearTimeout(this._pushT);
    this._pushT = setTimeout(() => this.syncNow(), 300);
  },
  setSession(s) { try { localStorage.setItem(KEY_USER, JSON.stringify(s)); sessionStorage.removeItem(KEY_USER); } catch (e) {} },
  db() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(KEY_DB) || "null"); } catch (e) {}
    return pruneFleet(db || deep(this.seed));
  },
  save(db) {
    this.push(db);
  },
  reset() {
    localStorage.setItem(KEY_DB, JSON.stringify(pruneFleet(deep(this.seed))));
    localStorage.removeItem(KEY_USER);
  },
  session() {
    let raw = null;
    try { raw = localStorage.getItem(KEY_USER) || sessionStorage.getItem(KEY_USER); } catch (e) {}
    return raw ? JSON.parse(raw) : null;
  },
  // "View as" (admins, look only): see the app as another person without their PIN
  viewing() {
    let id = "";
    try { id = sessionStorage.getItem("conacrew.viewAs") || ""; } catch (e) {}
    return id;
  },
  viewAs(userId) { try { sessionStorage.setItem("conacrew.viewAs", userId); } catch (e) {} },
  stopViewing() { try { sessionStorage.removeItem("conacrew.viewAs"); } catch (e) {} },
  realUser() {
    const s = this.session();
    if (!s) return null;
    const u = this.db().users.find((x) => x.id === s.userId && x.active !== false) || null;
    if (!u) return null;
    if (u.role !== s.role) return null;
    if (u.role === "driver") {
      if (!u.driverId || u.driverId !== s.driverId) return null;
    }
    if (!isMainAdmin(u)) {
      if (!s.at || Date.now() - s.at > SESSION_HOURS * 3600e3) { this.logout(); return null; } // sign in again every 24h
      if (u.lockedAt) { this.logout(); return null; }
      if (!deviceOk(this.db(), u, s.deviceId)) { this.logout(); return null; } // phone removed by admin
    }
    return u;
  },
  user() {
    const real = this.realUser();
    if (!real) return null;
    const v = real.role === "admin" ? this.viewing() : "";
    if (v && v !== real.id) {
      const target = this.db().users.find((x) => x.id === v);
      if (target) return target;
    }
    return real;
  },
  createOwner(name, phone, pin) {
    const n = String(name || "").trim();
    const p = phoneKey(phone);
    const code = String(pin || "").trim();
    if (!n || !p || !/^\d{6}$/.test(code)) throw new Error("Enter your name, phone, and a 6-digit PIN.");
    const db = this.db();
    if ((db.users || []).some((u) => u.role === "admin")) throw new Error("Admin already exists.");
    db.users.unshift({ id: uid("u"), name: n, phone: p, pin: code, role: "admin", active: true });
    db.bookVersion = 2;
    this.save(db);
  },
  async login(phone, pin, gps, probe) {
    const p = phoneKey(phone);
    if (!p) throw new Error("Enter your phone number.");
    if (!this.server || this.server === "offline") await this.probe();
    if (this.server === "ok" || this.server === "signin") {
      let j;
      try {
        const res = await fetch(SYNC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "login", phone: p, pin: String(pin || "").trim(), deviceId: deviceId(), label: deviceLabel(), ...(gps ? { gps } : {}), ...(probe ? { probe: true } : {}) }) });
        j = await res.json();
      } catch (e) {
        this.server = "offline";
        return this.localLogin(phone, pin); // no signal: check the PIN on this phone, sync later
      }
      if (j.empty) { this.server = "empty"; return this.localLogin(phone, pin); }
      if (j.needLocation) { const e = new Error(j.error || "Turn on location to sign in."); e.needLocation = true; throw e; }
      if (j.error) throw new Error(j.error);
      if (j.needsApproval) return { ok: false, needsApproval: true, name: j.name };
      const prev = this.session();
      if (!prev || prev.userId !== j.user.id || !prev.token) this._fresh = true; // new person on this phone: take the office copy
      this.setSession({ userId: j.user.id, role: j.user.role, driverId: j.user.driverId || null, at: Date.now(), deviceId: deviceId(), token: j.token });
      this.stopViewing();
      this.server = "ok";
      try { await this.syncNow(); } catch (e) {}
      const u = this.db().users.find((x) => x.id === j.user.id);
      if (!u) throw new Error("Signed in, but this phone could not load the office book. Check the connection and try again.");
      return { ok: true, role: j.user.role, name: j.user.name, home: homeFor(j.user.role) };
    }
    return this.localLogin(phone, pin);
  },
  localLogin(phone, pin) {
    const p = phoneKey(phone);
    if (!p) throw new Error("Enter your phone number.");
    // this phone also counts wrong tries (offline sign-in): 3 wrong, then 2 hours
    let g = {};
    try { g = JSON.parse(localStorage.getItem("conacrew.guard") || "{}") || {}; } catch (e) {}
    const db = this.db();
    const matches = db.users.filter((u) => phoneKey(u.phone) === p);
    const user = matches.find((u) => u.active !== false) || matches[0];
    if (!isMainAdmin(user) && (g.until || 0) > Date.now()) throw new Error("Sign-in isn't available right now. Try again later.");
    const fail = (msg, result) => { logSignIn(db, user, result, user ? {} : { phone: p }); this.save(db); throw new Error(msg); };
    const pinOk = !!user && (user.pin ? String(user.pin) === String(pin || "").trim() : !!user.pinHash && sha256hex(user.id + ":" + String(pin || "").trim()) === user.pinHash);
    const main = isMainAdmin(user);
    if (!pinOk && isMainAdmin(user)) fail("Phone or PIN is wrong.", "wrong_pin");
    if (!pinOk) {
      if (!g.t0 || Date.now() - g.t0 > 2 * 3600e3) g = { n: 0, t0: Date.now() };
      g.n++; if (g.n >= 3) g.until = Date.now() + 2 * 3600e3;
      try { localStorage.setItem("conacrew.guard", JSON.stringify(g)); } catch (e) {}
      if (user && (user.pin || user.pinHash) && !main) {
        user.failCount = (user.failCount || 0) + 1;
        if (user.failCount >= MAX_TRIES && !user.lockedAt) user.lockedAt = new Date().toISOString();
      }
      fail("Phone or PIN is wrong.", !user ? "unknown_phone" : "wrong_pin");
    }
    try { localStorage.removeItem("conacrew.guard"); } catch (e) {}
    if (user.active === false) fail("This login is turned off. Ask the admin.", "turned_off");
    if (!main && user.lockedAt) fail("This login is locked. Ask the admin to unlock it.", "locked");
    if (user.role === "driver" && !user.driverId) throw new Error("This driver login is not linked to a driver record.");
    user.failCount = 0;
    const dev = deviceId();
    if (!main && !deviceOk(db, user, dev)) {
      // new phone: ask the admin to approve it
      user.pendingDevices = (user.pendingDevices || []).filter((d) => d.id !== dev);
      user.pendingDevices.push({ id: dev, label: deviceLabel(), requestedAt: new Date().toISOString() });
      logSignIn(db, user, "new_phone");
      this.save(db);
      return { ok: false, needsApproval: true, name: user.name };
    }
    logSignIn(db, user, "ok");
    this.save(db);
    this.setSession({ userId: user.id, role: user.role, driverId: user.driverId || null, at: Date.now(), deviceId: dev });
    this.stopViewing();
    return { ok: true, role: user.role, name: user.name, home: homeFor(user.role) };
  },
  logout() {
    this.flush();
    try { localStorage.removeItem(KEY_USER); sessionStorage.removeItem(KEY_USER); } catch (e) {}
    this.stopViewing();
  },
  // send anything not yet synced before this person leaves the phone
  flush() {
    try {
      const token = this.token();
      if (!token || this.server === "none") return;
      const base = readBase();
      const ch = diffBook(this.db(), base);
      if (!ch || hasDataUrl(ch)) return;
      const at = Date.now() + (base.skew || 0);
      if (base.seq) { Object.values(ch.set).forEach((recs) => recs.forEach((r) => { r._u = at; })); Object.keys(ch.top).forEach((k) => { ch.topU[k] = at; }); }
      fetch(SYNC_URL, { method: "POST", keepalive: true, headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ op: "sync", since: base.seq, changes: ch }) }).catch(() => {});
    } catch (e) {}
  },
  bootstrap() {
    const user = this.user();
    if (!user) throw Object.assign(new Error("Sign in required"), { status: 401 });
    const data = scopedDb(this.db(), user);
    const real = this.realUser();
    if (real && real.id !== user.id) data.viewingAs = { by: real.name, name: user.name, role: user.role };
    return data;
  },
  act(action, payload) {
    const real = this.realUser();
    if (real && this.user() && this.user().id !== real.id) throw new Error("Look only: you're viewing as someone else. Go back to your own view to make changes.");
    const user = this.user();
    if (!user) throw Object.assign(new Error("Sign in required"), { status: 401 });
    const db = this.db();
    applyAction(db, user, { action, ...payload });
    this.save(db);
    return scopedDb(db, user);
  },
};

window.Conacrew = Conacrew;
