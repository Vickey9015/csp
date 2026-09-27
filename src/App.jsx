import { useState } from "react";
import LoginPage from "./LoginPage.jsx";

export default function App() {
  const [session, setSession] = useState(null);

  if (session) {
    return (
      <main className="signed-in">
        <p className="eyebrow">CSP Services</p>
        <h1>You are signed in.</h1>
        <p className="lede">
          Welcome back, <strong>{session.email}</strong>. Your service desk is
          ready.
        </p>
        <button type="button" className="ghost" onClick={() => setSession(null)}>
          Sign out
        </button>
      </main>
    );
  }

  return <LoginPage onSuccess={setSession} />;
}
