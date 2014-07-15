var util = require('util');
var assert = require('basic-assert');
var stream = require('../stream');

var console = (function(origConsole) {
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

var log = console.log.bind(console);

function assertPrinted(str) {
	if (str !== null) {
		var actual = console.lines.shift();
		assert.is(actual, str);
	} else {
		assert.eq(console.lines, []);
	}
}

