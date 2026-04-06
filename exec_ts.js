const { exec } = require('child_process');
const fs = require('fs');
exec('npx tsc --noEmit', (err, stdout, stderr) => {
  if (stdout) {
    const lines = stdout.split('\n').filter(l => l.includes('TS'));
    fs.writeFileSync('ts_errors.json', JSON.stringify(lines, null, 2));
  }
});
