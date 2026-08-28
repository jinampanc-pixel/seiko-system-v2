import type { Module } from "./foundation";

export type JinamBusinessApp = "seiko-operations" | "veyn-healthcare" | "meth-commerce-ops";

export type BusinessCatalogEntry = {
  businessId: string;
  businessName: string;
  logoUrl: string;
  themeKey: "seiko" | "veyn" | "meth" | "jinam";
  app: JinamBusinessApp;
  /** Modules that belong to this business application at all. */
  allowedModules: readonly Module[];
  /** Modules granted when a membership has no explicit module configuration yet. */
  defaultModules: readonly Module[];
};

const CATALOG: Record<string, BusinessCatalogEntry> = {
  seiko: {
    businessId: "seiko",
    businessName: "Seiko",
    logoUrl: "/brands/seiko-logo-transparent.png",
    themeKey: "seiko",
    app: "seiko-operations",
    // SEIKO is the tailoring/uniform operations ERP. Billing is intentionally not exposed yet.
    allowedModules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "delivery", "admin"],
    defaultModules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "delivery", "admin"],
  },
  "veyn-health": {
    businessId: "veyn-health",
    businessName: "véyn health",
    logoUrl: "/brands/veyn-health-logo.png",
    themeKey: "veyn",
    app: "veyn-healthcare",
    // Milestone 1 is deliberately commercial: institutional orders and their document chain.
    // Delivery challans live inside Billing, not as a separate Delivery application module.
    allowedModules: ["home", "orders", "billing", "admin"],
    defaultModules: ["home", "orders", "billing", "admin"],
  },
  meth: {
    businessId: "meth",
    businessName: "MeTh",
    logoUrl: "/brands/meth-logo.jpg",
    themeKey: "meth",
    app: "meth-commerce-ops",
    // MeTh remains its own application profile. Its workflow will be narrowed independently.
    allowedModules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "billing", "delivery", "admin"],
    defaultModules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "billing", "delivery", "admin"],
  },
};

export function businessCatalogEntry(businessId: string): BusinessCatalogEntry {
  return CATALOG[businessId] || {
    businessId,
    businessName: businessId,
    logoUrl: "",
    themeKey: "jinam",
    app: "seiko-operations",
    allowedModules: ["home"],
    defaultModules: ["home"],
  };
}

export function businessAllowsModule(businessId: string, module: Module): boolean {
  return businessCatalogEntry(businessId).allowedModules.includes(module);
}

export function knownBusinessIds(): string[] {
  return Object.keys(CATALOG);
}

export function knownBusinesses(): BusinessCatalogEntry[] {
  return Object.values(CATALOG);
}
