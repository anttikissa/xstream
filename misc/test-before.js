var util = require('util');
var stream = require('../xstream');

var consoleId = 1;

(function() {
var makeConsole = function() {
	return (function() {
		var id = consoleId++;

		var recordingLog = function recordingLog() {
			var args = Array.prototype.slice.apply(arguments);
			var line = args.map(function(arg) {
				if (typeof arg === 'string') {
					return arg;
				}
				if (typeof arg === 'function') {
					return Object.prototype.toString.apply(arg);
				}
				return util.format(arg);
			}).join(' ');
			recordingLog.lines.push(line);
			console.realLog.call(console, '[console ' + id + ']', line);
		};

		recordingLog.lines = [];
		return recordingLog

	})();
}

function log(console) {
	return console.log.bind(console);
}

function fail(message, stack, console) {
	global.console.log(message);
	if (console.test) {
		global.console.log("Failing test:", console.test);
	}
	global.console.log("Original stacktrace: " + stack);
	process.exit(1);
}

function later(f) {
	setTimeout(f, 1);
}

function assertPrinted(log, str) {
	var stack = new Error().stack;
	if (str !== null) {
		var actual = log.lines.shift();
		if (actual !== str) {
			fail("Expected '" + str + "', got '" + actual + "'", stack, console);
		}
	} else {
		if (log.lines.length) {
			fail("Expected nothing, console output was " +
				JSON.stringify(log.lines), stack, console);
		}
	}
}

var tests = [];

