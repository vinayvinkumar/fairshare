const THEME_COLOR = "#191927";
const BACKGROUND_COLOR = "#f5f6fa";
const PWA_MARKER = "data-fairshare-pwa";

export function resolvePwaAssetUrls(locationHref) {
  const staticBase = new URL("app/static/", locationHref);
  return {
    manifest: new URL("manifest.webmanifest", staticBase).href,
    favicon: new URL("icons/fairshare-32.png", staticBase).href,
    icon: new URL("icons/fairshare-192.png", staticBase).href,
    appleTouchIcon: new URL("icons/fairshare-180.png", staticBase).href,
  };
}

export function getHostWindow(sourceWindow) {
  try {
    if (sourceWindow.top?.document) return sourceWindow.top;
  } catch {
    return sourceWindow;
  }
  return sourceWindow;
}

function upsertLink(document, rel, href, sizes) {
  let link = document.head.querySelector(`link[${PWA_MARKER}][rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    link.setAttribute(PWA_MARKER, "true");
    document.head.append(link);
  }
  link.href = href;
  if (sizes) link.sizes = sizes;
}

function upsertMeta(document, name, content) {
  let meta = document.head.querySelector(`meta[${PWA_MARKER}][name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    meta.setAttribute(PWA_MARKER, "true");
    document.head.append(meta);
  }
  meta.content = content;
}

export function applyPwaMetadata(sourceWindow) {
  const hostWindow = getHostWindow(sourceWindow);
  const assets = resolvePwaAssetUrls(sourceWindow.location.href);
  const documents = new Set([sourceWindow.document, hostWindow.document]);

  for (const document of documents) {
    upsertLink(document, "manifest", assets.manifest);
    upsertLink(document, "icon", assets.favicon, "32x32");
    upsertLink(document, "apple-touch-icon", assets.appleTouchIcon, "180x180");
    upsertMeta(document, "theme-color", THEME_COLOR);
    upsertMeta(document, "mobile-web-app-capable", "yes");
    upsertMeta(document, "apple-mobile-web-app-capable", "yes");
    upsertMeta(document, "apple-mobile-web-app-status-bar-style", "black-translucent");
    upsertMeta(document, "apple-mobile-web-app-title", "FairShare");
    document.documentElement.lang = "en";
    document.documentElement.style.backgroundColor = BACKGROUND_COLOR;
  }

  hostWindow.document.title = "FairShare";
  return hostWindow;
}

export function isStandaloneMode(sourceWindow) {
  const hostWindow = getHostWindow(sourceWindow);
  return Boolean(
    hostWindow.matchMedia?.("(display-mode: standalone)").matches
      || hostWindow.navigator?.standalone,
  );
}

export function isIosDevice(navigatorLike) {
  const userAgent = navigatorLike?.userAgent || "";
  const platform = navigatorLike?.platform || "";
  const touchPoints = Number(navigatorLike?.maxTouchPoints || 0);
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && touchPoints > 1);
}
