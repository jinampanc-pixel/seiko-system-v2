import React from "react";
import { createRoot } from "react-dom/client";
import "../../app/globals.css";
import "../../app/seiko-phase2.css";
import { SeikoBillingWorkspace } from "../../app/seiko-billing-workspace";
import { blankProduct, type SeikoOrder } from "../../app/lib/order-domain";
const order: SeikoOrder = { orderId: "order-test", status: "Active", archived: false, details: { orderNo: "ORDER-TEST", clientName: "School test", contactNumber: "9999999999", billTo: "Test address", orderDate: "", deliveryDate: "", clientType: "", contactPerson: "", attnRequired: false, shipTo: "", remarks: "" }, products: [{ ...blankProduct(), id: "vest", name: "Vest", quantityMode: "per_person", defaultQuantity: 0 }], fields: [], measurements: [], records: [{ recordId: "one", personId: "one", values: { "product:vest:qty": 2 } }, { recordId: "two", personId: "two", values: { "product:vest:qty": 1 } }, { recordId: "held", personId: "held", held: true, values: { "product:vest:qty": 4 } }], revisions: [], updatedAt: "" };
createRoot(document.getElementById("root")!).render(<main style={{ padding: 24 }}><h1>SEIKO Billing</h1><SeikoBillingWorkspace orders={[order]}/></main>);
