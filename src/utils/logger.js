'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function formatLine(level, action, message, data) {
  const base = `[${timestamp()}] [${level}] [${action}] ${message}`;
  if (data) return base + ' | ' + JSON.stringify(data);
  return base;
}

function write(line) {
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(LOG_DIR, `pinta-${date}.log`);
  fs.appendFileSync(file, line + '\n', 'utf8');
  console.log(line);
}

const logger = {
  info(action, message, data) {
    write(formatLine('INFO ', action, message, data));
  },
  warn(action, message, data) {
    write(formatLine('WARN ', action, message, data));
  },
  error(action, message, data) {
    write(formatLine('ERROR', action, message, data));
  },
  success(action, message, data) {
    write(formatLine('OK   ', action, message, data));
  },
};

module.exports = logger;
