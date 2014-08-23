var module = {};
(function(module) {
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

function contains(array, object) { return array.indexOf(object) !== -1; }

// Make a shallow copy of an array or an array-like object.
function copyArray(args) {
	return Array.prototype.slice.apply(args);
}


// Terminate the process.  For tests.
function terminate() {
	process.exit(0);
}

// Assert that 'what' is truthy.
// TODO strip away assertions in production build.
function assert(what, message) {
	if (!what) {
		if (message) {
			var e = new Error('assert failed: ' + message);
			e.skipLines = 3;
			throw e;
		} else {
			var e = new Error('assert failed');
			e.skipLines = 3;
			throw e;
		}
	}
}

function expect(string) { 
	var next = consoleOutput.shift();
	assert(typeof next === 'string', 'expected "' + string + '", got no output');
	assert(next === string, 'expected "' + string + '", got "' + next + '"');
}

function expectNoOutput() {
	assert(consoleOutput.length === 0, 'expected no output, got "' +
		consoleOutput[0]);
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

stream.streamsToUpdate = [];

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

Stream.prototype.set = function(value) {
	stream.streamsToUpdate.push(this);
	this.newValue = value;
	return this;
};

test.Stream.set = function() {
	var s = stream();
	var s2 = s.set(123);
	assert(s === s2, 'stream.set() should return the stream itself');
	assert(contains(stream.streamsToUpdate, s));
	assert(s.value === undefined, 'stream.value should be undefined before tick()');
	stream.tick();
	assert(!contains(stream.streamsToUpdate, s), 'tick should clear stream.streamsToUpdate');
	assert(s.value === 123, 'stream.value should be set after tick()');
};

stream.tick = function() {
	for (var i = 0, len = stream.streamsToUpdate.length; i < len; i++) {
		var s = stream.streamsToUpdate[i];
		s.value = s.newValue;
		delete s.newValue;
	}

	stream.streamsToUpdate = [];
};

test.stream.tick = function() {
	stream.tick();
};

function testAll(object, parentName, parentIdx) {
	var testIdx = 1;

	object = object || test;

	for (var testName in object) {
		try {
			var wholeIdx = parentIdx ? (parentIdx + '.' + testIdx) : testIdx;
			var wholeName = parentName ? (parentName + '.' + testName) : testName;
			log('Test ' + wholeIdx + ': ' + wholeName + '\n');
			object[testName]();
			expectNoOutput();

			testAll(object[testName], wholeName, wholeIdx);
			testIdx++;
		} catch (e) {
			log('Error:', e.message + '\n');
			log(e.stack.split('\n').slice(e.skipLines || 0).join('\n'));
			terminate();
		}
	}
}

module.exports = stream;

testAll();

})(module); var stream = module.exports;
