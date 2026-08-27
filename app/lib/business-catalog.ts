export type BusinessCatalogEntry = {
  businessId: string;
  businessName: string;
  logoUrl: string;
  themeKey: "seiko" | "veyn" | "meth" | "jinam";
};

const CATALOG: Record<string, BusinessCatalogEntry> = {
  seiko: {
    businessId: "seiko",
    businessName: "Seiko",
    logoUrl: "/brands/seiko-logo-transparent.png",
    themeKey: "seiko",
  },
  "veyn-health": {
    businessId: "veyn-health",
    businessName: "Veyn Health",
    logoUrl: "/brands/veyn-health-logo.png",
    themeKey: "veyn",
  },
  meth: {
    businessId: "meth",
    businessName: "MeTh",
    logoUrl: "/brands/meth-logo.jpg",
    themeKey: "meth",
  },
};

export function businessCatalogEntry(businessId: string): BusinessCatalogEntry {
  return CATALOG[businessId] || {
    businessId,
    businessName: businessId,
    logoUrl: "",
    themeKey: "jinam",
  };
}

export function knownBusinessIds(): string[] {
  return Object.keys(CATALOG);
}
