// DUCKCAST V1
var proxy = require('child_process').fork('proxy.js');
var manager = require('child_process').fork('manager.js');