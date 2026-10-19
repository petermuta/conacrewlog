// Conacrew client booking: app-style, three steps (route, load, contact), then sent.
(function () {
  const API = "/.netlify/functions/book";
  const $ = (s) => document.querySelector(s);
  const form = $("#bookForm");
  const openedAt = Date.now();
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pins = { a: null, b: null };
  let active = "a", route = null, km = 0, mins = 0, step = 1, measuring = false;

  // ---- steps ----
  function go(n) {
    step = n;
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("on", Number(s.dataset.step) === n));
    document.querySelectorAll("#progress i").forEach((b, i) => b.classList.toggle("on", i < n));
    $("#progress").hidden = n === 4;
    $("#back").hidden = n === 1 || n === 4;
    $("#actionbar").hidden = n === 4;
    $("#abInfo").hidden = n !== 1;
    $("#next").textContent = n === 3 ? "Send request" : "Next";
    $("#actionbar").style.gridTemplateColumns = n === 1 ? "" : "1fr";
    err("");
    if (n === 1 && map) setTimeout(() => map.invalidateSize(), 50);
    if (n === 3) summary();
    window.scrollTo(0, 0);
    if (typeof saveDraft === "function" && n < 4) setTimeout(() => { try { saveDraft(); } catch (e) {} }, 0);
  }
  $("#back").onclick = () => go(Math.max(1, step - 1));
  $("#next").onclick = () => {
    if (step === 1) {
      if (!pins.a) return err("Pin the pickup.");
      if (!pins.b) return err("Pin the drop-off.");
      if (measuring) return;
      return go(2);
    }
    if (step === 2) {
      if (!form.cargo.value) { form.cargo.focus(); return err("Choose the material."); }
      if (Number(form.tonnes.value) > 42) { form.tonnes.focus(); return err("Max 42 tonnes per trip. Add trips instead."); }
      if (!form.date.value) return err("Choose the day.");
      return go(3);
    }
    if (step === 3) send();
  };
  function err(m) { $("#err").textContent = m || ""; }
  // every country: ISO code + dialling code (from Google's phone number data)
  const DIAL = {};
  "AC247,AD376,AE971,AF93,AG1,AI1,AL355,AM374,AO244,AR54,AS1,AT43,AU61,AW297,AX358,AZ994,BA387,BB1,BD880,BE32,BF226,BG359,BH973,BI257,BJ229,BL590,BM1,BN673,BO591,BQ599,BR55,BS1,BT975,BW267,BY375,BZ501,CA1,CC61,CD243,CF236,CG242,CH41,CI225,CK682,CL56,CM237,CN86,CO57,CR506,CU53,CV238,CW599,CX61,CY357,CZ420,DE49,DJ253,DK45,DM1,DO1,DZ213,EC593,EE372,EG20,EH212,ER291,ES34,ET251,FI358,FJ679,FK500,FM691,FO298,FR33,GA241,GB44,GD1,GE995,GF594,GG44,GH233,GI350,GL299,GM220,GN224,GP590,GQ240,GR30,GT502,GU1,GW245,GY592,HK852,HN504,HR385,HT509,HU36,ID62,IE353,IL972,IM44,IN91,IO246,IQ964,IR98,IS354,IT39,JE44,JM1,JO962,JP81,KE254,KG996,KH855,KI686,KM269,KN1,KP850,KR82,KW965,KY1,KZ7,LA856,LB961,LC1,LI423,LK94,LR231,LS266,LT370,LU352,LV371,LY218,MA212,MC377,MD373,ME382,MF590,MG261,MH692,MK389,ML223,MM95,MN976,MO853,MP1,MQ596,MR222,MS1,MT356,MU230,MV960,MW265,MX52,MY60,MZ258,NA264,NC687,NE227,NF672,NG234,NI505,NL31,NO47,NP977,NR674,NU683,NZ64,OM968,PA507,PE51,PF689,PG675,PH63,PK92,PL48,PM508,PR1,PS970,PT351,PW680,PY595,QA974,RE262,RO40,RS381,RU7,RW250,SA966,SB677,SC248,SD249,SE46,SG65,SH290,SI386,SJ47,SK421,SL232,SM378,SN221,SO252,SR597,SS211,ST239,SV503,SX1,SY963,SZ268,TA290,TC1,TD235,TG228,TH66,TJ992,TK690,TL670,TM993,TN216,TO676,TR90,TT1,TV688,TW886,TZ255,UA380,UG256,US1,UY598,UZ998,VA39,VC1,VE58,VG1,VI1,VN84,VU678,WF681,WS685,XK383,YE967,YT262,ZA27,ZM260,ZW263".split(",").forEach((x) => { DIAL[x.slice(0, 2)] = x.slice(2); });
  const NEAR = ["UG", "KE", "TZ", "RW", "SS", "CD", "BI"];
  const flag = (iso) => String.fromCodePoint(...[...iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
  let names = null; try { names = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) {}
  const countryName = (iso) => { try { return (names && names.of(iso)) || iso; } catch (e) { return iso; } };
  const opt = (iso) => `<option value="${iso}">${esc(countryName(iso))} (+${DIAL[iso]})</option>`;
  const all = Object.keys(DIAL).filter((c) => !NEAR.includes(c)).sort((a, b) => countryName(a).localeCompare(countryName(b)));
  form.cc.innerHTML = `<optgroup label="Nearby">${NEAR.map(opt).join("")}</optgroup><optgroup label="All countries">${all.map(opt).join("")}</optgroup>`;
  form.cc.value = "UG";
  const showCc = () => { $("#ccShow").textContent = flag(form.cc.value) + " +" + DIAL[form.cc.value]; };
  form.cc.addEventListener("change", showCc); showCc();
  // any country: pick the code, or type the number with + in front
  function fullPhone() {
    const raw = form.phone.value.trim(); const d = raw.replace(/\D/g, "");
    if (raw.startsWith("+")) return "+" + d;
    if (d.startsWith("00")) return "+" + d.slice(2);
    const cc = DIAL[form.cc.value] || "256";
    if (cc === "256" && d.startsWith("256") && d.length === 12) return "+" + d;
    return "+" + cc + d.replace(/^0+/, "");
  }

  form.addEventListener("input", () => err(""));
  form.addEventListener("change", () => err(""));

  // ---- load screen controls ----
  form.cargo.onchange = () => { $("#otherBox").hidden = form.cargo.value !== "Other"; };
  document.querySelectorAll("[data-step-by]").forEach((b) => { b.onclick = () => { const v = Math.max(1, Math.min(200, (Number(form.trips.value) || 1) + Number(b.dataset.stepBy))); form.trips.value = v; }; });
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const t0 = new Date(); const today = ymd(t0); const t1 = new Date(t0); t1.setDate(t1.getDate() + 1); const tomorrow = ymd(t1);
  form.date.min = today; form.date.value = today;
  const chips = $("#dayChips");
  chips.innerHTML = `<button type="button" class="on" data-d="${today}">Today</button><button type="button" data-d="${tomorrow}">Tomorrow</button><button type="button" data-d="pick">Pick a date</button>`;
  chips.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    chips.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    if (b.dataset.d === "pick") { form.date.hidden = false; form.date.value = ""; form.date.focus(); try { form.date.showPicker && form.date.showPicker(); } catch (x) {} }
    else { form.date.hidden = true; form.date.value = b.dataset.d; }
  };
  $("#timeSeg").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; $("#timeSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); form.time.value = b.dataset.v; };
  // same material list as the office uses on New job
  fetch(API + "?list=cargo", { cache: "no-store" }).then((r) => r.json()).then((j) => {
    if (!j || !Array.isArray(j.cargo) || !j.cargo.length) return;
    const keep = form.cargo.value;
    form.cargo.innerHTML = `<option value="">Choose</option>` + j.cargo.map((c) => `<option>${esc(c)}</option>`).join("") + `<option value="Other">Other</option>`;
    form.cargo.value = keep;
    fillServices(j.cargo);
  }).catch(() => {});

  // ---- our services: the same material list, pick one and book it ----
  function fillServices(list) {
    const sel = $("#svcMaterial");
    sel.innerHTML = `<option value="">See the list</option>` + list.map((c) => `<option>${esc(c)}</option>`).join("") + `<option value="Other">Something else</option>`;
  }
  fillServices([...form.cargo.options].map((o) => o.value).filter((v) => v && v !== "Other"));
  $("#svcMaterial").onchange = () => { $("#svcBook").disabled = !$("#svcMaterial").value; $("#svcBook").textContent = $("#svcMaterial").value ? "Book " + ($("#svcMaterial").value === "Other" ? "another material" : $("#svcMaterial").value) : "Book this material"; };
  $("#svcBook").onclick = () => {
    const v = $("#svcMaterial").value; if (!v) return;
    form.cargo.value = v; $("#otherBox").hidden = v !== "Other";
    $("#services").open = false;
    if (pins.a && pins.b) go(2); else { err(""); info("—", v === "Other" ? "Now tap the map for pickup" : v + ": now tap the map for pickup"); }
    if (typeof saveDraft === "function") saveDraft();
  };
  $("#services").addEventListener("toggle", () => { if (!$("#services").open && map) setTimeout(() => map.invalidateSize(), 60); else if (map) setTimeout(() => map.invalidateSize(), 60); });

  // ---- map ----
  let map = null;
  if (typeof L !== "undefined") {
    map = L.map("map", { zoomControl: false, attributionControl: true }).setView([0.35, 32.6], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    map.attributionControl.setPrefix(false);
    map.on("click", (e) => setPin(active, e.latlng.lat, e.latlng.lng));
  } else {
    $("#map").innerHTML = '<p style="padding:90px 16px 0">Map not available. Check your connection and refresh.</p>';
  }
  const icon = (k) => L.divIcon({ className: "", html: `<div class="pin-icon ${k}"><i>${k === "a" ? "A" : "B"}</i></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
  function choose(k) {
    active = k;
    document.querySelectorAll(".pin-tab").forEach((t) => { const on = t.dataset.pin === k; t.classList.toggle("on", on); t.setAttribute("aria-pressed", on ? "true" : "false"); });
    $("#q").placeholder = k === "a" ? "Search pickup" : "Search drop-off";
    $("#q").value = ""; $("#results").hidden = true;
  }
  document.querySelectorAll(".pin-tab").forEach((t) => { t.onclick = () => { choose(t.dataset.pin); const p = pins[t.dataset.pin]; if (p && map) map.panTo([p.lat, p.lng]); }; });
  function setPin(k, lat, lng, name) {
    if (!map) return;
    if (!pins[k]) {
      const m = L.marker([lat, lng], { icon: icon(k), draggable: true, title: k === "a" ? "Pickup" : "Drop-off" }).addTo(map);
      m.on("dragend", () => { const p = m.getLatLng(); Object.assign(pins[k], { lat: p.lat, lng: p.lng, name: "" }); label(k); nameOf(k); measure(); });
      pins[k] = { m, lat, lng, name: name || "" };
    } else { pins[k].m.setLatLng([lat, lng]); Object.assign(pins[k], { lat, lng, name: name || "" }); }
    label(k); if (!name) nameOf(k);
    if (k === "a" && !pins.b) choose("b");
    err(""); measure();
    if (typeof saveDraft === "function") setTimeout(() => saveDraft(), 0);
  }
  function label(k) { const p = pins[k]; $(k === "a" ? "#aName" : "#bName").textContent = p ? (p.name || "Pinned") : "Tap the map"; }
  async function nameOf(k) {
    const p = pins[k]; if (!p) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&lat=${p.lat}&lon=${p.lng}`, { headers: { Accept: "application/json" } });
      const j = await r.json(); const a = j.address || {};
      const n = [a.road || a.hamlet || a.neighbourhood || a.suburb || a.village, a.town || a.city || a.county || a.state_district].filter(Boolean).join(", ");
      if (pins[k] === p && !p.name) { p.name = n || (j.display_name || "").split(",").slice(0, 2).join(","); label(k); }
    } catch (e) {}
  }
  function info(big, sub) { $("#abInfo").innerHTML = `<span class="km-big">${big}</span><span class="ab-sub">${sub}</span>`; }
  async function measure() {
    if (!pins.a || !pins.b) { info("—", pins.a ? "Now tap the drop-off" : "Tap the map for pickup"); return; }
    measuring = true; info("…", "Measuring the road");
    const a = pins.a, b = pins.b; let geo = null;
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`);
      const j = await r.json();
      if (j.routes && j.routes[0]) { km = j.routes[0].distance / 1000; mins = j.routes[0].duration / 60 * 1.5; geo = j.routes[0].geometry; }
    } catch (e) {}
    if (!geo) { km = straight(a, b) * 1.3; mins = km / 40 * 60; }
    if (route) map.removeLayer(route);
    route = geo ? L.geoJSON(geo, { style: { color: "#10243f", weight: 5, opacity: .85 } }).addTo(map) : L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: "#10243f", weight: 4, dashArray: "8 8" }).addTo(map);
    map.fitBounds(route.getBounds(), { paddingTopLeft: [30, 140], paddingBottomRight: [30, 30] });
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    info(`${Math.round(km).toLocaleString()} km`, `${geo ? "" : "About "}${h ? h + " h " : ""}${m} min loaded`);
    measuring = false;
  }
  function straight(a, b) { const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }

  // ---- search ----
  let st = null;
  $("#q").addEventListener("input", () => { clearTimeout(st); const v = $("#q").value.trim(); if (v.length < 3) { $("#results").hidden = true; return; } st = setTimeout(() => search(v), 450); });
  $("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const f = $("#results button[data-i]"); if (f) f.click(); else search($("#q").value.trim()); } });
  async function search(v) {
    const box = $("#results");
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ug,ke,rw,tz,ss,cd&q=" + encodeURIComponent(v), { headers: { Accept: "application/json" } });
      const rows = await r.json();
      box.innerHTML = rows.length ? rows.map((x, i) => `<button type="button" data-i="${i}">${esc(x.display_name.split(",").slice(0, 3).join(","))}</button>`).join("") : `<button type="button" disabled>No match. Tap the map instead.</button>`;
      box.hidden = false;
      box.querySelectorAll("button[data-i]").forEach((b) => { b.onclick = () => { const x = rows[b.dataset.i]; box.hidden = true; $("#q").value = ""; $("#q").blur(); if (map) map.setView([+x.lat, +x.lon], 15); setPin(active, +x.lat, +x.lon, x.display_name.split(",").slice(0, 2).join(",")); }; });
    } catch (e) { box.innerHTML = `<button type="button" disabled>Search isn't available. Tap the map.</button>`; box.hidden = false; }
  }
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) $("#results").hidden = true; });
  $("#here").onclick = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => { if (map) map.setView([p.coords.latitude, p.coords.longitude], 15); setPin(active, p.coords.latitude, p.coords.longitude); },
      () => err("Location is off on this phone. Search or tap the map."), { enableHighAccuracy: true, timeout: 15000 });
  };

  // ---- review + send ----
  function dayText(v) { if (v === today) return "Today"; if (v === tomorrow) return "Tomorrow"; try { return new Date(v + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }); } catch (e) { return v; } }
  function summary() {
    const cargo = form.cargo.value === "Other" ? (form.cargoOther.value.trim() || "Other") : form.cargo.value;
    const trips = Number(form.trips.value) || 1;
    $("#summary").innerHTML = `<span>From</span><b>${esc(pins.a && pins.a.name || "Pinned")}</b><span>To</span><b>${esc(pins.b && pins.b.name || "Pinned")}</b><span>Load</span><b>${esc(cargo)}, ${trips} trip${trips > 1 ? "s" : ""}${form.tonnes.value ? ", " + esc(form.tonnes.value) + " t" : ""}</b><span>When</span><b>${dayText(form.date.value)}${form.time.value ? ", " + form.time.value.toLowerCase() : ""}</b><span>Distance</span><b>${Math.round(km)} km</b>`;
  }
  async function send() {
    if (!form.name.value.trim()) { $("#meCard").hidden = true; $("#meForm").hidden = false; form.name.focus(); return err("Enter your name."); }
    const intl = fullPhone();
    if (!/^\+\d{8,15}$/.test(intl)) { $("#meCard").hidden = true; $("#meForm").hidden = false; form.phone.focus(); return err("Enter your phone number."); }
    const btn = $("#next"); btn.disabled = true; btn.textContent = "Sending…";
    const body = {
      op: "request", openedAt, website: form.website.value,
      name: form.name.value, company: form.company.value, phone: intl, whatsapp: form.whatsapp.checked,
      cargo: form.cargo.value === "Other" ? (form.cargoOther.value.trim() || "Other") : form.cargo.value,
      trips: form.trips.value, tonnes: form.tonnes.value, date: form.date.value, time: form.time.value, notes: form.notes.value,
      pickup: { name: pins.a.name, lat: pins.a.lat, lng: pins.a.lng }, drop: { name: pins.b.name, lat: pins.b.lat, lng: pins.b.lng }, km: Math.round(km),
    };
    try {
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ref) throw new Error(j.error || "Couldn't send. Check your connection and try again.");
      const link = location.origin + "/track.html?r=" + encodeURIComponent(j.ref) + "&k=" + encodeURIComponent(j.key);
      try { localStorage.setItem("conacrew.myBooking", link); } catch (x) {}
      remember(j.ref, link, body);
      $("#ref").textContent = j.ref;
      $("#via").textContent = form.whatsapp.checked ? "We'll send your quote on WhatsApp." : "We'll call you with your quote.";
      $("#trackLink").value = link; $("#openTrack").href = link;
      $("#waOffice").href = "https://wa.me/14043768549?text=" + encodeURIComponent("Hello Conacrew, I just sent booking " + j.ref + ".");
      go(4);
      saveDraft({ done: { ref: j.ref, link, via: $("#via").textContent } });
    } catch (x) { err(x.message); }
    btn.disabled = false; btn.textContent = "Send request";
  }
  // ---- returning clients: this phone remembers their details, places and bookings ----
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  function remember(ref, link, body) {
    store.set("conacrew.client", { name: body.name.trim(), company: body.company.trim(), phone: body.phone, whatsapp: body.whatsapp });
    const pl = store.get("conacrew.places", []).filter((p) => ![body.pickup, body.drop].some((q) => Math.abs(q.lat - p.lat) < 0.002 && Math.abs(q.lng - p.lng) < 0.002));
    store.set("conacrew.places", [body.pickup, body.drop].concat(pl).slice(0, 8));
    store.set("conacrew.lastRoute", { a: body.pickup, b: body.drop });
    store.set("conacrew.myBookings", [{ ref, link, cargo: body.cargo, date: body.date, from: body.pickup.name, to: body.drop.name, at: Date.now() }].concat(store.get("conacrew.myBookings", []).filter((x) => x.ref !== ref)).slice(0, 30));
    showMe(); showRecent();
  }
  function showMe() {
    const me = store.get("conacrew.client", null);
    if (!me || !me.name || !me.phone) { $("#meCard").hidden = true; $("#meForm").hidden = false; return; }
    form.name.value = me.name; form.company.value = me.company || ""; form.phone.value = me.phone; form.whatsapp.checked = me.whatsapp !== false;
    $("#meName").textContent = me.name + (me.company ? ", " + me.company : "");
    $("#mePhone").textContent = me.phone;
    $("#meCard").hidden = false; $("#meForm").hidden = true;
  }
  $("#meEdit").onclick = () => { $("#meCard").hidden = true; $("#meForm").hidden = false; form.name.focus(); };
  const short = (n) => String(n || "Pinned").split(",")[0];
  function showRecent() {
    const box = $("#recent");
    const last = store.get("conacrew.lastRoute", null);
    const seen = new Set();
    const pl = store.get("conacrew.places", []).filter((p) => { const n = short(p.name).toLowerCase(); if (seen.has(n)) return false; seen.add(n); return true; }).slice(0, 5);
    if (!last && !pl.length) { box.hidden = true; return; }
    box.innerHTML = (last ? `<button type="button" class="route" data-route="1">Last route: ${esc(short(last.a.name))} to ${esc(short(last.b.name))}</button>` : "")
      + pl.map((p, i) => `<button type="button" data-place="${i}">${esc(short(p.name))}</button>`).join("");
    box.hidden = false;
    box.querySelectorAll("[data-route]").forEach((b) => { b.onclick = () => useRoute(last); });
    box.querySelectorAll("[data-place]").forEach((b) => { b.onclick = () => { const p = pl[b.dataset.place]; if (map) map.setView([p.lat, p.lng], 14); setPin(active, p.lat, p.lng, p.name); }; });
  }
  function useRoute(r) { if (!r || !map) return; setPin("a", r.a.lat, r.a.lng, r.a.name); setPin("b", r.b.lat, r.b.lng, r.b.name); }
  function clearPins() { ["a", "b"].forEach((k) => { if (pins[k] && map) map.removeLayer(pins[k].m); pins[k] = null; label(k); }); if (route && map) map.removeLayer(route); route = null; km = 0; choose("a"); measure(); }
  function freshLoad() {
    form.cargo.value = ""; form.cargoOther.value = ""; $("#otherBox").hidden = true; form.trips.value = 1; form.tonnes.value = ""; form.notes.value = "";
    chips.querySelector("button").click(); $("#timeSeg button").click();
  }
  $("#sameRoute").onclick = () => { freshLoad(); go(2); saveDraft(); };
  $("#newRoute").onclick = () => { freshLoad(); clearPins(); go(1); saveDraft(); };
  $("#copy").onclick = async () => { const v = $("#trackLink").value; try { await navigator.clipboard.writeText(v); $("#copy").textContent = "Link copied"; } catch (e) { prompt("Copy your booking link", v); } };

  // ---- refresh without losing anything: the page keeps a draft while it's open ----
  const DRAFT = "conacrew.bookDraft";
  const FIELDS = ["cargo", "cargoOther", "trips", "tonnes", "date", "time", "notes", "name", "company", "cc", "phone"];
  function saveDraft(extra) {
    if (step === 4 && !extra) return; // keep the "sent" screen as it is
    const d = { step, pins: { a: pins.a && { lat: pins.a.lat, lng: pins.a.lng, name: pins.a.name }, b: pins.b && { lat: pins.b.lat, lng: pins.b.lng, name: pins.b.name } }, f: {}, wa: form.whatsapp.checked, day: (chips.querySelector("button.on") || {}).dataset && chips.querySelector("button.on").dataset.d, at: Date.now(), ...(extra || {}) };
    FIELDS.forEach((k) => { d.f[k] = form[k] ? form[k].value : ""; });
    try { sessionStorage.setItem(DRAFT, JSON.stringify(d)); } catch (e) {}
  }
  function restoreDraft() {
    let d = null; try { d = JSON.parse(sessionStorage.getItem(DRAFT) || "null"); } catch (e) {}
    if (!d || Date.now() - (d.at || 0) > 6 * 3600e3) return false;
    if (d.done) { $("#ref").textContent = d.done.ref; $("#via").textContent = d.done.via; $("#trackLink").value = d.done.link; $("#openTrack").href = d.done.link; go(4); return true; }
    FIELDS.forEach((k) => { if (form[k] && d.f && d.f[k] != null) form[k].value = d.f[k]; });
    form.whatsapp.checked = d.wa !== false;
    $("#otherBox").hidden = form.cargo.value !== "Other";
    if (typeof showCc === "function") showCc();
    const dayBtn = [...chips.querySelectorAll("button")].find((x) => x.dataset.d === d.day) || chips.querySelector('[data-d="pick"]');
    chips.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === dayBtn));
    form.date.hidden = !(dayBtn && dayBtn.dataset.d === "pick");
    $("#timeSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.v === form.time.value));
    if (d.pins && d.pins.a) setPin("a", d.pins.a.lat, d.pins.a.lng, d.pins.a.name);
    if (d.pins && d.pins.b) setPin("b", d.pins.b.lat, d.pins.b.lng, d.pins.b.name);
    if (d.step > 1 && d.step < 4 && d.pins && d.pins.a && d.pins.b) setTimeout(() => go(d.step), 30);
    return true;
  }
  form.addEventListener("input", () => saveDraft());
  form.addEventListener("change", () => saveDraft());
  form.addEventListener("click", () => setTimeout(() => saveDraft(), 0));
  $("#reload").onclick = () => { saveDraft(); location.reload(); };

  go(1); info("—", "Tap the map for pickup");
  showMe(); showRecent();
  const restored = restoreDraft();
  // "Book again" from a booking page: same route, straight to the load
  if (!restored && new URLSearchParams(location.search).get("same")) { const last = store.get("conacrew.lastRoute", null); if (last) { useRoute(last); setTimeout(() => go(2), 50); } }
})();
