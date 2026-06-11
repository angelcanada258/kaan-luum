const { createApp } = require('./create-app');

const app = createApp();
const port = Number(process.env.PORT) || 3000;

if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Kaan Luum disponible en http://localhost:${port}`);
  });
}

module.exports = app;
