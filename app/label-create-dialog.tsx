"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LabelCreateWorkspace } from "./labels/create/page";
import type { LabelCreationContext } from "./lib/label-creation";
import { CloseIcon } from "./ui-icons";
import "./label-create-dialog.css";

export function LabelCreateDialog() {
  const [context, setContext] = useState<LabelCreationContext | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [designing, setDesigning] = useState(false);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<LabelCreationContext>).detail;
      if (!detail?.businessId) return;
      setDesigning(false);
      setExpanded(false);
      setContext(detail);
    };
    window.addEventListener("jinam:create-labels", open);
    return () => window.removeEventListener("jinam:create-labels", open);
  }, []);
  useEffect(() => {
    if (!context) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [context]);
  const close = () => {
    if (designing && !window.confirm("Close the label workspace? Save your label set first to keep any unsaved design changes.")) return;
    setContext(null);
  };
  return context ? createPortal(<div className="labelCreateBackdrop"><section className={`labelCreateDialog ${expanded ? "isExpanded" : ""} ${designing ? "isDesigning" : ""}`} role="dialog" aria-modal="true" aria-label="Label workspace">
    <header className="labelCreateDialogHead"><div><b>Label workspace</b><span>Create, design and save labels</span></div><div><button type="button" className="secondary" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Exit full screen" : "Full screen"}</button><button type="button" className="uiIconButton uiCloseButton" aria-label="Close label workspace" title="Close label workspace" onClick={close}><CloseIcon/></button></div></header>
    <div className="labelCreateDialogBody"><LabelCreateWorkspace context={context} onClose={close} onDesigning={setDesigning}/></div>
  </section></div>, document.body) : null;
}
