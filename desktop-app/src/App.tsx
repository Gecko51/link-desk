import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { HomeRoute } from "@/routes/home";
import { HostRoute } from "@/routes/host";
import { ControllerRoute } from "@/routes/controller";
import { Toaster } from "@/components/ui/sonner";
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
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
