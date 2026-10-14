import { serve } from "../shared/blobs.mjs";
import { handleMedia } from "../shared/core.mjs";
export default (req) => serve(req, handleMedia);
