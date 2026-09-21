export type PhysicalOutputProfile = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  pagesPerSheet: 1;
  kind: "label" | "document";
};

export const PHYSICAL_OUTPUT_PROFILES = {
  label50x25: {
    id: "label-50x25",
    label: "50 × 25 mm label",
    widthMm: 50,
    heightMm: 25,
    pagesPerSheet: 1,
    kind: "label",
  },
  a4: {
    id: "a4",
    label: "A4",
    widthMm: 210,
    heightMm: 297,
    pagesPerSheet: 1,
    kind: "document",
  },
  a5: {
    id: "a5",
    label: "A5",
    widthMm: 148,
    heightMm: 210,
    pagesPerSheet: 1,
    kind: "document",
  },
} as const satisfies Record<string, PhysicalOutputProfile>;

export function physicalPageCss(profile: PhysicalOutputProfile) {
  return `@page { size:${profile.widthMm}mm ${profile.heightMm}mm; margin:0; }`;
}
