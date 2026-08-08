module.exports = async () => {
  if (global.__AUTH_MONGO_SERVER__) {
    await global.__AUTH_MONGO_SERVER__.stop();
  }
  delete process.env.AUTH_TEST_DATABASE_URI;
  delete global.__AUTH_MONGO_SERVER__;
};
