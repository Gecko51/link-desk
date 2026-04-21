import { useEffect } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { HomeRoute } from "@/routes/home";
import { HostRoute } from "@/routes/host";
import { ControllerRoute } from "@/routes/controller";
import { Toaster } from "@/components/ui/sonner";
import { useMachineId } from "@/features/machine-id/use-machine-id";
import "./index.css";

// Memory router: no browser URL exposed to end user (PRD §7).
// Initial route is always `/` at cold start.
const router = createMemoryRouter(
  [
    { path: "/", element: <HomeRoute /> },
    { path: "/host", element: <HostRoute /> },
    { path: "/controller", element: <ControllerRoute /> },
  ],
  { initialEntries: ["/"] },
);

export default function App() {
  // Fires the Tauri command that generates-or-reads the persistent machine id.
  // The UUID itself is never shown to the user (PRD §3 Module 1).
  const machine = useMachineId();

  // Dev-only flag log. Never log the UUID in prod (DEV-RULES §10).
  useEffect(() => {
    if (import.meta.env.DEV && machine.id) {
      console.debug("[linkdesk] machine id ready");
    }
  }, [machine.id]);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
