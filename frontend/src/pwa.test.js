import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isIosDevice, resolvePwaAssetUrls } from "./pwa.js";

test("resolves Streamlit Cloud PWA assets inside the app route", () => {
  const assets = resolvePwaAssetUrls("https://fairshare.example/~/+/?source=test");

  assert.equal(assets.manifest, "https://fairshare.example/~/+/app/static/manifest.webmanifest");
  assert.equal(assets.icon, "https://fairshare.example/~/+/app/static/icons/fairshare-192.png");
});

test("resolves local Streamlit PWA assets from the root", () => {
  const assets = resolvePwaAssetUrls("http://localhost:5181/");

  assert.equal(assets.manifest, "http://localhost:5181/app/static/manifest.webmanifest");
  assert.equal(assets.appleTouchIcon, "http://localhost:5181/app/static/icons/fairshare-180.png");
});

test("detects iOS and iPad desktop user agents", () => {
  assert.equal(isIosDevice({ userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone", maxTouchPoints: 5 }), true);
  assert.equal(isIosDevice({ userAgent: "Mozilla/5.0", platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(isIosDevice({ userAgent: "Mozilla/5.0", platform: "MacIntel", maxTouchPoints: 0 }), false);
});

test("manifest launches the outer Streamlit URL locally and in cloud", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../static/manifest.webmanifest", import.meta.url), "utf8"));
  const localManifest = "http://localhost:5181/app/static/manifest.webmanifest";
  const cloudManifest = "https://fairshare.example/~/+/app/static/manifest.webmanifest";

  assert.equal(new URL(manifest.start_url, localManifest).href, "http://localhost:5181/?source=pwa");
  assert.equal(new URL(manifest.start_url, cloudManifest).href, "https://fairshare.example/?source=pwa");
  assert.equal(new URL(manifest.scope, cloudManifest).href, "https://fairshare.example/");
});
