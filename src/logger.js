'use strict';

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const log = (...args) => console.log(`[${stamp()}]`, ...args);
log.warn = (...args) => console.warn(`[${stamp()}] WARN`, ...args);
log.error = (...args) => console.error(`[${stamp()}] ERROR`, ...args);

module.exports = log;
