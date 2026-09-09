const TOKEN = process.env.TOKEN;
const LOGIN = process.env.LOGIN || "xScriptor";

if (!TOKEN) {
  console.error("TOKEN env var is required");
  process.exit(1);
}

const query = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      commitContributionsByRepository(maxRepositories: 100) {
        repository {
          name
          owner {
            login
            avatarUrl
          }
        }
        contributions {
          totalCount
        }
      }
    }
  }
}`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "xscriptor-contributions"
  },
  body: JSON.stringify({ query, variables: { login: LOGIN } })
});

const payload = await response.json();

if (!response.ok || payload.errors) {
  const message = payload.errors ? payload.errors.map((e) => e.message).join("; ") : payload.message;
  throw new Error(`GitHub API error (${response.status}): ${message}`);
}

const byOwner = new Map();

for (const entry of payload.data.user.contributionsCollection.commitContributionsByRepository) {
  const owner = entry.repository.owner;
  const count = entry.contributions.totalCount;
  const current = byOwner.get(owner.login) || { login: owner.login, avatarUrl: owner.avatarUrl, count: 0, repositories: 0 };
  current.count += count;
  current.repositories += 1;
  byOwner.set(owner.login, current);
}

const owners = [...byOwner.values()].sort((a, b) => b.count - a.count);
const total = owners.reduce((sum, owner) => sum + owner.count, 0);

const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const short = (value) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
};

const WIDTH = 480;
const ROW_HEIGHT = 34;
const PADDING = 18;
const HEADER = 44;
const VISIBLE = 12;

const colorFromLogin = (login) => {
  let hash = 0;
  for (const char of login) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 60% 48%)`;
};

const initials = (login) =>
  login
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || login.slice(0, 2).toUpperCase();

const withAvatarSize = (url, size) => `${url}${url.includes("?") ? "&" : "?"}s=${size}`;

const loadAvatar = async (row) => {
  if (!row.avatarUrl) return;
  try {
    const response = await fetch(withAvatarSize(row.avatarUrl, 64));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    row.avatar = `data:${(response.headers.get("content-type") || "image/png").split(";")[0]};base64,${buffer.toString("base64")}`;
  } catch {
    row.avatar = null;
  }
};

const rows = owners.slice(0, VISIBLE).map((owner) => ({
  login: owner.login,
  avatarUrl: owner.avatarUrl,
  count: owner.count,
  repositories: owner.repositories
}));

const remaining = owners.slice(VISIBLE);
if (remaining.length > 0) {
  rows.push({
    login: `${remaining.length} more organizations`,
    avatarUrl: null,
    count: remaining.reduce((sum, owner) => sum + owner.count, 0),
    repositories: remaining.reduce((sum, owner) => sum + owner.repositories, 0)
  });
}

await Promise.all(rows.map(loadAvatar));

const height = HEADER + rows.length * ROW_HEIGHT + 52;
const year = new Date().getFullYear();

let svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <defs>
    <clipPath id="avatar-clip">
      <circle cx="12" cy="12" r="12"/>
    </clipPath>
  </defs>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="6" fill="#ffffff" stroke="#e4e2e2"/>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  </style>
  <text x="${PADDING}" y="22" font-size="16" font-weight="600" fill="#2f80ed">Commits by organization</text>
  <text x="${PADDING}" y="38" font-size="11" fill="#586069">Last 12 months · ${esc(LOGIN)}</text>`;

rows.forEach((row, index) => {
  const y = HEADER + index * ROW_HEIGHT;
  if (row.avatar) {
    svg += `<image x="${PADDING}" y="${y - 15}" width="24" height="24" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip)" href="${row.avatar}"/>`;
    svg += `<text x="${PADDING + 34}" y="${y}" font-size="14" fill="#24292f">${esc(row.login)}</text>`;
  } else if (row.avatarUrl) {
    svg += `<circle cx="${PADDING + 12}" cy="${y - 3}" r="12" fill="${colorFromLogin(row.login)}"/>`;
    svg += `<text x="${PADDING + 12}" y="${y + 1}" text-anchor="middle" font-size="11" font-weight="600" fill="#ffffff">${esc(initials(row.login))}</text>`;
    svg += `<text x="${PADDING + 34}" y="${y}" font-size="14" fill="#24292f">${esc(row.login)}</text>`;
  } else {
    svg += `<text x="${PADDING}" y="${y}" font-size="14" font-style="italic" fill="#586069">${esc(row.login)}</text>`;
  }
  svg += `<text x="${PADDING}" y="${y + 14}" font-size="10" fill="#959da5">${row.repositories} repo${row.repositories === 1 ? "" : "s"}</text>`;
  svg += `<text x="${WIDTH - PADDING}" y="${y + 2}" text-anchor="end" font-size="14" font-weight="600" fill="#24292f">${short(row.count)}</text>`;
});

svg += `
  <line x1="${PADDING}" y1="${HEADER + rows.length * ROW_HEIGHT}" x2="${WIDTH - PADDING}" y2="${HEADER + rows.length * ROW_HEIGHT}" stroke="#e4e2e2"/>
  <text x="${PADDING}" y="${HEADER + rows.length * ROW_HEIGHT + 22}" font-size="13" font-weight="600" fill="#24292f">Total</text>
  <text x="${WIDTH - PADDING}" y="${HEADER + rows.length * ROW_HEIGHT + 22}" text-anchor="end" font-size="13" font-weight="600" fill="#24292f">${short(total)}</text>
  <text x="${PADDING}" y="${height - 16}" font-size="9" fill="#959da5">Generated daily from GitHub GraphQL API · ${year}</text>
</svg>
`;

const { writeFileSync } = await import("node:fs");
writeFileSync("contributions.by-org.svg", svg.trim());
console.log(`Rendered contributions.by-org.svg with ${owners.length} organizations (${total} commits)`);
