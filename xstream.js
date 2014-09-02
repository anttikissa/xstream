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
function mul(x, y) { return x * y; }
function inc(x) { return x + 1; }
function isEven(x) { return !(x % 2); }
function isOdd(x) { return x % 2; }

function id(x) { return x; }
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

// Implementation of 'defer' using setTimeout().
function deferSetImmediate(f) {
	var immediate = setImmediate(f);
	return function() {
		clearImmediate(immediate);
	}
}

// Implementation of 'defer' using setTimeout().
function deferSetTimeout(f) {
	var timeout = setTimeout(f);
	return function() {
		clearTimeout(timeout);
	};
}

// defer(Function f) -> Function: Call 'f' at a later time.
// Return a function that can be called to cancel the the deferred call.
var defer = typeof process !== 'undefined' && process.nextTick
	? deferSetImmediate : deferSetTimeout;

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

// Assert that actual equals expected using the === operator, with
// the exception that NaN is considered to equal NaN.
assert.is = function(actual, expected, message) {
	message = message ? (': ' + message) : '';
	if (actual !== actual && expected !== expected) {
		return; // assert.is(NaN, NaN) -> ok
	}

	if (actual !== expected) {
		var e = new Error('assert failed' + message + ': expected ' + expected +
			', got ' + actual);
		e.skipLines = 2;
		throw e;
	}
};

// Assert that actual equals expected by JSON serializing them and comparing
// the resulting objects.
assert.eq = function(actual, expected, message) {
	actual = JSON.stringify(actual);
	expected = JSON.stringify(expected);

	message = message ? (': ' + message) : '';
	if (actual !== actual && expected !== expected) {
		return; // assert.is(NaN, NaN) -> ok
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

assert.throws = function(f, message) {
	message = message ? (': ' + message) : '';

	try {
		f();
	} catch (e) {
		return;
	}
	// Boils down function body to the essential by removing end-of-line
	// comments and extra whitespace (including newlines)
	var functionEssence = f.toString().replace(/\/\/.*$/mg, '')
		.replace(/\s+/g, ' ');
	var e = new Error('assert failed' + message +
		': expected ' + functionEssence +' to throw')
	e.skipLines = 2;
	throw e
};

function expect(string, message) {
	message = message ? (message + ': ') : '';

	var strings = [string];
	if (contains(string, '; ')) {
		strings = string.split('; ');
	}
	for (var i = 0; i < strings.length; i++) {
		var expected = strings[i];
		var actual = consoleOutput.shift();
		assert(typeof actual !== 'undefined', message + 'expected "' + expected + '", got no output', true);
		assert(actual === expected, message + 'expected "' + expected + '", got "' + actual + '"', true);
	}
}

function expectNoOutput(message) {
	message = message ? (message + ': ') : '';

	assert(consoleOutput.length === 0, message + 'expected no output, got "' +
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
	assert.is(s.value, undefined);
	assert.is(s.listeners.length, 0);
	assert.is(s.children.length, 0);
	assert.is(s.parents.length, 0);
	assert.type(s.ended, 'boolean');
	assert.is(s.ended, false);

	assert.is(new Stream(123).value, 123);

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
	assert.is(stream(123).value, 123);
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
	assert.is(s2, s);
	assert.type(s.state, 'object');
	assert.is(s.state.x, 1);
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
	assert.is(s, s2, 'stream.set() should return the stream itself');
	assert(contains(stream.streamsToUpdate, s));
	assert.is(s.value, undefined, 'stream.value should be undefined before tick()');
	stream.tick();
	assert(!contains(stream.streamsToUpdate, s), 'tick should clear stream.streamsToUpdate');
	assert.is(s.value, 1, 'stream.value should be set after tick()');

	s.set(2);
	assert.is(s.value, 1, 's.set() should not set the value immediately');
	defer(function() {
		assert.is(s.value, 2, 's.set() should set the value after the next tick');
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
	assert.is(got, 10, 'Stream.tick() delegate its argument to stream.tick().');
	assert.is(s, s2, 'Stream.tick() should return "this".');
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
	assert.is(s, s.forEach(nop), '.forEach should return the stream itself');
	s.forEach(function(value) {
		assert.is(this, s, 'listener should receive the stream in "this"');
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

	assert.is(child.value, undefined, "child shouldn't get a value automatically");
	stream.tick();
	assert.is(child.value, undefined, "not even if stream.tick() happens");
	child.pull();
	assert.is(child.value, 123, "when it a child calls .pull(), it finally gets one");

	// Start again, this time with a valueless parent.
	parent = stream();
	child = stream();
	child.parents = [parent];
	parent.children = [child];
	child.update = function() {
		throw new Error(".pull() should never call update() if there's no value");
	};
	child.pull();
};

Stream.prototype.addChild = function(child) {
	this.children.push(child);
}

test.Stream.addChild = function() {
	var parent = stream();
	assert.is(parent.children.length, 0);
	var child = stream();
	parent.addChild(child);
	assert.is(parent.children.length, 1);
	assert.is(parent.children[0], child);

	// It's ok to call addChild() twice with the same child.
	parent.addChild(child);
	assert.is(parent.children.length, 2);
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

	assert.is(parent.children.length, 3);
	assert(contains(parent.children, child));
	parent.removeChild(child);
	// Removing reduces child count with 1
	assert.is(parent.children.length, 2);
	// And the child is no longer in parent's children
	assert(!contains(parent.children, child));

	parent.addChild(stream());
	parent.addChild(child);
	parent.addChild(stream());
	parent.addChild(child);
	parent.addChild(stream());
	assert.is(parent.children.length, 7);

	// Children can be added multiple times to the same parent, and 
	// .removeChild() only removes one instance at a time.
	parent.removeChild(child);
	assert.is(parent.children.length, 6);
	assert(contains(parent.children, child));

	parent.removeChild(child);
	assert.is(parent.children.length, 5);
	assert(!contains(parent.children, child));

	assert.throws(function() {
		parent.removeChild(child);
	});
};

// Stream.derive(Function update, optional Function f) -> Stream
//
// Return a stream that links itself to this stream with 'update' and sets
// 'f'.  If 'this' has a value, the resulting dream pulls its value from
// it.
Stream.prototype.derive = function(update, f) {
	return stream().link(this, update, f).pull();
};

test.Stream.derive = function() {
	var parent = stream();
	var child = parent.derive(nop, id);
	assert.is(parent.children.length, 1);
	assert.is(parent.parents.length, 0);
	assert.is(parent.children[0], child);
	assert.is(child.parents.length, 1);
	assert.is(child.children.length, 0);
	assert.is(child.parents[0], parent);
	assert.is(child.update, nop);
	assert.is(child.f, id);
};

// Stream.link(Stream parent, Function updater, optional Function f) -> Stream
// Stream.link(Stream[] parents, Function updater, optional Function f) -> Stream
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
// Streams linked with link() will end when any of the parent
// streams end, but one tick later.  If streams need to end
// transactionally at some point, try linking the end streams somehow.
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

	if (f) {
		this.f = f;
	}

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
	assert.is(result, child);
	assert(contains(parent.children, child));
	assert(contains(child.parents, parent));
	assert.is(child.update, update);
	assert.is(child.f, inc);

	assert.type(parent.value, 'undefined');
	assert.type(child.value, 'undefined');
	parent.set(1);
	stream.tick();
	assert.is(parent.value, 1);
	assert.is(child.value, 2);
	// update phase should happen first
	expect('updating');
	// then .forEach() handlers of both parent and child
	expect('parent 1; child 2');

	var s = stream().end();
	var s2 = stream().link(s, nop);
	assert(s2.ended, "linking to an ended stream should end the stream being linked");
	stream.tick();

	var s3 = stream().end();
	var s4 = stream().end();
	stream().link([s3, s4], nop).ends().log('end');
	try {
		stream.tick();
	} catch (e) {
		assert(false, "linking to multiple ended streams should be ok, too")
	}
	expectNoOutput();
};

// TODO consider using other mechanism than .forEach() (i.e. linking
// the end streams), since occasionally I tripped by expecting things
// like
//
// var s = stream();
// var s2 = s.map(f);
// s2.ends().forEach(function() { /* do something */ });
// s.end().tick();
// /* expect 'something' to be done */
//
// Then again, it happens mostly in test functions that need to do .tick()
// all the time to get synchronous results, maybe it's not so much
// an issue in real life.
Stream.prototype.endWhenAny = function(streams) {
	for (var i = 0, len = streams.length; i < len; i++) {
		if (streams[i].ended) {
			this.ended = true;
			return;
		}
		streams[i].ends().forEach(this.end.bind(this));
	}
};

test.Stream.endWhenAny = function() {
	var s1 = stream();
	var s2 = stream();
	var s3 = stream();

	s3.endWhenAny([s1, s2]);
	s3.ends().log('s3 end');
	s1.set(1);
	s2.set(2);
	s3.set(3);

	s1.end();
	stream.tick(2);
	expect('s3 end 3');

	var ss1 = stream();
	var ss2 = stream();
	var ss3 = stream();

	ss3.endWhenAny([ss1, ss2]);
	ss3.ends().log('ss3 end');
	ss1.set(1);
	ss2.set(2);
	ss3.set(3);

	ss2.end();
	stream.tick(2);
	expect('ss3 end 3');

	var s4 = stream();
	s4.endWhenAny([]);
	// Nothing to test, really, except that it won't throw
};

Stream.prototype.ends = function() {
	if (!this.endStream) {
		this.endStream = stream();
	}
	return this.endStream;
};

test.Stream.ends = function() {
	var s = stream();

	// ends() creates s.endStream
	assert.type(s.endStream, 'undefined');
	var ends = s.ends();
	assert.type(s.endStream, Stream);

	assert.is(s.endStream, ends);

	assert.is(ends, s.ends(), 'ends() should always return the same stream');
};

Stream.prototype.onEnd = function(f) {
	this.ends().forEach(f.bind(this));
	return this;
};

test.Stream.onEnd = function() {
	var s = stream(1);
	var called = false;
	s.onEnd(function(value) {
		assert.is(s, this, 'context should be the original stream');
		assert.is(value, 1, 'and the value its final value');;
		called = true;
		// TODO
	});
	s.end();
	assert(!called, 'onEnd() handler should be called immediately');
	stream.tick();
	assert(called, 'but only after one tick');
};

Stream.prototype.unlink = function() {
	for (var i = 0, len = this.parents.length; i < len; i++) {
		this.parents[i].removeChild(this);
	}
	this.parents = [];
}

test.Stream.unlink = function() {
	var parent1 = stream(1);
	var parent2 = stream(2);
	var child = stream.combine(parent1, parent2, plus);
	assert.is(child.parents.length, 2);
	assert.is(parent1.children.length, 1);
	assert.is(parent2.children.length, 1);
	child.unlink();
	assert.is(child.parents.length, 0);
	assert.is(parent1.children.length, 0);
	assert.is(parent2.children.length, 0);
};

Stream.prototype.cleanup = function() {
	this.unlink();

	// delete listeners
	this.listeners = [];
};

test.Stream.cleanup = function() {
	var parent = stream(1);
	var child = parent.map(inc).log();
	var unlinkCalled = false;
	child.unlink = function() {
		assert.is(child, this);
		unlinkCalled = true;
		Stream.prototype.unlink.call(this);
	};
	assert(!unlinkCalled, 'unlink has not been called before');
	assert(child.listeners.length > 0, 'child should have listeners');
	child.cleanup();
	assert(unlinkCalled, 'it should call unlink on child');
	assert.is(child.listeners.length, 0, 'it should clean up listeners');
};

Stream.prototype.end = function() {
	if (this.ended) {
		return;
	}
	stream.streamsToUpdate.push(this);
	this.ends().set(valueOf(this));
	this.ended = true;
	return this;
};

test.Stream.end = function() {
	// end() a stream with no initial value
	var s = stream();
	s.ends().log('end');
	s.end();
	expectNoOutput();
	s.tick();
	expect('end undefined')

	// ending a stream twice has no further effect
	s.end();
	stream.tick();
	expectNoOutput();

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

	var s4 = stream().log('s4');
	s4.ends().log('s4 end');
	s4.end();
	expectNoOutput();
	assert.throws(function() {
		s4.set(1);
	}, 'should not be able to set() an ended stream');
	s.tick();
	expect('s4 end undefined');

	var s5 = stream();
	var s5end = s5.end();
	assert.is(s5, s5end, 'end() should return the stream being ended');

	// ending a stream deletes its listeners and detaches it on the 
	// following tick
	var s6 = stream(1);
	var s7 = s6.map(inc).forEach(nop);
	s7.end();
	assert.is(s7.parents.length, 1);
	assert.is(s7.listeners.length, 1);
	stream.tick();
	assert.is(s7.parents.length, 0);
	assert.is(s7.listeners.length, 0);
};

Stream.prototype.rewire = function(newParent) {
	function rewireUpdate(value) {
		this.newValue = value;
	}

	this.unlink();

	return this.link(newParent, rewireUpdate).pull();
};

test.Stream.rewire = function() {
	var s1 = stream(1);
	s1.map(inc).log();
	s1.set(1);
	stream.tick();
	expect('2');

	s1.rewire(stream.combine(stream(5),
		stream.fromArray([1,2,3]),
		mul));

	stream.tick(7);
	expect('6; 11; 16', 'rewire() produces values derived from the new stream');

	var s2 = stream(1);
	var s3 = stream(10);
	var s4 = s2.map(inc).log('s4');
	s4.ends().log('s4 end');
	assert.eq(s4.value, 2);
	s2.set(2).tick();
	expect('s4 3');

	s4.rewire(s3);
	assert.eq(s4.value, 10, 'rewire pulls value immediately');

	// TODO ends() is implemented the wrong way. Of course.
//	s2.end().tick(2);
//	expectNoOutput('rewired stream should not end when the original parent ends');

	s3.end().tick(2);
	expect('s4 end 10', 'rewired stream should end when the new parent ends');
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

	return this.derive(mapUpdate, f);
};

test.Stream.map = function() {
	var s = stream();
	var s2 = s.map(inc).log('s2');
	s2.map(inc).log('s3');
	s.set(1);
	stream.tick();
	expect('s2 2; s3 3');

	var s4 = stream(1);
	var s5 = s4.map(inc);
	assert.is(s5.value, 2, 'if parent has a value, map() should pull it immediately');

	var s6 = stream();
	s6.map(function() {
		throw new Error("map() shouldn't try to pull its value if parent doesn't have it");
	});

	var s8 = stream(1);
	var s9 = s8.map(inc);
	s8.ends().log('s8 end');
	s9.ends().log('s9 end');

	// Mapped stream should end when the parent stream ends
	s8.end();
	stream.tick();
	expect('s8 end 1');
	stream.tick();
	// One tick later, but end nonetheless.
	expect('s9 end 2');
};

Stream.prototype.filter = function(f) {
	function filterUpdate(value) {
		if (this.f(value)) {
			this.newValue = value;
		}
	}

	return this.derive(filterUpdate, f);
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
	assert.is(oddChild.value, 1, 'filter should pull() its value automatically');

	var evenParent = stream(2);
	var evenChild = evenParent.filter(isOdd);
	assert.type(evenChild.value, 'undefined', "filter should not pull() if filter doesn't match");

	var s2 = stream(0);
	s2.ends().log('s2 end');
	var s3 = s2.filter(isOdd);
	s3.ends().log('s3 end');
	s2.end();
	stream.tick();
	expect('s2 end 0');
	stream.tick();
	assert(s3.ended, "filtered stream should end after parent stream ends");
	expect('s3 end undefined');
};

Stream.prototype.uniq = function() {
	function uniqUpdate(value) {
		if (this.value !== value) {
			this.newValue = value;
		}
	}

	return this.derive(uniqUpdate);
};

test.Stream.uniq = function() {
	assert.is(stream(1).uniq().value, 1, 'uniq() should pull its value immediately');
	
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
	expect('NaN; NaN', 'uniq() should not filter out duplicate NaNs, because NaN !== NaN');

	s1.set([1, 2]);
	stream.tick();
	s1.set([1, 2]);
	stream.tick();
	// nor does it do a deep compare
	expect('[ 1, 2 ]; [ 1, 2 ]');

	s1.end();
	s2.ends().log('s2 end');
	expectNoOutput();
	stream.tick();
	expectNoOutput('this is the tick when the parent stream ends');
	stream.tick();
	expect('s2 end [ 1, 2 ]', 'stream created with uniq() should end when parent ends');
};

Stream.prototype.take = function(n) {
	function takeUpdate(value) {
		if (this.state <= 0) {
			return this.end();
		}
		this.newValue = value;
	}

	return this.derive(takeUpdate).withState(n).forEach(function() {
		this.state--;
	});
};

test.Stream.take = function() {
	assert.is(stream(123).take(5).value, 123, 'take() should pull');
	// TODO I wonder if this is the right semantics
	assert.is(stream(123).take(0).value, 123, 'even when when n === 0');

	var s = stream();
	s.take(3).log();
	s.set(1).tick().set(2).tick().set(3).tick().set(4).tick().set(5).tick();
	expect('1; 2; 3');

	var s2 = stream();
	var s3 = s2.take(1);
	s2.set(1);
	s3.ends().log('s3 end');
	s2.end();
	stream.tick(2);
	expect('s3 end 1', 'stream returned by take() should end within two ticks');
};

Stream.prototype.skip = function(n) {
	function skipUpdate(value) {
		if (this.state > 0) {
			this.state--;
			return;
		}

		this.newValue = value;
	}

	var result = stream().withState(n).link(this, skipUpdate);
	if (n === 0) {
		result.pull();
	}
	return result;
};

test.Stream.skip = function() {
	var s = stream();
	s.skip(3).log('s2').ends().log('s2 end');
	s.set(1).tick();
	s.set(2).tick();
	s.set(3).tick();
	expectNoOutput('first 3 ticks should do nothing');
	s.set(4).tick();
	expect('s2 4', 'following 2 ticks should update the value');
	s.set(5).tick();
	expect('s2 5', 'following 2 ticks should update the value');
	s.end();
	stream.tick();
	stream.tick();
	expect('s2 end 5');
	
	var s3 = stream(1);
	var s4 = s3.skip(3);
	assert.is(s4.value, undefined, 'stream returned by skip() should not pull its value');

	var s5 = stream(1);
	var s6 = s3.skip(0);
	assert.is(s4.value, undefined, 'except when n === 0, since skip(0) should be equivalent to the stream itself');

	// though this kinda contradicts the 'should be equivalent to the
	// stream itself', since they don't end on the same tick
	s4.ends().log('s4 end');
	s3.end();
	stream.tick(2);
	expect('s4 end undefined', 'stream returned by skip() should end within two ticks');
};

Stream.prototype.slidingWindow = function(n) {
	function slidingWindowUpdate(value) {
		this.newValue = this.value.concat(value);
		if (this.newValue.length > this.state) {
			this.newValue.shift();
		}
	}

	var result = stream([]);
	return result.link(this, slidingWindowUpdate).withState(n).pull();
};

test.Stream.slidingWindow = function() {
	var s1 = stream();
	var s2 = s1.slidingWindow(3).log();
	s2.ends().log('end');
	s1.set(1).tick();
	expect('[ 1 ]');
	s1.set(2).tick();
	expect('[ 1, 2 ]');
	s1.set(3).tick();
	expect('[ 1, 2, 3 ]');
	s1.set(4).tick();
	expect('[ 2, 3, 4 ]', 'sliding window should drops the first elements when it grows to full size');
	s1.end().tick(2);
	expect('end [ 2, 3, 4 ]');

	var s3 = stream();
	s3.slidingWindow(2).ends().log('sliding end');
	s3.end();
	stream.tick(2);
	expect('sliding end []', 'slidingWindow() without any input should end with the empty array');

	var s4 = stream(123);
	var s5 = s4.slidingWindow(2);
	s5.ends().log('sliding end');
	stream.log(s5.value);
	expect('[ 123 ]', 'slidingWindow() should pull initial value');
	s4.end();
	stream.tick(2);
	expect('sliding end [ 123 ]', 'and end with it');

	var s6 = stream();
	var s7 = s6.slidingWindow(0).log();
	assert.eq(s7.value, [], 'slidingWindow of length 0 works');
	s6.set(123).tick();
	expect('[]', 'but its value never changes from []');
};

// Yields the last n elements of a stream after the stream has ended.
Stream.prototype.leave = function(n) {
	var slidingWindow = this.slidingWindow(n);
	var result = stream();

	slidingWindow.onEnd(function(values) {
		result.rewire(stream.fromArray(values));
	});
	return result;
};

test.Stream.leave = function() {
	return;
	var s = stream.fromArray([1,2,3,4,5]).leave(3);
	s.ends().log('end');

	stream.tick(5);
	expectNoOutput();
	stream.tick(5);
	expect('3; 4; 5; end 5');
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

// List of streams that have seen a .set() or .end() during the
// current tick.  .end() puts its victims here only because it causes
// their .cleanup() method to be called.
stream.streamsToUpdate = [];

// updateOrder(Stream[] streams) -> Stream[]
//
// Find all streams reachable from 'streams' through parent -> child
// relations in topological order (parents always come before their
// descendants).
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

	// Phase 1: call update function.
	// This causes .newValues to be installed on derived streams.
	for (var i = 0, len = streamsToUpdate.length; i < len; i++) {
		var s = streamsToUpdate[i];
		if (s.parents.some(hasNewValue)) {
			s.update.apply(s, s.parents.map(valueOf));
		}
	}

	for (var i = 0, len = streamsToUpdate.length; i < len; i++) {
		var s = streamsToUpdate[i];

		if (hasNewValue(s)) {
			// Phase 2: move .newValue -> .value.
			s.value = s.newValue;
			delete s.newValue;

			// Phase 3: call .forEach() handlers with new values.
			s.broadcast();
		}

		// Phase 4: detach ended streams & wipe out their listeners.
		if (s.ended) {
			s.cleanup();
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
	assert.is(s.value, 0);
	stream.tick();
	assert.is(s.value, 1);

	// A crude way to stop the stream from ticking.
	// TODO when there's .stop(), use that.
	s.listeners = [];
	stream.tick();

	s.set(0);
	s.forEach(inc);
	stream.tick();
	assert.is(s.value, 0);
	// Now call it 5 times.
	stream.tick(5);
	assert.is(s.value, 5);

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
	assert.is(s4.value, NaN, 'combine() should pull if one of its parents has a value');

	// The normal case
	var s5 = stream.combine(stream(1), stream(2), plus);
	assert.is(s5.value, 3);

	var s6 = stream();
	var s7 = stream();
	stream.combine(s6, s7, plus).log();
	s6.set(1);
	stream.tick();
	expect('NaN', 'setting only one value should result in NaN');
	s7.set(2);
	stream.tick();
	expect('3', 'setting the second value should give a sensible result');
	s6.set(3); 
	s7.set(4);
	stream.tick();
	expect('7', 'setting both values should result in only one update');
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

	s2.set(1);
	stream.tick();
	expectNoOutput('stream should not react when one of parents still lacks value');

	s1.set(2);
	stream.tick();
	expect('3');

	var s4 = stream.combineWhenAll(stream(), stream(1), plus).log();
	assert.type(s4.value, 'undefined', 'combine() should only pull if all of its parents have a value');

	// The normal case
	var s5 = stream.combineWhenAll(stream(1), stream(2), plus);
	assert.is(s5.value, 3);

	// combineWhenAll should get its value atomically
	var s6 = stream();
	var s7 = stream();
	var s8 = stream.combineWhenAll(s6, s7, plus).log();
	s6.set(1);
	stream.tick();
	expectNoOutput('setting value to one parent results in no action');
	s7.set(2);
	stream.tick();
	expect('3', 'setting value to second parent results updates combined stream');
	s6.set(3); 
	s7.set(4);
	stream.tick();
	expect('7', 'setting value to both parents only causes a single update');
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
			this.end();
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
	var a = stream.fromArray([1, 2, 3, 4]).log();
	a.ends().log('end');
	stream.tick(5);
	expect('1; 2; 3; 4; end 4');
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
	stream.tick(); // required for it to end
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
		tests.push({ title: title, f: testFunction });
		collectTests(object[testName], wholeName, wholeIdx);

		testIdx++;
	}
}

function runTests(matcher) {
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


		var title = nextTest.title, f = nextTest.f;

		function done() {
			assert.type(stream.cancelDeferredTick, 'undefined', 'test functions should not leave deferred .tick()s behind');
			expectNoOutput();
			defer(runTest);
		}


		try {
			if (matcher(nextTest)) {
				log(title + '\n');
				if (f.length === 1) {
					f(done);
				} else {
					f();
					done();
				}
			} else {
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

var testsToRun = process.env.XSTREAM_TESTS;
if (testsToRun) {
	if (testsToRun === 'all') {
		runTests(function() { return true; });
	} else {
		log("Running tests matching string '" + testsToRun + "'");

		runTests(function(test) {
			if (test.title.match(testsToRun)) {
				return true;
			}
			return false;
		});
	}
}

