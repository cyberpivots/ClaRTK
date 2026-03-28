# Runtime Handoff Playbook

- Status: Draft
- Date: 2026-03-27

Use this playbook to publish an approved base+rover build artifact into runtime workflows only when validation is complete.

## Preconditions

- Build session exists in `inventory.build`.
- Build status is `bench_validated`.
- `hardware.bench_validate` task has status `succeeded` for that build.
- `runtimeDeviceId` is known and approved by operators.

## Manual steps

1. Confirm build lifecycle state

   ```bash
   curl -s "$CLARTK_DEV_CONSOLE_API_BASE_URL/v1/inventory/builds/${BUILD_ID}" \
     -H "X-Clartk-Review-Token: $CLARTK_AGENT_MEMORY_REVIEW_TOKEN"
   ```

   Required fields:

   - `status`: `bench_validated`
   - `baseUnitId` and `roverUnitId`
   - `currentTaskId`

2. Confirm dependent task history

   ```bash
   psql "$CLARTK_DEV_DATABASE_URL" -c "\
     SELECT task_kind, status
     FROM agent.task
    WHERE (payload ->> 'buildId')::bigint = ${BUILD_ID}
      AND task_kind IN ('hardware.prepare','hardware.reserve_parts','hardware.build','hardware.bench_validate')
    ORDER BY created_at;"
   ```

   all rows should be `succeeded`.

3. Gate and request runtime handoff

   ```bash
   curl -s -X POST "$CLARTK_DEV_CONSOLE_API_BASE_URL/v1/inventory/builds/${BUILD_ID}/runtime-publish" \
     -H "content-type: application/json" \
     -H "X-Clartk-Review-Token: $CLARTK_AGENT_MEMORY_REVIEW_TOKEN" \
     -d '{"runtimeDeviceId":"'"${RUNTIME_DEVICE_ID}"'"}'
   ```

   Response should return build status `runtime_publish_pending`.

4. Allow a worker pass to execute runtime registration

   - Run one queue worker pass for `agent-task` queue used by the build.
   - Confirm build status becomes `runtime_published` and `inventory.event` includes `hardware-runtime_register.completed`.

5. Verify no task-level failures were produced

   ```bash
   psql "$CLARTK_DEV_DATABASE_URL" -c "\
     SELECT task_kind, status
     FROM agent.task
    WHERE (payload ->> 'buildId')::bigint = ${BUILD_ID}
    ORDER BY created_at;"
   ```

   any status other than `succeeded` on dependency tasks requires rollback before operator handoff.

## Fixture-aware follow-up (deferred)

- Before field testing, run radio/serial fixture-driven checks by setting:
  - `CLARTK_GATEWAY_SERIAL_PORT`
  - `CLARTK_GATEWAY_FIXTURE_PATH`
- Keep this playbook as the gate: do not promote to runtime if these prechecks are not fully satisfied.
