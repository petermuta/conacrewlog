// Conacrew client booking page: pins on a map, road distance, send a quote request.
(function () {
  const API = "/.netlify/functions/book";
  const $ = (s) => document.querySelector(s);
  const form = $("#bookForm");
  const openedAt = Date.now();
  const pins = { a: null, b: null };
  let active = "a", route = null, km = 0, mins = 0;

  // date: today onwards
  const d = new Date(); const today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  form.date.min = today; form.date.value = today;
  form.cargo.onchange = () => { $("#otherBox").hidden = form.cargo.value !== "Other"; };
  // same material list as the office uses on New job
  fetch(API + "?list=cargo", { cache: "no-store" }).then((r) => r.json()).then((j) => {
    if (!j || !Array.isArray(j.cargo) || !j.cargo.length) return;
    const keep = form.cargo.value;
    form.cargo.innerHTML = `<option value="">Choose</option>` + j.cargo.map((c) => `<option>${esc(c)}</option>`).join("") + `<option value="Other">Other</option>`;
    form.cargo.value = keep;
  }).catch(() => {});

  // ---- map ----
  let map = null;
  const hasMap = typeof L !== "undefined";
  if (hasMap) {
    map = L.map("map", { zoomControl: true }).setView([0.35, 32.6], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    map.on("click", (e) => setPin(active, e.latlng.lat, e.latlng.lng));
  } else {
    $("#map").innerHTML = '<p style="padding:16px">The map could not load. Check your connection and refresh.</p>';
  }
  const icon = (k) => L.divIcon({ className: "", html: `<div class="pin-icon ${k}"><i>${k === "a" ? "A" : "B"}</i></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });

  function choose(k) {
    active = k;
    document.querySelectorAll(".pin-tab").forEach((t) => { const on = t.dataset.pin === k; t.classList.toggle("on", on); t.setAttribute("aria-pressed", on ? "true" : "false"); });
    $("#q").placeholder = k === "a" ? "Search pickup, e.g. Kigo sand landing" : "Search drop-off, e.g. Mukono town";
    $("#q").value = "";
    $("#results").hidden = true;
  }
  document.querySelectorAll(".pin-tab").forEach((t) => { t.onclick = () => { choose(t.dataset.pin); const p = pins[t.dataset.pin]; if (p && map) map.panTo([p.lat, p.lng]); }; });

  function setPin(k, lat, lng, name) {
    if (!map) return;
    if (!pins[k]) {
      const m = L.marker([lat, lng], { icon: icon(k), draggable: true, keyboard: true, title: k === "a" ? "Pickup" : "Drop-off" }).addTo(map);
      m.on("dragend", () => { const p = m.getLatLng(); pins[k].lat = p.lat; pins[k].lng = p.lng; pins[k].name = ""; label(k); nameOf(k); measure(); });
      pins[k] = { m, lat, lng, name: name || "" };
    } else {
      pins[k].m.setLatLng([lat, lng]); Object.assign(pins[k], { lat, lng, name: name || "" });
    }
    label(k);
    if (!name) nameOf(k);
    if (k === "a" && !pins.b) choose("b");
    measure();
  }
  function label(k) { const p = pins[k]; $(k === "a" ? "#aName" : "#bName").textContent = p ? (p.name || (p.lat.toFixed(4) + ", " + p.lng.toFixed(4))) : "Not set"; }
  async function nameOf(k) {
    const p = pins[k]; if (!p) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&lat=${p.lat}&lon=${p.lng}`, { headers: { Accept: "application/json" } });
      const j = await r.json();
      const a = j.address || {};
      const n = [a.road || a.hamlet || a.neighbourhood || a.suburb || a.village, a.town || a.city || a.county || a.state_district].filter(Boolean).join(", ");
      if (pins[k] === p && !p.name) { p.name = n || (j.display_name || "").split(",").slice(0, 2).join(","); label(k); }
    } catch (e) {}
  }
  async function measure() {
    const t = $("#trip");
    if (!pins.a || !pins.b) { t.className = "trip empty"; t.innerHTML = `<div class="km">${pins.a ? "Now pin the drop-off" : "Pin both places to see the distance"}</div><div class="meta"></div>`; return; }
    t.className = "trip"; t.innerHTML = `<div class="km">…</div><div class="meta">Measuring the road</div>`;
    const a = pins.a, b = pins.b;
    let geo = null;
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`);
      const j = await r.json();
      if (j.routes && j.routes[0]) { km = j.routes[0].distance / 1000; mins = j.routes[0].duration / 60 * 1.5; geo = j.routes[0].geometry; }
    } catch (e) {}
    if (!geo) { km = straight(a, b) * 1.3; mins = km / 40 * 60; }
    if (route) map.removeLayer(route);
    route = geo ? L.geoJSON(geo, { style: { color: "#10243f", weight: 5, opacity: .85 } }).addTo(map) : L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: "#10243f", weight: 4, dashArray: "8 8" }).addTo(map);
    map.fitBounds(route.getBounds(), { padding: [40, 40] });
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    t.innerHTML = `<div class="km">${Math.round(km).toLocaleString()}<small>km</small></div><div class="meta">${geo ? "By road" : "Approximate"}<br/>About ${h ? h + " h " : ""}${m} min loaded</div>`;
  }
  function straight(a, b) {
    const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  // ---- search ----
  let st = null;
  $("#q").addEventListener("input", () => { clearTimeout(st); const v = $("#q").value.trim(); if (v.length < 3) { $("#results").hidden = true; return; } st = setTimeout(() => search(v), 450); });
  $("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const f = $("#results button"); if (f) f.click(); else search($("#q").value.trim()); } });
  async function search(v) {
    const box = $("#results");
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ug,ke,rw,tz,ss,cd&q=" + encodeURIComponent(v), { headers: { Accept: "application/json" } });
      const rows = await r.json();
      if (!rows.length) { box.innerHTML = `<button type="button" disabled>No match. Try a nearby town or tap the map.</button>`; box.hidden = false; return; }
      box.innerHTML = rows.map((x, i) => `<button type="button" data-i="${i}">${esc(x.display_name.split(",").slice(0, 3).join(","))}</button>`).join("");
      box.hidden = false;
      box.querySelectorAll("button[data-i]").forEach((b) => { b.onclick = () => {
        const x = rows[b.dataset.i];
        box.hidden = true; $("#q").value = "";
        if (map) map.setView([+x.lat, +x.lon], 15);
        setPin(active, +x.lat, +x.lon, x.display_name.split(",").slice(0, 2).join(","));
      }; });
    } catch (e) { box.innerHTML = `<button type="button" disabled>Search isn't available. Tap the map instead.</button>`; box.hidden = false; }
  }
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) $("#results").hidden = true; });
  $("#here").onclick = () => {
    if (!navigator.geolocation) return;
    $("#here").textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition((p) => { $("#here").textContent = "Use my location"; if (map) map.setView([p.coords.latitude, p.coords.longitude], 15); setPin(active, p.coords.latitude, p.coords.longitude); },
      () => { $("#here").textContent = "Use my location"; err("Location is blocked on this phone. Search or tap the map instead."); }, { enableHighAccuracy: true, timeout: 15000 });
  };
  $("#clear").onclick = () => { ["a", "b"].forEach((k) => { if (pins[k]) map.removeLayer(pins[k].m); pins[k] = null; label(k); }); if (route) map.removeLayer(route); route = null; km = 0; choose("a"); measure(); };

  // ---- send ----
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function err(m) { $("#err").textContent = m || ""; }
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); err("");
    if (!pins.a || !pins.b) { err("Pin the pickup and the drop-off on the map."); $("#h-route").scrollIntoView({ behavior: "smooth" }); return; }
    if (!form.cargo.value) { err("Choose what you're moving."); form.cargo.focus(); return; }
    if (Number(form.tonnes.value) > 42) { err("Our truck carries up to 42 tonnes per trip. Add more trips instead."); form.tonnes.focus(); return; }
    if (!form.name.value.trim()) { err("Enter your name."); form.name.focus(); return; }
    if (form.phone.value.replace(/\D/g, "").length < 9) { err("Enter your phone number."); form.phone.focus(); return; }
    const btn = $("#send"); btn.disabled = true; btn.textContent = "Sending…";
    const body = {
      op: "request", openedAt, website: form.website.value,
      name: form.name.value, company: form.company.value, phone: form.phone.value, email: form.email.value, whatsapp: form.whatsapp.checked,
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
      $("#via").textContent = form.whatsapp.checked ? "on WhatsApp" : "by phone";
      $("#trackLink").value = link; $("#openTrack").href = link;
      form.hidden = true; $("#done").hidden = false; $("#done").scrollIntoView({ behavior: "smooth" });
    } catch (x) {
      err(x.message); btn.disabled = false; btn.textContent = "Request a quote";
    }
  });
  $("#copy").onclick = async () => { const v = $("#trackLink").value; try { await navigator.clipboard.writeText(v); $("#copy").textContent = "Copied"; } catch (e) { $("#trackLink").select(); } };
})();
