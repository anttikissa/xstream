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
function isEven(x) { return !(x % 2); }
function isOdd(x) { return x % 2; }

function nop() {}

function contains(array, object) { return array.indexOf(object) !== -1; }
// Remove element from array (in-place).
function remove(array, object) {
	assert(contains(array, object));
	array.splice(array.indexOf(object), 1);
}

// Find first element in array that satisfies test(element), or undefined.
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

// Return .newValue if exists, otherwise .value.
function valueOf(s) {
	if (s.hasOwnProperty('newValue'))
		return s.newValue;
	return s.value;
}

// Implementation of 'defer' using process.nextTick().
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

// Implementation of 'defer' using setTimeout().
function deferTimeout(f) {
	var timeout = setTimeout(f);
	return function() {
		clearTimeout(timeout);
	};
}

// defer(Function f) -> Function: Call 'f' at a later time.
// Return a function that can be called to cancel the the deferred call.
var defer = typeof process !== 'undefined' && process.nextTick
	? deferNextTick : deferTimeout;

// Terminate the process.  For tests.
function terminate() {
	process.exit(1);
}

// Assert that 'what' is truthy.
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

// Assert that actual equals expected.
// Uses strict equality, plus NaN is considered to equal NaN.
assert.eq = function(actual, expected, message) {
	message = message ? (': ' + message) : '';
	if (actual !== actual && expected !== expected) {
		return; // assert.eq(NaN, NaN) -> ok
	}

	if (actual !== expected) {
		var e = new Error('assert failed' + message + ': expected ' + expected +
			', got ' + actual);
		e.skipLines = 2;
		throw e;
	}
};

assert.type = function(actual, expected, message) {
	var actualMessage;
	var message = message ? (': ' + message) : '';
	if (typeof expected === 'string') {
		if (typeof actual !== expected) {
			actualMessage = 'assert failed' + message +
				': expected type to be ' + expected +
				', was ' + typeof actual;
		}
	}
	if (typeof expected === 'function') {
		if (!(actual instanceof expected)) {
			actualMessage = 'assert failed' + message +
				': expected ' + actual +
				' to be instanceof ' + expected.name;
		}
	}
	if (actualMessage) {
		var e = new Error(actualMessage);
		e.skipLines = 2;
		throw e;
	}
};

assert.throws = function(f) {
	try {
		f();
	} catch (e) {
		return;
	}
	// Boils down function body to the essential by removing end-of-line
	// comments and extra whitespace (including newlines)
	var functionEssence = f.toString().replace(/\/\/.*$/mg, '')
		.replace(/\s+/g, ' ');
	var e = new Error('assert failed: expected ' + functionEssence + ' to throw')
	e.skipLines = 2;
	throw e
};

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
	this.ended = false;
}

Stream.nextId = 1;

test.Stream = function() {
	var s = new Stream();
	// Stream is an object.
	assert.type(s, 'object');
	assert.type(s, Stream);
	assert.eq(s.value, undefined);
	assert.eq(s.listeners.length, 0);
	assert.eq(s.children.length, 0);
	assert.eq(s.parents.length, 0);
	assert.type(s.ended, 'boolean');
	assert.eq(s.ended, false);

	assert.eq(new Stream(123).value, 123);

	// Streams have a numeric .id that autoincrements:
	var firstId = (new Stream()).id;
	assert.type(firstId, 'number');
	var nextId = (new Stream()).id;
	assert.type(nextId, 'number');
};

function stream(value) {
	return new Stream(value);
}

module.exports = stream;

test.stream = function() {
	// stream() is actually new Stream().
	assert(stream() instanceof Stream);

	// that also applies to new Stream(value);
	assert.eq(stream(123).value, 123);
};

//
// Chapter 3 - Stream general methods
// 

Stream.prototype.withState = function(state) {
	this.state = state;
	return this;
};

test.Stream.withState = function() {
	var s = stream();
	assert.type(s.state, 'undefined');

	var s2 = s.withState({ x: 1 });
	assert.eq(s2, s);
	assert.type(s.state, 'object');
	assert.eq(s.state.x, 1);
};

Stream.prototype.set = function(value) {
	if (this.ended) {
		throw new Error('cannot set() an ended stream');
	}
	stream.streamsToUpdate.push(this);
	this.newValue = value;
	stream.ensureDeferredTick();
	return this;
};

test.Stream.set = function(done) {
	var s = stream();
	var s2 = s.set(1);
	assert.eq(s, s2, 'stream.set() should return the stream itself');
	assert(contains(stream.streamsToUpdate, s));
	assert.eq(s.value, undefined, 'stream.value should be undefined before tick()');
	stream.tick();
	assert(!contains(stream.streamsToUpdate, s), 'tick should clear stream.streamsToUpdate');
	assert.eq(s.value, 1, 'stream.value should be set after tick()');

	s.set(2);
	assert.eq(s.value, 1, 's.set() should not set the value immediately');
	defer(function() {
		assert.eq(s.value, 2, 's.set() should set the value after the next tick');
		done();
	});
};

Stream.prototype.tick = function(n) {
	stream.tick(n);
	return this;
};

test.Stream.tick = function() {
	var oldTick = stream.tick;
	var got;
	stream.tick = function(value) {
		got = value;
	};
	var s = stream();
	var s2 = s.tick(10);
	stream.tick = oldTick;
	assert.eq(got, 10, 'Stream.tick() delegate its argument to stream.tick().');
	assert.eq(s, s2, 'Stream.tick() should return "this".');
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
	assert.eq(s, s.forEach(nop), '.forEach should return the stream itself');
	s.forEach(function(value) {
		assert.eq(this, s, 'listener should receive the stream in "this"');
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
		this.update.apply(this, this.parents.map(valueOf));
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
	child.update = function(value) {
		this.newValue = value;
	};

	assert.eq(child.value, undefined, "child shouldn't get a value automatically");
	stream.tick();
	assert.eq(child.value, undefined, "not even if stream.tick() happens");
	child.pull();
	assert.eq(child.value, 123, "when it a child calls .pull(), it finally gets one");

	// Start again, this time with a valueless parent.
	parent = stream();
	child = stream();
	child.parents = [parent];
	parent.children = [child];
	child.update = function(parent) {
		throw new Error(".pull() should never call update() if there's no value");
	};
	child.pull();
};

Stream.prototype.addChild = function(child) {
	this.children.push(child);
}

test.Stream.addChild = function() {
	var parent = stream();
	assert.eq(parent.children.length, 0);
	var child = stream();
	parent.addChild(child);
	assert.eq(parent.children.length, 1);
	assert.eq(parent.children[0], child);

	// It's ok to call addChild() twice with the same child.
	parent.addChild(child);
	assert.eq(parent.children.length, 2);
};

Stream.prototype.removeChild = function(child) {
	remove(this.children, child);
}

test.Stream.removeChild = function() {
	var parent = stream();
	var child = stream();
	parent.addChild(stream());
	parent.addChild(child);
	parent.addChild(stream());

	assert.eq(parent.children.length, 3);
	assert(contains(parent.children, child));
	parent.removeChild(child);
	// Removing reduces child count with 1
	assert.eq(parent.children.length, 2);
	// And the child is no longer in parent's children
	assert(!contains(parent.children, child));

	parent.addChild(stream());
	parent.addChild(child);
	parent.addChild(stream());
	parent.addChild(child);
	parent.addChild(stream());
	assert.eq(parent.children.length, 7);

	// Children can be added multiple times to the same parent, and 
	// .removeChild() only removes one instance at a time.
	parent.removeChild(child);
	assert.eq(parent.children.length, 6);
	assert(contains(parent.children, child));

	parent.removeChild(child);
	assert.eq(parent.children.length, 5);
	assert(!contains(parent.children, child));

	assert.throws(function() {
		parent.removeChild(child);
	});
};

// Stream.link(Stream parent, Function updater, Function f = null) -> Stream
// Stream.link(Stream[] parents, Function updater, Function f = null) -> Stream
//
// Make this stream dependent of 'parents' through 'update' which
// (optionally) calls 'f'.
//
// TODO consider splitting into .link(parent) and .linkMany(parents)
// and parameterizing them with how to link ends and errors, if deemed
// necessary.
//
// Alternatively, implement different .endWhenAny() and .endWhenAll()
// strategies and use them.
//
//
Stream.prototype.link = function(parents, update, f) {
	assert(this.parents.length === 0);

	if (parents instanceof Stream) {
		parents = [parents];
	}

	for (var i = 0, len = parents.length; i < len; i++) {
		parents[i].addChild(this);
	}

	this.parents = parents;
	this.update = update;
	this.f = f || null;

	this.endWhenAny(parents);
	return this;
};

test.Stream.link = function() {
	var parent = stream().log('parent');
	var child = stream().log('child');
	var update = function(value) {
		stream.log('updating');
		this.newValue = this.f(value);
	};
	var result = child.link(parent, update, inc);
	assert.eq(result, child);
	assert(contains(parent.children, child));
	assert(contains(child.parents, parent));
	assert.eq(child.update, update);
	assert.eq(child.f, inc);

	assert.type(parent.value, 'undefined');
	assert.type(child.value, 'undefined');
	parent.set(1);
	stream.tick();
	assert.eq(parent.value, 1);
	assert.eq(child.value, 2);
	// update phase should happen first
	expect('updating');
	// then .forEach() handlers of both parent and child
	expect('parent 1; child 2');
};

Stream.prototype.endWhenAny = function(streams) {
	var that = this;
	for (var i = 0, len = streams.length; i < len; i++) {
		streams[i].ends().forEach(function() {
			that.end();
		});
	}
};

test.Stream.endWhenAny = function() {

};



Stream.prototype.ends = function() {
	if (!this.endStream) {
		this.endStream = stream(); //.withState(this);;
	}
	return this.endStream;
};

test.Stream.ends = function() {
	var s = stream();

	// ends() creates s.endStream
	assert.type(s.endStream, 'undefined');
	var ends = s.ends();
	assert.type(s.endStream, Stream);

	assert.eq(s.endStream, ends);

	assert.eq(ends, s.ends(), 'ends() should always return the same stream');
};

Stream.prototype.end = function() {
	if (this.ended) {
		throw new Error('cannot end() an ended stream');
	}
	this.ends().set(valueOf(this));
	// A relatively stupid way to check that a stream is ended:
	// it's .ended property is true
	this.ended = true;
};

test.Stream.end = function() {
	// end() a stream with no initial value
	var s = stream();
	s.ends().log('end');
	s.end();
	expectNoOutput();
	s.tick();
	expect('end undefined')

	// ending a stream is twice forbidden
	assert.throws(function() {
		s.end();
	});

	// end() a stream with initial value
	var s2 = stream(123);
	s2.ends().log('end');
	s2.end();
	expectNoOutput();
	s.tick();
	expect('end 123');

	// end() a stream that has a value set on the same tick
	var s3 = stream().log('s3');
	s3.ends().log('s3 end');
	s3.set(1);
	s3.end();
	s.tick();
	expect('s3 1; s3 end 1');

	// end() a stream, and then set its value
	var s4 = stream().log('s4');
	s4.ends().log('s4 end');
	s4.end();
	expectNoOutput();
	assert.throws(function() {
		s4.set(1);
	});
	s.tick();
	expect('s4 end undefined');
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
	function mapUpdate(value) {
		this.newValue = this.f(value);
	}

	return stream().link(this, mapUpdate, f).pull();
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
	assert.eq(s5.value, 2, 'if parent has a value, map() should pull it immediately');

	var s6 = stream();
	var s7 = s6.map(function() {
		throw new Error("map() shouldn't try to pull its value if parent doesn't have it");
	});

	var s8 = stream(1);
	var s9 = s8.map(inc);
	s8.ends().log('s8 end');
	s9.ends().log('s9 end');

	s8.end();
	stream.tick();
	expect('s8 end 1');
	stream.tick();
	expect('s9 end 2');
};

Stream.prototype.filter = function(f) {

	function filterUpdate(value) {
		if (this.f(value)) {
			this.newValue = value;
		}
	}

	return stream().link(this, filterUpdate, f).pull();
};

test.Stream.filter = function() {
	var s = stream();
	s.filter(isOdd).log();
	s.set(1); stream.tick();
	s.set(2); stream.tick();
	s.set(3); stream.tick();
	s.set(4); stream.tick();
	s.set(5); stream.tick();
	expect('1; 3; 5');

	var oddParent = stream(1);
	var oddChild = oddParent.filter(isOdd);
	assert.eq(oddChild.value, 1, 'filter should pull() its value automatically');

	var evenParent = stream(2);
	var evenChild = evenParent.filter(isOdd);
	assert.type(evenChild.value, 'undefined', "filter should not pull() if filter doesn't match");
};

Stream.prototype.uniq = function() {
	function uniqUpdate(value) {
		if (this.value !== value) {
			this.newValue = value;
		}
	}

	return stream().link(this, uniqUpdate).pull();
};

test.Stream.uniq = function() {
	assert.eq(stream(1).uniq().value, 1, "uniq() should pull its value immediately");
	
	var s1 = stream();
	var s2 = s1.uniq().log();
	s1.set(1);
	stream.tick();
	expect('1');
	s1.set(1);
	stream.tick();
	expectNoOutput();
	s1.set(2);
	stream.tick();
	expect('2');

	s1.set(NaN);
	stream.tick();
	s1.set(NaN);
	stream.tick();
	// uniq() does not filter out duplicate NaNs, because NaN !== NaN
	expect('NaN; NaN');

	s1.set([1, 2]);
	stream.tick();
	s1.set([1, 2]);
	stream.tick();
	// nor does it do a deep compare
	expect('[ 1, 2 ]; [ 1, 2 ]');
};

Stream.prototype.take = function(n) {
	function takeUpdate(value) {
		if (this.state-- <= 0) {
			return;
//			return this.end();
		}
		this.newValue = value;
	}

	// Can't call .pull() because .update() will modify this
	// stream's state. Should maybe separate the check and the take
	// into different functions, like generators (will) do.
	return stream().withState(n).link(this, takeUpdate);
};

test.Stream.take = function() {
//	assert.eq(stream(123).take(5).value, 123, 'take() should pull');
//	assert.eq(stream(123).take(0).value, 123, 'even when n == 0');

	var s = stream();
	s.take(3).log();
	s.set(1).tick().set(2).tick().set(3).tick().set(4).tick().set(5).tick();
	expect('1; 2; 3');
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
	assert.type(stream.cancelDeferredTick, 'undefined', 'there should be no deferred tick scheduled at the beginning of a test');
	stream.ensureDeferredTick();
	assert.type(stream.cancelDeferredTick, 'function', 'ensureDeferredTick() should schedule a tick');
	stream.ensureDeferredTick();
	assert.type(stream.cancelDeferredTick, 'function', 'even when called twice, although this does not test its semantics');
	stream.tick();
	assert.type(stream.cancelDeferredTick, 'undefined', 'there is no scheduled tick at the end of the tick, since the test framework would yell otherwise');
};

stream.streamsToUpdate = [];

// updateOrder(Stream[] streams) -> Stream[]
// 
// Given an array of streams to update, create a graph of those streams
// and their dependencies and return a topological ordering of that graph
// where parents come before their children.
//
// nodes: array of Streams
//
// The algorithm assumes that 'nodes' only contains a single instance of
// each stream.
//
// TODO is this really such a complicated operation?
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
			s.update.apply(s, s.parents.map(valueOf));
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
	assert.eq(s.value, 0);
	stream.tick();
	assert.eq(s.value, 1);

	// A crude way to stop the stream from ticking.
	// TODO when there's .stop(), use that.
	s.listeners = [];
	stream.tick();

	s.set(0);
	s.forEach(inc);
	stream.tick();
	assert.eq(s.value, 0);
	// Now call it 5 times.
	stream.tick(5);
	assert.eq(s.value, 5);

	// A crude way to stop the stream from ticking.
	// TODO when there's .stop(), use that.
	s.listeners = [];
	stream.tick();
};

//
// Chapter 6 - stream combinators
//

stream.combine = function() {
	var parents = copyArray(arguments);
	var f = parents.pop();

	function combineUpdate() {
		this.newValue = this.f.apply(null, arguments);
	}

	return stream().link(parents, combineUpdate, f).pull();
};

test.stream.combine = function() {
	var s1 = stream();
	var s2 = stream();
	var s3 = stream.combine(s1, s2, plus).log();
	assert.type(s3.value, undefined, 'combine() should not pull if none of its parents have a value');

	// set only one parent, should get a value regardless
	s2.set(1);
	stream.tick();
	expect('NaN'); // adding undefined to anything does not make much sense

	var s4 = stream.combine(stream(), stream(1), plus).log();
	assert.eq(s4.value, NaN, 'combine() should pull if one of its parents has a value');

	// The normal case
	var s5 = stream.combine(stream(1), stream(2), plus);
	assert.eq(s5.value, 3);

	// combine should get its value atomically
	var s6 = stream();
	var s7 = stream();
	var s8 = stream.combine(s6, s7, plus).log();
	s6.set(1);
	stream.tick();
	expect('NaN');
	s7.set(2);
	stream.tick();
	expect('3');
	s6.set(3); 
	s7.set(4);
	stream.tick();
	expect('7');
};

stream.combineWhenAll = function() {
	var parents = copyArray(arguments);
	var f = parents.pop();

	function combineWhenAllUpdate() {
		if (this.parents.every(hasValue)) {
			this.newValue = this.f.apply(null, arguments);
		}
	}

	return stream().link(parents, combineWhenAllUpdate, f).pull();
};

test.stream.combineWhenAll = function() {
	var s1 = stream();
	var s2 = stream();
	var s3 = stream.combineWhenAll(s1, s2, plus).log();
	assert.type(s3.value, undefined, 'combine() should not pull if none of its parents have a value');

	// set only one parent, should not get a value 
	s2.set(1);
	stream.tick();
	expectNoOutput();

	s1.set(2);
	stream.tick();
	expect('3');

	var s4 = stream.combineWhenAll(stream(), stream(1), plus).log();
	assert.type(s4.value, 'undefined', 'combine() should only pull if all of its parents have a value');

	// The normal case
	var s5 = stream.combineWhenAll(stream(1), stream(2), plus);
	assert.eq(s5.value, 3);

	// combineWhenAll should get its value atomically
	var s6 = stream();
	var s7 = stream();
	var s8 = stream.combineWhenAll(s6, s7, plus).log();
	s6.set(1);
	stream.tick();
	expectNoOutput();
	s7.set(2);
	stream.tick();
	expect('3');
	s6.set(3); 
	s7.set(4);
	stream.tick();
	expect('7');
};

// stream.merge(Stream streams...) -> Stream: Merge multiple streams.
// 
// Only ever sets its value when some of its parent stream updates, i.e.
// it never pulls its value.
stream.merge = function() {
	var parents = copyArray(arguments);

	function mergeUpdater() {
		var parents = this.parents;
		for (var i = 0, len = parents.length; i < len; i++) {
			if (hasNewValue(parents[i])) {
				this.newValue = parents[i].newValue;
			}
		}
	}

	return stream().link(parents, mergeUpdater);
}

test.stream.merge = function() {
	var s1 = stream(1);
	var s2 = stream(2);
	var s3 = stream.merge(s1, s2).log();

	assert.type(s3.value, 'undefined', 'merge() does not pull.');

	s1.set(123);
	stream.tick();
	expect('123');

	s2.set(234);
	stream.tick();
	expect('234');

	// if two streams are updated within the same tick, too bad.
	s1.set('a');
	s2.set('b');
	stream.tick();
	expect('b');

	// the later parent is picked, regardless of the order of .set()s.
	s2.set('b');
	s1.set('a');
	stream.tick();
	expect('b');
};

//
// Chapter 8 - Generators
//

stream.fromArray = function(array) {
	var result = stream();
	result.state = array;
	result.next = function() {
		var next = this.state.shift();
		if (next !== undefined) {
			this.set(next);
		} else {
			// TODO fiction
//			this.end();
		}
	};

	// Cancel out the previous state change.
	// Used to implement .stop().
	//
	// Given that 'value' is the previous value yielded by .next();,
	// this method should modify .state so that the next value yielded 
	// will be 'value'.  It should not touch other members.
	//
	// This could also be implemented by saving the previous state in
	// .prevState(), or something. That might be a better, simpler
	// solution.
	result.undo = function(value) {
		this.state.unshift(value);
	};

	result.stop = function() {
		// In effect, cancels a pending .set() if there is one.
		// The stream will still be in stream.streamsToUpdate queue,
		// but without this.newValue it will be harmless.
		if (hasNewValue(this)) {
			this.undo(this.newValue);
			delete this.newValue;
		}
	};

	result.play = function() {
		this.next();
	};

	result.next();
	result.forEach(result.next);
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

	var count = tests.length;
	var start = Date.now();
	function finished() {
		var end = Date.now();
		log('Running', count, 'tests took', (end - start), 'ms');
	}

	function runTest() {
		var nextTest = tests.shift();
		if (!nextTest) {
			finished();
			return;
		}

		var title = nextTest[0], f = nextTest[1];

		function done() {
			assert.type(stream.cancelDeferredTick, 'undefined', 'test functions should not leave deferred .tick()s behind');
			expectNoOutput();
			defer(runTest);
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

