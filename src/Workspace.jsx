import { useState } from "react";
import AadhaarPrint from "./AadhaarPrint.jsx";

const PAGES = [
  { id: "aadhaar", label: "Aadhaar" },
  { id: "pan", label: "PAN" },
  { id: "licence", label: "Driving licence" },
  { id: "other", label: "Other documents" },
];

const LATER = {
  pan: "PAN printouts will use this same A4 desk. Aadhaar is ready now.",
  licence: "Driving licence printouts will use this same A4 desk. Aadhaar is ready now.",
  other: "Other document printouts will use this same A4 desk. Aadhaar is ready now.",
};

export default function Workspace({ session, onSignOut }) {
  const [page, setPage] = useState("aadhaar");
  const [printoutsOpen, setPrintoutsOpen] = useState(true);

  return (
    <div className="workspace">
      <aside className="sidebar no-print">
        <div className="sidebar-brand">
          <span className="mark">CSP</span>
          <span className="est">Services</span>
        </div>
        <p className="sidebar-user">{session.email}</p>
        <nav aria-label="Main">
          <button
            type="button"
            className="nav-parent"
            aria-expanded={printoutsOpen}
            onClick={() => setPrintoutsOpen((open) => !open)}
          >
            Printouts
            <span aria-hidden="true">{printoutsOpen ? "–" : "+"}</span>
          </button>
          {printoutsOpen ? (
            <div className="nav-children" role="group" aria-label="Printouts">
              {PAGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={page === item.id ? "nav-item active" : "nav-item"}
                  aria-current={page === item.id ? "page" : undefined}
                  onClick={() => setPage(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </nav>
        <button type="button" className="ghost sign-out" onClick={onSignOut}>
          Sign out
        </button>
      </aside>

      <main className="workspace-main">
        <div hidden={page !== "aadhaar"}>
          <AadhaarPrint />
        </div>
        {page === "aadhaar" ? null : (
          <section className="later no-print">
            <p className="eyebrow">Printouts</p>
            <h1>{PAGES.find((item) => item.id === page)?.label}</h1>
            <p>{LATER[page]}</p>
          </section>
        )}
      </main>
    </div>
  );
}
