const childProcess = require('child_process');
const core = require('@actions/core');

function run() {
  const goPrivate = core.getInput('go-private');
  const ghUsername = core.getInput('gh-username') || 'gh-netic-robot';
  const ghToken = core.getInput('gh-token');

  if (!goPrivate) {
    core.info('Skipping cleanup because go-private was empty.');
    return;
  }

  if (!ghToken) {
    core.info('Skipping cleanup because gh-token was empty.');
    return;
  }

  core.info('Cleaning up private repository access configuration...');
  const gitUrl = `https://${ghUsername}:${ghToken}@github.com`;
  try {
    childProcess.execSync(`git config --global --unset url."${gitUrl}".insteadOf`, { stdio: 'inherit' });
    core.info('Successfully cleaned up global git insteadOf url.');
  } catch (error) {
    core.warning(`Failed or skipped unsetting git config: ${error.message}`);
  }
}

run();
