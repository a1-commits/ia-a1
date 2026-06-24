module.exports = {
  apps: [
    {
      name: 'mobi-backend',
      cwd: './apps/backend',
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'mobi-frontend',
      cwd: './apps/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      autorestart: true,
      max_memory_restart: '768M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
