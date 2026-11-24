"use client";
import { useAccess } from "./access-control";
import { canAccess, type Module } from "./lib/foundation";

export function MenuLayoutEditor(){
 const {membership,can,businessId}=useAccess();
 const main:[string,string,Module?][]=[["Home","⌂","home"],["Orders","≡","orders"],["Labels","▤","labels"],["Scan","⌗","scan"],["Trace","◎","trace"],["Production","•","production"],["Inventory","•","inventory"],["Sales","•","sales"],["Delivery","•","delivery"],["Clients","◎"],["Products","◇"],["Billing","₹"]];
 const row=([label,icon]:[string,string,Module?])=><button type="button" className="nav" key={label}><span>{icon}</span><small>{label}</small></button>;
 return <section className="menuLayoutEditor" aria-label="Menu Layout"><header><h3>Menu Layout</h3><button type="button" className="secondary" onClick={()=>{localStorage.removeItem(`jinam:menu-order:v1:${businessId}`);window.dispatchEvent(new Event("jinam:menu-order-changed"));}}>Reset Menu</button></header><div className="menuLayoutPreview menuArrangeEditing" aria-label="Menu Item Arrangement">{main.filter(([label,,module])=>label==="Billing"?can("financials.view"):!module||canAccess(membership,module)).map(row)}<div className="moduleMenuSettings">{([["MeTh Jobs","↔"],["Settings","⚙"],["Help & Training","?"],["Sign Out","↪"]] as [string,string][]).map(row)}</div></div></section>;
}
