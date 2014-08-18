var util = require('util');
var stream = require('../xstream');

var consoleId = 1;

var realLog = console.log.bind(console);

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
//			console.realLog.call(console, '[console ' + id + ']', line);
		};

		recordingLog.lines = [];
		// For replaying the log later, if something breaks
		recordingLog.collectedLines = [];
		recordingLog.id = id;
		return recordingLog;
	})();
}

function log(console) {
	return console.log.bind(console);
}

// extract the essential information out of the stacktrace
function tidyUp(stacktrace) {
	var lines = stacktrace.split('\n')
	return lines.slice(2).join('\n');
}

function fail(message, stack, log) {
	log.collectedLines.forEach(function(line) {
		realLog('[console ' + log.id + ']', line);
	});

	realLog(message);
	realLog(tidyUp(stack));

	log.lines.forEach(function(line) {
		realLog('[console ' + log.id + ']', line);
	});

	process.exit(1);
}

function later(f) {
	setTimeout(f, 1);
}

function assertPrinted(log, str) {
	var stack = new Error().stack;
	if (str !== null) {
		var actual = log.lines.shift();
		log.collectedLines.push(actual);
		if (actual !== str) {
			fail("Expected '" + str + "', got '" + actual + "'", stack, log);
		}
	} else {
		if (log.lines.length) {
			fail("Expected nothing, console output was " +
				JSON.stringify(log.lines), stack, log);
		}
	}
}

var suites = [];
var tests;
