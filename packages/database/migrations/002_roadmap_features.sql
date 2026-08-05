-- Roadmap: scan insights, crawl metadata, schedules, issue assignment

ALTER TABLE scans ADD COLUMN IF NOT EXISTS scan_metadata JSONB NOT NULL DEFAULT '{}';
ALTER TABLE scans ADD COLUMN IF NOT EXISTS crawl_mode TEXT NOT NULL DEFAULT 'single';
ALTER TABLE scans ADD COLUMN IF NOT EXISTS pages_planned INTEGER;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS pages_completed INTEGER;

ALTER TABLE issues ADD COLUMN IF NOT EXISTS assignee_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'open'
  CHECK (workflow_status IN ('open', 'in_progress', 'fixed', 'wont_fix'));

CREATE TABLE IF NOT EXISTS scan_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  cron_expression TEXT NOT NULL DEFAULT '0 9 * * *',
  enabled BOOLEAN NOT NULL DEFAULT true,
  viewports JSONB NOT NULL DEFAULT '["desktop","mobile"]',
  ai_mode TEXT NOT NULL DEFAULT 'off',
  crawl_mode TEXT NOT NULL DEFAULT 'single',
  max_pages INTEGER NOT NULL DEFAULT 25,
  notify_emails JSONB NOT NULL DEFAULT '[]',
  slack_webhook_url TEXT,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_schedules_project ON scan_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_scan_schedules_workspace ON scan_schedules(workspace_id);
