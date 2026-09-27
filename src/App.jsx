import { useState } from "react";
import LoginPage from "./LoginPage.jsx";
import Workspace from "./Workspace.jsx";

export default function App() {
  const [session, setSession] = useState(null);

  if (session) {
    return <Workspace session={session} onSignOut={() => setSession(null)} />;
  }

  return <LoginPage onSuccess={setSession} />;
}
