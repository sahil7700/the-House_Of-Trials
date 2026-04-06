const fs = require('fs');
let errs = fs.readFileSync('ts_errors.txt', 'utf16le');
console.log(errs.split('\n').filter(line => line.includes('TS')).join('\n'));
