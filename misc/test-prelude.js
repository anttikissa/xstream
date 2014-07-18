var util = require('util');
var stream = require('../stream');

var console = function() {
	return (function(origConsole) {
		return {
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
				origConsole.log.call(origConsole, '[console]', line);
			}
		}
	})(global.console);
}

// var log = console.log.bind(console);

function fail(message, stack) {
	global.console.log(message);
	global.console.log("Original stacktrace: " + stack);
	process.exit(1);
}

function later(f) {
	setTimeout(f, 10);
}

var i = 0;
function assertPrinted(console, str) {
	var id = i++;
	var stack = new Error().stack;
	if (str !== null) {
		var actual = console.lines.shift();
		if (actual !== str) {
			fail("Expected '" + str + "', got '" + actual + "'", stack);
		}
	} else {
		if (console.lines.length) {
			fail("Expected nothing, console output was " +
				JSON.stringify(console.lines), stack);
		}
	}
}

