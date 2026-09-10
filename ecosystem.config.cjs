module.exports = {
  apps: [
    {
      name: 'ashniva-api',
      script: 'dist/main.js',
      cwd: './apps/api',
      instances: 1, // Change to 'max' for cluster mode if scaling
      exec_mode: 'fork', 
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
