import type { Module } from "./foundation";

export type JinamBusinessApp = "seiko-operations" | "veyn-healthcare" | "meth-commerce-ops";

/**
 * A capability is a platform primitive a business app may implement in its own workflow.
 * Capabilities do not automatically become navigation items. This prevents dead modules
 * from appearing before their end-to-end business screen is ready.
 */
export const BUSINESS_CAPABILITIES = [
  "client-library",
  "product-library",
  "vendor-library",
  "expenses",
  "document-templates",
  "event-notifications",
] as const;

export type BusinessCapability = (typeof BUSINESS_CAPABILITIES)[number];

const COMMON_BUSINESS_CAPABILITIES: readonly BusinessCapability[] = [
  "client-library",
  "product-library",
  "vendor-library",
  "expenses",
  "document-templates",
  "event-notifications",
];

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
  /** Shared Jinam primitives that this business may expose through its own workflow. */
  capabilities: readonly BusinessCapability[];
};

const CATALOG: Record<string, BusinessCatalogEntry> = {
  seiko: {
    businessId: "seiko",
    businessName: "Seiko",
    logoUrl: "/brands/seiko-logo-transparent.png",
    themeKey: "seiko",
    app: "seiko-operations",
    // Billing is now a working SEIKO-specific workflow; unfinished legacy placeholders remain hidden.
    allowedModules: ["home", "orders", "labels", "scan", "trace", "production", "billing", "admin"],
    defaultModules: ["home", "orders", "labels", "scan", "trace", "production", "billing", "admin"],
    capabilities: COMMON_BUSINESS_CAPABILITIES,
  },
  "veyn-health": {
    businessId: "veyn-health",
    businessName: "véyn health",
    logoUrl: "/brands/veyn-health-logo.png",
    themeKey: "veyn",
    app: "veyn-healthcare",
    // Delivery challans live inside VÉYN Billing rather than a separate Delivery app.
    allowedModules: ["home", "orders", "billing", "admin"],
    defaultModules: ["home", "orders", "billing", "admin"],
    capabilities: COMMON_BUSINESS_CAPABILITIES,
  },
  meth: {
    businessId: "meth",
    businessName: "MeTh",
    logoUrl: "/brands/meth-logo.jpg",
    themeKey: "meth",
    app: "meth-commerce-ops",
    // MeTh remains its own commerce/fulfilment application while its final module surface is implemented.
    allowedModules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "billing", "delivery", "admin"],
    defaultModules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "billing", "delivery", "admin"],
    capabilities: COMMON_BUSINESS_CAPABILITIES,
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
    capabilities: [],
  };
}

export function businessAllowsModule(businessId: string, module: Module): boolean {
  return businessCatalogEntry(businessId).allowedModules.includes(module);
}

export function businessHasCapability(businessId: string, capability: BusinessCapability): boolean {
  return businessCatalogEntry(businessId).capabilities.includes(capability);
}

export function knownBusinessIds(): string[] {
  return Object.keys(CATALOG);
}

export function knownBusinesses(): BusinessCatalogEntry[] {
  return Object.values(CATALOG);
}
