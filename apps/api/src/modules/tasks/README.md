# tasks

**Owns:** Tasks of every category, the fixed workflow state machine (task-workflow.ts) with its gates, status history, dependencies, comments with visibility, the four-question completion sheet, recurrence and duplication.

**Planned phase:** Phase 1 (order 4)

**Entities:** tasks, task_categories, task_status_labels, task_dependencies, task_status_history, comments, check_overrides

**Endpoints:** GET /tasks?view=… (`overdue=true` and `completedToday=true` narrow any view; see docs/design-implementation-map.md "Dashboard cards and their destinations") · POST /tasks · GET|PATCH /tasks/:id · POST /tasks/:id/{assign,start,block,dev-complete,request-review,approve,reject,ready-for-qa,send-for-testing,override-checks,cancel,duplicate,recurrence} · GET /tasks/:id/history · GET|POST /tasks/:id/comments

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
