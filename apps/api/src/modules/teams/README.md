# teams

**Owns:** Teams and departments with a lead; team membership drives 'Team Tasks' and team-scoped permissions.

**Planned phase:** Phase 1 (order 2)

**Entities:** teams, team_members

**Endpoints:** GET|POST /teams · POST /teams/:id/members

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
