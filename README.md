# QueueCTL

A CLI-based background job queue system built with Node.js and SQLite. Supports persistent job storage, multiple concurrent worker processes, automatic retry with exponential backoff, and a Dead Letter Queue for permanently failed jobs.

Built as a backend developer internship assignment.

## Features

- **CLI-based job management** — enqueue, list, and monitor jobs from the command line
- **Persistent storage** — jobs survive application restarts (SQLite, WAL mode)
- **Multiple worker processes** — genuine OS-level parallelism via `child_process.fork()`, not simulated
- **Atomic job claiming** — race-condition-safe job claiming prevents duplicate processing across workers
- **Retry with exponential backoff** — failed jobs automatically retry with increasing delay (`delay = base ^ attempts`)
- **Dead Letter Queue (DLQ)** — jobs that exhaust all retries move to a DLQ for manual inspection/retry
- **Configurable** — retry count and backoff base are configurable via CLI, not hardcoded
- **Graceful shutdown** — workers finish their current job before exiting on `worker stop`
- **Clean CLI with help text** — every command supports `--help`, with user-friendly error messages

## Tech Stack

| Component | Choice | Why |
|---|---|---|
| Runtime | Node.js | Matches available skillset, fast iteration |
| CLI framework | [commander](https://www.npmjs.com/package/commander) | Auto-generated help text, minimal boilerplate |
| Database | [better-sqlite3](https://www.npmjs.com/package/better-sqlite3) | Synchronous API enables atomic compare-and-swap job claiming without external locking; WAL mode allows safe multi-process access |
| Multi-worker | `child_process.fork()` | Genuine independent OS processes, real parallelism |

No Docker, Redis, Kafka, or web dashboard — intentionally kept simple and appropriate for the scope.

## Setup Instructions

```bash
git clone https://github.com/<your-username>/queuectl.git
cd queuectl
npm install
```

Requires Node.js 18+.

## CLI Commands

```bash
# Enqueue a job (inline JSON or via file — file recommended on Windows/PowerShell)
queuectl enqueue '{"id":"job1","command":"echo hello"}'
queuectl enqueue --file job.json

# Worker management
queuectl worker start --count 3
queuectl worker stop

# Visibility
queuectl status
queuectl list --state pending

# Dead Letter Queue
queuectl dlq list
queuectl dlq retry <job-id>

# Configuration
queuectl config set max-retries 3
queuectl config set backoff-base 2
queuectl config get
```

Run `queuectl --help` or `queuectl <command> --help` for details on any command.

## Usage Examples

**Enqueue a job:**
```bash
$ node bin/queuectl.js enqueue --file job.json
Job enqueued successfully:
{
  "id": "job1",
  "command": "echo hello",
  "state": "pending",
  "attempts": 0,
  "max_retries": 3,
  "last_error": null,
  "next_attempt_at": null,
  "created_at": "2026-07-17T07:15:30.990Z",
  "updated_at": "2026-07-17T07:15:30.990Z"
}
```

**Check status:**
```bash
$ node bin/queuectl.js status
Queue Status:
--------------
pending     : 1
processing  : 0
completed   : 2
failed      : 0
dead        : 1
```

**Start 3 workers:**
```bash
$ node bin/queuectl.js worker start --count 3
Started worker process (PID 16164) — logs: .../logs/worker-0.log
Started worker process (PID 22408) — logs: .../logs/worker-1.log
Started worker process (PID 12512) — logs: .../logs/worker-2.log

3 worker(s) started. Use "queuectl worker stop" to shut them down gracefully.
```

**Retry a dead job:**
```bash
$ node bin/queuectl.js dlq retry badjob2
Job "badjob2" moved back to pending queue (attempts reset to 0):
{ "id": "badjob2", "state": "pending", "attempts": 0, ... }
```

## Architecture Overview
queuectl/
├── bin/queuectl.js          # CLI entrypoint (commander setup)
├── src/
│   ├── db/database.js       # SQLite connection, WAL mode, schema init
│   ├── models/jobModel.js   # All job queries — the only file that touches SQL directly
│   ├── config/config.js     # config.json read/write
│   ├── worker/
│   │   ├── workerProcess.js # Continuous claim-execute loop; runs as a forked child
│   │   └── workerManager.js # Spawns/tracks/stops detached worker processes
│   ├── commands/             # CLI command handlers (enqueue, status, list, dlq, config)
│   └── utils/backoff.js      # Exponential backoff calculation
├── data/queue.db              # SQLite database file (gitignored)
├── logs/                      # Per-worker log files (gitignored)
└── test/core-flow.test.js     # Scenario validation script

Separation of concerns: `commands/` only parses CLI args and calls `models/`; `models/` is the only layer that writes SQL; `worker/` owns execution and retry logic independently.

## Job Lifecycle
pending → processing → completed
pending → processing → failed → (backoff wait) → pending → ... → dead (after max_retries)

Every state transition updates `updated_at`. `attempts` increments on each failed execution.

## Worker Logic (Atomic Job Claiming)

Multiple worker processes safely share one job queue using a **conditional UPDATE as a compare-and-swap lock**:

```sql
UPDATE jobs
SET state = 'processing', updated_at = ?
WHERE id = (SELECT id FROM jobs WHERE state = 'pending' ORDER BY created_at ASC LIMIT 1)
  AND state = 'pending'
```

If two workers race to claim the same job, only one UPDATE actually changes a row (`changes === 1`); the other's UPDATE matches zero rows and it correctly moves on. This works because `better-sqlite3` executes each `.run()` synchronously and atomically at the SQLite engine level — no external lock manager needed.

Workers are real OS processes spawned with `child_process.fork({ detached: true })`, running independently of the CLI command that started them, and polling for new jobs once per second.

## Persistence

Job data is stored in a SQLite file (`data/queue.db`) with WAL (Write-Ahead Logging) mode enabled, allowing safe concurrent access from the CLI and multiple worker processes simultaneously. Data survives application restarts — verified in the test suite (Scenario 5) by closing and reopening the DB connection and confirming job data is intact.

## Retry & Exponential Backoff

On failure, a job's `attempts` counter increments. If `attempts < max_retries`, the job returns to `pending` state with `next_attempt_at` set using the formula:
delay = backoff_base ^ attempts   (seconds)

Example with `backoff_base = 2`: 1st retry waits 2s, 2nd waits 4s, 3rd waits 8s.

The job claim query only selects pending jobs whose `next_attempt_at` has already passed — this is what enforces the wait, without needing a separate scheduler process.

## Dead Letter Queue

Once a job's `attempts` reaches its `max_retries`, it moves to `dead` state instead of retrying again. Dead jobs can be:
- Viewed: `queuectl dlq list`
- Manually revived: `queuectl dlq retry <job-id>` — resets `attempts` to 0 and moves the job back to `pending` for a fresh set of retries.

## Configuration

Config is stored in `config.json` (gitignored, auto-created with defaults on first run):

```json
{ "max_retries": 3, "backoff_base": 2 }
```

- `max-retries` — the **default** applied to new jobs enqueued without an explicit `max_retries` field. Each job stores its own `max_retries` at creation time; changing this config does not retroactively affect already-enqueued jobs.
- `backoff-base` — read fresh at the moment of every failure, so changes apply immediately to the next retry calculation, even for already-enqueued jobs.

## Testing

Run the automated scenario validation script:

```bash
npm test
```

This validates, using an isolated test database (never touches your real queue data):
1. Basic job completes successfully
2. Failed job retries with backoff and moves to DLQ
3. Multiple workers process jobs without overlap (atomic claim safety)
4. Invalid commands fail gracefully
5. Job data survives restart

All 15 assertions pass on the reference machine (Windows/PowerShell).

## Assumptions & Trade-offs

- **Command execution is synchronous** (`execSync`) — chosen for reliable, simple exit-code capture; means a worker fully blocks while a job runs, which is acceptable for a CLI job queue of this scope.
- **Polling-based worker loop** (1-second interval) rather than an event-driven push model — simpler to reason about and debug under time constraints; introduces up to ~1s latency in job pickup, which is an acceptable trade-off here.
- **Worker `stdio` is redirected to log files** (`logs/worker-N.log`) rather than the terminal, since workers run detached from the CLI session that spawns them (required for them to survive independently on Windows).
- **Test script reimplements core logic inline** rather than importing the app's shared DB singleton, to keep the test database fully isolated from the real one without needing a mocking layer — trade-off made for time, not because it's the "more correct" long-term approach.
- **Graceful shutdown is functionally verified** (confirmed via process monitoring — no zombie processes, no jobs interrupted mid-execution) but the final "shut down gracefully" log line does not always reliably flush to the log file before process exit on Windows — a cosmetic logging limitation, not a functional one.

## CLI Demo

Video: **[ADD YOUR GOOGLE DRIVE LINK HERE]**

The demo covers:
1. Enqueuing a job and successful completion
2. Multiple workers processing jobs in parallel
3. A failing job retrying with visible exponential backoff delays
4. The job moving to the Dead Letter Queue after exhausting retries
5. Manually retrying a DLQ job
6. Stopping and restarting the app to show job data persists

## Project Structure
queuectl/
├── bin/queuectl.js
├── src/
│   ├── db/database.js
│   ├── models/jobModel.js
│   ├── config/config.js
│   ├── worker/workerProcess.js
│   ├── worker/workerManager.js
│   ├── commands/enqueue.js
│   ├── commands/status.js
│   ├── commands/list.js
│   ├── commands/dlq.js
│   ├── commands/configCmd.js
│   └── utils/backoff.js
├── test/core-flow.test.js
├── package.json
└── README.md

## Submission Checklist

- [ ] Public GitHub repository
- [ ] This README.md
- [ ] Working CLI (`npm install` then `node bin/queuectl.js --help`)
- [ ] Persistent job storage (SQLite)
- [ ] Multiple worker support
- [ ] Retry with exponential backoff
- [ ] Dead Letter Queue
- [ ] Configuration management
- [ ] Clean CLI + help text
- [ ] Separation of concerns
- [ ] Test script (`npm test`)
- [ ] CLI demo video recorded and uploaded to Drive, link added above
- [ ] Final `git push` to GitHub confirmed
