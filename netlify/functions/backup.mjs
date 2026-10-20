// Nightly copy of the office data (Netlify runs this on its own every day)
import { kvFrom } from "../shared/blobs.mjs";
import { runBackup } from "../shared/core.mjs";
export default async () => {
  const r = await runBackup(kvFrom("conacrew"), "nightly");
  return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
};
export const config = { schedule: "0 1 * * *" }; // 01:00 UTC = 4:00 AM in Kampala
