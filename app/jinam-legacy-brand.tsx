"use client";
import {APP_ICONS} from "./lib/app-icons";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function JinamLegacyBrand() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      const next = document.querySelector<HTMLElement>(".app .topbar");
      setHost(current => current === next ? current : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);

  if (!host) return null;
  return createPortal(<div className="jinamLegacyIdentity" aria-label="SEIKO TAILORS">
    <img src={APP_ICONS.svg} alt=""/><strong>SEIKO TAILORS</strong><span aria-hidden="true"/>
  </div>, host);
}
