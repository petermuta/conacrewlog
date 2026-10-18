// Conacrew client booking status: progress, quote, accept.
(function () {
  const API = "/.netlify/functions/book";
  const box = document.getElementById("box");
  const q = new URLSearchParams(location.search);
  let r = q.get("r") || "", k = q.get("k") || "";
  if (!r) { try { const saved = new URL(localStorage.getItem("conacrew.myBooking") || ""); r = saved.searchParams.get("r"); k = saved.searchParams.get("k"); } catch (e) {} }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ugx = (n) => "UGX " + Math.round(Number(n) || 0).toLocaleString("en-UG");
  const day = (s) => { if (!s) return ""; const d = new Date(String(s).length === 10 ? s + "T12:00:00" : s); return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" }); };
  if (!r || !k) {
    box.innerHTML = `<h2>Check a booking</h2><p class="sub">Open the link we sent you, or the one you saved after booking.</p><a class="btn btn-go" href="./book.html">Book a truck</a>`;
    return;
  }
  const STEPS = [
    ["new", "Request received", "We're working out your price."],
    ["quoted", "Quote ready", "Check the price below and accept it."],
    ["accepted", "Quote accepted", "We're assigning a truck."],
    ["assigned", "Truck booked", "Your load is on our schedule."],
    ["loading", "Loading", "The truck is at the pickup."],
    ["on_the_way", "On the way", "Your load is heading to you."],
    ["delivered", "Delivered", "Thank you for using Conacrew."],
  ];
  const order = (s) => ({ new: 0, seen: 0, quoted: 1, accepted: 2, confirmed: 3, assigned: 3, loading: 4, on_the_way: 5, delivered: 6 })[s];
  let mini = null;
  async function load() {
    try {
      const res = await fetch(API + "?r=" + encodeURIComponent(r) + "&k=" + encodeURIComponent(k), { cache: "no-store" });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error || "We couldn't load this booking.");
      draw(b);
    } catch (e) { box.innerHTML = `<h2>Booking not found</h2><p class="sub">${esc(e.message)}</p><a class="btn btn-go" href="./book.html">Book a truck</a>`; }
  }
  function draw(b) {
    const at = order(b.step);
    const closed = b.step === "declined" || b.step === "client_declined";
    const steps = closed ? "" : `<ol class="steps">${STEPS.map(([key, t, s], i) => `<li class="${i < at ? "done-step" : i === at ? "now" : ""}">${t}${i === at ? `<small>${s}</small>` : ""}</li>`).join("")}</ol>`;
    const quote = b.quote ? `<div class="quote">
        <div class="sub" style="margin:0">Your quote</div>
        <div class="amt">${ugx(b.quote.amountUgx)}</div>
        ${b.quote.note ? `<p style="margin:8px 0 0">${esc(b.quote.note)}</p>` : ""}
        ${b.step === "quoted" ? `<p class="fine">Valid until ${day(b.quote.validUntil)}</p>
          <div class="btns"><button type="button" class="btn btn-go" id="yes">Accept quote</button><button type="button" class="btn btn-line" id="no">Not now</button></div>` : ""}
        ${b.clientAnswer && b.clientAnswer.answer === "accept" ? `<div class="banner ok">You accepted this quote on ${day(b.clientAnswer.at)}.</div>` : ""}
      </div>` : "";
    const closedMsg = b.step === "declined" ? `<div class="banner bad">We can't take this load${b.declineNote ? ": " + esc(b.declineNote) : "."} Call us if you'd like to change the date or route.</div>`
      : b.step === "client_declined" ? `<div class="banner bad">You turned down this quote. <a href="./book.html">Book again</a> any time.</div>` : "";
    box.innerHTML = `
      <p class="sub" style="margin:0">Booking</p>
      <div class="ref">${esc(b.ref)}</div>
      ${closedMsg}${steps}${quote}
      <dl class="facts">
        <dt>Load</dt><dd>${esc(b.cargo)}${b.trips > 1 ? ", " + b.trips + " trips" : ""}${b.tonnes ? ", " + b.tonnes + " t" : ""}</dd>
        <dt>Date</dt><dd>${day(b.date)}</dd>
        <dt>Pickup</dt><dd>${esc(b.pickup && b.pickup.name || "Pinned on map")}</dd>
        <dt>Drop-off</dt><dd>${esc(b.drop && b.drop.name || "Pinned on map")}</dd>
        ${b.km ? `<dt>Distance</dt><dd>${b.km.toLocaleString()} km</dd>` : ""}
        ${b.truck ? `<dt>Truck</dt><dd>${esc(b.truck.plate)}</dd>` : ""}
      </dl>
      <div id="mini"></div>`;
    if (typeof L !== "undefined" && b.pickup && b.drop) {
      mini = L.map("mini", { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mini);
      const pin = (c, t) => L.divIcon({ className: "", html: `<div class="pin-icon ${c}"><i>${t}</i></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
      L.marker([b.pickup.lat, b.pickup.lng], { icon: pin("a", "A") }).addTo(mini);
      L.marker([b.drop.lat, b.drop.lng], { icon: pin("b", "B") }).addTo(mini);
      mini.fitBounds([[b.pickup.lat, b.pickup.lng], [b.drop.lat, b.drop.lng]], { padding: [36, 36] });
    } else document.getElementById("mini").remove();
    const ans = async (answer) => {
      const btns = box.querySelectorAll(".quote .btn"); btns.forEach((x) => { x.disabled = true; });
      try {
        const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "answer", r, k, answer }) });
        const j = await res.json();
        if (!res.ok && !j.ref) throw new Error(j.error || "Couldn't send your answer.");
        draw(j.ref ? j : b);
      } catch (e) { btns.forEach((x) => { x.disabled = false; }); alert(e.message); }
    };
    const y = document.getElementById("yes"), n = document.getElementById("no");
    if (y) y.onclick = () => ans("accept");
    if (n) n.onclick = () => { if (confirm("Turn down this quote?")) ans("decline"); };
  }
  load();
  setInterval(() => { if (!document.hidden && !document.querySelector(".quote .btn[disabled]")) load(); }, 60000);
})();
