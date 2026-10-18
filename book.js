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
  // any country: pick the code, or type the number with + in front
  function fullPhone() {
    const raw = form.phone.value.trim(); const d = raw.replace(/\D/g, "");
    if (raw.startsWith("+")) return "+" + d;
    if (d.startsWith("00")) return "+" + d.slice(2);
    const cc = form.cc.value;
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
  }).catch(() => {});

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
    if (!form.name.value.trim()) { form.name.focus(); return err("Enter your name."); }
    const intl = fullPhone();
    if (!/^\+\d{8,15}$/.test(intl)) { form.phone.focus(); return err("Enter your phone number."); }
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
      $("#ref").textContent = j.ref;
      $("#via").textContent = form.whatsapp.checked ? "We'll send your quote on WhatsApp." : "We'll call you with your quote.";
      $("#trackLink").value = link; $("#openTrack").href = link;
      go(4);
    } catch (x) { err(x.message); }
    btn.disabled = false; btn.textContent = "Send request";
  }
  $("#copy").onclick = async () => { const v = $("#trackLink").value; try { await navigator.clipboard.writeText(v); $("#copy").textContent = "Link copied"; } catch (e) { prompt("Copy your booking link", v); } };
  try { if (localStorage.getItem("conacrew.myBooking")) $("#myBooking").href = localStorage.getItem("conacrew.myBooking"); } catch (e) {}
  go(1); info("—", "Tap the map for pickup");
})();
