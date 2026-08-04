module.exports = {
  apps: [
    {
      name: "teamuniz-backend",
      script: "/root/projetos/teamuniz/backend/dist/server.js",
      cwd: "/root/projetos/teamuniz/backend",
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: 4002,
      },
    },
    {
      name: "teamuniz-frontend",
      script: "/root/projetos/teamuniz/frontbot/webapp/node_modules/.bin/next",
      args: "start -p 4003 -H 127.0.0.1",
      cwd: "/root/projetos/teamuniz/frontbot/webapp",
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "teamuniz-bot",
      script: "/root/projetos/teamuniz/frontbot/server.js",
      cwd: "/root/projetos/teamuniz/frontbot",
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: 3002,
      },
    },
  ],
};
