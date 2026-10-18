import { serve } from "../shared/blobs.mjs";
import { handleBook } from "../shared/core.mjs";
export default (req) => serve(req, handleBook);
