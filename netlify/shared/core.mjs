// Conacrew server core: one office book, shared by every phone.
// - Phones send only what changed; the server merges record by record (newest edit wins per record).
// - Sign-in is checked here (PIN, approved phone, lock after 5 wrong PINs), and every request needs a signed token.
// - Photos, voice notes and files are moved out of the book into their own storage, so the book stays small.
// Storage is passed in (Netlify Blobs in production, memory in tests).
import crypto from "node:crypto";

export const SESSION_HOURS = 24;
const MAIN_ADMIN_DAYS = 30;
const MAX_TRIES = 5;
const MEDIA_MIN = 1500; // data URLs longer than this go to media storage
const TOMBSTONE_DAYS = 180;
const LOCAL_ONLY = new Set(["updatedAt", "mediaTrimmedAt", "_meta"]);
const SERVER_ONLY = new Set(["loginLog"]); // phones can't write these
const MAIN_ADMIN_ONLY = new Set(["users", "trustedDevices"]); // only the main admin can change logins
const ADMIN_ONLY = new Set(["bookings"]); // client booking requests: admin and Admin II only

export const isMainAdmin = (u) => !!u && u.role === "admin" && !u.assistant;
export function phoneKey(v) {
  let p = String(v || "").replace(/\D/g, "");
  if (p.startsWith("256")) p = p.slice(3);
  if (p.length === 9) p = "0" + p;
  return p;
}
export const pinHash = (userId, pin) => crypto.createHash("sha256").update(String(userId) + ":" + String(pin)).digest("hex");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const isRecList = (v) => Array.isArray(v) && v.every((x) => x && typeof x === "object" && !Array.isArray(x) && (typeof x.id === "string" || typeof x.id === "number"));
const now = () => Date.now();

// ---------- storage helpers ----------
async function loadBook(kv) {
  const got = await kv.get("book");
  if (!got) return { book: null, etag: null };
  return { book: JSON.parse(got.text), etag: got.etag };
}
// read-modify-write with a retry if another phone saved at the same moment
async function updateBook(kv, fn) {
  for (let i = 0; i < 6; i++) {
    const { book, etag } = await loadBook(kv);
    const res = await fn(book);
    if (res.write === false) return res;
    const ok = await kv.set("book", JSON.stringify(res.book), etag ? { etag } : { onlyIfNew: true });
    if (ok) return res;
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  throw Object.assign(new Error("The office book is busy, try again"), { status: 503 });
}
async function secretOf(kv) {
  if (process.env.CONACREW_SECRET) return process.env.CONACREW_SECRET;
  const got = await kv.get("secret");
  if (got && got.text) return got.text;
  const s = crypto.randomBytes(32).toString("hex");
  await kv.set("secret", s, { onlyIfNew: true });
  const again = await kv.get("secret");
  return again ? again.text : s;
}

// ---------- tokens ----------
const b64 = (s) => Buffer.from(s).toString("base64url");
async function makeToken(kv, user, dev) {
  const hours = isMainAdmin(user) ? MAIN_ADMIN_DAYS * 24 : SESSION_HOURS;
  const body = b64(JSON.stringify({ u: user.id, r: user.role, d: dev || "", e: now() + hours * 3600e3 }));
  const sig = crypto.createHmac("sha256", await secretOf(kv)).update(body).digest("base64url");
  return body + "." + sig;
}
const deviceOk = (book, user, dev) => (user.devices || []).some((d) => d.id === dev) || (book.trustedDevices || []).some((d) => d.id === dev);
async function readToken(kv, book, token) {
  if (!token || !book) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", await secretOf(kv)).update(body).digest("base64url");
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  let t;
  try { t = JSON.parse(Buffer.from(body, "base64url").toString()); } catch (e) { return null; }
  if (!t.e || t.e < now()) return null;
  const user = (book.users || []).find((u) => u.id === t.u);
  if (!user || user.active === false || user.role !== t.r) return null;
  if (!isMainAdmin(user)) {
    if (user.lockedAt) return null;
    if (!deviceOk(book, user, t.d)) return null; // phone removed by the admin
  }
  return { user, dev: t.d };
}

// ---------- media: big data URLs move out of the book ----------
async function liftMedia(kv, value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (typeof value === "string") {
    if (value.length < MEDIA_MIN || !value.startsWith("data:")) return value;
    const m = value.match(/^data:([^;,]*)(;[^,]*)?,/);
    if (!m) return value;
    const key = sha(value).slice(0, 40);
    if (!(await kv.has("m/" + key))) await kv.set("m/" + key, value, {});
    return "/.netlify/functions/media?k=" + key + "&t=" + encodeURIComponent(m[1] || "application/octet-stream");
  }
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) value[i] = await liftMedia(kv, value[i], depth + 1); return value; }
  if (typeof value === "object") { for (const k of Object.keys(value)) value[k] = await liftMedia(kv, value[k], depth + 1); return value; }
  return value;
}
async function readMedia(kv, key) {
  if (!/^[0-9a-f]{40}$/.test(String(key || ""))) return null;
  const got = await kv.get("m/" + key);
  if (!got) return null;
  const comma = got.text.indexOf(",");
  if (!got.text.startsWith("data:") || comma < 0) return null;
  const head = got.text.slice(5, comma).split(";");
  const type = head.filter((x) => x !== "base64").join(";") || "application/octet-stream";
  const data = got.text.slice(comma + 1);
  const bytes = head.includes("base64") ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data));
  return { type, bytes };
}

// ---------- the book ----------
function meta(book) {
  if (!book._meta) book._meta = { seq: 0, top: {}, del: {} };
  if (!book._meta.top) book._meta.top = {};
  if (!book._meta.del) book._meta.del = {};
  return book._meta;
}
const bump = (book) => ++meta(book).seq;

// Turn a whole phone book into a server book (first upload from the main admin)
async function fromWholeBook(kv, whole) {
  const book = { _meta: { seq: 0, top: {}, del: {} } };
  const s = bump(book);
  for (const [k, v] of Object.entries(whole || {})) {
    if (LOCAL_ONLY.has(k) || k === "_meta") continue;
    if (isRecList(v)) {
      book[k] = [];
      for (const r of v) { const rec = await liftMedia(kv, JSON.parse(JSON.stringify(r))); rec._u = rec._u || 0; rec._s = s; book[k].push(rec); }
    } else {
      book[k] = await liftMedia(kv, JSON.parse(JSON.stringify(v)));
      book._meta.top[k] = { u: 0, s };
    }
  }
  return book;
}

function mayWrite(user, coll, rec, prev) {
  if (SERVER_ONLY.has(coll)) return false;
  if (ADMIN_ONLY.has(coll) && user.role !== "admin") return false;
  if (MAIN_ADMIN_ONLY.has(coll) && !isMainAdmin(user)) {
    // Admin II can add a new driver (its login has no PIN until the main admin sets one)
    if (coll === "users" && user.role === "admin" && !prev && rec && rec.role === "driver") return true;
    return false;
  }
  return true;
}
const MEDIA_KEYS = ["photos", "voice", "photo", "file", "licensePhoto"];

// Apply one phone's changes. Returns the list of records the phone sent that were refused (it gets the office copy back).
async function applyChanges(kv, book, user, ch) {
  const m = meta(book);
  const s = bump(book);
  const refused = {};
  const refuse = (c, id) => { (refused[c] = refused[c] || []).push(id); };
  for (const [coll, recs] of Object.entries(ch.set || {})) {
    if (LOCAL_ONLY.has(coll) || !Array.isArray(recs)) continue;
    if (!Array.isArray(book[coll]) || !isRecList(book[coll])) book[coll] = [];
    const list = book[coll];
    const dels = m.del[coll] || {};
    for (const raw of recs) {
      if (!raw || raw.id == null) continue;
      const i = list.findIndex((x) => x.id === raw.id);
      const prev = i >= 0 ? list[i] : null;
      if (!mayWrite(user, coll, raw, prev)) { if (prev) refuse(coll, raw.id); continue; }
      const u = Math.min(Number(raw._u) || 0, now() + 60e3); // no edits from the future
      if (dels[raw.id] && dels[raw.id].at >= u) continue; // deleted after this edit
      if (prev && (Number(prev._u) || 0) > u) { refuse(coll, raw.id); continue; } // office copy is newer
      const rec = await liftMedia(kv, JSON.parse(JSON.stringify(raw)));
      // a phone that freed space by dropping old photos must not wipe them here
      if (prev && rec.mediaRemoved) MEDIA_KEYS.forEach((k) => { if (prev[k] && !rec[k]) rec[k] = prev[k]; });
      if (prev && rec.reply && prev.reply && rec.reply.mediaRemoved) MEDIA_KEYS.forEach((k) => { if (prev.reply[k] && !rec.reply[k]) rec.reply[k] = prev.reply[k]; });
      rec._u = u; rec._s = s;
      if (i >= 0) list[i] = rec; else list.unshift(rec);
      if (dels[raw.id]) delete dels[raw.id];
    }
  }
  for (const [coll, ids] of Object.entries(ch.del || {})) {
    if (!Array.isArray(ids) || !Array.isArray(book[coll])) continue;
    for (const id of ids) {
      const prev = book[coll].find((x) => x.id === id);
      if (!mayWrite(user, coll, null, prev || {})) { if (prev) refuse(coll, id); continue; }
      book[coll] = book[coll].filter((x) => x.id !== id);
      (m.del[coll] = m.del[coll] || {})[id] = { at: Math.max(now(), Number((ch.delU || {})[coll + ":" + id]) || 0), s };
    }
  }
  for (const [k, v] of Object.entries(ch.top || {})) {
    if (LOCAL_ONLY.has(k) || SERVER_ONLY.has(k)) continue;
    if (MAIN_ADMIN_ONLY.has(k) && !isMainAdmin(user)) continue;
    const u = Math.min(Number((ch.topU || {})[k]) || 0, now() + 60e3);
    if (m.top[k] && m.top[k].u > u) { refuse("_top", k); continue; }
    book[k] = await liftMedia(kv, JSON.parse(JSON.stringify(v)));
    m.top[k] = { u, s };
  }
  // forget very old deletions
  const cut = now() - TOMBSTONE_DAYS * 864e5;
  for (const c of Object.keys(m.del)) for (const id of Object.keys(m.del[c])) if (m.del[c][id].at < cut) delete m.del[c][id];
  return refused;
}

// What one person is allowed to receive
function viewRecord(viewer, coll, rec) {
  if (coll === "users" && !isMainAdmin(viewer)) {
    const { pin, ...rest } = rec;
    return { ...rest, pinHash: pin ? pinHash(rec.id, pin) : "" };
  }
  return rec;
}
function viewTop(viewer, k, v) {
  if (k === "loginLog" && !isMainAdmin(viewer)) return [];
  return v;
}
// Records changed after `since` (or everything when since is 0 / unknown)
function delta(book, viewer, since, refused) {
  const m = meta(book);
  const full = !since || since > m.seq;
  const out = { seq: m.seq, now: now(), full, set: {}, del: {}, top: {} };
  for (const [k, v] of Object.entries(book)) {
    if (k === "_meta") continue;
    if (isRecList(v) && !(m.top[k])) {
      const want = refused && refused[k] ? new Set(refused[k]) : null;
      if (ADMIN_ONLY.has(k) && viewer.role !== "admin") continue;
      const recs = v.filter((r) => full || r._s > since || (want && want.has(r.id))).map((r) => viewRecord(viewer, k, r));
      if (recs.length || full) out.set[k] = recs;
    } else {
      const t = m.top[k] || { s: 0 };
      if (full || t.s > since || (refused && (refused._top || []).includes(k))) { out.top[k] = viewTop(viewer, k, v); out.topU = out.topU || {}; out.topU[k] = t.u || 0; }
    }
  }
  if (!full) for (const [c, ids] of Object.entries(m.del)) {
    const gone = Object.keys(ids).filter((id) => ids[id].s > since);
    if (gone.length) out.del[c] = gone;
  }
  return out;
}

function logSignIn(book, user, result, extra) {
  if (!Array.isArray(book.loginLog)) book.loginLog = [];
  book.loginLog.unshift({ at: new Date().toISOString(), userId: user ? user.id : "", name: user ? user.name : (extra && extra.phone) || "", result, ...(extra || {}) });
  if (book.loginLog.length > 300) book.loginLog.length = 300;
  const m = meta(book);
  m.top.loginLog = { u: now(), s: m.seq };
}
const userTouched = (book, user) => { user._u = now(); user._s = meta(book).seq; };

// ---------- the request handler (method, headers, body) -> { status, body } ----------
export async function handleSync(kv, { method, token, body }) {
  if (method === "GET") {
    const { book } = await loadBook(kv);
    return { status: 200, body: { exists: !!book, server: 2 } };
  }
  if (method !== "POST") return { status: 405, body: { error: "method" } };
  const op = body && body.op;

  if (op === "login") {
    const p = phoneKey(body.phone);
    const pin = String(body.pin || "").trim();
    const dev = String(body.deviceId || "").slice(0, 60);
    const label = String(body.label || "Phone").slice(0, 60);
    if (!p) return { status: 400, body: { error: "Enter your phone number." } };
    let out;
    const res = await updateBook(kv, async (book) => {
      if (!book) { out = { status: 200, body: { empty: true } }; return { write: false }; }
      bump(book);
      const matches = (book.users || []).filter((u) => phoneKey(u.phone) === p);
      const user = matches.find((u) => u.active !== false) || matches[0];
      const fail = (msg, result) => { logSignIn(book, user, result, { phone: p, device: label, deviceId: dev }); out = { status: 200, body: { error: msg } }; return { book }; };
      if (!user) return fail("No login uses this phone number. Ask the admin to add you on Team & logins.", "unknown_phone");
      if (user.active === false) return fail("This login is turned off. Ask the admin.", "turned_off");
      if (!user.pin) return fail("No PIN has been set for this login yet. Ask the admin to set one.", "no_pin");
      const main = isMainAdmin(user);
      if (!main && user.lockedAt) return fail("This login is locked after too many wrong PINs. Ask the admin to unlock it.", "locked");
      if (String(user.pin) !== pin) {
        if (main) return fail("Wrong PIN.", "wrong_pin");
        user.failCount = (user.failCount || 0) + 1;
        userTouched(book, user);
        if (user.failCount >= MAX_TRIES) { user.lockedAt = new Date().toISOString(); return fail("Wrong PIN. This login is now locked. Ask the admin to unlock it.", "locked_now"); }
        return fail("Wrong PIN. " + (MAX_TRIES - user.failCount) + " tries left before this login locks.", "wrong_pin");
      }
      if (user.role === "driver" && !user.driverId) { out = { status: 200, body: { error: "This driver login is not linked to a driver record." } }; return { write: false }; }
      if (user.failCount) { user.failCount = 0; userTouched(book, user); }
      if (!main && !deviceOk(book, user, dev)) {
        user.pendingDevices = (user.pendingDevices || []).filter((d) => d.id !== dev);
        user.pendingDevices.push({ id: dev, label, requestedAt: new Date().toISOString() });
        userTouched(book, user);
        logSignIn(book, user, "new_phone", { device: label, deviceId: dev });
        out = { status: 200, body: { needsApproval: true, name: user.name } };
        return { book };
      }
      logSignIn(book, user, "ok", { device: label, deviceId: dev });
      out = { status: 200, body: { ok: true, user: { id: user.id, role: user.role, driverId: user.driverId || null, name: user.name }, token: await makeToken(kv, user, dev) } };
      return { book };
    });
    void res;
    return out;
  }

  if (op === "seed") {
    // First upload: only when the server has no book yet, from the main admin's phone.
    const whole = body.book;
    const who = whole && (whole.users || []).find((u) => u.id === body.userId);
    if (!whole || !isMainAdmin(who)) return { status: 400, body: { error: "Only the main admin's phone can start the office book." } };
    let out;
    await updateBook(kv, async (book) => {
      if (book) { out = null; return { write: false }; }
      const fresh = await fromWholeBook(kv, whole);
      logSignIn(fresh, who, "office_book_started", { deviceId: String(body.deviceId || "") });
      out = { status: 200, body: { ...delta(fresh, who, 0), token: await makeToken(kv, who, String(body.deviceId || "")) } };
      return { book: fresh };
    });
    if (out) return out;
    return { status: 409, body: { error: "exists" } };
  }

  if (op === "sync") {
    const ch = body.changes || {};
    let out;
    await updateBook(kv, async (book) => {
      if (!book) { out = { status: 200, body: { empty: true } }; return { write: false }; }
      const who = await readToken(kv, book, token);
      if (!who) { out = { status: 401, body: { error: "signin" } }; return { write: false }; }
      const has = Object.keys(ch.set || {}).some((k) => (ch.set[k] || []).length) || Object.keys(ch.del || {}).some((k) => (ch.del[k] || []).length) || Object.keys(ch.top || {}).length;
      let refused = null;
      if (has) refused = await applyChanges(kv, book, who.user, ch);
      out = { status: 200, body: delta(book, who.user, Number(body.since) || 0, refused) };
      return has ? { book } : { write: false };
    });
    return out;
  }
  return { status: 400, body: { error: "unknown op" } };
}

// ---------- live GPS: last position for each truck, plus a short trail ----------
export async function handleLive(kv, { method, token, body }) {
  const { book } = await loadBook(kv);
  const who = await readToken(kv, book, token);
  if (!who) return { status: 401, body: { error: "signin" } };
  const got = await kv.get("live");
  const all = got ? JSON.parse(got.text) : {};
  if (method === "GET") {
    if (who.user.role !== "admin") return { status: 403, body: { error: "admin only" } };
    return { status: 200, body: all };
  }
  if (method !== "POST") return { status: 405, body: { error: "method" } };
  if (!body || !body.truckId || body.lat == null || body.lng == null) return { status: 400, body: { error: "missing" } };
  if (who.user.role === "driver") {
    const d = (book.drivers || []).find((x) => x.id === who.user.driverId);
    const t = (book.trucks || []).find((x) => x.id === body.truckId);
    if (!t || (t.assignedDriverId !== who.user.driverId && (!d || d.assignedTruckId !== t.id))) return { status: 403, body: { error: "not your truck" } };
  } else if (who.user.role !== "admin") return { status: 403, body: { error: "drivers only" } };
  const prev = all[body.truckId] || {};
  const ping = {
    truckId: body.truckId, plate: String(body.plate || prev.plate || ""), driverId: who.user.driverId || "", driverName: who.user.name || "",
    lat: Number(body.lat), lng: Number(body.lng), accuracy: Number(body.accuracy) || 0, speed: Number(body.speed) || 0, moving: !!body.moving,
    at: now(), phoneAt: Number(body.at) || now(),
  };
  const trail = (prev.trail || []).concat([{ lat: ping.lat, lng: ping.lng, at: ping.at }]).slice(-60);
  all[body.truckId] = { ...ping, trail };
  await kv.set("live", JSON.stringify(all), {});
  return { status: 200, body: { ok: true, at: ping.at } };
}

// ---------- media upload (photos, voice notes, files) ----------
export async function handleMedia(kv, { method, token, body, query }) {
  if (method === "GET") {
    const got = await readMedia(kv, query.k);
    if (!got) return { status: 404, body: { error: "not found" } };
    return { status: 200, raw: got.bytes, type: got.type };
  }
  if (method !== "POST") return { status: 405, body: { error: "method" } };
  const { book } = await loadBook(kv);
  if (book && !(await readToken(kv, book, token))) return { status: 401, body: { error: "signin" } };
  const data = String((body && body.data) || "");
  if (!data.startsWith("data:")) return { status: 400, body: { error: "not a file" } };
  if (data.length > 4.5e6) return { status: 413, body: { error: "File too big (max about 3 MB)" } };
  return { status: 200, body: { url: await liftMedia(kv, data) } };
}

// ---------- public booking page (clients, no sign-in) ----------
// Clients can only add a new request and read their own request with its private key. Nothing else.
const BOOK_PER_PHONE_DAY = 4;
const BOOK_PER_DAY = 150;
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const inArea = (p) => p && isFinite(p.lat) && isFinite(p.lng) && p.lat > -12 && p.lat < 6 && p.lng > 28 && p.lng < 42;
const place = (p) => ({ name: clip(p && p.name, 140), lat: Math.round(Number(p.lat) * 1e6) / 1e6, lng: Math.round(Number(p.lng) * 1e6) / 1e6 });
const ymd = (d) => d.toISOString().slice(0, 10);
const JOB_STEP = { booked: "assigned", loading: "loading", en_route: "on_the_way", delivered: "delivered", invoiced: "delivered", paid: "delivered" };
export function bookingPublic(b, book) {
  const job = b.jobId ? (book.jobs || []).find((j) => j.id === b.jobId) : null;
  const truck = job ? (book.trucks || []).find((t) => t.id === job.truckId) : null;
  let step = b.status;
  if (job) step = JOB_STEP[job.status] || "assigned";
  return {
    ref: b.ref, step, createdAt: b.createdAt, updatedAt: b.updatedAt || b.createdAt,
    name: b.client && b.client.name, cargo: b.cargo, tonnes: b.tonnes, trips: b.trips, date: b.date,
    pickup: b.pickup, drop: b.drop, km: b.km,
    quote: b.quote && ["quoted", "accepted", "confirmed"].includes(b.status) || (b.quote && job) ? { amountUgx: b.quote.amountUgx, note: b.quote.note || "", at: b.quote.at, validUntil: b.quote.validUntil || "" } : null,
    declineNote: b.status === "declined" ? b.declineNote || "" : "",
    truck: truck ? { plate: truck.plate } : null,
    clientAnswer: b.clientAnswer || null,
  };
}
export async function handleBook(kv, { method, body, query }) {
  if (method === "GET") {
    const { book } = await loadBook(kv);
    const b = book && (book.bookings || []).find((x) => x.ref === String(query.r || "") && x.key === String(query.k || ""));
    if (!b) return { status: 404, body: { error: "We couldn't find this booking. Check the link." } };
    return { status: 200, body: bookingPublic(b, book) };
  }
  if (method !== "POST") return { status: 405, body: { error: "method" } };
  const op = body && body.op;
  if (op === "request") {
    if (body.website) return { status: 200, body: { ref: "CR-0000-00", key: "x" } }; // spam trap: pretend it worked
    if (Number(body.openedAt) && now() - Number(body.openedAt) < 4000) return { status: 400, body: { error: "Please check the form and send again." } };
    const name = clip(body.name, 80), company = clip(body.company, 80), phone = phoneKey(body.phone), email = clip(body.email, 120);
    if (name.length < 2) return { status: 400, body: { error: "Enter your name." } };
    if (!/^0\d{9}$/.test(phone)) return { status: 400, body: { error: "Enter a valid phone number, e.g. 0772 123 456." } };
    if (!inArea(body.pickup) || !inArea(body.drop)) return { status: 400, body: { error: "Pin the pickup and drop-off on the map." } };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? String(body.date) : "";
    if (!date || date < ymd(new Date(now() - 864e5))) return { status: 400, body: { error: "Choose the date you need the truck." } };
    const cargo = clip(body.cargo, 60);
    if (!cargo) return { status: 400, body: { error: "Choose what you're moving." } };
    let out;
    await updateBook(kv, async (book) => {
      if (!book) { out = { status: 503, body: { error: "Booking is not open yet. Please call us." } }; return { write: false }; }
      const list = Array.isArray(book.bookings) ? book.bookings : (book.bookings = []);
      const today = ymd(new Date());
      const todays = list.filter((x) => String(x.createdAt || "").slice(0, 10) === today);
      if (todays.length >= BOOK_PER_DAY || todays.filter((x) => x.client && x.client.phone === phone).length >= BOOK_PER_PHONE_DAY) {
        out = { status: 429, body: { error: "We already have your requests for today. We'll get back to you soon." } };
        return { write: false };
      }
      const s = bump(book);
      const md = today.slice(5, 7) + today.slice(8, 10);
      let n = todays.length + 1, ref;
      do { ref = "CR-" + md + "-" + String(n++).padStart(2, "0"); } while (list.some((x) => x.ref === ref));
      const rec = {
        id: "bk-" + crypto.randomBytes(5).toString("hex"), ref, key: crypto.randomBytes(12).toString("hex"),
        status: "new", createdAt: new Date().toISOString(),
        client: { name, company, phone, email, whatsapp: body.whatsapp !== false },
        cargo, tonnes: Math.max(0, Math.min(500, Number(body.tonnes) || 0)), trips: Math.max(0, Math.min(200, Math.round(Number(body.trips) || 0))),
        date, time: clip(body.time, 20), pickup: place(body.pickup), drop: place(body.drop),
        km: Math.max(0, Math.min(3000, Math.round(Number(body.km) || 0))), notes: clip(body.notes, 600),
        history: [{ at: new Date().toISOString(), what: "Request received" }], _u: now(), _s: s,
      };
      list.unshift(rec);
      out = { status: 200, body: { ref: rec.ref, key: rec.key } };
      return { book };
    });
    return out;
  }
  if (op === "answer") {
    // the client accepts or turns down the quote from their link
    let out;
    await updateBook(kv, async (book) => {
      const b = book && (book.bookings || []).find((x) => x.ref === String(body.r || "") && x.key === String(body.k || ""));
      if (!b) { out = { status: 404, body: { error: "Booking not found." } }; return { write: false }; }
      if (b.status !== "quoted") { out = { status: 409, body: { error: "This quote can't be changed now.", ...bookingPublic(b, book) } }; return { write: false }; }
      const yes = body.answer === "accept";
      b.status = yes ? "accepted" : "client_declined";
      b.clientAnswer = { answer: yes ? "accept" : "decline", note: clip(body.note, 300), at: new Date().toISOString() };
      b.updatedAt = b.clientAnswer.at;
      (b.history = b.history || []).push({ at: b.updatedAt, what: yes ? "Client accepted the quote" : "Client turned down the quote" });
      b._u = now(); b._s = bump(book);
      out = { status: 200, body: bookingPublic(b, book) };
      return { book };
    });
    return out;
  }
  return { status: 400, body: { error: "unknown" } };
}
