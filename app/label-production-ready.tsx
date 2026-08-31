"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

const TOTAL = [0,26,44,70,100,134,172,196,242,292,346];
const DATA = [0,16,28,44,64,86,108,124,154,182,216];
const ECC = [0,10,16,26,18,24,16,18,22,22,26];
const BLOCKS = [0,1,1,1,2,2,4,4,4,5,5];

function multiply(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = ((z << 1) ^ ((z >>> 7) * 0x11D)) & 0xFF;
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}
function divisor(degree: number) {
  const result = Array(degree).fill(0) as number[];
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = multiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = multiply(root, 2);
  }
  return result;
}
function remainder(data: number[], div: number[]) {
  const result = Array(div.length).fill(0) as number[];
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < div.length; i++) result[i] ^= multiply(div[i], factor);
  }
  return result;
}
function codewords(text: string) {
  const raw = [...new TextEncoder().encode(text)];
  let version = 1;
  for (; version <= 10; version++) {
    const cc = version <= 9 ? 8 : 16;
    if (4 + cc + raw.length * 8 <= DATA[version] * 8) break;
  }
  if (version > 10) throw new Error("Trace value is too long for the supported QR size.");
  const capacity = DATA[version];
  const bits: number[] = [];
  const append = (value: number, count: number) => { for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  append(4, 4); append(raw.length, version <= 9 ? 8 : 16); raw.forEach(byte => append(byte, 8));
  append(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((value, bit) => value * 2 + bit, 0));
  for (let pad = 0; data.length < capacity; pad++) data.push(pad % 2 === 0 ? 0xEC : 0x11);
  const count = BLOCKS[version], ecc = ECC[version], rawCount = TOTAL[version];
  const shortCount = count - rawCount % count, shortLength = Math.floor(rawCount / count), div = divisor(ecc);
  const groups: Array<{ data: number[]; ecc: number[] }> = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const length = shortLength - ecc + (i < shortCount ? 0 : 1);
    const chunk = data.slice(offset, offset + length); offset += length;
    groups.push({ data: chunk, ecc: remainder(chunk, div) });
  }
  const output: number[] = [], longest = Math.max(...groups.map(group => group.data.length));
  for (let i = 0; i < longest; i++) groups.forEach(group => { if (i < group.data.length) output.push(group.data[i]); });
  for (let i = 0; i < ecc; i++) groups.forEach(group => output.push(group.ecc[i]));
  return { version, output };
}
function alignmentPositions(version: number) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const size = version * 4 + 17, result = Array(count).fill(0) as number[];
  result[0] = 6;
  for (let i = 0; i < count - 1; i++) result[count - 1 - i] = size - 7 - i * step;
  return result;
}
function qrMatrix(text: string) {
  const { version, output } = codewords(text), size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => Array(size).fill(false) as boolean[]);
  const functions = Array.from({ length: size }, () => Array(size).fill(false) as boolean[]);
  const set = (x: number, y: number, dark: boolean) => { if (x >= 0 && x < size && y >= 0 && y < size) { modules[y][x] = dark; functions[y][x] = true; } };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx: number, cy: number) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const distance = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, distance !== 2 && distance !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const align = (cx: number, cy: number) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); };
  const positions = alignmentPositions(version);
  positions.forEach(y => positions.forEach(x => { if (!functions[y][x]) align(x, y); }));
  const drawFormat = () => {
    let rem = 0;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = rem ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, ((bits >>> i) & 1) !== 0);
    set(8, 7, ((bits >>> 6) & 1) !== 0); set(8, 8, ((bits >>> 7) & 1) !== 0); set(7, 8, ((bits >>> 8) & 1) !== 0);
    for (let i = 9; i < 15; i++) set(14 - i, 8, ((bits >>> i) & 1) !== 0);
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, ((bits >>> i) & 1) !== 0);
    set(8, size - 8, true);
  };
  drawFormat();
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) { const bit = ((bits >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3); set(a, b, bit); set(b, a, bit); }
  }
  const dataBits: number[] = [];
  output.forEach(byte => { for (let i = 7; i >= 0; i--) dataBits.push((byte >>> i) & 1); });
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      const upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vertical : vertical;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (functions[y][x]) continue;
        let bit = index < dataBits.length ? dataBits[index] : 0; index++;
        if ((x + y) % 2 === 0) bit ^= 1;
        modules[y][x] = bit !== 0;
      }
    }
  }
  return modules;
}
function qrSvg(text: string) {
  const matrix = qrMatrix(text), size = matrix.length, quiet = 4, dimension = size + quiet * 2;
  let path = "";
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + quiet},${y + quiet}h1v1h-1z`; }));
  return `<svg viewBox="0 0 ${dimension} ${dimension}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black" shape-rendering="crispEdges"/></svg>`;
}

function renderRealQrs(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".fakeQr[aria-label^='QR ']").forEach(element => {
    const token = (element.getAttribute("aria-label") || "").replace(/^QR\s+/, "").trim();
    if (!token || element.dataset.qrToken === token) return;
    try { element.innerHTML = qrSvg(token); element.dataset.qrToken = token; element.classList.add("realQr"); } catch { /* leave the existing fallback visible */ }
  });
}

function categoryFor(choice: HTMLElement) {
  const text = choice.querySelector("label span")?.textContent?.trim() || "";
  if (/^(Person / workpiece|Group / label type)$/i.test(text) || /^Person detail\s*·/i.test(text)) return "person";
  if (/Trace code|Piece \/ pair number|Package \/ set number|Label number \/ order total|Person number \/ total|Product number \/ total|Number within|sequence|barcode|qr/i.test(text)) return "trace";
  if (/^(Order number|Client)$/i.test(text)) return "core";
  return "product";
}
function enhanceInformation(page: HTMLElement) {
  const section = page.querySelector<HTMLElement>(".simpleDesigner:not(.labelInfoCollapsed)");
  const checklist = section?.querySelector<HTMLElement>(".fieldChecklist");
  if (!section || !checklist) return;
  checklist.querySelectorAll<HTMLElement>(".fieldChoice").forEach(choice => { choice.dataset.readyCategory = categoryFor(choice); });
  let bar = section.querySelector<HTMLElement>(".labelInfoCategoryBar");
  if (!bar) {
    bar = document.createElement("div"); bar.className = "labelInfoCategoryBar";
    const categories = [["core","Core information"],["person","Person details"],["product","Product details"],["trace","Trace & codes"]] as const;
    categories.forEach(([id,label], index) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.dataset.category = id; if (index === 0) button.classList.add("active");
      button.addEventListener("click", () => {
        bar!.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
        const classification = section.querySelector<HTMLElement>(".classificationInformation");
        if (classification) classification.hidden = id !== "core";
        checklist.querySelectorAll<HTMLElement>(".fieldChoice").forEach(choice => {
          if (id === "style") { choice.hidden = !choice.classList.contains("chosen"); choice.classList.toggle("fieldChoiceExpanded", choice.classList.contains("chosen")); }
          else { choice.hidden = choice.dataset.readyCategory !== id; if (!choice.hidden) choice.classList.remove("fieldChoiceExpanded"); }
        });
        checklist.querySelectorAll<HTMLElement>(".fieldGroupHeading").forEach(heading => heading.hidden = true);
      });
      bar!.appendChild(button);
    });
    const anchor = section.querySelector(".labelInfoSelectedStrip") || section.querySelector(".simpleDesignerHead");
    anchor?.insertAdjacentElement("afterend", bar);
    const first = bar.querySelector<HTMLButtonElement>("button"); first?.click();
  }
  checklist.querySelectorAll<HTMLElement>(".fieldGroupHeading").forEach(heading => heading.hidden = true);
}
function fitCanvas(page: HTMLElement) {
  const canvas = page.querySelector<HTMLElement>(".labelCanvas");
  if (!canvas || canvas.dataset.fitReady) return;
  const width = parseFloat(canvas.style.width) || canvas.getBoundingClientRect().width;
  const height = parseFloat(canvas.style.height) || canvas.getBoundingClientRect().height;
  if (!width || !height) return;
  canvas.dataset.fitReady = "true";
  canvas.style.width = "100%"; canvas.style.maxWidth = `${width}px`; canvas.style.height = "auto"; canvas.style.aspectRatio = `${width} / ${height}`;
}
function cleanWorkingArea(page: HTMLElement) {
  const canvasPanel = page.querySelector<HTMLElement>(".labelCanvasPanel");
  const inspector = page.querySelector<HTMLElement>(".labelContextInspector");
  if (canvasPanel && inspector && inspector.parentElement !== canvasPanel) canvasPanel.appendChild(inspector);
  fitCanvas(page);
}
function enhance() {
  document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => { enhanceInformation(page); cleanWorkingArea(page); renderRealQrs(page); });
  renderRealQrs(document.querySelector(".printSheet") || document);
}

export function LabelProductionReady() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance, {
      observer: { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-label"] },
    });
    document.addEventListener("change", controller.schedule, true);
    return () => {
      document.removeEventListener("change", controller.schedule, true);
      controller.stop();
    };
  }, []);
  return null;
}
