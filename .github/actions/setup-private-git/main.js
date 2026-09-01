const childProcess = require('child_process');
const core = require('@actions/core');

function run() {
  const goPrivate = core.getInput('go-private');
  const ghUsername = core.getInput('gh-username') || 'gh-netic-robot';
  const ghToken = core.getInput('gh-token');

  if (!goPrivate) {
    core.info('go-private input is empty, skipping private git credential setup.');
    return;
  }

  if (!ghToken) {
    core.info('gh-token input is empty, skipping private git credential setup.');
    return;
  }

  core.info(`Setting up private repository access for GOPRIVATE: ${goPrivate}`);
  const gitUrl = `https://${ghUsername}:${ghToken}@github.com`;
  
  try {
    childProcess.execSync(`git config --global url."${gitUrl}".insteadOf "https://github.com"`);
    core.info('Successfully configured global git insteadOf url.');
  } catch (error) {
    core.setFailed(`Failed to configure git credentials: ${error.message}`);
  }
}

run();
