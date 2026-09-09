const TOKEN = process.env.TOKEN;
const LOGIN = process.env.LOGIN || "xScriptor";

if (!TOKEN) {
  console.error("TOKEN env var is required");
  process.exit(1);
}

const FALLBACK_ORGS = [
  "xlnux",
  "gitnapse",
  "xfetch-cli",
  "T-Agencia",
  "xwebanalysis",
  "xscriptor-colors",
  "xscriptor-web",
  "xscriptor-legacy",
  "xscriptor-ai",
  "xtop-cli",
  "xscriptor-android"
];

const COLORS = {
  typescript: "#3178c6",
  javascript: "#f1e05a",
  shell: "#89e051",
  rust: "#dea584",
  python: "#3572a5",
  css: "#563d7c",
  kotlin: "#a97bff",
  java: "#b07219",
  dart: "#00b4ab",
  lua: "#000080",
  ruby: "#701516",
  qml: "#44a51c",
  powershell: "#012456",
  mdx: "#fcb32c",
  c: "#555555",
  cpp: "#f34b7d",
  go: "#00add8",
  markdown: "#083fa1",
  html: "#e34c26",
  json: "#969696",
  yaml: "#cb171e",
  toml: "#9c4221",
  vue: "#41b883",
  svelte: "#ff3e00",
  pug: "#a86454",
  xml: "#0060ac"
};

const gh = async (path) => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "xscriptor-languages"
    }
  });
  const payload = await response.json();
  if (!response.ok) {
    const message = payload.message || `HTTP ${response.status}`;
    throw new Error(`GitHub API error on ${path}: ${message}`);
  }
  return payload;
};

let orgs;
try {
  orgs = (await gh(`/user/orgs?per_page=100`)).map((org) => org.login);
} catch {
  orgs = [];
}
orgs = [...new Set([...FALLBACK_ORGS, ...orgs])];

const languages = new Map();
let scannedRepos = 0;

for (const org of orgs) {
  let repos;
  try {
    repos = await gh(`/orgs/${org}/repos?per_page=100&type=all`);
  } catch {
    continue;
  }
  for (const repo of repos) {
    if (repo.fork || repo.archived) continue;
    scannedRepos += 1;
    let bytes;
    try {
      bytes = await gh(`/repos/${repo.full_name}/languages`);
    } catch {
      continue;
    }
    for (const [name, size] of Object.entries(bytes)) {
      languages.set(name, (languages.get(name) || 0) + size);
    }
  }
}

const entries = [...languages.entries()].sort((a, b) => b[1] - a[1]);
const total = entries.reduce((sum, [, size]) => sum + size, 0);
if (entries.length === 0 || total === 0) throw new Error("No language data found");

const WIDTH = 480;
const PADDING = 18;
const TOP = 12;
const BAR_Y = 32;
const BAR_HEIGHT = 12;
const MAX_BAR_WIDTH = WIDTH - PADDING * 2;
const TOP_N = 6;

const shown = entries.slice(0, TOP_N).map(([name, size]) => ({ name, size, percentage: (size / total) * 100 }));
const rest = entries.slice(TOP_N);
const restBytes = rest.reduce((sum, [, size]) => sum + size, 0);
const shownTotal = shown.reduce((sum, { size }) => sum + size, 0);
if (restBytes > 0) {
  shown.push({ name: "Other", size: restBytes, percentage: (restBytes / total) * 100 });
}
shown.sort((a, b) => b.percentage - a.percentage);

const colorFor = (name) => COLORS[name.toLowerCase()] || "#959da5";
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const pct = (value) => `${value < 0.05 && value > 0 ? "<1" : Math.round(value)}%`;

const legendWidths = [];
let legendX = PADDING;
const legend = [];
for (const { name, percentage } of shown) {
  const width = name.length * 5.6 + 30;
  if (legendX + width > WIDTH - PADDING) break;
  legendWidths.push(width);
  legend.push({ name, percentage });
}
for (let index = 0; index < legend.length; index++) {
  legend[index].x = legendX;
  legendX += legendWidths[index];
}

const height = 86;
const legendY = BAR_Y + BAR_HEIGHT + 22;

let svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="6" fill="#ffffff" stroke="#e4e2e2"/>
  <defs>
    <clipPath id="bar-clip">
      <rect x="${PADDING}" y="${BAR_Y}" width="${MAX_BAR_WIDTH}" height="${BAR_HEIGHT}" rx="6"/>
    </clipPath>
  </defs>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  </style>
  <text x="${PADDING}" y="20" font-size="13" font-weight="600" fill="#2f80ed">Most used languages</text>
  <text x="${WIDTH - PADDING}" y="20" text-anchor="end" font-size="10" fill="#959da5">${orgs.length} orgs · ${scannedRepos} repos · ${entries.length} languages</text>`;

const barWidths = shown.map(({ percentage }) => Math.max(1, (percentage / 100) * MAX_BAR_WIDTH));
const factor = Math.min(1, MAX_BAR_WIDTH / barWidths.reduce((sum, width) => sum + width, 0));

let offset = PADDING;
shown.forEach(({ name }, index) => {
  const width = barWidths[index] * factor;
  svg += `<rect x="${offset}" y="${BAR_Y}" width="${width}" height="${BAR_HEIGHT}" fill="${colorFor(name)}" clip-path="url(#bar-clip)"/>`;
  offset += width;
});

for (const { name, percentage, x } of legend) {
  svg += `<circle cx="${x + 4}" cy="${legendY - 3}" r="3" fill="${colorFor(name)}"/>`;
  svg += `<text x="${x + 12}" y="${legendY}" font-size="10" fill="#586069">${esc(name)} <tspan font-weight="600" fill="#24292f">${pct(percentage)}</tspan></text>`;
}

svg += `
  <text x="${PADDING}" y="${height - 14}" font-size="9" fill="#959da5">Snapshot of all organization repositories · generated daily</text>
</svg>
`;

const { writeFileSync } = await import("node:fs");
writeFileSync("languages.orgs.svg", svg.trim());
console.log(`Rendered languages.orgs.svg (${entries.length} languages, ${scannedRepos} repos)`);
