import type { Module } from "./foundation";

export type BusinessProduct = "operations-erp" | "billing" | "commerce-ops";

export type BusinessCatalogEntry = {
  businessId: string;
  businessName: string;
  logoUrl: string;
  themeKey: "seiko" | "veyn" | "meth" | "jinam";
  product: BusinessProduct;
  allowedModules: readonly Module[];
  moduleLabels?: Partial<Record<Module, string>>;
};

const CATALOG: Record<string, BusinessCatalogEntry> = {
  seiko: {
    businessId: "seiko",
    businessName: "Seiko",
    logoUrl: "/brands/seiko-logo-transparent.png",
    themeKey: "seiko",
    product: "operations-erp",
    allowedModules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "delivery", "admin"],
  },
  "veyn-health": {
    businessId: "veyn-health",
    businessName: "véyn health",
    logoUrl: "/brands/veyn-health-logo.png",
    themeKey: "veyn",
    product: "billing",
    // VÉYN starts intentionally small: personal billing now, enterprise-capable later.
    // Additional modules can be enabled here when the product actually grows into them.
    allowedModules: ["home", "sales", "admin"],
    moduleLabels: { sales: "Billing" },
  },
  meth: {
    businessId: "meth",
    businessName: "MeTh",
    logoUrl: "/brands/meth-logo.jpg",
    themeKey: "meth",
    product: "commerce-ops",
    allowedModules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "delivery", "admin"],
  },
};

export function businessCatalogEntry(businessId: string): BusinessCatalogEntry {
  return CATALOG[businessId] || {
    businessId,
    businessName: businessId,
    logoUrl: "",
    themeKey: "jinam",
    product: "operations-erp",
    allowedModules: ["home"],
  };
}

export function businessModuleLabel(businessId: string, module: Module, fallback: string): string {
  return businessCatalogEntry(businessId).moduleLabels?.[module] || fallback;
}

export function knownBusinessIds(): string[] {
  return Object.keys(CATALOG);
}
