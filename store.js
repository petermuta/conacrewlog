const KEY_DB = "conacrew.db.v1";
const KEY_USER = "conacrew.user.v2";


function phoneKey(v) {
  let p = String(v || "").replace(/[^\d]/g, "");
  if (p.startsWith("256")) p = "0" + p.slice(3);
  if (p.length === 9) p = "0" + p;
  return p;
}
function ensureDriverLogins(db) {
  const pairs = [
    { name: "Meddy", phone: "0700000002", pin: "drive123", driverId: "d-musa", userId: "u-driver-musa", truckId: "t-001" },
    { name: "Paul", phone: "0700000005", pin: "drive123", driverId: "d-ali", userId: "u-driver-ali", truckId: "t-002" },
  ];
  if (!db.users) db.users = [];
  if (!db.drivers) db.drivers = [];
  pairs.forEach((p) => {
    let d = db.drivers.find((x) => x.name === p.name) || db.drivers.find((x) => x.id === p.driverId);
    if (!d) {
      d = { id: p.driverId, userId: p.userId, name: p.name, phone: p.phone, licenceClass: "CM", licenceExpiry: "", assignedTruckId: p.truckId, advanceUgx: 0, payType: "trip", monthRateUgx: 0 };
      db.drivers.push(d);
    }
    d.userId = p.userId;
    d.phone = p.phone;
    if (!d.assignedTruckId) d.assignedTruckId = p.truckId;
    let u = db.users.find((x) => x.id === p.userId) || db.users.find((x) => x.role === "driver" && x.name === p.name);
    if (!u) {
      u = { id: p.userId, name: p.name, phone: p.phone, pin: p.pin, role: "driver", driverId: d.id, active: true };
      db.users.push(u);
    }
    u.id = p.userId;
    u.name = p.name;
    u.phone = p.phone;
    u.pin = u.pin || p.pin;
    u.role = "driver";
    u.driverId = d.id;
    u.active = true;
    const truck = (db.trucks || []).find((t) => t.id === d.assignedTruckId);
    if (truck) truck.assignedDriverId = d.id;
  });
  return db;
}
function pruneFleet(db) {
  const keep = [
    { id: "t-001", plate: "UA 687BH", driverId: "d-musa", driver: "Meddy", phone: "0700000002", hp: 370 },
    { id: "t-002", plate: "UA 764AN", driverId: "d-ali", driver: "Paul", phone: "0700000005", hp: 420 },
  ];
  if (!db.trucks) db.trucks = [];
  if (!db.drivers) db.drivers = [];
  keep.forEach((k) => {
    if (!db.trucks.some((t) => t.plate === k.plate || t.id === k.id)) {
      db.trucks.push({ id: k.id, plate: k.plate, model: "Sinotruk HOWO 6x4", year: 2021, odometerKm: 0, kmPerLitre: 2.2, status: "idle", nextServiceKm: 5000, assignedDriverId: k.driverId, hp: k.hp });
    }
    if (!db.drivers.some((d) => d.name === k.driver || d.id === k.driverId)) {
      db.drivers.push({ id: k.driverId, name: k.driver, phone: k.phone, assignedTruckId: k.id, payType: "trip", monthRateUgx: 0 });
    }
  });
  const keepPlates = keep.map((k) => k.plate);
  const keepNames = keep.map((k) => k.driver);
  db.trucks = db.trucks.filter((t) => keepPlates.includes((t.plate || "").replace(/\s+/g, " ").trim()));
  db.drivers = db.drivers.filter((d) => keepNames.includes(d.name));
  const keepTruck = new Set(db.trucks.map((t) => t.id));
  const keepDrv = new Set(db.drivers.map((d) => d.id));
  db.users = (db.users || []).filter((u) => u.role !== "driver" || keepNames.includes(u.name));
  db.jobs = (db.jobs || []).filter((j) => keepTruck.has(j.truckId) || keepDrv.has(j.driverId));
  db.jobsTrash = (db.jobsTrash || []).filter((j) => keepTruck.has(j.truckId) || keepDrv.has(j.driverId));
  db.fuelLogs = (db.fuelLogs || []).filter((f) => keepTruck.has(f.truckId) || keepDrv.has(f.driverId));
  db.fleetTasks = (db.fleetTasks || []).filter((t) => keepTruck.has(t.truckId) || keepDrv.has(t.driverId));
  db.inspections = (db.inspections || []).filter((t) => keepTruck.has(t.truckId) || keepDrv.has(t.driverId));
  db.issues = (db.issues || []).filter((t) => keepTruck.has(t.truckId) || keepDrv.has(t.driverId));
  db.services = (db.services || []).filter((t) => keepTruck.has(t.truckId));
  db.disbursements = (db.disbursements || []).filter((t) => !t.toDriverId || keepDrv.has(t.toDriverId));
  ensureDriverLogins(db);
  return db;
}
function nextLoadCode(db, date, plate) {
  const day = date || new Date().toISOString().slice(0, 10);
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
  return new Date("2026-09-22T00:00:00");
}

function publicUser(user) {
  return { id: user.id, name: user.name, phone: user.phone, role: user.role, driverId: user.driverId };
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
    if (t.insuranceExpiry && t.insuranceExpiry <= "2026-10-15") {
      alerts.push({ id: "ins-" + t.id, tone: "warn", text: t.plate + " insurance due " + t.insuranceExpiry, href: "#trucks" });
    }
    if (t.roadLicenceExpiry && t.roadLicenceExpiry <= "2026-10-15") {
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
  return alerts.slice(0, 8);
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
      payStubs: (db.payStubs || []).filter((x) => x.personId === myId),
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
      moneyRequests: (db.moneyRequests || []).filter((r) => r.tag === "sugarcane"),
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
  };
}

function roleAllowedAction(role, action) {
  const map = {
    admin: ["pay_stub", "create_job", "update_job", "add_contractor", "save_truck", "save_driver", "mark_job_paid", "log_scale", "log_invoice", "add_cargo_type", "trash_job", "restore_job", "purge_job", "log_fuel", "create_cane_buy", "update_cane_buy", "record_mill", "pay_seller", "create_cane_sale", "log_cane_expense", "request_money", "decide_request", "log_harvest", "add_field_log", "log_farm_work", "create_fruit_sale", "record_sale_pay", "record_sale_expense", "add_cash", "record_receipt", "send_float", "create_fleet_task", "update_fleet_task", "log_service", "report_issue", "reply_issue"],
    driver: ["submit_inspect", "request_pay", "update_job", "log_fuel", "ack_fleet_task", "complete_fleet_task", "report_issue", "ack_float", "log_float_use", "log_trip_result", "create_job", "add_contractor", "mark_job_paid", "log_scale", "log_invoice", "add_cargo_type", "trash_job"],
    cane_manager: ["request_pay", "create_cane_buy", "update_cane_buy", "record_mill", "pay_seller", "create_cane_sale", "log_cane_expense", "request_money"],
    passion_manager: ["request_pay", "log_harvest", "add_field_log", "log_farm_work", "create_fruit_sale", "record_sale_pay", "record_sale_expense"],
  };
  return (map[role] || []).includes(action);
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
      if (job.paid || job.incomeUgx) throw new Error("Paid load stays. Ask the owner.");
    }
    if (body.driverId && body.driverId !== user.driverId) throw new Error("No access");
  }

  if (action === "save_truck") {
    if (!db.trucks) db.trucks = [];
    let t = body.id ? db.trucks.find((x) => x.id === body.id) : null;
    if (!t) {
      t = { id: uid("t"), plate: body.plate, model: body.model || "Sinotruk HOWO", year: Number(body.year) || 2021, odometerKm: Number(body.odometerKm) || 0, kmPerLitre: 2.9, hp: Number(body.hp)||370, status: "idle", nextServiceKm: Number(body.nextServiceKm) || 0, insuranceExpiry: body.insuranceExpiry || "", roadLicenceExpiry: body.roadLicenceExpiry || "", assignedDriverId: body.assignedDriverId || "" };
      db.trucks.unshift(t);
    } else {
      ["plate","model","assignedDriverId","status"].forEach((k) => { if (body[k] !== undefined && body[k] !== "") t[k] = body[k]; });
      if (body.odometerKm) t.odometerKm = Number(body.odometerKm);
      if (body.nextServiceKm) t.nextServiceKm = Number(body.nextServiceKm);
    }
    if (t.assignedDriverId) {
      db.drivers.forEach((d) => {
        if (d.id === t.assignedDriverId) d.assignedTruckId = t.id;
        else if (d.assignedTruckId === t.id && d.id !== t.assignedDriverId) d.assignedTruckId = "";
      });
    }
  }
  if (action === "save_driver") {
    if (!db.drivers) db.drivers = [];
    let d = body.id ? db.drivers.find((x) => x.id === body.id) : null;
    if (!d) {
      const u = { id: uid("u"), name: body.name, phone: body.phone || "", pin: body.pin || "drive123", role: "driver", driverId: "", active: true };
      d = { id: uid("d"), userId: u.id, name: body.name, phone: body.phone || "", licenceClass: body.licenceClass || "CM", licenceExpiry: body.licenceExpiry || "", assignedTruckId: body.assignedTruckId || "", advanceUgx: 0, payType: body.payType || "trip", monthRateUgx: Number(body.monthRateUgx)||0 };
      u.driverId = d.id;
      db.users.push(u);
      db.drivers.unshift(d);
    } else {
      d.name = body.name || d.name;
      if (body.phone) d.phone = body.phone;
      if (body.assignedTruckId !== undefined) d.assignedTruckId = body.assignedTruckId;
      if (body.payType) d.payType = body.payType;
      if (body.monthRateUgx !== undefined && body.monthRateUgx !== "") d.monthRateUgx = Number(body.monthRateUgx);
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
    const startDate = body.startDate || new Date().toISOString().slice(0, 10);
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
      source: user.role === "driver" ? "driver" : "owner",
      tonnesDelivered: Number(body.tonnes) || 0,
      fuelLitres: Number(body.fuelLitres) || 0,
      fuelCostUgx: Number(body.fuelCostUgx) || 0,
      dieselUgxPerLitre: Number(body.dieselUgxPerLitre) || db.dieselDefaultUgx || 0,
      kmToPickup: Number(body.kmToPickup) || 0,
      kmHaul: Number(body.kmHaul) || 0,
    });
    const job0 = db.jobs[0];
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
      throw new Error("Paid load stays. Ask the owner.");
    }
    db.jobs.splice(i, 1);
    db.jobsTrash.unshift({ ...job, deletedAt: new Date().toISOString().slice(0, 10), deletedBy: user.name });
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
      requestedAt: new Date().toISOString().slice(0, 10),
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
        requestedAt: new Date().toISOString().slice(0, 10),
        paidAt: body.status === "pending" ? "" : new Date().toISOString().slice(0, 10),
        year: new Date().getFullYear(),
      });
    } else {
      const st = db.payStubs.find((x) => x.id === body.id);
      if (!st) throw new Error("Stub not found");
      st.status = body.status || "paid";
      if (st.status === "paid") {
        st.paidAt = new Date().toISOString().slice(0, 10);
        const drv = db.drivers.find((d) => d.id === st.personId);
        const phone = (drv && drv.phone) || st.phone || "";
        if (!db.notifications) db.notifications = [];
        db.notifications.unshift({
          id: uid("n"),
          toDriverId: st.personId,
          type: "pay",
          title: "Payment sent",
          body: "Payment for load " + (st.refLabel || st.refId) + " has been paid" + (phone ? " to " + phone : "") + ".",
          status: "unread",
          createdAt: new Date().toISOString(),
        });
      }
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
    job.scaledAt = new Date().toISOString().slice(0, 10);
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
    job.invoicedAt = new Date().toISOString().slice(0, 10);
    if (body.paidNow === "1" || body.paidNow === true) {
      job.paid = true;
      job.status = "paid";
      job.paidAt = job.invoicedAt;
      job.paidUgx = amount;
      db.cash.unshift({ id: uid("k"), date: job.paidAt, direction: "in", amountUgx: amount, tag: "trucking", method: "invoice", note: "Load " + (job.code || job.id), refId: job.id, truckId: job.truckId });
    }
    if (!db.notifications) db.notifications = [];
    db.notifications.unshift({ id: uid("n"), toRole: "admin", type: "invoice", title: job.paid ? "Load paid" : "Invoice in", body: (job.code || job.id) + " · UGX " + amount.toLocaleString("en-UG"), status: "unread", createdAt: new Date().toISOString() });
  }

  if (action === "mark_job_paid") {
    const job = db.jobs.find((j) => j.id === body.id);
    if (!job) throw new Error("Load not found");
    job.paid = true;
    job.status = "paid";
    job.paidAt = body.paidAt || new Date().toISOString().slice(0, 10);
    job.paidUgx = Number(body.paidUgx) || job.rateUgx || job.incomeUgx || 0;
    if (job.paidUgx && !(db.cash || []).some((c) => c.refId === job.id && c.direction === "in")) {
      db.cash.unshift({ id: uid("k"), date: job.paidAt, direction: "in", amountUgx: job.paidUgx, tag: "trucking", method: "invoice", note: "Load " + (job.code || job.id), refId: job.id, truckId: job.truckId });
    }
  }

  if (action === "add_cargo_type") {
    if (!db.cargoTypes) db.cargoTypes = [];
    const name = (body.name || "").trim();
    if (name && !db.cargoTypes.some((x) => x.toLowerCase() === name.toLowerCase())) db.cargoTypes.unshift(name);
  }

  if (action === "update_job") {
    const job = db.jobs.find((j) => j.id === body.id);
    if (!job) throw new Error("Job not found");
    if (user.role === "driver" && job.driverId !== user.driverId) throw new Error("No access");
    job.status = body.status;
    const truck = db.trucks.find((t) => t.id === job.truckId);
    if (truck) {
      if (body.status === "loading") truck.status = "loading";
      else if (body.status === "en_route") truck.status = "on_trip";
      else if (["delivered", "invoiced", "paid"].includes(body.status)) truck.status = "idle";
    }
    if (body.status === "delivered") {
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
          refLabel: (job.code || job.id) + " · " + (job.cargo || "Load"),
          amountUgx: job.rateUgx || job.paidUgx || job.incomeUgx || 0,
          status: "pending",
          requestedAt: new Date().toISOString().slice(0, 10),
          paidAt: "",
          year: new Date().getFullYear(),
        });
      }
    }
    if (body.status === "paid") {
      db.cash.unshift({
        id: uid("k"),
        date: new Date().toISOString().slice(0, 10),
        direction: "in",
        amountUgx: job.rateUgx,
        tag: "trucking",
        method: body.method || "cash",
        note: "Job " + job.id + " paid",
        refId: job.id,
      });
    }
  }

  if (action === "log_fuel") {
    const driverId = user.role === "driver" ? user.driverId : body.driverId;
    const log = {
      id: uid("f"),
      truckId: body.truckId,
      driverId,
      litres: Number(body.litres) || 0,
      amountUgx: Number(body.amountUgx) || 0,
      odometerKm: Number(body.odometerKm) || 0,
      station: body.station || "",
      date: body.date || new Date().toISOString().slice(0, 10),
    };
    db.fuelLogs.unshift(log);
    const truck = db.trucks.find((t) => t.id === log.truckId);
    if (truck && log.odometerKm > truck.odometerKm) truck.odometerKm = log.odometerKm;
    db.cash.unshift({
      id: uid("k"),
      date: log.date,
      direction: "out",
      amountUgx: log.amountUgx,
      tag: "trucking",
      method: "cash",
      note: "Fuel " + (truck?.plate || log.truckId),
      refId: log.id,
    });
  }

  if (action === "create_cane_buy") {
    const type = body.type === "trip" ? "trip" : "acre";
    const kmPerLitre = Number(body.kmPerLitre) || 3.1;
    const diesel = Number(body.dieselUgxPerLitre) || db.dieselDefaultUgx;
    const transportKm = Number(body.transportKm) || 0;
    const fuel = estimateFuel(transportKm, kmPerLitre, diesel);
    const acres = type === "acre" ? Number(body.acres) || 0 : undefined;
    const trips = type === "trip" ? Number(body.tripsAgreed) || 0 : undefined;
    db.caneBuys.unshift({
      id: uid("cb"),
      type,
      sellerId: body.sellerId,
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
      createdAt: new Date().toISOString().slice(0, 10),
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
    buy.sellerPaid = true;
    buy.payMethod = body.method || "mtn_momo";
    buy.status = buy.millPaid ? "settled" : "seller_paid";
    db.cash.unshift({
      id: uid("k"),
      date: new Date().toISOString().slice(0, 10),
      direction: "out",
      amountUgx: buy.buyPriceUgx,
      tag: "sugarcane",
      method: buy.payMethod,
      note: "Paid seller for " + buy.id,
      refId: buy.id,
    });
  }

  if (action === "create_cane_sale") {
    if (!db.caneSales) db.caneSales = [];
    const tonnes = Number(body.tonnes) || 0;
    const price = Number(body.pricePerTonne) || 0;
    if (tonnes <= 0 || price <= 0) throw new Error("Enter tonnes and price");
    const sale = {
      id: uid("cs"),
      date: body.date || new Date().toISOString().slice(0, 10),
      millId: body.millId || "",
      buyId: body.buyId || "",
      tonnes,
      pricePerTonne: price,
      amountUgx: Math.round(tonnes * price),
      method: body.method || "cash",
      note: body.note || "",
      by: user.name,
      cuttingCostUgx: Number(body.cuttingCostUgx) || 0,
      loadingCostUgx: Number(body.loadingCostUgx) || 0,
      transportUgx: Number(body.transportUgx) || 0,
    };
    db.caneSales.unshift(sale);
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
      date: body.date || new Date().toISOString().slice(0, 10),
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
      date: new Date().toISOString().slice(0, 10),
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
    req.decidedAt = new Date().toISOString().slice(0, 10);
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
      date: body.date || new Date().toISOString().slice(0, 10),
      costUgx: Number(body.costUgx) || 0,
      kg,
      note: body.note || "",
      by: user.name,
    };
    db.farmWorks.unshift(rec);
    if (rec.costUgx > 0) {
      db.cash.unshift({
        id: uid("k"),
        date: rec.date,
        direction: "out",
        amountUgx: rec.costUgx,
        tag: "passion",
        method: body.method || "cash",
        note: rec.kind + " " + rec.blockId,
        refId: rec.id,
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
      date: body.date || new Date().toISOString().slice(0, 10),
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
        date: new Date().toISOString().slice(0, 10),
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
        date: new Date().toISOString().slice(0, 10),
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
    const task = {
      id: uid("ft"),
      truckId: truck.id,
      driverId,
      kind: body.kind || "other",
      note: body.note || "",
      part: body.part || "",
      dueDate: body.dueDate || "",
      priority: body.priority === "urgent" ? "urgent" : "normal",
      status: "open",
      createdBy: user.name,
      createdAt: new Date().toISOString().slice(0, 10),
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
        title: task.priority === "urgent" ? "Urgent from owner" : "New work from owner",
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

  if (action === "ack_fleet_task") {
    const task = db.fleetTasks.find((t) => t.id === body.id);
    if (!task) throw new Error("Task not found");
    task.status = "seen";
    task.seenAt = new Date().toISOString().slice(0, 10);
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
      date: body.date || new Date().toISOString().slice(0, 10),
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
    task.status = "done";
    task.doneAt = new Date().toISOString().slice(0, 10);
    task.driverNote = body.driverNote || body.note || "";
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
      title: "Driver finished a truck task",
      body: task.title + (task.driverNote ? " — " + task.driverNote : ""),
      status: "unread",
      createdAt: new Date().toISOString(),
    });
  }

  if (action === "log_service") {
    const truck = db.trucks.find((t) => t.id === body.truckId);
    if (!truck) throw new Error("Truck not found");
    const rec = {
      id: uid("sv"),
      truckId: truck.id,
      date: body.date || new Date().toISOString().slice(0, 10),
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
      date: new Date().toISOString().slice(0, 10),
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
        title: "Owner flagged a truck issue",
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
      date: new Date().toISOString().slice(0, 10),
    });
    issue.status = body.close ? "closed" : "replied";
    if (issue.driverId) {
      db.notifications.unshift({
        id: uid("n"),
        toDriverId: issue.driverId,
        truckId: issue.truckId,
        type: "reply",
        title: "Owner reply",
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
      date: body.date || new Date().toISOString().slice(0, 10),
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
    };
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

  if (action === "send_float") {
    if (!db.disbursements) db.disbursements = [];
    const amount = Number(body.amountUgx) || 0;
    if (amount <= 0) throw new Error("Enter amount");
    const fl = {
      id: uid("fl"),
      tag: body.tag || "trucking",
      activity: body.activity || "to_driver",
      amountUgx: amount,
      toDriverId: body.toDriverId || body.driverId || "",
      truckId: body.truckId || "",
      jobId: body.jobId || "",
      note: body.note || "",
      status: "sent",
      date: body.date || new Date().toISOString().slice(0, 10),
      usages: [],
    };
    db.disbursements.unshift(fl);
    db.cash.unshift({
      id: uid("k"),
      date: fl.date,
      direction: "out",
      amountUgx: amount,
      tag: fl.tag,
      method: body.method || "cash",
      note: fl.note || ("Sent to driver"),
      category: fl.activity,
      truckId: fl.truckId,
      jobId: fl.jobId,
      refId: fl.id,
    });
    if (fl.toDriverId) {
      db.notifications.unshift({
        id: uid("n"),
        toDriverId: fl.toDriverId,
        truckId: fl.truckId,
        type: "float",
        title: "Money sent",
        body: "UGX " + amount.toLocaleString("en-UG"),
        status: "unread",
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (action === "ack_float") {
    const fl = (db.disbursements || []).find((x) => x.id === body.id);
    if (!fl) throw new Error("Not found");
    fl.status = "received";
    fl.receivedAt = new Date().toISOString().slice(0, 10);
  }

  if (action === "log_float_use") {
    const fl = (db.disbursements || []).find((x) => x.id === body.id);
    if (!fl) throw new Error("Not found");
    const amount = Number(body.amountUgx) || 0;
    if (amount <= 0) throw new Error("Enter amount used");
    const usedSoFar = (fl.usages || []).reduce((s, u) => s + (u.amountUgx || 0), 0);
    const left = fl.amountUgx - usedSoFar;
    if (amount > left + 0.5) throw new Error("Only " + left + " UGX left on this send");
    const use = {
      id: uid("fu"),
      amountUgx: amount,
      category: body.category || "other",
      note: body.note || body.otherNote || "",
      date: new Date().toISOString().slice(0, 10),
      photo: body.photo || "",
    };
    fl.usages = fl.usages || [];
    fl.usages.unshift(use);
    const used = usedSoFar + amount;
    fl.status = used >= fl.amountUgx ? "spent" : "received";
  }

  if (action === "log_trip_result") {
    const job = db.jobs.find((j) => j.id === body.id);
    if (!job) throw new Error("Job not found");
    job.tonnesDelivered = Number(body.tonnesDelivered) || 0;
    job.payPerTonne = Number(body.payPerTonne) || 0;
    job.incomeUgx = Math.round((job.tonnesDelivered || 0) * (job.payPerTonne || 0)) || Number(body.incomeUgx) || job.rateUgx || 0;
    job.status = "delivered";
    job.paid = true;
    db.cash.unshift({
      id: uid("k"),
      date: new Date().toISOString().slice(0, 10),
      direction: "in",
      amountUgx: job.incomeUgx,
      tag: "trucking",
      method: body.method || "cash",
      note: (job.cargo || "Trip") + " · " + job.tonnesDelivered + " t",
      truckId: job.truckId,
      jobId: job.id,
    });
  }

  if (action === "record_receipt") {
    if (!db.receivables) db.receivables = [];
    const rec = db.receivables.find((r) => r.id === body.id);
    if (!rec) throw new Error("Not found");
    rec.status = "paid";
    rec.paidDate = new Date().toISOString().slice(0, 10);
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

const Conacrew = {
  seed: null,
  async init() {
    if (this.seed) return;
    const res = await fetch("./seed.json");
    this.seed = await res.json();
    if (!localStorage.getItem(KEY_DB)) localStorage.setItem(KEY_DB, JSON.stringify(pruneFleet(deep(this.seed))));
    else {
      const db = JSON.parse(localStorage.getItem(KEY_DB));
      let changed = false;
      ["fleetTasks", "notifications", "issues", "services", "farmWorks", "receivables", "disbursements", "caneSales", "caneExpenses", "moneyRequests", "jobsTrash", "cargoTypes", "payStubs", "inspections"].forEach((k) => {
        if (!db[k]) {
          db[k] = this.seed[k] || [];
          changed = true;
        }
      });
      pruneFleet(db);
      localStorage.setItem(KEY_DB, JSON.stringify(db));
    }
  },
  db() {
    return JSON.parse(localStorage.getItem(KEY_DB) || "null") || deep(this.seed);
  },
  save(db) {
    localStorage.setItem(KEY_DB, JSON.stringify(db));
  },
  reset() {
    localStorage.setItem(KEY_DB, JSON.stringify(pruneFleet(deep(this.seed))));
    localStorage.removeItem(KEY_USER);
  },
  session() {
    const raw = sessionStorage.getItem(KEY_USER);
    return raw ? JSON.parse(raw) : null;
  },
  user() {
    const s = this.session();
    if (!s) return null;
    const u = this.db().users.find((x) => x.id === s.userId && x.active) || null;
    if (!u) return null;
    if (u.role !== s.role) return null;
    if (u.role === "driver") {
      if (!u.driverId || u.driverId !== s.driverId) return null;
    }
    return u;
  },
  login(phone, pin) {
    const p = phoneKey(phone);
    const user = this.db().users.find((u) => phoneKey(u.phone) === p && u.active);
    if (!user || user.pin !== String(pin || "").trim()) throw new Error("Wrong phone or PIN.");
    if (user.role === "driver" && !user.driverId) {
      throw new Error("This driver login is not linked to a driver record.");
    }
    sessionStorage.setItem(
      KEY_USER,
      JSON.stringify({
        userId: user.id,
        role: user.role,
        driverId: user.driverId || null,
      })
    );
    return { ok: true, role: user.role, name: user.name, home: homeFor(user.role) };
  },
  logout() {
    sessionStorage.removeItem(KEY_USER);
  },
  bootstrap() {
    const user = this.user();
    if (!user) throw Object.assign(new Error("Sign in required"), { status: 401 });
    return scopedDb(this.db(), user);
  },
  act(action, payload) {
    const user = this.user();
    if (!user) throw Object.assign(new Error("Sign in required"), { status: 401 });
    const db = this.db();
    applyAction(db, user, { action, ...payload });
    this.save(db);
    return scopedDb(db, user);
  },
};

window.Conacrew = Conacrew;
