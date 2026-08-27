export type BusinessCatalogEntry = {
  businessId: string;
  businessName: string;
  logoUrl: string;
  themeKey: "seiko" | "veyn" | "meth" | "jinam";
  defaultModules: string[];
};

const CATALOG: Record<string, BusinessCatalogEntry> = {
  seiko: {
    businessId: "seiko",
    businessName: "Seiko",
    logoUrl: "/brands/seiko-logo-transparent.png",
    themeKey: "seiko",
    defaultModules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "billing", "delivery", "admin"],
  },
  "veyn-health": {
    businessId: "veyn-health",
    businessName: "Veyn Health",
    logoUrl: "/brands/veyn-health-logo.png",
    themeKey: "veyn",
    defaultModules: ["home", "orders", "inventory", "sales", "billing", "delivery", "admin"],
  },
  meth: {
    businessId: "meth",
    businessName: "MeTh",
    logoUrl: "/brands/meth-logo.jpg",
    themeKey: "meth",
    defaultModules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "billing", "delivery", "admin"],
  },
};

export function businessCatalogEntry(businessId: string): BusinessCatalogEntry {
  return CATALOG[businessId] || {
    businessId,
    businessName: businessId,
    logoUrl: "",
    themeKey: "jinam",
    defaultModules: ["home"],
  };
}

export function knownBusinessIds(): string[] {
  return Object.keys(CATALOG);
}

export function knownBusinesses(): BusinessCatalogEntry[] {
  return Object.values(CATALOG);
}
