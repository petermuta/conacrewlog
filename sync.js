exports.handler = async (event) => {
  const { getStore } = await import("@netlify/blobs");
  const blobs = getStore("conacrew-books");
  const headers = { "content-type": "application/json" };
  if (event.httpMethod === "GET") {
    const raw = await blobs.get("db", { type: "text" });
    return { statusCode: 200, headers, body: raw || "null" };
  }
  if (event.httpMethod === "POST") {
    const body = JSON.parse(event.body || "null");
    if (!body || !body.users) return { statusCode: 400, headers, body: "{\"error\":\"missing\"}" };
    const prev = JSON.parse((await blobs.get("db", { type: "text" })) || "null");
    if (prev && Number(prev.updatedAt) > Number(body.updatedAt || 0)) {
      return { statusCode: 200, headers, body: JSON.stringify(prev) };
    }
    body.updatedAt = Date.now();
    await blobs.set("db", JSON.stringify(body));
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, updatedAt: body.updatedAt }) };
  }
  return { statusCode: 405, headers, body: "{\"error\":\"method\"}" };
};
