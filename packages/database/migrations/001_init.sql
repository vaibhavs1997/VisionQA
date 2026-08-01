-- Phase 4 production schema. Postgres-native types throughout (UUID,
-- TIMESTAMPTZ, JSONB) — a deliberate improvement over the Phase 3 SQLite
-- schema's TEXT/ISO-string workarounds, now that we're on real Postgres.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requested_url TEXT NOT NULL,
  final_url TEXT,
  viewports JSONB NOT NULL DEFAULT '[]',
  ai_mode TEXT NOT NULL DEFAULT 'off',
  status TEXT NOT NULL DEFAULT 'QUEUED',
  current_step TEXT,
  failure_reason TEXT,
  score INTEGER,
  ai_telemetry JSONB,
  job_id TEXT, -- BullMQ job id, for correlating queue state with scan state
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scans_project ON scans(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_workspace ON scans(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);

CREATE TABLE IF NOT EXISTS scan_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  viewport_name TEXT NOT NULL,
  viewport_width INTEGER NOT NULL,
  viewport_height INTEGER NOT NULL,
  load_state TEXT NOT NULL,
  screenshot_storage_keys JSONB NOT NULL DEFAULT '[]' -- object storage keys, not local paths
);
CREATE INDEX IF NOT EXISTS idx_scan_pages_scan ON scan_pages(scan_id);

CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  scan_page_id UUID NOT NULL REFERENCES scan_pages(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence REAL NOT NULL,
  url TEXT NOT NULL,
  viewport JSONB NOT NULL,
  selector TEXT,
  bounding_box JSONB,
  evidence JSONB NOT NULL DEFAULT '{}',
  ai_explanation TEXT,
  ai_validation JSONB,
  suggested_fix TEXT,
  detector JSONB NOT NULL,
  root_cause_signature TEXT,
  affected_element_count INTEGER NOT NULL DEFAULT 1,
  responsive_recurrence JSONB,
  feedback_status TEXT NOT NULL DEFAULT 'open' CHECK (feedback_status IN ('open', 'valid', 'false_positive', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issues_scan ON issues(scan_id, severity);
CREATE INDEX IF NOT EXISTS idx_issues_scan_page ON issues(scan_page_id);
CREATE INDEX IF NOT EXISTS idx_issues_root_cause ON issues(root_cause_signature);

CREATE TABLE IF NOT EXISTS issue_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- 'screenshot' | 'annotated_crop' | 'ai_crop' | 'network_log' | ...
  storage_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issue_evidence_issue ON issue_evidence(issue_id);

CREATE TABLE IF NOT EXISTS issue_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feedback TEXT NOT NULL CHECK (feedback IN ('valid', 'false_positive', 'ignored')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issue_feedback_issue ON issue_feedback(issue_id);

CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'scan.completed' | 'ai_call' | ...
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_workspace ON usage_events(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  scan_id UUID,
  issue_id UUID,
  user_id UUID,
  ip TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON audit_log(workspace_id, created_at DESC);
