let shuttingDown = false;

const markRunning = () => {
  shuttingDown = false;
};

const beginShutdown = () => {
  shuttingDown = true;
};

const snapshot = () => Object.freeze({
  shuttingDown
});

module.exports = {
  beginShutdown,
  markRunning,
  snapshot
};
