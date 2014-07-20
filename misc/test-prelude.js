var util = require('util');
var stream = require('../stream');

var consoleId = 0;

var console = function(test) {
	return (function(origConsole) {
		return {
			id: consoleId++,

			lines: [],
			
			log: function() {
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
				this.lines.push(line);
				origConsole.log.call(origConsole, '[console ' + this.id + ']', line);
			},

			test: test
		}
	})(global.console);
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
	setTimeout(f, 10);
}

function assertPrinted(console, str) {
	var stack = new Error().stack;
	if (str !== null) {
		var actual = console.lines.shift();
		if (actual !== str) {
			fail("Expected '" + str + "', got '" + actual + "'", stack, console);
		}
	} else {
		if (console.lines.length) {
			fail("Expected nothing, console output was " +
				JSON.stringify(console.lines), stack, console);
		}
	}
}

