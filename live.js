exports.handler = async (event) => {
  const { getStore } = await import("@netlify/blobs");
  const blobs = getStore("fleet-live");
  const headers = { "content-type": "application/json" };
  if (event.httpMethod === "GET") {
    const raw = await blobs.get("pings", { type: "text" });
    return { statusCode: 200, headers, body: raw || "{}" };
  }
  if (event.httpMethod === "POST") {
    const body = JSON.parse(event.body || "{}");
    if (!body.truckId || body.lat == null) return { statusCode: 400, headers, body: "{\"error\":\"missing\"}" };
    const all = JSON.parse((await blobs.get("pings", { type: "text" })) || "{}");
    all[body.truckId] = { lat: Number(body.lat), lng: Number(body.lng), speed: Number(body.speed) || 0, moving: !!body.moving, plate: body.plate || "", at: Date.now() };
    await blobs.set("pings", JSON.stringify(all));
    return { statusCode: 200, headers, body: "{\"ok\":true}" };
  }
  return { statusCode: 405, headers, body: "{\"error\":\"method\"}" };
};
