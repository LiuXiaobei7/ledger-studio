#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const ver = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
console.log(`Ledger Studio ${pkg.docNo}  (v${pkg.version})  引擎 ${ver.engineDocNo}`);
