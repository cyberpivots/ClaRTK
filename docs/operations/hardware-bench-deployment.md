# Hardware Bench Deployment Workflow

- Status: Draft
- Date: 2026-03-28

## Purpose

- Run the bench-first hardware deployment workflow for deployable physical hardware while keeping fixture inventory out of the default selection path.

## Services

- Broker/API: `corepack yarn dev:console:api`
- UI: `corepack yarn dev:console`
- Bench worker: `bash scripts/dev-hardware-bench-agent.sh`

## Flow

1. Reconcile deployable physical inventory in `clartk_dev`.
2. Start a hardware build in the dev-console hardware lane.
3. Start a deployment run for that build.
4. Confirm the linked deployment tasks are in the explicit hardware queue before waiting on workers:

   ```bash
   node scripts/dev-coordinator-status.mjs --json
   ```

   check:

   - `queues[].queueName` includes `hardware.build`
   - no deployment-linked task was routed to `default`
   - no stale leases are blocking the queue

5. Allow the bench agent to execute `hardware.probe_host`.
6. Complete manual deployment steps in order from the hardware checklist page:
   - image host
   - program receiver
   - configure receiver
   - capture artifacts
7. Request runtime publish only after:
   - build status is `bench_validated`
   - deployment run status is `completed`

## DB Checks

- Inspect deployment-linked tasks directly when a step appears stuck:

  ```bash
  psql "$CLARTK_DEV_DATABASE_URL" -c "\
    SELECT agent_task_id, task_kind, queue_name, status, lease_owner, lease_expires_at
    FROM agent.task
   WHERE (payload ->> 'deploymentRunId')::bigint = ${DEPLOYMENT_RUN_ID}
   ORDER BY created_at ASC;"
  ```

- Inspect deployment-step to task linkage:

  ```bash
  psql "$CLARTK_DEV_DATABASE_URL" -c "\
    SELECT sequence_index, step_kind, status, task_kind, agent_task_id
    FROM inventory.deployment_step
   WHERE deployment_run_id = ${DEPLOYMENT_RUN_ID}
   ORDER BY sequence_index ASC;"
  ```

## Notes

- Fixture `smoke_*` rows remain valid for smoke tests, but they are not shown as deployable stock by default.
- PX1122R flashing remains supervised/manual in this slice.
- XBee and ESP32 execution paths are intentionally deferred.
