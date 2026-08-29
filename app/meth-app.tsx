"use client";

import { useAccess } from "./access-control";
import { JinamBusinessShell } from "./jinam-business-shell";
import { THEME_PRESETS } from "./lib/foundation";

const METH_NAV = [{ key: "home", label: "Home", icon: "⌂" }] as const;

type MethModule = (typeof METH_NAV)[number]["key"];

export function MethApplication() {
  const { businessId, membership } = useAccess();
  if (businessId !== "meth" || !membership) return null;

  return <JinamBusinessShell<MethModule>
    businessName={membership.businessName || "MeTh"}
    businessLogo={membership.logoUrl || "/brands/meth-logo.jpg"}
    theme={membership.theme || THEME_PRESETS.meth}
    nav={METH_NAV}
    active="home"
    onNavigate={() => undefined}
  >
    <section className="jinamPhaseHome">
      <div className="jinamPhaseHero">
        <div><small>METH · JINAM</small><h1>Home</h1></div>
        <span className="jinamPhaseStatus">Business isolated</span>
      </div>
      <div className="jinamPhaseGrid">
        <article className="jinamPhaseCard"><small>COMMERCE</small><strong>MeTh owns its orders</strong><p>Store orders, customers and fulfilment stay inside MeTh rather than opening SEIKO screens.</p></article>
        <article className="jinamPhaseCard"><small>PRODUCTION</small><strong>SEIKO is a linked manufacturer</strong><p>Production-required lines will be handed to SEIKO as linked production jobs and returned to MeTh when ready.</p></article>
        <article className="jinamPhaseCard"><small>FULFILMENT</small><strong>MeTh packs & delivers</strong><p>After production returns from SEIKO, MeTh remains responsible for packing, delivery and customer-facing status.</p></article>
      </div>
    </section>
  </JinamBusinessShell>;
}
