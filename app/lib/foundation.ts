import { permissionsForRole, type Permission } from "./access-control";

export const MODULES = ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "billing", "delivery", "admin"] as const;

export type Module = (typeof MODULES)[number];
export type BusinessRole = "owner" | "admin" | "operations" | "viewer";

export type BusinessTheme = {
  name: string;
  primary: string;
  primaryAlt: string;
  accent: string;
  background: string;
  surface: string;
  ink: string;
  muted: string;
  headingFont: "serif" | "sans";
};

export type BusinessMembership = {
  businessId: string;
  businessName: string;
  logoUrl?: string;
  role: BusinessRole;
  modules: Module[];
  permissions?: Permission[];
  theme?: BusinessTheme;
};

export type FoundationBootstrap = {
  user: { displayName: string; email: string };
  businesses: BusinessMembership[];
};

const ROLE_MODULES: Record<BusinessRole, readonly Module[]> = {
  owner: MODULES,
  admin: MODULES,
  operations: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "billing", "delivery"],
  viewer: ["home", "orders", "labels", "trace", "production", "inventory", "sales", "billing", "delivery"],
};

/* These identifiers are permanently retired and must not regain UI access even
   if stale bootstrap or membership data is returned during migration. */
export const RETIRED_BUSINESS_IDS = new Set(["veyn-view"]);

export function normalizeMembership(value: BusinessMembership): BusinessMembership {
  if (RETIRED_BUSINESS_IDS.has(value.businessId)) return { ...value, modules: [], permissions: [] };
  const allowedForRole = new Set(ROLE_MODULES[value.role] || ROLE_MODULES.viewer);
  const configuredModules = Array.isArray(value.modules) && value.modules.length ? value.modules : [...allowedForRole];
  const granted = new Set(configuredModules);
  return {
    ...value,
    modules: MODULES.filter(module => allowedForRole.has(module) && granted.has(module)),
    permissions: permissionsForRole(value.role, value.permissions),
  };
}

export function canAccess(membership: BusinessMembership | undefined, module: Module): boolean {
  return Boolean(membership && !RETIRED_BUSINESS_IDS.has(membership.businessId) && membership.modules.includes(module));
}

export function canDo(membership: BusinessMembership | undefined, permission: Permission): boolean {
  return Boolean(membership && !RETIRED_BUSINESS_IDS.has(membership.businessId) && permissionsForRole(membership.role, membership.permissions).includes(permission));
}

export function businessStorageKey(businessId: string, suffix: string): string {
  return `jinam:${businessId}:${suffix}`;
}

export const THEME_PRESETS: Record<string, BusinessTheme> = {
  seiko: { name: "Seiko Tailors master", primary: "#103860", primaryAlt: "#104068", accent: "#d0b080", background: "#f5f1eb", surface: "#fffaf4", ink: "#102d49", muted: "#667787", headingFont: "serif" },
  veyn: { name: "Veyn Health master", primary: "#315b36", primaryAlt: "#4f744b", accent: "#980000", background: "#f2f5f0", surface: "#f2f5f0", ink: "#243324", muted: "#68756c", headingFont: "serif" },
  meth: { name: "MeTh master", primary: "#422629", primaryAlt: "#603437", accent: "#c02020", background: "#f7f4f4", surface: "#ffffff", ink: "#331416", muted: "#786365", headingFont: "sans" },
  jinam: { name: "Jinam neutral", primary: "#082f4d", primaryAlt: "#155674", accent: "#d5aa60", background: "#edf2f4", surface: "#ffffff", ink: "#132b39", muted: "#647986", headingFont: "serif" },
};

export function themeVariables(theme: BusinessTheme = THEME_PRESETS.jinam): Record<string, string> {
  return {
    "--navy": theme.primary,
    "--navy2": theme.primaryAlt,
    "--gold": theme.accent,
    "--blue": theme.primaryAlt,
    "--ink": theme.ink,
    "--muted": theme.muted,
    "--paper": theme.surface,
    "--app-background": theme.background,
    "--heading-font": theme.headingFont === "serif" ? "Georgia, serif" : "Arial, Helvetica, sans-serif",
  };
}

export async function deriveThemeFromLogo(file: File, name: string): Promise<BusinessTheme> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 96; canvas.height = 96;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Logo colour analysis is unavailable in this browser.");
  context.drawImage(bitmap, 0, 0, 96, 96); bitmap.close();
  const pixels = context.getImageData(0, 0, 96, 96).data;
  const colours = new Map<string, number>();
  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3];
    const red = pixels[index]; const green = pixels[index + 1]; const blue = pixels[index + 2];
    const max = Math.max(red, green, blue); const min = Math.min(red, green, blue);
    if (alpha < 180 || max > 244 || max < 18 || max - min < 22) continue;
    const key = [red, green, blue].map(value => Math.round(value / 24) * 24).join(",");
    colours.set(key, (colours.get(key) || 0) + 1);
  }
  const ranked = [...colours.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value.split(",").map(Number));
  const primaryRgb = ranked[0] || [8, 47, 77];
  const accentRgb = ranked.find(rgb => colourDistance(rgb, primaryRgb) > 100) || ranked[1] || lighten(primaryRgb, 65);
  const primary = toHex(primaryRgb); const accent = toHex(accentRgb);
  return { name: `${name} · Logo derived`, primary: darken(primaryRgb, 35), primaryAlt: primary, accent, background: mixWithWhite(primaryRgb, .93), surface: "#ffffff", ink: darken(primaryRgb, 70), muted: "#68757a", headingFont: "sans" };
}

function colourDistance(a: number[], b: number[]) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function lighten(rgb: number[], amount: number) { return rgb.map(value => Math.min(255, value + amount)); }
function toHex(rgb: number[]) { return `#${rgb.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`; }
function darken(rgb: number[], amount: number) { return toHex(rgb.map(value => Math.max(0, value - amount))); }
function mixWithWhite(rgb: number[], ratio: number) { return toHex(rgb.map(value => value * (1 - ratio) + 255 * ratio)); }
