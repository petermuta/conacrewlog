
export default async (req) => {
  const { getStore } = await import("@netlify/blobs");
  const blobs = getStore("fleet-live");
  if (req.method === "GET") {
    const raw = await blobs.get("pings", { type: "text" });
    return new Response(raw || "{}", { headers: { "content-type": "application/json" } });
  }
  if (req.method === "POST") {
    const body = await req.json();
    if (!body.truckId || body.lat == null) return new Response("{}", { status: 400 });
    const all = JSON.parse((await blobs.get("pings", { type: "text" })) || "{}");
    all[body.truckId] = { lat: Number(body.lat), lng: Number(body.lng), speed: Number(body.speed) || 0, moving: !!body.moving, plate: body.plate || "", at: Date.now() };
    await blobs.set("pings", JSON.stringify(all));
    return new Response("{\"ok\":true}", { headers: { "content-type": "application/json" } });
  }
  return new Response("{}", { status: 405 });
};
