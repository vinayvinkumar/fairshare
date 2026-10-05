import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const roots = new WeakMap();

export default function mountFairShare(component) {
  const { data, parentElement, setTriggerValue } = component;
  const host = parentElement.querySelector("#fairshare-root");
  let root = roots.get(host);

  if (!root) {
    root = createRoot(host);
    roots.set(host, root);
  }

  root.render(
    <App
      data={data}
      sendAction={(action) => setTriggerValue("action", {
        ...action,
        client_action_id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      })}
    />,
  );

  return () => {
    root.unmount();
    roots.delete(host);
  };
}
