import cron from "node-cron";
import { generateReport } from "../services/reports";
import { postToBluesky } from "../services/bluesky";

const DASHBOARD_URL = "https://github-tendency.vercel.app";

function formatDate(): string {
  const d = new Date();
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatPost(report: Awaited<ReturnType<typeof generateReport>>): string {
  const top = report.top_repos[0];
  const topKeyword = report.per_keyword[0];
  const topLang = report.language_breakdown[0];

  const lines = [
    `📊 GitHub Trends — ${formatDate()}`,
    ``,
    `🥇 ${top.full_name} ⭐${(top.stars / 1000).toFixed(1)}K`,
    `🔥 ${topKeyword.keyword} (${topKeyword.total_repos} repos)`,
    `📈 ${topLang.language} (${topLang.percentage}%)`,
    `📦 ${report.totals.total_repos.toLocaleString()} repos`,
    ``,
    `📋 ${DASHBOARD_URL}`,
    `#GitHub #OpenSource`,
  ];

  return lines.join("\n");
}

export function startPoster() {
  console.log("[poster] Scheduler started: 8:00 & 20:00");

  cron.schedule("0 8 * * *", async () => {
    console.log("[poster] Morning report triggered");
    const report = await generateReport();
    const text = formatPost(report);
    await postToBluesky(text);
  });

  cron.schedule("0 20 * * *", async () => {
    console.log("[poster] Evening report triggered");
    const report = await generateReport();
    const text = formatPost(report);
    await postToBluesky(text);
  });
}
