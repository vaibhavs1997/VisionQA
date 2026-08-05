import { Pool } from "pg";
import {
  listDueScanSchedules,
  touchScheduleLastRun,
  createScan,
  attachJobId,
  getProject,
} from "@ui-quality/database";
import { enqueueScan, ScanJobPayload } from "@ui-quality/queue";

/**
 * Checks enabled schedules once per tick and enqueues scans.
 * Called from the API process on an interval (see apps/api/src/index.ts).
 */
export async function runScheduleTick(pool: Pool): Promise<number> {
  const due = await listDueScanSchedules(pool);
  let started = 0;

  for (const schedule of due) {
    const project = await getProject(pool, schedule.workspaceId, schedule.projectId);
    if (!project) continue;

    const scan = await createScan(pool, {
      projectId: project.id,
      workspaceId: schedule.workspaceId,
      requestedUrl: project.baseUrl,
      viewports: schedule.viewports,
      aiMode: schedule.aiMode,
      crawlMode: schedule.crawlMode,
      pagesPlanned: schedule.crawlMode === "single" ? 1 : schedule.maxPages,
    });

    const payload: ScanJobPayload = {
      scanId: scan.id,
      workspaceId: schedule.workspaceId,
      projectId: project.id,
      requestedUrl: project.baseUrl,
      viewports: schedule.viewports,
      aiMode: schedule.aiMode as ScanJobPayload["aiMode"],
      crawlMode: schedule.crawlMode as ScanJobPayload["crawlMode"],
      maxPages: schedule.maxPages,
      projectSettings: project.settings,
    };

    const jobId = await enqueueScan(payload);
    await attachJobId(pool, scan.id, jobId);
    await touchScheduleLastRun(pool, schedule.id);

    if (schedule.notifyEmails.length > 0 || schedule.slackWebhookUrl) {
      // Best-effort notification hooks — real SMTP/Slack wiring is deployment-specific.
      // eslint-disable-next-line no-console
      console.log(
        `[schedule] scan ${scan.id} started for project ${project.id}; notify=${schedule.notifyEmails.length} slack=${Boolean(schedule.slackWebhookUrl)}`
      );
    }

    started += 1;
  }

  return started;
}
