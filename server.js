const { config } = require('./src/config');
const { app } = require('./src/app');

app.listen(config.port, () => {
  console.log(`Verixa AI Backend running on http://localhost:${config.port}`);
});