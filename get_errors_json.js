const fs = require('fs');
let errs = fs.readFileSync('ts_errors.txt', 'utf16le');
let lines = errs.split('\n');
console.log(JSON.stringify(lines.filter(l => l.includes('TS')).map(l => l.substring(0, 150)), null, 2));
