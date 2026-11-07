import { selectOffsetProfile } from "./core/offsets.js";
import "./index.js";

// Explicit entry point: all features start disabled, no V68 address fallback.
selectOffsetProfile("cnv70");
