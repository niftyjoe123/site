// Fetches computed dashboard JSON from /data/*.json at runtime (never bundled via
// `import`) -- matches the eventual nightly-automation design (copy artifacts, no
// rebuild required for a data-only refresh).

async function fetchJson(path) {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!res.ok) {
    throw new Error(`failed to load ${path}: ${res.status}`);
  }
  return res.json();
}

export function loadGspcDeepHistory() {
  return fetchJson('gspc_deep_history.json');
}

export function loadSpyPanel() {
  return fetchJson('spy_panel.json');
}
