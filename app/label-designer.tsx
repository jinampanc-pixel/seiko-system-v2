"use client";

// Stage 2 consolidates the operational label workflow in one implementation.
// Keep this stable import surface because the main app and the standalone label
// route both import `LabelDesigner` from this module.
export { LabelDesigner } from "./label-designer-v2";
