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
    ["quoted", "Quote ready", "Choose how to pay below to confirm."],
    ["payment_check", "Payment sent", "We're checking it now."],
    ["accepted", "Booking confirmed", "We're assigning a truck."],
    ["assigned", "Truck booked", "Your load is on our schedule."],
    ["loading", "Loading", "The truck is at the pickup."],
    ["on_the_way", "On the way", "Your load is heading to you."],
    ["delivered", "Delivered", "Thank you for using Conacrew."],
  ];
  const order = (s) => ({ new: 0, seen: 0, quoted: 1, payment_check: 2, accepted: 3, confirmed: 4, assigned: 4, loading: 5, on_the_way: 6, delivered: 7 })[s];
  let plan = "full", method = "airtel";
  const fmtNum = (n) => String(n || "").replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3");
  function payBox(b) {
    const pl = b.plans, pi = b.payInfo || {};
    const due = pl[plan].due;
    const rej = b.payment && b.payment.status === "rejected" ? `<div class="banner bad">${esc(b.payment.note || "We couldn't find your payment.")}</div>` : "";
    return `<div class="quote" id="payBox">
      <div class="sub" style="margin:0">Your quote</div>
      <div class="amt">${ugx(b.quote.amountUgx)}</div>
      ${b.quote.note ? `<p style="margin:6px 0 0">${esc(b.quote.note)}</p>` : ""}
      ${rej}
      <div class="plans" role="radiogroup" aria-label="How much to pay now">
        <button type="button" class="plan ${plan === "full" ? "on" : ""}" data-plan="full" role="radio" aria-checked="${plan === "full"}"><b>Pay 100%</b><span class="p-amt">${ugx(pl.full.due)}</span><span class="save">Save ${ugx(b.quote.amountUgx - pl.full.total)}</span></button>
        <button type="button" class="plan ${plan === "deposit" ? "on" : ""}" data-plan="deposit" role="radio" aria-checked="${plan === "deposit"}"><b>Pay 75% now</b><span class="p-amt">${ugx(pl.deposit.due)}</span><span class="rest">${ugx(pl.deposit.balance)} on delivery</span></button>
      </div>
      <div class="seg pay-seg"><button type="button" class="${method === "airtel" ? "on" : ""}" data-method="airtel">Airtel Money</button><button type="button" class="${method === "bank" ? "on" : ""}" data-method="bank">Bank</button></div>
      <div class="pay-how">${method === "airtel" && pi.airtel ? `
        <div class="ph-row"><span>Send</span><b>${ugx(due)}</b></div>
        <div class="ph-row"><span>To</span><b>${esc(fmtNum(pi.airtel.number))}</b><button type="button" class="copy" data-copy="${esc(pi.airtel.number)}">Copy</button></div>
        <div class="ph-row"><span>Name</span><b>${esc(pi.airtel.name)}</b></div>` : pi.bank ? `
        <div class="ph-row"><span>Amount</span><b>${ugx(due)}</b></div>
        <div class="ph-row"><span>Bank</span><b>${esc(pi.bank.bank)}</b></div>
        <div class="ph-row"><span>Name</span><b>${esc(pi.bank.name)}</b></div>
        <div class="ph-row"><span>Account</span><b>${esc(pi.bank.account)}</b><button type="button" class="copy" data-copy="${esc(pi.bank.account)}">Copy</button></div>
        ${pi.bank.code ? `<div class="ph-row"><span>Code</span><b>${esc(pi.bank.code)}</b></div>` : ""}` : ""}
        <div class="ph-row"><span>Reference</span><b>${esc(b.ref)}</b></div>
      </div>
      <label class="f">Transaction ID<input class="in" id="txn" autocomplete="off" placeholder="${method === "airtel" ? "From the Airtel SMS" : "From your bank slip"}" /></label>
      <label class="f">Paid by <small>(name, optional)</small><input class="in" id="payer" autocomplete="name" /></label>
      <p class="err" id="payErr"></p>
      <button type="button" class="btn btn-go" id="paid">I've paid, confirm booking</button>
      <button type="button" class="btn-text" id="no">Not now</button>
    </div>`;
  }
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
    const quote = b.step === "quoted" && b.plans ? payBox(b) : b.quote ? `<div class="quote">
        <div class="sub" style="margin:0">Your quote</div>
        <div class="amt">${ugx(b.quote.amountUgx)}</div>
        ${b.quote.note ? `<p style="margin:8px 0 0">${esc(b.quote.note)}</p>` : ""}
        ${b.step === "quoted" ? `<p class="fine">Valid until ${day(b.quote.validUntil)}</p>
          <div class="btns"><button type="button" class="btn btn-go" id="yes">Accept quote</button><button type="button" class="btn btn-line" id="no">Not now</button></div>` : ""}
        ${b.payment && b.payment.status === "checking" ? `<div class="banner ok">We're checking your payment of ${ugx(b.payment.due)}.</div>` : ""}
        ${b.payment && b.payment.status === "received" ? `<div class="banner ok">Paid ${ugx(b.payment.due)}${b.payment.balance ? `. ${b.payment.balancePaidAt ? "Balance paid." : ugx(b.payment.balance) + " due on delivery."}` : ", nothing more to pay."}</div>` : ""}
        ${b.payment && b.payment.status === "account" ? `<div class="banner ok">${b.payment.balancePaidAt ? "Paid in full." : "Pay " + ugx(b.payment.balance) + " on delivery."}</div>` : ""}
      </div>` : "";
    const closeNote = order(b.step) >= 2 && b.step !== "delivered" ? `<p class="close-note">You can close this page. We'll send updates to your WhatsApp.</p>` : "";
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
      <div id="mini"></div>${closeNote}`;
    if (typeof L !== "undefined" && b.pickup && b.drop) {
      mini = L.map("mini", { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mini);
      const pin = (c, t) => L.divIcon({ className: "", html: `<div class="pin-icon ${c}"><i>${t}</i></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
      L.marker([b.pickup.lat, b.pickup.lng], { icon: pin("a", "A") }).addTo(mini);
      L.marker([b.drop.lat, b.drop.lng], { icon: pin("b", "B") }).addTo(mini);
      mini.fitBounds([[b.pickup.lat, b.pickup.lng], [b.drop.lat, b.drop.lng]], { padding: [36, 36] });
    } else document.getElementById("mini").remove();
    box.querySelectorAll("[data-plan]").forEach((x) => { x.onclick = () => { plan = x.dataset.plan; draw(b); document.getElementById("payBox").scrollIntoView({ block: "nearest" }); }; });
    box.querySelectorAll("[data-method]").forEach((x) => { x.onclick = () => { method = x.dataset.method; draw(b); }; });
    box.querySelectorAll("[data-copy]").forEach((x) => { x.onclick = async () => { try { await navigator.clipboard.writeText(x.dataset.copy); x.textContent = "Copied"; } catch (e) {} }; });
    const post = async (payload) => {
      const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ r, k, ...payload }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok && !j.ref) throw new Error(j.error || "Couldn't send. Check your connection.");
      return j;
    };
    const paid = document.getElementById("paid");
    if (paid) paid.onclick = async () => {
      const txn = document.getElementById("txn").value.trim();
      const e = document.getElementById("payErr");
      if (txn.length < 4) { e.textContent = "Enter the transaction ID from your payment message."; document.getElementById("txn").focus(); return; }
      paid.disabled = true; paid.textContent = "Sending…";
      try { const j = await post({ op: "pay", plan, method, txn, payer: document.getElementById("payer").value }); draw(j.ref ? j : b); window.scrollTo(0, 0); }
      catch (x) { e.textContent = x.message; paid.disabled = false; paid.textContent = "I've paid, confirm booking"; }
    };
    const n = document.getElementById("no");
    if (n) n.onclick = async () => { if (!confirm("Turn down this quote?")) return; try { const j = await post({ op: "answer", answer: "decline" }); draw(j.ref ? j : b); } catch (x) { alert(x.message); } };
  }
  load();
  // refresh every minute, but never while the client is filling in the payment
  setInterval(() => { if (!document.hidden && !document.getElementById("payBox")) load(); }, 60000);
})();
