import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AccessProvider } from "../../app/access-control";
import { BusinessAssistant } from "../../app/business-assistant";
import { normalizeMembership, THEME_PRESETS } from "../../app/lib/foundation";
import "../../app/globals.css";
import "../../app/business-assistant.css";

let saves = 0;
const membership = normalizeMembership({ businessId: "seiko", businessName: "TEST BUSINESS", role: "owner", modules: ["home", "orders"], permissions: ["orders.view", "orders.edit"], theme: THEME_PRESETS.seiko });
window.fetch = async (input, init) => {
  const url = String(input);
  if (url === "/api/erp/session") return Response.json({ ok: true, data: { user: { displayName: "TEST OWNER", email: "test@example.invalid" }, businesses: [membership] } });
  if (url === "/api/erp/labels") return Response.json({ ok: true, records: [] });
  if (url !== "/api/erp/assistant") return Response.json({ ok: true, data: {} });
  const body = JSON.parse(String(init?.body || "{}"));
  if (body.operation === "status") return Response.json({ ok: true, enabled: true, message: "Isolated fixture. No live API or business data." });
  if (body.operation === "memories") return Response.json({ ok: true, memories: [] });
  if (body.operation === "chat") return Response.json({ ok: true, conversationId: "fixture-conversation", message: "Review this fictional garment change.", proposal: { id: "fixture-proposal", tool: "edit_order", review: { client: "TEST CLIENT", garment: "T-shirt", specifications: { bodyColour: "Blue", collarColour: "Navy blue", sleeveColour: "Navy blue", cuffColour: "Navy blue", collarAndCuffLining: "Awaiting confirmation" } } } });
  if (body.operation === "confirm") { saves++; window.dispatchEvent(new Event("fixture:saved")); return Response.json({ ok: true, message: "Fixture change saved." }); }
  return Response.json({ ok: true, message: "Fixture proposal discarded." });
};
function Fixture() {
  const [count, setCount] = useState(saves);
  useEffect(() => { const saved = () => setCount(saves); window.addEventListener("fixture:saved", saved); return () => window.removeEventListener("fixture:saved", saved); }, []);
  return <AccessProvider><main style={{ padding: 32 }}><h1>Isolated assistant test</h1><p>No live records or model calls.</p><p>Fixture writes: {count}</p><BusinessAssistant businessId="seiko" module="orders" orderId="fixture-order" onOpenOrder={() => undefined}/></main></AccessProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
