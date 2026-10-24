import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { recordCspViolations } from "./diagnostics";
import "./styles.css";

recordCspViolations(document);

const container = document.getElementById("root");
if (container === null) throw new Error("Elemento #root não encontrado.");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
