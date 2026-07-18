const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

const PID_FILE = path.join(__dirname, '..', '..', 'workers.pid.json');
const WORKER_SCRIPT = path.join(__dirname, 'workerProcess.js');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
function readPidFile() {
  if (!fs.existsSync(PID_FILE)) return [];
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writePidFile(pids) {
  fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));
}

/**
 * Spawns `count` independent worker processes using fork().
 * Each is a real OS process with its own event loop, running
 * runWorkerLoop() from workerProcess.js.
 */
function startWorkers(count) {
  const existing = readPidFile();
  if (existing.length > 0) {
    console.log(`Warning: ${existing.length} worker(s) already tracked as running (PIDs: ${existing.join(', ')}).`);
    console.log('If they are not actually running, delete workers.pid.json and try again.');
    return;
  }

  const pids = [];

  for (let i = 0; i < count; i++) {
    const logFile = path.join(LOG_DIR, `worker-${i}.log`);
    const logFd = fs.openSync(logFile, 'a');

    const child = fork(WORKER_SCRIPT, [], {
      detached: true,
      stdio: ['ignore', logFd, logFd, 'ipc']
    });
    child.unref();

    pids.push(child.pid);
    console.log(`Started worker process (PID ${child.pid}) — logs: ${logFile}`);
  }

  writePidFile(pids);
  console.log(`\n${count} worker(s) started. Use "queuectl worker stop" to shut them down gracefully.`);
}

/**
 * Sends SIGTERM to every tracked worker PID, allowing each to finish
 * its current job (execSync blocks) before exiting on its own.
 */
function stopWorkers() {
  const pids = readPidFile();

  if (pids.length === 0) {
    console.log('No workers are currently tracked as running.');
    return;
  }

  pids.forEach(pid => {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Sent shutdown signal to worker PID ${pid}.`);
    } catch (err) {
      console.log(`Could not signal PID ${pid} (it may have already exited): ${err.message}`);
    }
  });

  writePidFile([]);
  console.log('All workers signaled to stop. They will exit after finishing current jobs.');
}

module.exports = { startWorkers, stopWorkers };