const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

describe('API server config validation (end-to-end)', () => {
  it('exits with code 1 and logs missing DATABASE_URL when DATABASE_URL is missing', () => {
    const serverScript = path.resolve(__dirname, '../src/server.js');
    const tempEnvPath = path.resolve(__dirname, '.env.no-db');

    fs.writeFileSync(tempEnvPath, 'NODE_ENV=test\nAPI_PORT=3000\n');

    try {
      const env = { ...process.env, NODE_ENV: 'test', API_PORT: '3000' };
      delete env.DATABASE_URL;
      env.DOTENV_CONFIG_PATH = tempEnvPath;

      const result = spawnSync(process.execPath, [serverScript], {
        env,
        encoding: 'utf8'
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('DATABASE_URL');
    } finally {
      if (fs.existsSync(tempEnvPath)) {
        fs.unlinkSync(tempEnvPath);
      }
    }
  });
});
