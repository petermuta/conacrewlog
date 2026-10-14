import { serve } from "../shared/blobs.mjs";
import { handleLive } from "../shared/core.mjs";
export default (req) => serve(req, handleLive);
