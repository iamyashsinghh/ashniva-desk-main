-- Intern learning tasks (private to assigner + intern + Super Admin) and attachment captions.

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "is_intern_task" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "tasks_organization_id_is_intern_task_idx" ON "tasks"("organization_id", "is_intern_task");

ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "caption" TEXT;

-- Seed the Intern work category for every organization that does not already have it.
INSERT INTO task_categories (id, organization_id, name, kind, sort_order, is_active, created_at, updated_at)
SELECT gen_random_uuid(), o.id, 'Intern work', 'OTHER', 90, true, NOW(), NOW()
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM task_categories c
  WHERE c.organization_id = o.id AND c.name = 'Intern work'
);
