const { countByState } = require('../models/jobModel');

/**
 * Handles: queuectl status
 * Shows a summary count of jobs grouped by state.
 */
function statusCommand() {
  const counts = countByState();

  if (counts.length === 0) {
    console.log('No jobs in the queue yet.');
    return;
  }

  // Ensure all known states show up even if count is 0, for a consistent report.
  const knownStates = ['pending', 'processing', 'completed', 'failed', 'dead'];
  const countMap = {};
  counts.forEach(row => { countMap[row.state] = row.count; });

  console.log('Queue Status:');
  console.log('--------------');
  knownStates.forEach(state => {
    const count = countMap[state] || 0;
    console.log(`${state.padEnd(12)}: ${count}`);
  });

  // In case there's an unexpected state value in the DB, show it too.
  counts.forEach(row => {
    if (!knownStates.includes(row.state)) {
      console.log(`${row.state.padEnd(12)}: ${row.count}`);
    }
  });
}

module.exports = statusCommand;