import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installMaintenanceFetchInterceptor } from "@/lib/maintenance";

installMaintenanceFetchInterceptor();

createRoot(document.getElementById("root")!).render(<App />);
