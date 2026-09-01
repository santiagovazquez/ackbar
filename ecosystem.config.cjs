module.exports = {
  apps: [
    {
      name: "ackbar-api",
      cwd: `${__dirname}/apps/api`,
      script: "pnpm",
      args: "start",
      env: { NODE_ENV: "production" },
      time: true,
    },
    {
      name: "ackbar-web",
      cwd: `${__dirname}/apps/web`,
      script: "pnpm",
      args: "start",
      env: { NODE_ENV: "production" },
      time: true,
    },
  ],
};
