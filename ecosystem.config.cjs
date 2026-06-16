module.exports = {
  apps: [
    {
      name: "mt5-web",
      script: "bun",
      args: "run dev",
      cwd: "/home/misu/mt5-manager/apps/web",
      env: {
        DB_PATH: "/tmp/mt5-manager.db",
        INSTANCES_DIR: "/tmp/mt5-instances",
        SHARED_DIR: "/tmp/mt5-shared",
        HOST: "localhost",
        PORT: "3556",
      },
      watch: false,
      autorestart: true,
    },
    {
      name: "mt5-socket",
      script: "bun",
      args: "run packages/socket-server/src/index.ts",
      cwd: __dirname,
      env: {
        SOCKET_PORT: "3557",
      },
    },
  ],
};
