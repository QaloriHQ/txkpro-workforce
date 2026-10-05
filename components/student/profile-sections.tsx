"use client";
import { useId, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
export function StudentProfileSections({ portfolio, credentials, activity }: { portfolio: ReactNode; credentials: ReactNode; activity: ReactNode }) {
 const [selected, setSelected] = useState(0);
 const id = useId();
 const buttons = useRef<(HTMLButtonElement | null)[]>([]);
 const sections = [{label:"Portfolio",content:portfolio},{label:"Credentials",content:credentials},{label:"Activity",content:activity}];
 function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % sections.length;
  else if (event.key === "ArrowLeft") next = (index + sections.length - 1) % sections.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = sections.length - 1;
  else return;
  event.preventDefault(); setSelected(next); buttons.current[next]?.focus();
 }
 return <div className="student-unified-profile-sections"><div className="student-prototype-tabs" role="tablist" aria-label="My profile sections">{sections.map((s,i)=><button key={s.label} ref={el=>{buttons.current[i]=el;}} type="button" role="tab" id={`${id}-tab-${i}`} aria-controls={`${id}-panel-${i}`} aria-selected={selected === i} tabIndex={selected === i ? 0 : -1} className={selected === i ? "active" : ""} onClick={()=>setSelected(i)} onKeyDown={e=>navigate(e,i)}>{s.label}</button>)}</div>{sections.map((s,i)=><section key={s.label} role="tabpanel" id={`${id}-panel-${i}`} aria-labelledby={`${id}-tab-${i}`} tabIndex={0} hidden={selected !== i}>{s.content}</section>)}</div>;
}
