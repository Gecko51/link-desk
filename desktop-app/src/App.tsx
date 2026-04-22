import { useEffect } from "react";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router-dom";
import { HomeRoute } from "@/routes/home";
import { HostRoute } from "@/routes/host";
import { ControllerRoute } from "@/routes/controller";
import { HostSessionRoute } from "@/routes/host-session";
import { ControllerConnectingRoute } from "@/routes/controller-connecting";
import { ControllerSessionRoute } from "@/routes/controller-session";
import { Toaster } from "@/components/ui/sonner";
import { useMachineId } from "@/features/machine-id/use-machine-id";
import { usePin } from "@/features/pin/use-pin";
import { useSignaling } from "@/features/signaling/use-signaling";
import { useSession } from "@/features/session/use-session";
import { AppStateContext } from "@/app-state";
import "./index.css";

// Root layout component: lives *inside* the router so useNavigate (used by
// useSession) has a valid router context. Provides AppStateContext to all routes.
function AppLayout() {
  // Fires the Tauri command that generates-or-reads the persistent machine id.
  // The UUID itself is never shown to the user (PRD §3 Module 1).
  const machine = useMachineId();

  // PIN hoisted to app level so all routes share a single rotation lifecycle.
  const { session: pinSession, secondsRemaining, regenerate: regeneratePin } = usePin();

  // Signaling hoisted to app level — auto-connects on boot, sends register with current PIN.
  // Returns SignalingApi (connection state + send + onMessage) — client encapsulated.
  const signaling = useSignaling({
    machineId: machine.id,
    pin: pinSession.pin,
    pinExpiresAt: pinSession.expiresAt,
  });

  // Session orchestrator: drives the WebRTC lifecycle and navigates on status changes.
  // useNavigate is valid here because AppLayout renders inside the router (as a layout route).
  const session = useSession({ machineId: machine.id, signaling });

  // Dev-only flag log. Never log the UUID in prod (DEV-RULES §10).
  useEffect(() => {
    if (import.meta.env.DEV && machine.id) {
      console.debug("[linkdesk] machine id ready");
    }
  }, [machine.id]);

  return (
    <AppStateContext.Provider
      value={{
        machineId: machine.id,
        pinSession,
        secondsRemaining,
        regeneratePin,
        signaling,
        session,
      }}
    >
      {/* Outlet renders the matched child route element */}
      <Outlet />
      <Toaster />
    </AppStateContext.Provider>
  );
}

// Memory router: no browser URL exposed to end user (PRD §7).
// Initial route is always `/` at cold start.
// AppLayout is used as a root layout route so all hooks can call useNavigate.
// The 3 new Phase 3 routes cover the WebRTC session lifecycle:
// - /host/session         : hôte avec data channel ouvert
// - /controller/connecting: contrôleur en attente de consentement
// - /controller/session   : contrôleur avec data channel ouvert
const router = createMemoryRouter(
  [
    {
      element: <AppLayout />,
      children: [
        { path: "/", element: <HomeRoute /> },
        { path: "/host", element: <HostRoute /> },
        { path: "/host/session", element: <HostSessionRoute /> },
        { path: "/controller", element: <ControllerRoute /> },
        { path: "/controller/connecting", element: <ControllerConnectingRoute /> },
        { path: "/controller/session", element: <ControllerSessionRoute /> },
      ],
    },
  ],
  { initialEntries: ["/"] },
);

export default function App() {
  return <RouterProvider router={router} />;
}
