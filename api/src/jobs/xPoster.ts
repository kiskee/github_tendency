import cron from "node-cron";
import { generateReport } from "../services/reports.js";
import { postToBluesky } from "../services/bluesky.js";

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
  const topOwner = report.top_owners[0];
  const t = report.totals;

  const fmt = (n: number): string =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  const lines = [
    `🔥 "${topKeyword.keyword}" is trending on GitHub`,
    `${formatDate()} — ${topKeyword.total_repos} repos (⭐${fmt(topKeyword.avg_stars)} avg, ⭐${fmt(topKeyword.max_stars)} max)`,
    ``,
    `🥇 ${top.full_name} ⭐${fmt(top.stars)} 🍴${fmt(top.forks)}`,
    `📈 ${topLang.language} ${topLang.percentage}% · 👤 ${topOwner.owner} (${topOwner.repo_count} repos, ⭐${fmt(topOwner.total_stars)})`,
    ``,
    `📊 ${t.total_repos.toLocaleString()} repos · ${t.total_keywords} keywords · ${t.total_owners} authors`,
    `🌐 ${DASHBOARD_URL}`,
    `#GitHub #OpenSource`,
  ];

  return lines.join("\n");
}

const SCHEDULE_MORNING = "3 * * * *";
const SCHEDULE_EVENING = "0 20 * * *";

export function startPoster() {
  if (!cron.validate(SCHEDULE_MORNING) || !cron.validate(SCHEDULE_EVENING)) {
    console.error(`[poster] Invalid cron schedule: ${SCHEDULE_MORNING} or ${SCHEDULE_EVENING}`);
    return;
  }

  console.log(`[poster] Scheduler started: ${SCHEDULE_MORNING} & ${SCHEDULE_EVENING}`);

  cron.schedule(SCHEDULE_MORNING, async () => {
    console.log("[poster] Morning report triggered");
    const report = await generateReport();
    const text = formatPost(report);
    await postToBluesky(text);
  });

  cron.schedule(SCHEDULE_EVENING, async () => {
    console.log("[poster] Evening report triggered");
    const report = await generateReport();
    const text = formatPost(report);
    await postToBluesky(text);
  });
}
