// Chapter 1 - Internal utilities
// Chapter 2 - Stream() and stream()
// Chapter 3 - Stream general methods
// Chapter 4 - Stream operators
// Chapter 5 - stream general functions
// Chapter 6 - stream combinators
// Chapter 7 - Metastream operators
// Chapter 8 - Generators
// Chapter 9 - Utilities (stream.util)
// Chapter 10 - Misc development/debug stuff (speedTest?)

// Chapter 1 - Internal utilities

function plus(x, y) { return x + y; }
function inc(x) { return x + 1; }

// Make a shallow copy of an array or an array-like object.
function copyArray(args) {
	return Array.prototype.slice.apply(args);
}

// Assert that 'what' is truthy.
// TODO strip away assertions in production build.
function assert(what, message) {
	if (!what) {
		if (message) {
			throw new Error('assert failed: ' + message);
		} else {
			throw new Error('assert failed');
		}
	}
}

function expect(string) { 
	var next = consoleOutput.shift();
	assert(typeof next === 'string', 'expected "' + string + '", got no output');
	assert(next === string, 'expected "' + string + '", got "' + next + '"');
}

// Actually just log output
function log() {
	console.log.apply(console.log, arguments);
}

// For testing; will capture log output for 'expect' to verify
var consoleOutput = [];

test = {};

// Chapter 2
function Stream(value) {
	this.value = value;
}

test.Stream = function() {
	assert(typeof new Stream() === 'object');
	assert(new Stream() instanceof Stream);
	assert(new Stream().value === undefined);
	assert(new Stream(123).value === 123);
};

function stream(value) {
	return new Stream(value);
}

test.stream = function() {
	assert(typeof stream === 'function');
	assert(stream() instanceof Stream);
};

// Log output and save it to consoleOutput.  When testing.
// In production, this will just be console.log.
stream.log = function() {
	function format(it) {
		if (typeof it === 'string' || typeof it === 'number')
			return String(it);
		else
			return require('util').inspect(it);
	}
	var str = copyArray(arguments).map(format).join(' ');
	consoleOutput.push(str);
	console.log(str); 
}

test.stream.log = function() {
	stream.log('hello');
	expect('hello');
};

stream.tick = function() {
	stream.log('tick');
};

test.stream.tick = function() {
	stream.tick();
	expect('tick');
};

function testAll(object, parentName, parentIdx) {
	var testIdx = 1;

	object = object || test;

	for (var testName in object) {
		try {
			var wholeIdx = parentIdx ? (parentIdx + '.' + testIdx) : testIdx;
			var wholeName = parentName ? (parentName + '.' + testName) : testName;
			log('\nTest ' + wholeIdx + ': ' + wholeName + '\n');
			object[testName]();
			consoleOutput = [];

			testAll(object[testName], wholeName, wholeIdx);
			testIdx++;
		} catch (e) {
			log('\nError:', e.message + '\n');
			log(e.stack.split('\n').slice(3).join('\n'));
		}
	}
}

module.exports = stream;

testAll();

