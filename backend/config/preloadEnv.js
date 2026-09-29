const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith('SMTP_') || k.startsWith('EMAIL_') || k === 'FRONTEND_URL' || k === 'CLIENT_URL') {
        process.env[k] = v;
      } else if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
} catch {
  // Ignore
}
