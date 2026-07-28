module.exports = {
  apps: [
    {
      name: "teamuniz-backend",
      script: "/root/projetos/teammuniz/chat_box/backend/dist/server.js",
      cwd: "/root/projetos/teammuniz/chat_box/backend",
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: 4002,
      },
    },
    {
      name: "teamuniz-frontend",
      script: "/root/projetos/teammuniz/chat_box/frontbot/webapp/node_modules/.bin/next",
      args: "start -p 4003",
      cwd: "/root/projetos/teammuniz/chat_box/frontbot/webapp",
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "teamuniz-bot",
      script: "/root/projetos/teammuniz/chat_box/frontbot/server.js",
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: 3002,
      },
    },
  ],
};
