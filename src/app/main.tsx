import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./shell.css";

const rootElement = document.querySelector<HTMLDivElement>("#root");
if (rootElement === null) {
  throw new Error("Application root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
