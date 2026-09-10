module.exports = {
  apps: [
    {
      name: 'ashniva-api',
      script: 'dist/main.js',
      cwd: './apps/api',
      instances: 'max', 
      exec_mode: 'cluster', // <--- Ise 'fork' se 'cluster' kar dein
      env: {
        NODE_ENV: 'production',
        PORT: 5511
      }
    },
    {
      name: 'ashniva-web',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: './apps/web/dist',
        PM2_SERVE_PORT: 5510,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html'
      }
    }
  ]
};
