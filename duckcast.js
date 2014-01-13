// DUCKCAST V1
var spawn = require('child_process').spawn
, proxy = spawn('forever', ['-w', 'proxy.js'])
, manager = spawn('forever', ['-w', 'manager.js']);