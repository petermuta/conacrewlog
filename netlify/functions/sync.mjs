import { serve } from "../shared/blobs.mjs";
import { handleSync } from "../shared/core.mjs";
export default (req) => serve(req, handleSync);
