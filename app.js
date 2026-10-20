const $ = (s, el = document) => el.querySelector(s);

function ugx(n) {
  return "UGX " + Math.round(n || 0).toLocaleString("en-UG");
}
function tonnes(n) {
  return (n || 0).toLocaleString("en-UG", { maximumFractionDigits: 1 }) + " t";
}
const BADGE_TEXT = { pass: "OK", ok: "OK", warn: "Needs attention", warning: "Needs attention", fail: "Not OK", idle: "Ready", on_trip: "On a trip", workshop: "In workshop", parked: "Parked", "not paid": "Not paid", seller_paid: "Seller paid" };
function label(s) {
  return String(s || "").replace(/_/g, " ");
}
const CARGO_BASE = ["Plaster Sand", "Lake Sand", "Stone dust", "Coal", "Murram (dirt)", "Bumba", "Rocks", "Sugarcane"];
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
  return `<div class="inspect-top"><span class="muted js-insp-count">0 of ${INSPECT.reduce((n, [, p]) => n + p.length, 0)} checked</span><button type="button" class="btn btn-ghost btn-sm js-all-ok">Mark all OK</button></div>` + INSPECT.map(([g, parts]) => `
    <p class="eyebrow" style="margin-top:14px">${g}</p>
    ${parts.map(([id, name]) => `
      <div class="inspect-part" data-part="${id}" style="padding:8px 0;border-bottom:1px solid rgba(15,28,46,.08)">
        <div class="row">
          <span>${name}</span>
          <span style="display:flex;gap:6px">
            <label class="mark pass"><input type="radio" name="p_${id}" value="pass" hidden />OK</label>
            <label class="mark warn"><input type="radio" name="p_${id}" value="warn" hidden />NEEDS ATTENTION</label>
            <label class="mark fail"><input type="radio" name="p_${id}" value="fail" hidden />NOT OK</label>
          </span>
        </div>
        <input class="field js-shot" type="file" accept="image/*" capture="environment" data-part="${id}" aria-label="Photo of the problem: ${name}" style="display:none;margin-top:8px" />
      </div>`).join("")}
  `).join("");
}
function cargoSelect(val) {
  const v = val || "";
  const known = cargoOptions();
  const same = known.find((c) => c.toLowerCase() === v.toLowerCase());
  const pick = same || (v ? "Other" : "");
  return `<select class="field js-cargo" name="cargo" required>
    ${known.map((c) => `<option value="${c}" ${pick===c?"selected":""}>${c}</option>`).join("")}
    <option value="Other" ${pick==="Other"?"selected":""}>Other</option>
  </select>
  <input class="field js-cargo-other" name="cargoOther" placeholder="Other cargo" style="margin-top:8px;${pick==="Other"?"":"display:none"}" value="${pick==="Other"?v:""}" />`;
}
function isPaid(j) {
  return !!(j && (j.paid || j.status === "paid"));
}
// ---- where a load came from: a client booking (CR-...), the office or a driver ----
function jobSource(j) {
  const bk = j.bookingId ? (DATA.bookings || []).find((x) => x.id === j.bookingId) : null;
  const ref = j.bookingRef || (bk && bk.ref) || "";
  if (ref) return { kind: "client", ref, text: "Client booking " + ref };
  if (j.source === "driver") return { kind: "driver", text: "Added by driver" + (j.loggedBy ? " · " + j.loggedBy : "") };
  return { kind: "office", text: "Created by office" + (j.loggedBy ? " · " + j.loggedBy : "") };
}
function sourceChip(j) {
  const s = jobSource(j);
  if (s.kind === "client") return `<button type="button" class="src-chip client js-openbk" data-ref="${esc(s.ref)}" title="Open the booking">Client · ${esc(s.ref)}</button>`;
  return `<span class="src-chip ${s.kind}">${s.kind === "driver" ? "Driver" : "Office"}</span>`;
}
// ---- trip steps: one distinct word for each moment ----
const TRIP = [
  ["booked", "Truck assigned", ""],
  ["to_pickup", "Heading to pickup", "Start trip"],
  ["loading", "Loading", "Arrived at pickup"],
  ["en_route", "In transit", "Loaded, leaving"],
  ["delivered", "Delivered", "Delivered"],
];
const TRIP_NAME = Object.fromEntries(TRIP.map(([k, n]) => [k, n]));
const tripIdx = (st) => { const i = TRIP.findIndex(([k]) => k === st); return i >= 0 ? i : ["invoiced", "paid"].includes(st) ? 4 : 0; };
const tripNext = (j) => TRIP[tripIdx(j.status) + 1] || null;
function tripTime(j, k) { const s = (j.steps || {})[k]; return s && s.at ? new Date(s.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""; }
// office: next step button plus a picker to fix a step the driver forgot
function tripControls(j) {
  if (tripIdx(j.status) >= 4) return "";
  const n = tripNext(j);
  return `<div class="trip-ctl">
    <button type="button" class="btn btn-steel btn-sm" data-act="update_job" data-id="${esc(j.id)}" data-status="${n[0]}">${esc(n[1])}</button>
    <select class="field js-tripset" data-id="${esc(j.id)}" aria-label="Set step">${TRIP.map(([k, name], i) => `<option value="${k}" ${k === j.status ? "selected" : ""} ${i < tripIdx(j.status) ? "disabled" : ""}>${name}</option>`).join("")}</select>
  </div>`;
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
    parked: "",
    en_route: "blue",
    in_transit: "blue",
    booked: "",
    to_pickup: "blue",
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
  const txt = BADGE_TEXT[status] || (TRIP_NAME[status] && status !== "delivered" ? TRIP_NAME[status] : label(status));
  return `<span class="badge ${map[status] || ""}">${esc(txt.charAt(0).toUpperCase() + txt.slice(1))}</span>`;
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
    ["#drive-jobs", "Loads"],
    ["#drive-paid", "Paid loads"],
    ["#drive-pay", "My pay"],
    ["#drive-tasks", "Tasks"],
    ["#drive-report", "Inspect"],
    ["#drive-fuel", "Fuel"],
    ["#drive-money", "Advance"],
    ["#drive-docs", "Docs"],
  ],
  cane_manager: [
    ["#cane", "Board"],
    ["#cane-new", "New buy"],
    ["#cane-sell", "Sell"],
    ["#cane-spend", "Advances"],
    ["#cane-pay", "Pay"],
  ],
  passion_manager: [
    ["#passion", "Blocks"],
    ["#field", "Work"],
    ["#passion-sell", "Sell"],
    ["#passion-spend", "Advances"],
    ["#passion-pay", "Pay"],
  ],
};
const PAGES = {
  fleet: [["#trucks", "Trucks"], ["#trucks-jobs", "Loads"], ["#trucks-work", "Tasks"], ["#trucks-inspect", "Inspections"], ["#trucks-paid", "Paid loads"], ["#trucks-trash", "Trash"], ["#trucks-drivers", "Drivers"], ["#trucks-new", "New load"]],
  cane: [["#cane", "Board"], ["#cane-new", "New buy"], ["#cane-sell", "Sell"], ["#cane-spend", "Advances"]],
  passion: [["#passion", "Blocks"], ["#field", "Work"], ["#passion-sell", "Sell"]],
  money: [["#money", "Flow"], ["#money-spend", "Expenses"], ["#money-pay", "Pay"]],
};
function setupNav() {}
const ALLOWED = {
  admin: ["home", "trucks", "trucks-book", "trucks-jobs", "trucks-paid", "trucks-work", "trucks-inspect", "trucks-new", "trucks-trash", "trucks-issues", "trucks-profit", "trucks-drivers", "truck-id", "cane", "cane-new", "cane-id", "cane-sell", "cane-spend", "passion", "field", "passion-sell", "money", "money-fleet", "money-cane", "money-passion", "money-spend", "money-pay", "team", "trucks-spend", "passion-spend", "trucks-docs", "cane-docs", "passion-docs"],
  driver: ["drive", "drive-money", "drive-tasks", "drive-task", "drive-report", "drive-jobs", "drive-paid", "drive-pay", "drive-fuel", "drive-docs"],
  cane_manager: ["cane", "cane-new", "cane-id", "cane-sell", "cane-spend", "cane-docs", "cane-pay"],
  passion_manager: ["passion", "field", "passion-sell", "passion-spend", "passion-docs", "passion-pay"],
};

let DATA = null;
const ROLE = { admin: "Admin", driver: "Driver", cane_manager: "Cane manager", passion_manager: "Passion manager" };

async function boot() {
  // signed in: open from this phone's copy at once; the office sync follows and refreshes the page if anything changed
  await Conacrew.init({ background: !!Conacrew.session() });
  try {
    DATA = Conacrew.bootstrap();
  } catch (err) {
    // Signed in but the page could not load: show the problem instead of bouncing back to sign-in forever.
    if (err.status !== 401 && Conacrew.session()) {
      $("#app").innerHTML = `<div class="card item"><h1>Could not open</h1><p>${String(err.message || err)}</p><p><a href="./index.html" onclick="Conacrew.logout()">Back to sign in</a></p></div>`;
      return;
    }
    Conacrew.logout(); // not signed in after all: clear it so the sign-in page shows the form
    location.replace("./index.html");
    return;
  }
  try { sessionStorage.removeItem("conacrew.bounce"); } catch (e) {}
  $("#who").textContent = DATA.viewingAs ? DATA.viewingAs.by + " → " + DATA.me.name : DATA.me.name;
  $("#role").textContent = DATA.viewingAs ? "Look only" : DATA.me.assistant ? "Admin II" : ROLE[DATA.me.role] || DATA.me.role;
  document.body.classList.toggle("is-driver", DATA.me.role === "driver");
  setupNav();
  $("#out").onclick = () => {
    Conacrew.logout();
    location.href = "./index.html";
  };
  $("#refresh").onclick = () => location.reload();
  if (sessionStorage.getItem("land")) sessionStorage.removeItem("land");
  if (DATA.me.role !== "admin" && !hash().startsWith(defaultHash())) location.hash = defaultHash();
  route();
  if (DATA.me.role === "driver" && !DATA.viewingAs) startLiveWatch(); // never send the admin's location as a truck's
}
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest("a[href^='#']");
  if (!a || !DATA) return;
  const next = a.getAttribute("href").replace("#", "");
  if (location.hash.replace("#", "") === next) route();
});
window.addEventListener("error", (e) => {
  const app = document.getElementById("app");
  if (app && !app.innerHTML.trim()) app.innerHTML = `<div class="card item"><h1>Home</h1><p>${e.message}</p></div>`;
});

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
  if (h.startsWith("drive-task/")) return { name: "drive-task", id: h.slice(11) };
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

const OLD_PAGES = { reports: "trucks-issues", requests: "money-spend", "cane-ask": "cane-spend", "money-pl": "money", "money-pl-q": "money" };
function route() {
  let r = parseRoute();
  if (OLD_PAGES[r.name]) { location.replace("#" + OLD_PAGES[r.name]); return; }
  if (r.name === "team" && DATA.me.assistant) { location.hash = "home"; return; }
  if (DATA.me.role === "driver" && !String(r.name).startsWith("drive")) r = { name: "drive" };
  if (DATA.me.role === "cane_manager" && !String(r.name).startsWith("cane")) r = { name: "cane" };
  if (DATA.me.role === "passion_manager" && r.name !== "passion" && r.name !== "field" && !String(r.name).startsWith("passion")) r = { name: "passion" };
  const jump = $("#navJump");
  if (jump) {
    const hit = (NAV[DATA.me.role] || []).find(([href]) => {
      const key = href.slice(1);
      return key === r.name || (key === "cane" && r.name.startsWith("cane")) || (key === "trucks" && r.name.startsWith("truck")) || (key === "passion" && (r.name === "field" || r.name.startsWith("passion"))) || (key === "money" && r.name.startsWith("money")) || (key === "drive" && r.name.startsWith("drive"));
    });
    if (hit) jump.value = hit[0];
  }
  if (!gate(r.name) && r.name !== "pay") {
    $("#app").innerHTML = `${bizBar()}<div class="card item"><h1>No access</h1></div>`;
    return;
  }
  if (r.name === "pay") { location.hash = "money-pay"; return; }
  const view = {
    home: viewHome,
    trucks: viewTrucks,
    "trucks-jobs": viewTruckJobs,
    "trucks-paid": viewPaidJobs,
    "trucks-work": viewTruckWork,
    "trucks-inspect": viewInspectReport,
    "trucks-new": viewNewJob,
    "trucks-book": viewBookings,
    "trucks-trash": viewJobTrash,
    "trucks-profit": viewTruckProfit,
    "trucks-drivers": viewDrivers,
    "truck-id": () => viewTruck(r.id),
    "trucks-issues": viewReports,
    drive: () => viewDrive("drive"),
    "drive-money": () => viewDrive("drive-money"),
    "drive-tasks": () => viewDrive("drive-tasks"),
    "drive-report": () => viewDrive("drive-report"),
    "drive-jobs": () => viewDrive("drive-jobs"),
    "drive-paid": () => viewDrive("drive-paid"),
    "drive-pay": () => viewDrive("drive-pay"),
    "drive-task": () => viewDrive("drive-task", r.id),
    "drive-fuel": () => viewDrive("drive-fuel"),
    "drive-docs": () => viewDrive("drive-docs"),
    cane: viewCane,
    "cane-new": viewNewCane,
    "cane-id": () => viewCaneId(r.id),
    "cane-sell": viewCaneSell,
    "cane-spend": viewCaneSpend,
    "cane-pay": viewCanePay,
    passion: viewPassion,
    field: viewField,
    "passion-sell": viewPassionSell,
    "passion-pay": viewPassionPay,
    money: () => viewMoney(""),
    "money-fleet": () => viewMoney("trucking"),
    "money-cane": () => viewMoney("sugarcane"),
    "money-passion": () => viewMoney("passion"),
    "money-spend": viewSpend,
    "money-pay": viewPayAdmin,
    "trucks-spend": viewFleetSpend,
    "trucks-docs": () => viewDocs("trucking"),
    "cane-docs": () => viewDocs("sugarcane"),
    "passion-docs": () => viewDocs("passion"),
    "passion-spend": viewPassionSpend,
    team: viewTeam,
  }[r.name];
  const theme = {
    home: "home",
    trucks: "trucks",
    "trucks-jobs": "trucks",
    "trucks-paid": "trucks",
    "trucks-work": "trucks",
    "trucks-inspect": "trucks",
    "trucks-new": "trucks",
    "trucks-book": "trucks",
    "trucks-trash": "trucks",
    "trucks-issues": "trucks",
    "trucks-profit": "trucks",
    "trucks-drivers": "trucks",
    "trucks-spend": "trucks",
    "trucks-docs": "trucks",
    "cane-docs": "cane",
    "passion-docs": "passion",
    "passion-spend": "passion",
    "truck-id": "trucks",
    reports: "money",
    drive: "drive",
    "drive-money": "drive",
    "drive-task": "drive",
    "drive-tasks": "drive",
    "drive-report": "drive",
    "drive-jobs": "drive",
    "drive-paid": "drive",
    "drive-pay": "drive",
    "drive-fuel": "drive",
    "drive-docs": "drive",
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
    team: "home",
  }[r.name] || "home";
  document.body.dataset.page = theme;
  const app = $("#app");
  let html = "<p>Not found</p>";
  try { html = view ? view() : html; }
  catch (err) { html = `<div class="card item"><h1>Page failed</h1><p>${err.message}</p></div>`; }
  app.classList.remove("slide-up", "slide-down");
  app.innerHTML = viewingBanner() + bizBar() + html;
  window.scrollTo(0, 0);
  bind();
  enhanceFields();
  fixPageTitle();
  lockForViewing();
  updateLiveStatus();
  startLiveMap();
}

function bizBar() {
  if (!DATA || DATA.me.role !== "admin") return "";
  const h = location.hash || "#home";
  const req = { trucking: openRequests("trucking").length, sugarcane: openRequests("sugarcane").length, passion: openRequests("passion").length };
  const dot = (n) => n ? ` <span class="attn-dot"></span>` : "";
  const work = (DATA.fleetTasks || []).filter((t) => t.status === "done").length, iss = issuesWaiting(), pay = payWaiting(), phones = DATA.me.assistant ? 0 : phonesWaiting();
  const biz = h.startsWith("#truck") ? "fleet" : h.startsWith("#cane") ? "cane" : h.startsWith("#passion") || h.startsWith("#field") ? "passion" : h.startsWith("#money") ? "money" : "home";
  const subs = {
    fleet: [["#trucks-book", "Bookings", bookingsWaiting().length, "Loads"], ["#trucks-jobs", "Loads", 0, "Loads"], ["#trucks-new", "New load", 0, "Loads"], ["#trucks-paid", "Paid loads", 0, "Loads"],
      ["#trucks", "Trucks", 0, "Trucks"], ["#trucks-profit", "Profit", fuelAlerts().length, "Trucks"], ["#trucks-inspect", "Inspections", 0, "Trucks"], ["#trucks-work", "Tasks", work, "Trucks"], ["#trucks-issues", "Issues", iss, "Trucks"], ["#trucks-drivers", "Drivers", 0, "Trucks"],
      ["#trucks-spend", "Advances", req.trucking, "Money & papers"], ["#trucks-docs", "Docs", docsWaiting("trucking"), "Money & papers"], ["#trucks-trash", "Trash", 0, "Money & papers"]],
    cane: [["#cane", "Board"], ["#cane-new", "New buy"], ["#cane-sell", "Sell"], ["#cane-spend", "Advances", req.sugarcane], ["#cane-docs", "Docs", docsWaiting("sugarcane")]],
    passion: [["#passion", "Blocks"], ["#field", "Work"], ["#passion-sell", "Sell"], ["#passion-spend", "Advances", req.passion], ["#passion-docs", "Docs", docsWaiting("passion")]],
    money: [["#money", "Flow"], ["#money-spend", "Expenses"], ["#money-pay", "Pay", pay]],
  }[biz] || [];
  return `<nav class="admin-nav">
    <div class="biz">
      <a class="${biz === "home" ? "on" : ""}" href="#home">Home${dot(phones)}</a>
      <a class="${biz === "fleet" ? "on" : ""}" href="#trucks">Fleet${dot(req.trucking + bookingsWaiting().length + work + iss + docsWaiting("trucking"))}</a>
      <a class="${biz === "cane" ? "on" : ""}" href="#cane">Cane${dot(req.sugarcane + docsWaiting("sugarcane"))}</a>
      <a class="${biz === "passion" ? "on" : ""}" href="#passion">Passion${dot(req.passion + docsWaiting("passion"))}</a>
      <a class="${biz === "money" ? "on" : ""}" href="#money">Money${dot(pay)}</a>
    </div>
    ${subs.length ? `<div class="sub">${subs.map(([href, label, n, g], i) => `${i && g && g !== subs[i - 1][3] ? `<span class="sub-gap" aria-hidden="true"></span>` : ""}<a class="${h === href ? "on" : ""} ${n ? "attn" : ""}" href="${href}">${label}${n ? ` <span class="attn-n">${n}</span>` : ""}</a>`).join("")}</div>${pagePick(subs, h)}` : ""}
  </nav>`;
}
// Phones: the pages of a section in one drop-down instead of a row of buttons
function pagePick(items, current) {
  const cur = items.find(([href]) => href === current) || items.find(([href]) => current.startsWith(href + "/")) || null;
  const waiting = items.filter(([href, , n]) => n && href !== (cur && cur[0])).reduce((s, [, , n]) => s + Number(n), 0);
  // group name (4th item) only matters for the admin menu
  return `<div class="page-pick">
    <select class="field js-pagepick" aria-label="Page">
      ${cur ? "" : `<option value="" selected>Choose a page</option>`}
      ${(() => { const opt = ([href, label, n]) => `<option value="${href}" ${cur && cur[0] === href ? "selected" : ""}>${esc(label)}${n ? ` (${n})` : ""}</option>`; if (!items.some((x) => x[3])) return items.map(opt).join(""); const gs = [...new Set(items.map((x) => x[3]))]; return gs.map((g) => `<optgroup label="${esc(g)}">${items.filter((x) => x[3] === g).map(opt).join("")}</optgroup>`).join(""); })()}
    </select>
    ${waiting ? `<span class="pick-attn">${waiting} waiting</span>` : ""}
  </div>`;
}
function tabMenu(items, on) {
  if (DATA && DATA.me.role === "admin") return "";
  const home = DATA.me.role === "driver" ? "#drive" : DATA.me.role === "cane_manager" ? "#cane" : DATA.me.role === "passion_manager" ? "#passion" : "";
  const homeLink = home ? `<a class="btn btn-ghost" href="${home}">Home</a>` : "";
  const cur = (items.find(([h]) => on === h.slice(1)) || [])[0] || "#" + on;
  return `<div class="tab-wrap">${homeLink}<div class="page-links">${items.map(([h, l, k, n]) => `<a class="${on === h.slice(1) ? "on" : ""} ${n ? "attn" : ""}" href="${h}">${l}${n ? ` <span class="attn-n">${n}</span>` : ""}</a>`).join("")}</div>${pagePick(items.map(([h, l, k, n]) => [h, l, n]), cur)}</div>`;
}
function fleetTabs(on) {
  const items = [
    ["#trucks", "Trucks", "trucks"],
    ["#trucks-jobs", "Loads", "trucks-jobs"],
    ["#trucks-work", "Tasks", "trucks-work"],
    ["#trucks-inspect", "Inspections", "trucks-inspect"],
    ["#trucks-paid", "Paid loads", "trucks-paid"],
    ["#trucks-trash", "Trash", "trucks-trash"],
    ["#trucks-drivers", "Drivers", "trucks-drivers"],
    ["#trucks-new", "New load", "trucks-new"],
  ];
  return tabMenu(items, on);
}

function truckForm(t) {
  const drivers = DATA.drivers || [];
  const v = t || {};
  return `<form data-form="save-truck" class="truck-form">
    ${t ? `<input type="hidden" name="id" value="${esc(t.id)}" />` : ""}
    <div class="grid g2">
      <label class="lbl">Number plate<input class="field" name="plate" required value="${esc(v.plate || "")}" placeholder="UA 000AA" autocapitalize="characters" /></label>
      <label class="lbl">Model<input class="field" name="model" value="${esc(v.model || "Sinotruk HOWO 8×4")}" /></label>
    </div>
    <div class="grid g2" style="margin-top:10px">
      <label class="lbl">Engine<select class="field" name="hp"><option value="420" ${Number(v.hp) >= 400 ? "selected" : ""}>420 hp</option><option value="370" ${t && Number(v.hp) < 400 ? "selected" : ""}>370 hp</option></select></label>
      <label class="lbl">Driver<select class="field" name="assignedDriverId"><option value="">— No driver —</option>${drivers.map((d) => `<option value="${d.id}" ${d.id === v.assignedDriverId ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>
    </div>
    <div class="grid g2" style="margin-top:10px">
      <label class="lbl">Odometer (km)<input class="field" name="odometerKm" inputmode="numeric" value="${v.odometerKm || ""}" /></label>
      <label class="lbl">Next service at (km)<input class="field" name="nextServiceKm" inputmode="numeric" value="${v.nextServiceKm || ""}" /></label>
    </div>
    <div class="grid g2" style="margin-top:10px">
      <label class="lbl">Insurance expires<input class="field" type="date" name="insuranceExpiry" value="${esc(v.insuranceExpiry || "")}" /></label>
      <label class="lbl">Road licence expires<input class="field" type="date" name="roadLicenceExpiry" value="${esc(v.roadLicenceExpiry || "")}" /></label>
    </div>
    <div class="grid g2" style="margin-top:10px">
      <label class="lbl">Fuel use loaded (L per 100 km)<input class="field" name="loadedL100" inputmode="decimal" value="${v.loadedL100 || ""}" placeholder="${truckRates(v.hp ? v : { hp: 420 }).loaded}" /></label>
      <label class="lbl">Fuel use empty (L per 100 km)<input class="field" name="emptyL100" inputmode="decimal" value="${v.emptyL100 || ""}" placeholder="${truckRates(v.hp ? v : { hp: 420 }).empty}" /></label>
    </div>
    ${t ? `<label class="lbl" style="margin-top:10px">Status<select class="field" name="status">${[["idle", "Ready"], ["workshop", "In the workshop"], ["parked", "Parked"]].map(([k, l]) => `<option value="${k}" ${v.status === k ? "selected" : ""}>${l}</option>`).join("")}${["on_trip", "loading"].includes(v.status) ? `<option value="" selected>On a trip (set by the load)</option>` : ""}</select></label>` : ""}
    <button class="btn btn-primary wide" style="margin-top:12px">${t ? "Save truck" : "Add truck"}</button>
  </form>`;
}
function viewTrucks() {
  const open = (DATA.fleetTasks || []).filter((t) => !["done", "cancelled", "closed"].includes(t.status));
  const issues = (DATA.issues || []).filter((i) => i.status === "open");
  const today = todayYmd(), soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const when = (d) => !d ? "Not set" : `${fmtDay(d)}${d < today ? ` <span class="badge red">Expired</span>` : d <= soon ? ` <span class="badge gold">Due soon</span>` : ""}`;
  const card = (t) => {
    const d = DATA.drivers.find((x) => x.id === t.assignedDriverId);
    const n = open.filter((x) => x.truckId === t.id).length;
    const left = t.nextServiceKm ? t.nextServiceKm - (t.odometerKm || 0) : null;
    const warn = (t.insuranceExpiry && t.insuranceExpiry <= soon) || (t.roadLicenceExpiry && t.roadLicenceExpiry <= soon) || (left !== null && left <= 1000);
    const head = `<span class="lf-id">${esc(t.plate)}</span><span class="lf-mat">${esc(d ? d.name : "No driver")} · ${t.hp || 370} hp</span>${badge(t.status)}${warn ? ` <span class="badge gold">Check</span>` : ""}`;
    const body = facts([
      ["Model", esc(t.model || "Sinotruk HOWO 8×4")],
      ["Odometer", (t.odometerKm || 0).toLocaleString() + " km"],
      ["Next service", t.nextServiceKm ? t.nextServiceKm.toLocaleString() + " km" + (left !== null ? (left < 0 ? ` <span class="badge red">${Math.abs(left).toLocaleString()} km over</span>` : ` · in ${left.toLocaleString()} km`) : "") : "Not set"],
      ["Insurance", when(t.insuranceExpiry)],
      ["Road licence", when(t.roadLicenceExpiry)],
      n ? ["Open tasks", `<a href="#trucks-work">${n}</a>`] : null,
    ]) + `<a class="btn btn-ghost btn-sm" href="#truck/${t.id}" style="margin-top:10px">Service history</a><details class="settings" style="margin-top:10px"><summary>Edit truck</summary>${truckForm(t)}</details>`;
    return foldCard(head, body);
  };
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks")}
    <div class="grid g4" style="margin-top:14px">
      <div class="card kpi steel"><span class="eyebrow">Trucks</span><b>${DATA.trucks.length}</b></div>
      <div class="card kpi gold"><span class="eyebrow">Open tasks</span><b>${open.length}</b></div>
      <div class="card kpi"><span class="eyebrow">Issues</span><b>${issues.length}</b></div>
      <div class="card kpi"><span class="eyebrow">In workshop</span><b>${DATA.trucks.filter((t) => t.status === "workshop").length}</b></div>
    </div>
    <div class="list" style="margin-top:12px">${DATA.trucks.map(card).join("")}</div>
    ${DATA.viewingAs ? "" : `<details class="card team-row" style="margin-top:10px"><summary><div class="avatar">＋</div><div style="flex:1"><b>Add a truck</b></div></summary><div style="margin-top:12px">${truckForm(null)}</div></details>`}
    <div class="row" style="margin-top:18px"><h2 style="margin:0">Live locations</h2><span class="muted" id="liveNote">Loading…</span></div>
    <div id="liveMap" style="height:320px;margin-top:10px;border-radius:16px"></div>
    <div class="list" id="liveList" style="margin-top:10px"></div>`;
}

// ---- truck profit and fuel check ----
const COST_GROUP = { diesel: "Fuel", fuel: "Fuel", parts: "Repairs & tyres", workshop: "Repairs & tyres", tyres: "Repairs & tyres", service: "Repairs & tyres", papers: "Papers & road fees", road: "Papers & road fees", labour: "Trip costs", trip: "Trip costs", employee_pay: "Driver pay" };
const COST_ORDER = ["Fuel", "Repairs & tyres", "Driver pay", "Trip costs", "Papers & road fees", "Other"];
function fleetReport(from, to) {
  const inP = (d) => { d = String(d || "").slice(0, 10); return d >= from && d <= to; };
  const jobs = DATA.jobs || [], trucks = DATA.trucks || [];
  const jobT = Object.fromEntries(jobs.map((j) => [j.id, j.truckId]));
  const drvT = Object.fromEntries((DATA.drivers || []).map((d) => [d.id, d.assignedTruckId]));
  const blank = (t) => ({ t, income: 0, owed: 0, costs: {}, loads: 0, km: 0, litres: 0, expected: 0, fuelKnown: true });
  const rep = Object.fromEntries(trucks.map((t) => [t.id, blank(t)])); rep._none = blank(null);
  const at = (id) => rep[id] || rep._none;
  const cost = (r, cat, amt) => { const g = COST_GROUP[cat] || "Other"; r.costs[g] = (r.costs[g] || 0) + (Number(amt) || 0); };
  (DATA.cash || []).forEach((c) => {
    if ((c.tag || "") !== "trucking" || !inP(c.date)) return;
    const tid = c.truckId || jobT[c.jobId] || drvT[c.driverId] || "";
    if (c.direction === "in") { if (c.category === "load_income") at(tid).income += Number(c.amountUgx) || 0; return; }
    if (["to_driver", "advance_return"].includes(c.category)) return; // advances count when they're spent
    cost(at(tid), c.category, c.amountUgx);
  });
  (DATA.disbursements || []).filter((f) => (f.tag || "trucking") === "trucking").forEach((f) => (f.usages || []).forEach((u) => {
    if (inP(u.date)) cost(at(f.truckId || drvT[f.toDriverId] || ""), u.category, u.amountUgx);
  }));
  (DATA.fuelLogs || []).forEach((l) => {
    if (!inP(l.date)) return;
    const r = at(l.truckId || drvT[l.driverId] || "");
    r.litres += Number(l.litres) || 0;
    if (l.notFromAdvance) cost(r, "diesel", l.amountUgx); // driver's own money, no cash line yet
  });
  jobs.forEach((j) => {
    const done = isPaid(j) || ["delivered", "invoiced"].includes(j.status);
    if (!done || !inP(deliveredOn(j))) return;
    const r = at(j.truckId); const haul = Number(j.kmHaul || j.km) || 0;
    r.loads += 1; r.km += haul * 2 + (Number(j.kmToPickup) || 0);
    if (r.t) r.expected += loadFuelExpected(j, r.t);
    if (!isPaid(j)) r.owed += Math.max(0, (j.incomeUgx || j.rateUgx || 0) - jobReceived(j));
  });
  Object.values(rep).forEach((r) => { r.costTotal = Object.values(r.costs).reduce((s, x) => s + x, 0); r.profit = r.income - r.costTotal; });
  return rep;
}
function fuelVerdict(r) {
  if (!r.expected || !r.litres) return null;
  const pct = Math.round((r.litres / r.expected) * 100);
  return { pct, tone: pct > 130 ? "red" : pct > 115 ? "gold" : "green", word: pct > 130 ? "High" : pct > 115 ? "Watch" : "OK" };
}
// last 30 days, trucks burning clearly more than their loads need (for Home)
function fuelAlerts() {
  if (!DATA || DATA.me.role !== "admin") return [];
  const to = todayYmd(), from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const quiet = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  return Object.values(fleetReport(from, to)).filter((r) => r.t && r.expected >= 150 && !(r.t.fuelCheckedAt && r.t.fuelCheckedAt >= quiet)).map((r) => ({ r, v: fuelVerdict(r) })).filter((x) => x.v && x.v.pct > 130);
}
function viewTruckProfit() {
  const per = sessionStorage.getItem("profitPer") || "month";
  const [from, to, title] = periodRange(per);
  const rep = fleetReport(from, to);
  const rows = Object.values(rep).filter((r) => r.t);
  const none = rep._none;
  const tot = rows.concat([none]).reduce((s, r) => ({ income: s.income + r.income, cost: s.cost + r.costTotal, owed: s.owed + r.owed, km: s.km + r.km, loads: s.loads + r.loads }), { income: 0, cost: 0, owed: 0, km: 0, loads: 0 });
  const profit = tot.income - tot.cost;
  const money = (n) => `<b class="${n < 0 ? "neg" : "pos"}">${n < 0 ? "−" : ""}${ugx(Math.abs(n))}</b>`;
  const perKm = (p, km) => km ? `${p < 0 ? "−" : ""}UGX ${Math.round(Math.abs(p) / km).toLocaleString()} / km` : "—";
  const card = (r) => {
    const d = (DATA.drivers || []).find((x) => x.id === r.t.assignedDriverId);
    const v = fuelVerdict(r);
    const head = `<span class="lf-id">${esc(r.t.plate)}</span><span class="lf-mat">${esc(d ? d.name : "No driver")} · ${r.loads} load${r.loads === 1 ? "" : "s"}</span>${money(r.profit)}${v && v.word !== "OK" ? ` <span class="badge ${v.tone}">Fuel ${v.word.toLowerCase()}</span>` : ""}`;
    const body = facts([
      ["Money in", ugx(r.income)],
      r.owed ? ["Clients still owe", ugx(r.owed)] : null,
      ...COST_ORDER.filter((g) => r.costs[g]).map((g) => [g, "− " + ugx(r.costs[g])]),
      ["Profit", money(r.profit) + (r.income ? ` <span class="muted">· ${r.profit < 0 ? "−" : ""}${Math.abs(Math.round((r.profit / r.income) * 100))}% of income</span>` : "")],
      ["Distance", r.km ? Math.round(r.km).toLocaleString() + " km · " + perKm(r.profit, r.km) : "No loads delivered"],
    ]) + `<div class="fuel-check ${v ? v.tone : ""}">
      <b>Fuel check</b>
      ${v ? `<p>Bought <b>${Math.round(r.litres).toLocaleString()} L</b> · the loads needed about <b>${Math.round(r.expected).toLocaleString()} L</b> · <span class="badge ${v.tone}">${v.pct}% · ${v.word}</span></p>
      ${v.word !== "OK" ? `<p class="muted">More fuel bought than the loads need. Check the fuel receipts, odometer and trips for ${esc(r.t.plate)}.</p>${v.word === "High" ? (r.t.fuelCheckedAt && r.t.fuelCheckedAt >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10) ? `<p class="muted">Checked ${fmtDay(r.t.fuelCheckedAt)}</p>` : `<button type="button" class="btn btn-ghost btn-sm js-fuelok" data-id="${r.t.id}" style="margin-top:8px">I've checked this</button>`) : ""}` : ""}`
      : `<p class="muted">${r.litres ? `Bought ${Math.round(r.litres).toLocaleString()} L, but no delivered loads with distance to compare.` : r.expected ? "No fuel logged for these loads." : "Nothing to compare yet."}</p>`}
      <p class="muted fine">Uses ${truckRates(r.t).loaded} L/100 km loaded and ${truckRates(r.t).empty} L/100 km empty. Change these under Trucks › Edit truck.</p>
    </div>`;
    return foldCard(head, body, v && v.word === "High" && !(r.t.fuelCheckedAt && r.t.fuelCheckedAt >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)) ? "flash" : "");
  };
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-profit")}
    <div class="seg seg-sm" style="margin-top:14px">${[["month", "This month"], ["lastmonth", "Last month"], ["quarter", "Quarter"], ["year", "Year"], ["all", "All"]].map(([k, l]) => `<button type="button" class="seg-btn ${per === k ? "on" : ""}" data-profitper="${k}">${l}</button>`).join("")}</div>
    <div class="card item profit-total" style="margin-top:12px">
      <div class="profit-head"><span class="eyebrow">Fleet profit · ${esc(title)}</span>${money(profit)}</div>
      <div class="grid g3 profit-grid">
        <div><span class="eyebrow">Money in</span><b>${ugx(tot.income)}</b></div>
        <div><span class="eyebrow">Costs</span><b>${ugx(tot.cost)}</b></div>
        <div><span class="eyebrow">Per km</span><b>${perKm(profit, tot.km)}</b></div>
      </div>
      <p class="muted" style="margin:8px 0 0">${tot.loads} load${tot.loads === 1 ? "" : "s"} delivered · ${Math.round(tot.km).toLocaleString()} km${tot.owed ? ` · clients still owe ${ugx(tot.owed)}` : ""}</p>
    </div>
    <div class="list" style="margin-top:12px">${rows.map(card).join("")}</div>
    ${none.income || none.costTotal ? `<div class="card item" style="margin-top:10px"><b>Not linked to a truck</b>${facts([["Money in", ugx(none.income)], ...COST_ORDER.filter((g) => none.costs[g]).map((g) => [g, "− " + ugx(none.costs[g])])])}<p class="muted" style="margin:6px 0 0">Pick a truck when you record spending so it lands on the right truck.</p></div>` : ""}
    <p class="muted" style="margin-top:12px;font-size:12px">Money in is what clients paid in this period. Costs are what was spent: office spending, money spent from advances, and driver pay. Advances not yet spent aren't counted.</p>`;
}

function viewDrivers() {
  const today = todayYmd();
  const card = (d) => {
    const t = DATA.trucks.find((x) => x.id === d.assignedTruckId);
    const head = `<span class="lf-id">${esc(d.name)}</span><span class="lf-mat">${esc(t ? t.plate : "No truck")}</span>${d.licenceExpiry && d.licenceExpiry < today ? `<span class="badge red">Licence expired</span>` : ""}`;
    const body = `${facts([["Phone", d.phone ? `<a href="tel:${esc(d.phone)}">${esc(d.phone)}</a>` : "—"], ["Licence", esc(d.licenseId || "—") + (d.licenceExpiry ? " · expires " + fmtDay(d.licenceExpiry) : "")], ["Truck", esc(t ? t.plate : "None")]])}
      ${d.licensePhoto ? `<img src="${d.licensePhoto}" alt="Licence" class="lic-img" />` : ""}
      <details class="settings" style="margin-top:10px"><summary>Edit driver</summary>
      <form data-form="save-driver" style="margin-top:10px">
        <input type="hidden" name="id" value="${esc(d.id)}" />
        <div class="grid g2">
          <label class="lbl">Name<input class="field" name="name" required value="${esc(d.name)}" /></label>
          <label class="lbl">Phone<input class="field" name="phone" inputmode="tel" value="${esc(d.phone || "")}" /></label>
        </div>
        <div class="grid g2" style="margin-top:10px">
          <label class="lbl">Driving licence number<input class="field" name="licenseId" value="${esc(d.licenseId || "")}" /></label>
          <label class="lbl">Licence expires<input class="field" type="date" name="licenceExpiry" value="${esc(d.licenceExpiry || "")}" /></label>
        </div>
        <div class="grid g2" style="margin-top:10px">
          <label class="lbl">Truck<select class="field" name="assignedTruckId"><option value="">— No truck —</option>${DATA.trucks.map((x) => `<option value="${x.id}" ${x.id === d.assignedTruckId ? "selected" : ""}>${esc(x.plate)}</option>`).join("")}</select></label>
          <label class="lbl">Licence photo<input class="field" name="licensePhoto" type="file" accept="image/*" capture="environment" /></label>
        </div>
        <button class="btn btn-primary wide" style="margin-top:12px">Save driver</button>
      </form></details>`;
    return foldCard(head, body);
  };
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-drivers")}
    <div class="list" style="margin-top:14px">${(DATA.drivers || []).map(card).join("") || `<div class="card item muted">No drivers yet.</div>`}</div>
    <p class="muted" style="margin-top:10px">New drivers are added on <a href="#team">Team</a>, so they get a login and PIN.</p>`;
}
function foldCard(head, body, cls) {
  return `<div class="card load-fold js-fold ${cls || ""}">
    <button type="button" class="lf-head js-fold-btn" aria-expanded="false">${head}<span class="lf-chev" aria-hidden="true">›</span></button>
    <div class="lf-body" hidden>${body}</div>
  </div>`;
}
function facts(rows) { return `<dl class="bk-facts">${rows.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`; }
function jobCard(j, paidView) {
  const c = DATA.contractors.find((x) => x.id === j.contractorId);
  const t = DATA.trucks.find((x) => x.id === j.truckId);
  const d = DATA.drivers.find((x) => x.id === j.driverId);
  const bk = j.bookingId && (DATA.bookings || []).find((x) => x.id === j.bookingId);
  const due = bk && bk.payment && bk.payment.balance && !bk.payment.balancePaidAt;
  const got = jobReceived(j), price = j.incomeUgx || j.rateUgx || 0;
  const map = j.pickupPin && j.dropPin ? `https://www.google.com/maps/dir/?api=1&origin=${j.pickupPin.lat},${j.pickupPin.lng}&destination=${j.dropPin.lat},${j.dropPin.lng}&travelmode=driving` : "";
  const head = `<span class="lf-id">${esc(j.code || "Load")}</span><span class="lf-mat">${esc(j.cargo || "")}${c ? ` · ${esc(c.name)}` : ""}</span>${paidView ? `<b class="amt">${ugx(j.paidUgx || price)}</b>` : `<span class="badge ${tripTone(j)}">${esc(paidView ? "Paid" : TRIP_NAME[j.status] || label(j.status))}</span>`}`;
  const body = `
    <div class="lf-src">${sourceChip(j)}</div>
    ${facts([
      ["Route", esc((j.origin || "") + " → " + (j.destination || "")) + (map ? ` · <a href="${map}" target="_blank" rel="noopener">Map</a>` : "")],
      j.pickupAt ? ["Pickup", esc(String(j.pickupAt).replace("T", " "))] : null,
      j.dropAt ? ["Drop-off", esc(String(j.dropAt).replace("T", " "))] : null,
      ["Truck", esc((t ? t.plate : "—") + (d ? " · " + d.name : ""))],
      ["Distance", (j.km || 0) + " km" + (j.fuelLitres ? ` · ${j.fuelLitres} L · ${ugx(j.fuelCostUgx || 0)}` : "")],
      j.tonnesDelivered ? ["Tonnes", j.tonnesDelivered + " t"] : null,
      ["Price", ugx(price)],
      got ? ["Received", ugx(got) + (paidView && j.paidAt ? " · " + fmtDay(j.paidAt) : "") + (j.paidMethod ? " · " + esc(METHOD_LABEL[j.paidMethod] || j.paidMethod) : "")] : null,
      ...(bk ? clientSeenRows(bk) : []),
      !paidView && tripTime(j, j.status) ? ["Trip", esc(TRIP_NAME[j.status] || label(j.status)) + " · " + tripTime(j, j.status) + ((j.steps || {})[j.status] && j.steps[j.status].office ? " · office" : "")] : null,
    ])}
    ${j.scaleTicket || j.invoice ? `<div class="thumbs">${j.scaleTicket ? `<img src="${j.scaleTicket}" alt="Scale ticket" />` : ""}${j.invoice ? `<img src="${j.invoice}" alt="Invoice" />` : ""}</div>` : ""}
    ${paidView ? "" : `<div class="lf-trip">${tripControls(j)}</div>`}
    ${bk && !paidView ? `<div class="bk-actions"><a class="btn btn-whatsapp btn-sm" href="${bookingWhatsApp(bk)}" target="_blank" rel="noopener">WhatsApp client</a>${due ? `<button type="button" class="btn btn-primary btn-sm js-bkpay flash" data-id="${esc(bk.id)}" data-kind="balance">Balance ${ugx(bk.payment.balance)} received</button>` : ""}</div>` : ""}
    ${paidView ? "" : `<div class="lf-actions"><button type="button" class="btn btn-primary js-paid" data-id="${j.id}">Client paid</button><button type="button" class="btn btn-ghost" data-act="trash_job" data-id="${j.id}">Trash</button></div>`}`;
  return foldCard(head, body, due ? "flash" : "");
}
function tripTone(j) { return { booked: "gold", to_pickup: "blue", loading: "blue", en_route: "blue", delivered: "green", invoiced: "green" }[j.status] || "blue"; }
function viewTruckJobs() {
  const src = sessionStorage.getItem("jobSrc") || "";
  const all = (DATA.jobs || []).filter((j) => !isPaid(j));
  const open = all.filter((j) => !src || jobSource(j).kind === src);
  const cnt = (k) => all.filter((j) => jobSource(j).kind === k).length;
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-jobs")}
    <div class="seg src-seg" style="margin-top:14px">
      ${[["", "All", all.length], ["client", "Client loads", cnt("client")], ["office", "Office", cnt("office")], ["driver", "Driver", cnt("driver")]].map(([k, t, n]) => `<button type="button" class="seg-btn ${src === k ? "on" : ""}" data-jobsrc="${k}">${t}${n ? ` <span class="count">${n}</span>` : ""}</button>`).join("")}
    </div>
    <div class="list" style="margin-top:12px">${open.length ? open.map((j) => jobCard(j)).join("") : `<div class="card item muted">No open loads.</div>`}</div>`;
}

function viewPaidJobs() {
  const paid = (DATA.jobs || []).filter(isPaid);
  const total = paid.reduce((s, j) => s + (j.paidUgx || j.rateUgx || 0), 0);
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-paid")}
    <div class="grid g2" style="margin-top:14px"><div class="card kpi"><span class="eyebrow">Paid loads</span><b>${paid.length}</b></div><div class="card kpi steel"><span class="eyebrow">Received</span><b>${ugx(total)}</b></div></div>
    <div class="list" style="margin-top:12px">${paid.length ? paid.map((j) => jobCard(j, true)).join("") : `<div class="card item muted">No paid loads yet.</div>`}</div>`;
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
          ${r.note ? `<p class="muted" style="margin-top:8px">${r.note}</p>` : ""}${r.voice ? `<audio class="voice-play" controls src="${r.voice}" style="width:100%;margin-top:8px"></audio>` : ""}
        </div>`;
      }).join("") : `<div class="card item">None</div>`}
    </div>`;
}

// ───────────── Fleet tasks: clear instructions → focused check → photo + voice reply → review ─────────────
const TASK_KINDS = [["inspect", "Inspect / check parts"], ["repair", "Repair"], ["service", "Service"], ["tyres", "Tyres"], ["fuel", "Fuel"], ["wash", "Wash"], ["papers", "Papers / licence"], ["other", "Other"]];
const RESULT = { pass: ["green", "OK"], warn: ["gold", "Needs attention"], fail: ["red", "Not OK"] };
function partName(id) {
  for (const [, parts] of INSPECT) for (const [pid, n] of parts) if (pid === id) return n;
  return id;
}
function taskTitle(t) {
  if (t.title) return t.title;
  const k = (TASK_KINDS.find(([v]) => v === t.kind) || [, "Task"])[1];
  return t.part ? k + ": " + partName(t.part) : k;
}
function taskParts(t) { return (t.parts && t.parts.length) ? t.parts : t.part ? [t.part] : []; }
function taskStatus(t) {
  if (t.status === "closed") return ["green", "Accepted"];
  if (t.status === "done") return ["blue", "Replied · check it"];
  if (t.status === "seen") return ["gold", "Seen by driver"];
  if (t.sentBack) return ["red", "Sent back"];
  return ["gold", "Sent"];
}
function fmtSec(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

// ---- voice note recorder (max 3 minutes, small file, plays on iPhone and Android) ----
function voiceBox(label) {
  return `<div class="voice-box js-voice">
    <input type="hidden" name="voice" value="" /><input type="hidden" name="voiceSec" value="0" />
    <p class="lbl" style="margin:0">${label || "Voice note (max 3 min)"}</p>
    <div class="voice-row">
      <button type="button" class="btn btn-rec js-rec">● Record</button>
      <button type="button" class="btn btn-ghost js-stop" disabled>■ Stop</button>
      <span class="voice-time js-time">0:00 / 3:00</span>
    </div>
    <div class="voice-bar"><span class="js-bar"></span></div>
    <audio class="js-play voice-play" controls style="width:100%;margin-top:8px;display:none"></audio>
    <button type="button" class="linkbtn js-redo" style="display:none">Record again</button>
  </div>`;
}
function bindVoice(root) {
  (root || document).querySelectorAll(".js-voice").forEach((box) => {
    if (box.dataset.bound) return; box.dataset.bound = "1";
    const recB = box.querySelector(".js-rec"), stopB = box.querySelector(".js-stop"), time = box.querySelector(".js-time"), bar = box.querySelector(".js-bar");
    const play = box.querySelector(".js-play"), redo = box.querySelector(".js-redo"), out = box.querySelector("[name=voice]"), outSec = box.querySelector("[name=voiceSec]");
    const CAP = 180;
    let rec = null, chunks = [], sec = 0, tick = null;
    const show = () => { time.textContent = fmtSec(sec) + " / 3:00"; bar.style.width = Math.min(100, sec / CAP * 100) + "%"; };
    const pickType = () => { if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return ""; return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t)) || ""; };
    recB.onclick = async () => {
      if (!navigator.mediaDevices || !window.MediaRecorder) { alert("This phone's browser can't record audio. Add a written note instead."); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const type = pickType();
        chunks = [];
        rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 24000 });
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || type || "audio/webm" });
          const r = new FileReader();
          r.onload = () => { out.value = r.result; outSec.value = sec; play.src = r.result; play.style.display = "block"; redo.style.display = ""; recB.style.display = "none"; stopB.style.display = "none"; };
          r.readAsDataURL(blob);
        };
        rec.start(1000);
        sec = 0; show();
        recB.disabled = true; stopB.disabled = false; box.classList.add("on"); recB.textContent = "● Recording";
        tick = setInterval(() => { sec += 1; show(); if (sec >= CAP) stopB.click(); }, 1000);
      } catch (e) { alert("Microphone not allowed. Allow the microphone for this site, or add a written note."); }
    };
    stopB.onclick = () => { if (tick) clearInterval(tick); tick = null; if (rec && rec.state !== "inactive") rec.stop(); recB.disabled = false; stopB.disabled = true; box.classList.remove("on"); recB.textContent = "● Record"; };
    redo.onclick = () => { out.value = ""; outSec.value = 0; play.removeAttribute("src"); play.style.display = "none"; redo.style.display = "none"; recB.style.display = ""; stopB.style.display = ""; sec = 0; show(); };
  });
}
function partPicker() {
  // pick an area first, then tick its parts; ticks are kept when switching areas
  return `<label class="lbl" style="margin-top:6px">Area<select class="field" id="partArea">${INSPECT.map(([g], i) => `<option value="${i}">${g}</option>`).join("")}</select></label>
    ${INSPECT.map(([g, parts], i) => `<div class="part-group js-area" data-area="${i}" ${i ? 'style="display:none"' : ""}><div class="part-chips">${parts.map(([id, n]) => `<label class="pchip"><input type="checkbox" name="parts" value="${id}" data-name="${esc(n)}" /> ${n}</label>`).join("")}</div></div>`).join("")}
    <p class="muted js-picked" style="margin-top:8px"></p>`;
}
function replyView(t, reply) {
  const r = reply || t.reply;
  if (!r) return "";
  const parts = taskParts(t);
  return `<div class="reply-box">
    <p class="eyebrow">Driver's reply · ${whenShort(r.at)}${r.odometerKm ? " · " + Number(r.odometerKm).toLocaleString() + " km" : ""}</p>
    ${parts.map((p) => { const res = RESULT[(r.items || {})[p]] || ["blue", "—"]; return `<div class="reply-part"><div><b>${esc((t.partNames || {})[p] || partName(p))}</b> <span class="badge ${res[0]}">${res[1]}</span></div>${(r.photos || {})[p] ? `<img class="reply-photo js-zoom" src="${r.photos[p]}" alt="Photo of ${esc(partName(p))}" />` : `<span class="muted">No photo</span>`}</div>`; }).join("")}
    ${!parts.length && (r.photos || {}).work ? `<img class="reply-photo js-zoom" src="${r.photos.work}" alt="Photo of the work" />` : ""}
    ${r.voice ? `<div style="margin-top:8px"><p class="muted">Voice note · ${fmtSec(r.voiceSec)}</p><audio class="voice-play" controls preload="metadata" src="${r.voice}" style="width:100%"></audio></div>` : ""}
    ${r.note ? `<p style="margin-top:8px">“${esc(r.note)}”</p>` : ""}
    ${t.mediaRemoved || (r && r.mediaRemoved) ? `<p class="muted">Old photos/voice removed to save phone space.</p>` : ""}
  </div>`;
}
// Admin: Fleet › Work
function viewTruckWork() {
  const tasks = DATA.fleetTasks || [];
  const review = tasks.filter((t) => t.status === "done");
  const open = tasks.filter((t) => t.status === "open" || t.status === "seen");
  const closed = tasks.filter((t) => t.status === "closed" || t.status === "cancelled").slice(0, 12);
  const trucks = DATA.trucks || [];
  const dname = (id) => ((DATA.drivers || []).find((d) => d.id === id) || {}).name || "No driver";
  const card = (t, withReview) => {
    const truck = trucks.find((x) => x.id === t.truckId);
    const [tone, st] = taskStatus(t);
    const parts = taskParts(t);
    return `<details class="card task-card ${t.status === "done" ? "flash" : ""}" ${withReview ? "open" : ""}>
      <summary>
        <div style="min-width:0"><b>${esc(taskTitle(t))}</b>${t.priority === "urgent" ? ` <span class="badge red">Urgent</span>` : ""}
          <div class="muted">${esc(truck ? truck.plate : "")} · ${esc(dname(t.driverId))} · sent ${fmtDay(t.createdAt)}${t.dueDate ? " · due " + fmtDay(t.dueDate) : ""}</div></div>
        <span class="badge ${tone}">${st}</span>
      </summary>
      <div class="task-body">
        ${t.instructions || t.note ? `<p class="instr">${esc(t.instructions || t.note)}</p>` : ""}
        ${parts.length ? `<p class="muted">Parts: ${parts.map((p) => esc((t.partNames || {})[p] || partName(p))).join(", ")}</p>` : ""}
        <p class="muted">Reply needs: ${[t.needPhoto ? "photo" : "", t.needVoice ? "voice note" : ""].filter(Boolean).join(" + ") || "nothing required"}</p>
        ${t.sentBack && t.status !== "closed" ? `<p class="muted">Last sent back: “${esc(t.sentBack)}”</p>` : ""}
        ${replyView(t)}
        ${withReview ? `<div class="review-row">
          <button type="button" class="btn btn-primary" data-act="review_fleet_task" data-id="${esc(t.id)}" data-status="accept">✓ Accept</button>
          <details class="settings" style="flex:1"><summary>Send back</summary>
            <form data-form="task-back" data-id="${esc(t.id)}" style="margin-top:8px"><input class="field" name="reason" required placeholder="What still needs doing?" /><button class="btn btn-ghost wide" style="margin-top:8px">Send back to driver</button></form>
          </details>
        </div>` : ""}
        ${(t.history || []).filter((h) => h.what === "sent back").map((h) => `<details class="settings" style="margin-top:8px"><summary>Earlier reply (sent back ${whenShort(h.at)}: ${esc(h.reason)})</summary>${replyView(t, h.reply)}</details>`).join("")}
      </div>
    </details>`;
  };
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-work")}
    <h2 style="margin:6px 0 0">Send a task to a driver</h2>
    <form class="card item" data-form="fleet-task" style="margin-top:10px">
      <div class="grid g2">
        <label class="lbl">Truck<select class="field" name="truckId" required>${trucks.map((t) => `<option value="${esc(t.id)}">${esc(t.plate)} · ${esc(dname(t.assignedDriverId))}</option>`).join("")}</select></label>
        <label class="lbl">What to do<select class="field" name="kind" id="taskKind">${TASK_KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
      </div>
      <div id="taskParts" style="margin-top:12px"><p class="lbl" style="margin:0">Parts to check</p>${partPicker()}</div>
      <label class="lbl" style="margin-top:12px">Instructions for the driver<textarea class="field" name="instructions" rows="3" placeholder="e.g. Check rear brake lines"></textarea></label>
      <div class="grid g2" style="margin-top:10px">
        <label class="lbl">Priority<select class="field" name="priority"><option value="normal">Normal</option><option value="urgent">Urgent</option></select></label>
        <label class="lbl">Due (optional)<input class="field" name="dueDate" type="date" /></label>
      </div>
      <p class="lbl" style="margin:12px 0 4px">Driver must reply with</p>
      <label class="check" style="margin-top:0"><input type="checkbox" name="needPhoto" value="1" checked /> A photo ${"(one for each part)"}</label>
      <label class="check"><input type="checkbox" name="needVoice" value="1" /> A voice note</label>
      <button class="btn btn-primary wide" style="margin-top:12px">Send to driver</button>
    </form>
    <h2 style="margin:22px 0 0">Waiting for your check ${review.length ? `<span class="attn-n big">${review.length}</span>` : ""}</h2>
    <div class="list" style="margin-top:10px">${review.length ? review.map((t) => card(t, true)).join("") : `<div class="card item muted">No replies waiting.</div>`}</div>
    <h2 style="margin:22px 0 0">With drivers</h2>
    <div class="list" style="margin-top:10px">${open.length ? open.map((t) => card(t, false)).join("") : `<div class="card item muted">No open tasks.</div>`}</div>
    ${closed.length ? `<details class="settings" style="margin-top:14px"><summary>Accepted tasks (${closed.length})</summary><div class="list" style="margin-top:10px">${closed.map((t) => card(t, false)).join("")}</div></details>` : ""}`;
}
// Driver: Tasks list
function driverTasksView() {
  const myId = DATA.me.driverId;
  const all = (DATA.fleetTasks || []).filter((t) => t.driverId === myId);
  const todo = all.filter((t) => t.status === "open" || t.status === "seen");
  const sent = all.filter((t) => t.status === "done");
  const done = all.filter((t) => t.status === "closed").slice(0, 6);
  const tcard = (t, action) => {
    const parts = taskParts(t);
    return `<div class="card task-card driver ${t.priority === "urgent" ? "urgent" : ""} ${action && t.status === "open" ? "flash" : ""}">
      <div class="row"><div style="min-width:0">
        ${t.priority === "urgent" ? `<span class="badge red">Urgent</span> ` : ""}${t.sentBack && action ? `<span class="badge red">Sent back</span>` : ""}
        <h2 class="task-title">${esc(taskTitle(t))}</h2>
        <p class="muted">${DATA.truck ? esc(DATA.truck.plate) + " · " : ""}from ${esc(t.createdBy || "office")} · ${fmtDay(t.createdAt)}${t.dueDate ? " · <b>due " + fmtDay(t.dueDate) + "</b>" : ""}</p>
      </div></div>
      ${t.sentBack && action ? `<p class="instr back">Office says: ${esc(t.sentBack)}</p>` : ""}
      ${t.instructions || t.note ? `<p class="instr">${esc(t.instructions || t.note)}</p>` : ""}
      ${parts.length ? `<ul class="todo-parts">${parts.map((p) => `<li>${esc((t.partNames || {})[p] || partName(p))}</li>`).join("")}</ul>` : ""}
      <p class="muted">Send back: ${[t.needPhoto ? "📷 photo" + (parts.length > 1 ? "s" : "") : "", t.needVoice ? "🎙 voice note" : ""].filter(Boolean).join(" + ") || "a short note"}</p>
      ${action ? `<a class="btn btn-primary wide" style="margin-top:10px;text-align:center" href="#drive-task/${esc(t.id)}">${parts.length ? "Start check" : "Reply"}</a>` : ""}
      ${!action && t.status === "done" ? `<p class="muted" style="margin-top:8px">Sent ${whenShort(t.reply && t.reply.at)} · waiting for the office to check</p>` : ""}
      ${!action && t.status === "closed" ? `<p class="muted" style="margin-top:8px">✓ Accepted by the office</p>` : ""}
    </div>`;
  };
  return `
    <h1>Tasks</h1>
    <h2 style="margin:12px 0 0">To do ${todo.length ? `<span class="attn-n big">${todo.length}</span>` : ""}</h2>
    <div class="list" style="margin-top:8px">${todo.length ? todo.map((t) => tcard(t, true)).join("") : `<div class="card item muted">Nothing to do right now.</div>`}</div>
    ${sent.length ? `<h2 style="margin:18px 0 0">Sent to the office</h2><div class="list" style="margin-top:8px">${sent.map((t) => tcard(t, false)).join("")}</div>` : ""}
    ${done.length ? `<details class="settings" style="margin-top:14px"><summary>Accepted (${done.length})</summary><div class="list" style="margin-top:8px">${done.map((t) => tcard(t, false)).join("")}</div></details>` : ""}`;
}
// Driver: the focused check for one task
function driverTaskReply(id) {
  const t = (DATA.fleetTasks || []).find((x) => x.id === id && x.driverId === DATA.me.driverId);
  if (!t) return `<h1>Task</h1><div class="card item">This task isn't available. <a href="#drive-tasks">Back to tasks</a></div>`;
  if (t.status === "done" || t.status === "closed") return `<h1>${esc(taskTitle(t))}</h1><div class="card item">Already sent to the office. <a href="#drive-tasks">Back to tasks</a></div>${replyView(t)}`;
  const parts = taskParts(t);
  return `
    <a class="linkbtn" href="#drive-tasks" style="padding:0">← Tasks</a>
    <h1 style="margin-top:6px">${esc(taskTitle(t))}</h1>
    ${t.sentBack ? `<p class="instr back">Office says: ${esc(t.sentBack)}</p>` : ""}
    ${t.instructions || t.note ? `<p class="instr">${esc(t.instructions || t.note)}</p>` : ""}
    <form class="card item" data-form="task-reply" data-id="${esc(t.id)}" data-needphoto="${t.needPhoto ? 1 : 0}" style="margin-top:12px">
      <p class="eyebrow">${DATA.truck ? esc(DATA.truck.plate) : "Truck"} · ${parts.length ? "check " + (parts.length === 1 ? "this part" : "these " + parts.length + " parts") + " only" : "show the work"}</p>
      ${parts.map((p) => `<div class="inspect-part task-part" data-part="${esc(p)}">
        <b class="tp-name">${esc((t.partNames || {})[p] || partName(p))}</b>
        <div class="tp-marks">
          <label class="mark pass"><input type="radio" name="r_${esc(p)}" value="pass" hidden />OK</label>
          <label class="mark warn"><input type="radio" name="r_${esc(p)}" value="warn" hidden />NEEDS ATTENTION</label>
          <label class="mark fail"><input type="radio" name="r_${esc(p)}" value="fail" hidden />NOT OK</label>
        </div>
        <div class="js-if-bad" hidden><label class="lbl" style="margin-top:8px">📷 Photo${t.needPhoto ? "" : " (optional)"}<input class="field js-part-photo" type="file" accept="image/*" capture="environment" data-part="${esc(p)}" /></label>
        <div class="thumbs js-part-prev"></div></div>
      </div>`).join("")}
      ${!parts.length ? `<label class="lbl">📷 Photo of the work${t.needPhoto ? "" : " (optional)"}<input class="field js-part-photo" type="file" accept="image/*" capture="environment" data-part="work" /></label><div class="thumbs js-part-prev"></div>` : ""}
      ${parts.length ? `<label class="lbl" style="margin-top:12px">Odometer (optional)<input class="field" name="odometerKm" inputmode="numeric" value="${DATA.truck ? DATA.truck.odometerKm || "" : ""}" /></label>` : ""}
      <div style="margin-top:12px" class="${parts.length ? "js-voice-if-bad" : ""}" ${parts.length ? "hidden" : ""}>${voiceBox(t.needVoice ? "🎙 Voice note (required, up to 3 minutes)" : "🎙 Voice note (optional, up to 3 minutes)")}</div>
      <label class="lbl" style="margin-top:12px">Written note (optional)<input class="field" name="driverNote" placeholder="e.g. Rear left brake line was leaking, tightened it" /></label>
      <button class="btn btn-primary wide" style="margin-top:14px">Send to office</button>
    </form>`;
}
// photos and the voice note are only asked for when something needs attention or is not OK
function inspCount(form) {
  const el = form && form.querySelector(".js-insp-count"); if (!el) return;
  const all = form.querySelectorAll(".inspect-part").length, done = [...form.querySelectorAll(".inspect-part")].filter((b) => b.querySelector("input[type=radio]:checked")).length;
  el.textContent = done + " of " + all + " checked"; el.classList.toggle("ok-t", done === all);
}
function showVoiceIfBad(form) {
  const v = form && form.querySelector(".js-voice-if-bad");
  if (!v) return;
  v.hidden = ![...form.querySelectorAll("input[type=radio]:checked")].some((i) => i.value !== "pass");
}
function bindTasks() {
  const kind = document.getElementById("taskKind"), parts = document.getElementById("taskParts");
  if (kind && parts) {
    const area = parts.querySelector("#partArea"), picked = parts.querySelector(".js-picked");
    const showPicked = () => { const n = [...parts.querySelectorAll("input[name=parts]:checked")].map((i) => i.dataset.name); picked.innerHTML = n.length ? "Selected: <b>" + n.map(esc).join(", ") + "</b>" : ""; };
    const showArea = () => { parts.querySelectorAll(".js-area").forEach((g) => { g.style.display = g.dataset.area === area.value ? "" : "none"; }); };
    area.onchange = showArea; showArea();
    parts.querySelectorAll("input[name=parts]").forEach((i) => { i.onchange = showPicked; });
    const sync = () => { parts.style.display = ["inspect", "repair", "service", "tyres"].includes(kind.value) ? "" : "none"; if (parts.style.display === "none") { parts.querySelectorAll("input").forEach((i) => { i.checked = false; }); showPicked(); } if (kind.value === "tyres") { area.value = String(INSPECT.findIndex(([g]) => g === "Tyres")); showArea(); } };
    kind.onchange = sync; sync();
  }
  document.querySelectorAll("form[data-form=task-reply] .mark").forEach((lab) => {
    lab.onclick = () => {
      const box = lab.closest(".task-part"); box.querySelectorAll(".mark").forEach((c) => c.classList.remove("on")); lab.classList.add("on"); lab.querySelector("input").checked = true;
      const bad = lab.querySelector("input").value !== "pass";
      const extra = box.querySelector(".js-if-bad"); if (extra) extra.hidden = !bad;
      showVoiceIfBad(lab.closest("form"));
    };
  });
  document.querySelectorAll(".js-part-photo").forEach((inp) => {
    inp.onchange = async () => {
      const prev = (inp.closest(".task-part") || inp.closest("form")).querySelector(".js-part-prev");
      if (!inp.files[0] || !prev) return;
      const src = await compressPhoto(inp.files[0]);
      inp.dataset.src = src || "";
      prev.innerHTML = src ? `<img src="${src}" alt="" />` : "";
    };
  });
  document.querySelectorAll(".js-zoom").forEach((img) => { img.onclick = () => img.classList.toggle("big"); });
  bindVoice(document);
  // opening a task tells the office the driver has seen it
  const rf = document.querySelector("form[data-form=task-reply]");
  if (rf && !DATA.viewingAs) {
    const t = (DATA.fleetTasks || []).find((x) => x.id === rf.dataset.id);
    if (t && t.status === "open") { try { DATA = Conacrew.act("ack_fleet_task", { id: t.id }); } catch (e) {} }
  }
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
  const bks = (DATA.bookings || []).filter((b) => b.trashed);
  const row = (title, sub, when, btns) => `<div class="card trash-row"><div style="min-width:0"><b>${title}</b><div class="muted">${sub}</div><div class="muted">Removed ${when}</div></div><div class="trash-btns">${btns}</div></div>`;
  return `
    <div class="row"><h1>Fleet</h1></div>
    ${fleetTabs("trucks-trash")}
    <h2 style="margin:14px 0 0">Loads</h2>
    <div class="list" style="margin-top:8px">${trash.length ? trash.map((j) => row(esc((j.code || "") + " · " + (j.cargo || "")), esc((j.origin || "") + " → " + (j.destination || "")), esc((j.deletedAt || "") + (j.deletedBy ? " by " + j.deletedBy : "")), `<button class="btn btn-ghost btn-sm" data-act="restore_job" data-id="${j.id}">Restore</button><button class="btn btn-danger btn-sm" data-act="purge_job" data-id="${j.id}">Delete</button>`)).join("") : `<div class="card item muted">No loads in the trash.</div>`}</div>
    ${bks.length ? `<h2 style="margin:18px 0 0">Closed bookings</h2>
    <div class="list" style="margin-top:8px">${bks.map((b) => row(esc(b.ref + " · " + (b.cargo || "")), esc(((b.client || {}).company || (b.client || {}).name || "") + " · " + (BK_STATUS[b.status] ? BK_STATUS[b.status][1] : b.status)), esc((b.trashed.at || "") + (b.trashed.by ? " by " + b.trashed.by : "")), `<button class="btn btn-ghost btn-sm" data-act="restore_booking" data-id="${esc(b.id)}">Restore</button><button class="btn btn-danger btn-sm" data-act="purge_booking" data-id="${esc(b.id)}">Delete</button>`)).join("")}</div>` : ""}`;
}

// A load from a client booking: everything the client gave stays as it is; the office picks driver, truck and fuel
function viewLoadFromBooking(bk) {
  const c = bk.client || {};
  const price = bk.payment && bk.payment.total ? bk.payment.total : bk.quote ? bk.quote.amountUgx : 0;
  const p = bk.payment || {};
  const paid = p.status === "received" ? p.due : 0;
  const trips = Math.max(1, Number(bk.trips) || 1);
  const diesel = DATA.dieselDefaultUgx || 5200;
  const t0 = (DATA.trucks || [])[0];
  const est = estimateTripFuel(bk.km || 0, bk.km || 0, t0 || 370, diesel); // loaded there, empty back; refreshed for the truck picked
  const litres = Math.round(est.litres * trips * 10) / 10, fuel = Math.round(est.fuelUgx * trips);
  const at = bk.date ? bk.date + "T" + ({ Morning: "08:00", Afternoon: "13:00", Evening: "17:00" }[bk.time] || "08:00") : "";
  const free = (DATA.trucks || []).map((t) => { const d = (DATA.drivers || []).find((x) => x.id === t.assignedDriverId); return { t, d }; });
  const gmap = `https://www.google.com/maps/dir/?api=1&origin=${bk.pickup.lat},${bk.pickup.lng}&destination=${bk.drop.lat},${bk.drop.lng}&travelmode=driving`;
  return `
    <h1>New load</h1>
    ${fleetTabs("trucks-new")}
    <form class="card item" data-form="job" style="margin-top:16px;max-width:560px">
      <input type="hidden" name="bookingId" value="${esc(bk.id)}" />
      <div class="row keep" style="align-items:center"><div><b>Booking ${esc(bk.ref)}</b><div class="muted">From the client, can't be changed here</div></div><button type="button" class="btn btn-ghost btn-sm" id="dropBooking">Cancel</button></div>
      <dl class="bk-facts">
        <dt>Client</dt><dd>${esc(c.company || c.name)}${c.company ? `<div class="muted">${esc(c.name)}</div>` : ""}<div class="muted">${esc(c.phone)}</div></dd>
        <dt>Load</dt><dd>${esc(bk.cargo)}${trips > 1 ? ", " + trips + " trips" : ""}${bk.tonnes ? ", " + bk.tonnes + " t per trip" : ""}</dd>
        <dt>When</dt><dd>${fmtDay(bk.date)}${bk.time ? ", " + esc(bk.time.toLowerCase()) : ""}</dd>
        <dt>From</dt><dd>${esc(bk.pickup.name || "Pinned pickup")}</dd>
        <dt>To</dt><dd>${esc(bk.drop.name || "Pinned drop-off")} · <a href="${gmap}" target="_blank" rel="noopener">route</a></dd>
        <dt>Distance</dt><dd>${bk.km || 0} km</dd>
        ${bk.notes ? `<dt>Notes</dt><dd>${esc(bk.notes)}</dd>` : ""}
        <dt>Price</dt><dd><b>${ugx(price)}</b>${p.plan === "full" ? " (5% off for paying in full)" : ""}</dd>
        <dt>Paid</dt><dd>${paid ? ugx(paid) : "Nothing yet"}${p.balance ? ` · ${ugx(p.balance)} due on delivery` : ""}</dd>
      </dl>
      <div class="grid g2" style="margin-top:14px">
        <label class="lbl">Truck<select class="field js-bk-truck" name="truckId">${free.map(({ t, d }) => `<option value="${t.id}" data-driver="${d ? d.id : ""}" data-hp="${t.hp || 370}">${esc(t.plate)}${d ? " · " + esc(d.name) : ""}</option>`).join("")}</select></label>
        <label class="lbl">Driver<select class="field js-bk-driver" name="driverId">${(DATA.drivers || []).map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></label>
      </div>
      <label class="lbl" style="margin-top:10px">Pickup time<input class="field" type="datetime-local" name="pickupAt" value="${at}" /></label>
      <p class="eyebrow" style="margin-top:14px">Fuel</p>
      <div class="grid g3">
        <label class="lbl">Diesel UGX / litre<input class="field js-bk-diesel" name="dieselUgxPerLitre" inputmode="numeric" value="${diesel}" /></label>
        <label class="lbl">Litres<input class="field js-bk-litres" name="fuelLitres" inputmode="decimal" value="${litres}" data-km="${bk.km || 0}" data-trips="${trips}" /></label>
        <label class="lbl">Fuel cost (UGX)<input class="field js-bk-fuel" name="fuelCostUgx" inputmode="numeric" value="${fuel}" /></label>
      </div>
      <p class="muted js-bk-fuelnote" style="margin-top:6px">${bk.km || 0} km there and back${trips > 1 ? " × " + trips + " trips" : ""}</p>
      <button class="btn btn-steel wide" style="margin-top:14px">Create load</button>
    </form>`;
}
function bindLoadFromBooking() {
  const f = document.querySelector("form[data-form=job] [name=bookingId]");
  if (!f) return;
  const form = f.form;
  const truck = form.querySelector(".js-bk-truck"), driver = form.querySelector(".js-bk-driver");
  const pickDriver = () => { const o = truck.selectedOptions[0]; if (o && o.dataset.driver) driver.value = o.dataset.driver; };
  const dz = form.querySelector(".js-bk-diesel"), lt = form.querySelector(".js-bk-litres"), fc = form.querySelector(".js-bk-fuel");
  const cost = () => { fc.value = Math.round((Number(lt.value) || 0) * (Number(dz.value) || 0)); };
  // litres follow the truck picked (420 hp and 370 hp burn differently) until someone types their own
  const refuel = () => { if (lt.dataset.typed) return; const o = truck.selectedOptions[0], km = Number(lt.dataset.km) || 0, trips = Number(lt.dataset.trips) || 1; const tk = (DATA.trucks || []).find((x) => x.id === truck.value); const e = estimateTripFuel(km, km, tk || Number(o && o.dataset.hp) || 370, Number(dz.value) || 0); lt.value = Math.round(e.litres * trips * 10) / 10; cost(); };
  truck.onchange = () => { pickDriver(); refuel(); }; pickDriver(); refuel();
  dz.oninput = cost; lt.oninput = () => { lt.dataset.typed = "1"; cost(); };
}
function viewNewJob() {
  const bk = (DATA.bookings || []).find((x) => x.id === sessionStorage.getItem("jobFromBooking") && !x.jobId) || null;
  if (bk) return viewLoadFromBooking(bk);
  const cl = bk ? bk.client || {} : {};
  const known = bk ? (DATA.contractors || []).find((c) => phoneDigits(c.phone) && phoneDigits(c.phone) === phoneDigits(cl.phone)) : null;
  const newC = bk && !known;
  return `
    <h1>New load</h1>
    ${fleetTabs("trucks-new")}
    <form class="card item form-card" data-form="job" style="margin-top:16px;max-width:620px">
      <p class="form-step">Client and material</p>
      <div class="grid g2">
        <label class="lbl">Client<select class="field js-contractor" name="contractorId">${DATA.contractors.map((c) => `<option value="${c.id}">${esc(c.name)}${c.phone ? " · " + esc(c.phone) : ""}</option>`).join("")}<option value="new">＋ New client</option></select></label>
        <label class="lbl">Material${cargoSelect("")}</label>
      </div>
      <div class="grid g2 js-new-contractor" style="margin-top:10px;display:none">
        <label class="lbl">New client name<input class="field" name="contractorName" placeholder="Company or person" /></label>
        <label class="lbl">Client phone<input class="field" name="contractorPhone" inputmode="tel" placeholder="07XX XXX XXX" /></label>
      </div>
      <p class="form-step">Route and time</p>
      <div class="grid g2">
        <label class="lbl">Pickup place<input class="field js-pv" required placeholder="e.g. Kigo quarry" /></label>
        <label class="lbl">Drop-off place<input class="field js-dv" required placeholder="e.g. Mukono site" /></label>
      </div>
      <div class="grid g2" style="margin-top:10px">
        <label class="lbl">Pickup time<input class="field" type="datetime-local" name="pickupAt" /></label>
        <label class="lbl">Drop-off time <span class="muted">(optional)</span><input class="field" type="datetime-local" name="dropAt" /></label>
      </div>
      <input type="hidden" name="origin" class="js-origin" />
      <input type="hidden" name="destination" class="js-dest" />
      <p class="muted js-route" style="margin-top:8px"></p>
      <button type="button" class="btn btn-ghost btn-sm" id="useGps" style="margin-top:4px">Use the truck's GPS for distance</button>
      <input type="hidden" name="kmToPickup" class="js-dead" />
      <input type="hidden" name="kmHaul" class="js-haul" />
      <div id="routeMap" style="height:220px;margin-top:8px;border-radius:14px"></div>
      <p class="form-step">Truck and driver</p>
      <div class="grid g2">
        <label class="lbl">Truck<select class="field js-nl-truck" name="truckId">${DATA.trucks.map((t) => { const d = DATA.drivers.find((x) => x.id === t.assignedDriverId); return `<option value="${t.id}" data-driver="${d ? d.id : ""}">${esc(t.plate)}${t.hp ? " · " + t.hp + " hp" : ""}</option>`; }).join("")}</select></label>
        <label class="lbl">Driver<select class="field js-nl-driver" name="driverId">${DATA.drivers.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></label>
      </div>
      <p class="form-step">Price and fuel</p>
      <div class="grid g2">
        <label class="lbl">Distance (km)<input class="field js-km" name="km" inputmode="decimal" placeholder="One way" /></label>
        <label class="lbl">Price to client (UGX)<input class="field" name="rateUgx" required inputmode="numeric" placeholder="0" /></label>
      </div>
      <div class="grid g3" style="margin-top:10px">
        <label class="lbl">Diesel UGX / litre<input class="field js-diesel" name="dieselUgxPerLitre" inputmode="numeric" value="${DATA.dieselDefaultUgx || 5200}" /></label>
        <label class="lbl">Litres needed<input class="field js-litres" name="fuelLitres" readonly placeholder="Worked out" /></label>
        <label class="lbl">Fuel cost (UGX)<input class="field js-fuel" name="fuelCostUgx" readonly placeholder="Worked out" /></label>
      </div>
      <button class="btn btn-primary wide" style="margin-top:16px">Save load</button>
    </form>`;
}

// ───────────── Client bookings (from the public booking page) ─────────────
// full international digits: "+44 7700 900123" -> 447700900123, a local "0772..." -> 256772...
const phoneDigits = (p) => { const raw = String(p || "").trim(); let d = raw.replace(/\D/g, ""); if (!d) return ""; if (raw.startsWith("+")) return d; if (d.startsWith("00")) return d.slice(2); if (d.startsWith("256") && d.length === 12) return d; if (d.length === 9) d = "0" + d; return /^0\d{9}$/.test(d) ? "256" + d.slice(1) : d; };
const waNumber = (p) => phoneDigits(p);
function bookingsWaiting() { return (DATA && DATA.bookings || []).filter((b) => !b.trashed && ["new", "seen", "payment_check", "accepted"].includes(b.status)); }
const BK_STATUS = { new: ["gold", "New"], seen: ["gold", "To quote"], quoted: ["blue", "Quote sent"], payment_check: ["gold", "Payment to check"], accepted: ["green", "Confirmed · needs a load"], confirmed: ["green", "Load created"], declined: ["red", "Declined"], client_declined: ["red", "Client said no"] };
const PLAN_TEXT = { full: "100% (5% off)", deposit: "75% now, 25% on delivery", account: "Pays on delivery (trusted client)" };
// one WhatsApp message for where the booking is now
function bookingStage(b) {
  const job = b.jobId ? (DATA.jobs || []).find((j) => j.id === b.jobId) : null;
  if (job) return ["delivered", "invoiced", "paid"].includes(job.status) ? "delivered" : job.status === "en_route" ? "on_the_way" : job.status === "loading" ? "loading" : job.status === "to_pickup" ? "heading" : "assigned";
  return b.status;
}
function bookingLink(b) { return location.origin + "/track?r=" + encodeURIComponent(b.ref) + "&k=" + encodeURIComponent(b.key || ""); }
function bookingWhatsApp(b) {
  const c = b.client || {};
  const first = String(c.name || "").split(" ")[0];
  const route = (b.pickup && b.pickup.name || "pickup") + " to " + (b.drop && b.drop.name || "drop-off");
  const job = b.jobId ? (DATA.jobs || []).find((j) => j.id === b.jobId) : null;
  const truck = job ? (DATA.trucks || []).find((t) => t.id === job.truckId) : null;
  const p = b.payment || {};
  const link = bookingLink(b);
  const stage = bookingStage(b);
  const hi = `Hello ${first}, this is Conacrew Logistics about booking ${b.ref}.`;
  const lines = {
    quoted: [`Hello ${first}, this is Conacrew Logistics.`, `Quote for booking ${b.ref}: ${b.cargo}${b.trips > 1 ? ", " + b.trips + " trips" : ""}, ${route}${b.km ? " (" + b.km + " km)" : ""}, ${fmtDay(b.date)}.`, `Price: ${ugx(b.quote && b.quote.amountUgx)}${b.quote && b.quote.note ? ". " + b.quote.note : ""}`, `Pay 100% and get 5% off, or pay 75% now and the rest on delivery. Confirm here: ${link}`],
    new: [hi, `We've received your request and will send your quote shortly.`, `Your booking: ${link}`],
    seen: [hi, `We've received your request and will send your quote shortly.`, `Your booking: ${link}`],
    payment_check: [hi, `We're checking your payment of ${ugx(p.due)}. We'll confirm shortly.`, link],
    accepted: [hi, p.plan === "account" ? `Your booking is confirmed. Payment of ${ugx(p.total)} is due on delivery.` : `Payment of ${ugx(p.due)} received, thank you. Your booking is confirmed.`, `We're assigning a truck. Follow your load here: ${link}`],
    assigned: [hi, `Truck ${truck ? truck.plate : ""} is assigned for ${fmtDay(b.date)}${job && job.pickupAt ? " at " + String(job.pickupAt).slice(11, 16) : ""}.`, `Follow your load: ${link}`],
    heading: [hi, `Truck ${truck ? truck.plate : ""} is heading to the pickup.`, `Follow your load: ${link}`],
    loading: [hi, `The truck is at the pickup and loading now.`, `Follow your load: ${link}`],
    on_the_way: [hi, `Your load is in transit${truck ? " in truck " + truck.plate : ""}.`, `Follow it here: ${link}`],
    delivered: [hi, `Your load has been delivered. Thank you for choosing Conacrew.`].concat(p.balance && !p.balancePaidAt ? [`Balance due: ${ugx(p.balance)}.`] : []).concat([link]),
    declined: [hi, `Sorry, we can't take this load${b.declineNote ? ": " + b.declineNote : "."}`],
  }[stage] || [hi, link];
  return "https://wa.me/" + waNumber(c.phone) + "?text=" + encodeURIComponent(lines.join("\n"));
}
const STAGE_BTN = { new: "Tell client: request received", seen: "Tell client: request received", quoted: "Send quote on WhatsApp", payment_check: "Tell client: checking payment", accepted: "Tell client: booking confirmed", assigned: "Tell client: truck assigned", heading: "Tell client: heading to pickup", loading: "Tell client: loading", on_the_way: "Tell client: in transit", delivered: "Tell client: delivered" };
// where the client was: when they booked, and each time they opened their link
function clientSeenRows(b) {
  const rows = [];
  const f = b.from;
  if (f && (f.place || f.dev)) rows.push(["Booked from", `📍 ${esc(f.place || "Unknown area")}${f.dev ? ` <span class="muted">· ${esc(f.dev)}</span>` : ""}`]);
  const v = b.views || [];
  if (!v.length) rows.push(["Link opened", `<span class="muted">Not opened yet</span>`]);
  else rows.push(["Link opened", `<b>${b.viewCount || v.length} time${(b.viewCount || v.length) > 1 ? "s" : ""}</b> · last ${whenShort(v[0].at)}${v[0].place ? " from " + esc(v[0].place) : ""}${v[0].dev ? ` <span class="muted">· ${esc(v[0].dev)}</span>` : ""}
    ${v.length > 1 ? `<details class="views"><summary>Recent opens</summary>${v.map((x) => `<div class="view-line"><span>${whenShort(x.at)}</span><span>${esc(x.place ? x.place.split(",")[0] : "Unknown area")}</span><span class="muted">${esc(x.dev || "")}</span></div>`).join("")}</details>` : ""}`]);
  return rows;
}
// ---- price suggestion for a client quote ----
const PRICING_START = { marginPct: 30, wearPerKm: 600, driverPerTrip: 50000, extraPerTrip: 0, minTrip: 250000 };
function pricing() { return { ...PRICING_START, ...(DATA.pricing || {}) }; }
function suggestPrice(b) {
  const p = pricing(), km = Number(b.km) || 0, trips = Math.max(1, Number(b.trips) || 1);
  const diesel = DATA.dieselDefaultUgx || 5200;
  const trucks = DATA.trucks || [];
  // the hungrier truck, so the price covers whichever one goes
  const litres = Math.max(0, ...trucks.map((t) => estimateTripFuel(km, km, t, 0).litres), estimateTripFuel(km, km, 420, 0).litres);
  const fuel = Math.round(litres * diesel), wear = Math.round(km * 2 * p.wearPerKm);
  const cost = fuel + wear + p.driverPerTrip + p.extraPerTrip;
  const raw = Math.max(p.minTrip, cost * (1 + p.marginPct / 100));
  const perTrip = Math.ceil(raw / 10000) * 10000;
  return { km, trips, litres, diesel, fuel, wear, driver: p.driverPerTrip, extra: p.extraPerTrip, cost, perTrip, total: perTrip * trips, margin: p.marginPct, minUsed: raw === p.minTrip && cost * (1 + p.marginPct / 100) < p.minTrip };
}
function pastPerKm() {
  const done = (DATA.jobs || []).filter((j) => (isPaid(j) || ["delivered", "invoiced"].includes(j.status)) && (j.kmHaul || j.km) > 0 && (j.rateUgx || j.incomeUgx));
  if (done.length < 3) return null;
  const sum = done.reduce((s, j) => s + (j.paidUgx || j.incomeUgx || j.rateUgx) / (j.kmHaul || j.km), 0);
  return { n: done.length, perKm: Math.round(sum / done.length) };
}
function priceBox(b) {
  if (!b.km) return `<div class="price-box"><b>Suggested price</b><p class="muted">Add the distance to get a suggestion.</p></div>`;
  const s = suggestPrice(b), past = pastPerKm();
  return `<div class="price-box">
    <div class="row keep" style="align-items:center"><div><span class="eyebrow">Suggested price</span><b class="price-big">${ugx(s.total)}</b><div class="muted">${s.trips > 1 ? `${ugx(s.perTrip)} a trip × ${s.trips}` : "One trip"} · ${s.km} km each way</div></div>
      <button type="button" class="btn btn-primary btn-sm js-useprice" data-price="${s.total}">Use this price</button></div>
    <details class="settings" style="margin-top:8px"><summary>How it's worked out</summary>
      ${facts([["Diesel", `${Math.round(s.litres)} L × ${ugx(s.diesel)} = ${ugx(s.fuel)}`], ["Repairs & tyres", `${s.km * 2} km × ${ugx(pricing().wearPerKm)} = ${ugx(s.wear)}`], ["Driver pay", ugx(s.driver)], s.extra ? ["Other trip costs", ugx(s.extra)] : null, ["Cost a trip", `<b>${ugx(s.cost)}</b>`], ["Your margin", s.margin + "%" + (s.minUsed ? ` · raised to your minimum ${ugx(pricing().minTrip)}` : "")]])}
      ${past ? `<p class="muted" style="margin:8px 0 0">Your last ${past.n} loads averaged ${ugx(past.perKm)} per km; this suggestion is ${ugx(Math.round(s.perTrip / s.km))} per km.</p>` : ""}
    </details>
  </div>`;
}
function pricingCard() {
  const p = pricing();
  return `<details class="card item settings pricing-card" style="margin-top:10px"><summary><b>Pricing for quotes</b><div class="muted">${DATA.pricing ? `Margin ${p.marginPct}% · diesel ${ugx(DATA.dieselDefaultUgx || 5200)}/L` : "Starting values: set your own"}</div></summary>
    <form data-form="pricing" style="margin-top:10px">
      <div class="grid g2">
        <label class="lbl">Diesel today (UGX / litre)<input class="field" name="dieselUgx" inputmode="numeric" value="${DATA.dieselDefaultUgx || 5200}" /></label>
        <label class="lbl">Your margin (%)<input class="field" name="marginPct" inputmode="numeric" value="${p.marginPct}" /></label>
      </div>
      <div class="grid g2" style="margin-top:10px">
        <label class="lbl">Repairs & tyres (UGX per km)<input class="field" name="wearPerKm" inputmode="numeric" value="${p.wearPerKm}" /></label>
        <label class="lbl">Driver pay a trip (UGX)<input class="field" name="driverPerTrip" inputmode="numeric" value="${p.driverPerTrip}" /></label>
      </div>
      <div class="grid g2" style="margin-top:10px">
        <label class="lbl">Other costs a trip (UGX) <span class="muted">(loading, road fees)</span><input class="field" name="extraPerTrip" inputmode="numeric" value="${p.extraPerTrip}" /></label>
        <label class="lbl">Lowest price a trip (UGX)<input class="field" name="minTrip" inputmode="numeric" value="${p.minTrip}" /></label>
      </div>
      <button class="btn btn-primary wide" style="margin-top:12px">Save pricing</button>
    </form></details>`;
}
function payInfoCard() {
  return DATA.me.role === "admin" && !DATA.me.assistant ? (() => { const pi = DATA.payInfo || { airtel: { number: "0705139060", name: "Restatuta" }, bank: { bank: "Stanbic Bank Uganda", name: "Conacrew Logistics Ltd", account: "9030025603272", code: "042641" } }; return `<details class="card item settings" style="margin-top:10px"><summary>Where clients pay</summary>
      <form data-form="payinfo" style="margin-top:10px">
        <div class="grid g2"><label class="lbl">Airtel Money number<input class="field" name="airtelNumber" value="${esc(pi.airtel.number)}" /></label><label class="lbl">Name on Airtel<input class="field" name="airtelName" value="${esc(pi.airtel.name)}" /></label></div>
        <div class="grid g2" style="margin-top:10px"><label class="lbl">Bank<input class="field" name="bankName" value="${esc(pi.bank.bank)}" /></label><label class="lbl">Account name<input class="field" name="bankAccountName" value="${esc(pi.bank.name)}" /></label></div>
        <div class="grid g2" style="margin-top:10px"><label class="lbl">Account number<input class="field" name="bankAccount" value="${esc(pi.bank.account)}" /></label><label class="lbl">Bank code<input class="field" name="bankCode" value="${esc(pi.bank.code)}" /></label></div>
        <button class="btn btn-steel wide" style="margin-top:10px">Save payment details</button>
      </form></details>`; })() : "";
}
function viewBookings() {
  const all = DATA.bookings || [];
  const only = sessionStorage.getItem("bkOnly");
  const one = only ? all.find((b) => b.ref === only) : null;
  const tab = sessionStorage.getItem("bkTab") === "closed" ? "closed" : "open";
  const groups = { open: ["new", "seen", "quoted", "payment_check", "accepted"], closed: ["declined", "client_declined"] };
  const list = one ? [one] : all.filter((b) => !b.trashed && groups[tab].includes(b.status));
  const pageUrl = location.origin + "/book";
  const card = (b) => {
    const c = b.client || {};
    const [tone, st] = BK_STATUS[b.status] || ["blue", b.status];
    const job = b.jobId ? (DATA.jobs || []).find((j) => j.id === b.jobId) : null;
    const gmap = `https://www.google.com/maps/dir/?api=1&origin=${b.pickup.lat},${b.pickup.lng}&destination=${b.drop.lat},${b.drop.lng}&travelmode=driving`;
    const canQuote = ["new", "seen", "quoted", "payment_check"].includes(b.status);
    return `<details class="card bk-card ${["new", "seen", "payment_check", "accepted"].includes(b.status) ? "flash" : ""}" ${list.length === 1 || sessionStorage.getItem("bkOpen") === b.ref ? "open" : ""} id="bk-${esc(b.ref)}">
      <summary>
        <div style="flex:1;min-width:0"><b>${esc(c.company || c.name)}</b> <span class="muted">${esc(b.ref)}</span>
          <div class="muted">${esc(b.cargo)}${b.trips > 1 ? ", " + b.trips + " trips" : ""} · ${fmtDay(b.date)}${b.km ? " · " + b.km + " km" : ""}</div></div>
        <span class="badge ${tone}">${st}</span>
      </summary>
      <div class="bk-body">
        <div class="bk-route"><div><span class="pin-dot a"></span>${esc(b.pickup.name || "Pinned pickup")}</div><div><span class="pin-dot b"></span>${esc(b.drop.name || "Pinned drop-off")}</div>
          <a class="btn btn-ghost btn-sm" href="${gmap}" target="_blank" rel="noopener">Open route in Google Maps</a></div>
        <dl class="bk-facts">
          <dt>Client</dt><dd>${esc(c.name)}${c.company ? ", " + esc(c.company) : ""}</dd>
          <dt>Phone</dt><dd><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>${c.whatsapp ? " · prefers WhatsApp" : ""}</dd>
          ${c.email ? `<dt>Email</dt><dd>${esc(c.email)}</dd>` : ""}
          ${b.tonnes ? `<dt>Tonnes</dt><dd>${b.tonnes}</dd>` : ""}
          ${b.time ? `<dt>Time</dt><dd>${esc(b.time)}</dd>` : ""}
          ${b.notes ? `<dt>Notes</dt><dd>${esc(b.notes)}</dd>` : ""}
          ${b.quote ? `<dt>Quote</dt><dd><b>${ugx(b.quote.amountUgx)}</b> · valid to ${fmtDay(b.quote.validUntil)}${b.quote.note ? " · " + esc(b.quote.note) : ""}</dd>` : ""}
          ${b.payment ? `<dt>Payment</dt><dd>${esc(PLAN_TEXT[b.payment.plan] || "")}${b.payment.due ? ` · <b>${ugx(b.payment.due)}</b> by ${b.payment.method === "bank" ? "bank" : "Airtel Money"}${b.payment.txn ? " · ID " + esc(b.payment.txn) : ""}` : ""} · ${{ checking: "to check", received: "received", rejected: "not found", account: "on delivery" }[b.payment.status] || ""}${b.payment.balance ? ` · balance ${ugx(b.payment.balance)}${b.payment.balancePaidAt ? " paid" : " due on delivery"}` : ""}</dd>` : ""}
          ${b.clientAnswer && b.clientAnswer.note ? `<dt>Client said</dt><dd>${esc(b.clientAnswer.note)}</dd>` : ""}
          ${clientSeenRows(b).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}
          ${job ? `<dt>Load</dt><dd><a href="#trucks-jobs">${esc(job.code)}</a> · ${esc(TRIP_NAME[job.status] || label(job.status))}${tripTime(job, job.status) ? " · " + tripTime(job, job.status) : ""}${tripControls(job)}</dd>` : ""}
        </dl>
        ${b.payment && b.payment.status === "checking" ? `<div class="bk-pay">
          <b>Check ${b.payment.method === "bank" ? "the Stanbic account" : "Airtel Money"} for ${ugx(b.payment.due)}</b><div class="muted">Transaction ID ${esc(b.payment.txn)}${b.payment.payer ? " · from " + esc(b.payment.payer) : ""}</div>
          <div class="bk-actions"><button type="button" class="btn btn-primary btn-sm js-bkpay" data-id="${esc(b.id)}" data-kind="confirm">Payment received</button><button type="button" class="btn btn-ghost btn-sm js-bkpay" data-id="${esc(b.id)}" data-kind="reject">Not received</button></div>
        </div>` : ""}
        ${b.payment && b.payment.balance && !b.payment.balancePaidAt && b.jobId ? `<div class="bk-pay"><b>Balance on delivery: ${ugx(b.payment.balance)}</b>
          <div class="bk-actions"><button type="button" class="btn btn-primary btn-sm js-bkpay" data-id="${esc(b.id)}" data-kind="balance">Balance received</button></div></div>` : ""}
        <div class="bk-actions">
          <a class="btn btn-whatsapp btn-sm" href="${bookingWhatsApp(b)}" target="_blank" rel="noopener">${STAGE_BTN[bookingStage(b)] || "Message on WhatsApp"}</a>
          <button type="button" class="btn btn-ghost btn-sm js-copylink" data-link="${esc(bookingLink(b))}">Copy client link</button>
        </div>
        ${b.quote && ["quoted", "payment_check"].includes(b.status) ? `<button type="button" class="btn btn-ghost wide js-bkpay" data-id="${esc(b.id)}" data-kind="account" style="margin-top:10px">Book without payment (trusted client)</button>` : ""}
        ${canQuote && b.status !== "payment_check" ? `<form data-form="book-quote" class="bk-form">
          <input type="hidden" name="id" value="${esc(b.id)}" />
          ${priceBox(b)}
          <div class="grid g2" style="margin-top:10px"><label class="lbl">${b.quote ? "New price" : "Price"} (UGX)<input class="field" name="amountUgx" required inputmode="numeric" value="${b.quote ? b.quote.amountUgx : ""}" /></label>
          <label class="lbl">Valid for<select class="field" name="validDays"><option value="1">1 day</option><option value="3" selected>3 days</option><option value="7">7 days</option></select></label></div>
          <label class="lbl" style="margin-top:10px">Note to client <span class="muted">(optional)</span><input class="field" name="note" maxlength="300" value="${b.quote ? esc(b.quote.note) : ""}" /></label>
          <button class="btn btn-primary wide" style="margin-top:10px">${b.quote ? "Update quote" : "Save quote"}</button>
        </form>` : ""}
        ${b.status === "accepted" ? `<button type="button" class="btn btn-steel wide js-bk-load" data-id="${esc(b.id)}" style="margin-top:10px">Create load and assign a driver</button>` : ""}
        ${canQuote ? `<details class="settings" style="margin-top:10px"><summary>Decline this booking</summary><form data-form="book-decline" style="margin-top:8px"><input type="hidden" name="id" value="${esc(b.id)}" /><label class="lbl">Reason the client will see <span class="muted">(optional)</span><input class="field" name="note" maxlength="300" placeholder="e.g. No truck free that day" /></label><button class="btn btn-ghost wide" style="margin-top:8px">Decline</button></form></details>` : ""}
        ${["declined", "client_declined"].includes(b.status) && !b.jobId ? `<button type="button" class="btn btn-ghost wide" data-act="trash_booking" data-id="${esc(b.id)}" style="margin-top:10px">Move to trash</button>` : ""}
        <p class="eyebrow" style="margin-top:14px">History</p>
        ${(b.history || []).slice().reverse().map((h) => `<div class="pay-line"><div><b>${esc(h.what)}</b><div class="muted">${whenShort(h.at)}${h.by ? " · " + esc(h.by) : ""}</div></div></div>`).join("")}
      </div>
    </details>`;
  };
  const n = (g) => all.filter((b) => !b.trashed && groups[g].includes(b.status)).length;
  if (one) return `
    <h1>Fleet</h1>
    ${fleetTabs("trucks-jobs")}
    <button type="button" class="btn btn-ghost btn-sm" id="bkBack" style="margin-top:14px">‹ Client loads</button>
    <div class="list" style="margin-top:12px">${card(one)}</div>`;
  return `
    <h1>Fleet</h1>
    ${fleetTabs("trucks-book")}
    <div class="card item share-card" style="margin-top:14px">
      <div class="row keep" style="align-items:center"><div style="min-width:0"><b>Your booking page</b><div class="muted">${esc(pageUrl)}</div></div>
      <div style="display:flex;gap:6px"><button type="button" class="btn btn-ghost btn-sm js-copylink" data-link="${esc(pageUrl)}">Copy</button><a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent("Hire a Sinotruk 8×4 dump truck with a driver from Conacrew Logistics. Pin your pickup and drop-off and get a quote: " + pageUrl)}">Share</a></div></div>
    </div>

    ${pricingCard()}
    <div class="seg" style="margin-top:14px">
      ${[["open", "Open"], ["closed", "Closed"]].map(([k, t]) => `<button type="button" class="seg-btn ${tab === k ? "on" : ""}" data-bktab="${k}">${t}${n(k) ? ` <span class="count">${n(k)}</span>` : ""}</button>`).join("")}
    </div>
    <div class="list" style="margin-top:12px">${list.length ? list.map(card).join("") : `<div class="card item muted">${tab === "open" ? "No client requests waiting." : "Nothing here yet."}</div>`}</div>`;
}
function bindBookings() {
  document.querySelectorAll('a[href="#trucks-book"]').forEach((l) => { l.addEventListener("click", () => { if (sessionStorage.getItem("bkOnly")) { sessionStorage.removeItem("bkOnly"); if (location.hash === "#trucks-book") setTimeout(route, 0); } }); });
  const bkBack = document.getElementById("bkBack");
  if (bkBack) bkBack.onclick = () => { sessionStorage.removeItem("bkOnly"); sessionStorage.setItem("jobSrc", "client"); location.hash = "#trucks-jobs"; };
  document.querySelectorAll(".js-useprice").forEach((b) => { b.onclick = () => { const f = b.closest("form").querySelector("[name=amountUgx]"); f.value = b.dataset.price; f.focus(); }; });
  document.querySelectorAll("[data-bktab]").forEach((b) => { b.onclick = () => { sessionStorage.setItem("bkTab", b.dataset.bktab); route(); }; });
  document.querySelectorAll(".js-copylink").forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.link); b.textContent = "Copied"; } catch (e) { prompt("Copy this link", b.dataset.link); } }; });
  document.querySelectorAll(".js-bkpay").forEach((b) => { b.onclick = () => {
    const k = b.dataset.kind; const extra = {};
    if (k === "reject") { const why = prompt("What should the client see?", "We couldn't find this payment. Check the transaction ID and send it again."); if (why === null) return; extra.note = why; }
    if (k === "account" && !confirm("Book this client without payment? They pay the full price on delivery.")) return;
    if (k === "balance") { const ref = prompt("Paid how? Type a reference or leave blank for cash.", ""); if (ref === null) return; extra.reference = ref; extra.method = ref ? "airtel_money" : "cash"; }
    act("booking_payment", { id: b.dataset.id, kind: k, ...extra });
  }; });
  document.querySelectorAll(".js-bk-load").forEach((b) => { b.onclick = () => { sessionStorage.setItem("jobFromBooking", b.dataset.id); location.hash = "#trucks-new"; }; });
  const drop = document.getElementById("dropBooking");
  if (drop) drop.onclick = () => { sessionStorage.removeItem("jobFromBooking"); route(); };
}

function mediaBlock(issue) {
  const photos = issue.photos || [];
  const voice = issue.voice;
  return `
    ${photos.length ? `<div class="thumbs">${photos.map((src) => `<img src="${src}" alt="" />`).join("")}</div>` : ""}
    ${voice ? `<audio class="voice-play" controls src="${voice}" style="width:100%;margin-top:8px"></audio>${issue.voiceSec ? `<p class="muted">${issue.voiceSec}s</p>` : ""}` : ""}
  `;
}

function viewReports() {
  const list = DATA.issues || [];
  const incoming = list.filter((i) => i.status !== "closed");
  return `
    <h1>Fleet</h1>
    ${fleetTabs("trucks-issues")}
    <p class="muted" style="margin-top:10px">${incoming.length ? incoming.length + " to answer" : "All answered"}</p>
    <div class="list" style="margin-top:14px">
      ${list.length ? list.map((i) => {
        const t = DATA.trucks.find((x) => x.id === i.truckId);
        const d = DATA.drivers.find((x) => x.id === i.driverId);
        return `<div class="card item ${i.status === "open" ? "flash" : ""}">
          <div class="row"><div><p class="eyebrow">${i.date} · ${t?.plate || ""} · ${d?.name || i.by}</p><b>${i.title}</b></div>${badge(i.status)}${i.severity === "urgent" ? badge("urgent") : ""}</div>
          ${i.note ? `<p style="margin-top:8px">${i.note}</p>` : ""}
          ${mediaBlock(i)}
          ${(i.replies || []).map((r) => `<p class="muted" style="margin-top:8px"><b>Next:</b> ${r.text}</p>`).join("")}
          ${i.status !== "closed" ? `<form data-form="reply-issue" data-id="${i.id}" style="margin-top:10px"><input class="field" name="text" required placeholder="Next step" /><div class="grid g2" style="margin-top:8px"><button class="btn btn-primary">Send</button><button class="btn btn-ghost" name="close" value="1">Close</button></div></form>` : ""}
        </div>`;
      }).join("") : `<div class="card item">None</div>`}
    </div>`;
}

function viewDrive(page, taskId) {
  const next = { booked: "to_pickup", to_pickup: "loading", loading: "en_route", en_route: "delivered" };
  const nextLabel = { to_pickup: "Start trip", loading: "Arrived at pickup", en_route: "Loaded, leaving", delivered: "Delivered" };
  const myId = DATA.me.driverId;
  const jobs = (DATA.jobs || []).filter((j) => j.driverId === myId);
  const tasks = (DATA.fleetTasks || []).filter((t) => t.driverId === myId && !["done", "cancelled"].includes(t.status));
  const notes = (DATA.notifications || []).filter((n) => n.status === "unread");
  const floats = DATA.disbursements || [];
  const pendingMoney = floats.filter((f) => f.status === "sent").length;
  const dw = driverWaiting();
  const side = tabMenu([
    ["#drive", "Desk", "drive", dw.notes],
    ["#drive-jobs", "Loads", "drive-jobs", dw.jobs],
    ["#drive-paid", "Paid loads", "drive-paid"],
    ["#drive-pay", "My pay", "drive-pay"],
    ["#drive-tasks", "Tasks", "drive-tasks", dw.tasks],
    ["#drive-report", "Inspect", "drive-report"],
    ["#drive-fuel", "Fuel", "drive-fuel"],
    ["#drive-docs", "Docs", "drive-docs"],
    ["#drive-money", "Advance", "drive-money", toConfirm("trucking").length],
  ], page);

  const desk = `
    <h1>Desk</h1>
    <div class="notice-bar">
      <p class="eyebrow">From the office</p>
      ${notes.length ? notes.map((n) => n.taskId ? `<p>${n.text || n.title || "New notice"}</p>` : `<div class="note-line flash"><p>${esc(n.text || n.title || "New notice")}</p><button type="button" class="btn btn-ghost btn-sm" data-act="read_note" data-id="${esc(n.id)}">Got it</button></div>`).join("") : ""}
      ${tasks.length ? `<a href="#drive-tasks">${tasks.length} task${tasks.length === 1 ? "" : "s"} from the office</a>` : ""}
      ${pendingMoney ? `<a href="#drive-money">${pendingMoney} payment${pendingMoney === 1 ? "" : "s"} to confirm</a>` : ""}
      ${!notes.length && !tasks.length && !pendingMoney ? `<p class="muted">No new notices</p>` : ""}
    </div>
    <div class="card item" style="margin-top:14px">
      <div class="row"><div><b>${DATA.truck ? DATA.truck.plate : "No unit"}</b><p class="muted">${DATA.truck ? DATA.truck.model + " · " + DATA.truck.odometerKm.toLocaleString() + " km" : ""}</p></div>${DATA.truck ? badge(DATA.truck.status) : ""}</div>
    </div>
    <div class="card item" id="liveStatus" style="margin-top:10px"></div>
    <div class="desk-grid">
      <a class="card item" href="#drive-report"><b>Inspect</b><p class="muted">Before the truck moves</p></a>
      <a class="card item" href="#drive-jobs"><b>Loads</b><p class="muted">${jobs.filter(j=>!isPaid(j)).length} open</p></a>
      <a class="card item" href="#drive-paid"><b>Paid loads</b><p class="muted">${jobs.filter(isPaid).length} saved</p></a>
      <a class="card item" href="#drive-pay"><b>My pay</b><p class="muted">${ugx(paySums(DATA.payStubs).ytd)} YTD · ${owedTo("driver", { ...(DATA.driver || {}), id: DATA.me.driverId }, DATA.payStubs, DATA).waiting.length} waiting</p></a>
      <a class="card item" href="#drive-tasks"><b>Tasks</b><p class="muted">${tasks.length} open</p></a>
      <a class="card item" href="#drive-money"><b>Advance</b><p class="muted">${pendingMoney} to confirm</p></a>
      <a class="card item" href="#drive-docs"><b>Docs</b><p class="muted">Receipts, licence, papers</p></a>
    </div>`;

  const money = driverAdvanceView();

  const taskPanel = driverTasksView();

  const report = `
    <h1>Inspect report</h1>
    <form class="card item" data-form="inspect" style="margin-top:14px">
      <p class="eyebrow">${DATA.truck ? DATA.truck.plate : "Unit"}</p>
      <input class="field" name="odometerKm" placeholder="Odometer km" style="margin-top:8px" value="${DATA.truck ? DATA.truck.odometerKm : ""}" />
      ${inspectForm()}
      <input class="field" name="note" placeholder="Note" style="margin-top:12px" />
      <div style="margin-top:12px" class="js-voice-if-bad" hidden>${voiceBox("🎙 Voice note about the problem (optional, up to 3 minutes)")}</div>
      <button class="btn btn-primary wide" style="margin-top:12px">Send inspect</button>
    </form>
    <div class="list" style="margin-top:14px">
      ${(DATA.inspections || []).map((r) => `<div class="card item"><div class="row"><div><b>${r.date}</b><p class="muted">${r.odometerKm || 0} km</p></div>${badge(r.status === "fail" ? "fail" : r.status === "warn" ? "warning" : "pass")}</div>
        ${r.voice ? `<audio class="voice-play" controls src="${r.voice}" style="width:100%;margin-top:8px"></audio>` : ""}
      </div>`).join("")}
    </div>`;

  const jobPanel = `
    <h1>My loads</h1>
    <details class="card team-row" style="margin-top:14px">
    <summary><div class="avatar">＋</div><div style="flex:1"><b>Add a load I found</b><div class="muted">The office sees it right away</div></div></summary>
    <form data-form="driver-load" class="form-card" style="margin-top:12px">
      <div class="grid g2">
        <label class="lbl">Client<select class="field js-contractor" name="contractorId">${(DATA.contractors || []).map((c) => `<option value="${c.id}">${esc(c.name)}${c.phone ? " · " + esc(c.phone) : ""}</option>`).join("")}<option value="new">＋ New client</option></select></label>
        <label class="lbl">Material${cargoSelect("")}</label>
      </div>
      <div class="grid g2 js-new-contractor" style="margin-top:10px;display:none">
        <label class="lbl">New client name<input class="field" name="contractorName" /></label>
        <label class="lbl">Client phone<input class="field" name="contractorPhone" inputmode="tel" placeholder="07XX XXX XXX" /></label>
      </div>
      <div class="grid g2" style="margin-top:10px">
        <label class="lbl">Pickup place<input class="field js-pv" required placeholder="e.g. Kigo quarry" /></label>
        <label class="lbl">Drop-off place<input class="field js-dv" required placeholder="e.g. Mukono site" /></label>
      </div>
      <div class="grid g2" style="margin-top:10px">
        <label class="lbl">Pickup time<input class="field" type="datetime-local" name="pickupAt" /></label>
        <label class="lbl">Drop-off time <span class="muted">(optional)</span><input class="field" type="datetime-local" name="dropAt" /></label>
      </div>
      <input type="hidden" name="origin" class="js-origin" />
      <input type="hidden" name="destination" class="js-dest" />
      <p class="muted js-route" style="margin-top:8px"></p>
      <button type="button" class="btn btn-ghost btn-sm" id="useGps" style="margin-top:4px">Use my truck's GPS for distance</button>
      <input type="hidden" name="kmToPickup" class="js-dead" />
      <input type="hidden" name="kmHaul" class="js-haul" />
      <div id="routeMap" style="height:220px;margin-top:8px;border-radius:14px"></div>
      <div class="grid g3" style="margin-top:10px">
        <label class="lbl">Distance (km)<input class="field js-km" name="km" inputmode="decimal" /></label>
        <label class="lbl">Client pays<select class="field" name="payBasis"><option value="trip">Per trip</option><option value="tonne">Per tonne</option></select></label>
        <label class="lbl">UGX per tonne <span class="muted">(if known)</span><input class="field" name="payPerTonne" inputmode="numeric" /></label>
      </div>
      <div class="grid g3" style="margin-top:10px">
        <label class="lbl">Diesel UGX / litre<input class="field js-diesel" name="dieselUgxPerLitre" inputmode="numeric" value="${DATA.dieselDefaultUgx || 5200}" /></label>
        <label class="lbl">Litres needed<input class="field js-litres" name="fuelLitres" readonly placeholder="Worked out" /></label>
        <label class="lbl">Fuel cost (UGX)<input class="field js-fuel" name="fuelCostUgx" readonly placeholder="Worked out" /></label>
      </div>
      <button class="btn btn-primary wide" style="margin-top:14px">Add load</button>
    </form>
    </details>
    <div class="list" style="margin-top:14px">
      ${jobs.filter((j) => !isPaid(j)).length ? jobs.filter((j) => !isPaid(j)).map((j) => {
        const c = DATA.contractors.find((x) => x.id === j.contractorId);
        const n = next[j.status];
        const income = j.incomeUgx || ((j.tonnesDelivered || 0) * (j.payPerTonne || 0)) || j.rateUgx;
        const dir = j.pickupPin && j.dropPin ? `https://www.google.com/maps/dir/?api=1&origin=${j.pickupPin.lat},${j.pickupPin.lng}&destination=${j.dropPin.lat},${j.dropPin.lng}&travelmode=driving` : "";
        return `<div class="card item ${newOfficeLoad(j) ? "flash" : ""}"><div class="row"><div>${j.fromOffice ? `<span class="badge blue">${j.bookingRef ? "Client booking " + esc(j.bookingRef) : "From office"}</span> ` : ""}<b>${j.code || ""} ${j.cargo}</b><p class="muted">${j.origin} → ${j.destination}</p>${j.pickupAt ? `<p class="muted">Pickup ${esc(String(j.pickupAt).replace("T", " "))}</p>` : ""}${dir ? `<p><a class="btn btn-ghost btn-sm" href="${dir}" target="_blank" rel="noopener">Directions</a></p>` : ""}${j.notes ? `<p class="muted">${esc(j.notes)}</p>` : ""}<p class="muted">${c?.name || ""} · ${j.km || 0} km · ${j.payBasis === "tonne" ? (j.tonnesDelivered ? j.tonnesDelivered + " t" : "await scale") : "per trip"}</p></div>${badge(j.invoice && !isPaid(j) ? "invoiced" : "not paid")}</div>
        ${j.scaleTicket ? `<img src="${j.scaleTicket}" alt="" style="max-width:160px;border-radius:10px;margin-top:8px" />` : `<form data-form="scale" data-id="${j.id}" style="margin-top:8px"><div class="grid g2"><label class="lbl">Tonnes on the scale<input class="field" name="tonnes" required inputmode="decimal" /></label><label class="lbl">Scale ticket photo<input class="field" name="ticket" type="file" accept="image/*" capture="environment" required /></label></div><button class="btn btn-steel wide" style="margin-top:8px">Save scale ticket</button></form>`}
        ${j.scaleTicket && !j.invoice ? `<form data-form="invoice" data-id="${j.id}" style="margin-top:8px"><div class="grid g2"><label class="lbl">Invoice amount (UGX)<input class="field" name="amountUgx" required inputmode="numeric" value="${income || ""}" /></label><label class="lbl">Has the client paid?<select class="field" name="paidNow"><option value="0">Not yet</option><option value="1">Yes, paid now</option></select></label></div><label class="lbl" style="margin-top:8px">Invoice photo<input class="field" name="invoice" type="file" accept="image/*" capture="environment" required /></label><button class="btn btn-primary wide" style="margin-top:8px">Send invoice</button></form>` : ""}
        ${j.invoice ? `<img src="${j.invoice}" alt="" style="max-width:160px;border-radius:10px;margin-top:8px" />` : ""}
        ${j.source === "driver" && !j.fromOffice && !j.bookingId ? `<button class="btn btn-ghost wide" style="margin-top:8px" data-act="trash_job" data-id="${j.id}">Remove</button>` : ""}
        ${n ? `<div class="trip-now">${badge(j.status)}${tripTime(j, j.status) ? ` <span class="muted">${tripTime(j, j.status)}</span>` : ""}</div><button class="btn btn-steel wide" style="margin-top:10px" data-act="update_job" data-id="${j.id}" data-status="${n}">${nextLabel[n]}</button>` : ""}
        </div>`;
      }).join("") : `<div class="card item">None</div>`}
    </div>`;

  const paidPanel = `
    <h1>Paid loads</h1>
    <div class="list" style="margin-top:14px">
      ${jobs.filter(isPaid).length ? jobs.filter(isPaid).map((j) => loadFold(j, badge("paid"))).join("") : `<div class="card item">None saved</div>`}
    </div>`;

  const payPanel = `<h1>My pay</h1>${myPayView("driver")}`;

  const fuel = driverFuelView();

  const panel = page === "drive-task" ? driverTaskReply(taskId) : { drive: desk, "drive-money": money, "drive-tasks": taskPanel, "drive-report": report, "drive-jobs": jobPanel, "drive-paid": paidPanel, "drive-pay": payPanel, "drive-fuel": fuel, "drive-docs": page === "drive-docs" ? viewDocs("trucking") : "" }[page] || desk;
  return `<div class="desk">${side}<div class="desk-main">${panel}</div></div>`;
}

function caneTabs(on) {
  return tabMenu([
    ["#cane", "Buys", "cane"],
    ["#cane-new", "New", "cane-new"],
    ["#cane-sell", "Sell", "cane-sell"],
    ["#cane-spend", "Advances", "cane-spend", toConfirm("sugarcane").length],
    ["#cane-docs", "Docs", "cane-docs"],
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
        <button type="button" class="btn btn-primary" id="type-acre">Bought by the acre</button>
        <button type="button" class="btn btn-ghost" id="type-trip">Bought by the trip</button>
      </div>
      <div class="grid g2" style="margin-top:12px">
        <label class="lbl">Seller<select class="field js-seller" name="sellerId">${DATA.sellers.map((s) => `<option value="${s.id}">${esc(s.name)}${s.phone ? " · " + esc(s.phone) : ""}</option>`).join("")}<option value="new" ${DATA.sellers.length ? "" : "selected"}>＋ New seller</option></select></label>
        <label class="lbl">Location<input class="field" name="location" required placeholder="e.g. Kamuli" /></label>
      </div>
      <div class="grid g2 js-new-seller" style="margin-top:10px" ${DATA.sellers.length ? "hidden" : ""}>
        <label class="lbl">New seller name<input class="field" name="sellerName" /></label>
        <label class="lbl">Seller phone<input class="field" name="sellerPhone" inputmode="tel" placeholder="07XX XXX XXX" /></label>
      </div>
      <div class="grid g2 acre-only" style="margin-top:10px">
        <label class="lbl">Acres<input class="field" name="acres" inputmode="decimal" /></label>
      </div>
      <div class="grid g2 trip-only" style="margin-top:10px;display:none">
        <label class="lbl">Trips agreed<input class="field" name="tripsAgreed" inputmode="numeric" /></label>
      </div>
      <div class="grid g2" style="margin-top:10px"><label class="lbl">Buy price (UGX)<input class="field" name="buyPriceUgx" required inputmode="numeric" placeholder="0" /></label>${dateField("date", "Date bought")}</div>
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
    ${!b.sellerPaid ? (DATA.me.role === "admin" ? `<button class="btn btn-ghost wide" style="margin-top:10px" data-act-sheet="seller" data-id="${b.id}">Office paid seller ${ugx(b.buyPriceUgx)}</button>` : `<form class="card item" data-form="pay-seller" data-id="${b.id}" style="margin-top:10px"><b>Pay seller ${ugx(b.buyPriceUgx)}</b>${fundSelect("sugarcane", true, b.buyPriceUgx)}<button class="btn btn-primary wide" style="margin-top:10px">Pay seller</button></form>`) : ""}`;
}


function viewCaneSell() {
  const sales = DATA.caneSales || [];
  const mills = DATA.mills || [];
  return `
    <h1>Cane</h1>
    ${caneTabs("cane-sell")}
    <form class="card item form-card" data-form="cane-sale" style="margin-top:14px">
      <p class="form-step">Sale to the mill</p>
      <div class="grid g2">
        <label class="lbl">Mill<select class="field" name="millId">${mills.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></label>
        ${dateField("date", "Sale date")}
      </div>
      <div class="grid g2" style="margin-top:10px">
        <label class="lbl">Tonnes<input class="field" name="tonnes" id="saleT" required inputmode="decimal" placeholder="0" /></label>
        <label class="lbl">Price per tonne (UGX)<input class="field" name="pricePerTonne" id="saleP" required inputmode="numeric" placeholder="0" /></label>
      </div>
      <p class="sum-line" id="saleSum">Total UGX 0</p>
      <div class="grid g2">
        <label class="lbl">Mill paid by<select class="field" name="method">${methodOptions("bank")}</select></label>
        <label class="lbl">For cane buy <span class="muted">(optional)</span><select class="field" name="buyId"><option value="">— Not linked —</option>${(DATA.caneBuys || []).map((b) => `<option value="${b.id}">${esc(b.location || b.id)} · ${b.acres ? b.acres + " ac" : (b.tripsAgreed || 0) + " trips"}</option>`).join("")}</select></label>
      </div>
      <p class="form-step">Costs for this sale <span class="muted">(optional)</span></p>
      <div class="grid g3">
        <label class="lbl">Cutting cost (UGX)<input class="field" name="cuttingCostUgx" inputmode="numeric" placeholder="0" /></label>
        <label class="lbl">Loading cost (UGX)<input class="field" name="loadingCostUgx" inputmode="numeric" placeholder="0" /></label>
        <label class="lbl">Transport cost (UGX)<input class="field" name="transportUgx" inputmode="numeric" placeholder="0" /></label>
      </div>
      <label class="lbl" style="margin-top:10px">Note <span class="muted">(optional)</span><input class="field" name="note" /></label>
      <button class="btn btn-primary wide" style="margin-top:14px">Save sale</button>
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
    ["#passion-spend", "Advances", "passion-spend", toConfirm("passion").length],
    ["#passion-docs", "Docs", "passion-docs"],
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
  const kind = (parseRoute().work && kinds.some((k) => k[0] === parseRoute().work)) ? parseRoute().work : "harvest";
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
        ${(() => { const bl = (DATA.blocks || []).length ? DATA.blocks.map((b) => b.id) : ["B1", "B2", "B3", "B4"]; return bl.map((id, i) => `<button type="button" class="block-btn ${i === 0 ? "on" : ""}" data-block="${esc(id)}">${esc(id)}</button>`).join(""); })()}
      </div>
      <input type="hidden" name="blockId" value="${esc(((DATA.blocks || [])[0] || {}).id || "B1")}" />
      <div class="grid g2" style="margin-top:10px">
        <label class="lbl">Date<input class="field" name="date" type="date" value="${todayYmd()}" max="${todayYmd()}" /></label>
        <label class="lbl">Cost (UGX)<input class="field" name="costUgx" inputmode="numeric" placeholder="0" /></label>
      </div>
      ${fundSelect("passion")}
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
    <form class="card item form-card" data-form="sale" style="margin-top:14px">
      <p class="form-step">New sale</p>
      <div class="grid g2">
        <label class="lbl">Buyer<input class="field" name="buyer" required placeholder="Name or market" /></label>
        ${dateField("date", "Sale date")}
      </div>
      <div class="grid g2" style="margin-top:10px">
        <label class="lbl">Kg sold<input class="field" name="kg" required inputmode="decimal" placeholder="0" /></label>
        <label class="lbl">Total sale (UGX)<input class="field" name="amountUgx" required inputmode="numeric" placeholder="0" /></label>
      </div>
      <div class="grid g2" style="margin-top:10px">
        <label class="lbl">Amount received now (UGX)<input class="field" name="paidUgx" inputmode="numeric" placeholder="Leave empty if paid in full" /></label>
        <label class="lbl">Paid by<select class="field" name="payMethod">${methodOptions("cash")}</select></label>
      </div>
      <p class="form-step">Sale costs <span class="muted">(optional)</span></p>
      <div class="grid g2">
        <label class="lbl">Cost (UGX)<input class="field" name="expenseUgx" inputmode="numeric" placeholder="e.g. transport, sacks" /></label>
        <label class="lbl">What was it for<input class="field" name="expenseNote" /></label>
      </div>
      <button class="btn btn-passion wide" style="margin-top:14px">Save sale</button>
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

// ───────────── Dates ─────────────
function todayYmd() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dateField(name, labelText, opts) {
  const o = opts || {};
  return `<label class="lbl">${labelText || "Date"}<input class="field" type="date" name="${name || "date"}" ${o.optional ? "" : `value="${todayYmd()}" required`} ${o.future ? "" : `max="${todayYmd()}"`} ${o.min ? `min="${o.min}"` : ""} /></label>`;
}

// ───────────── Docs (per business) ─────────────
const DOC_TYPES = [["receipt", "Receipt"], ["invoice", "Invoice"], ["quotation", "Quotation"], ["contract", "Contract / agreement"], ["licence", "Licence / permit / insurance"], ["truck_papers", "Truck papers (logbook etc.)"], ["delivery", "Delivery note / weighbridge"], ["statement", "Bank / MoMo statement"], ["payslip", "Payslip / pay record"], ["other", "Other"]];
const DOC_EXPIRES = ["licence", "contract", "truck_papers"];
const DOC_HOME = { trucking: "#trucks-docs", sugarcane: "#cane-docs", passion: "#passion-docs" };
function docTypes(tag) {
  if (DATA && DATA.me && DATA.me.role === "driver") return DOC_TYPES.filter(([k]) => ["receipt", "delivery", "licence", "truck_papers", "other"].includes(k));
  return DOC_TYPES.filter(([k]) => k !== "truck_papers" || tag === "trucking");
}
const DOC_EXAMPLE = { trucking: "e.g. Shell fuel receipt", sugarcane: "e.g. Kakira mill weighbridge slip", passion: "e.g. Fertilizer receipt, Block B2" };
function docTypeName(k) { return (DOC_TYPES.find(([v]) => v === k) || [, "Other"])[1]; }
function autoDocs(tag) {
  // receipts and papers already captured elsewhere in the app
  const out = [];
  (DATA.disbursements || []).filter((f) => (f.tag || "trucking") === tag).forEach((f) => (f.usages || []).forEach((u) => {
    if (u.photo) out.push({ id: "au-" + u.id, auto: true, type: "receipt", title: catLabel(tag, u.category) + (u.payeeName ? " · " + u.payeeName : ""), date: u.date, amountUgx: u.amountUgx, party: u.payeeName, file: u.photo, source: "Advance spending" });
  }));
  if (tag === "trucking") {
    (DATA.fuelLogs || []).forEach((l) => { if (l.photo) out.push({ id: "af-" + l.id, auto: true, type: "receipt", title: "Fuel · " + (l.station || "station"), date: l.date, amountUgx: l.amountUgx, party: l.station, file: l.photo, source: "Fuel log" }); });
    (DATA.jobs || []).forEach((j) => {
      if (j.scaleTicket) out.push({ id: "as-" + j.id, auto: true, type: "delivery", title: "Weighbridge · Load " + (j.code || j.id), date: j.deliveredAt || j.startDate || "", file: j.scaleTicket, source: "Load" });
      if (j.invoice) out.push({ id: "ai-" + j.id, auto: true, type: "invoice", title: "Invoice · Load " + (j.code || j.id), date: j.invoicedAt || "", amountUgx: j.incomeUgx || j.rateUgx, file: j.invoice, source: "Load" });
    });
  }
  return out;
}
function docFromTeam(x) { return !x.auto && x.byRole && x.byRole !== "admin"; }
function docsWaiting(tag) { return (DATA.docs || []).filter((x) => (!tag || x.tag === tag) && docFromTeam(x) && !x.seenAt).length; }
function docCard(x) {
  const isPdf = /^data:application\/pdf|[?&]t=application%2Fpdf/.test(String(x.file || ""));
  const today = todayYmd(), in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const exp = x.expiry ? (x.expiry < today ? ["red", "Expired " + fmtDay(x.expiry)] : x.expiry <= in30 ? ["gold", "Expires " + fmtDay(x.expiry)] : ["green", "Valid to " + fmtDay(x.expiry)]) : null;
  const link = linkText(x);
  const canDel = !x.auto && (DATA.me.role === "admin" || x.byId === DATA.me.id) && !DATA.viewingAs;
  const office = DATA.me.role === "admin";
  const fresh = office && docFromTeam(x) && !x.seenAt;
  return `<div class="card doc-card ${fresh ? "flash" : ""}">
    <button type="button" class="doc-thumb js-open-doc" data-doc="${esc(x.id)}">${isPdf ? `<span class="pdf">PDF</span>` : `<img src="${x.file}" alt="" />`}</button>
    <div class="doc-info">
      <b>${esc(x.title)}</b>
      <div class="muted">${esc(docTypeName(x.type))} · ${fmtDay(x.date)}${x.number ? " · No. " + esc(x.number) : ""}</div>
      ${x.party || x.amountUgx ? `<div class="muted">${x.party ? esc(x.party) : ""}${x.party && x.amountUgx ? " · " : ""}${x.amountUgx ? ugx(x.amountUgx) : ""}</div>` : ""}
      ${link ? `<div class="muted">${esc(link)}</div>` : ""}
      ${office && docFromTeam(x) ? `<div class="muted">From ${esc(x.by || "team")} · ${whenShort(x.addedAt)}</div>` : ""}
      <div class="doc-tags">${exp ? `<span class="badge ${exp[0]}">${exp[1]}</span>` : ""}${x.auto ? `<span class="badge blue">${esc(x.source)}</span>` : ""}${fresh && !DATA.viewingAs ? `<button type="button" class="btn btn-primary btn-sm" data-act="seen_doc" data-id="${esc(x.id)}">Seen</button>` : ""}</div>
    </div>
    ${canDel ? `<button type="button" class="linkbtn js-del-doc" data-id="${esc(x.id)}" aria-label="Remove">✕</button>` : ""}
  </div>`;
}
function viewDocs(tag) {
  const typeF = sessionStorage.getItem("docType." + tag) || "";
  const q = (sessionStorage.getItem("docQ." + tag) || "").toLowerCase();
  const mine = (DATA.docs || []).filter((x) => x.tag === tag);
  const all = mine.concat(autoDocs(tag)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const list = all.filter((x) => (!typeF || x.type === typeF) && (!q || [x.title, x.party, x.number, x.note].join(" ").toLowerCase().includes(q)));
  const today = todayYmd(), in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const expiring = mine.filter((x) => x.expiry && x.expiry <= in30);
  const counts = {}; all.forEach((x) => { counts[x.type] = (counts[x.type] || 0) + 1; });
  window.__docs = Object.fromEntries(all.map((x) => [x.id, x]));
  const driver = DATA.me.role === "driver";
  const head = tag === "sugarcane" ? caneTabs("cane-docs") : tag === "passion" ? farmTabs("passion-docs") : "";
  return `${head}
    <h1>${driver ? "My docs" : { trucking: "Fleet", sugarcane: "Cane", passion: "Passion" }[tag] + " · Docs"}</h1>
    ${DATA.me.role !== "admin" ? `<p class="muted" style="margin-top:6px">What you add here goes straight to the office.</p>` : ""}
    ${expiring.length ? `<div class="card item req-box" style="margin-top:10px"><p class="eyebrow">Expiring or expired</p>${expiring.map((x) => `<div class="pay-line"><b>${esc(x.title)}</b><span class="badge ${x.expiry < today ? "red" : "gold"}">${x.expiry < today ? "Expired" : "Expires"} ${fmtDay(x.expiry)}</span></div>`).join("")}</div>` : ""}
    ${DATA.viewingAs ? "" : `<details class="card team-row" style="margin-top:10px" ${!all.length ? "open" : ""}>
      <summary><div class="avatar">＋</div><div style="flex:1"><b>Add a document</b></div></summary>
      <form data-form="doc" data-tag="${tag}" style="margin-top:12px">
        <div class="grid g2">
          <label class="lbl">Type<select class="field js-doc-type" name="type">${docTypes(tag).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
          <label class="lbl">Name<input class="field" name="title" required placeholder="${DOC_EXAMPLE[tag] || ""}" /></label>
        </div>
        <div class="grid g3" style="margin-top:10px">
          ${dateField("date", "Document date")}
          <label class="lbl">Amount (UGX)<input class="field" name="amountUgx" inputmode="numeric" placeholder="Optional" /></label>
          <label class="lbl">Doc number<input class="field" name="number" placeholder="Optional" /></label>
        </div>
        <div class="grid g2" style="margin-top:10px">
          <label class="lbl">Supplier / customer<input class="field" name="party" placeholder="Optional" /></label>
          <span class="js-doc-exp">${dateField("expiry", "Expiry date", { optional: true, future: true })}</span>
        </div>
        <div class="grid g2" style="margin-top:10px">
          ${tag === "trucking" && !driver ? `<label class="lbl">Truck<select class="field" name="truckId"><option value="">— None —</option>${(DATA.trucks || []).map((t) => `<option value="${esc(t.id)}">${esc(t.plate)}</option>`).join("")}</select></label>` : ""}
          ${linkSelect(tag)}
        </div>
        <label class="lbl" style="margin-top:10px">Photo or PDF<input class="field js-doc-file" type="file" accept="image/*,application/pdf" capture="environment" required /></label>
        <div class="thumbs js-doc-prev"></div>
        <label class="lbl" style="margin-top:10px">Note<input class="field" name="note" placeholder="Optional" /></label>
        <button class="btn btn-primary wide" style="margin-top:12px">Save document</button>
      </form>
    </details>`}
    <div class="doc-tools">
      <input class="field js-doc-q" placeholder="Search name, supplier, number" value="${esc(sessionStorage.getItem("docQ." + tag) || "")}" data-tag="${tag}" />
      <div class="seg seg-sm doc-seg"><button type="button" class="seg-btn ${!typeF ? "on" : ""}" data-doctype="" data-tag="${tag}">All ${all.length}</button>${docTypes(tag).filter(([k]) => counts[k]).map(([k, l]) => `<button type="button" class="seg-btn ${typeF === k ? "on" : ""}" data-doctype="${k}" data-tag="${tag}">${l.split(" ")[0].replace("/", "")} ${counts[k]}</button>`).join("")}</div>
    </div>
    <div class="list" style="margin-top:10px">${list.length ? list.map(docCard).join("") : `<div class="card item muted">No documents${typeF || q ? " match" : " yet"}.</div>`}</div>`;
}
function openDataUrl(url) {
  if (!String(url).startsWith("data:")) { window.open(url, "_blank", "noopener"); return; }
  try {
    const [head, b64] = String(url).split(",");
    const mime = (head.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const href = URL.createObjectURL(new Blob([arr], { type: mime }));
    const a = document.createElement("a"); a.href = href; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  } catch (e) { alert("Could not open this file."); }
}
function readDocFile(file) {
  return new Promise((resolve) => {
    if (/^image\//.test(file.type)) {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { const sc = Math.min(1, 1500 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", 0.72)); };
      img.onerror = () => resolve(""); img.src = url; return;
    }
    if (file.size > 1100000) { alert("This PDF is too big (over 1 MB). Take a photo of it instead."); resolve(""); return; }
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(""); r.readAsDataURL(file);
  });
}
function bindDocs() {
  document.querySelectorAll(".js-open-doc").forEach((b) => { b.onclick = () => { const x = (window.__docs || {})[b.dataset.doc]; if (x) openDataUrl(x.file); }; });
  document.querySelectorAll("[data-doctype]").forEach((b) => { b.onclick = () => { sessionStorage.setItem("docType." + b.dataset.tag, b.dataset.doctype); route(); }; });
  document.querySelectorAll(".js-doc-q").forEach((i) => { i.onchange = () => { sessionStorage.setItem("docQ." + i.dataset.tag, i.value); route(); }; });
  document.querySelectorAll(".js-del-doc").forEach((b) => { b.onclick = () => { if (confirm("Remove this document?")) act("delete_doc", { id: b.dataset.id }).catch(() => {}); }; });
  document.querySelectorAll("form[data-form=doc]").forEach((f) => {
    const t = f.querySelector(".js-doc-type"), e = f.querySelector(".js-doc-exp");
    const sync = () => { e.style.display = DOC_EXPIRES.includes(t.value) ? "" : "none"; };
    t.onchange = sync; sync();
    const inp = f.querySelector(".js-doc-file"), prev = f.querySelector(".js-doc-prev");
    inp.onchange = async () => {
      if (!inp.files[0]) return;
      const data = await readDocFile(inp.files[0]);
      inp.dataset.src = data; inp.dataset.name = inp.files[0].name; inp.dataset.mime = inp.files[0].type;
      prev.innerHTML = !data ? "" : data.startsWith("data:application/pdf") ? `<span class="pdf small">PDF · ${esc(inp.files[0].name)}</span>` : `<img src="${data}" alt="" />`;
    };
  });
}

// ───────────── Money › Flow: one ledger for every shilling ─────────────
const FLOW_TYPES = [["", "All"], ["income", "Income"], ["spending", "Spending"], ["advance", "Advances"], ["payroll", "Payroll"], ["return", "Returns"]];
function flowType(c, floats) {
  if (c.direction === "in") return c.category === "advance_return" ? "return" : "income";
  if (c.category === "employee_pay") return "payroll";
  if (c.refId && floats[c.refId]) return "advance";
  return "spending";
}
function periodRange(p) {
  const t = new Date(); t.setHours(12, 0, 0, 0);
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const today = ymd(t);
  if (p === "week") { const s = new Date(t); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return [ymd(s), today, "This week"]; }
  if (p === "month") return [today.slice(0, 8) + "01", today, "This month"];
  if (p === "lastmonth") { const s = new Date(t.getFullYear(), t.getMonth() - 1, 1, 12), e = new Date(t.getFullYear(), t.getMonth(), 0, 12); return [ymd(s), ymd(e), "Last month"]; }
  if (p === "quarter") { const s = new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1, 12); return [ymd(s), today, "This quarter"]; }
  if (p === "year") return [t.getFullYear() + "-01-01", today, "This year"];
  if (p === "custom") { const f = sessionStorage.getItem("flowFrom") || today.slice(0, 8) + "01", to = sessionStorage.getItem("flowTo") || today; return [f, to, fmtDay(f) + " – " + fmtDay(to)]; }
  return ["0000-00-00", "9999-99-99", "All time"];
}
function flowRows(biz, type, period, q) {
  const floats = Object.fromEntries((DATA.disbursements || []).map((f) => [f.id, f]));
  const [from, to] = periodRange(period);
  return (DATA.cash || []).map((c) => ({ ...c, _type: flowType(c, floats) }))
    .filter((c) => (!biz || c.tag === biz || (biz === "overhead" && !["trucking", "sugarcane", "passion"].includes(c.tag))) && (!type || c._type === type) && String(c.date || "") >= from && String(c.date || "") <= to)
    .filter((c) => !q || [c.note, c.payeeName, c.reference, catLabel(c.tag, c.category), cashRef(c)].join(" ").toLowerCase().includes(q))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function viewMoney(tag) {
  const period = sessionStorage.getItem("flowPeriod") || "month";
  const biz = tag !== undefined && tag !== null && tag !== "" ? tag : sessionStorage.getItem("flowBiz") || "";
  const type = sessionStorage.getItem("flowType") || "";
  const q = (sessionStorage.getItem("flowQ") || "").toLowerCase();
  const [from, to, plabel] = periodRange(period);
  const rows = flowRows(biz, type, period, q);
  const inn = rows.filter((c) => c.direction === "in").reduce((s, c) => s + (c.amountUgx || 0), 0);
  const out = rows.filter((c) => c.direction === "out").reduce((s, c) => s + (c.amountUgx || 0), 0);
  const bizRows = [["trucking", "Fleet"], ["sugarcane", "Cane"], ["passion", "Passion"], ["overhead", "Office"]].map(([k, n]) => {
    const r = flowRows(k, "", period, "");
    const i = r.filter((c) => c.direction === "in").reduce((s, c) => s + (c.amountUgx || 0), 0), o = r.filter((c) => c.direction === "out").reduce((s, c) => s + (c.amountUgx || 0), 0);
    return { k, n, i, o, net: i - o, count: r.length };
  }).filter((x) => x.count || x.k !== "overhead");
  // money held by people, owed to us, we owe
  const holding = (DATA.disbursements || []).filter((f) => f.status !== "closed" && advLeft(f).left > 0 && (!biz || f.tag === biz)).map((f) => { const p = recipientOf(f); return { who: p ? p.name : "—", tag: f.tag, amt: advLeft(f).left, date: f.date }; });
  const owedUs = [];
  if (!biz || biz === "trucking") (DATA.jobs || []).filter((j) => (["delivered", "invoiced"].includes(j.status) || j.invoice) && !isPaid(j)).forEach((j) => { const c = (DATA.contractors || []).find((x) => x.id === j.contractorId); owedUs.push({ what: "Load " + (j.code || j.id), who: c ? c.name : "", amt: j.incomeUgx || j.rateUgx || 0, tag: "trucking", date: j.deliveredAt || j.invoicedAt || "" }); });
  if (!biz || biz === "passion") (DATA.fruitSales || []).filter((s) => (s.amountUgx || 0) > (s.paidUgx || 0)).forEach((s) => owedUs.push({ what: "Fruit " + s.kg + " kg", who: s.buyer, amt: (s.amountUgx || 0) - (s.paidUgx || 0), tag: "passion", date: s.date }));
  (DATA.receivables || []).filter((r) => r.status === "open" && (!biz || r.tag === biz)).forEach((r) => owedUs.push({ what: r.note || "Receivable", who: "", amt: r.amountUgx, tag: r.tag, date: r.date }));
  const weOwe = [];
  if (!biz || biz === "sugarcane") (DATA.caneBuys || []).filter((b) => !b.sellerPaid && b.buyPriceUgx).forEach((b) => { const s = (DATA.sellers || []).find((x) => x.id === b.sellerId); weOwe.push({ what: "Cane seller · " + (b.location || ""), who: s ? s.name : "", amt: b.buyPriceUgx, tag: "sugarcane", date: b.date || "" }); });
  const payWait = [];
  if (typeof owedTo === "function") {
    const users = (DATA.users || []).filter((u) => u.active !== false);
    [["driver", DATA.drivers || [], "trucking"], ["cane", users.filter((u) => u.role === "cane_manager"), "sugarcane"], ["passion", users.filter((u) => u.role === "passion_manager"), "passion"]].forEach(([k, ppl, t]) => {
      if (biz && biz !== t) return;
      ppl.forEach((p) => { const w = owedTo(k, p, DATA.payStubs, DATA).waiting; if (w.length) payWait.push({ what: "Pay · " + w.length + " waiting", who: p.name, amt: w.reduce((s, x) => s + (x.amount || 0), 0), tag: t }); });
    });
  }
  (DATA.moneyRequests || []).filter((r) => (r.status === "open" || r.status === "partial") && (!biz || r.tag === biz)).forEach((r) => { const p = requesterOf(r); weOwe.push({ what: "Request · " + catLabel(r.tag, r.activity), who: p ? p.name : r.by, amt: reqLeft(r), tag: r.tag, date: r.date }); });
  const sum = (a) => a.reduce((s, x) => s + (x.amt || 0), 0);
  // group by day
  const days = []; let cur = null;
  rows.slice(0, Number(sessionStorage.getItem("flowShow") || 150)).forEach((c) => { if (!cur || cur.d !== c.date) { cur = { d: c.date, rows: [], i: 0, o: 0 }; days.push(cur); } cur.rows.push(c); if (c.direction === "in") cur.i += c.amountUgx || 0; else cur.o += c.amountUgx || 0; });
  const typeChip = { income: ["green", "Income"], spending: ["red", "Spending"], advance: ["gold", "Advance"], payroll: ["purple", "Payroll"], return: ["blue", "Return"] };
  const sideList = (title, arr, tone) => `<div class="card side-card"><div class="row" style="align-items:center"><b>${title}</b><b class="${tone}">${ugx(sum(arr))}</b></div>${arr.length ? arr.slice(0, 6).map((x) => `<div class="side-line"><span>${esc(x.who || x.what)}<span class="muted"> · ${esc(x.who ? x.what : BIZ_LABEL[x.tag] || "")}</span></span><b>${x.amt ? ugx(x.amt) : "—"}</b></div>`).join("") + (arr.length > 6 ? `<p class="muted">+${arr.length - 6} more</p>` : "") : `<p class="muted">Nothing</p>`}</div>`;
  return `
    <h1>Money · Flow</h1>
    <div class="flow-filters">
      <select class="field js-flow" data-k="flowPeriod" aria-label="Period">${[["week", "This week"], ["month", "This month"], ["lastmonth", "Last month"], ["quarter", "This quarter"], ["year", "This year"], ["all", "All time"], ["custom", "Custom dates"]].map(([k, l]) => `<option value="${k}" ${period === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      ${period === "custom" ? `<input class="field js-flow" type="date" data-k="flowFrom" value="${from}" /><input class="field js-flow" type="date" data-k="flowTo" value="${to}" />` : ""}
      <input class="field js-flow" data-k="flowQ" placeholder="Search" value="${esc(sessionStorage.getItem("flowQ") || "")}" />
    </div>
    <div class="seg seg-sm" style="margin-top:8px">${[["", "All"], ["trucking", "Fleet"], ["sugarcane", "Cane"], ["passion", "Passion"], ["overhead", "Office"]].map(([k, l]) => `<button type="button" class="seg-btn ${biz === k ? "on" : ""}" data-flowbiz="${k}">${l}</button>`).join("")}</div>
    <div class="seg seg-sm" style="margin-top:6px">${FLOW_TYPES.map(([k, l]) => `<button type="button" class="seg-btn ${type === k ? "on" : ""}" data-flowtype="${k}">${l}</button>`).join("")}</div>
    <div class="grid g3 kpi4" style="margin-top:12px">
      <div class="card kpi in-kpi"><span class="eyebrow">Money in</span><b>${ugx(inn)}</b></div>
      <div class="card kpi out-kpi"><span class="eyebrow">Money out</span><b>${ugx(out)}</b></div>
      <div class="card kpi gold"><span class="eyebrow">Net · ${esc(plabel)}</span><b class="${inn - out < 0 ? "neg" : "pos"}">${inn - out < 0 ? "−" : ""}${ugx(Math.abs(inn - out))}</b></div>
    </div>
    ${!biz ? `<div class="card biz-table"><table><thead><tr><th>UGX</th><th style="text-align:right">In</th><th style="text-align:right">Out</th><th style="text-align:right">Net</th></tr></thead><tbody>
      ${bizRows.map((x) => `<tr class="js-bizrow" data-flowbiz="${x.k}"><td><b>${x.n}</b></td><td class="num pos">${Number(x.i).toLocaleString("en-UG")}</td><td class="num neg">${Number(x.o).toLocaleString("en-UG")}</td><td class="num ${x.net < 0 ? "neg" : "pos"}"><b>${x.net < 0 ? "−" : ""}${Math.abs(x.net).toLocaleString("en-UG")}</b></td></tr>`).join("")}
    </tbody></table></div>` : ""}
    <div class="side-grid">
      ${sideList("Money with people", holding.map((h) => ({ who: h.who, what: "advance · " + (BIZ_LABEL[h.tag] || ""), amt: h.amt, tag: h.tag })), "gold-t")}
      ${sideList("Owed to us", owedUs, "pos")}
      ${sideList("We owe", weOwe.concat(payWait), "neg")}
    </div>
    <div class="row keep" style="margin-top:18px;align-items:center"><h2 style="margin:0">Transactions <span class="muted" style="font-size:14px">${rows.length}</span></h2><button type="button" class="btn btn-ghost btn-sm" id="flowPdf">⬇ Export PDF</button></div>
    ${days.length ? days.map((d) => `<div class="day-head"><b>${fmtDay(d.d)}</b><span>${d.i ? `<span class="pos">+${ugx(d.i)}</span>` : ""}${d.i && d.o ? " · " : ""}${d.o ? `<span class="neg">−${ugx(d.o)}</span>` : ""}</span></div>
      <div class="card ledger">${d.rows.map((c) => { const ch = typeChip[c._type]; const who = c.payeeName || ""; const how = (METHOD_LABEL[c.method] || label(c.method || "")) + (c.payeePhone ? " " + c.payeePhone : c.bankAccount ? " · " + (c.bankName || "") + " " + c.bankAccount : "") + (c.reference ? " · Ref " + c.reference : ""); const link = cashRef(c); return `<details class="led-row"><summary>
        <span class="badge ${ch[0]}">${ch[1]}</span>
        <span class="led-main"><b>${esc(c.direction === "in" ? (c.category === "advance_return" ? "Advance returned" : c.note || "Income") : catLabel(c.tag, c.category) || "Spend")}${who && !(c.direction === "in" && String(c.note || "").includes(who)) ? " · " + esc(who) : ""}</b><span class="muted">${esc(BIZ_LABEL[c.tag] || c.tag || "Office")}${link ? " · " + esc(link) : ""}</span></span>
        <b class="led-amt ${c.direction === "in" ? "pos" : "neg"}">${c.direction === "in" ? "+" : "−"}${ugx(c.amountUgx)}</b>
      </summary><div class="led-detail">
        ${c.note ? `<div><span class="muted">Note</span> ${esc(c.note)}</div>` : ""}
        <div><span class="muted">Method</span> ${esc(how || "—")}</div>
        ${c.by ? `<div><span class="muted">Recorded by</span> ${esc(c.by)}</div>` : ""}
        ${c._type === "advance" ? `<div><a href="${FUND_HOME[c.tag] || "#money-spend"}">See how it was spent ›</a></div>` : ""}
      </div></details>`; }).join("")}</div>`).join("") : `<div class="card item muted" style="margin-top:8px">No money movements for ${esc(plabel.toLowerCase())}.</div>`}
    ${rows.length > Number(sessionStorage.getItem("flowShow") || 150) ? `<button type="button" class="btn btn-ghost wide" id="flowMore" style="margin-top:10px">Show more</button>` : ""}`;
}
function bindFlow() {
  document.querySelectorAll(".js-flow").forEach((el) => { el.onchange = () => { sessionStorage.setItem(el.dataset.k, el.value); sessionStorage.removeItem("flowShow"); route(); }; });
  document.querySelectorAll("[data-flowbiz]").forEach((b) => { b.onclick = () => { sessionStorage.setItem("flowBiz", b.dataset.flowbiz); if (location.hash !== "#money") location.hash = "#money"; else route(); }; });
  document.querySelectorAll("[data-flowtype]").forEach((b) => { b.onclick = () => { sessionStorage.setItem("flowType", b.dataset.flowtype); route(); }; });
  const more = document.getElementById("flowMore"); if (more) more.onclick = () => { sessionStorage.setItem("flowShow", String(Number(sessionStorage.getItem("flowShow") || 150) + 300)); route(); };
  const pdf = document.getElementById("flowPdf");
  if (pdf) pdf.onclick = async () => {
    const label0 = pdf.textContent; pdf.disabled = true; pdf.textContent = "Making PDF…";
    try { await moneyPdf(); } catch (e) { alert("Couldn't make the PDF. Check the connection and try again."); }
    pdf.disabled = false; pdf.textContent = label0;
  };
}
function loadScript(src) {
  return new Promise((ok, bad) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
}
// Money › Flow as a PDF report: the same rows the page shows (business, type, period, search)
async function moneyPdf() {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  const period = sessionStorage.getItem("flowPeriod") || "month";
  const biz = sessionStorage.getItem("flowBiz") || "", type = sessionStorage.getItem("flowType") || "", q = (sessionStorage.getItem("flowQ") || "").toLowerCase();
  const rows = flowRows(biz, type, period, q).slice().reverse();
  const [from, to] = periodRange(period);
  const sum = (dir) => rows.filter((c) => c.direction === dir).reduce((s, c) => s + (Number(c.amountUgx) || 0), 0);
  const tin = sum("in"), tout = sum("out");
  const n = (v) => Math.round(Number(v) || 0).toLocaleString("en-UG");
  const day = (d) => { try { return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return d; } };
  const range = from === "0000-00-00" ? "All time" : day(from) + " to " + day(to === "9999-99-99" ? todayYmd() : to);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let logo = null;
  try { logo = await new Promise((ok) => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = 120; c.height = 120; c.getContext("2d").drawImage(img, 0, 0, 120, 120); ok(c.toDataURL("image/png")); }; img.onerror = () => ok(null); img.src = "./logo-mark.png"; }); } catch (e) {}
  doc.setFillColor(16, 36, 63); doc.rect(0, 0, W, 70, "F");
  if (logo) doc.addImage(logo, "PNG", 36, 15, 40, 40);
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("Conacrew Logistics", logo ? 86 : 36, 36);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.text("Money report", logo ? 86 : 36, 54);
  doc.setFontSize(10); doc.text(range, W - 36, 36, { align: "right" });
  doc.text([biz ? BIZ_LABEL[biz] || biz : "All businesses", type ? "Only: " + type : "", q ? 'Search: "' + q + '"' : ""].filter(Boolean).join("   |   "), W - 36, 54, { align: "right" });
  // totals
  const boxes = [["Money in", tin, [31, 138, 76]], ["Money out", tout, [179, 38, 30]], ["Net", tin - tout, [16, 36, 63]]];
  boxes.forEach(([t, v, col], i) => {
    const x = 36 + i * 180;
    doc.setDrawColor(211, 221, 231); doc.roundedRect(x, 86, 168, 48, 6, 6, "S");
    doc.setTextColor(74, 93, 117); doc.setFontSize(9); doc.text(t, x + 12, 102);
    doc.setTextColor(...col); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("UGX " + n(v), x + 12, 124); doc.setFont("helvetica", "normal");
  });
  doc.setTextColor(74, 93, 117); doc.setFontSize(9); doc.text(rows.length + " transactions", W - 36, 124, { align: "right" });
  doc.autoTable({
    startY: 150,
    head: [["Date", "Business", "Type", "Category", "Paid to / from", "Method", "Reference", "Linked to", "In (UGX)", "Out (UGX)"]],
    body: rows.map((c) => [day(c.date), BIZ_LABEL[c.tag] || c.tag || "", String(c._type || "").replace(/^./, (x) => x.toUpperCase()), catLabel(c.tag, c.category) || c.note || "", [c.payeeName, c.payeePhone || ((c.bankName || "") + " " + (c.bankAccount || "")).trim()].filter(Boolean).join("\n"), METHOD_LABEL[c.method] || c.method || "", c.reference || "", cashRef(c) || "", c.direction === "in" ? n(c.amountUgx) : "", c.direction === "out" ? n(c.amountUgx) : ""]),
    foot: [["", "", "", "", "", "", "", "Total", n(tin), n(tout)]],
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: [16, 36, 63], lineColor: [211, 221, 231], lineWidth: 0.4 },
    headStyles: { fillColor: [16, 36, 63], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [234, 241, 247], textColor: [16, 36, 63], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 250, 252] },
    columnStyles: { 0: { cellWidth: 62 }, 8: { halign: "right", cellWidth: 70 }, 9: { halign: "right", cellWidth: 70 } },
    margin: { left: 36, right: 36 },
    didParseCell: (d) => { if (d.column.index >= 8) d.cell.styles.halign = "right"; if (typeof d.cell.text === "object") d.cell.text = d.cell.text.map((x) => String(x).replace(/·/g, "-").replace(/›/g, ">")); },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(120, 135, 155);
      doc.text("Made " + new Date().toLocaleString("en-GB") + " by " + (DATA.me.name || ""), 36, H - 18);
      doc.text("Page " + doc.internal.getNumberOfPages(), W - 36, H - 18, { align: "right" });
    },
  });
  doc.save(`conacrew-money-${from === "0000-00-00" ? "all" : from}-to-${to === "9999-99-99" ? todayYmd() : to}.pdf`);
}

// ───────────── Admin Home: what needs you today ─────────────
function viewHome() {
  const now = new Date();
  const hr = now.getHours();
  const hello = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const req = { trucking: openRequests("trucking").length, sugarcane: openRequests("sugarcane").length, passion: openRequests("passion").length };
  const replies = (DATA.fleetTasks || []).filter((t) => t.status === "done").length;
  const phones = DATA.me.assistant ? 0 : phonesWaiting();
  const payN = payWaiting(), issN = issuesWaiting();
  const attn = [];
  [["trucking", "Fleet"], ["sugarcane", "Cane"], ["passion", "Passion"]].forEach(([t, n]) => { if (req[t]) attn.push([FUND_HOME[t], "gold", `${req[t]} money request${req[t] > 1 ? "s" : ""}`, n]); });
  if (replies) attn.push(["#trucks-work", "blue", `${replies} task repl${replies > 1 ? "ies" : "y"} to check`, "Fleet"]);
  [["trucking", "Fleet", "#trucks-docs"], ["sugarcane", "Cane", "#cane-docs"], ["passion", "Passion", "#passion-docs"]].forEach(([t, n, h]) => { const d = docsWaiting(t); if (d) attn.push([h, "blue", `${d} new document${d > 1 ? "s" : ""} from the team`, n]); });
  fuelAlerts().forEach(({ r, v }) => attn.push(["#trucks-profit", "red", `${r.t.plate} bought ${v.pct - 100}% more fuel than its loads need`, "Fleet"]));
  if (issN) attn.push(["#trucks-issues", "red", `${issN} driver issue${issN > 1 ? "s" : ""} to answer`, "Fleet"]);
  if (phones) attn.push(["#team", "gold", `${phones} new phone${phones > 1 ? "s" : ""} to approve`, "Team"]);
  const bkN = bookingsWaiting().length;
  if (bkN) attn.push(["#trucks-book", "gold", `${bkN} client booking${bkN > 1 ? "s" : ""} to answer`, "Fleet"]);
  if (payN) attn.push(["#money-pay", "purple", `${payN} payment${payN > 1 ? "s" : ""} waiting`, "Payroll"]);
  (DATA.alerts || []).forEach((a) => attn.push([a.href || "#trucks", a.tone === "bad" ? "red" : "gold", a.text, ""]));
  const [mFrom] = periodRange("month");
  const mRows = (DATA.cash || []).filter((c) => String(c.date || "") >= mFrom);
  const mIn = mRows.filter((c) => c.direction === "in").reduce((s, c) => s + (c.amountUgx || 0), 0);
  const mOut = mRows.filter((c) => c.direction === "out").reduce((s, c) => s + (c.amountUgx || 0), 0);
  const bizNet = (t) => mRows.filter((c) => c.tag === t).reduce((s, c) => s + (c.direction === "in" ? 1 : -1) * (c.amountUgx || 0), 0);
  const trucks = DATA.trucks || [];
  const openLoads = (DATA.jobs || []).filter((j) => !isPaid(j)).length;
  const unpaidLoads = (DATA.jobs || []).filter((j) => ["delivered", "invoiced"].includes(j.status) && !isPaid(j)).reduce((s, j) => s + (j.incomeUgx || j.rateUgx || 0), 0);
  const caneMoving = (DATA.caneBuys || []).filter((b) => ["cutting", "loading", "in_transit"].includes(b.status)).length;
  const caneSalesM = (DATA.caneSales || []).filter((s) => String(s.date) >= mFrom).reduce((s, x) => s + (x.amountUgx || 0), 0);
  const owedSellers = (DATA.caneBuys || []).filter((b) => !b.sellerPaid).reduce((s, b) => s + (b.buyPriceUgx || 0), 0);
  const fruitM = (DATA.fruitSales || []).filter((s) => String(s.date) >= mFrom);
  const net = (n) => `<b class="${n < 0 ? "neg" : "pos"}">${n < 0 ? "−" : ""}${ugx(Math.abs(n))}</b>`;
  return `
    <div class="hello"><h1>${hello}, ${esc((DATA.me.name || "").split(" ")[0])}</h1><span class="muted">${now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</span></div>
    <div class="card attn-card-list">
      <div class="row" style="align-items:center"><b>Needs you</b><span class="badge ${attn.length ? "gold" : "green"}">${attn.length || "All clear"}</span></div>
      ${attn.length ? attn.slice(0, 10).map(([h, tone, text, where]) => `<a class="attn-line" href="${h}"><span class="dot ${tone}"></span><span class="t">${esc(text)}</span>${where ? `<span class="muted">${where}</span>` : ""}<span class="chev">›</span></a>`).join("") : `<p class="muted" style="margin-top:6px">Nothing waiting on you.</p>`}
    </div>
    <a class="card month-card" href="#money"><div class="row" style="align-items:center"><b>This month</b><span class="muted">Flow ›</span></div>
      <div class="grid g3 kpi4 mini-kpis"><div><span>In</span><b class="pos">${ugx(mIn)}</b></div><div><span>Out</span><b class="neg">${ugx(mOut)}</b></div><div><span>Net</span>${net(mIn - mOut)}</div></div>
    </a>
    <div class="biz-cards">
      <a class="card biz-card fleet" href="#trucks"><div class="row"><b>Fleet</b>${net(bizNet("trucking"))}</div>
        <div class="biz-stats"><span><b>${trucks.filter((t) => t.status === "on_trip").length}</b> on the road</span><span><b>${trucks.filter((t) => t.status === "idle").length}</b> idle</span><span><b>${trucks.filter((t) => t.status === "workshop").length}</b> workshop</span></div>
        <div class="muted">${openLoads} open load${openLoads === 1 ? "" : "s"}${unpaidLoads ? " · " + ugx(unpaidLoads) + " to collect" : ""}</div></a>
      <a class="card biz-card cane" href="#cane"><div class="row"><b>Cane</b>${net(bizNet("sugarcane"))}</div>
        <div class="biz-stats"><span><b>${caneMoving}</b> moving</span><span><b>${(DATA.caneBuys || []).length}</b> buys</span></div>
        <div class="muted">Sales this month ${ugx(caneSalesM)}${owedSellers ? " · owe sellers " + ugx(owedSellers) : ""}</div></a>
      <a class="card biz-card passion" href="#passion"><div class="row"><b>Passion</b>${net(bizNet("passion"))}</div>
        <div class="biz-stats"><span><b>${Number(DATA.stockKg || 0).toLocaleString()}</b> kg in stock</span><span><b>${fruitM.reduce((s, x) => s + (x.kg || 0), 0).toLocaleString()}</b> kg sold</span></div>
        <div class="muted">Sales this month ${ugx(fruitM.reduce((s, x) => s + (x.amountUgx || 0), 0))}</div></a>
    </div>
    <div class="quick">
      <a class="btn btn-ghost" href="#trucks-work">＋ Task</a><a class="btn btn-ghost" href="#trucks-new">＋ Load</a><a class="btn btn-ghost" href="#money-spend">＋ Expense</a><a class="btn btn-ghost" href="#trucks-docs">＋ Doc</a>${DATA.me.assistant ? "" : `<a class="btn btn-ghost" href="#team">Team</a>`}
    </div>`;
}

// ───────────── Consistent look for older forms + page titles ─────────────
function enhanceFields(root) {
  // older forms used grey placeholder text only; give every field a visible label
  (root || document).querySelectorAll("#app input.field[placeholder], #app textarea.field[placeholder]").forEach((el) => {
    if (el.closest("label") || el.type === "hidden" || el.dataset.nolabel || el.classList.contains("js-doc-q") || el.classList.contains("js-flow")) return;
    if (el.previousElementSibling && el.previousElementSibling.classList && el.previousElementSibling.classList.contains("auto-lbl")) return;
    const text = el.getAttribute("placeholder").replace(/\s*\(optional[^)]*\)/i, "").replace(/ if known$/i, "");
    const lab = document.createElement("label"); lab.className = "lbl auto"; lab.textContent = text;
    const mt = el.style.marginTop; el.style.marginTop = ""; lab.style.marginTop = mt || "";
    el.parentNode.insertBefore(lab, el); lab.appendChild(el);
    if (!/e\.g\./i.test(el.placeholder)) el.placeholder = /optional/i.test(el.getAttribute("placeholder")) ? "Optional" : "";
  });
  (root || document).querySelectorAll("#app select.field[aria-label]").forEach((el) => {
    if (el.closest("label") || el.classList.contains("js-flow") || el.classList.contains("js-pagepick") || el.classList.contains("js-tripset")) return;
    const lab = document.createElement("label"); lab.className = "lbl auto"; lab.textContent = el.getAttribute("aria-label");
    const mt = el.style.marginTop; el.style.marginTop = ""; lab.style.marginTop = mt || "";
    el.parentNode.insertBefore(lab, el); lab.appendChild(el);
  });
}
function fixPageTitle() {
  const h1 = document.querySelector("#app h1");
  const on = document.querySelector(".admin-nav .sub a.on, .page-links a.on");
  if (!h1 || !on) return;
  const biz = h1.textContent.trim();
  if (!["Fleet", "Cane", "Passion", "Money", "Home"].includes(biz)) return;
  const sub = on.childNodes[0] ? on.childNodes[0].textContent.trim() : on.textContent.trim();
  if (sub && sub !== biz) h1.textContent = biz + " · " + sub;
}

// ───────────── Money: Spend + Payroll ─────────────
function moneyTabs(on) {
  return tabMenu([
    ["#money", "Flow", "money"],
    ["#money-spend", "Expenses", "money-spend"],
    ["#money-pay", "Pay", "money-pay"],
  ], on);
}
function cashRef(c) {
  const bits = [];
  if (c.truckId) { const t = (DATA.trucks || []).find((x) => x.id === c.truckId); if (t) bits.push(t.plate); }
  if (c.jobId) { const j = (DATA.jobs || []).find((x) => x.id === c.jobId); if (j) bits.push("Load " + (j.code || j.id) + (j.bookingRef ? " (" + j.bookingRef + ")" : "")); }
  else if (c.bookingId) { const bk = (DATA.bookings || []).find((x) => x.id === c.bookingId); if (bk) bits.push("Booking " + bk.ref); }
  if (c.caneBuyId) { const b = (DATA.caneBuys || []).find((x) => x.id === c.caneBuyId); bits.push(b ? "Cane buy · " + (b.location || b.id) : c.caneBuyId); }
  if (c.blockId) bits.push("Block " + c.blockId);
  return bits.join(" · ");
}
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
const PAY_METHODS = [["cash", "Cash"], ["mtn_momo", "MTN MoMo"], ["airtel_money", "Airtel Money"], ["bank", "Bank transfer"]];
function methodOptions(sel) { return PAY_METHODS.map(([k, l]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${l}</option>`).join(""); }
// a bottom sheet for a short form (payment received, payment sent)
function openSheet({ title, sub, body, submit, onSubmit }) {
  closeSheet();
  const wrap = document.createElement("div");
  wrap.className = "sheet-wrap"; wrap.id = "sheet";
  wrap.innerHTML = `<form class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head"><div><b>${esc(title)}</b>${sub ? `<div class="muted">${sub}</div>` : ""}</div><button type="button" class="icon-x js-sheet-x" aria-label="Close">✕</button></div>
    <div class="sheet-body">${body}</div>
    <p class="err js-sheet-err" role="alert"></p>
    <button class="btn btn-primary wide">${esc(submit || "Save")}</button>
  </form>`;
  document.body.appendChild(wrap);
  document.body.classList.add("sheet-open");
  const form = wrap.querySelector("form");
  wrap.onclick = (e) => { if (e.target === wrap) closeSheet(); };
  wrap.querySelector(".js-sheet-x").onclick = closeSheet;
  const m = form.querySelector("[name=method]"), refBox = form.querySelector(".js-ref");
  if (m && refBox) { const s = () => { refBox.hidden = m.value === "cash"; }; m.onchange = s; s(); }
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    try { await onSubmit(fd); closeSheet(); } catch (err) { form.querySelector(".js-sheet-err").textContent = err.message || "Could not save"; }
  };
  setTimeout(() => { const f = form.querySelector("input:not([type=hidden]),select"); if (f) f.focus(); }, 50);
}
function closeSheet() { const s = document.getElementById("sheet"); if (s) s.remove(); document.body.classList.remove("sheet-open"); }
function payFields(amount, opts) {
  const o = opts || {};
  return `<label class="lbl">Amount (UGX)<input class="field" name="amountUgx" inputmode="numeric" required value="${amount || ""}" ${o.fixed ? "readonly" : ""} /></label>
    <label class="lbl">${o.methodLabel || "Paid by"}<select class="field" name="method">${methodOptions(o.method || "cash")}</select></label>
    <label class="lbl js-ref">Transaction ID / reference<input class="field" name="reference" maxlength="60" placeholder="From the SMS or bank slip" /></label>
    <label class="lbl">Date<input class="field" type="date" name="date" required value="${todayYmd()}" max="${todayYmd()}" /></label>`;
}
function jobReceived(j) { return (DATA.cash || []).filter((c) => c.direction === "in" && (c.jobId === j.id || c.refId === j.id) && c.category !== "advance_return").reduce((s, c) => s + (Number(c.amountUgx) || 0), 0); }
function openJobPaid(id) {
  const j = (DATA.jobs || []).find((x) => x.id === id); if (!j) return;
  const total = j.incomeUgx || j.rateUgx || 0, got = jobReceived(j), left = Math.max(0, total - got);
  const c = (DATA.contractors || []).find((x) => x.id === j.contractorId);
  openSheet({
    title: "Client paid · " + (j.code || "Load"),
    sub: esc((c ? c.name + " · " : "") + (j.cargo || "")) + (got ? ` · ${ugx(got)} already in` : ""),
    body: payFields(left || total),
    submit: "Mark load paid",
    onSubmit: (fd) => {
      const amt = Number(String(fd.amountUgx).replace(/[^\d]/g, ""));
      if (!amt) throw new Error("Enter the amount received");
      return act("mark_job_paid", { id: j.id, paidUgx: got + amt, method: fd.method, reference: fd.reference, paidAt: fd.date });
    },
  });
}
function openSellerPaid(id) {
  const b = (DATA.caneBuys || []).find((x) => x.id === id); if (!b) return;
  const s = (DATA.sellers || []).find((x) => x.id === b.sellerId);
  openSheet({
    title: "Pay cane seller", sub: esc((s ? s.name + " · " : "") + (b.location || "")),
    body: payFields(b.buyPriceUgx, { fixed: true, methodLabel: "Paid with", method: s && s.phone ? "mtn_momo" : "cash" }),
    submit: "Save payment",
    onSubmit: (fd) => act("pay_seller", { id: b.id, method: fd.method, reference: fd.reference, date: fd.date }),
  });
}
const METHOD_LABEL = { cash: "Cash", mtn_momo: "MTN MoMo", airtel_money: "Airtel Money", bank: "Bank transfer", mobile_money: "Mobile money", invoice: "Invoice" };
const BIZ_LABEL = { trucking: "Fleet", sugarcane: "Cane", passion: "Passion", overhead: "Overhead" };
function methodText(r) {
  const m = METHOD_LABEL[r.method] || label(r.method || "") || "—";
  if (r.method === "bank") return m + (r.bankName || r.bankAccount ? `<div class="muted">${esc(r.bankName)} · ${esc(r.bankAccount)}</div>` : "");
  const num = r.payeePhone || (r.method !== "cash" ? r.phone : "");
  return m + (num ? `<div class="muted">${esc(num)}</div>` : "");
}
function fmtDay(d) {
  if (!d) return "";
  const x = new Date(String(d).slice(0, 10) + "T12:00:00");
  return isNaN(x) ? esc(d) : x.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}
function monthName(ym) {
  return new Date(ym + "-15T12:00:00").toLocaleDateString([], { month: "long", year: "numeric" });
}
function ytdPaid(list) {
  return paySums(list).ytd;
}

// A stub counts as money actually sent only if the payroll recorded how it was paid.
// (Older versions auto-marked driver pay as "paid" when a customer paid a load.)
function realPaid(s) {
  return s && s.status === "paid" && !!(s.method || s.paidVia);
}
function paySums(stubs) {
  const today = new Date();
  const wk = new Date(today); wk.setHours(0, 0, 0, 0); wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7));
  const wkKey = wk.getFullYear() + "-" + String(wk.getMonth() + 1).padStart(2, "0") + "-" + String(wk.getDate()).padStart(2, "0");
  const mKey = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
  const yKey = String(today.getFullYear());
  const out = { week: 0, month: 0, ytd: 0 };
  (stubs || []).filter(realPaid).forEach((s) => {
    const d = String(s.paidAt || "");
    const a = Number(s.amountUgx) || 0;
    if (d >= wkKey) out.week += a;
    if (d.startsWith(mKey)) out.month += a;
    if (d.startsWith(yKey)) out.ytd += a;
  });
  return out;
}
function thisMonth(offset) {
  const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() + (offset || 0));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

// ---- who is owed what ----
function driverPlan(d) {
  const p = d.payPlan || d.payType || "trip";
  return ["trip", "month", "both"].includes(p) ? p : "trip";
}
function planText(kind, p) {
  if (kind === "driver") {
    const plan = driverPlan(p);
    const trip = p.tripAllowanceUgx ? ugx(p.tripAllowanceUgx) + " per delivered load" : "per delivered load";
    const month = p.monthRateUgx ? ugx(p.monthRateUgx) + " a month" : "monthly";
    return plan === "trip" ? "Trip allowance · " + trip : plan === "month" ? "Monthly salary · " + month : "Salary " + month + " + trip allowance " + trip;
  }
  if (kind === "cane") return "Paid per delivered trip" + (p.perTripUgx ? " · " + ugx(p.perTripUgx) : "");
  if (p.perSalePct) return "Paid per sale · " + p.perSalePct + "% of each sale";
  return "Paid per sale" + (p.perSaleUgx ? " · " + ugx(p.perSaleUgx) : "");
}
function payoutText(p) {
  const m = p.payMethod;
  if (!m) return `<span class="muted">No payout details yet</span>`;
  const who = p.accountName ? " · " + esc(p.accountName) : "";
  if (m === "bank") return `${METHOD_LABEL.bank} · ${esc(p.bankName || "")} ${esc(p.bankAccount || "")}${who}`;
  return `${METHOD_LABEL[m] || label(m)}${p.payPhone ? " · " + esc(p.payPhone) : ""}${who}`;
}
function deliveredOn(j) {
  return j.deliveredAt || (j.dropAt || "").slice(0, 10) || j.paidAt || j.startDate || "";
}
// Returns { waiting: [...], paid: [...] } for one worker.
function owedTo(kind, person, stubs, src) {
  const mine = (stubs || []).filter((s) => s.personId === person.id);
  const paidRef = (refId, k) => mine.some((s) => realPaid(s) && s.refId === refId && (!k || s.kind === k || (k === "trip" && !s.kind)));
  const waiting = [];
  if (kind === "driver") {
    const plan = driverPlan(person);
    if (plan !== "month") {
      (src.jobs || []).filter((j) => j.driverId === person.id && (["delivered", "invoiced", "paid"].includes(j.status) || isPaid(j)))
        .forEach((j) => {
          if (paidRef(j.id, "trip")) return;
          waiting.push({ kind: "trip", refId: j.id, title: "Load " + (j.code || j.id), sub: [j.cargo, (j.origin || "") + " → " + (j.destination || "")].filter(Boolean).join(" · "), date: deliveredOn(j), amount: Number(person.tripAllowanceUgx) || 0 });
        });
    }
    if (plan !== "trip") {
      [thisMonth(-1), thisMonth(0)].forEach((ym) => {
        if (paidRef(ym, "month")) return;
        waiting.push({ kind: "month", refId: ym, title: "Salary · " + monthName(ym), sub: ym === thisMonth(0) ? "This month" : "Last month", date: "", amount: Number(person.monthRateUgx) || 0 });
      });
    }
  } else if (kind === "cane") {
    (src.caneSales || []).forEach((s) => {
      if (s.byUserId && s.byUserId !== person.id) return;
      if (paidRef(s.id)) return;
      waiting.push({ kind: "cane_trip", refId: s.id, title: "Delivered trip · " + (s.tonnes || 0) + " t", sub: "Mill sale " + ugx(s.amountUgx || 0) + (s.note ? " · " + s.note : ""), date: s.date, amount: Number(person.perTripUgx) || 0 });
    });
  } else {
    (src.fruitSales || []).forEach((s) => {
      if (paidRef(s.id)) return;
      const amt = person.perSalePct ? Math.round((Number(s.amountUgx) || 0) * Number(person.perSalePct) / 100) : Number(person.perSaleUgx) || 0;
      waiting.push({ kind: "sale", refId: s.id, title: "Sale · " + (s.kg || 0) + " kg", sub: (s.buyer || "Buyer") + " · " + ugx(s.amountUgx || 0), date: s.date, amount: amt });
    });
  }
  waiting.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const paid = mine.filter(realPaid).sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
  return { waiting, paid, sums: paySums(mine) };
}

// ---- shared form parts ----
function payeeFields(prefix, v, opts) {
  v = v || {};
  const m = v.method || "mtn_momo";
  const req = opts && opts.required !== false;
  return `
    <div class="pay-fields js-payee" data-prefix="${prefix}">
      <div class="grid g2">
        <label class="lbl">Paid to (full name)<input class="field" name="payeeName" ${req ? "required" : ""} value="${esc(v.name || "")}" /></label>
        <label class="lbl">Method<select class="field js-method" name="method">
          ${["mtn_momo", "airtel_money", "bank", "cash"].map((k) => `<option value="${k}" ${m === k ? "selected" : ""}>${METHOD_LABEL[k]}</option>`).join("")}
        </select></label>
      </div>
      <div class="grid g2 js-if-mobile" style="margin-top:10px">
        <label class="lbl">Mobile money number<input class="field" name="payeePhone" inputmode="tel" placeholder="07XX XXX XXX" value="${esc(v.phone || "")}" /></label>
        <label class="lbl">Transaction ID (optional)<input class="field" name="reference" placeholder="From the MoMo SMS" value="" /></label>
      </div>
      <div class="grid g3 js-if-bank" style="margin-top:10px">
        <label class="lbl">Bank<input class="field" name="bankName" placeholder="e.g. Stanbic, Centenary" value="${esc(v.bankName || "")}" /></label>
        <label class="lbl">Account number<input class="field" name="bankAccount" inputmode="numeric" placeholder="Account number" value="${esc(v.bankAccount || "")}" /></label>
        <label class="lbl">Bank reference (optional)<input class="field" name="reference" placeholder="Transfer reference" value="" /></label>
      </div>
      <div class="grid g2 js-if-cash" style="margin-top:10px">
        <label class="lbl">Phone (optional)<input class="field" name="payeePhone" inputmode="tel" placeholder="Contact number" value="${esc(v.phone || "")}" /></label>
        <label class="lbl">Receipt no. (optional)<input class="field" name="reference" placeholder="Receipt number" value="" /></label>
      </div>
    </div>`;
}
// Shows only the inputs for the chosen method and disables the rest so they aren't submitted.
function bindPayee(root) {
  (root || document).querySelectorAll(".js-payee").forEach((box) => {
    const sel = box.querySelector(".js-method");
    const sync = () => {
      const m = sel.value;
      const show = { ".js-if-mobile": m === "mtn_momo" || m === "airtel_money", ".js-if-bank": m === "bank", ".js-if-cash": m === "cash" };
      Object.entries(show).forEach(([cls, on]) => {
        const el = box.querySelector(cls);
        if (!el) return;
        el.style.display = on ? "" : "none";
        el.querySelectorAll("input").forEach((i) => { i.disabled = !on; });
      });
      const ph = box.querySelector(".js-if-mobile [name=payeePhone]");
      if (ph) ph.required = show[".js-if-mobile"];
      box.querySelectorAll(".js-if-bank [name=bankName], .js-if-bank [name=bankAccount]").forEach((i) => { i.required = show[".js-if-bank"]; });
    };
    sel.onchange = sync;
    sync();
  });
}
function profilePayee(p) {
  return { name: p.accountName || p.name || "", method: p.payMethod || "mtn_momo", phone: p.payPhone || p.phone || "", bankName: p.bankName || "", bankAccount: p.bankAccount || "" };
}

// ───────────── Spend: requests → advance → confirm → allocate (all businesses) ─────────────
const FUND_FOR = {
  trucking: [["diesel", "Diesel / fuel"], ["parts", "Spare parts"], ["workshop", "Workshop & repairs"], ["tyres", "Tyres"], ["papers", "Insurance, licence & papers"], ["road", "Road fees & permits"], ["labour", "Loading / offloading labour"], ["trip", "Food & lodging on trip"], ["other", "Other"]],
  sugarcane: [["buy", "Pay cane seller"], ["cut", "Cutting labour"], ["load", "Loading labour"], ["transport", "Transport"], ["fuel", "Fuel"], ["labour", "Other labour"], ["other", "Other"]],
  passion: [["harvest", "Harvest labour"], ["prune", "Pruning labour"], ["spray", "Spraying"], ["weed", "Weeding"], ["fertilize", "Fertilizer"], ["inputs", "Seedlings & farm inputs"], ["transport", "Transport"], ["other", "Other"]],
};
const ADVANCE_FOR = FUND_FOR.trucking;
const SPEND_CATS = FUND_FOR;
const FUND_HOME = { trucking: "#trucks-spend", sugarcane: "#cane-spend", passion: "#passion-spend" };
const WORKER_HOME = { trucking: "#drive-money", sugarcane: "#cane-spend", passion: "#passion-spend" };
function catLabel(tag, key) {
  const hit = (FUND_FOR[tag] || []).find(([k]) => k === key) || Object.values(FUND_FOR).flat().find(([k]) => k === key);
  if (hit) return hit[1];
  return { load_income: "Load income", employee_pay: "Employee pay", to_driver: "Driver advance", advance_return: "Advance returned", food: "Food", toll: "Toll", fuel: "Fuel" }[key] || (key ? label(key) : "");
}
function openRequests(tag) {
  return (DATA.moneyRequests || []).filter((r) => r.tag === tag && (r.status === "open" || r.status === "partial"));
}
function toConfirm(tag) {
  return (DATA.disbursements || []).filter((f) => (f.tag || "trucking") === tag && f.status === "sent");
}
function advLeft(f) {
  const used = (f.usages || []).reduce((s, u) => s + (u.amountUgx || 0), 0);
  return { used, left: Math.max(0, (f.amountUgx || 0) - used - (f.returnedUgx || 0)), back: f.returnedUgx || 0 };
}
function recipientOf(f) {
  if (f.toDriverId) return (DATA.drivers || []).find((x) => x.id === f.toDriverId) || (DATA.driver && DATA.driver.id === f.toDriverId ? { ...DATA.driver, name: DATA.me.name } : null);
  return (DATA.users || []).find((u) => u.id === f.toUserId) || (DATA.me && DATA.me.id === f.toUserId ? DATA.me : null);
}
function requesterOf(r) {
  if (r.driverId) return (DATA.drivers || []).find((x) => x.id === r.driverId);
  return (DATA.users || []).find((u) => u.id === r.userId) || null;
}
function driverLabel(d) {
  const t = (DATA.trucks || []).find((x) => x.id === d.assignedTruckId);
  return d.name + (t ? " · " + t.plate : "");
}
function linkText(x) {
  const bits = [];
  const t = (DATA.trucks || []).find((v) => v.id === x.truckId) || (DATA.truck && DATA.truck.id === x.truckId ? DATA.truck : null);
  if (t) bits.push(t.plate);
  const j = (DATA.jobs || []).find((v) => v.id === x.jobId); if (j) bits.push("Load " + (j.code || j.id));
  const b = (DATA.caneBuys || []).find((v) => v.id === x.caneBuyId); if (b) { const s = (DATA.sellers || []).find((v) => v.id === b.sellerId); bits.push("Cane buy · " + (s ? s.name + " · " : "") + (b.location || "")); }
  if (x.blockId) bits.push("Block " + x.blockId);
  return bits.join(" · ");
}
function advanceStatus(f) {
  return { sent: ["gold", "Waiting for confirmation"], received: ["blue", "Being spent"], spent: ["green", "Fully spent"], closed: ["green", "Closed"] }[f.status] || ["gold", label(f.status)];
}
function useRow(u, tag) {
  return `<div class="use-row">
    ${u.photo ? `<img class="receipt" src="${u.photo}" alt="Receipt" />` : `<div class="receipt none">No<br>receipt</div>`}
    <div style="flex:1;min-width:0"><b>${esc(catLabel(tag, u.category) || "Spend")}${u.litres ? " · " + u.litres + " L" : ""}</b>
      <div class="muted">${fmtDay(u.date)} · Paid to ${u.payeeName ? `<b>${esc(u.payeeName)}</b>` : "—"} · ${METHOD_LABEL[u.method] || "Cash"}${u.payeePhone ? " " + esc(u.payeePhone) : ""}${u.bankAccount ? " " + esc(u.bankName || "") + " " + esc(u.bankAccount) : ""}${u.reference ? " · Ref " + esc(u.reference) : ""}</div>
      ${u.note ? `<div class="muted">${esc(u.note)}</div>` : ""}</div>
    <b class="amt">${ugx(u.amountUgx)}</b>
  </div>`;
}
function advanceCard(f, admin) {
  const tag = f.tag || "trucking";
  const who = recipientOf(f);
  const { used, left, back } = advLeft(f);
  const pct = f.amountUgx ? Math.min(100, Math.round((used / f.amountUgx) * 100)) : 0;
  const [tone, st] = advanceStatus(f);
  const via = (METHOD_LABEL[f.method] || "Cash") + (f.payeePhone ? " " + esc(f.payeePhone) : f.bankAccount ? " · " + esc(f.bankName || "") + " " + esc(f.bankAccount) : "") + (f.reference ? " · Ref " + esc(f.reference) : "");
  const link = linkText(f);
  return `<section class="card adv-card ${!admin && f.status === "sent" ? "flash" : ""}">
    <div class="adv-head">
      <div style="min-width:0">
        <b class="adv-title">${esc(catLabel(tag, f.activity) || "Advance")}</b>
        <div class="muted">${admin ? `<b>${esc(who ? who.name : "—")}</b> · ` : ""}${link ? esc(link) + " · " : ""}${fmtDay(f.date)}</div>
        <div class="muted">Sent by ${via}</div>
        ${f.note ? `<div class="muted">${esc(f.note)}</div>` : ""}
      </div>
      <div class="adv-right"><b class="adv-amt">${ugx(f.amountUgx)}</b><div><span class="badge ${tone}">${st}</span></div></div>
    </div>
    <div class="adv-bar"><span style="width:${pct}%"></span></div>
    <div class="adv-nums"><span>Spent <b>${ugx(used)}</b></span><span>${f.status === "closed" ? `Returned <b>${ugx(back)}</b>` : `Left <b>${ugx(left)}</b>`}</span></div>
    ${(f.usages || []).length ? `<div class="use-list">${f.usages.map((u) => useRow(u, tag)).join("")}</div>` : `<p class="muted" style="margin-top:8px">${f.status === "sent" ? (admin ? "Not yet confirmed as received." : "Confirm below once the money reaches you.") : "No spending recorded yet."}</p>`}
    ${admin && f.status !== "closed" && f.status !== "sent" ? `<details class="settings" style="margin-top:10px"><summary>Close this advance</summary>
      <form data-form="close-advance" data-id="${esc(f.id)}" style="margin-top:10px">
        <div class="grid g2">
          <label class="lbl">Cash returned (UGX)<input class="field" name="returnedUgx" inputmode="numeric" value="${left}" /></label>
          <label class="lbl">Returned by<select class="field" name="method">${["cash", "mtn_momo", "airtel_money", "bank"].map((k) => `<option value="${k}">${METHOD_LABEL[k]}</option>`).join("")}</select></label>
        </div>
        <div class="grid g2" style="margin-top:10px">${dateField("date", "Date closed")}<label class="lbl">Note<input class="field" name="note" placeholder="Optional" /></label></div>
        <button class="btn btn-steel wide" style="margin-top:10px">Close advance</button>
      </form></details>` : ""}
    ${f.status === "closed" ? `<p class="muted" style="margin-top:8px">Closed ${fmtDay(f.closedAt)}${f.closeNote ? " · " + esc(f.closeNote) : ""}</p>` : ""}
  </section>`;
}
function linkSelect(tag, name) {
  if (tag === "trucking") {
    const jobs = (DATA.jobs || []).filter((j) => !isPaid(j)).slice(0, 60);
    return `<label class="lbl">Load (optional)<select class="field" name="jobId"><option value="">— No load —</option>${jobs.map((j) => `<option value="${esc(j.id)}">${esc((j.code || "Load") + " · " + (j.origin || "") + " → " + (j.destination || ""))}</option>`).join("")}</select></label>`;
  }
  if (tag === "sugarcane") {
    return `<label class="lbl">Cane buy (optional)<select class="field" name="caneBuyId"><option value="">— Not linked —</option>${(DATA.caneBuys || []).filter((b) => !b.sellerPaid || b.status !== "settled").map((b) => { const s = (DATA.sellers || []).find((x) => x.id === b.sellerId); return `<option value="${esc(b.id)}">${esc((s ? s.name + " · " : "") + (b.location || "") + " · " + ugx(b.buyPriceUgx || 0))}</option>`; }).join("")}</select></label>`;
  }
  return `<label class="lbl">Block (optional)<select class="field" name="blockId"><option value="">— Whole farm —</option>${(DATA.blocks || []).map((b) => `<option value="${esc(b.id)}">${esc(b.name || b.id)}</option>`).join("")}</select></label>`;
}
function reqAsked(r) { return Number(r.amountUgx || r.totalUgx) || 0; }
function reqSent(r) { return Number(r.sentUgx) || 0; }
function reqLeft(r) { return Math.max(0, reqAsked(r) - reqSent(r)); }
function reqWhat(tag, r) {
  return (r.lines || []).length > 1 ? r.lines.map((l) => catLabel(tag, l.activity) + " " + ugx(l.amountUgx)).join(", ") : catLabel(tag, r.activity || (r.lines && r.lines[0] && r.lines[0].activity));
}
// The person who receives money for this business: the requester, the business manager, or (fleet, no request) a chosen driver.
function fundPeople(tag) {
  const mgrRole = { sugarcane: "cane_manager", passion: "passion_manager" }[tag];
  return tag === "trucking" ? (DATA.drivers || []) : (DATA.users || []).filter((u) => u.role === mgrRole && u.active !== false);
}
function sendForm(tag, req) {
  const people = fundPeople(tag);
  const who = tag === "trucking" ? "Driver" : tag === "sugarcane" ? "Cane manager" : "Passion manager";
  const fixed = req ? requesterOf(req) || (tag !== "trucking" ? people[0] : null) : tag !== "trucking" && people.length === 1 ? people[0] : null;
  const field = tag === "trucking" ? "driverId" : "toUserId";
  const left = req ? reqLeft(req) : 0;
  const act = req ? (req.activity || (req.lines && req.lines[0] && req.lines[0].activity) || "other") : "";
  const t = fixed && tag === "trucking" ? (DATA.trucks || []).find((x) => x.id === fixed.assignedTruckId) : null;
  if (!fixed && !people.length) return `<p class="err">No ${who.toLowerCase()} login yet. Add one on Home › Team &amp; logins.</p>`;
  return `<form class="spend-form" data-form="advance" data-tag="${tag}" ${req ? `data-left="${left}"` : ""}>
    <input type="hidden" name="tag" value="${tag}" />
    ${req ? `<input type="hidden" name="requestId" value="${esc(req.id)}" />` : ""}
    ${fixed ? `<input type="hidden" name="${field}" value="${esc(fixed.id)}" />
      ${tag === "trucking" && fixed.assignedTruckId ? `<input type="hidden" name="truckId" value="${esc(fixed.assignedTruckId)}" />` : ""}
      ${req && req.jobId ? `<input type="hidden" name="jobId" value="${esc(req.jobId)}" />` : ""}${req && req.caneBuyId ? `<input type="hidden" name="caneBuyId" value="${esc(req.caneBuyId)}" />` : ""}${req && req.blockId ? `<input type="hidden" name="blockId" value="${esc(req.blockId)}" />` : ""}
      <div class="receiver"><div class="avatar">${esc((fixed.name || "?").charAt(0))}</div><div><span class="muted">Receiver</span><b>${esc(fixed.name)}</b><div class="muted">${who}${t ? " · " + esc(t.plate) : ""}</div></div></div>`
    : `<div class="grid g2">
        <label class="lbl">${who}<select class="field" name="${field}" required><option value="">— Choose —</option>${people.map((d) => `<option value="${esc(d.id)}">${esc(tag === "trucking" ? driverLabel(d) : d.name)}</option>`).join("")}</select></label>
        ${tag === "trucking" ? `<label class="lbl">Truck<select class="field" name="truckId"><option value="">— No truck —</option>${(DATA.trucks || []).map((x) => `<option value="${esc(x.id)}">${esc(x.plate)}</option>`).join("")}</select></label>` : linkSelect(tag)}
      </div>`}
    <div class="grid g2" style="margin-top:10px">
      ${req ? `<input type="hidden" name="activity" value="${esc(act)}" />` : `<label class="lbl">Purpose<select class="field" name="activity">${FUND_FOR[tag].map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>`}
      <label class="lbl">Amount to send (UGX)<input class="field" name="amountUgx" required inputmode="numeric" placeholder="0" value="${req ? left : ""}" ${req ? `max="${left}"` : ""} /></label>
      ${!req && tag === "trucking" ? linkSelect(tag) : ""}
    </div>
    ${req ? `<div class="part-choice js-part" style="display:none">
      <p class="muted">You're sending less than the UGX ${left.toLocaleString("en-UG")} still requested.</p>
      <label class="check"><input type="radio" name="final" value="0" checked /> <span><b>Part payment</b>, the rest will follow later (request stays open)</span></label>
      <label class="check"><input type="radio" name="final" value="1" /> <span><b>Final</b>, this amount settles the request (not declined, just less)</span></label>
    </div>` : ""}
    <div class="pay-fields js-adv-pay" style="margin-top:10px">
      <label class="lbl">Sent by<select class="field" name="method">${["mtn_momo", "airtel_money", "bank", "cash"].map((k) => `<option value="${k}" ${fixed && fixed.payMethod === k ? "selected" : ""}>${METHOD_LABEL[k]}</option>`).join("")}</select></label>
      <div class="grid g2 js-a-mobile" style="margin-top:10px">
        <label class="lbl">Mobile money number<input class="field" name="payeePhone" inputmode="tel" placeholder="07XX XXX XXX" value="${esc(fixed ? fixed.payPhone || fixed.phone || "" : "")}" /></label>
        <label class="lbl">Transaction ID (optional)<input class="field" name="reference" placeholder="From the MoMo SMS" /></label>
      </div>
      <label class="check js-a-mobile"><input type="checkbox" name="saveNumber" value="1" checked /> Save this number for next time</label>
      <div class="grid g3 js-a-bank" style="margin-top:10px">
        <label class="lbl">Bank<input class="field" name="bankName" value="${esc(fixed ? fixed.bankName || "" : "")}" placeholder="e.g. Stanbic" /></label>
        <label class="lbl">Account number<input class="field" name="bankAccount" inputmode="numeric" value="${esc(fixed ? fixed.bankAccount || "" : "")}" /></label>
        <label class="lbl">Reference (optional)<input class="field" name="reference" /></label>
      </div>
      <p class="muted js-a-cash" style="margin-top:10px">Cash in hand</p>
    </div>
    <div class="grid g2" style="margin-top:10px">${dateField("date", "Date sent")}<label class="lbl">Note<input class="field" name="note" placeholder="Optional" value="${esc(req ? req.note || "" : "")}" /></label></div>
    <button class="btn btn-primary wide" style="margin-top:12px">Send money</button>
  </form>`;
}
function reqStatusText(r) {
  const asked = reqAsked(r), sent = reqSent(r);
  if (r.status === "partial") return ["gold", "Part sent · " + ugx(sent) + " of " + ugx(asked)];
  if (r.status === "final") return ["blue", "Settled at " + ugx(sent) + " (asked " + ugx(asked) + ")"];
  if (r.status === "sent") return ["green", "Sent in full"];
  if (r.status === "rejected") return ["red", "Declined"];
  if (r.status === "approved") return ["green", "Approved"];
  return ["gold", "Waiting"];
}
// Admin: <Business> › Spend
function viewFundsAdmin(tag) {
  const title = { trucking: "Fleet", sugarcane: "Cane", passion: "Passion" }[tag];
  const floats = (DATA.disbursements || []).filter((f) => (f.tag || "trucking") === tag);
  const reqs = openRequests(tag);
  const done = (DATA.moneyRequests || []).filter((r) => r.tag === tag && !["open", "partial"].includes(r.status)).slice(0, 6);
  const withThem = floats.filter((f) => f.status !== "closed").reduce((s, f) => s + advLeft(f).left, 0);
  const mKey = thisMonth(0);
  const spentMonth = floats.reduce((s, f) => s + (f.usages || []).filter((u) => String(u.date).startsWith(mKey)).reduce((a, u) => a + (u.amountUgx || 0), 0), 0);
  return `
    <div class="row" style="align-items:center"><h1>${title} · Advances</h1></div>
    <h2 style="margin:16px 0 0">Requests ${reqs.length ? `<span class="attn-n big">${reqs.length}</span>` : ""}</h2>
    ${reqs.length ? reqs.map((r) => { const p = requesterOf(r); const link = linkText(r); const [tone, st] = reqStatusText(r); return `<details class="card req-card flash" ${reqs.length === 1 ? "open" : ""}>
      <summary>
        <div style="min-width:0"><b>${esc(p ? p.name : r.by)}</b> · <b>${ugx(reqAsked(r))}</b>
          <div class="muted">${esc(reqWhat(tag, r))}${link ? " · " + esc(link) : ""} · asked ${fmtDay(r.date)}${r.neededBy ? " · <b>needed by " + fmtDay(r.neededBy) + "</b>" : ""}</div>
          ${r.note ? `<div class="muted">“${esc(r.note)}”</div>` : ""}
          ${r.status === "partial" ? `<div class="req-progress"><span style="width:${Math.round(reqSent(r) / reqAsked(r) * 100)}%"></span></div><div class="muted">Sent ${ugx(reqSent(r))} · <b>${ugx(reqLeft(r))} still waiting</b></div>` : ""}
        </div>
        <div class="due-right"><span class="badge ${tone}">${r.status === "partial" ? "Part sent" : "Waiting"}</span><span class="btn btn-primary btn-sm">Pay</span></div>
      </summary>
      <div class="req-body">
        ${sendForm(tag, r)}
        <div class="req-alt">
          ${r.status === "partial"
            ? `<form data-form="finalize-request" data-id="${esc(r.id)}"><button class="btn btn-ghost btn-sm">Settle at ${ugx(reqSent(r))} — no more to send</button></form>`
            : `<button type="button" class="btn btn-ghost btn-sm" data-act="decline_advance" data-id="${esc(r.id)}">Decline request</button>`}
        </div>
      </div>
    </details>`; }).join("") : `<div class="card item muted" style="margin-top:10px">No requests waiting.</div>`}
    ${done.length ? `<details class="settings" style="margin-top:10px"><summary>Recently settled requests</summary>${done.map((r) => { const p = requesterOf(r); const [tone, st] = reqStatusText(r); return `<div class="pay-line"><div><b>${esc(p ? p.name : r.by)} · ${ugx(reqAsked(r))}</b><div class="muted">${esc(reqWhat(tag, r))} · ${fmtDay(r.date)}</div></div><span class="badge ${tone}">${esc(st)}</span></div>`; }).join("")}</details>` : ""}
    <details class="card team-row" style="margin-top:12px">
      <summary><div class="avatar">＋</div><div style="flex:1"><b>Send money without a request</b></div></summary>
      <div style="margin-top:12px">${sendForm(tag)}</div>
    </details>
    <h2 style="margin:22px 0 0">How the money was spent</h2>
    <div class="grid g3" style="margin-top:10px">
      <div class="card kpi gold"><span class="eyebrow">Not yet spent</span><b>${ugx(withThem)}</b></div>
      <div class="card kpi"><span class="eyebrow">Waiting confirmation</span><b>${floats.filter((f) => f.status === "sent").length}</b></div>
      <div class="card kpi steel"><span class="eyebrow">Spent this month</span><b>${ugx(spentMonth)}</b></div>
    </div>
    <div class="list" style="margin-top:10px">${floats.length ? floats.map((f) => advanceCard(f, true)).join("") : `<div class="card item muted">Nothing sent yet.</div>`}</div>`;
}
function bindAdvanceForms() {
  document.querySelectorAll("form[data-form=advance]").forEach((af) => {
    const tag = af.dataset.tag;
    const pick = af.querySelector(tag === "trucking" ? "select[name=driverId]" : "select[name=toUserId]");
    const methodSel = af.querySelector("[name=method]");
    const phone = af.querySelector(".js-a-mobile [name=payeePhone]");
    const syncMethod = () => {
      const m = methodSel.value;
      const show = { ".js-a-mobile": m === "mtn_momo" || m === "airtel_money", ".js-a-bank": m === "bank", ".js-a-cash": m === "cash" };
      Object.entries(show).forEach(([cls, on]) => af.querySelectorAll(cls).forEach((el) => {
        el.style.display = on ? "" : "none";
        el.querySelectorAll("input").forEach((i) => { i.disabled = !on; });
      }));
      phone.required = show[".js-a-mobile"];
      af.querySelectorAll(".js-a-bank [name=bankName], .js-a-bank [name=bankAccount]").forEach((i) => { i.required = show[".js-a-bank"]; });
    };
    if (pick) pick.onchange = () => {
      const p = tag === "trucking" ? (DATA.drivers || []).find((x) => x.id === pick.value) : (DATA.users || []).find((x) => x.id === pick.value);
      if (!p) return;
      if (tag === "trucking" && p.assignedTruckId && af.truckId) af.truckId.value = p.assignedTruckId;
      phone.value = p.payPhone || p.phone || "";
      if (p.payMethod) methodSel.value = p.payMethod;
      if (p.payMethod === "bank") { af.bankName.value = p.bankName || ""; af.bankAccount.value = p.bankAccount || ""; }
      syncMethod();
    };
    methodSel.onchange = syncMethod;
    syncMethod();
    // sending less than requested: ask part payment or final
    const left = Number(af.dataset.left || 0), part = af.querySelector(".js-part");
    if (left && part) {
      const amt = af.querySelector("[name=amountUgx]");
      const sync = () => { const v = Number(amt.value) || 0; part.style.display = v > 0 && v < left ? "" : "none"; };
      amt.addEventListener("input", sync); sync();
    }
  });
}

// Requester (driver / cane manager / passion manager): request, confirm, allocate
function workerFundsView(tag) {
  const floats = (DATA.disbursements || []).filter((f) => (f.tag || "trucking") === tag);
  const reqs = (DATA.moneyRequests || []).filter((r) => r.tag === tag).slice(0, 8);
  const open = floats.filter((f) => f.status !== "closed");
  const withMe = open.filter((f) => f.status !== "sent").reduce((s, f) => s + advLeft(f).left, 0);
  const mKey = thisMonth(0);
  const spentMonth = floats.reduce((s, f) => s + (f.usages || []).filter((u) => String(u.date).startsWith(mKey)).reduce((a, u) => a + (u.amountUgx || 0), 0), 0);
  const reqTone = { open: ["gold", "Waiting"], sent: ["green", "Sent"], rejected: ["red", "Declined"], approved: ["green", "Approved"] };
  const fuelKey = tag === "trucking" ? "diesel" : tag === "sugarcane" ? "fuel" : "";
  return `
    <div class="grid g3 kpi4" style="margin-top:14px">
      <div class="card kpi gold"><span class="eyebrow">With me now</span><b>${ugx(withMe)}</b></div>
      <div class="card kpi ${toConfirm(tag).length ? "attn-kpi" : ""}"><span class="eyebrow">To confirm</span><b>${floats.filter((f) => f.status === "sent").length}</b></div>
      <div class="card kpi steel"><span class="eyebrow">Spent this month</span><b>${ugx(spentMonth)}</b></div>
    </div>
    <details class="card team-row" style="margin-top:10px">
      <summary><div class="avatar">+</div><div style="flex:1"><b>Request money</b></div></summary>
      <form data-form="request-advance" style="margin-top:12px">
        <div class="grid g2">
          <label class="lbl">What for<select class="field" name="activity">${FUND_FOR[tag].map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
          <label class="lbl">Amount needed (UGX)<input class="field" name="amountUgx" required inputmode="numeric" placeholder="0" /></label>
        </div>
        <div class="grid g2" style="margin-top:10px">${linkSelect(tag)}${dateField("neededBy", "Needed by", { optional: true, future: true, min: todayYmd() })}</div>
        <label class="lbl" style="margin-top:10px">Details<input class="field" name="note" placeholder="${tag === "trucking" ? "e.g. 150 L diesel for Busia trip" : tag === "sugarcane" ? "e.g. cutting crew for Kamuli, 3 days" : "e.g. 6 workers for harvest, Block B2"}" /></label>
        <button class="btn btn-primary wide" style="margin-top:12px">Send request</button>
      </form>
    </details>
    ${reqs.length ? `<p class="eyebrow" style="margin-top:16px">My requests</p>
      <div class="card" style="padding:4px 14px;margin-top:8px">${reqs.map((r) => { const t = reqStatusText(r); return `<div class="pay-line">
        <div><b>${ugx(r.amountUgx || r.totalUgx || 0)} · ${esc(catLabel(tag, r.activity || (r.lines && r.lines[0] && r.lines[0].activity)))}</b><div class="muted">${fmtDay(r.date)}${r.note ? " · " + esc(r.note) : ""}${r.reason ? " · " + esc(r.reason) : ""}</div></div>
        <span class="badge ${t[0]}">${t[1]}</span></div>`; }).join("")}</div>` : ""}
    <h2 style="margin:18px 0 0">Money received</h2>
    <div class="list" style="margin-top:8px">
      ${floats.length ? floats.map((f) => {
        const { left } = advLeft(f);
        return `${advanceCard(f, false)}
        ${f.status === "sent" ? `<button class="btn btn-primary wide adv-act" data-act="ack_float" data-id="${esc(f.id)}">I received ${ugx(f.amountUgx)}</button>` : ""}
        ${f.status === "received" && left > 0 ? `<details class="card team-row adv-act" ${f.usages && f.usages.length ? "" : "open"}>
          <summary><div class="avatar">＋</div><div style="flex:1"><b>Record how it was spent</b><div class="muted">UGX ${Number(left).toLocaleString("en-UG")} left</div></div></summary>
          <form data-form="float-use" data-id="${esc(f.id)}" style="margin-top:12px">
            <div class="grid g3">
              <label class="lbl">What<select class="field js-use-cat" name="category" data-fuel="${fuelKey}">${FUND_FOR[tag].map(([k, l]) => `<option value="${k}" ${k === f.activity ? "selected" : ""}>${l}</option>`).join("")}</select></label>
              <label class="lbl">Amount (UGX)<input class="field" name="amountUgx" required inputmode="numeric" placeholder="0" /></label>
              <label class="lbl js-use-litres">Litres<input class="field" name="litres" inputmode="decimal" placeholder="e.g. 120" /></label>
            </div>
            <div style="margin-top:10px">${payeeFields("use", { method: "cash" })}</div>
            <div class="grid g3" style="margin-top:10px">
              ${dateField("date", "Date spent")}
              <label class="lbl">Receipt photo<input class="field use-photo" type="file" accept="image/*" capture="environment" /></label>
              <label class="lbl">Note<input class="field" name="note" placeholder="Optional" /></label>
            </div>
            <div class="thumbs use-preview"></div>
            <button class="btn btn-primary wide" style="margin-top:12px">Save</button>
          </form>
        </details>` : ""}`;
      }).join("") : `<div class="card item muted">Nothing received yet.</div>`}
    </div>
    ${tag !== "trucking" ? `<details class="card team-row" style="margin-top:14px">
      <summary><div class="avatar">⋯</div><div style="flex:1"><b>Spent from cash on hand</b></div></summary>
      <form data-form="direct-spend" style="margin-top:12px">
        <div class="grid g2">
          <label class="lbl">What<select class="field" name="category">${FUND_FOR[tag].map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
          <label class="lbl">Amount (UGX)<input class="field" name="amountUgx" required inputmode="numeric" placeholder="0" /></label>
        </div>
        <div style="margin-top:10px">${linkSelect(tag)}</div>
        <div style="margin-top:10px">${payeeFields("direct", { method: "cash" })}</div>
        <div class="grid g2" style="margin-top:10px">${dateField("date", "Date spent")}<label class="lbl">Note<input class="field" name="note" placeholder="Optional" /></label></div>
        <button class="btn btn-steel wide" style="margin-top:12px">Save</button>
      </form>
    </details>` : ""}`;
}
function driverAdvanceView() { return `<h1>Advance</h1>${workerFundsView("trucking")}`; }
function viewCaneSpend() {
  if (DATA.me.role === "admin") return viewFundsAdmin("sugarcane");
  return `<h1>Cane</h1>${caneTabs("cane-spend")}<h2 style="margin:16px 0 0">Advances</h2>${workerFundsView("sugarcane")}`;
}
function viewCaneAsk() { return viewCaneSpend(); }
function viewPassionSpend() {
  if (DATA.me.role === "admin") return viewFundsAdmin("passion");
  return `<h1>Passion</h1>${farmTabs("passion-spend")}<h2 style="margin:16px 0 0">Advances</h2>${workerFundsView("passion")}`;
}
function viewFleetSpend() { return viewFundsAdmin("trucking"); }
// "Pay from" select for manager forms that cost money (paying a seller, farm work)
function fundSelect(tag, noPayee, need) {
  if (!DATA || DATA.me.role === "admin") return "";
  // only offer office money that can cover the payment; the fullest first
  const open = (DATA.disbursements || []).filter((f) => (f.tag || "trucking") === tag && f.status === "received" && advLeft(f).left > 0 && (!need || advLeft(f).left >= need))
    .sort((x, y) => advLeft(y).left - advLeft(x).left);
  return `<label class="lbl" style="margin-top:10px">Paid from<select class="field" name="floatId">
    ${open.map((f, i) => `<option value="${esc(f.id)}" ${i === 0 ? "selected" : ""}>Office money · ${fmtDay(f.date)} · ${ugx(advLeft(f).left)} left</option>`).join("")}
    <option value="">Cash on hand</option></select></label>
    ${noPayee ? "" : `<label class="lbl" style="margin-top:10px">Paid to<input class="field" name="payeeName" placeholder="e.g. 5 workers / supplier name" /></label>`}`;
}

// Money › Spend (admin): every shilling out across businesses, plus office-paid-directly
function viewSpend() {
  const biz = sessionStorage.getItem("spendBiz") || "";
  const formBiz = sessionStorage.getItem("spendForm") || "trucking";
  const all = (DATA.cash || []).filter((c) => c.direction === "out");
  const rows = all.filter((c) => !biz || c.tag === biz);
  const mKey = thisMonth(0);
  const monthTotal = rows.filter((c) => String(c.date || "").startsWith(mKey)).reduce((s, c) => s + (c.amountUgx || 0), 0);
  const floats = DATA.disbursements || [];
  const pend = { trucking: openRequests("trucking").length, sugarcane: openRequests("sugarcane").length, passion: openRequests("passion").length };
  const kind = (c) => (c.refId && floats.some((f) => f.id === c.refId)) ? "Advance · " : c.category === "employee_pay" ? "" : c.source === "cash_on_hand" ? "From cash on hand · " : "";
  return `
    <h1>Money</h1>
    ${moneyTabs("money-spend")}
    <div class="grid g3" style="margin-top:14px">
      ${[["trucking", "Fleet"], ["sugarcane", "Cane"], ["passion", "Passion"]].map(([t, n]) => `<a class="card kpi req-link ${pend[t] ? "attn-kpi" : ""}" href="${FUND_HOME[t]}"><span class="eyebrow">${n} requests</span><b>${pend[t] ? pend[t] + " waiting" : "None"}</b><span class="muted">Open ${n} › Advances</span></a>`).join("")}
    </div>
    <details class="card team-row" style="margin-top:12px">
      <summary><div class="avatar">＋</div><div style="flex:1"><b>Office paid directly</b></div></summary>
      <form data-form="spend" style="margin-top:12px">
        <input type="hidden" name="payee" value="1" />
        <div class="seg seg-sm" style="margin-bottom:10px">${["trucking", "sugarcane", "passion"].map((t) => `<button type="button" class="seg-btn ${formBiz === t ? "on" : ""}" data-spendform="${t}">${BIZ_LABEL[t]}</button>`).join("")}</div>
        <input type="hidden" name="tag" value="${formBiz}" />
        <div class="grid g2">
          <label class="lbl">Category<select class="field" name="activity">${FUND_FOR[formBiz].map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
          <label class="lbl">Amount (UGX)<input class="field" name="amountUgx" required inputmode="numeric" placeholder="0" /></label>
        </div>
        <div class="grid g2" style="margin-top:10px">
          ${formBiz === "trucking" ? `<label class="lbl">Truck (optional)<select class="field" name="truckId"><option value="">— No truck —</option>${(DATA.trucks || []).map((t) => `<option value="${esc(t.id)}">${esc(t.plate)}</option>`).join("")}</select></label>` : ""}
          ${linkSelect(formBiz)}
        </div>
        <div class="grid g2" style="margin-top:10px">${dateField()}</div>
        <p class="form-step">Who was paid?</p>
        ${payeeFields("spend", {})}
        <label class="lbl" style="margin-top:10px">Note (optional)<input class="field" name="note" /></label>
        <button class="btn btn-primary wide" style="margin-top:12px">Save</button>
      </form>
    </details>
    <div class="row" style="margin-top:22px;align-items:center">
      <h2 style="margin:0">Office expenses</h2>
      <div class="seg seg-sm">${[["", "All"], ["trucking", "Fleet"], ["sugarcane", "Cane"], ["passion", "Passion"]].map(([k, t]) => `<button type="button" class="seg-btn ${biz === k ? "on" : ""}" data-spendfilter="${k}">${t}</button>`).join("")}</div>
    </div>
    <div class="grid g2" style="margin-top:10px">
      <div class="card kpi gold"><span class="eyebrow">This month</span><b>${ugx(monthTotal)}</b></div>
      <div class="card kpi"><span class="eyebrow">All time</span><b>${ugx(rows.reduce((s, c) => s + (c.amountUgx || 0), 0))}</b></div>
    </div>
    <div class="card" style="margin-top:10px;overflow:auto">
      <table class="money-table">
        <thead><tr><th>Date</th><th>For</th><th>Paid to</th><th>Method</th><th>Linked to</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>
          ${rows.length ? rows.map((c) => `<tr>
            <td class="nowrap">${fmtDay(c.date)}</td>
            <td><b>${esc(kind(c) + (catLabel(c.tag, c.category) || "Spend"))}</b><div class="muted">${BIZ_LABEL[c.tag] || esc(c.tag)}${c.note ? " · " + esc(c.note) : ""}</div></td>
            <td>${c.payeeName ? `<b>${esc(c.payeeName)}</b>` : `<span class="muted">Not recorded</span>`}</td>
            <td>${methodText(c)}${c.reference ? `<div class="muted">Ref ${esc(c.reference)}</div>` : ""}</td>
            <td class="muted">${esc(cashRef(c)) || "—"}</td>
            <td class="nowrap" style="text-align:right"><b>−${ugx(c.amountUgx)}</b></td>
          </tr>`).join("") : `<tr><td colspan="6" class="muted">Nothing recorded${biz ? " for " + BIZ_LABEL[biz] : ""} yet.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}
function bindSpend() {
  document.querySelectorAll("[data-spendfilter]").forEach((b) => { b.onclick = () => { sessionStorage.setItem("spendBiz", b.dataset.spendfilter); route(); }; });
  document.querySelectorAll("[data-spendform]").forEach((b) => { b.onclick = () => { sessionStorage.setItem("spendForm", b.dataset.spendform); route(); setTimeout(() => { const d = document.querySelector("form[data-form=spend]"); if (d) d.closest("details").open = true; }, 0); }; });
  bindAdvanceForms();
  const form = document.querySelector("form[data-form=spend]");
  if (form) {
    bindPayee(form);
    // paying for a cane buy: fill in the seller
    const fillSeller = () => {
      if (form.tag.value !== "sugarcane" || !form.caneBuyId || !form.caneBuyId.value) return;
      if (form.activity.value !== "buy") return;
      const b = (DATA.caneBuys || []).find((x) => x.id === form.caneBuyId.value);
      const s = b && (DATA.sellers || []).find((x) => x.id === b.sellerId);
      if (!s) return;
      form.querySelectorAll("[name=payeeName]").forEach((i) => { i.value = s.name; });
      if (s.phone) { form.querySelector("[name=method]").value = "mtn_momo"; form.querySelectorAll("[name=payeePhone]").forEach((i) => { i.value = s.phone; }); bindPayee(form); }
      if (b.buyPriceUgx && !form.amountUgx.value) form.amountUgx.value = b.buyPriceUgx;
    };
    if (form.caneBuyId) form.caneBuyId.addEventListener("change", fillSeller);
    form.activity.addEventListener("change", fillSeller);
  }
  document.querySelectorAll("form[data-form=direct-spend]").forEach((f) => bindPayee(f));
}
function bindDriverAdvance() {
  document.querySelectorAll("form[data-form=float-use]").forEach((form) => {
    const cat = form.querySelector(".js-use-cat"), lit = form.querySelector(".js-use-litres");
    if (cat && lit) {
      const fuel = cat.dataset.fuel, viaFuel = DATA.me.role === "driver" && fuel === "diesel";
      let note = form.querySelector(".js-fuel-note");
      if (viaFuel && !note) { note = document.createElement("div"); note.className = "card item req-box js-fuel-note"; note.innerHTML = `<b>Diesel goes on the Fuel page</b><p class="muted" style="margin:4px 0 8px">Pick this advance under “Paid from” so it's counted once.</p><a class="btn btn-primary wide" href="#drive-fuel">Log fuel</a>`; cat.closest(".grid").after(note); }
      const s = () => {
        const isFuel = fuel && cat.value === fuel;
        lit.style.display = isFuel && !viaFuel ? "" : "none";
        if (viaFuel) {
          note.hidden = !isFuel;
          const keep = cat.closest("label");
          [...form.children].forEach((el) => { if (el === note) return; if (el.contains(cat)) [...el.children].forEach((c) => { if (c !== keep) c.style.display = isFuel ? "none" : ""; }); else el.style.display = isFuel ? "none" : ""; });
          if (!isFuel) lit.style.display = "none";
        }
      };
      cat.addEventListener("change", s); s();
    }
  });
}

// ───────────── Team & logins (admin) ─────────────
const ROLE_NAMES = { admin: "Admin", driver: "Driver", cane_manager: "Cane manager", passion_manager: "Passion manager" };
const LOG_TEXT = { no_location: ["gold", "Location off, not let in"], ok: ["green", "Signed in"], wrong_pin: ["gold", "Wrong PIN"], locked_now: ["red", "Locked (5 wrong PINs)"], locked: ["red", "Tried while locked"], new_phone: ["gold", "New phone, waiting approval"], phone_approved: ["green", "Phone approved"], phone_removed: ["gold", "Phone removed"], unlocked: ["green", "Unlocked"], unknown_phone: ["red", "Unknown phone number"], computer_trusted: ["blue", "Computer trusted"], computer_untrusted: ["gold", "Computer untrusted"], turned_off: ["red", "Login is off"], no_pin: ["gold", "No PIN set"], blocked_device: ["red", "Blocked device tried"], blocked_login: ["red", "Blocked: too many tries"], office_book_started: ["blue", "Office book started"], fresh_start: ["blue", "Started fresh for launch"] };
// main admin: devices and connections blocked after wrong tries (they only ever see "try again later")
// ---- backups (main admin) ----
async function backupCall(op) {
  const res = await fetch("/.netlify/functions/sync", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + Conacrew.token() }, body: JSON.stringify({ op }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || "Couldn't reach the office");
  return j;
}
async function loadBackups() {
  const box = document.getElementById("backupBox");
  if (!box) return;
  if (!Conacrew.token()) { box.innerHTML = `<div class="card item backup-card"><b>Backups</b><p class="muted">Connect to the office (green sync light) to see backups.</p></div>`; return; }
  let s = null; try { s = await backupCall("backup_status"); } catch (e) {}
  const last = s && s.last;
  const age = last ? (Date.now() - Date.parse(last.at)) / 36e5 : null;
  box.innerHTML = `<div class="card item backup-card">
    <div class="row keep" style="align-items:center"><div><b>Backups</b><div class="muted">A full copy is saved every night at 4 AM Kampala time</div></div><span class="badge ${!last ? "gold" : age > 36 ? "red" : "green"}">${!last ? "None yet" : age > 36 ? "Late" : "OK"}</span></div>
    ${last ? `<p style="margin:10px 0 0">Last copy <b>${whenShort(last.at)}</b> <span class="muted">· ${Math.max(1, Math.round(last.bytes / 1024)).toLocaleString()} KB · ${esc(last.why)}</span></p>` : ""}
    ${s ? `<p class="muted" style="margin:4px 0 0">${s.daily.length} daily cop${s.daily.length === 1 ? "y" : "ies"} (last 30 days) · ${s.months.length} monthly (last 12 months)</p>` : ""}
    <div class="grid g2" style="margin-top:12px"><button type="button" class="btn btn-ghost js-bk-now">Back up now</button><button type="button" class="btn btn-primary js-bk-dl">Download a copy</button></div>
    <p class="muted" style="margin:8px 0 0;font-size:12px">The download keeps everything except PINs. Keep it somewhere safe, like your Google Drive.</p>
  </div>`;
  box.querySelector(".js-bk-now").onclick = async (e) => { const b = e.target; b.disabled = true; b.textContent = "Saving…"; try { await backupCall("backup_now"); loadBackups(); } catch (x) { alert(x.message); b.disabled = false; b.textContent = "Back up now"; } };
  box.querySelector(".js-bk-dl").onclick = async (e) => {
    const b = e.target; b.disabled = true; b.textContent = "Preparing…";
    try {
      const j = await backupCall("backup_download");
      const blob = new Blob([JSON.stringify(j.book, null, 1)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "conacrew-backup-" + todayYmd() + ".json"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (x) { alert(x.message); }
    b.disabled = false; b.textContent = "Download a copy";
  };
}
async function loadBlocks(op, extra) {
  const box = document.getElementById("blocksBox");
  if (!box || !Conacrew.token()) return;
  try {
    const res = await fetch("/.netlify/functions/sync", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + Conacrew.token() }, body: JSON.stringify({ op: op || "blocks", ...(extra || {}) }) });
    if (!res.ok) return;
    const { blocks } = await res.json();
    if (!document.body.contains(box)) return;
    box.innerHTML = blocks && blocks.length ? `<div class="card item" style="margin-top:12px;border:1px solid #ff5a5a">
      <b>Blocked from signing in</b>
      ${blocks.map((x) => `<div class="pay-line"><div><b>${esc(x.label)}</b><div class="muted">${x.tries} wrong tries · until ${whenShort(new Date(x.until).toISOString())}</div></div><button type="button" class="btn btn-ghost btn-sm js-unblock" data-kind="${esc(x.kind)}" data-id="${esc(x.id)}">Lift</button></div>`).join("")}
    </div>` : "";
    box.querySelectorAll(".js-unblock").forEach((b) => { b.onclick = () => loadBlocks("unblock", { kind: b.dataset.kind, id: b.dataset.id }); });
  } catch (e) {}
}
// what is waiting on someone: it flashes until they respond
function issuesWaiting() { return (DATA.issues || []).filter((i) => i.status === "open").length; }
function payWaiting() {
  if (typeof owedTo !== "function") return 0;
  let n = 0;
  (DATA.drivers || []).forEach((d) => { n += owedTo("driver", d, DATA.payStubs, DATA).waiting.length; });
  (DATA.users || []).filter((u) => u.role === "cane_manager").forEach((u) => { n += owedTo("cane", u, DATA.payStubs, DATA).waiting.length; });
  (DATA.users || []).filter((u) => u.role === "passion_manager").forEach((u) => { n += owedTo("passion", u, DATA.payStubs, DATA).waiting.length; });
  return n;
}
function newOfficeLoad(j) { return j.fromOffice && j.status === "booked" && !isPaid(j); }
function driverWaiting() {
  const my = DATA.me.driverId;
  return {
    tasks: (DATA.fleetTasks || []).filter((t) => t.driverId === my && t.status === "open").length,
    jobs: (DATA.jobs || []).filter((j) => j.driverId === my && newOfficeLoad(j)).length,
    notes: (DATA.notifications || []).filter((n) => n.status === "unread" && !n.taskId).length,
  };
}
// where a phone signed in from: network area, and exact GPS when the person shared it
function whereLine(p, opts) {
  if (!p) return "";
  const bits = [];
  if (p.place) bits.push(`<span class="where-net" title="From the mobile network or Wi-Fi, accurate to the town">📍 ${esc(p.place)}</span>`);
  if (p.gps && p.gps.lat) bits.push(`<a class="where-gps" href="https://www.google.com/maps?q=${p.gps.lat},${p.gps.lng}" target="_blank" rel="noopener">Exact spot${p.gps.acc ? " ±" + (p.gps.acc > 999 ? Math.round(p.gps.acc / 100) / 10 + " km" : p.gps.acc + " m") : ""} ›</a>`);
  else if (opts && opts.askedGps) bits.push(`<span class="muted">GPS not shared</span>`);
  if (!bits.length && !(opts && opts.ip && p.ip)) return "";
  return `<div class="where">${bits.join(" ")}${opts && opts.ip && p.ip ? `<span class="muted where-ip">Network ${esc(p.ip)}</span>` : ""}</div>`;
}
function phonesWaiting() {
  return (DATA.users || []).reduce((n, u) => n + ((u.pendingDevices || []).length), 0);
}
function whenShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
function viewTeam() {
  const users = DATA.users || [];
  const trucks = DATA.trucks || [];
  const drivers = DATA.drivers || [];
  const order = ["admin", "admin2", "driver", "cane_manager", "passion_manager"];
  const rk = (u) => (u.role === "admin" && u.assistant ? "admin2" : u.role);
  const sorted = users.slice().sort((a, b) => (b.pendingDevices || []).length - (a.pendingDevices || []).length || order.indexOf(rk(a)) - order.indexOf(rk(b)) || String(a.name).localeCompare(String(b.name)));
  const iAmII = !!DATA.me.assistant;
  const truckOpts = (sel) => `<option value="">— No truck —</option>` + trucks.map((t) => `<option value="${esc(t.id)}" ${t.id === sel ? "selected" : ""}>${esc(t.plate)}</option>`).join("");
  const row = (u) => {
    const main = u.role === "admin" && !u.assistant;
    const d = u.role === "driver" ? drivers.find((x) => x.id === u.driverId) : null;
    const t = d ? trucks.find((x) => x.id === d.assignedTruckId) : null;
    const pend = u.pendingDevices || [];
    const devs = u.devices || [];
    const state = u.active === false ? ["red", "Turned off"] : u.locked ? ["red", "Locked"] : pend.length ? ["gold", "Phone waiting"] : !u.phone ? ["gold", "No phone"] : !u.hasPin ? ["gold", "No PIN"] : !main && !devs.length ? ["gold", "No phone approved"] : ["green", "Can sign in"];
    const pinText = !u.hasPin ? "not set" : u.pinLen === 6 ? "set (6 digits)" : `set (${u.pinLen} digits) · <span class="warn-t">set a new 6-digit PIN</span>`;
    const canEdit = !(iAmII && u.role === "admin" && u.id !== DATA.me.id);
    return `<details class="card team-row ${pend.length ? "attn-row flash" : ""}" ${pend.length ? "open" : ""}>
      <summary>
        <div class="avatar">${esc((u.name || "?").charAt(0).toUpperCase())}</div>
        <div style="flex:1;min-width:0"><b>${esc(u.name)}</b>
          <div class="muted">${u.role === "admin" ? (u.assistant ? "Admin II · assistant admin" : "Main admin") : ROLE_NAMES[u.role] || u.role}${t ? " · " + esc(t.plate) : ""}</div>
          <div class="login-line"><span>Phone <b>${u.phone ? esc(u.phone) : "not set"}</b></span><span>PIN <b>${pinText}</b></span></div></div>
        <span class="badge ${state[0]}">${state[1]}</span>
      </summary>
      ${pend.length ? `<div class="phone-box attn">
        <p class="eyebrow">New phone wants to sign in</p>
        ${pend.map((p) => `<div class="pay-line"><div><b>${esc(p.label)}</b><div class="muted">Asked ${whenShort(p.requestedAt)}</div>${whereLine(p, { askedGps: true, ip: true }) || `<div class="muted">Location not known</div>`}</div>
          ${canEdit ? `<div class="due-right"><button type="button" class="btn btn-primary btn-sm" data-act="approve_device" data-user="${esc(u.id)}" data-device="${esc(p.id)}">Approve</button><button type="button" class="btn btn-ghost btn-sm" data-act="reject_device" data-user="${esc(u.id)}" data-device="${esc(p.id)}">Reject</button></div>` : ""}</div>`).join("")}
      </div>` : ""}
      ${!main ? `<div class="phone-box">
        <p class="eyebrow">Approved phones</p>
        ${devs.length ? devs.map((p) => `<div class="pay-line"><div><b>${esc(p.label)}</b><div class="muted">Approved ${whenShort(p.approvedAt)}${p.approvedBy ? " by " + esc(p.approvedBy) : ""}</div>${p.lastAt ? `<div class="muted">Last sign-in ${whenShort(p.lastAt)}</div>` : ""}${whereLine(p.lastPlace || p.lastGps ? { place: p.lastPlace, gps: p.lastGps } : p)}</div>${canEdit ? `<button type="button" class="btn btn-ghost btn-sm" data-act="remove_device" data-user="${esc(u.id)}" data-device="${esc(p.id)}">Remove</button>` : ""}</div>`).join("") : `<p class="muted">None yet</p>`}
      </div>` : ""}
      ${u.locked && canEdit ? `<div class="phone-box"><p class="muted">Locked after ${u.failCount || 5} wrong PINs.</p><button type="button" class="btn btn-steel btn-sm" data-act="unlock_login" data-user="${esc(u.id)}">Unlock</button> <span class="muted">or set a new PIN below</span></div>` : ""}
      <div class="team-actions">
        ${u.id !== DATA.me.id && !(iAmII && main) ? `<button type="button" class="btn btn-ghost btn-sm js-viewas" data-user="${esc(u.id)}">👁 View as ${esc((u.name || "").split(" ")[0])} (look only)</button>` : ""}
      </div>
      ${!canEdit ? `<p class="muted" style="margin-top:12px">Only the main admin can change this login.</p>` : `<form data-form="login" style="margin-top:12px">
        <input type="hidden" name="id" value="${esc(u.id)}" />
        <div class="grid g3">
          <label class="lbl">Name<input class="field" name="name" value="${esc(u.name)}" /></label>
          <label class="lbl">Sign-in phone<input class="field" name="phone" inputmode="tel" value="${esc(u.phone || "")}" placeholder="07XX XXX XXX" /></label>
          <label class="lbl">${u.hasPin ? "New PIN" : "Set 6-digit PIN"}<input class="field" name="pin" inputmode="numeric" maxlength="6" pattern="\\d{6}" placeholder="6 digits" /></label>
        </div>
        ${u.role === "driver" ? `<label class="lbl" style="margin-top:10px">Truck<select class="field" name="truckId">${truckOpts(d && d.assignedTruckId)}</select></label>` : ""}
        ${u.role !== "admin" || (u.assistant && !iAmII) ? `<label class="check"><input type="checkbox" name="active" value="1" ${u.active !== false ? "checked" : ""} /> Login is on (untick to stop this person signing in)</label><input type="hidden" name="activeSent" value="1" />` : ""}
        <button class="btn btn-primary wide" style="margin-top:12px">Save ${esc(u.name)}</button>
      </form>`}
    </details>`;
  };
  const myDev = deviceId();
  const trusted = DATA.trustedDevices || [];
  const thisTrusted = trusted.some((d) => d.id === myDev);
  const isMain = DATA.me.role === "admin" && !DATA.me.assistant;
  const ok = users.filter((u) => u.active !== false && u.phone && u.hasPin && !u.locked && ((u.role === "admin" && !u.assistant) || (u.devices || []).length)).length;
  const waiting = phonesWaiting();
  const log = DATA.loginLog || [];
  return `
    <h1>Team &amp; logins</h1>
    ${isMain ? `<div class="card item trust-card ${thisTrusted ? "on" : ""}" style="margin-top:12px">
      <div class="row keep" style="align-items:center"><div><b>This computer</b><div class="muted">${esc(deviceLabel())}${thisTrusted ? " · any staff login works here" : ""}</div></div>
      <button type="button" class="btn ${thisTrusted ? "btn-ghost" : "btn-primary"} btn-sm" data-act="${thisTrusted ? "untrust_device" : "trust_device"}" data-device="${esc(myDev)}" data-label="${esc(deviceLabel())}">${thisTrusted ? "Stop trusting" : "Trust this computer"}</button></div>
      ${trusted.filter((d) => d.id !== myDev).map((d) => `<div class="pay-line"><div><b>${esc(d.label)}</b><div class="muted">Trusted ${whenShort(d.addedAt)}</div></div><button type="button" class="btn btn-ghost btn-sm" data-act="untrust_device" data-device="${esc(d.id)}">Remove</button></div>`).join("")}
    </div>` : ""}
    ${isMain ? `<div id="backupBox" style="margin-top:12px"></div><div id="blocksBox"></div>` : ""}
    ${payInfoCard().replace("<summary>Where clients pay</summary>", "<summary><b>Where clients pay</b><div class=\"muted\">Airtel Money and bank details shown on booking links</div></summary>").replace('style="margin-top:10px"', 'style="margin-top:12px"')}
    <div class="grid g3" style="margin-top:14px">
      <div class="card kpi"><span class="eyebrow">People</span><b>${users.length}</b></div>
      <div class="card kpi steel"><span class="eyebrow">Ready to sign in</span><b>${ok}</b></div>
      <div class="card kpi ${waiting ? "attn-kpi" : ""}"><span class="eyebrow">Phones waiting</span><b>${waiting}</b></div>
    </div>
    <details class="card team-row add" ${users.length <= 1 ? "open" : ""}>
      <summary><div class="avatar">+</div><div style="flex:1"><b>Add a login</b></div></summary>
      <form data-form="login" style="margin-top:12px">
        <div class="grid g2">
          <label class="lbl">Role<select class="field" name="role" id="newRole">
            <option value="driver">Driver</option><option value="cane_manager">Cane manager</option><option value="passion_manager">Passion manager</option>${iAmII ? "" : `<option value="admin2">Admin II</option>`}
          </select></label>
          <label class="lbl">Full name<input class="field" name="name" required placeholder="e.g. Paul Balikaita" /></label>
        </div>
        <div class="grid g2" style="margin-top:10px">
          <label class="lbl">Sign-in phone<input class="field" name="phone" required inputmode="tel" placeholder="07XX XXX XXX" /></label>
          <label class="lbl">6-digit PIN<input class="field" name="pin" required inputmode="numeric" maxlength="6" pattern="\\d{6}" placeholder="6 digits" /></label>
        </div>
        <label class="lbl" style="margin-top:10px" id="newTruck">Truck (drivers)<select class="field" name="truckId">${truckOpts("")}</select></label>
        <button class="btn btn-primary wide" style="margin-top:12px">Add login</button>
      </form>
    </details>
    <div class="list" style="margin-top:10px">${sorted.map(row).join("")}</div>
    <h2 style="margin:22px 0 0">Sign-in history</h2>
    <div class="card" style="padding:4px 14px;margin-top:10px">
      ${log.length ? log.slice(0, 40).map((l) => { const t = LOG_TEXT[l.result] || ["blue", label(l.result)]; return `<div class="pay-line"><div><b>${esc(l.name || "—")}</b><div class="muted">${whenShort(l.at)} · ${esc(l.device || "")}${l.by ? " · by " + esc(l.by) : ""}</div>${whereLine(l)}</div><span class="badge ${t[0]}">${t[1]}</span></div>`; }).join("") : `<p class="muted" style="padding:10px 0">No sign-ins yet.</p>`}
    </div>`;
}
function bindTeam() {
  loadBlocks();
  loadBackups();
  const ff = document.getElementById("freshForm");
  if (ff) ff.onsubmit = async (e) => {
    e.preventDefault();
    const er = document.getElementById("freshErr"); er.textContent = "";
    if (!Conacrew.token()) { er.textContent = "Connect to the office first (sync light green)."; return; }
    if (!confirm("Clear all test records for everyone? A backup copy is kept on the server.")) return;
    const btn = ff.querySelector("button"); btn.disabled = true; btn.textContent = "Clearing…";
    try {
      await Conacrew.syncNow();
      const res = await fetch("/.netlify/functions/sync", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + Conacrew.token() }, body: JSON.stringify({ op: "reset", pin: ff.pin.value, confirm: ff.confirm.value, keep: { trucks: ff.trucks.checked, blocks: ff.blocks.checked, contractors: ff.contractors.checked, sellers: ff.sellers.checked } }) });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Couldn't clear");
      await Conacrew.syncNow();
      const n = Object.values(j.cleared || {}).reduce((a, b) => a + b, 0);
      alert("Done. " + n + " test records cleared. The app is ready for launch.");
      location.hash = "home"; location.reload();
    } catch (x) { er.textContent = x.message; btn.disabled = false; btn.textContent = "Clear test records"; }
  };
  const role = document.getElementById("newRole");
  const truck = document.getElementById("newTruck");
  if (role && truck) {
    const sync = () => { const on = role.value === "driver"; truck.style.display = on ? "" : "none"; truck.querySelector("select").disabled = !on; };
    role.onchange = sync; sync();
  }
  document.querySelectorAll(".js-viewas").forEach((b) => {
    b.onclick = () => {
      Conacrew.viewAs(b.dataset.user);
      const u = (DATA.users || []).find((x) => x.id === b.dataset.user);
      const home = { admin: "home", driver: "drive", cane_manager: "cane", passion_manager: "passion" }[u && u.role] || "home";
      location.hash = home;
      location.reload();
    };
  });
}
// Look-only banner and lock while viewing as someone else
function viewingBanner() {
  if (!DATA || !DATA.viewingAs) return "";
  return `<div class="view-banner"><span>👁 Viewing as <b>${esc(DATA.viewingAs.name)}</b> · look only</span><button type="button" class="btn btn-sm" id="stopViewing">Back to my view</button></div>`;
}
function lockForViewing() {
  if (!DATA || !DATA.viewingAs) return;
  const app = document.getElementById("app");
  app.querySelectorAll("form").forEach((f) => { f.onsubmit = (e) => { e.preventDefault(); }; });
  app.querySelectorAll("input, select, textarea, button, [data-act]").forEach((el) => {
    if (el.id === "stopViewing") return;
    el.disabled = true;
    if (el.dataset && el.dataset.act) el.onclick = null;
    el.classList.add("view-off");
  });
  const stop = document.getElementById("stopViewing");
  if (stop) stop.onclick = () => { Conacrew.stopViewing(); location.hash = "team"; location.reload(); };
}

// ───────────── Driver: Fuel ─────────────
function driverFuelView() {
  const open = (DATA.disbursements || []).filter((f) => f.status === "received" && advLeft(f).left > 0);
  const logs = (DATA.fuelLogs || []).slice(0, 10);
  return `
    <h1>Fuel</h1>
    <form class="card item" data-form="fuel" style="margin-top:14px">
      <div class="grid g3">
        <label class="lbl">Litres<input class="field" name="litres" required inputmode="decimal" placeholder="0" /></label>
        <label class="lbl">Amount (UGX)<input class="field" name="amountUgx" required inputmode="numeric" placeholder="0" /></label>
        <label class="lbl">Odometer (km)<input class="field" name="odometerKm" inputmode="numeric" placeholder="Optional" /></label>
      </div>
      <div class="grid g2" style="margin-top:10px">${dateField("date", "Date")}</div>
      <div class="grid g2" style="margin-top:10px">
        <label class="lbl">Station<input class="field" name="station" placeholder="e.g. Shell Mukono" /></label>
        <label class="lbl">Receipt photo<input class="field use-photo" type="file" accept="image/*" capture="environment" /></label>
      </div>
      <div class="thumbs use-preview"></div>
      <label class="lbl" style="margin-top:10px">Paid from<select class="field" name="floatId">
        ${open.map((f, i) => `<option value="${esc(f.id)}" ${i === 0 ? "selected" : ""}>Advance ${fmtDay(f.date)} · ${ugx(advLeft(f).left)} left</option>`).join("")}
        <option value="">Not from an advance</option>
      </select></label>
      <button class="btn btn-primary wide" style="margin-top:12px">Save fuel</button>
    </form>
    ${logs.length ? `<p class="eyebrow" style="margin-top:16px">Recent fuel</p><div class="card" style="padding:4px 14px;margin-top:8px">${logs.map((l) => `<div class="pay-line"><div><b>${l.litres || 0} L · ${esc(l.station || "Station")}</b><div class="muted">${fmtDay(l.date)}${l.odometerKm ? " · " + Number(l.odometerKm).toLocaleString() + " km" : ""}${l.floatId ? " · from advance" : l.notFromAdvance ? " · not from an advance" : ""}</div></div><b class="amt">${ugx(l.amountUgx || 0)}</b></div>`).join("")}</div>` : ""}`;
}

// ───────────── Admin payroll ─────────────
function payForm(kind, person, w) {
  const pp = profilePayee(person);
  return `<form data-form="pay-worker" class="pay-form">
    <input type="hidden" name="kind" value="${w.kind}" />
    <input type="hidden" name="personId" value="${esc(person.id)}" />
    <input type="hidden" name="refId" value="${esc(w.refId)}" />
    <div class="grid g2"><label class="lbl">Amount to pay (UGX)<input class="field" name="amountUgx" required inputmode="numeric" value="${w.amount || ""}" placeholder="0" /></label>${dateField("date", "Date paid")}</div>
    <div style="margin-top:10px">${payeeFields("pay", { ...pp, name: pp.name || person.name })}</div>
    <label class="check"><input type="checkbox" name="remember" value="1" checked /> Save these payout details for ${esc(person.name)}</label>
    <button class="btn btn-primary wide" style="margin-top:10px">Confirm payment</button>
  </form>`;
}
function profileForm(kind, person) {
  const who = kind === "driver" ? "driver" : "user";
  const pp = profilePayee(person);
  const plan = driverPlan(person);
  return `<details class="settings"><summary>Pay settings &amp; payout details</summary>
    <form data-form="pay-profile" style="margin-top:10px">
      <input type="hidden" name="who" value="${who}" /><input type="hidden" name="id" value="${esc(person.id)}" />
      ${kind === "driver" ? `<div class="grid g3">
        <label class="lbl">Pay plan<select class="field" name="payPlan">
          <option value="trip" ${plan === "trip" ? "selected" : ""}>Trip allowance (per delivered load)</option>
          <option value="month" ${plan === "month" ? "selected" : ""}>Monthly salary</option>
          <option value="both" ${plan === "both" ? "selected" : ""}>Monthly salary + trip allowance</option>
        </select></label>
        <label class="lbl js-plan-trip">Allowance per load (UGX)<input class="field" name="tripAllowanceUgx" inputmode="numeric" value="${person.tripAllowanceUgx || ""}" placeholder="e.g. 50000" /></label>
        <label class="lbl js-plan-month">Monthly salary (UGX)<input class="field" name="monthRateUgx" inputmode="numeric" value="${person.monthRateUgx || ""}" placeholder="e.g. 900000" /></label>
      </div>` : kind === "cane" ? `<div class="grid g2">
        <label class="lbl">Pay per delivered trip (UGX)<input class="field" name="perTripUgx" inputmode="numeric" value="${person.perTripUgx || ""}" placeholder="e.g. 30000" /></label>
      </div>` : `<div class="grid g2">
        <label class="lbl">Fixed pay per sale (UGX)<input class="field" name="perSaleUgx" inputmode="numeric" value="${person.perSaleUgx || ""}" placeholder="e.g. 20000" /></label>
        <label class="lbl">…or % of each sale<input class="field" name="perSalePct" inputmode="decimal" value="${person.perSalePct || ""}" placeholder="e.g. 5" /></label>
      </div>`}
      <div class="js-payee">
        <div class="grid g2" style="margin-top:10px">
          <label class="lbl">Pay by<select class="field js-method" name="payMethod">${["mtn_momo", "airtel_money", "bank", "cash"].map((k) => `<option value="${k}" ${pp.method === k ? "selected" : ""}>${METHOD_LABEL[k]}</option>`).join("")}</select></label>
          <label class="lbl">Name on account<input class="field" name="accountName" value="${esc(pp.name)}" /></label>
        </div>
        <div class="grid g2 js-if-mobile" style="margin-top:10px">
          <label class="lbl">Mobile money number<input class="field" name="payPhone" inputmode="tel" value="${esc(pp.phone)}" placeholder="07XX XXX XXX" /></label>
        </div>
        <div class="grid g2 js-if-bank" style="margin-top:10px">
          <label class="lbl">Bank<input class="field" name="bankName" value="${esc(pp.bankName)}" /></label>
          <label class="lbl">Account number<input class="field" name="bankAccount" inputmode="numeric" value="${esc(pp.bankAccount)}" /></label>
        </div>
      </div>
      <button class="btn btn-steel wide" style="margin-top:10px">Save pay settings</button>
    </form></details>`;
}
// driver lists: load ID + material only; tap to see the whole load, tap again (or another load) to close
function loadFold(j, right, more) {
  const c = (DATA.contractors || []).find((x) => x.id === j.contractorId);
  const facts = [
    ["Route", esc((j.origin || "") + " → " + (j.destination || ""))],
    j.pickupAt ? ["Pickup", esc(String(j.pickupAt).replace("T", " "))] : null,
    j.dropAt ? ["Drop-off", esc(String(j.dropAt).replace("T", " "))] : null,
    c ? ["Client", esc(c.name)] : j.bookingRef ? ["Client", "Booking " + esc(j.bookingRef)] : null,
    j.km ? ["Distance", j.km + " km"] : null,
    j.tonnesDelivered ? ["Tonnes", j.tonnesDelivered + " t"] : null,
    j.deliveredAt ? ["Delivered", fmtDay(j.deliveredAt)] : null,
    isPaid(j) ? ["Client paid", (j.paidAt ? fmtDay(j.paidAt) + " · " : "") + ugx(j.paidUgx || j.rateUgx || 0)] : null,
    j.notes ? ["Notes", esc(j.notes)] : null,
  ].filter(Boolean).concat(more || []);
  return `<div class="card load-fold js-fold">
    <button type="button" class="lf-head js-fold-btn" aria-expanded="false"><span class="lf-id">${esc(j.code || "Load")}</span><span class="lf-mat">${esc(j.cargo || "")}</span>${right || ""}<span class="lf-chev" aria-hidden="true">›</span></button>
    <dl class="lf-body bk-facts" hidden>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
  </div>`;
}
function bindFolds() {
  document.querySelectorAll(".js-fold-btn").forEach((b) => { b.onclick = () => {
    const card = b.closest(".js-fold"), body = card.querySelector(".lf-body"), open = body.hidden;
    document.querySelectorAll(".js-fold").forEach((c) => { c.querySelector(".lf-body").hidden = true; c.classList.remove("open"); c.querySelector(".js-fold-btn").setAttribute("aria-expanded", "false"); });
    if (open) { body.hidden = false; card.classList.add("open"); b.setAttribute("aria-expanded", "true"); }
  }; });
}
function jobOfStub(s) { return (DATA.jobs || []).find((j) => (s.refId && j.id === s.refId) || (s.loadId && j.code === s.loadId)); }
function paidLine(s) {
  const j = DATA.me.role === "driver" ? jobOfStub(s) : null;
  if (j) {
    const how = (METHOD_LABEL[s.method] || "Paid") + (s.reference ? " · Ref " + esc(s.reference) : "");
    return loadFold(j, `<b class="amt">${ugx(s.amountUgx || 0)}</b>`, [["My pay", ugx(s.amountUgx || 0) + " · paid " + fmtDay(s.paidAt) + " · " + how]]);
  }
  const how = (METHOD_LABEL[s.method] || "Paid") + (s.payeePhone || s.phone ? " · " + esc(s.payeePhone || s.phone) : s.bankAccount ? " · " + esc(s.bankName || "") + " " + esc(s.bankAccount) : "");
  return `<div class="pay-line paid">
    <div><b>${esc(s.loadId ? "Load " + s.loadId : (s.refLabel || "Pay").replace(/^Trip allowance · /, ""))}</b>
      ${(() => { const k = s.kind === "trip" ? "Trip allowance" : s.kind === "cane_trip" ? "Pay for delivered trip" : s.kind === "sale" ? "Pay for sale" : s.kind === "month" ? "" : (s.refLabel || ""); const line = [k, s.drop].filter(Boolean).join(" · "); return line ? `<div class="muted">${esc(line)}</div>` : ""; })()}
      <div class="muted">Paid ${fmtDay(s.paidAt)} · ${how}${s.reference ? " · Ref " + esc(s.reference) : ""}</div></div>
    <b class="amt">${ugx(s.amountUgx || 0)}</b>
  </div>`;
}
function workerCard(kind, person, src) {
  const o = owedTo(kind, person, DATA.payStubs, src);
  const closeBtn = `<button type="button" class="btn btn-ghost btn-sm js-paydone">Close</button>`;
  const truck = kind === "driver" ? (DATA.trucks || []).find((t) => t.id === person.assignedTruckId) : null;
  const known = o.waiting.filter((w) => w.amount).reduce((s, w) => s + w.amount, 0);
  return `<section class="card worker">
    <div class="worker-head">
      <div class="avatar">${esc((person.name || "?").trim().charAt(0).toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <b class="wname">${esc(person.name)}</b>
        <div class="muted">${kind === "driver" ? "Driver" + (truck ? " · " + esc(truck.plate) : "") : kind === "cane" ? "Cane manager" : "Passion manager"}${person.phone ? " · " + esc(person.phone) : ""}</div>
        <div class="chip-line">${esc(planText(kind, person))}</div>
        <div class="muted" style="margin-top:4px">Payout: ${payoutText(person)}</div>
      </div>
      ${closeBtn}
    </div>
    <div class="stat-strip">
      <div><span>Waiting</span><b>${o.waiting.length}${known ? ` · ${ugx(known)}` : ""}</b></div>
      <div><span>This week</span><b>${ugx(o.sums.week)}</b></div>
      <div><span>This month</span><b>${ugx(o.sums.month)}</b></div>
      <div><span>YTD</span><b>${ugx(o.sums.ytd)}</b></div>
    </div>
    ${profileForm(kind, person)}
    <p class="eyebrow" style="margin-top:14px">Waiting to be paid</p>
    ${o.waiting.length ? o.waiting.map((w) => `<details class="pay-line due">
      <summary>
        <div><b>${esc(w.title)}</b><div class="muted">${esc(w.sub)}${w.date ? " · " + (w.kind === "trip" ? "delivered " : "") + fmtDay(w.date) : ""}</div></div>
        <div class="due-right"><b class="amt">${w.amount ? ugx(w.amount) : "Set amount"}</b><span class="btn btn-primary btn-sm">Pay</span></div>
      </summary>
      ${payForm(kind, person, w)}
    </details>`).join("") : `<p class="muted" style="margin-top:6px">All paid up.</p>`}
    ${o.paid.length ? `<p class="eyebrow" style="margin-top:14px">Recently paid</p>${o.paid.slice(0, 5).map(paidLine).join("")}` : ""}
  </section>`;
}
function viewPayAdmin() {
  const biz = sessionStorage.getItem("payBiz") || "fleet";
  const users = (DATA.users || []).filter((u) => u.active !== false);
  const groups = {
    fleet: { title: "Fleet", kind: "driver", people: DATA.drivers || [], none: "No drivers yet. Add drivers on Fleet › Drivers." },
    cane: { title: "Cane", kind: "cane", people: users.filter((u) => u.role === "cane_manager"), none: "No cane manager login yet." },
    passion: { title: "Passion", kind: "passion", people: users.filter((u) => u.role === "passion_manager"), none: "No passion manager login yet." },
  };
  const counts = {};
  Object.entries(groups).forEach(([k, g]) => { counts[k] = g.people.reduce((n, p) => n + owedTo(g.kind, p, DATA.payStubs, DATA).waiting.length, 0); });
  const g = groups[biz] || groups.fleet;
  const allSums = paySums((DATA.payStubs || []).filter((s) => g.kind === "driver" ? s.role === "driver" : g.kind === "cane" ? s.role === "cane_manager" : s.role === "passion_manager"));
  return `
    <h1>Money</h1>
    ${moneyTabs("money-pay")}
    <div class="row" style="margin-top:16px;align-items:center">
      <div><h2 style="margin:0">Payroll</h2></div>
      <div class="seg">
        ${Object.entries(groups).map(([k, x]) => `<button type="button" class="seg-btn ${biz === k ? "on" : ""}" data-paybiz="${k}">${x.title}${counts[k] ? ` <span class="count">${counts[k]}</span>` : ""}</button>`).join("")}
      </div>
    </div>
    <div class="grid g3" style="margin-top:10px">
      <div class="card kpi gold"><span class="eyebrow">${g.title} paid this week</span><b>${ugx(allSums.week)}</b></div>
      <div class="card kpi"><span class="eyebrow">This month</span><b>${ugx(allSums.month)}</b></div>
      <div class="card kpi steel"><span class="eyebrow">Year to date</span><b>${ugx(allSums.ytd)}</b></div>
    </div>
    ${payPicker(g)}`;
}
function payPicker(g) {
  if (!g.people.length) return `<div class="card item muted" style="margin-top:12px">${g.none}</div>`;
  const key = "payPerson." + g.kind;
  const pick = sessionStorage.getItem(key) || "";
  const person = g.people.find((p) => p.id === pick);
  const owed = (p) => { const o = owedTo(g.kind, p, DATA.payStubs, DATA); return { n: o.waiting.length, amt: o.waiting.reduce((s, w) => s + (w.amount || 0), 0) }; };
  const who = g.kind === "driver" ? "driver" : "person";
  return `<label class="lbl" style="margin-top:14px">Pay ${who}<select class="field js-payperson" data-key="${key}">
      <option value="">— Choose ${who} —</option>
      ${g.people.map((p) => { const o = owed(p); return `<option value="${esc(p.id)}" ${p.id === pick ? "selected" : ""}>${esc(p.name)}${o.n ? ` · ${o.n} waiting${o.amt ? " · " + ugx(o.amt) : ""}` : " · paid up"}</option>`; }).join("")}
    </select></label>
    ${person ? `<div class="list" style="margin-top:12px">${workerCard(g.kind, person, DATA)}</div>` : `<div class="card" style="padding:4px 14px;margin-top:12px">${g.people.map((p) => { const o = owed(p); return `<button type="button" class="pay-line pick-row js-pickpay ${o.n ? "flash" : ""}" data-id="${esc(p.id)}" data-key="${key}"><div><b>${esc(p.name)}</b><div class="muted">${o.n ? o.n + " waiting" : "Paid up"}</div></div><b class="amt">${o.amt ? ugx(o.amt) : ""}</b></button>`; }).join("")}</div>`}`;
}

// ───────────── Worker "My pay" (driver, cane manager, passion manager) ─────────────
function myPayView(kind) {
  const person = kind === "driver" ? { ...(DATA.driver || {}), id: DATA.me.driverId, name: DATA.me.name } : DATA.me;
  const o = owedTo(kind, person, DATA.payStubs, DATA);
  const byMonth = {};
  o.paid.forEach((s) => { const k = String(s.paidAt || "").slice(0, 7) || "—"; (byMonth[k] = byMonth[k] || []).push(s); });
  return `
    <div class="grid g4 kpi4" style="margin-top:14px">
      <div class="card kpi"><span class="eyebrow">This week</span><b>${ugx(o.sums.week)}</b></div>
      <div class="card kpi"><span class="eyebrow">This month</span><b>${ugx(o.sums.month)}</b></div>
      <div class="card kpi steel"><span class="eyebrow">Year to date</span><b>${ugx(o.sums.ytd)}</b></div>
      <div class="card kpi gold"><span class="eyebrow">Waiting</span><b>${o.waiting.length}</b></div>
    </div>
    <div class="card item" style="margin-top:10px">
      <div class="row"><div><b>Your pay plan</b><p class="muted">${esc(planText(kind, person))}</p></div></div>
      <p class="muted" style="margin-top:4px">Paid to: ${payoutText(person)}</p>
    </div>
    <h2 style="margin:18px 0 0">Waiting to be paid</h2>
    <div class="list" style="margin-top:8px">
      ${o.waiting.length ? o.waiting.map((w) => { const j = kind === "driver" && w.kind === "trip" ? (DATA.jobs || []).find((x) => x.id === w.refId) : null; return j ? loadFold(j, `<span class="badge gold">Waiting</span>`, [["My pay", (w.amount ? ugx(w.amount) + " · " : "") + "waiting"]]) : `<div class="card pay-line due">
        <div><b>${esc(w.title)}</b><div class="muted">${esc(w.sub)}${w.date ? " · " + (w.kind === "trip" ? "delivered " : "") + fmtDay(w.date) : ""}</div></div>
        <div class="due-right"><span class="badge gold">Waiting</span>${w.amount ? `<b class="amt">${ugx(w.amount)}</b>` : ""}</div>
      </div>`; }).join("") : `<div class="card item muted">Nothing waiting. ${kind === "driver" ? "" : kind === "cane" ? "" : ""}</div>`}
    </div>
    <h2 style="margin:18px 0 0">Payments received</h2>
    ${Object.keys(byMonth).length ? Object.entries(byMonth).map(([m, list]) => `
      <div class="month-head"><b>${m === "—" ? "Earlier" : monthName(m)}</b><span>${ugx(list.reduce((s, x) => s + (x.amountUgx || 0), 0))}</span></div>
      ${kind === "driver" ? `<div class="list">${list.map((s) => { const l = paidLine(s); return l.includes("js-fold") ? l : `<div class="card" style="padding:4px 14px">${l}</div>`; }).join("")}</div>` : `<div class="card" style="padding:4px 14px">${list.map(paidLine).join("")}</div>`}`).join("") : `<div class="card item muted" style="margin-top:8px">No payments yet.</div>`}`;
}
function viewCanePay() {
  return `<h1>Cane</h1>${caneTabs("cane-pay")}<h2 style="margin:16px 0 0">My pay</h2>${myPayView("cane")}`;
}
function viewPassionPay() {
  return `<h1>Passion</h1>${farmTabs("passion-pay")}<h2 style="margin:16px 0 0">My pay</h2>${myPayView("passion")}`;
}
function bindMoney() {
  bindDocs();
  bindFlow();
  bindTasks();
  bindSpend();
  bindTeam();
  bindDriverAdvance();
  bindPayee(document.querySelector(".worker") ? document : null);
  document.querySelectorAll("[data-paybiz]").forEach((b) => { b.onclick = () => { sessionStorage.setItem("payBiz", b.dataset.paybiz); route(); }; });
  const pickPay = (key, id) => { if (id) sessionStorage.setItem(key, id); else sessionStorage.removeItem(key); route(); };
  document.querySelectorAll(".js-payperson").forEach((s) => { s.onchange = () => pickPay(s.dataset.key, s.value); });
  document.querySelectorAll(".js-pickpay").forEach((b) => { b.onclick = () => pickPay(b.dataset.key, b.dataset.id); });
  // only the pay amounts that belong to the chosen plan
  document.querySelectorAll("form[data-form=pay-profile] [name=payPlan]").forEach((sel) => {
    const f = sel.form;
    const sync = () => {
      const v = sel.value;
      f.querySelectorAll(".js-plan-trip").forEach((l) => { l.style.display = v === "month" ? "none" : ""; });
      f.querySelectorAll(".js-plan-month").forEach((l) => { l.style.display = v === "trip" ? "none" : ""; });
    };
    sel.addEventListener("change", sync); sync();
  });
  document.querySelectorAll(".js-paydone").forEach((b) => { b.onclick = () => { const s = document.querySelector(".js-payperson"); if (s) pickPay(s.dataset.key, ""); }; });
  // Opening one payment closes the others.
  document.querySelectorAll("details.pay-line").forEach((d) => {
    d.addEventListener("toggle", () => { if (d.open) document.querySelectorAll("details.pay-line").forEach((o) => { if (o !== d) o.open = false; }); });
  });
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
function periodKey(d, mode) {
  const x = new Date(d + "T12:00:00");
  if (mode === "day") return d;
  if (mode === "month") return d.slice(0, 7);
  if (mode === "quarter") return quarterKey(d);
  if (mode === "year") return String(x.getFullYear());
  if (mode === "bi") {
    const start = new Date(weekKey(d) + "T12:00:00");
    if (Math.floor(start.getDate() / 14) % 2) start.setDate(start.getDate() - 7);
    return start.toISOString().slice(0, 10);
  }
  return weekKey(d);
}
function plBuckets(mode) {
  const cash = DATA.cash || [];
  const map = {};
  for (const c of cash) {
    if (!c.date) continue;
    const key = periodKey(c.date, mode);
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
  const label = { day: "Daily", week: "Weekly", bi: "Bi weekly", month: "Monthly", quarter: "Quarterly", year: "Annually" };
  const names = { trucking: "Fleet", sugarcane: "Cane", passion: "Passion" };
  const books = ["trucking", "sugarcane", "passion"];
  const nowKey = periodKey(todayYmd(), mode);
  const rows = (DATA.cash || []).filter((c) => c.date && periodKey(c.date, mode) === nowKey);
  const sum = (list) => {
    const inn = list.filter((c) => c.direction === "in").reduce((s, c) => s + (c.amountUgx || 0), 0);
    const out = list.filter((c) => c.direction === "out").reduce((s, c) => s + (c.amountUgx || 0), 0);
    return { inn, out, net: inn - out };
  };
  const all = sum(rows);
  const block = (title, list) => {
    const s = sum(list);
    return `<p class="eyebrow" style="margin-top:16px">${title}</p>
      <div class="grid g3" style="margin-top:8px">
        <div class="card kpi"><span class="eyebrow">In</span><b>${ugx(s.inn)}</b></div>
        <div class="card kpi"><span class="eyebrow">Out</span><b>${ugx(s.out)}</b></div>
        <div class="card kpi gold"><span class="eyebrow">Net</span><b>${ugx(s.net)}</b></div>
      </div>`;
  };
  return `
    <h1>Period</h1>
    <select class="field" id="periodPick" aria-label="Time" style="max-width:280px">
      ${Object.entries(label).map(([k, v]) => `<option value="${k}" ${mode === k ? "selected" : ""}>${v}</option>`).join("")}
    </select>
    <p class="muted" style="margin-top:8px">${label[mode]} · ${nowKey}</p>
    ${block("All businesses", rows)}
    ${books.map((k) => block(names[k], rows.filter((c) => c.tag === k))).join("")}
    <div class="card" style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Business</th><th>Date</th><th>Line</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map((c) => `<tr>
            <td>${names[c.tag] || c.tag}</td>
            <td>${c.date}</td>
            <td>${c.note || c.category || ""}</td>
            <td style="text-align:right"><b>${c.direction === "in" ? "+" : "−"}${ugx(c.amountUgx)}</b></td>
          </tr>`).join("") : `<tr><td colspan="4" class="muted">None in this period</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function bind() {
  bindBookings();
  bindFolds();
  document.querySelectorAll(".js-fuelok").forEach((b) => { b.onclick = () => act("save_truck", { id: b.dataset.id, fuelCheckedAt: todayYmd() }); });
  document.querySelectorAll("[data-profitper]").forEach((b) => { b.onclick = () => { sessionStorage.setItem("profitPer", b.dataset.profitper); route(); }; });
  document.querySelectorAll("[data-jobsrc]").forEach((b) => { b.onclick = () => { sessionStorage.setItem("jobSrc", b.dataset.jobsrc); route(); }; });
  document.querySelectorAll(".js-openbk").forEach((b) => { b.onclick = () => {
    const bk = (DATA.bookings || []).find((x) => x.ref === b.dataset.ref);
    if (bk && bk.jobId) { sessionStorage.setItem("bkOnly", bk.ref); if (location.hash === "#trucks-book") route(); else location.hash = "#trucks-book"; return; }
    sessionStorage.removeItem("bkOnly");
    const tab = bk && ["declined", "client_declined"].includes(bk.status) ? "closed" : "open";
    sessionStorage.setItem("bkTab", tab); sessionStorage.setItem("bkOpen", b.dataset.ref); location.hash = "#trucks-book";
  }; });
  const bkOpen = sessionStorage.getItem("bkOpen");
  if (bkOpen && location.hash === "#trucks-book") { const el = document.getElementById("bk-" + bkOpen); if (el) setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 50); sessionStorage.removeItem("bkOpen"); }
  document.querySelectorAll(".js-tripset").forEach((sel) => { sel.onchange = () => act("update_job", { id: sel.dataset.id, status: sel.value }); });
  bindLoadFromBooking();
  document.querySelectorAll("form[data-form=inspect] .mark").forEach((lab) => {
    lab.onclick = () => {
      const box = lab.closest(".inspect-part");
      box.querySelectorAll(".mark").forEach((c) => c.classList.remove("on"));
      lab.classList.add("on");
      const val = lab.querySelector("input").value;
      const shot = box.querySelector(".js-shot");
      if (shot) { shot.style.display = (val === "warn" || val === "fail") ? "" : "none"; if (val === "pass") shot.value = ""; }
      lab.querySelector("input").checked = true;
      showVoiceIfBad(lab.closest("form"));
      inspCount(lab.closest("form"));
    };
  });
  document.querySelectorAll(".js-all-ok").forEach((b) => { b.onclick = () => {
    const form = b.closest("form");
    if (!confirm("Mark every part OK? Only do this after checking the truck.")) return;
    form.querySelectorAll(".inspect-part").forEach((box) => { if (box.querySelector("input[type=radio]:checked")) return; const l = box.querySelector(".mark.pass"); box.querySelectorAll(".mark").forEach((c) => c.classList.remove("on")); l.classList.add("on"); l.querySelector("input").checked = true; });
    showVoiceIfBad(form); inspCount(form);
  }; });
  document.querySelectorAll(".js-paid").forEach((b) => { b.onclick = () => openJobPaid(b.dataset.id); });
  document.querySelectorAll("[data-act-sheet=seller]").forEach((b) => { b.onclick = () => openSellerPaid(b.dataset.id); });
  const ASK = { trash_job: "Move this load to the trash?", purge_job: "Delete this load for good? This can't be undone.", purge_booking: "Delete this booking for good? This can't be undone.", trash_booking: "Move this booking to the trash?", decline_advance: "Decline this request?", remove_device: "Remove this phone? The person will need approval again.", reject_device: "Reject this phone?" };
  document.querySelectorAll("[data-act]").forEach((btn) => {
    btn.onclick = () => (ASK[btn.dataset.act] && !confirm(ASK[btn.dataset.act])) ? null : act(btn.dataset.act, { id: btn.dataset.id, status: btn.dataset.status, refId: btn.dataset.ref, kind: btn.dataset.kind, amountUgx: btn.dataset.amount, personId: btn.dataset.person, personName: btn.dataset.name, month: btn.dataset.month, floatId: btn.dataset.float, userId: btn.dataset.user, deviceId: btn.dataset.device, label: btn.dataset.label });
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
      if (!$("#fuelHint") || !form.transportKm) return; // estimate box not on this form
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
  document.querySelectorAll("button[data-tag]:not([data-doctype])").forEach((btn) => {
    const f = btn.closest("form");
    if (!f || !f.tag || f.dataset.form === "advance" || f.dataset.form === "doc") return;
    btn.onclick = () => {
      f.querySelectorAll("button[data-tag]").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      f.tag.value = btn.dataset.tag;
    };
  });
  document.querySelectorAll("form[data-form]").forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());
      const kind = form.dataset.form;
      if (kind === "pay-driver") {
        if (!fd.amountUgx) { alert("Enter the pay amount"); return; }
        await act("pay_stub", { id: form.dataset.id, jobId: form.dataset.id, amountUgx: fd.amountUgx, phone: fd.phone, status: "paid" });
        location.hash = "#money-pay";
      } else if (kind === "book-quote") {
        await act("quote_booking", fd);
      } else if (kind === "pricing") {
        await act("save_pricing", fd);
      } else if (kind === "payinfo") {
        await act("save_payinfo", fd);
      } else if (kind === "book-decline") {
        await act("decline_booking", fd);
      } else if (kind === "job") {
        await act("create_job", fd);
        const fromBk = !!fd.bookingId;
        sessionStorage.removeItem("jobFromBooking");
        location.hash = fromBk ? "#trucks-book" : "#trucks";
      } else if (kind === "save-truck") {
        await act("save_truck", fd);
        location.hash = "#trucks";
      } else if (kind === "save-driver") {
        const file = form.querySelector("[name=licensePhoto]") && form.querySelector("[name=licensePhoto]").files[0];
        if (file) fd.licensePhoto = await compressPhoto(file);
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
          const val = (box.querySelector("input[type=radio]:checked") || {}).value || "";
          items[id] = val;
        });
        const missing = Object.keys(items).filter((k) => !items[k]);
        if (missing.length) { alert("Check every part first. " + missing.length + " not checked yet."); const first = form.querySelector(`.inspect-part[data-part="${missing[0]}"]`); if (first) first.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
        const need = Object.keys(items).filter((k) => items[k] === "warn" || items[k] === "fail");
        const files = [...form.querySelectorAll(".js-shot")];
        for (const inp of files) {
          const id = inp.dataset.part;
          if (!need.includes(id)) continue;
          if (!inp.files || !inp.files[0]) { alert("Add a photo for each WARNING or FAIL"); return; }
          photos[id] = await new Promise((res, rej) => {
            compressPhoto(inp.files[0]).then(res, rej); // small photos keep the books light
          });
        }
        const voice = need.length ? fd.voice || "" : "";
        await act("submit_inspect", { truckId: DATA.truck?.id, odometerKm: fd.odometerKm, note: fd.note, items, photos, voice, voiceSec: fd.voiceSec });
        window.__issueMedia = { photos: [], voice: "", sec: 0 };
        location.hash = "#drive-report";
      } else if (kind === "fuel") {
        const rf = form.querySelector(".use-photo") && form.querySelector(".use-photo").files[0];
        const photo = rf ? await compressPhoto(rf) : "";
        try { await act("log_fuel", { ...fd, truckId: DATA.truck?.id, photo }); } catch (err) { return; }
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
        location.hash = "#cane-spend";
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
        if (fd.tag === "trucking" && fd.activity === "to_driver") {
          if (!fd.driverId) { alert("Choose the driver receiving the advance"); return; }
          try { await act("send_float", { ...fd, toDriverId: fd.driverId }); } catch (err) { return; }
        } else {
          try { await act("add_cash", { ...fd, direction: "out", category: fd.activity }); } catch (err) { return; }
        }
        location.hash = "#money-spend";
      } else if (kind === "direct-spend") {
        try { await act("log_direct_spend", fd); } catch (err) { return; }
      } else if (kind === "pay-seller") {
        try { await act("pay_seller", { id: form.dataset.id, floatId: fd.floatId || "" }); } catch (err) { return; }
      } else if (kind === "doc") {
        const inp = form.querySelector(".js-doc-file");
        let file = inp.dataset.src || "";
        if (!file && inp.files && inp.files[0]) file = await readDocFile(inp.files[0]);
        if (!file) { alert("Attach a photo or PDF of the document"); return; }
        try { await act("save_doc", { ...fd, tag: form.dataset.tag, file, fileName: inp.dataset.name || "", mime: inp.dataset.mime || "" }); } catch (err) { return; }
      } else if (kind === "finalize-request") {
        try { await act("finalize_request", { id: form.dataset.id }); } catch (err) { return; }
      } else if (kind === "advance") {
        try { await act("send_float", { ...fd, toDriverId: fd.driverId }); } catch (err) { return; }
      } else if (kind === "close-advance") {
        try { await act("close_advance", { ...fd, id: form.dataset.id }); } catch (err) { return; }
      } else if (kind === "request-advance") {
        try { await act("request_advance", fd); } catch (err) { return; }
      } else if (kind === "login") {
        if (fd.activeSent) fd.active = fd.active ? "1" : "0";
        try { await act("save_login", fd); } catch (err) { return; }
      } else if (kind === "pay-worker") {
        try { await act("pay_worker", fd); } catch (err) { return; }
      } else if (kind === "pay-profile") {
        await act("save_pay_profile", fd);
      } else if (kind === "float-use") {
        const file = form.querySelector(".use-photo") && form.querySelector(".use-photo").files[0];
        let photo = "";
        if (file) photo = await compressPhoto(file);
        try { await act("log_float_use", { ...fd, id: form.dataset.id, photo }); } catch (err) { return; }
        location.hash = "#drive-money";
      } else if (kind === "trip-result") {
        await act("log_trip_result", { id: form.dataset.id, tonnesDelivered: fd.tonnesDelivered, payPerTonne: fd.payPerTonne });
      } else if (kind === "fleet-task") {
        const parts = [...form.querySelectorAll("input[name=parts]:checked")].map((i) => i.value);
        const partNames = {}; form.querySelectorAll("input[name=parts]:checked").forEach((i) => { partNames[i.value] = i.dataset.name; });
        if (!parts.length && !String(fd.instructions || "").trim()) { alert("Pick the parts to check or write instructions for the driver"); return; }
        try { await act("create_fleet_task", { ...fd, parts, partNames }); } catch (err) { return; }
        location.hash = "#trucks-work";
      } else if (kind === "task-back") {
        try { await act("review_fleet_task", { id: form.dataset.id, decision: "back", reason: fd.reason }); } catch (err) { return; }
      } else if (kind === "task-reply") {
        const items = {}, photos = {};
        const boxes = [...form.querySelectorAll(".task-part")];
        for (const box of boxes) {
          const p = box.dataset.part;
          const v = (box.querySelector("input[type=radio]:checked") || {}).value;
          if (!v) { alert("Mark " + box.querySelector(".tp-name").textContent + ": OK, needs attention, or not OK"); return; }
          items[p] = v;
        }
        for (const inp of form.querySelectorAll(".js-part-photo")) {
          const p = inp.dataset.part;
          if (p !== "work" && items[p] === "pass") continue;
          let src = inp.dataset.src || "";
          if (!src && inp.files && inp.files[0]) src = await compressPhoto(inp.files[0]);
          if (src) photos[p] = src;
          else if (form.dataset.needphoto === "1") { alert("Add a photo" + (p === "work" ? " of the work" : " for " + (inp.closest(".task-part").querySelector(".tp-name").textContent))); return; }
        }
        const vb = form.querySelector(".js-voice-if-bad"), voiceOn = !vb || !vb.hidden;
        try { await act("complete_fleet_task", { id: form.dataset.id, items, photos, voice: voiceOn ? fd.voice || "" : "", voiceSec: voiceOn ? fd.voiceSec : 0, driverNote: fd.driverNote, odometerKm: fd.odometerKm }); } catch (err) { return; }
        location.hash = "#drive-tasks";
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
  const period = document.getElementById("periodPick");
  if (period) period.onchange = () => { sessionStorage.setItem("period", period.value); route(); };
  const periodScope = document.getElementById("periodScope");
  if (periodScope) periodScope.onchange = () => { sessionStorage.setItem("periodScope", periodScope.value); route(); };
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
      const box = input.parentElement.querySelector(".use-preview") || (input.closest("form") && input.closest("form").querySelector(".use-preview"));
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
  document.querySelectorAll(".nav-jump:not(#category)").forEach((sel) => {
    sel.onchange = () => { if (sel.value) location.hash = sel.value; };
  });
  const taskKind = document.querySelector("[data-form=fleet-task] select[name=kind]");
  const partBox = document.getElementById("inspectParts");
  if (taskKind && partBox) {
    const syncParts = () => { partBox.style.display = taskKind.value === "inspect" ? "block" : "none"; };
    taskKind.onchange = syncParts;
    syncParts();
  }
  document.querySelectorAll(".js-seller").forEach((sel) => { const box = sel.form.querySelector(".js-new-seller"); const s = () => { box.hidden = sel.value !== "new"; if (sel.value !== "new") { sel.form.sellerName.value = ""; sel.form.sellerPhone.value = ""; } }; sel.onchange = s; });
  document.querySelectorAll(".js-nl-truck").forEach((sel) => { const dr = sel.form.querySelector(".js-nl-driver"); const s = () => { const o = sel.selectedOptions[0]; if (o && o.dataset.driver && dr) dr.value = o.dataset.driver; }; sel.addEventListener("change", s); s(); });
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
  bindMoney();
  document.querySelectorAll("input[type=date], input[type=datetime-local], input[type=month]").forEach((el) => {
    el.addEventListener("click", () => { if (el.showPicker) el.showPicker(); });
    el.addEventListener("focus", () => { if (el.showPicker) el.showPicker(); });
  });
}

// ───────────── Live GPS ─────────────
// Driver phones send a location when the app opens and then about every 45 s
// (or right away after moving 20 km) while it stays open. The admin map shows each truck's
// last known spot and how long ago it was seen.
const LIVE_EVERY_MS = 45000;
const LIVE_MIN_MOVE_M = 20000; // 20 km
const LIVE = { watch: null, last: null, lastSent: 0, lastOk: 0, status: "off", wake: null };

function livePings() {
  try { return JSON.parse(localStorage.getItem("conacrew-live") || "{}") || {}; } catch (e) { return {}; }
}
function saveLivePings(all) {
  try { localStorage.setItem("conacrew-live", JSON.stringify(all)); } catch (e) {}
}
// Accepts the server reply as { truckId: ping } or [ping, …] or { pings: … }.
function normalizePings(x) {
  const out = {};
  const rows = Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x.pings || x) : [];
  rows.forEach((p) => {
    if (p && p.truckId && isFinite(p.lat) && isFinite(p.lng)) out[p.truckId] = { ...p, at: Number(p.at) || 0 };
  });
  return out;
}
function mergePings(into, more) {
  Object.keys(more).forEach((k) => { if (!into[k] || (more[k].at || 0) > (into[k].at || 0)) into[k] = more[k]; });
  return into;
}
function metresBetween(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function agoText(at) {
  if (!at) return "never";
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " h ago";
  const d = Math.round(h / 24);
  return d + (d === 1 ? " day ago" : " days ago");
}
function whenText(at) {
  return at ? new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

function sendPing(pos, force) {
  const truck = DATA && DATA.truck;
  if (!truck) return;
  const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  const now = Date.now();
  const moved = LIVE.last ? metresBetween(LIVE.last, here) : Infinity;
  if (!force && now - LIVE.lastSent < LIVE_EVERY_MS && moved < LIVE_MIN_MOVE_M) return;
  const speed = pos.coords.speed > 0 ? pos.coords.speed : 0;
  const ping = {
    truckId: truck.id, plate: truck.plate,
    driverId: DATA.me.driverId || "", driverName: DATA.me.name || "",
    lat: here.lat, lng: here.lng, accuracy: Math.round(pos.coords.accuracy || 0),
    speed, moving: speed > 1.5, at: now,
  };
  LIVE.lastSent = now;
  LIVE.last = here;
  const all = livePings();
  all[truck.id] = ping;
  saveLivePings(all);
  fetch("/.netlify/functions/live", { method: "POST", keepalive: true, headers: { "content-type": "application/json", authorization: "Bearer " + Conacrew.token() }, body: JSON.stringify(ping) })
    .then((res) => { if (res.ok) LIVE.lastOk = now; updateLiveStatus(); })
    .catch(() => updateLiveStatus());
  updateLiveStatus();
}

function keepScreenOn() {
  let want = false;
  try { want = localStorage.getItem("conacrew-live-awake") === "1"; } catch (e) {}
  if (!want || LIVE.status !== "on" || document.hidden || !("wakeLock" in navigator)) return;
  if (LIVE.wake) return;
  navigator.wakeLock.request("screen").then((lock) => {
    LIVE.wake = lock;
    lock.addEventListener("release", () => { LIVE.wake = null; });
  }).catch(() => {});
}

function startLiveWatch(ask) {
  if (!DATA || DATA.me.role !== "driver") return;
  if (!navigator.geolocation || !DATA.truck) { updateLiveStatus(); return; }
  const begin = () => {
    try { localStorage.setItem("conacrew-live-on", "1"); } catch (e) {}
    if (LIVE.watch !== null) return;
    LIVE.status = "starting";
    updateLiveStatus();
    LIVE.watch = navigator.geolocation.watchPosition((pos) => {
      LIVE.status = "on";
      sendPing(pos);
      keepScreenOn();
    }, (err) => {
      if (err.code === 1) {
        LIVE.status = "denied";
        navigator.geolocation.clearWatch(LIVE.watch);
        LIVE.watch = null;
      } else if (LIVE.status !== "on") {
        LIVE.status = "nosignal";
      }
      updateLiveStatus();
    }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 });
  };
  if (ask) { begin(); return; } // tapping the button shows the phone's "Allow location?" popup
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: "geolocation" }).then((p) => {
      if (p.state === "granted") begin();
      else { LIVE.status = p.state === "denied" ? "denied" : "off"; updateLiveStatus(); }
      p.onchange = () => { if (p.state === "granted") begin(); };
    }).catch(() => { tryRemembered(); });
  } else {
    tryRemembered();
  }
  function tryRemembered() {
    // Older iPhones can't check permission first; restart if the driver turned it on before.
    let on = false;
    try { on = localStorage.getItem("conacrew-live-on") === "1"; } catch (e) {}
    if (on) begin(); else updateLiveStatus();
  }
}

// When the driver comes back to the app, send a fresh position straight away.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !DATA || DATA.me.role !== "driver") return;
  if (LIVE.watch !== null) {
    navigator.geolocation.getCurrentPosition((pos) => { LIVE.status = "on"; sendPing(pos, true); keepScreenOn(); }, () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
  }
});

function updateLiveStatus() {
  const box = document.getElementById("liveStatus");
  if (!box || !DATA) return;
  let awake = false;
  try { awake = localStorage.getItem("conacrew-live-awake") === "1"; } catch (e) {}
  let tone = "gold", title = "Live tracking is off", body = "The office can't see your truck.", button = true;
  if (!navigator.geolocation) { tone = "red"; title = "Location not available"; body = "This phone or browser can't share location."; button = false; }
  else if (!DATA.truck) { tone = "blue"; title = "No truck assigned"; body = "Tracking starts once the office assigns you a truck."; button = false; }
  else if (LIVE.status === "starting") { tone = "blue"; title = "Finding your location…"; body = "Allow location if your phone asks."; button = false; }
  else if (LIVE.status === "nosignal") { tone = "gold"; title = "Waiting for GPS signal"; body = "It will keep trying while the app is open."; button = false; }
  else if (LIVE.status === "denied") {
    tone = "red"; title = "Location is blocked";
    body = "iPhone: Settings › Privacy & Security › Location Services › Safari Websites (or your browser) › While Using. Android: tap the lock icon next to the web address › Permissions › Location › Allow. Then tap Try again.";
    button = true;
  } else if (LIVE.status === "on") {
    tone = "green"; title = "Live tracking on"; button = false;
    body = LIVE.lastOk ? "Office got your location " + agoText(LIVE.lastOk) + "." : LIVE.lastSent ? "Location saved on phone; not reaching the office yet." : "Getting first position…";
    body += " Updates while this app is open.";
  }
  box.innerHTML = `
    <div class="row"><div><b>${title}</b><p class="muted">${body}</p></div><span class="badge ${tone}">GPS</span></div>
    ${button ? `<button type="button" class="btn btn-primary wide" id="liveOn" style="margin-top:10px">${LIVE.status === "denied" ? "Try again" : "Turn on live tracking"}</button>` : ""}
    ${LIVE.status === "on" && "wakeLock" in navigator ? `<label class="muted" style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="liveAwake" ${awake ? "checked" : ""}/> Keep screen on while app is open</label>` : ""}`;
  const on = document.getElementById("liveOn");
  if (on) on.onclick = () => startLiveWatch(true);
  const aw = document.getElementById("liveAwake");
  if (aw) aw.onchange = () => {
    try { localStorage.setItem("conacrew-live-awake", aw.checked ? "1" : "0"); } catch (e) {}
    if (aw.checked) keepScreenOn(); else if (LIVE.wake) { LIVE.wake.release().catch(() => {}); LIVE.wake = null; }
  };
}

// Admin: Fleet page map + list of each truck's last known location.
let LIVE_MAP_TIMER = null;
function startLiveMap() {
  clearInterval(LIVE_MAP_TIMER);
  LIVE_MAP_TIMER = null;
  if (!document.getElementById("liveMap")) return;
  drawLiveMap();
  LIVE_MAP_TIMER = setInterval(() => {
    if (!document.getElementById("liveMap")) { clearInterval(LIVE_MAP_TIMER); LIVE_MAP_TIMER = null; return; }
    if (!document.hidden) drawLiveMap();
  }, 30000);
}
async function drawLiveMap() {
  const box = document.getElementById("liveMap");
  const list = document.getElementById("liveList");
  const note = document.getElementById("liveNote");
  if (!box) return;
  const pings = livePings();
  let reached = false;
  try {
    const res = await fetch("/.netlify/functions/live", { cache: "no-store", headers: { authorization: "Bearer " + Conacrew.token() } });
    if (res.ok) { mergePings(pings, normalizePings(await res.json())); reached = true; }
  } catch (e) {}
  saveLivePings(pings);
  if (!document.body.contains(box)) return; // left the page while loading

  const now = Date.now();
  const rows = (DATA.trucks || []).map((t) => {
    const p = pings[t.id];
    const d = (DATA.drivers || []).find((x) => x.id === t.assignedDriverId);
    const age = p ? now - p.at : Infinity;
    const tone = age < 10 * 60000 ? "green" : age < 24 * 3600000 ? "gold" : "red";
    let state = "No location yet";
    if (p) state = (age < 3 * 60000 && p.moving ? "Moving · " : "Last seen ") + agoText(p.at) + " · " + whenText(p.at);
    return { t, p, d, tone, state };
  });

  if (note) note.textContent = (reached ? "Updated " : "Offline · last saved · ") + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (list) list.innerHTML = rows.map(({ t, p, d, tone, state }) =>
    `<div class="card item"><div class="row"><div><b>${t.plate}</b><p class="muted">${(p && p.driverName) || (d ? d.name : "—")} · ${state}</p></div>${p ? `<span class="badge ${tone}">${tone === "green" ? "Live" : tone === "gold" ? "Earlier" : "Old"}</span>` : ""}</div></div>`
  ).join("") || `<p class="muted">No trucks yet.</p>`;

  if (!window.L || !L.map) { box.style.display = "none"; return; } // map library not loaded (offline)
  box.style.display = "";
  if (!box._map) {
    box._map = L.map(box).setView([0.3476, 32.5825], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap" }).addTo(box._map);
    box._layer = L.layerGroup().addTo(box._map);
    box._fitted = false;
  }
  box._layer.clearLayers();
  const colours = { green: "#3dff7a", gold: "#f5c400", red: "#ff8b7a" };
  const pts = [];
  rows.forEach(({ t, p, d, tone, state }) => {
    if (!p) return;
    L.circleMarker([p.lat, p.lng], { radius: 9, weight: 2, color: "#0d1b2a", fillColor: colours[tone], fillOpacity: 0.95 })
      .addTo(box._layer)
      .bindTooltip(t.plate, { permanent: true, direction: "top", offset: [0, -8] })
      .bindPopup(`<b>${t.plate}</b><br>${(p.driverName || (d && d.name) || "")}<br>${state}`);
    pts.push([p.lat, p.lng]);
  });
  if (pts.length && !box._fitted) { box._map.fitBounds(pts, { padding: [30, 30], maxZoom: 13 }); box._fitted = true; }
  setTimeout(() => box._map && box._map.invalidateSize(), 200);
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

window.route = route;
window.addEventListener("hashchange", () => { if (location.hash !== "#trucks-book") sessionStorage.removeItem("bkOnly"); if (DATA) route(); });
document.addEventListener("change", (e) => { const s = e.target.closest && e.target.closest(".js-pagepick"); if (s && s.value) location.hash = s.value; });
// ---- office sync light, and fresh data from other phones ----
function syncLight() {
  const dot = document.getElementById("syncDot");
  if (!dot) return;
  const st = Conacrew.server, ago = Conacrew.lastOk ? agoText(Conacrew.lastOk) : "";
  const [tone, tip] = st === "ok" ? ["green", "Synced with the office" + (ago ? " · " + ago : "")]
    : st === "offline" ? ["gold", "No connection · saved on this phone, will sync when back online"]
    : st === "signin" ? ["red", "Not syncing · sign out and sign in again"]
    : st === "empty" ? ["gold", "Office book not started yet · the main admin's phone starts it"]
    : st === "none" ? ["grey", "Office sync not set up on this site · this phone only"] : ["grey", "Checking…"];
  dot.className = "sync-dot " + tone;
  dot.title = tip;
  const word = document.getElementById("syncWord");
  if (word) word.textContent = st === "ok" ? "Synced" : st === "offline" ? "Offline" : st === "signin" ? "Sign in" : st === "empty" ? "Not started" : st === "none" ? "This phone only" : "…";
  const btn = document.getElementById("refresh");
  if (btn) btn.setAttribute("aria-label", "Refresh · " + tip);
  const bar = document.getElementById("syncBar");
  if (bar) {
    bar.hidden = st !== "signin";
    bar.innerHTML = st === "signin" ? `<span>Not syncing. Sign in again.</span> <button type="button" class="btn btn-primary" onclick="Conacrew.logout(); location.href='./index.html'">Sign in</button>` : "";
  }
}
function busyTyping() {
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest("#app")) return true;
  if (document.querySelector("#app form.dirty")) return true;
  return !!document.querySelector("#app .recording, #app [data-recording='1']");
}
window.addEventListener("conacrew:sync", syncLight);
window.addEventListener("conacrew:signin", () => { syncLight(); if (!Conacrew.session() && /app\.html/.test(location.pathname)) location.href = "./index.html"; });
window.addEventListener("conacrew:changed", () => {
  syncLight();
  if (!DATA) return;
  if (busyTyping()) { window.__syncPending = true; return; }
  try { const y = window.scrollY; DATA = Conacrew.bootstrap(); route(); window.scrollTo(0, y); } catch (e) { if (e.status === 401) location.href = "./index.html"; }
});
document.addEventListener("input", (e) => { const f = e.target.closest && e.target.closest("#app form"); if (f) f.classList.add("dirty"); }, true);
document.addEventListener("focusout", () => { setTimeout(() => { if (window.__syncPending && !busyTyping()) { window.__syncPending = false; window.dispatchEvent(new CustomEvent("conacrew:changed")); } }, 400); });
setInterval(syncLight, 30000);
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest("a[href^='#']");
  if (!a || !DATA) return;
  if (location.hash === a.getAttribute("href")) route();
});
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
    const f = estimateTripFuel(dead + haul, haul, truck, diesel);
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
  if (box.dataset.pick && box.dataset.drop) {
    const [pa, pb] = box.dataset.pick.split(",").map(Number); const [da, db] = box.dataset.drop.split(",").map(Number);
    pick = { lat: pa, lon: pb }; drop = { lat: da, lon: db };
    m1 = L.marker([pa, pb]).addTo(map).bindPopup("Pickup");
    m2 = L.marker([da, db]).addTo(map).bindPopup("Drop");
    map.fitBounds([[pa, pb], [da, db]], { padding: [30, 30] });
    nextPin = "pick";
    measure();
  }
  const pv = document.querySelector(".js-pv");
  const dv = document.querySelector(".js-dv");
  if (pv) {
    pv.onblur = () => flyPlace("pick");
    pv.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); flyPlace("pick"); } };
  }
  if (dv) {
    dv.onblur = () => flyPlace("drop");
    dv.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); flyPlace("drop"); } };
  }
  const jobForm = document.querySelector("[data-form=job], [data-form=driver-load]");
  if (jobForm) jobForm.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA" && e.target.type !== "submit") e.preventDefault();
  });
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
  const tSel = document.querySelector("form[data-form=job] [name=truckId]"); if (tSel) tSel.addEventListener("change", fillFuel);
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
