const $ = (s, el = document) => el.querySelector(s);

function ugx(n) {
  return "UGX " + Math.round(n || 0).toLocaleString("en-UG");
}
function tonnes(n) {
  return (n || 0).toLocaleString("en-UG", { maximumFractionDigits: 1 }) + " t";
}
function label(s) {
  return String(s || "").replace(/_/g, " ");
}
const CARGO_BASE = ["Plaster Sand", "Lake Sand", "Stone dust", "Coal", "Dirt (murram)", "Bumba", "Rocks", "Sugarcane"];
function cargoOptions() {
  const extra = DATA.cargoTypes || [];
  const all = [...CARGO_BASE];
  extra.forEach((x) => { if (x && !all.includes(x)) all.push(x); });
  return all;
}

const INSPECT = [
  ["Walk around", [["mirrors","Mirrors / glass"],["lights_f","Front lights"],["lights_r","Rear lights / indicators"],["horn","Horn"],["wipers","Wipers"],["body","Body / dump / tailgate"],["plates","Plates"]]],
  ["Engine", [["oil","Engine oil"],["coolant","Coolant"],["belt","Fan belt"],["leaks_e","Leaks under engine"],["battery","Battery"],["air_filter","Air filter"]]],
  ["Cab", [["seatbelt","Seat belt"],["gauges","Gauges"],["pedal","Brake pedal"],["handbrake","Handbrake"],["steer","Steering"],["clutch","Clutch / gears"]]],
  ["Tyres", [["tyre_fl","Front left"],["tyre_fr","Front right"],["tyre_rl","Rear left"],["tyre_rr","Rear right"],["nuts","Wheel nuts"],["spare","Spare"]]],
  ["Air / brakes", [["tanks","Drain air tanks"],["air_leak","Air leaks"],["lines","Brake lines"]]],
  ["Chassis", [["springs","Springs / suspension"],["shaft","Propeller shaft"],["exhaust","Exhaust"],["fuel_tank","Fuel tank / cap"]]],
  ["Dump", [["pto","PTO / pump"],["ram","Hoist ram"],["hoses","Hyd hoses"]]],
  ["Papers", [["licence","Driving licence"],["insurance","Insurance"],["road","Road licence"]]],
];
function inspectForm() {
  return INSPECT.map(([g, parts]) => `
    <p class="eyebrow" style="margin-top:14px">${g}</p>
    ${parts.map(([id, name]) => `
      <div class="inspect-part" data-part="${id}" style="padding:8px 0;border-bottom:1px solid rgba(15,28,46,.08)">
        <div class="row">
          <span>${name}</span>
          <span style="display:flex;gap:6px">
            <label class="mark pass on"><input type="radio" name="p_${id}" value="pass" checked hidden />PASS</label>
            <label class="mark warn"><input type="radio" name="p_${id}" value="warn" hidden />WARNING</label>
            <label class="mark fail"><input type="radio" name="p_${id}" value="fail" hidden />FAIL</label>
          </span>
        </div>
        <input class="field js-shot" type="file" accept="image/*" data-part="${id}" style="display:none;margin-top:8px" />
      </div>`).join("")}
  `).join("");
}
function cargoSelect(val) {
  const v = val || "";
  const known = cargoOptions();
  const pick = known.includes(v) ? v : (v ? "Other" : "");
  return `<select class="field js-cargo" name="cargo" required>
    ${known.map((c) => `<option value="${c}" ${pick===c?"selected":""}>${c}</option>`).join("")}
    <option value="Other" ${pick==="Other"?"selected":""}>Other</option>
  </select>
  <input class="field js-cargo-other" name="cargoOther" placeholder="Other cargo" style="margin-top:8px;${pick==="Other"?"":"display:none"}" value="${pick==="Other"?v:""}" />`;
}
function isPaid(j) {
  return !!(j && (j.paid || j.status === "paid"));
}
function badge(status) {
  const map = {
    idle: "green",
    paid: "green",
    pending: "gold",
    ok: "green",
    fail: "red",
    pass: "green",
    warning: "gold",
    warn: "gold",
    invoiced: "blue",
    settled: "green",
    seller_paid: "green",
    on_trip: "blue",
    en_route: "blue",
    in_transit: "blue",
    booked: "",
    loading: "gold",
    cutting: "gold",
    delivered: "gold",
    workshop: "red",
    weighed: "purple",
    producing: "purple",
    open: "gold",
    seen: "blue",
    doing: "blue",
    done: "green",
    unread: "gold",
    urgent: "red",
  };
  return `<span class="badge ${map[status] || ""}">${label(status)}</span>`;
}
function landed(b) {
  const costs = (b.buyPriceUgx || 0) + (b.cuttingCostUgx || 0) + (b.loadingCostUgx || 0) + (b.fuelUgx || 0);
  const t = b.millTonnes || 0;
  return { totalCost: costs, perTonne: t ? Math.round(costs / t) : 0 };
}
function fuelOf(km, kpl, price) {
  const litres = kpl > 0 ? km / kpl : 0;
  return { litres: Math.round(litres * 10) / 10, fuelUgx: Math.round(litres * price) };
}

const NAV = {
  admin: [
    ["#home", "Home"],
    ["#trucks", "Fleet"],
    ["#cane", "Cane"],
    ["#passion", "Passion"],
    ["#money", "Money"],
  ],
  driver: [
    ["#drive", "Desk"],
    ["#drive-jobs", "Jobs"],
    ["#drive-paid", "Paid loads"],
    ["#drive-pay", "My pay"],
    ["#drive-tasks", "Tasks"],
    ["#drive-report", "Inspect"],
    ["#drive-fuel", "Fuel"],
    ["#drive-money", "Advance"],
  ],
  cane_manager: [
    ["#cane", "Board"],
    ["#cane-new", "New buy"],
    ["#cane-sell", "Sell"],
    ["#cane-spend", "Spend"],
    ["#cane-ask", "Request"],
    ["#cane-pay", "Pay"],
  ],
  passion_manager: [
    ["#passion", "Blocks"],
    ["#field", "Work"],
    ["#passion-sell", "Sell"],
    ["#passion-pay", "Pay"],
  ],
};
const ROLE = { admin: "Owner", driver: "Driver", cane_manager: "Cane", passion_manager: "Farm" };
const ALLOWED = {
  admin: ["home", "trucks", "trucks-jobs", "trucks-paid", "trucks-work", "trucks-inspect", "trucks-new", "trucks-trash", "trucks-drivers", "truck-id", "reports", "requests", "cane", "cane-new", "cane-id", "cane-sell", "cane-spend", "cane-ask", "passion", "field", "passion-sell", "money", "money-fleet", "money-cane", "money-passion", "money-spend", "money-pl", "money-pl-q", "money-pay"],
  driver: ["drive", "drive-money", "drive-tasks", "drive-report", "drive-jobs", "drive-paid", "drive-pay", "drive-fuel"],
  cane_manager: ["cane", "cane-new", "cane-id", "cane-sell", "cane-spend", "cane-ask", "cane-pay"],
  passion_manager: ["passion", "field", "passion-sell", "passion-pay"],
};

let DATA = null;

async function boot() {
  await Conacrew.init();
  try {
    DATA = Conacrew.bootstrap();
  } catch (err) {
    location.href = "./index.html";
    return;
  }
  $("#who").textContent = DATA.me.name;
  $("#role").textContent = ROLE[DATA.me.role] || DATA.me.role;
  document.body.classList.toggle("is-driver", DATA.me.role === "driver");
  const pages = NAV[DATA.me.role] || [];
  $("#nav").innerHTML = pages.map(([href, label]) => `<a href="${href}">${label}</a>`).join("");
  const jump = $("#navJump");
  if (jump) {
    jump.innerHTML = pages.map(([href, label]) => `<option value="${href}">${label}</option>`).join("");
  }
  $("#out").onclick = () => {
    Conacrew.logout();
    location.href = "./index.html";
  };
  route();
  if (DATA.me.role === "driver") startLiveWatch();
}

function hash() {
  return location.hash.replace(/^#/, "") || defaultHash();
}
function defaultHash() {
  return { admin: "home", driver: "drive", cane_manager: "cane", passion_manager: "passion" }[DATA?.me?.role] || "home";
}
function parseRoute() {
  const h = hash();
  if (h.startsWith("cane/") && h !== "cane-new") return { name: "cane-id", id: h.slice(5) };
  if (h.startsWith("truck/")) return { name: "truck-id", id: h.slice(6) };
  if (h.startsWith("field")) return { name: "field", work: h.split("/")[1] || "harvest" };
  return { name: h };
}
function gate(name) {
  return (ALLOWED[DATA.me.role] || []).includes(name);
}

async function act(action, payload) {
  try {
    DATA = Conacrew.act(action, payload || {});
    route();
  } catch (err) {
    alert(err.message || "Could not save");
    throw err;
  }
}

function route() {
  const r = parseRoute();
  if (DATA.me.role === "driver" && r.name === "drive" && !sessionStorage.getItem("pretrip")) {
    sessionStorage.setItem("pretrip", "1");
    location.hash = "drive-report";
    return;
  }
  if (DATA.me.role === "driver" && !String(r.name).startsWith("drive")) {
    location.hash = "drive";
    return;
  }
  const jump = $("#navJump");
  if (jump) {
    const hit = (NAV[DATA.me.role] || []).find(([href]) => {
      const key = href.slice(1);
      return key === r.name || (key === "cane" && r.name.startsWith("cane")) || (key === "trucks" && r.name.startsWith("truck")) || (key === "passion" && (r.name === "field" || r.name.startsWith("passion"))) || (key === "money" && r.name.startsWith("money")) || (key === "drive" && r.name.startsWith("drive"));
    });
    if (hit) jump.value = hit[0];
  }
  if (!gate(r.name)) {
    $("#app").innerHTML = `<div class="card item"><h1>No access</h1></div>`;
    return;
  }
  const view = {
    home: viewHome,
    trucks: viewTrucks,
    "trucks-jobs": viewTruckJobs,
    "trucks-paid": viewPaidJobs,
    "trucks-work": viewTruckWork,
    "trucks-inspect": viewInspectReport,
    "trucks-new": viewNewJob,
    "trucks-trash": viewJobTrash,
    "trucks-drivers": viewDrivers,
    "truck-id": () => viewTruck(r.id),
    reports: viewReports,
    drive: () => viewDrive("drive"),
    "drive-money": () => viewDrive("drive-money"),
    "drive-tasks": () => viewDrive("drive-tasks"),
    "drive-report": () => viewDrive("drive-report"),
    "drive-jobs": () => viewDrive("drive-jobs"),
    "drive-paid": () => viewDrive("drive-paid"),
    "drive-pay": () => viewDrive("drive-pay"),
    "drive-fuel": () => viewDrive("drive-fuel"),
    cane: viewCane,
    "cane-new": viewNewCane,
    "cane-id": () => viewCaneId(r.id),
    "cane-sell": viewCaneSell,
    "cane-spend": viewCaneSpend,
    "cane-ask": viewCaneAsk,
    "cane-pay": viewCanePay,
    requests: viewRequests,
    passion: viewPassion,
    field: viewField,
    "passion-sell": viewPassionSell,
    "passion-pay": viewPassionPay,
    money: () => viewMoney(""),
    "money-fleet": () => viewMoney("trucking"),
    "money-cane": () => viewMoney("sugarcane"),
    "money-passion": () => viewMoney("passion"),
    "money-spend": viewSpend,
    "money-pl": () => viewPL("week"),
    "money-pl-q": () => viewPL("quarter"),
    "money-pay": viewPayAdmin,
  }[r.name];
  const theme = {
    home: "home",
    trucks: "trucks",
    "trucks-jobs": "trucks",
    "trucks-paid": "trucks",
    "trucks-work": "trucks",
    "trucks-inspect": "trucks",
    "trucks-new": "trucks",
    "trucks-trash": "trucks",
    "trucks-drivers": "trucks",
    "truck-id": "trucks",
    reports: "money",
    drive: "drive",
    "drive-money": "drive",
    "drive-tasks": "drive",
    "drive-report": "drive",
    "drive-jobs": "drive",
    "drive-paid": "drive",
    "drive-pay": "drive",
    "drive-fuel": "drive",
    cane: "cane",
    "cane-new": "cane",
    "cane-id": "cane",
    "cane-sell": "cane",
    "cane-spend": "cane",
    "cane-ask": "cane",
    "cane-pay": "cane",
    requests: "money",
    passion: "passion",
    field: "passion",
    "passion-sell": "passion",
    "passion-pay": "passion",
    money: "money",
    "money-fleet": "money",
    "money-cane": "money",
    "money-passion": "money",
    "money-spend": "money",
    "money-pl": "money",
    "money-pl-q": "money",
    "money-pay": "money",
  }[r.name] || "home";
  document.body.dataset.page = theme;
  $("#app").innerHTML = view ? view() : "<p>Not found</p>";
  bind();
}

function viewHome() {
  return `
    <h1>Home</h1>
    <select class="field" id="goPage" style="margin-top:14px;max-width:360px">
      <option value="#trucks">Fleet</option>
      <option value="#trucks-jobs">Jobs</option>
      <option value="#trucks-inspect">Reports</option>
      <option value="#cane">Cane</option>
      <option value="#passion">Passion</option>
      <option value="#money">Money</option>
      <option value="#money-pay">Pay</option>
    </select>
    <div class="list" style="margin-top:16px">
      ${(DATA.trucks || []).map((t) => {
        const d = (DATA.drivers || []).find((x) => x.id === t.assignedDriverId);
        return `<a class="card item" href="#truck/${t.id}"><div class="row"><div><b>${t.plate}</b><p class="muted">${d ? d.name : "—"} · ${t.model}</p></div>${badge(t.status)}</div></a>`;
      }).join("")}
    </div>
    ${(DATA.alerts || []).length ? `<div class="list" style="margin-top:14px">${DATA.alerts.map((a) => `<a class="card item" href="${a.href}">${badge(a.tone === "bad" ? "fail" : "pending")}<p style="margin-top:8px">${a.text}</p></a>`).join("")}</div>` : ""}`;
}


function tabMenu(items, on) {
  return `<label class="menu-box"><span>More pages</span><select class="field nav-jump">${items.map(([h, l, k]) => `<option value="${h}" ${on === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
}
function fleetTabs(on) {
  const items = [
    ["#trucks", "Units", "trucks"],
    ["#trucks-jobs", "Jobs", "trucks-jobs"],
    ["#trucks-work", "Work", "trucks-work"],
    ["#trucks-inspect", "Reports", "trucks-inspect"],
    ["#trucks-paid", "Paid", "trucks-paid"],
    ["#trucks-trash", "Trash", "trucks-trash"],
    ["#trucks-drivers", "Drivers", "trucks-drivers"],
    ["#trucks-new", "New job", "trucks-new"],
  ];
  return tabMenu(items, on);
}

function viewTrucks() {
  const open = (DATA.fleetTasks || []).filter((t) => !["done", "cancelled"].includes(t.status));
  const issues = (DATA.issues || []).filter((i) => i.status === "open");
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks")}
    <div class="grid g4" style="margin-top:14px">
      <div class="card kpi steel"><span class="eyebrow">Units</span><b>${DATA.trucks.length}</b></div>
      <div class="card kpi gold"><span class="eyebrow">Work</span><b>${open.length}</b></div>
      <div class="card kpi"><span class="eyebrow">Issues</span><b>${issues.length}</b></div>
      <div class="card kpi"><span class="eyebrow">Shop</span><b>${DATA.trucks.filter((t) => t.status === "workshop").length}</b></div>
    </div>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Plate</th><th>Driver</th><th>Km</th><th>Service</th><th></th></tr></thead>
        <tbody>
          ${DATA.trucks.map((t) => {
            const d = DATA.drivers.find((x) => x.id === t.assignedDriverId);
            const n = open.filter((x) => x.truckId === t.id).length;
            return `<tr>
              <td><a href="#truck/${t.id}"><b>${t.plate}</b></a><div class="muted">${t.model}</div></td>
              <td>${d ? d.name : "—"}</td>
              <td>${t.odometerKm.toLocaleString()}</td>
              <td>${t.nextServiceKm.toLocaleString()}</td>
              <td>${badge(t.status)}${n ? " " + badge("open") : ""}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div id="liveMap" style="height:320px;margin-top:14px;border-radius:16px"></div>
    <div class="list" id="liveList" style="margin-top:10px"></div>`;
}

function viewDrivers() {
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-drivers")}
    <div class="grid g2" style="margin-top:14px">
      <form class="card item" data-form="save-truck">
        <p class="eyebrow">Unit</p>
        <select class="field js-unit" name="id" style="margin-top:8px">${DATA.trucks.map((t)=>`<option value="${t.id}">${t.plate}</option>`).join("")}</select>
        <input class="field" name="model" placeholder="Model" style="margin-top:8px" value="${DATA.trucks[0]?.model || "Sinotruk HOWO 6x4"}" />
        <select class="field" name="assignedDriverId" style="margin-top:8px">${DATA.drivers.map((d)=>`<option value="${d.id}" ${d.id===DATA.trucks[0]?.assignedDriverId?"selected":""}>${d.name}</option>`).join("")}</select>
        <button class="btn btn-primary wide" style="margin-top:10px">Save unit</button>
      </form>
      <form class="card item" data-form="save-driver">
        <p class="eyebrow">Driver</p>
        <select class="field js-driver" name="id" style="margin-top:8px">${DATA.drivers.map((d)=>`<option value="${d.id}">${d.name}</option>`).join("")}</select>
        <input class="field" name="phone" placeholder="Phone" style="margin-top:8px" value="${DATA.drivers[0]?.phone || ""}" />
        <select class="field" name="assignedTruckId" style="margin-top:8px">${DATA.trucks.map((t)=>`<option value="${t.id}" ${t.id===DATA.drivers[0]?.assignedTruckId?"selected":""}>${t.plate}</option>`).join("")}</select>
        <select class="field js-paytype" name="payType" style="margin-top:8px"><option value="trip">Pay per trip</option><option value="month" ${DATA.drivers[0]?.payType==="month"?"selected":""}>Pay per month</option></select>
        <input class="field js-month" name="monthRateUgx" placeholder="Monthly pay UGX" style="margin-top:8px;${DATA.drivers[0]?.payType==="month"?"":"display:none"}" value="${DATA.drivers[0]?.monthRateUgx || ""}" />
        <button class="btn btn-primary wide" style="margin-top:10px">Save driver</button>
      </form>
    </div>`;
}

function viewTruckJobs() {
  const open = (DATA.jobs || []).filter((j) => !isPaid(j));
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-jobs")}
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Cargo</th><th>Route</th><th>Km / fuel</th><th>Pay</th><th></th></tr></thead>
        <tbody>
          ${open.length ? open.map((j) => {
            const c = DATA.contractors.find((x) => x.id === j.contractorId);
            const t = DATA.trucks.find((x) => x.id === j.truckId);
            return `<tr>
              <td><b>${j.code || ""} ${j.cargo}</b><div class="muted">${c?.name || ""} ${c?.phone || ""} · ${t?.plate || ""}</div></td>
              <td>${j.origin} → ${j.destination}<div class="muted">${j.pickupAt||""}${j.dropAt?" → "+j.dropAt:""}</div></td>
              <td>${j.km || 0} km<div class="muted">${j.fuelLitres||0} L · ${ugx(j.fuelCostUgx||0)}</div></td>
              <td>${ugx(j.rateUgx||0)}<div class="muted">${j.tonnesDelivered ? j.tonnesDelivered + " t" : ""}</div>${j.scaleTicket ? `<img src="${j.scaleTicket}" alt="" style="width:72px;border-radius:8px" />` : ""}${j.invoice ? `<img src="${j.invoice}" alt="" style="width:72px;border-radius:8px" />` : ""}</td>
              <td>${badge("not paid")}<button class="btn btn-primary" data-act="mark_job_paid" data-id="${j.id}" style="margin-left:8px">Paid</button>
              <button class="btn btn-ghost" data-act="trash_job" data-id="${j.id}">Trash</button></td>
            </tr>`;
          }).join("") : `<tr><td colspan="5" class="muted">No open loads</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function viewPaidJobs() {
  const paid = (DATA.jobs || []).filter(isPaid);
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-paid")}
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Cargo</th><th>Route</th><th>Paid on</th><th>Amount</th></tr></thead>
        <tbody>
          ${paid.length ? paid.map((j) => {
            const c = DATA.contractors.find((x) => x.id === j.contractorId);
            const t = DATA.trucks.find((x) => x.id === j.truckId);
            return `<tr>
              <td><b>${j.code || ""} ${j.cargo}</b><div class="muted">${c?.name || ""} · ${t?.plate || ""}</div></td>
              <td>${j.origin} → ${j.destination}</td>
              <td>${j.paidAt || j.startDate || ""}</td>
              <td>${ugx(j.paidUgx || j.rateUgx || 0)}</td>
            </tr>`;
          }).join("") : `<tr><td colspan="4" class="muted">None paid yet</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function viewInspectReport() {
  const list = DATA.inspections || [];
  const names = {};
  INSPECT.forEach(([, parts]) => parts.forEach(([id, n]) => { names[id] = n; }));
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-inspect")}
    <div class="list" style="margin-top:14px">
      ${list.length ? list.map((r) => {
        const t = DATA.trucks.find((x) => x.id === r.truckId);
        const d = DATA.drivers.find((x) => x.id === r.driverId);
        const bad = Object.keys(r.items||{}).filter((k) => r.items[k] === "fail" || r.items[k] === "warn");
        return `<div class="card item">
          <div class="row"><div><b>${r.date}</b><p class="muted">${t?.plate || ""} · ${d?.name || r.by || ""} · ${r.odometerKm||0} km</p></div>${badge(r.status === "fail" ? "fail" : r.status === "warn" ? "warning" : "pass")}</div>
          ${bad.map((k) => `<div style="margin-top:10px"><p>${names[k]||k} · ${label(r.items[k])}</p>${(r.photos&&r.photos[k])?`<img src="${r.photos[k]}" alt="" style="max-width:220px;border-radius:10px;margin-top:6px" />`:""}</div>`).join("")}
          ${r.note ? `<p class="muted" style="margin-top:8px">${r.note}</p>` : ""}${r.voice ? `<audio controls src="${r.voice}" style="width:100%;margin-top:8px"></audio>` : ""}
        </div>`;
      }).join("") : `<div class="card item">None</div>`}
    </div>`;
}

function viewTruckWork() {
  const open = (DATA.fleetTasks || []).filter((t) => !["done", "cancelled"].includes(t.status));
  const driverName = (id) => DATA.drivers.find((d) => d.id === id)?.name || "—";
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-work")}
    <form class="card item" data-form="fleet-task" style="margin-top:14px">
      <label class="menu-box"><span>Task for the driver</span>
        <select class="field" name="kind" required>
          <option value="inspect">Inspect the truck</option>
          <option value="service">Service</option>
          <option value="repair">Repair</option>
          <option value="tyres">Check tyres</option>
          <option value="fuel">Fuel</option>
          <option value="wash">Wash</option>
          <option value="papers">Papers / licence</option>
          <option value="other">Other</option>
        </select>
      </label>
      <div id="inspectParts" style="margin-top:10px">
        <label class="menu-box"><span>Part to check</span>
          <select class="field" name="part">
            ${INSPECT.flatMap(([, parts]) => parts).map(([id, name]) => `<option value="${id}">${name}</option>`).join("")}
          </select>
        </label>
      </div>
      <label class="menu-box"><span>Plate</span>
        <select class="field" name="truckId" required>
          ${((DATA.trucks && DATA.trucks.length) ? DATA.trucks : [{ id: "t-001", plate: "UA 687BH" }, { id: "t-002", plate: "UA 764AN" }]).map((t) => `<option value="${t.id}">${t.plate}</option>`).join("")}
        </select>
      </label>
      <div class="grid g2" style="margin-top:10px">
        <select class="field" name="priority"><option value="normal">Normal</option><option value="urgent">Urgent</option></select>
        <input class="field" name="dueDate" type="date" />
      </div>
      <input class="field" name="title" placeholder="Extra note, if any" style="margin-top:10px" />
      <input type="hidden" name="note" value="" />
      <button class="btn btn-primary wide" style="margin-top:10px">Send to driver</button>
    </form>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Task</th><th>Unit</th><th></th></tr></thead>
        <tbody>
          ${open.map((t) => {
            const truck = DATA.trucks.find((x) => x.id === t.truckId);
            return `<tr class="pulse-row"><td><b>${t.title}</b><div class="muted">${t.kind}</div></td><td>${truck?.plate || ""}</td><td>${badge(t.status)}</td></tr>`;
          }).join("") || `<tr><td colspan="3" class="muted">None</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function viewTruck(id) {
  const t = DATA.trucks.find((x) => x.id === id);
  if (!t) return "<p>Not found.</p>";
  const d = DATA.drivers.find((x) => x.id === t.assignedDriverId);
  const tasks = (DATA.fleetTasks || []).filter((x) => x.truckId === t.id && !["done","cancelled"].includes(x.status));
  const issues = (DATA.issues || []).filter((x) => x.truckId === t.id);
  const services = (DATA.services || []).filter((x) => x.truckId === t.id).slice(0, 5);
  return `
    ${fleetTabs("trucks")}
    <div class="row" style="margin-top:8px"><h1>${t.plate}</h1>${badge(t.status)}</div>
    <p class="muted">${t.model} · ${(d && d.name) || "—"} · ${t.odometerKm.toLocaleString()} km</p>
    <div class="grid g2" style="margin-top:14px">
      <form class="card item" data-form="fleet-task">
        <input type="hidden" name="truckId" value="${t.id}" />
        <input type="hidden" name="driverId" value="${t.assignedDriverId || ""}" />
        <div class="grid g2">
          <select class="field" name="kind" required>
              <option value="inspect">Inspect the truck</option>
            <option value="service">Service</option>
            <option value="repair">Repair</option>
            <option value="tyres">Check tyres</option>
            <option value="fuel">Fuel</option>
            <option value="wash">Wash</option>
            <option value="papers">Papers / licence</option>
            <option value="other">Other</option>
          </select>
          <select class="field" name="priority"><option value="normal">Normal</option><option value="urgent">Urgent</option></select>
        </div>
        <input class="field" name="title" required placeholder="Task" style="margin-top:8px" />
        <button class="btn btn-primary wide" style="margin-top:8px">Send</button>
      </form>
      <form class="card item" data-form="service">
        <input type="hidden" name="truckId" value="${t.id}" />
        <div class="grid g2">
          <input class="field" name="odometerKm" value="${t.odometerKm}" />
          <input class="field" name="costUgx" placeholder="UGX" />
        </div>
        <input class="field" name="garage" placeholder="Garage" style="margin-top:8px" />
        <button class="btn btn-steel wide" style="margin-top:8px">Save service</button>
      </form>
    </div>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Open work</th><th></th></tr></thead>
        <tbody>
          ${tasks.map((x) => `<tr><td>${x.title}</td><td>${badge(x.status)}</td></tr>`).join("") || `<tr><td class="muted" colspan="2">None</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function viewJobTrash() {
  const trash = DATA.jobsTrash || [];
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-trash")}
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Load</th><th>Removed</th><th></th></tr></thead>
        <tbody>
          ${trash.length ? trash.map((j) => `<tr>
            <td><b>${j.code || ""} ${j.cargo}</b><div class="muted">${j.origin} → ${j.destination}</div></td>
            <td>${j.deletedAt || ""} · ${j.deletedBy || ""}</td>
            <td><button class="btn btn-ghost" data-act="restore_job" data-id="${j.id}">Restore</button>
            <button class="btn btn-ghost" data-act="purge_job" data-id="${j.id}">Delete</button></td>
          </tr>`).join("") : `<tr><td colspan="3" class="muted">Empty</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function viewNewJob() {
  return `
    <h1>New job</h1>
    <form class="card item" data-form="job" style="margin-top:16px;max-width:560px">
      <label class="label">Contractor</label>
      <select class="field js-contractor" name="contractorId">${DATA.contractors.map((c) => `<option value="${c.id}">${c.name} ${c.phone||""}</option>`).join("")}<option value="new">New contractor</option></select>
      <div class="grid g2 js-new-contractor" style="margin-top:10px;display:none">
        <input class="field" name="contractorName" placeholder="New contractor" />
        <input class="field" name="contractorPhone" placeholder="Phone" />
      </div>
      <div style="height:10px"></div>
      <label class="label">Cargo</label>
      ${cargoSelect("")}
      <div class="grid g2" style="margin-top:10px">
        <input class="field js-pv" placeholder="Pickup (optional name)" />
        <input class="field js-dv" placeholder="Drop (optional name)" />
      </div>
      <div class="grid g2" style="margin-top:10px">
        <div><p class="muted">Pickup date / time</p><input class="field" type="datetime-local" name="pickupAt" /></div>
        <div><p class="muted">Drop date / time</p><input class="field" type="datetime-local" name="dropAt" /></div>
      </div>
      <input type="hidden" name="origin" class="js-origin" />
      <input type="hidden" name="destination" class="js-dest" />
      <p class="muted js-route" style="margin-top:8px">Tap pickup, then drop. Truck GPS is optional.</p>
      <button type="button" class="btn btn-ghost" id="useGps" style="margin-top:8px">Add truck GPS (optional)</button>
      <input type="hidden" name="kmToPickup" class="js-dead" />
      <input type="hidden" name="kmHaul" class="js-haul" />
      <div id="routeMap" style="height:220px;margin-top:8px;border-radius:14px"></div>
      <div class="grid g3" style="margin-top:10px">
        <input class="field js-km" name="km" placeholder="Km" />
        <input class="field" name="rateUgx" required placeholder="Pay UGX" />
        <div><input class="field js-diesel" name="dieselUgxPerLitre" value="${DATA.dieselDefaultUgx||5200}" /><p class="muted">UGX per litre</p></div>
      </div>
      <div class="grid g2" style="margin-top:10px">
        <div><input class="field js-litres" name="fuelLitres" readonly /><p class="muted">Needed litres</p></div>
        <div><input class="field js-fuel" name="fuelCostUgx" readonly /><p class="muted">Total fuel cost</p></div>
      </div>
      <div class="grid g2" style="margin-top:10px">
        <div><label class="label">Driver</label><select class="field" name="driverId">${DATA.drivers.map((d) => `<option value="${d.id}">${d.name}</option>`).join("")}</select></div>
        <div><label class="label">Truck</label><select class="field" name="truckId">${DATA.trucks.map((t) => `<option value="${t.id}">${t.plate}</option>`).join("")}</select></div>
      </div>
      <button class="btn btn-steel wide" style="margin-top:14px">Save job</button>
    </form>`;
}

function mediaBlock(issue) {
  const photos = issue.photos || [];
  const voice = issue.voice;
  return `
    ${photos.length ? `<div class="thumbs">${photos.map((src) => `<img src="${src}" alt="" />`).join("")}</div>` : ""}
    ${voice ? `<audio controls src="${voice}" style="width:100%;margin-top:8px"></audio>${issue.voiceSec ? `<p class="muted">${issue.voiceSec}s</p>` : ""}` : ""}
  `;
}

function viewReports() {
  const list = DATA.issues || [];
  const incoming = list.filter((i) => i.status !== "closed");
  return `
    <h1>Money</h1>
    ${moneyTabs("reports")}
    <p class="muted" style="margin-top:10px">${incoming.length} incoming</p>
    <div class="list" style="margin-top:14px">
      ${list.length ? list.map((i) => {
        const t = DATA.trucks.find((x) => x.id === i.truckId);
        const d = DATA.drivers.find((x) => x.id === i.driverId);
        return `<div class="card item">
          <div class="row"><div><p class="eyebrow">${i.date} · ${t?.plate || ""} · ${d?.name || i.by}</p><b>${i.title}</b></div>${badge(i.status)}${i.severity === "urgent" ? badge("urgent") : ""}</div>
          ${i.note ? `<p style="margin-top:8px">${i.note}</p>` : ""}
          ${mediaBlock(i)}
          ${(i.replies || []).map((r) => `<p class="muted" style="margin-top:8px"><b>Next:</b> ${r.text}</p>`).join("")}
          ${i.status !== "closed" ? `<form data-form="reply-issue" data-id="${i.id}" style="margin-top:10px"><input class="field" name="text" required placeholder="Next step" /><div class="grid g2" style="margin-top:8px"><button class="btn btn-primary">Send</button><button class="btn btn-ghost" name="close" value="1">Close</button></div></form>` : ""}
        </div>`;
      }).join("") : `<div class="card item">None</div>`}
    </div>`;
}

function viewDrive(page) {
  const next = { booked: "loading", loading: "en_route", en_route: "delivered" };
  const myId = DATA.me.driverId;
  const jobs = (DATA.jobs || []).filter((j) => j.driverId === myId);
  const tasks = (DATA.fleetTasks || []).filter((t) => t.driverId === myId && !["done", "cancelled"].includes(t.status));
  const notes = (DATA.notifications || []).filter((n) => n.status === "unread");
  const floats = DATA.disbursements || [];
  const pendingMoney = floats.filter((f) => f.status === "sent").length;
  const side = tabMenu([
    ["#drive", "Desk", "drive"],
    ["#drive-jobs", "Jobs", "drive-jobs"],
    ["#drive-paid", "Paid loads", "drive-paid"],
    ["#drive-pay", "My pay", "drive-pay"],
    ["#drive-tasks", "Tasks", "drive-tasks"],
    ["#drive-report", "Inspect", "drive-report"],
    ["#drive-fuel", "Fuel", "drive-fuel"],
    ["#drive-money", "Advance", "drive-money"],
  ], page);

  const desk = `
    <h1>${DATA.me.name}</h1>
    ${notes.length || tasks.length || pendingMoney ? `<div class="prompt pulse" style="margin-top:16px"><h2>${pendingMoney ? pendingMoney + " money to confirm" : tasks.length + " task" + (tasks.length===1?"":"s")}</h2></div>` : ""}
    <a class="card item pulse" href="#drive-report" style="margin-top:16px;display:block"><b>Pre-trip inspection</b><p class="muted">Do this before the truck moves</p></a>
    ${DATA.truck ? `<div class="card item" style="margin-top:16px"><h2>${DATA.truck.plate}</h2><p class="muted">${DATA.truck.model} · ${DATA.truck.odometerKm.toLocaleString()} km</p>${badge(DATA.truck.status)}</div>` : ""}
    <div class="list" style="margin-top:14px">
      <a class="card item" href="#drive-jobs"><b>Jobs</b><p class="muted">${jobs.filter(j=>!isPaid(j)).length} open</p></a>
      <a class="card item" href="#drive-paid"><b>Paid loads</b><p class="muted">${jobs.filter(isPaid).length} saved</p></a>
      <a class="card item" href="#drive-pay"><b>My pay</b><p class="muted">${ugx((DATA.payStubs||[]).filter(x=>x.status==="paid").reduce((s,x)=>s+(x.amountUgx||0),0))} YTD</p></a>
      <a class="card item" href="#drive-tasks"><b>Tasks</b><p class="muted">${tasks.length} open</p></a>
      <a class="card item" href="#drive-money"><b>Advance</b><p class="muted">${pendingMoney} to confirm</p></a>
    </div>`;

  const money = `
    <h1>Advance</h1>
    <div class="list" style="margin-top:14px">
      ${floats.length ? floats.map((f) => {
        const used = (f.usages || []).reduce((s, u) => s + (u.amountUgx || 0), 0);
        const left = Math.max(0, f.amountUgx - used);
        return `<div class="card item">
          <div class="row"><b>${ugx(f.amountUgx)}</b>${badge(f.status)}</div>
          <p class="muted">${f.date} · ${f.note || f.activity}</p>
          <div class="grid g3" style="margin-top:10px">
            <div class="card kpi"><span class="eyebrow">Sent</span><b>${ugx(f.amountUgx)}</b></div>
            <div class="card kpi"><span class="eyebrow">Used</span><b>${ugx(used)}</b></div>
            <div class="card kpi gold"><span class="eyebrow">Left</span><b>${ugx(left)}</b></div>
          </div>
          ${f.status === "sent" ? `<button class="btn btn-primary wide" style="margin-top:10px" data-act="ack_float" data-id="${f.id}">I received it</button>` : ""}
          ${f.status !== "sent" && left > 0 ? `<form data-form="float-use" data-id="${f.id}" style="margin-top:10px">
            <div class="grid g2">
              <input class="field" name="amountUgx" required placeholder="This bit UGX" />
              <select class="field" name="category">
                <option value="diesel">Diesel</option>
                <option value="food">Food</option>
                <option value="parts">Parts</option>
                <option value="toll">Toll</option>
                <option value="other">Other</option>
              </select>
            </div>
            <input class="field" name="note" placeholder="What this bit paid" style="margin-top:8px" />
            <label class="label" style="margin-top:8px">Receipt / invoice</label>
            <input class="field use-photo" type="file" accept="image/*" />
            <div class="thumbs use-preview"></div>
            <button class="btn btn-ghost wide" style="margin-top:8px">Add this bit</button>
          </form>` : ""}
          <div class="card" style="margin-top:10px;overflow:auto">
            <table>
              <thead><tr><th>Bit</th><th>For</th><th></th></tr></thead>
              <tbody>
                ${(f.usages || []).map((u) => `<tr>
                  <td>${u.date}<div class="muted">${u.category}</div></td>
                  <td>${u.note || "—"} ${u.photo ? `<div class="thumbs"><img src="${u.photo}" alt="" /></div>` : ""}</td>
                  <td><b>${ugx(u.amountUgx)}</b></td>
                </tr>`).join("") || `<tr><td colspan="3" class="muted">No bits yet</td></tr>`}
                <tr><td colspan="2"><b>Total used</b></td><td><b>${ugx(used)}</b></td></tr>
              </tbody>
            </table>
          </div>
        </div>`;
      }).join("") : `<div class="card item">None</div>`}
    </div>`;

  const taskPanel = `
    <h1>Tasks</h1>
    <div class="list" style="margin-top:14px">
      ${tasks.length ? tasks.map((t) => {
        const truck = DATA.truck && DATA.truck.id === t.truckId ? DATA.truck : null;
        return `<div class="card item pulse"><div class="row"><div><p class="eyebrow">${t.kind} · ${t.priority}${t.dueDate ? " · due " + t.dueDate : ""}</p><b>${t.title}</b><p class="muted">${truck ? truck.plate : ""} · ${t.createdBy} · ${t.createdAt}</p>${t.note ? `<p style="margin-top:6px">${t.note}</p>` : ""}</div>${badge(t.status)}</div>
        ${t.status === "open" ? `<button class="btn btn-ghost wide" style="margin-top:10px" data-act="ack_fleet_task" data-id="${t.id}">Seen</button>` : ""}
        ${t.status !== "done" ? `<form data-form="complete-task" data-id="${t.id}" style="margin-top:8px"><input class="field" name="driverNote" placeholder="What you did" /><button class="btn btn-primary wide" style="margin-top:8px">Mark done</button></form>` : ""}
        </div>`;
      }).join("") : `<div class="card item">None</div>`}
    </div>`;

  const report = `
    <h1>Inspect report</h1>
    <form class="card item" data-form="inspect" style="margin-top:14px">
      <p class="eyebrow">${DATA.truck ? DATA.truck.plate : "Unit"}</p>
      <input class="field" name="odometerKm" placeholder="Odometer km" style="margin-top:8px" value="${DATA.truck ? DATA.truck.odometerKm : ""}" />
      ${inspectForm()}
      <input class="field" name="note" placeholder="Note" style="margin-top:12px" />
      <div style="margin-top:10px" class="row">
        <button type="button" class="btn btn-steel" id="recStart">Voice note</button>
        <button type="button" class="btn btn-ghost" id="recStop" disabled>Stop</button>
        <span class="muted" id="recTime">0:00 / 3:00</span>
      </div>
      <audio id="recPlay" controls style="width:100%;margin-top:8px;display:none"></audio>
      <button class="btn btn-primary wide" style="margin-top:12px">Send inspect</button>
    </form>
    <div class="list" style="margin-top:14px">
      ${(DATA.inspections || []).map((r) => `<div class="card item"><div class="row"><div><b>${r.date}</b><p class="muted">${r.odometerKm || 0} km</p></div>${badge(r.status === "fail" ? "fail" : r.status === "warn" ? "warning" : "pass")}</div>
        ${r.voice ? `<audio controls src="${r.voice}" style="width:100%;margin-top:8px"></audio>` : ""}
      </div>`).join("")}
    </div>`;

  const jobPanel = `
    <h1>Jobs</h1>
    <form class="card item" data-form="driver-load" style="margin-top:14px">
      ${cargoSelect("")}
      <div class="grid g2" style="margin-top:10px">
        <input class="field js-pv" placeholder="Pickup (optional name)" />
        <input class="field js-dv" placeholder="Drop (optional name)" />
      </div>
      <div class="grid g2" style="margin-top:10px">
        <div><p class="muted">Pickup date / time</p><input class="field" type="datetime-local" name="pickupAt" /></div>
        <div><p class="muted">Drop date / time</p><input class="field" type="datetime-local" name="dropAt" /></div>
      </div>
      <input type="hidden" name="origin" class="js-origin" />
      <input type="hidden" name="destination" class="js-dest" />
      <p class="muted js-route" style="margin-top:8px">Tap pickup, then drop. Truck GPS is optional.</p>
      <button type="button" class="btn btn-ghost" id="useGps" style="margin-top:8px">Add truck GPS (optional)</button>
      <input type="hidden" name="kmToPickup" class="js-dead" />
      <input type="hidden" name="kmHaul" class="js-haul" />
      <div id="routeMap" style="height:220px;margin-top:8px;border-radius:14px"></div>
      <div class="grid g3" style="margin-top:10px">
        <input class="field js-km" name="km" placeholder="Km" />
        <select class="field" name="payBasis"><option value="trip">Pay per trip</option><option value="tonne">Pay per tonne</option></select>
        <input class="field" name="payPerTonne" placeholder="UGX / t if known" />
      </div>
      <div class="grid g3" style="margin-top:10px">
        <div><input class="field js-diesel" name="dieselUgxPerLitre" value="${DATA.dieselDefaultUgx||5200}" /><p class="muted">UGX per litre</p></div>
        <div><input class="field js-litres" name="fuelLitres" readonly /><p class="muted">Needed litres</p></div>
        <div><input class="field js-fuel" name="fuelCostUgx" readonly /><p class="muted">Total fuel cost</p></div>
      </div>
      <select class="field js-contractor" name="contractorId" style="margin-top:10px">${(DATA.contractors||[]).map((c)=>`<option value="${c.id}">${c.name} ${c.phone||""}</option>`).join("")}<option value="new">New contractor</option></select>
      <div class="grid g2 js-new-contractor" style="margin-top:10px;display:none">
        <input class="field" name="contractorName" placeholder="New contractor" />
        <input class="field" name="contractorPhone" placeholder="Phone" />
      </div>
      <button class="btn btn-primary wide" style="margin-top:12px">Add load</button>
    </form>
    <div class="list" style="margin-top:14px">
      ${jobs.filter((j) => !isPaid(j)).length ? jobs.filter((j) => !isPaid(j)).map((j) => {
        const c = DATA.contractors.find((x) => x.id === j.contractorId);
        const n = next[j.status];
        const income = j.incomeUgx || ((j.tonnesDelivered || 0) * (j.payPerTonne || 0)) || j.rateUgx;
        return `<div class="card item"><div class="row"><div><b>${j.code || ""} ${j.cargo}</b><p class="muted">${j.origin} → ${j.destination}</p><p class="muted">${c?.name || ""} · ${j.km || 0} km · ${j.payBasis === "tonne" ? (j.tonnesDelivered ? j.tonnesDelivered + " t" : "await scale") : "per trip"}</p></div>${badge(j.invoice && !isPaid(j) ? "invoiced" : "not paid")}</div>
        ${j.scaleTicket ? `<img src="${j.scaleTicket}" alt="" style="max-width:160px;border-radius:10px;margin-top:8px" />` : `<form data-form="scale" data-id="${j.id}" style="margin-top:8px"><div class="grid g2"><input class="field" name="tonnes" required placeholder="Tonnes after scale" /><input class="field" name="ticket" type="file" accept="image/*" required /></div><button class="btn btn-steel wide" style="margin-top:8px">Save scale ticket</button></form>`}
        ${j.scaleTicket && !j.invoice ? `<form data-form="invoice" data-id="${j.id}" style="margin-top:8px"><input class="field" name="amountUgx" required placeholder="Amount UGX" value="${income || ""}" /><input class="field" name="invoice" type="file" accept="image/*" required style="margin-top:8px" /><select class="field" name="paidNow" style="margin-top:8px"><option value="0">Pay later</option><option value="1">Paid now</option></select><button class="btn btn-primary wide" style="margin-top:8px">Send invoice</button></form>` : ""}
        ${j.invoice ? `<img src="${j.invoice}" alt="" style="max-width:160px;border-radius:10px;margin-top:8px" />` : ""}
        <button class="btn btn-ghost wide" style="margin-top:8px" data-act="trash_job" data-id="${j.id}">Remove</button>
        ${n ? `<button class="btn btn-steel wide" style="margin-top:10px" data-act="update_job" data-id="${j.id}" data-status="${n}">Mark ${label(n)}</button>` : ""}
        </div>`;
      }).join("") : `<div class="card item">None</div>`}
    </div>`;

  const paidPanel = `
    <h1>Paid loads</h1>
    <div class="list" style="margin-top:14px">
      ${jobs.filter(isPaid).length ? jobs.filter(isPaid).map((j) => {
        const c = DATA.contractors.find((x) => x.id === j.contractorId);
        return `<div class="card item"><div class="row"><div><b>${j.code || ""} ${j.cargo}</b><p class="muted">${j.origin} → ${j.destination}</p><p class="muted">${j.pickupAt||""}${j.dropAt?" → "+j.dropAt:""}</p><p class="muted">${c?.name || ""} · ${j.km || 0} km · paid ${j.paidAt || ""} · ${ugx(j.paidUgx || j.rateUgx || 0)}</p></div>${badge("paid")}</div></div>`;
      }).join("") : `<div class="card item">None saved</div>`}
    </div>`;

  const year = new Date().getFullYear();
  const stubs = DATA.payStubs || [];
  const ytd = stubs.filter((x) => x.status === "paid" && String(x.year||x.paidAt||"").startsWith(String(year))).reduce((s,x)=>s+(x.amountUgx||0),0);
  const payType = (DATA.driver && DATA.driver.payType) || "trip";
  const delivered = jobs.filter((j) => isPaid(j) || j.status === "delivered");
  const asked = (id) => stubs.some((x) => x.refId === id);
  const pendingPay = stubs.filter((x) => x.status === "pending").reduce((s,x)=>s+(x.amountUgx||0),0);
  const paidStubs = stubs.filter((x) => x.status === "paid");
  const holdStubs = stubs.filter((x) => x.status !== "paid");
  const payPanel = `
    <h1>My pay</h1>
    <div class="grid g3" style="margin-top:14px">
      <div class="card kpi"><span class="eyebrow">${payType === "month" ? "Monthly" : "Per trip"}</span><b>${payType === "month" ? ugx(DATA.driver.monthRateUgx||0) : "Trip"}</b></div>
      <div class="card kpi gold"><span class="eyebrow">Waiting</span><b>${ugx(pendingPay)}</b></div>
      <div class="card kpi steel"><span class="eyebrow">Paid YTD</span><b>${ugx(ytd)}</b></div>
    </div>
    <p class="eyebrow" style="margin-top:16px">Paid</p>
    <div class="list" style="margin-top:8px">
      ${paidStubs.length ? paidStubs.map((x) => `<div class="card item"><div class="row"><div><b>${x.refLabel}</b><p class="muted">${x.paidAt || x.requestedAt}</p></div><b>${ugx(x.amountUgx)}</b></div>${badge("paid")}</div>`).join("") : `<div class="card item">Nothing paid yet this year</div>`}
    </div>
    <p class="eyebrow" style="margin-top:16px">Waiting</p>
    <div class="list" style="margin-top:8px">
      ${holdStubs.length ? holdStubs.map((x) => `<div class="card item"><div class="row"><div><b>${x.refLabel}</b><p class="muted">${x.requestedAt}</p></div><b>${ugx(x.amountUgx)}</b></div>${badge("pending")}</div>`).join("") : `<div class="card item">None waiting</div>`}
    </div>`;

  const fuel = `
    <h1>Fuel</h1>
    <form class="card item" data-form="fuel" style="margin-top:14px">
      <div class="grid g2">
        <div><label class="label">Litres</label><input class="field" name="litres" required /></div>
        <div><label class="label">Amount UGX</label><input class="field" name="amountUgx" required /></div>
      </div>
      <div style="height:10px"></div>
      <label class="label">Station</label>
      <input class="field" name="station" />
      <div style="height:10px"></div>
      <label class="label">Odometer km</label>
      <input class="field" name="odometerKm" />
      <button class="btn btn-primary wide" style="margin-top:12px">Save fuel</button>
    </form>`;

  const panel = { drive: desk, "drive-money": money, "drive-tasks": taskPanel, "drive-report": report, "drive-jobs": jobPanel, "drive-paid": paidPanel, "drive-pay": payPanel, "drive-fuel": fuel }[page] || desk;
  return `<div class="desk"><div class="desk-main">${panel}</div></div>`;
}

function caneTabs(on) {
  return tabMenu([
    ["#cane", "Buys", "cane"],
    ["#cane-new", "New", "cane-new"],
    ["#cane-sell", "Sell", "cane-sell"],
    ["#cane-spend", "Spend", "cane-spend"],
    ["#cane-ask", "Request", "cane-ask"],
    ["#cane-pay", "Pay", "cane-pay"],
  ], on);
}

function viewCane() {
  const k = DATA.kpis || {};
  return `
    <h1>Cane</h1>
    ${caneTabs("cane")}
    <div class="grid g4" style="margin-top:14px">
      <div class="card kpi"><span class="eyebrow">Bought</span><b>${tonnes(k.bought)}</b></div>
      <div class="card kpi"><span class="eyebrow">Weighed</span><b>${tonnes(k.sold)}</b></div>
      <div class="card kpi gold"><span class="eyebrow">Owe sellers</span><b>${ugx(k.oweSellers)}</b></div>
      <div class="card kpi gold"><span class="eyebrow">Mill owes</span><b>${ugx(k.millOwes)}</b></div>
    </div>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Seller</th><th></th><th>t</th><th>Buy</th><th></th></tr></thead>
        <tbody>
          ${DATA.caneBuys.map((b) => {
            const s = DATA.sellers.find((x) => x.id === b.sellerId);
            return `<tr>
              <td><a href="#cane/${b.id}"><b>${s?.name || ""}</b></a><div class="muted">${b.location}</div></td>
              <td>${b.type === "acre" ? b.acres + " ac" : b.tripsAgreed + " trips"}</td>
              <td>${tonnes(b.millTonnes || b.expectedTonnes)}</td>
              <td>${ugx(b.buyPriceUgx)}</td>
              <td>${badge(b.status)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

function viewNewCane() {
  return `
    <h1>Cane</h1>
    ${caneTabs("cane-new")}
    <form class="card item" data-form="cane" style="margin-top:14px">
      <input type="hidden" name="type" value="acre" />
      <div class="tabs" style="margin-top:0">
        <button type="button" class="btn btn-primary" id="type-acre">Acre</button>
        <button type="button" class="btn btn-ghost" id="type-trip">Trip</button>
      </div>
      <div class="grid g2" style="margin-top:12px">
        <select class="field" name="sellerId" required>${DATA.sellers.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select>
        <input class="field" name="location" required placeholder="Location" />
      </div>
      <div class="grid g2 acre-only" style="margin-top:10px">
        <input class="field" name="acres" placeholder="Acres" />
      </div>
      <div class="grid g2 trip-only" style="margin-top:10px;display:none">
        <input class="field" name="tripsAgreed" placeholder="Trips" />
      </div>
      <input class="field" name="buyPriceUgx" required placeholder="Buy UGX" style="margin-top:10px" />
      <button class="btn btn-primary wide" style="margin-top:12px">Save buy</button>
    </form>`;
}

function viewCaneId(id) {
  const b = DATA.caneBuys.find((x) => x.id === id);
  if (!b) return "<p>Not found.</p>";
  const s = DATA.sellers.find((x) => x.id === b.sellerId);
  const m = DATA.mills.find((x) => x.id === b.millId);
  const L = landed(b);
  const sale = b.millSaleUgx || 0;
  const steps = ["booked", "cutting", "loading", "in_transit", "weighed", "seller_paid", "settled"];
  return `
    ${caneTabs("cane")}
    <div class="row" style="margin-top:8px"><h1>${s?.name || ""}</h1>${badge(b.status)}</div>
    <p class="muted">${b.location} · ${b.type === "acre" ? b.acres + " ac" : b.tripsAgreed + " trips"}</p>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <tbody>
          <tr><td>Tonnes</td><td><b>${tonnes(b.millTonnes || b.expectedTonnes)}</b></td></tr>
          <tr><td>Seller</td><td>${ugx(b.buyPriceUgx)}</td></tr>
          <tr><td>Cut / load</td><td>${ugx(b.cuttingCostUgx)} / ${ugx(b.loadingCostUgx)}</td></tr>
          <tr><td>Diesel</td><td>${b.transportKm} km · ${b.fuelLitres} L · ${ugx(b.fuelUgx)}</td></tr>
          <tr><td>Landed</td><td><b>${ugx(L.totalCost)}</b>${L.perTonne ? " · " + ugx(L.perTonne) + "/t" : ""}</td></tr>
          ${sale ? `<tr><td>Mill</td><td class="ok">${ugx(sale)} · ${ugx(sale - L.totalCost)}</td></tr>` : ""}
        </tbody>
      </table>
    </div>
    <div class="chips" style="margin-top:12px">
      ${steps.map((st) => `<button class="chip ${b.status === st ? "on" : ""}" data-act="update_cane_buy" data-id="${b.id}" data-status="${st}">${label(st)}</button>`).join("")}
    </div>
    ${!b.millTonnes ? `<form class="card item" data-form="mill" data-id="${b.id}" style="margin-top:14px"><div class="grid g2"><input class="field" name="millTonnes" required placeholder="Tonnes" /><input class="field" name="millPriceUgx" placeholder="${m?.priceUgxPerTonne || "UGX/t"}" /></div><button class="btn btn-primary wide" style="margin-top:10px">Save weight</button></form>` : ""}
    ${!b.sellerPaid ? `<button class="btn btn-ghost wide" style="margin-top:10px" data-act="pay_seller" data-id="${b.id}">Pay ${ugx(b.buyPriceUgx)}</button>` : ""}`;
}


function viewCaneSell() {
  const sales = DATA.caneSales || [];
  const mills = DATA.mills || [];
  return `
    <h1>Cane</h1>
    ${caneTabs("cane-sell")}
    <form class="card item" data-form="cane-sale" style="margin-top:14px">
      <div class="grid g2">
        <input class="field" name="tonnes" id="saleT" required placeholder="Tonnes" />
        <input class="field" name="pricePerTonne" id="saleP" required placeholder="UGX / tonne" />
      </div>
      <p class="muted" id="saleSum" style="margin-top:8px">Total UGX 0</p>
      <div class="grid g2" style="margin-top:10px">
        <select class="field" name="millId">${mills.map((m)=>`<option value="${m.id}">${m.name}</option>`).join("")}</select>
        <select class="field" name="method"><option value="cash">Cash</option><option value="mtn_momo">MoMo</option><option value="bank">Bank</option></select>
      </div>
      <select class="field" name="buyId" style="margin-top:10px">${(DATA.caneBuys||[]).map((b)=>`<option value="${b.id}">${b.location||b.id} · ${b.acres?b.acres+" ac": (b.tripsAgreed||0)+" trips"}</option>`).join("")}</select>
      <div class="grid g3" style="margin-top:10px">
        <input class="field" name="cuttingCostUgx" placeholder="Cut UGX" />
        <input class="field" name="loadingCostUgx" placeholder="Load UGX" />
        <input class="field" name="transportUgx" placeholder="Transport UGX" />
      </div>
      <input class="field" name="note" placeholder="Note" style="margin-top:10px" />
      <button class="btn btn-primary wide" style="margin-top:12px">Save sale</button>
    </form>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Date</th><th>t</th><th>UGX/t</th><th>Total</th></tr></thead>
        <tbody>
          ${sales.map((x)=>`<tr><td>${x.date}<div class="muted">${x.note||""}</div></td><td>${x.tonnes}</td><td>${ugx(x.pricePerTonne)}</td><td><b>${ugx(x.amountUgx)}</b></td></tr>`).join("") || `<tr><td colspan="4" class="muted">None</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function viewCaneSpend() {
  const rows = DATA.caneExpenses || [];
  return `
    <h1>Cane</h1>
    ${caneTabs("cane-spend")}
    <form class="card item" data-form="cane-expense" style="margin-top:14px">
      <div class="grid g3">
        <select class="field" name="category">
          <option value="cut">Cutting</option>
          <option value="load">Loading</option>
          <option value="transport">Transport</option>
          <option value="fuel">Fuel</option>
          <option value="labour">Labour</option>
          <option value="other">Other</option>
        </select>
        <input class="field" name="amountUgx" required placeholder="Amount UGX" />
        <select class="field" name="method"><option value="cash">Cash</option><option value="mtn_momo">MoMo</option><option value="bank">Bank</option></select>
      </div>
      <input class="field" name="note" placeholder="Note" style="margin-top:10px" />
      <button class="btn btn-primary wide" style="margin-top:12px">Save spend</button>
    </form>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Date</th><th>For</th><th></th></tr></thead>
        <tbody>
          ${rows.map((x)=>`<tr><td>${x.date}</td><td>${x.category}<div class="muted">${x.note||""}</div></td><td><b>−${ugx(x.amountUgx)}</b></td></tr>`).join("") || `<tr><td colspan="3" class="muted">None</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function viewCaneAsk() {
  const reqs = DATA.moneyRequests || [];
  const acts = [["buy","Buy cane"],["cut","Cutting"],["load","Loading"],["transport","Transport"],["fuel","Fuel"],["labour","Labour"],["other","Other"]];
  return `
    <h1>Cane</h1>
    ${caneTabs("cane-ask")}
    <form class="card item" data-form="money-request" style="margin-top:14px">
      <input type="hidden" name="tag" value="sugarcane" />
      <div id="reqLines">
        <div class="grid g2 req-line" style="margin-top:8px">
          <select class="field" name="activity">${acts.map(([v,l])=>`<option value="${v}">${l}</option>`).join("")}</select>
          <input class="field req-amt" name="amountUgx" placeholder="UGX" />
        </div>
      </div>
      <button type="button" class="btn btn-ghost" id="addReqLine" style="margin-top:8px">Add activity</button>
      <p class="muted" id="reqTotal" style="margin-top:8px">Total UGX 0</p>
      <input class="field" name="note" placeholder="Why this money" style="margin-top:10px" />
      <button class="btn btn-primary wide" style="margin-top:12px">Send to owner</button>
    </form>
    <div class="list" style="margin-top:14px">
      ${reqs.map((r)=>`<div class="card item"><div class="row"><b>${ugx(r.totalUgx)}</b>${badge(r.status)}</div><p class="muted">${r.date} · ${r.note||""}</p>${(r.lines||[]).map((l)=>`<p class="muted">${l.activity} · ${ugx(l.amountUgx)}</p>`).join("")}</div>`).join("")}
    </div>`;
}

function viewRequests() {
  const list = DATA.moneyRequests || [];
  return `
    <h1>Money</h1>
    ${moneyTabs("requests")}
    <div class="list" style="margin-top:14px">
      ${list.length ? list.map((r) => `<div class="card item">
        <div class="row"><div><p class="eyebrow">${r.date} · ${r.tag} · ${r.by}</p><b>${ugx(r.totalUgx)}</b></div>${badge(r.status)}</div>
        <p class="muted" style="margin-top:6px">${r.note||""}</p>
        ${(r.lines||[]).map((l)=>`<p>${l.activity} · ${ugx(l.amountUgx)}</p>`).join("")}
        ${r.status === "open" ? `<div class="grid g2" style="margin-top:10px"><button class="btn btn-primary" data-act="decide_request" data-id="${r.id}" data-status="approved">Approve</button><button class="btn btn-ghost" data-act="decide_request" data-id="${r.id}" data-status="rejected">Reject</button></div>` : ""}
      </div>`).join("") : `<div class="card item">None</div>`}
    </div>`;
}

function farmTabs(on) {
  return tabMenu([
    ["#passion", "Blocks", "passion"],
    ["#field", "Work", "field"],
    ["#passion-sell", "Sell", "passion-sell"],
    ["#passion-pay", "Pay", "passion-pay"],
  ], on);
}
function works() { return DATA.farmWorks || []; }
function lastWork(blockId, kind) {
  return works().find((w) => w.blockId === blockId && w.kind === kind);
}

function viewPassion() {
  const k = DATA.kpis || {};
  const kinds = ["harvest", "prune", "spray", "fertilize", "weed"];
  return `
    <h1>Passion</h1>
    ${farmTabs("passion")}
    <div class="grid g4" style="margin-top:14px">
      <div class="card kpi passion"><span class="eyebrow">Stock</span><b>${k.stockKg ?? DATA.stockKg ?? 0} kg</b></div>
      <div class="card kpi"><span class="eyebrow">Picked</span><b>${k.harvestedKg || 0} kg</b></div>
      <div class="card kpi"><span class="eyebrow">Sold</span><b>${k.soldKg || 0} kg</b></div>
      <div class="card kpi gold"><span class="eyebrow">Work cost</span><b>${ugx(k.workCost || 0)}</b></div>
    </div>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Block</th><th>Harvest</th><th>Prune</th><th>Spray</th><th>Fertilize</th><th>Weed</th></tr></thead>
        <tbody>
          ${DATA.blocks.map((b) => `<tr>
            <td><b>${b.id}</b><div class="muted">${b.acres} ac</div></td>
            ${kinds.map((kind) => {
              const w = lastWork(b.id, kind);
              return `<td><a href="#field/${kind}">${w ? w.date : "—"}</a></td>`;
            }).join("")}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function viewField() {
  const kinds = [
    ["harvest", "Harvest", "Kg picked"],
    ["prune", "Prune", "What was pruned"],
    ["spray", "Spray", "Chemical used"],
    ["fertilize", "Fertilize", "Fertilizer used"],
    ["weed", "Weed", "What was weeded"],
  ];
  const kind = kinds.some((k) => k[0] === ROUTE.work) ? ROUTE.work : "harvest";
  const meta = kinds.find((k) => k[0] === kind);
  const rows = works().filter((w) => w.kind === kind);
  const cost = rows.reduce((s, w) => s + (Number(w.costUgx) || 0), 0);
  const kg = rows.reduce((s, w) => s + (Number(w.kg) || 0), 0);
  const extra = kind === "harvest"
    ? `<input class="field" name="kg" required placeholder="Kg picked" />`
    : `<input class="field" name="note" placeholder="${meta[2]}" />`;
  return `
    <h1>Passion</h1>
    ${farmTabs("field")}
    <label class="menu-box"><span>Activity</span>
      <select class="field" id="workKind">
        ${kinds.map(([v, l]) => `<option value="${v}" ${v === kind ? "selected" : ""}>${l}</option>`).join("")}
      </select>
    </label>
    <div class="grid g2" style="margin-top:14px">
      <div class="card kpi"><span class="eyebrow">${meta[1]} records</span><b>${rows.length}</b></div>
      <div class="card kpi gold"><span class="eyebrow">${meta[1]} cost</span><b>${ugx(cost)}</b></div>
      ${kind === "harvest" ? `<div class="card kpi passion"><span class="eyebrow">Picked</span><b>${kg} kg</b></div>` : ""}
    </div>
    <form class="card item" data-form="farm-work" style="margin-top:14px">
      <p class="eyebrow">${meta[1]}</p>
      <input type="hidden" name="kind" value="${kind}" />
      <div class="tabs" style="margin-top:8px" id="blockPick">
        ${["B1","B2","B3","B4"].map((id,i) => `<button type="button" class="block-btn ${i===0?"on":""}" data-block="${id}">${id}</button>`).join("")}
      </div>
      <input type="hidden" name="blockId" value="B1" />
      <div class="grid g2" style="margin-top:10px">
        <input class="field" name="date" type="date" />
        <input class="field" name="costUgx" placeholder="Cost UGX" />
      </div>
      <div style="margin-top:10px">${extra}</div>
      <button class="btn btn-passion wide" style="margin-top:10px">Save ${meta[1].toLowerCase()}</button>
    </form>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Date</th><th>Block</th><th>${kind === "harvest" ? "Kg" : meta[2]}</th><th>Cost</th></tr></thead>
        <tbody>
          ${rows.map((w) => `<tr><td>${w.date}</td><td>${w.blockId}</td><td>${kind === "harvest" ? (w.kg || 0) + " kg" : (w.note || "—")}</td><td>${ugx(w.costUgx)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No ${meta[1].toLowerCase()} yet</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function viewPassionSell() {
  const stock = DATA.kpis?.stockKg ?? DATA.stockKg ?? 0;
  const sales = DATA.fruitSales || [];
  return `
    <h1>Passion</h1>
    ${farmTabs("passion-sell")}
    <div class="grid g2" style="margin-top:14px">
      <div class="card kpi passion"><span class="eyebrow">Can sell</span><b>${stock} kg</b></div>
      <div class="card kpi gold"><span class="eyebrow">Sales</span><b>${ugx(DATA.kpis?.weekSales || 0)}</b></div>
    </div>
    <form class="card item" data-form="sale" style="margin-top:14px">
      <div class="grid g4">
        <input class="field" name="buyer" required placeholder="Buyer" />
        <input class="field" name="kg" required placeholder="Kg" />
        <input class="field" name="amountUgx" required placeholder="Sale UGX" />
        <select class="field" name="payMethod"><option value="cash">Cash</option><option value="mtn_momo">MoMo</option><option value="airtel_money">Airtel</option><option value="bank">Bank</option></select>
      </div>
      <div class="grid g3" style="margin-top:10px">
        <input class="field" name="paidUgx" placeholder="Paid now UGX" />
        <input class="field" name="expenseUgx" placeholder="Sale expense UGX" />
        <input class="field" name="expenseNote" placeholder="Expense note" />
      </div>
      <button class="btn btn-passion wide" style="margin-top:10px">Sell</button>
    </form>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Buyer</th><th>Kg</th><th>Sale</th><th>Paid</th><th>Expense</th></tr></thead>
        <tbody>
          ${sales.map((x) => `<tr>
            <td>${x.buyer}<div class="muted">${x.date}</div></td>
            <td>${x.kg}</td>
            <td>${ugx(x.amountUgx)}</td>
            <td>${ugx(x.paidUgx || 0)}</td>
            <td>${ugx(x.expenseUgx || 0)}${x.expenseNote ? `<div class="muted">${x.expenseNote}</div>` : ""}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function moneyTabs(on) {
  return tabMenu([
    ["#money", "Flow", "money"],
    ["#money-spend", "Spend", "money-spend"],
    ["#money-pl", "P&L", "money-pl"],
    ["#money-pay", "Pay", "money-pay"],
  ], on);
}
function cashRef(c) {
  if (c.truckId) {
    const t = (DATA.trucks || []).find((x) => x.id === c.truckId);
    return t ? t.plate : "";
  }
  if (c.caneBuyId) return c.caneBuyId;
  if (c.blockId) return c.blockId;
  return "";
}


function ytdPaid(list) {
  const y = String(new Date().getFullYear());
  return (list || []).filter((x) => x.status === "paid" && String(x.year || x.paidAt || "").startsWith(y)).reduce((s, x) => s + (x.amountUgx || 0), 0);
}

function viewPayAdmin() {
  const stubs = DATA.payStubs || [];
  const y = new Date().getFullYear();
  return `
    <h1>Money</h1>
    ${moneyTabs("money-pay")}
    <div class="card kpi" style="margin-top:14px"><span class="eyebrow">YTD paid</span><b>${ugx(ytdPaid(stubs))}</b></div>
    <form class="card item" data-form="month-stub" style="margin-top:14px">
      <p class="eyebrow">Monthly driver</p>
      <select class="field" name="personId" style="margin-top:8px">${(DATA.drivers||[]).filter((d)=>d.payType==="month").map((d)=>`<option value="${d.id}">${d.name} · ${ugx(d.monthRateUgx||0)}</option>`).join("") || '<option value="">No monthly drivers</option>'}</select>
      <input class="field" name="month" type="month" style="margin-top:8px" />
      <input class="field" name="amountUgx" placeholder="UGX" style="margin-top:8px" />
      <button class="btn btn-primary wide" style="margin-top:10px">Post monthly stub</button>
    </form>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Who</th><th>On</th><th>Amount</th><th></th></tr></thead>
        <tbody>
          ${stubs.length ? stubs.map((x) => `<tr>
            <td><b>${x.personName}</b><div class="muted">${x.phone || ((DATA.drivers||[]).find(d=>d.id===x.personId)||{}).phone || ""} · ${x.role}</div></td>
            <td>${x.refLabel}<div class="muted">${x.requestedAt}${x.paidAt ? " · paid "+x.paidAt : ""}</div></td>
            <td>${ugx(x.amountUgx)}</td>
            <td>${badge(x.status)}${x.status==="pending"?`<button class="btn btn-primary" data-act="pay_stub" data-id="${x.id}" data-status="paid">Pay to phone</button>`:""}</td>
          </tr>`).join("") : `<tr><td colspan="4" class="muted">None</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function viewCanePay() {
  const sales = DATA.caneSales || [];
  const stubs = DATA.payStubs || [];
  return `
    <h1>Cane</h1>
    ${caneTabs("cane-pay")}
    <div class="grid g2" style="margin-top:14px">
      <div class="card kpi gold"><span class="eyebrow">Waiting</span><b>${ugx(stubs.filter(x=>x.status!=="paid").reduce((a,x)=>a+(x.amountUgx||0),0))}</b></div>
      <div class="card kpi steel"><span class="eyebrow">Paid YTD</span><b>${ugx(ytdPaid(stubs))}</b></div>
    </div>
    <p class="eyebrow" style="margin-top:16px">Paid</p>
    <div class="list" style="margin-top:8px">${stubs.filter(x=>x.status==="paid").length ? stubs.filter(x=>x.status==="paid").map((x)=>`<div class="card item"><div class="row"><div><b>${x.refLabel}</b><p class="muted">${x.paidAt||""}</p></div><b>${ugx(x.amountUgx)}</b></div>${badge("paid")}</div>`).join("") : `<div class="card item">Nothing paid yet</div>`}</div>
    <p class="eyebrow" style="margin-top:16px">Sales</p>
    <div class="list" style="margin-top:8px">
      ${sales.length ? sales.map((s) => {
        const st = stubs.find((x) => x.refId === s.id);
        return `<div class="card item"><div class="row"><div><b>${s.tonnes} t</b><p class="muted">${s.date} · ${ugx(s.amountUgx)}</p></div>${st?badge(st.status):""}</div>
        ${!st?`<button class="btn btn-primary wide" style="margin-top:8px" data-act="request_pay" data-ref="${s.id}" data-amount="${s.amountUgx}">Request pay</button>`:""}</div>`;
      }).join("") : `<div class="card item">No sales</div>`}
    </div>`;
}

function viewPassionPay() {
  const sales = DATA.fruitSales || [];
  const stubs = DATA.payStubs || [];
  return `
    <h1>Passion</h1>
    ${farmTabs("passion-pay")}
    <div class="grid g2" style="margin-top:14px">
      <div class="card kpi gold"><span class="eyebrow">Waiting</span><b>${ugx(stubs.filter(x=>x.status!=="paid").reduce((a,x)=>a+(x.amountUgx||0),0))}</b></div>
      <div class="card kpi steel"><span class="eyebrow">Paid YTD</span><b>${ugx(ytdPaid(stubs))}</b></div>
    </div>
    <p class="eyebrow" style="margin-top:16px">Paid</p>
    <div class="list" style="margin-top:8px">${stubs.filter(x=>x.status==="paid").length ? stubs.filter(x=>x.status==="paid").map((x)=>`<div class="card item"><div class="row"><div><b>${x.refLabel}</b><p class="muted">${x.paidAt||""}</p></div><b>${ugx(x.amountUgx)}</b></div>${badge("paid")}</div>`).join("") : `<div class="card item">Nothing paid yet</div>`}</div>
    <p class="eyebrow" style="margin-top:16px">Sales</p>
    <div class="list" style="margin-top:8px">
      ${sales.length ? sales.map((s) => {
        const st = stubs.find((x) => x.refId === s.id);
        return `<div class="card item"><div class="row"><div><b>${s.kg} kg</b><p class="muted">${s.date} · ${s.buyer||""} · ${ugx(s.amountUgx)}</p></div>${st?badge(st.status):""}</div>
        ${!st?`<button class="btn btn-primary wide" style="margin-top:8px" data-act="request_pay" data-ref="${s.id}" data-amount="${s.amountUgx}">Request pay</button>`:""}</div>`;
      }).join("") : `<div class="card item">No sales</div>`}
    </div>`;
}

function viewMoney(tag) {
  const cashAll = DATA.cash || [];
  const cash = tag ? cashAll.filter((c) => c.tag === tag) : cashAll;
  const inn = cash.filter((c) => c.direction === "in").reduce((s, c) => s + (c.amountUgx || 0), 0);
  const out = cash.filter((c) => c.direction === "out").reduce((s, c) => s + (c.amountUgx || 0), 0);
  const href = { "": "#money", trucking: "#money-fleet", sugarcane: "#money-cane", passion: "#money-passion" };
  return `
    <h1>Money</h1>
    ${moneyTabs("money")}
    <select class="field" id="flowBiz" style="margin-top:14px;max-width:280px">
      <option value="" ${!tag?"selected":""}>All businesses</option>
      <option value="trucking" ${tag==="trucking"?"selected":""}>Fleet</option>
      <option value="sugarcane" ${tag==="sugarcane"?"selected":""}>Cane</option>
      <option value="passion" ${tag==="passion"?"selected":""}>Passion</option>
    </select>
    <div class="grid g3" style="margin-top:14px">
      <div class="card kpi"><span class="eyebrow">In</span><b>${ugx(inn)}</b></div>
      <div class="card kpi"><span class="eyebrow">Out</span><b>${ugx(out)}</b></div>
      <div class="card kpi gold"><span class="eyebrow">Net</span><b>${ugx(inn - out)}</b></div>
    </div>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Date</th><th>Line</th><th>On</th><th></th></tr></thead>
        <tbody>
          ${cash.length ? cash.map((c) => `<tr>
            <td>${c.date}</td>
            <td><b>${c.note || c.category || c.tag}</b></td>
            <td>${cashRef(c)}</td>
            <td style="text-align:right;color:${c.direction === "in" ? "var(--leaf)" : "var(--clay)"}"><b>${c.direction === "in" ? "+" : "−"}${ugx(c.amountUgx)}</b></td>
          </tr>`).join("") : `<tr><td colspan="4" class="muted">None for this book</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function viewSpend() {
  const floats = DATA.disbursements || [];
  const jobs = DATA.jobs || [];
  return `
    <h1>Money</h1>
    ${moneyTabs("money-spend")}
    <form class="card item" data-form="spend" style="margin-top:14px">
      <label class="label">1. Business</label>
      <select class="field" name="tag" id="spendTag">
        <option value="trucking">Fleet</option>
        <option value="sugarcane">Cane</option>
        <option value="passion">Passion</option>
      </select>
      <div id="spendStep2" style="display:none;margin-top:12px">
        <label class="label">2. What the money is for</label>
        <select class="field" name="activity" id="spendAct"></select>
        <div class="grid g2" style="margin-top:10px">
          <input class="field" name="amountUgx" required placeholder="Amount UGX" />
          <select class="field" name="method"><option value="cash">Cash</option><option value="mtn_momo">MoMo</option><option value="airtel_money">Airtel</option><option value="bank">Bank</option></select>
        </div>
        <div id="fleetTarget" style="display:none">
          <div class="grid g2" style="margin-top:10px">
            <select class="field" name="driverId">${(DATA.drivers||[]).map((d)=>`<option value="${d.id}">${d.name}</option>`).join("")}</select>
            <select class="field" name="truckId">${(DATA.trucks||[]).map((t)=>`<option value="${t.id}">${t.plate}</option>`).join("")}</select>
          </div>
          <select class="field" name="jobId" style="margin-top:10px">${jobs.map((j)=>`<option value="${j.id}">${j.cargo} · ${j.origin} → ${j.destination}</option>`).join("")}</select>
        </div>
        <input class="field" name="note" placeholder="Note" style="margin-top:10px" />
        <button class="btn btn-primary wide" style="margin-top:12px">Save spend</button>
      </div>
    </form>
    <h3 style="margin-top:18px">Saved spends</h3>
    <div class="card" style="margin-top:8px;overflow:auto">
      <table>
        <thead><tr><th>Date</th><th>Business</th><th>For</th><th>On</th><th></th></tr></thead>
        <tbody>
          ${(DATA.cash || []).filter((c) => c.direction === "out").map((c) => `<tr>
            <td>${c.date}</td>
            <td>${c.tag}</td>
            <td>${c.note || c.category || "—"}</td>
            <td>${cashRef(c)}</td>
            <td style="text-align:right"><b>−${ugx(c.amountUgx)}</b></td>
          </tr>`).join("") || `<tr><td colspan="5" class="muted">None yet</td></tr>`}
        </tbody>
      </table>
    </div>
    <h3 style="margin-top:18px">Advances sent</h3>
    <div class="card" style="margin-top:8px;overflow:auto">
      <table>
        <thead><tr><th>Driver</th><th>Sent</th><th>Used</th><th></th></tr></thead>
        <tbody>
          ${floats.length ? floats.map((f) => {
            const d = (DATA.drivers||[]).find((x)=>x.id===f.toDriverId);
            const used = (f.usages||[]).reduce((s,u)=>s+(u.amountUgx||0),0);
            return `<tr><td>${d?d.name:"—"}<div class="muted">${f.note||f.activity}</div></td><td>${ugx(f.amountUgx)}</td><td>${ugx(used)}</td><td>${badge(f.status)}</td></tr>
              ${(f.usages||[]).map((u)=>`<tr><td colspan="4" class="muted">${u.date} · ${u.category} · ${ugx(u.amountUgx)} · ${u.note||""}${u.photo?` <img src="${u.photo}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px;vertical-align:middle" />`:""}</td></tr>`).join("")}`;
          }).join("") : `<tr><td colspan="4" class="muted">None</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function weekKey(d) {
  const x = new Date(d + "T12:00:00");
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}
function quarterKey(d) {
  const x = new Date(d + "T12:00:00");
  const q = Math.floor(x.getMonth() / 3) + 1;
  return x.getFullYear() + "-Q" + q;
}
function plBuckets(mode) {
  const cash = DATA.cash || [];
  const map = {};
  for (const c of cash) {
    const key = mode === "quarter" ? quarterKey(c.date) : weekKey(c.date);
    if (!map[key]) map[key] = { key, in: 0, out: 0, ins: [], outs: [] };
    if (c.direction === "in") { map[key].in += c.amountUgx || 0; map[key].ins.push(c); }
    else { map[key].out += c.amountUgx || 0; map[key].outs.push(c); }
  }
  return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
}
function plChart(rows) {
  const w = 560, h = 160, pad = 28;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.in, r.out)));
  const n = Math.max(rows.length, 1);
  const bw = (w - pad * 2) / n;
  const bars = rows.map((r, i) => {
    const x = pad + i * bw;
    const hi = Math.round((r.in / max) * (h - pad - 8));
    const ho = Math.round((r.out / max) * (h - pad - 8));
    const label = r.key.startsWith("20") && r.key.includes("Q") ? r.key.slice(2) : r.key.slice(5);
    return `<rect x="${x + 4}" y="${h - pad - hi}" width="${Math.max(6, bw / 2 - 6)}" height="${hi}" rx="3" fill="#163454"/>
      <rect x="${x + bw / 2}" y="${h - pad - ho}" width="${Math.max(6, bw / 2 - 6)}" height="${ho}" rx="3" fill="#f09018"/>
      <text x="${x + bw / 2}" y="${h - 8}" text-anchor="middle" font-size="9" fill="#102840">${label}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="160">${bars}</svg>
    <p class="muted"><span style="color:#163454">■</span> Income &nbsp; <span style="color:#f09018">■</span> Sent / spend</p>`;
}
function viewPL(mode) {
  const st = DATA.statement || { books: {}, inAll: 0, outAll: 0, profit: 0, owed: 0 };
  const books = ["trucking", "sugarcane", "passion"];
  const name = { trucking: "Fleet", sugarcane: "Cane", passion: "Passion" };
  const buckets = plBuckets(mode);
  const last = buckets[buckets.length - 1];
  const shown = buckets.slice(-8);
  return `
    <h1>Money</h1>
    ${moneyTabs("money-pl")}
    <div class="tabs" style="margin-top:8px">
      <a class="${mode==="week"?"on":""}" href="#money-pl">Week</a>
      <a class="${mode==="quarter"?"on":""}" href="#money-pl-q">Quarter</a>
    </div>
    <div class="grid g4" style="margin-top:14px">
      <div class="card kpi"><span class="eyebrow">Income</span><b>${ugx(st.inAll)}</b></div>
      <div class="card kpi"><span class="eyebrow">Sent</span><b>${ugx(st.outAll)}</b></div>
      <div class="card kpi gold"><span class="eyebrow">Profit</span><b>${ugx(st.profit)}</b></div>
      <div class="card kpi"><span class="eyebrow">${mode==="week"?"This week":"This quarter"}</span><b>${last ? ugx(last.in - last.out) : ugx(0)}</b></div>
    </div>
    <div class="card item" style="margin-top:14px">${plChart(shown)}</div>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>${mode==="week"?"Week of":"Quarter"}</th><th>Income</th><th>Sent</th><th>Net</th></tr></thead>
        <tbody>
          ${shown.map((r) => `<tr><td>${r.key}</td><td>${ugx(r.in)}</td><td>${ugx(r.out)}</td><td><b>${ugx(r.in - r.out)}</b></td></tr>`).join("") || `<tr><td colspan="4" class="muted">None</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Book</th><th>Income</th><th>Sent</th><th>Profit</th></tr></thead>
        <tbody>
          ${books.map((k) => {
            const b = st.books[k] || { in: 0, out: 0, profit: 0 };
            return `<tr><td><b>${name[k]}</b></td><td>${ugx(b.in)}</td><td>${ugx(b.out)}</td><td><b>${ugx(b.profit)}</b></td></tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    ${last ? `
    <div class="grid g2" style="margin-top:14px">
      <div class="card item">
        <p class="eyebrow">Income dates · ${last.key}</p>
        ${(last.ins.slice(0,6)).map((c)=>`<p class="row" style="margin-top:8px"><span>${c.date}<div class="muted">${c.note||c.tag}</div></span><b>+${ugx(c.amountUgx)}</b></p>`).join("") || `<p class="muted">None</p>`}
        ${last.ins.length>6?`<p class="muted">${last.ins.length-6} more</p>`:""}
      </div>
      <div class="card item">
        <p class="eyebrow">Sent dates · ${last.key}</p>
        ${(last.outs.slice(0,6)).map((c)=>`<p class="row" style="margin-top:8px"><span>${c.date}<div class="muted">${c.note||c.category||c.tag}</div></span><b>−${ugx(c.amountUgx)}</b></p>`).join("") || `<p class="muted">None</p>`}
        ${last.outs.length>6?`<p class="muted">${last.outs.length-6} more</p>`:""}
      </div>
    </div>` : ""}`;
}

function bind() {
  document.querySelectorAll("form[data-form=inspect] .mark").forEach((lab) => {
    lab.onclick = () => {
      const box = lab.closest(".inspect-part");
      box.querySelectorAll(".mark").forEach((c) => c.classList.remove("on"));
      lab.classList.add("on");
      const val = lab.querySelector("input").value;
      const shot = box.querySelector(".js-shot");
      if (shot) shot.style.display = (val === "warn" || val === "fail") ? "" : "none";
    };
  });
  document.querySelectorAll("[data-act]").forEach((btn) => {
    btn.onclick = () => act(btn.dataset.act, { id: btn.dataset.id, status: btn.dataset.status, method: "mtn_momo", refId: btn.dataset.ref, kind: btn.dataset.kind, amountUgx: btn.dataset.amount, personId: btn.dataset.person, personName: btn.dataset.name, month: btn.dataset.month });
  });
  const cargoSel = document.querySelector(".js-cargo");
  const cargoOther = document.querySelector(".js-cargo-other");
  if (cargoSel && cargoOther) {
    cargoSel.onchange = () => {
      cargoOther.style.display = cargoSel.value === "Other" ? "" : "none";
      if (cargoSel.value !== "Other") cargoOther.value = "";
    };
  }
  const typeAcre = $("#type-acre");
  const typeTrip = $("#type-trip");
  if (typeAcre) {
    const setType = (t) => {
      const form = document.querySelector("[data-form=cane]");
      form.type.value = t;
      document.querySelectorAll(".acre-only").forEach((el) => (el.style.display = t === "acre" ? "grid" : "none"));
      document.querySelectorAll(".trip-only").forEach((el) => (el.style.display = t === "trip" ? "grid" : "none"));
      typeAcre.className = "btn " + (t === "acre" ? "btn-primary" : "btn-ghost");
      typeTrip.className = "btn " + (t === "trip" ? "btn-primary" : "btn-ghost");
    };
    typeAcre.onclick = () => setType("acre");
    typeTrip.onclick = () => setType("trip");
    const hint = () => {
      const form = document.querySelector("[data-form=cane]");
      const f = fuelOf(Number(form.transportKm.value) || 0, Number(form.kmPerLitre.value) || 0, Number(form.dieselUgxPerLitre.value) || 0);
      const expected = form.type.value === "acre"
        ? Number(form.acres.value || 0) * Number(form.expectedTonnesPerAcre.value || 0)
        : Number(form.tripsAgreed.value || 0) * Number(form.expectedTonnesPerTrip.value || 0);
      $("#fuelHint").textContent = `${f.litres} L · ${ugx(f.fuelUgx)} diesel · about ${expected} t expected`;
    };
    document.querySelector("[data-form=cane]").addEventListener("input", hint);
    hint();
  }
  document.querySelectorAll("[data-block]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("[data-block]").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      const form = btn.closest("form");
      if (form) form.blockId.value = btn.dataset.block;
    };
  });
  document.querySelectorAll("[data-tag]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("[data-tag]").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      btn.closest("form").tag.value = btn.dataset.tag;
    };
  });
  document.querySelectorAll("form[data-form]").forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());
      const kind = form.dataset.form;
      if (kind === "job") {
        await act("create_job", fd);
        location.hash = "#trucks";
      } else if (kind === "save-truck") {
        await act("save_truck", fd);
        location.hash = "#trucks-drivers";
      } else if (kind === "save-driver") {
        await act("save_driver", fd);
        location.hash = "#trucks-drivers";
      } else if (kind === "driver-load") {
        await act("create_job", fd);
        location.hash = "#drive-jobs";
      } else if (kind === "scale") {
        const file = form.querySelector("[name=ticket]").files[0];
        if (!file) { alert("Add the scale ticket"); return; }
        const scaleTicket = await compressPhoto(file);
        await act("log_scale", { id: form.dataset.id, tonnes: fd.tonnes, scaleTicket });
      } else if (kind === "invoice") {
        const file = form.querySelector("[name=invoice]").files[0];
        if (!file) { alert("Add the invoice"); return; }
        const invoice = await compressPhoto(file);
        await act("log_invoice", { id: form.dataset.id, amountUgx: fd.amountUgx, paidNow: fd.paidNow, invoice });
      } else if (kind === "inspect") {
        const items = {};
        const photos = {};
        form.querySelectorAll(".inspect-part").forEach((box) => {
          const id = box.dataset.part;
          const val = (box.querySelector("input[type=radio]:checked") || {}).value || "pass";
          items[id] = val;
        });
        const need = Object.keys(items).filter((k) => items[k] === "warn" || items[k] === "fail");
        const files = [...form.querySelectorAll(".js-shot")];
        for (const inp of files) {
          const id = inp.dataset.part;
          if (!need.includes(id)) continue;
          if (!inp.files || !inp.files[0]) { alert("Add a photo for each WARNING or FAIL"); return; }
          photos[id] = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(inp.files[0]);
          });
        }
        const voice = (window.__issueMedia && window.__issueMedia.voice) || "";
        await act("submit_inspect", { truckId: DATA.truck?.id, odometerKm: fd.odometerKm, note: fd.note, items, photos, voice });
        window.__issueMedia = { photos: [], voice: "", sec: 0 };
        location.hash = "#drive-report";
      } else if (kind === "fuel") {
        await act("log_fuel", { ...fd, truckId: DATA.truck?.id });
      } else if (kind === "cane") {
        await act("create_cane_buy", fd);
        location.hash = "#cane";
      } else if (kind === "mill") {
        await act("record_mill", { id: form.dataset.id, millTonnes: fd.millTonnes, millPriceUgx: fd.millPriceUgx || undefined });
      } else if (kind === "cane-sale") {
        await act("create_cane_sale", fd);
        location.hash = "#cane-sell";
      } else if (kind === "cane-expense") {
        await act("log_cane_expense", fd);
        location.hash = "#cane-spend";
      } else if (kind === "money-request") {
        const lines = [...form.querySelectorAll(".req-line")].map((row) => ({
          activity: row.querySelector("[name=activity]").value,
          amountUgx: row.querySelector(".req-amt").value,
        }));
        await act("request_money", { tag: fd.tag || "sugarcane", note: fd.note, lines });
        location.hash = "#cane-ask";
      } else if (kind === "harvest") {
        await act("log_farm_work", { ...fd, kind: "harvest" });
      } else if (kind === "field") {
        await act("log_farm_work", fd);
      } else if (kind === "farm-work") {
        await act("log_farm_work", fd);
      } else if (kind === "sale") {
        try { await act("create_fruit_sale", fd); }
        catch (err) { alert(err.message); return; }
      } else if (kind === "cash") {
        await act("add_cash", fd);
      } else if (kind === "spend") {
        if (!fd.tag) { alert("Choose a business first"); return; }
        if (fd.tag === "trucking" && fd.activity === "to_driver") {
          if (!fd.driverId) { alert("Choose a driver"); return; }
          await act("send_float", { ...fd, toDriverId: fd.driverId });
        } else {
          await act("add_cash", {
            direction: "out",
            amountUgx: fd.amountUgx,
            tag: fd.tag,
            method: fd.method,
            note: fd.note,
            category: fd.activity,
            truckId: fd.truckId || "",
          });
        }
        location.hash = "#money-spend";
      } else if (kind === "float-use") {
        const file = form.querySelector(".use-photo") && form.querySelector(".use-photo").files[0];
        let photo = "";
        if (file) photo = await compressPhoto(file);
        await act("log_float_use", { id: form.dataset.id, amountUgx: fd.amountUgx, category: fd.category, note: fd.note, photo });
        location.hash = "#drive-money";
      } else if (kind === "trip-result") {
        await act("log_trip_result", { id: form.dataset.id, tonnesDelivered: fd.tonnesDelivered, payPerTonne: fd.payPerTonne });
      } else if (kind === "fleet-task") {
        if (!fd.kind) { alert("Choose a task"); return; }
        if (!fd.title) fd.title = fd.kind === "inspect" ? "Check " + (form.part && form.part.selectedOptions[0] ? form.part.selectedOptions[0].text : "part") : fd.kind.replace(/_/g, " ");
        await act("create_fleet_task", { ...fd, part: fd.part || "" });
        location.hash = "#trucks-work";
      } else if (kind === "service") {
        await act("log_service", fd);
      } else if (kind === "issue") {
        const media = window.__issueMedia || { photos: [], voice: "", sec: 0 };
        if (!fd.title && !fd.note && !media.voice && !media.photos.length) {
          alert("Add a photo, a voice note, or a short line.");
          return;
        }
        await act("report_issue", {
          ...fd,
          title: fd.title || "Truck report",
          photos: media.photos,
          voice: media.voice,
          voiceSec: media.sec,
        });
        window.__issueMedia = { photos: [], voice: "", sec: 0 };
      } else if (kind === "reply-issue") {
        await act("reply_issue", { id: form.dataset.id, text: fd.text, close: fd.close === "1" || form.close === form.querySelector("[name=close]") && document.activeElement === form.querySelector("[name=close]") });
      } else if (kind === "complete-task") {
        await act("complete_fleet_task", { id: form.dataset.id, driverNote: fd.driverNote });
      }
    };
  });
  bindMedia();
  bindRouteCalc();
  const flowBiz = document.getElementById("flowBiz");
  if (flowBiz) flowBiz.onchange = () => { location.hash = ({"":"#money",trucking:"#money-fleet",sugarcane:"#money-cane",passion:"#money-passion"})[flowBiz.value] || "#money"; };
  const saleT = $("#saleT");
  const saleP = $("#saleP");
  const saleSum = $("#saleSum");
  const sumSale = () => {
    if (!saleSum) return;
    const t = Number(saleT && saleT.value) || 0;
    const p = Number(saleP && saleP.value) || 0;
    saleSum.textContent = "Total " + ugx(Math.round(t * p));
  };
  if (saleT) saleT.oninput = sumSale;
  if (saleP) saleP.oninput = sumSale;
  const addReq = $("#addReqLine");
  if (addReq) {
    addReq.onclick = () => {
      const box = $("#reqLines");
      const first = box.querySelector(".req-line");
      box.appendChild(first.cloneNode(true));
      bindReqTotal();
    };
    bindReqTotal();
  }
  document.querySelectorAll(".use-photo").forEach((input) => {
    input.onchange = async () => {
      const box = input.parentElement.querySelector(".use-preview");
      if (!input.files[0] || !box) return;
      const src = await compressPhoto(input.files[0]);
      box.innerHTML = src ? `<img src="${src}" alt="" />` : "";
    };
  });
  document.querySelectorAll(".js-contractor").forEach((sel) => {
    const box = sel.parentElement.querySelector(".js-new-contractor");
    const sync = () => { if (box) box.style.display = sel.value === "new" ? "grid" : "none"; };
    sel.onchange = sync;
    sync();
  });
  document.querySelectorAll(".nav-jump").forEach((sel) => {
    sel.onchange = () => { if (sel.value) location.hash = sel.value; };
  });
  const taskKind = document.querySelector("[data-form=fleet-task] select[name=kind]");
  const partBox = document.getElementById("inspectParts");
  if (taskKind && partBox) {
    const syncParts = () => { partBox.style.display = taskKind.value === "inspect" ? "block" : "none"; };
    taskKind.onchange = syncParts;
    syncParts();
  }
  document.querySelectorAll(".js-unit").forEach((sel) => {
    const form = sel.form;
    const sync = () => {
      const t = (DATA.trucks || []).find((x) => x.id === sel.value);
      if (!t || !form) return;
      if (form.model) form.model.value = t.model || "";
      if (form.assignedDriverId) form.assignedDriverId.value = t.assignedDriverId || "";
    };
    sel.onchange = sync;
  });
  document.querySelectorAll(".js-driver").forEach((sel) => {
    const form = sel.form;
    const sync = () => {
      const d = (DATA.drivers || []).find((x) => x.id === sel.value);
      if (!d || !form) return;
      if (form.phone) form.phone.value = d.phone || "";
      if (form.assignedTruckId) form.assignedTruckId.value = d.assignedTruckId || "";
      if (form.payType) form.payType.value = d.payType || "trip";
      if (form.monthRateUgx) {
        form.monthRateUgx.value = d.monthRateUgx || "";
        form.monthRateUgx.style.display = form.payType.value === "month" ? "block" : "none";
      }
    };
    sel.onchange = sync;
  });
  document.querySelectorAll(".js-paytype").forEach((sel) => {
    sel.onchange = () => {
      const box = sel.form && sel.form.monthRateUgx;
      if (box) box.style.display = sel.value === "month" ? "block" : "none";
    };
  });
  const workKind = $("#workKind");
  if (workKind) workKind.onchange = () => { location.hash = "field/" + workKind.value; };
  const go = $("#goPage");
  if (go) go.onchange = () => { if (go.value) location.hash = go.value; };
  const spendTag = $("#spendTag");
  const spendAct = $("#spendAct");
  const spendStep2 = $("#spendStep2");
  const fleetTarget = $("#fleetTarget");
  const acts = {
    trucking: [["to_driver", "Send advance"], ["parts", "Parts"], ["diesel", "Diesel"], ["workshop", "Workshop"], ["papers", "Papers"]],
    sugarcane: [["buy", "Buy cane"], ["cut", "Cutting"], ["load", "Loading"], ["transport", "Transport"]],
    passion: [["harvest", "Harvest"], ["prune", "Prune"], ["spray", "Spray"], ["fertilize", "Fertilize"], ["weed", "Weed"]],
  };
  const refreshSpend = () => {
    if (!spendTag) return;
    const tag = spendTag.value;
    if (!tag) { spendStep2.style.display = "none"; return; }
    spendStep2.style.display = "block";
    spendAct.innerHTML = acts[tag].map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    fleetTarget.style.display = tag === "trucking" ? "block" : "none";
  };
  if (spendTag) {
    spendTag.onchange = refreshSpend;
    refreshSpend();
  }
  if (document.getElementById("liveMap")) drawLiveMap();
}

function livePings() {
  try { return JSON.parse(localStorage.getItem("conacrew-live") || "{}"); } catch (e) { return {}; }
}
function startLiveWatch() {
  if (!navigator.geolocation || window.__liveWatch) return;
  const truck = DATA.truck;
  if (!truck) return;
  window.__liveWatch = navigator.geolocation.watchPosition((pos) => {
    const speed = pos.coords.speed || 0;
    const ping = { truckId: truck.id, plate: truck.plate, lat: pos.coords.latitude, lng: pos.coords.longitude, speed, moving: speed > 1, at: Date.now() };
    const all = livePings();
    all[truck.id] = ping;
    localStorage.setItem("conacrew-live", JSON.stringify(all));
    fetch("/.netlify/functions/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ping) }).catch(() => {});
  }, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
}
async function drawLiveMap() {
  const box = document.getElementById("liveMap");
  const list = document.getElementById("liveList");
  if (!box || !window.L) return;
  let pings = livePings();
  try {
    const res = await fetch("/.netlify/functions/live");
    if (res.ok) pings = await res.json();
  } catch (e) {}
  if (box._map) { box._map.remove(); box._map = null; }
  const map = L.map(box).setView([0.3476, 32.5825], 7);
  box._map = map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);
  const pts = [];
  if (list) list.innerHTML = "";
  (DATA.trucks || []).forEach((t) => {
    const p = pings[t.id];
    const d = (DATA.drivers || []).find((x) => x.id === t.assignedDriverId);
    const moving = p && p.moving && Date.now() - p.at < 120000;
    const fresh = p && Date.now() - p.at < 120000;
    if (p) {
      L.marker([p.lat, p.lng]).addTo(map).bindPopup(t.plate + (moving ? " · moving" : " · stopped"));
      pts.push([p.lat, p.lng]);
    }
    if (list) list.insertAdjacentHTML("beforeend", `<div class="card item"><b>${t.plate}</b><p class="muted">${d ? d.name : "—"} · ${moving ? "Engine on, moving" : fresh ? "Stopped" : "No live signal"}</p></div>`);
  });
  if (pts.length) map.fitBounds(pts, { padding: [24, 24], maxZoom: 13 });
  setTimeout(() => map.invalidateSize(), 200);
}
function compressPhoto(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.62));
    };
    img.onerror = () => resolve("");
    img.src = url;
  });
}

function bindMedia() {
  window.__issueMedia = window.__issueMedia || { photos: [], voice: "", sec: 0 };
  const input = $("#issuePhotos");
  const preview = $("#photoPreview");
  if (input) {
    input.onchange = async () => {
      const files = [...input.files].slice(0, 4);
      const photos = [];
      for (const f of files) photos.push(await compressPhoto(f));
      window.__issueMedia.photos = photos.filter(Boolean);
      if (preview) preview.innerHTML = window.__issueMedia.photos.map((src) => `<img src="${src}" alt="" />`).join("");
    };
  }
  const start = $("#recStart");
  const stop = $("#recStop");
  const time = $("#recTime");
  const play = $("#recPlay");
  if (!start || !stop) return;
  let rec = null;
  let chunks = [];
  let tick = null;
  let sec = 0;
  const cap = 180;
  const show = () => {
    if (time) time.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} / 3:00`;
  };
  start.onclick = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          window.__issueMedia.voice = reader.result;
          window.__issueMedia.sec = sec;
          if (play) { play.src = reader.result; play.style.display = "block"; }
        };
        reader.readAsDataURL(blob);
      };
      rec.start();
      sec = 0;
      show();
      start.disabled = true;
      stop.disabled = false;
      tick = setInterval(() => {
        sec += 1;
        show();
        if (sec >= cap) stop.click();
      }, 1000);
    } catch (err) {
      alert("Mic not available.");
    }
  };
  stop.onclick = () => {
    if (tick) clearInterval(tick);
    tick = null;
    if (rec && rec.state !== "inactive") rec.stop();
    start.disabled = false;
    stop.disabled = true;
  };
}

window.addEventListener("hashchange", () => DATA && route());
boot();

function bindReqTotal() {
  const box = document.getElementById("reqLines");
  const out = document.getElementById("reqTotal");
  if (!box || !out) return;
  const run = () => {
    const n = [...box.querySelectorAll(".req-amt")].reduce((s, el) => s + (Number(el.value) || 0), 0);
    out.textContent = "Total " + ugx(n);
  };
  box.querySelectorAll(".req-amt").forEach((el) => { el.oninput = run; });
  run();
}

function placeLine(v, t, d) {
  return [v, t, d].map((x) => (x || "").trim()).filter(Boolean).join(", ");
}
async function geoPlace(q) {
  const tries = [q + ", Uganda", q];
  for (const item of tries) {
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ug&q=" + encodeURIComponent(item);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const rows = await res.json();
    if (rows[0]) return { lat: Number(rows[0].lat), lon: Number(rows[0].lon), label: rows[0].display_name };
  }
  throw new Error("Place not found: " + q);
}
function havKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
async function roadKm(a, b) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes[0]) return data.routes[0].distance / 1000;
  } catch (e) {}
  return havKm(a, b) * 1.25;
}
function bindRouteCalc() {
  const box = document.getElementById("routeMap");
  if (!box || typeof L === "undefined") return;
  const hint = document.querySelector(".js-route");
  const kmEl = document.querySelector(".js-km");
  const deadEl = document.querySelector(".js-dead");
  const haulEl = document.querySelector(".js-haul");
  const map = L.map(box).setView([1.37, 32.3], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
  setTimeout(() => map.invalidateSize(), 200);
  let now = null, pick = null, drop = null, m0 = null, m1 = null, m2 = null, line = null, nextPin = "pick";
  const zoomFor = (v, t) => (v && v.trim() ? 14 : t && t.trim() ? 12 : 10);
  const fillFuel = () => {
    const diesel = Number(document.querySelector(".js-diesel")?.value) || DATA.dieselDefaultUgx || 5200;
    const truck = DATA.truck || (DATA.trucks || []).find((t) => t.id === document.querySelector("[name=truckId]")?.value) || (DATA.trucks || [])[0] || {};
    const dead = Number(document.querySelector(".js-dead")?.value) || 0;
    const haul = Number(document.querySelector(".js-haul")?.value) || Number(document.querySelector(".js-km")?.value) || 0;
    if (typeof estimateTripFuel !== "function") return;
    const f = estimateTripFuel(dead, haul, truck.hp || 370, diesel);
    const L = document.querySelector(".js-litres");
    const C = document.querySelector(".js-fuel");
    if (L) L.value = f.litres;
    if (C) C.value = f.fuelUgx;
  };
  const flyPlace = async (which) => {
    const v = document.querySelector(which === "pick" ? ".js-pv" : ".js-dv")?.value;
    const q = (v || "").trim();
    if (!q) return;
    if (hint) hint.textContent = "Finding " + q + "…";
    try {
      const g = await geoPlace(q);
      map.setView([g.lat, g.lon], zoomFor(v, ""));
      nextPin = which;
      if (hint) hint.textContent = "Zoomed to " + q + ". Tap the exact " + (which === "pick" ? "pickup" : "drop") + ".";
    } catch (err) {
      if (hint) hint.textContent = "Name not found. Zoom and tap.";
    }
  };
  const measure = async () => {
    if (!pick || !drop) return;
    if (hint) hint.textContent = "Measuring road…";
    try {
      const dead = now ? Math.round(await roadKm(now, pick)) : 0;
      const haul = Math.round(await roadKm(pick, drop));
      const km = dead + haul;
      if (deadEl) deadEl.value = dead;
      if (haulEl) haulEl.value = haul;
      if (kmEl) kmEl.value = km;
      fillFuel();
      const o = document.querySelector(".js-origin"); const d = document.querySelector(".js-dest");
      if (o && !(o.value||"").trim()) o.value = "Pickup";
      if (d && !(d.value||"").trim()) d.value = "Drop";
      if (hint) hint.textContent = now
        ? ("To pickup " + dead + " km + loaded " + haul + " km = " + km + " km")
        : (haul + " km");
      if (line) map.removeLayer(line);
      const pts = [];
      if (now) pts.push([now.lat, now.lon]);
      pts.push([pick.lat, pick.lon], [drop.lat, drop.lon]);
      line = L.polyline(pts, { color: "#f09018" }).addTo(map);
    } catch (err) {
      if (hint) hint.textContent = err.message || "Could not measure";
    }
  };
  const setNow = (pt) => {
    now = pt;
    if (m0) map.removeLayer(m0);
    m0 = L.marker([pt.lat, pt.lon]).addTo(map).bindPopup("Truck now").openPopup();
    map.setView([pt.lat, pt.lon], 12);
    if (pick && drop) measure();
    else if (hint) hint.textContent = "Truck place added. Tap pickup and drop if not set.";
  };
  map.on("click", (e) => {
    const pt = { lat: e.latlng.lat, lon: e.latlng.lng };
    if (nextPin === "pick") {
      pick = pt;
      if (m1) map.removeLayer(m1);
      m1 = L.marker([pt.lat, pt.lon]).addTo(map).bindPopup("Pickup").openPopup();
      nextPin = "drop";
      if (hint) hint.textContent = "Pickup marked. Tap drop.";
      if (drop) measure();
    } else {
      drop = pt;
      if (m2) map.removeLayer(m2);
      m2 = L.marker([pt.lat, pt.lon]).addTo(map).bindPopup("Drop").openPopup();
      measure();
    }
  });
  const pv = document.querySelector(".js-pv");
  const dv = document.querySelector(".js-dv");
  if (pv) pv.onblur = () => flyPlace("pick");
  if (dv) dv.onblur = () => flyPlace("drop");
  const writePlaces = () => {
    const o = document.querySelector(".js-origin");
    const d = document.querySelector(".js-dest");
    if (o) o.value = (pv && pv.value.trim()) || "Pickup";
    if (d) d.value = (dv && dv.value.trim()) || "Drop";
  };
  if (pv) pv.oninput = writePlaces;
  if (dv) dv.oninput = writePlaces;
  writePlaces();
  const kmBox = document.querySelector(".js-km");
  if (kmBox) kmBox.oninput = fillFuel;
  const dBox = document.querySelector(".js-diesel");
  if (dBox) dBox.oninput = fillFuel;
  const gps = document.getElementById("useGps");
  if (gps) gps.onclick = () => {
    if (!navigator.geolocation) { alert("GPS not available"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setNow({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => alert("Allow location for truck now")
    );
  };
}
