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

//
// Chapter 1 - Internal utilities
//
function plus(x, y) { return x + y; }
function inc(x) { return x + 1; }
function nop() {}

function contains(array, object) { return array.indexOf(object) !== -1; }
function remove(array, object) { array.splice(array.indexOf(object), 1); }

// Find first element in array that satisfies test(element), or undefined
function find(array, test) {
	for (var i = 0, len = array.length; i < len; i++) {
		var item = array[i];
		if (test(item)) {
			return item;
		}
	}
}

// Make a shallow copy of an array or an array-like object.
function copyArray(args) {
	return Array.prototype.slice.apply(args);
}

// Has stream been updated during this tick or before?
function hasValue(s) {
	return valueOf(s) !== undefined;
}

// Has stream been updated during this tick?
function hasNewValue(s) {
	return s.hasOwnProperty('newValue');
}

// Return .newValue if exists, otherwise .value
function valueOf(s) {
	if (s.hasOwnProperty('newValue'))
		return s.newValue;
	return s.value;
}

// Implementation of 'defer' using process.nextTick()
function deferNextTick(f) {
	var canceled = false;

	function run() {
		if (!canceled) {
			f();
		}
	}

	process.nextTick(run);

	return function() {
		canceled = true;
	};
}

// Implementation of 'defer' using setTimeout()
function deferTimeout(f) {
	var timeout = setTimeout(f);
	return function() {
		clearTimeout(timeout);
	};
}

// defer(Function f) -> Function
// Call 'f' at a later time. Return a function that can be called to
// cancel the the deferred call.
var defer = typeof process !== 'undefined' && process.nextTick
	? deferNextTick : deferTimeout;

// Terminate the process.  For tests.
function terminate() {
	process.exit(1);
}

// Assert that 'what' is truthy.
// TODO strip away assertions in production build.
function assert(what, message, skipFrame) {
	var skipLines = skipFrame ? 3 : 2;
	if (!what) {
		if (message) {
			var e = new Error('assert failed: ' + message);
			e.skipLines = skipLines;
			throw e;
		} else {
			var e = new Error('assert failed');
			e.skipLines = skipLines;
			throw e;
		}
	}
}

function expect(string) { 
	var strings = [string];
	if (contains(string, '; ')) {
		strings = string.split('; ');
	}
	for (var i = 0; i < strings.length; i++) {
		var expected = strings[i];
		var actual = consoleOutput.shift();
		assert(typeof actual === 'string', 'expected "' + expected + '", got no output', true);
		assert(actual === expected, 'expected "' + expected + '", got "' + actual + '"', true);
	}
}

function expectNoOutput() {
	assert(consoleOutput.length === 0, 'expected no output, got "' +
		consoleOutput[0] + '"', true);
}

// Actually just log output
function log() {
	console.log.apply(console.log, arguments);
}

// For testing; will capture log output for 'expect' to verify
var consoleOutput = [];

// For testing: a recursive collection of functions that constitute a
// test suite.  See the end of file for details.
test = {};

//
// Chapter 2 - Stream() and stream()
//
function Stream(value) {
	this.id = Stream.nextId++;
	this.value = value;
	this.children = [];
	this.parents = [];
	this.listeners = [];
}

Stream.nextId = 1;

test.Stream = function() {
	var s = new Stream();
	// Stream is an object.
	assert(typeof s === 'object');
	assert(s instanceof Stream);
	assert(s.value === undefined);
	assert(s.listeners.length === 0);
	assert(s.children.length === 0);
	assert(s.parents.length === 0);

	assert(new Stream(123).value === 123);

	// Streams have a numeric .id that autoincrements:
	var firstId = (new Stream()).id;
	assert(typeof firstId === 'number');
	var nextId = (new Stream()).id;
	assert(typeof nextId === 'number');
};

function stream(value) {
	return new Stream(value);
}

module.exports = stream;

test.stream = function() {
	// stream() is actually new Stream().
	assert(stream() instanceof Stream);

	// that also applies to new Stream(value);
	assert(stream(123).value === 123);
};

//
// Chapter 3 - Stream general methods
// 

Stream.prototype.set = function(value) {
	stream.streamsToUpdate.push(this);
	this.newValue = value;
	stream.ensureDeferredTick();
	return this;
};

test.Stream.set = function(done) {
	var s = stream();
	var s2 = s.set(1);
	assert(s === s2, 'stream.set() should return the stream itself');
	assert(contains(stream.streamsToUpdate, s));
	assert(s.value === undefined, 'stream.value should be undefined before tick()');
	stream.tick();
	assert(!contains(stream.streamsToUpdate, s), 'tick should clear stream.streamsToUpdate');
	assert(s.value === 1, 'stream.value should be set after tick()');

	s.set(2);
	assert(s.value === 1, 's.set() should not set the value immediately');
	defer(function() {
		assert(s.value === 2, 's.set() should set the value after the next tick');
		done();
	});
};

Stream.prototype.broadcast = function() {
	for (var i = 0, len = this.listeners.length; i < len; i++) {
		this.listeners[i].call(this, this.value);
	}
};

test.Stream.broadcast = function() {
	var s = stream(123);
	s.forEach(function(value) {
		stream.log('first', value);
	}).forEach(function(value) {
		stream.log('second', value);
	});

	s.broadcast();
	expect('first 123; second 123');
};

Stream.prototype.forEach = function(listener) {
	this.listeners.push(listener);
	return this;
};

test.Stream.forEach = function() {
	var s = stream();
	assert(s === s.forEach(nop), '.forEach should return the stream itself');
	s.forEach(function(value) {
		assert(this === s, 'listener should receive the stream in "this"');
		stream.log('s', value);
	});
	s.set(1);
	stream.tick();
	expect('s 1');

	stream(123).forEach(function() {
		assert(false, '.forEach functions should not be called without .set()');
	});
};

Stream.prototype.pull = function() {
	// TODO repeats code from tick().
	if (this.parents.some(hasValue)) {
		this.update.apply(this, this.parents);
	}
	if (hasNewValue(this)) {
		this.value = this.newValue;
		delete this.newValue;
	}

	return this;
};

test.Stream.pull = function() {
	var parent = stream(123);
	var child = stream();
	child.parents = [parent];
	parent.children = [child];
	child.update = function(parent) {
		this.newValue = valueOf(parent);
	};

	assert(child.value === undefined, "child shouldn't get a value automatically");
	stream.tick();
	assert(child.value === undefined, "not even if stream.tick() happens");
	child.pull();
	assert(child.value === 123, "when it a child calls .pull(), it finally gets one");

	// Start again.
	parent = stream();
	child = stream();
	child.parents = [parent];
	parent.children = [child];
	child.update = function(parent) {
		throw new Error(".pull() should never call update() if there's no value");
	};
	child.pull();
};

// Stream.log() -> Stream: Log my values.
// Stream.log(String prefix) -> Stream: Log my values, predeced by 'prefix'.
//
// Return this.
Stream.prototype.log = function(prefix) {
	return this.forEach(prefix ? function(value) {
		stream.log(prefix, value);
	} : function(value) {
		stream.log(value);
	});
}

test.Stream.log = function() {
	var s = stream().set(1);
	s.log();
	stream.tick();
	expect('1');

	s.log('prefix');
	s.set(2);
	stream.tick();
	expect('2; prefix 2');

};

//
// Chapter 4 - Stream operators
//

Stream.prototype.map = function(f) {
	var result = stream();
	result.f = f;
	result.update = function(parent) {
		this.newValue = this.f(valueOf(parent));
	};
	result.parents = [this];
	this.children.push(result);

	result.pull();

	return result;
};

test.Stream.map = function() {
	var s = stream();
	var s2 = s.map(inc).log('s2');
	var s3 = s2.map(inc).log('s3');
	s.set(1);
	stream.tick();
	expect('s2 2; s3 3');

	var s4 = stream(1);
	var s5 = s4.map(inc);
	assert(s5.value === 2, 'if parent has a value, map() should pull it immediately');

	var s6 = stream();
	var s7 = s6.map(function() {
		throw new Error("map() shouldn't try to pull its value if parent doesn't have it");
	});
};

//
// Chapter 5 - stream general functions
// 

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
};

test.stream.log = function() {
	stream.log('hello');
	expect('hello');
	stream.log(123, [2,3,4], { x: 'foo', 'y z': 'bar' });
	expect("123 [ 2, 3, 4 ] { x: 'foo', 'y z': 'bar' }");
};

// Schedule a tick, if one is not already scheduled.
stream.ensureDeferredTick = function() {
	if (!stream.cancelDeferredTick) {
		stream.cancelDeferredTick = defer(stream.tick);
	}
};

test.stream.ensureDeferredTick = function() {
	assert(typeof stream.cancelDeferredTick === 'undefined');
	stream.ensureDeferredTick();
	assert(typeof stream.cancelDeferredTick === 'function');
	// Can be called twice, though this doesn't check for its semantics
	stream.ensureDeferredTick();
	assert(typeof stream.cancelDeferredTick === 'function');
	// Clean up, test framework will yell otherwise.
	stream.tick();
	assert(typeof stream.cancelDeferredTick === 'undefined');
};

stream.streamsToUpdate = [];


// updateOrder(Stream[] streams)
// Given an array of streams to update, create a graph of those streams
// and their dependencies and return a topological ordering of that graph
// where parents come before their children.
//
// nodes: array of Streams
//
// The algorithm assumes that 'nodes' only contains a single instance of
// each stream.
//
// TODO clarify the order in which the updates happen.
// Should we start updating from the nodes that come first?
//
function updateOrder(nodes) {
	parentCounts = {};
	allNodes = {};
	nodesToUpdate = [];

	// Find all nodes reachable from 'node'
	// and record into 'parentCounts' the amount of incoming edges
	// within this graph.
	function findNodesToUpdate(node) {
		if (allNodes.hasOwnProperty(node.id)) {
			// We have already calculated the parent counts descending
			// from this node.
			return;
		}
		allNodes[node.id] = node;
		node.children.forEach(function(child) {
			parentCounts[child.id] = (parentCounts[child.id] || 0) + 1;
			findNodesToUpdate(child);
		});
	}

	nodes.forEach(function(node) {
		findNodesToUpdate(node);
	});

	// If we didn't find a parent count with findNodesToUpdate, it's zero
	nodes.forEach(function(node) {
		if (parentCounts[node.id] === undefined) {
			parentCounts[node.id] = 0;
		}
	});

	function removeNode(nodeKey) {
		assert(nodeKey);
		var node = allNodes[nodeKey];
		node.children.forEach(function(child) {
			parentCounts[child.id]--;
		});
		delete parentCounts[nodeKey];
		delete allNodes[nodeKey];
		nodesToUpdate.push(node);
	}

	// if there are cycles, this one will never terminate
	while (true) {
		var nodeKeys = Object.keys(parentCounts);
		if (nodeKeys.length === 0) {
			break;
		}

		var nodeKeyWithZeroParents = find(nodeKeys, function(nodeKey) {
			assert(parentCounts[nodeKey] >= 0);
			return parentCounts[nodeKey] === 0;
		});

		removeNode(nodeKeyWithZeroParents);
	}

	return nodesToUpdate;
}

stream.tick = function(n) {
	if (stream.cancelDeferredTick) {
		stream.cancelDeferredTick();
		delete stream.cancelDeferredTick;
	}

	var streamsToUpdate = updateOrder(stream.streamsToUpdate);

	stream.streamsToUpdate = [];

	for (var i = 0, len = streamsToUpdate.length; i < len; i++) {
		var s = streamsToUpdate[i];
		if (s.parents.some(hasNewValue)) {
			s.update.apply(s, s.parents);
		}
	}

	for (var i = 0, len = streamsToUpdate.length; i < len; i++) {
		var s = streamsToUpdate[i];
		if (hasNewValue(s)) {
			s.value = s.newValue;
			delete s.newValue;
			s.broadcast();
		}
	}

	if (n > 1) {
		stream.tick(n - 1);
	}
};

test.stream.tick = function() {
	// The actual functionality of 'tick' is in fact tested in lots of
	// places; see tests for Stream.set(), Stream.forEach(), 
	// stream.ensureDeferredTick, etc.  So we just test giving
	// '.tick(n)' an argument, which should tick 'n' times.
	
	// A simple counter.
	var s = stream();
	function inc(value) {
		this.set(value + 1);
	}
	s.forEach(inc);
	s.set(0);
	stream.tick();
	assert(s.value === 0);
	stream.tick();
	assert(s.value === 1);

	// A crude way to stop the stream from ticking.
	// TODO when there's .stop(), use that.
	s.listeners = [];
	stream.tick();

	s.set(0);
	s.forEach(inc);
	stream.tick();
	assert(s.value === 0);
	// Now call it 5 times.
	stream.tick(5);
	assert(s.value === 5);

	// A crude way to stop the stream from ticking.
	// TODO when there's .stop(), use that.
	s.listeners = [];
	stream.tick();
};

//
// Chapter 8 - Generators
//

stream.fromArray = function(array) {
	var result = stream();
	result.state = array;
	result.update = function() {
		var next = this.state.shift();
		if (next !== undefined) {
			this.set(next);
		} else {
			// TODO fiction
//			this.end();
		}
	};

	result.stop = function() {
		// In effect, cancels a pending .set() if there is one.
		// The stream will still be in stream.streamsToUpdate queue,
		// but without this.newValue it will be harmless.
		if (hasNewValue(this)) {
			this.state.unshift(this.newValue);
			delete this.newValue;
		}
	};

	result.play = function() {
		this.update();
	};

	result.update();
	result.forEach(result.update);
	return result;
};

test.stream.fromArray = function() {
	stream.fromArray([1, 2, 3, 4]).log();
	stream.tick(5);
	expect('1; 2; 3; 4');
};

test.stream.fromArray.stop = function() {
	var s = stream.fromArray([1, 2, 3, 4, 5]).log();
	s.forEach(function(value) {
		if (value === 3) {
			s.stop();
		}
	});
	stream.tick(5);
	expect('1; 2; 3');
};

test.stream.fromArray.play = function() {
	var s = stream.fromArray([1, 2, 3, 4, 5]).log();
	s.forEach(function(value) {
		if (value == 4) {
			this.stop();
		}
	});
	stream.tick(2);
	expect('1; 2');
	s.stop();
	s.play();
	stream.tick(5);
	expect('3; 4');
	s.play();
	stream.tick();
	expect('5');
};

//
// Chapter 10 - Test machinery
//
var tests = [];

function collectTests(object, parentName, parentIdx) {
	var testIdx = 1;

	for (var testName in object) {
		var wholeIdx = parentIdx ? (parentIdx + '.' + testIdx) : testIdx;
		var wholeName = parentName ? (parentName + '.' + testName) : testName;

		var title = 'Test ' + wholeIdx + ': ' + wholeName;
		var testFunction = object[testName];
		tests.push([title, testFunction]);
		collectTests(object[testName], wholeName, wholeIdx);

		testIdx++;
	}
}

function testAll() {
	collectTests(test);

	function runTest() {
		var nextTest = tests.shift();
		if (!nextTest) {
			return;
		}

		var title = nextTest[0], f = nextTest[1];

		function done() {
			assert(!stream.cancelDeferredTick, 'test functions should not leave deferred .tick()s behind');
			expectNoOutput();
			runTest();
		}

		try {
			log(title + '\n');
			if (f.length === 1) {
				f(done);
			} else {
				f();
				done();
			}
		} catch (e) {
			log('Error:', e.message + '\n');
			log(e.stack.split('\n').slice(e.skipLines || 0).join('\n'));
			terminate();
		}
	}

	runTest();
}

if (process.env.XSTREAM_TEST) {
	testAll();
}

})(module); var stream = module.exports;
