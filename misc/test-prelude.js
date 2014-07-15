var util = require('util');
var assert = require('basic-assert');
var stream = require('../stream');

var console = (function(origConsole) {
	return {
		lines: [],
		
		log: function() {
			var args = Array.prototype.slice.apply(arguments);
			var argsCopy = args.slice();
			argsCopy.unshift('[console]');
			origConsole.log.apply(origConsole, argsCopy);
			this.lines.push(args.map(function(arg) {
				if (typeof arg === 'string') {
					return arg;
				}
				return util.format(arg);
			}).join(' '));
		}
	}
})(global.console);

function assertPrinted(str) {
	if (str !== null) {
		var actual = console.lines.shift();
		assert.is(actual, str);
	} else {
		assert.eq(console.lines, []);
	}
}

