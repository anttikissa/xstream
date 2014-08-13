//
// xstream: A lean and mean reactive programming library
//
//
// How to use (browser):
//
// <script src='dist/xstream.js'></script>
// <script>
// stream.fromArray([1,2,3]).map(function(x) { return x * 2; }).log('hi');
// </script>
//
// How to use (node.js):
//
// $ npm install xstream
//
// var stream = require('xstream');
// stream.fromArray([1,2,3].map(function(x) { return x * 2; }).log('hi');
//
//
// How to read this file:
//
// Looking for a definition?  All exported functions of 'stream' are defined
// using the syntax
//
//     stream.<functionName> = function() { ... };,
//
// so if you're looking e.g. for the definition of 'fromArray', just search
// for the string "fromArray =".  Likewise for Stream's methods, which are
// defined using the syntax
//
//    Stream.prototype.<methodName> = function() { ... };
//
// This file is divided into chapters
//
// Chapter 1 - General utility functions
// Chapter 2 - Stream() constructor, core methods (?)
// Chapter # - Stream general methods
// Chaptar # - Stream combinators
// Chapter # - stream general functions, .link() and stuff
// Chapter # - stream combinators
// Chapter # - transactions
// Chapter # - Generators .fromArray() etc.
// Chapter # - utils
// Chapter # - misc development/debug stuff (speedTest?)
//
// Enjoy!
//

//
// Chapter 1
//
// General utility functions, used internally for miscellaneous purposes.
//

// Like console.log but shorter to write and can be passed around as a function.
// TODO strip away logging statements in production build.
var log = console.log.bind(console);

// Assert that 'what' is truthy.
// TODO strip away assertions in production build.
function assert(what) {
	if (!what) {
		throw new Error('assert failed');
	}
}

// Assert type of object.
// TODO strip away assertions in production build.
function assertType(object, type) {
	if (typeof object !== type) {
		throw new Error('wrong type');
	}
}

// Don't do anything.  Default updater for streams, among other things.
function nop() {
}

// Always return true.
function alwaysTrue() {
	return true;
}

// Make a copy of an array or an argument-like object.
function copyArray(args) {
	return Array.prototype.slice.apply(args);
}


//
// Chapter 2
//
// This chapter introduces the Stream() constructor, and its sister, stream().
//

//
// new Stream(Object initial): create a Stream.
//
// initial: optional initial value, will be updated during the next tick.
//
// A Stream is an object that has the properties:
//
// Number id: Unique numeric id, starting from 0.
// Object value: The most recent value of the stream.  Value is 'undefined'
//     until the stream has been updated for the first time.  You can use
//     .withInitialValue() to define a value before that, but it won't be
//     broadcast to listeners.
// Stream[] parents: Array of Streams, whose changes cause this stream's
//     updater to be called.
// Stream[] children: Array of Streams, whose updaters will be called whenever
//     this stream has updated.
// Function[] listeners: Array of functions that will be called after each
//     tick. The listener takes on argument, which is the new value, and its
//     'this' will be set to the stream that was changed.
// Function updater: a function that is called after either this.update() has
//     been called, or one of this stream's parents is updated.  The updater
//     should either set this stream's .newValue property (which updates the
//     value of this stream), or do nothing.  A parent stream's .newValue has
//     been set if and only if it has been updated during this tick.  Updaters
//     can also use the helper functions hasValue(Stream), hasNewValue(Stream),
//     and mostRecentValue(Stream) to access the parents' value within the
//     transaction.
//
// The Stream constructor is available as stream.Stream, but usually it's
// invoked by calling the function stream().
//
function Stream(initial) {
	this.id = Stream.nextId++;
	this.value = undefined;
	this.parents = [];
	this.children = [];
	this.listeners = [];
	this.updater = nop;

	if (initial !== undefined) {
		this.update(initial);
	}
};

// Counter for getting the next stream id.
Stream.nextId = 0;

//
// stream(Object initial): create a Stream.
//
// 'stream' is the main entry point of the library.  It's a function that
// serves two purposes: first as a shorthand for calling 'new Stream()',
// and secondly as a namespace for all kinds of functions that don't
// naturally fit into Stream.prototype.
//
// stream.link
// stream.combine
// stream.fromArray (etc)
//
function stream(initial) {
	return new Stream(initial);
};

// CommonJS entry point for the module.
module.exports = stream;

// Expose Stream as part of stream.
stream.Stream = Stream;



//
// Chapter # - Stream general utilities
//

// Set the initial value of a stream to a given value 'silently',
// without broadcasting it.
//
// Return this.
Stream.prototype.withInitialValue = function(value) {
	this.value = value;
	return this;
};

// Call f(newValue) whenever my value has been updated.
//
// Function(Object value) f: callback function.
//     When f is called, 'this' will be set to the stream.
//
// Return this.
Stream.prototype.forEach = function forEach(f) {
	this.listeners.push(f);
	return this;
};

// Tell my listeners that my value has been updated.
//
// Called by stream.tick() after all updaters have been called.
Stream.prototype.broadcast = function() {
	for (var i = 0, len = this.listeners.length; i < len; i++) {
		this.listeners[i].call(this, this.value);
	}
};

// CyclicalDependencyError(Stream[] path)
//
// A cycle was found when modifying stream dependencies.
// Property 'path' contains an array of streams that form the cycle.
function CyclicalDependencyError(path) {
	Error.call(this, 'Cyclical dependency');
	this.path = path;
}

stream.CyclicalDependencyError = CyclicalDependencyError;

// Ensures that stream's direct and indirect dependencies do not include
// the stream itself by throwing CyclicalDependencyError if a cycle is
// found.
//
// Return this.
Stream.prototype.ensureNoCyclicalDependencies = function() {
	var path = [];

	var that = this;

	function visit(stream) {
		if (path.length && stream.id === that.id) {
			throw new CyclicalDependencyError(path);
		}
		path.push(stream);
		stream.parents.forEach(function(parent) {
			visit(parent);
		});
		path.pop();
	}

	visit(this);

	return this;
}

// Try to update my value from 'this.parents' immediately.  Useful for
// streams generated by stream.combine(), if you don't want to wait for
// any of the parent streams to update.
//
// Note that this will not go further than to the first ancestors.  If you say,
// for example,
//
//     s.rewire(stream.combine(a, b, f(x, y) { ... }));
//     s.pull();
//
// Then s.pull() won't have any effect because the direct parent stream
// (result of .rewire()) will not have updated.  You'll need to do
//
//     s.rewire(stream.combine(a, b, f(x, y) { ...}).pull());
//
// instead.
//
// TODO consider the possibility of .combine(), and similar
// combinators, just .pull()ing their value automatically
//
// Return this.
Stream.prototype.pull = function() {
	this.updater.apply(this, this.parents);
	if (this.newValue !== undefined) {
		this.update(this.newValue);
		delete this.newValue;
	}
	return this;
};

// Give this stream a name that shows up in .toString() and .inspect() output.
//
// Return this.
Stream.prototype.name = function(name) {
	this._name = name;
	return this;
}

//
// Print useful information about this stream.
//
Stream.prototype.toString = function() {
	var result = '[Stream s' + this.id;
	function show(name, value) {
		if (value !== undefined) {
			result += ', ' + name + ': ' + value;
		}
	}
	function showStreams(name, streams) {
		show(name, '[' + streams.map(function(s) { return 's' + s.id; }).join(', ') + ']');
	}
	function showListeners(name, listeners) {
		show(name, '[' + listeners.map(function(f) { return f.toString(); }).join(', ') + ']');
	}
	show('value', this.value);
	show('name', this._name);
	show('newValue', this.newValue);
	show('state', JSON.stringify(this.state));
	showStreams('parents', this.parents);
	showStreams('children', this.children);
//	showListeners('listeners', this.listeners);
	return result + ']';
};

// For node.js console
Stream.prototype.inspect = function() {
	return this.toString();
};

// Log my values, optionally with a prefix.
Stream.prototype.log = function(prefix) {
	return this.forEach(prefix ? function(value) {
		console.log(prefix, value);
	} : function(value) {
		console.log(value);
	});
}


// Link stream to one or more parents.
//
// stream.link(
//     Stream parent, Stream child,
//     Function updater, Function f = null) -> Stream
//
// stream.link(
//     [Stream] parents, Stream child,
//     Function updater, Function f = null) -> Stream
//
// Establish a dependency relationship a between a stream ('child') and
// one or more dependencies ('parents').
//
// Set child.parents to parents, child.updater to updater, and child.f
// to f.
//
// Whenever a parent is updated within a transaction, 'updater' will be
// called with 'child' as 'this'.  'updater' will only be called once
// per transaction, and only after all of child's parents have been
// updated.
//
// It should set 'this.newValue' if it wants to update 'child''s value,
// and otherwise do nothing.  The 'newValue' attribute of parent streams
// has been set for those parents that were updated during this tick.
//
// Return child.
//
function link(parents, child, updater, f) {
	if (parents instanceof Stream) {
		parents = [parents];
	}

	for (var i = 0, len = parents.length; i < len; i++) {
		parents[i].children.push(child);
	}
	child.parents = parents;
	child.updater = updater;
	child.f = f || null;

	return child;
};

stream.link = link;





// Update my value to 'value'.
//
// Updates happen in ticks.  Ticks are triggered by calling the
// .update() method of any stream.  During one tick, one stream can
// update at most once.  The transaction engine ensures that:
//
// - Calling .update() doesn't take effect immediately, but will take
//   effect eventually (using process.nextTick(), setImmediate(),
//   setTimeout(..., 1) or similar mechanism)
// - Parents' updater are called before their children's updater
// - Update handlers are run exactly once for every updated stream
// - When .forEach() handlers are called, all streams have been updated
//   (consistent worldview)
//
Stream.prototype.update = function update(value) {
	stream.transaction().update(this, value);
	return this;
};

// TODO TODO TODO rethink and rewrite
//
// End this stream, causing this.ends() to update with the most recent
// value of this stream.
//
// If end() is called outside commit phase, the .ends() stream will update
// during the next tick.  Calling update() on a stream after end() is called
// will result in error when the next transaction is committed.
//
// If end() is called in the commit phase (i.e. inside a .forEach handler),
// it will cancel the updates that were scheduled for this stream during the
// next tick.  It works this way so that automatic streams like .fromRange(0)
// can use .forEach() to schedule the next update, and we can use .end() within
// a .forEach handler to end them with the current value.
//
// TODO there's probably a cleaner way to do it
//
Stream.prototype.end = function end() {
	// TODO should be able to call .end() on a generator at any time,
	// not just within a commit.  There's no (general) way to check if the update
	// was scheduled by a human operator an automatic .forEach(), so...
	//
	// The bad news is that this hack doesn't work, the good news is
	// that a better solution must be implemented. 
	//
	// Consider the case
	//
	// var s = fromRange(1);
	// s.log();
	// s.tick(); // -> 1
	// s.end();
	// s.tick(); // no effect
	//
	// What should happen?
	//
	// Then consider
	//
	// var s = fromRange(1);
	// s.log();
	// s.tick(5); // -> 1; 2; 3; 4; 5
	// s.end();
	// s.tick(); // no effect
	//
	// Now consider
	//
	// var s = fromRange(1);
	// s.forEach(function(value) {
	//   console.log(value);
	//   if (value === 5) {
	//     s.end();
	//   }
	// });
	// s.tick(5); // -> 1; 2; 3; 4; 5
	// s.tick(); // no effect
	if (stream.withinCommit) {
		this.cancelTransactions();
	}

	stream.transaction().end(this);
	return this;
};

// Has the stream ended?
//
// I.e. is it safe to call .update() on this stream
Stream.prototype.ended = function ended() {
	// This is ugly, and not even correct. TODO FIXME
	return !!this.endStream && mostRecentValue(this.endStream) !== undefined;
};

function mapUpdater(parent) {
	this.newValue = this.f(parent.newValue);
}

// Returns a stream whose value is updated with 'f(x)' whenever this
// stream's value is updated with 'x'.
//
// var s2 = s1.map(plusOne);
//
// s1: 1 1 2 2 5 6 6
// s2: 2 2 3 3 6 7 7
//
// TODO map is just stream.combine(this, f).
// Should we implement it in terms of a more complex and generalized
// function or leave it as is?
Stream.prototype.map = function map(f) {
	return stream.link(this, stream(), mapUpdater, f).linkEnds(this);
};

function filterUpdater(parent) {
	if (this.f(parent.newValue)) {
		this.newValue = parent.newValue;
	}
}

// Returns a stream whose value is updated with 'x' whenever this 
// stream's value is updated with 'x', if 'f(x)' is true.
//
// var s2 = s1.filter(isOdd);
//
// s1: 1 1 2 2 5 6 6
// s2: 1 1     5
Stream.prototype.filter = function filter(f) {
	return stream.link(this, stream(), filterUpdater, f);
};

function uniqUpdater(parent) {
	if (this.value !== parent.newValue) {
		this.newValue = parent.newValue;
	}
}

// Returns a stream whose value is the same as this stream's value,
// but is only broadcast whenever this stream's value changes.
//
// var s2 = s1.uniq()
//
// s1: 1 1 2 2 5 6 6 
// s2: 1   2   5 6
Stream.prototype.uniq = function uniq() {
	// TODO f could be the equals function?
	return stream.link(this, stream(), uniqUpdater);
};

// A shorthand to initialize stream.state.
Stream.prototype.withState = function withState(state) {
	this.state = state;
	return this;
};

function takeUpdater(parent) {
	if (this.state-- <= 0) {
		return this.end();
	}
	this.newValue = parent.newValue;
}

// Returns 'n' first elements
Stream.prototype.take = function take(n) {
	return stream.link(this, stream().withState(n), takeUpdater)
		.linkEnds(this);
};

function skipUpdater(parent) {
	if (this.state > 0) {
		this.state--;
		return;
	}
	this.newValue = parent.newValue;
}

// Leaves out 'n' first elements, then returns the rest
Stream.prototype.skip = function skip(n) {
	return stream.link(this, stream().withState(n), skipUpdater)
		.linkEnds(this);
};

Stream.prototype.leave = function leave(n) {
	// Return a stream that stays dormant...
	var result = stream();

	// ...until the original stream has ended (at which point
	// .slidingWindow(n) ends, too; on the end tick, rewire 
	// 'this' to be a generator stream with the last 'n' values.
	this.slidingWindow(n).onEnd(function(values) {
		result.rewire(stream.fromArray(values));
	});

	return result;
};

function slidingWindowUpdater(parent) {
	this.newValue = this.value.concat(parent.newValue);
	while (this.newValue.length > this.state) {
		this.newValue.shift();
	}
};

// A stream with an array of at most 'n' latest values of its parent.
//
// Could probably be implemented more cleanly with .reduce()
Stream.prototype.slidingWindow = function slidingWindow(n) {
	return stream.link(this, stream().withState(n).withInitialValue([]),
		slidingWindowUpdater).linkEnds(this);
};

// Skips 'start' elements, then returns elements until the 'end'th
// element.
//
// Similar to Array.prototype.slice, except that slice(-n) doesn't 
// do what it does on an array.  Use 'leave(n)' for that.
Stream.prototype.slice = function slice(start, end) {
	if (end === undefined) {
		return this.skip(start);
	}
	return this.skip(start).take(end - start);
}

function reduceUpdater(parent) {
	if (this.value !== undefined) {
		this.newValue = this.f(this.value, parent.newValue);
	} else {
		this.newValue = parent.newValue;
	}
}

// Returns a reduced stream, whose value represents the values of
// this stream, 'boiled down' by function 'f'.  The first value of
// the resulting stream is the same as the next value of 'this', or
// if 'initial' is provided, 'f(initial, next value of this)'.
//
// f: function(accumulator, value) -> accumulator'
//
// Like Array.prototype.reduce, but provides a view to the reduction
// process in realtime.
//
// var s2 = s1.reduce(function(sum, value) { return sum + value; });
//
// s1: 1 1 2 2  5  6  6
// s2: 1 2 4 6 11 17 23
//
// TODO example with 'initial'
Stream.prototype.reduce = function(f, initial) {
	return stream.link(this, stream().withInitialValue(initial), reduceUpdater, f)
		.linkEnds(this);
};

// Collect all values of a stream into an array
Stream.prototype.collect = function() {
	return this.reduce(function(array, x) {
		return array.concat(x);
	}, []);
};

function rewireUpdater(parent) {
	this.newValue = parent.newValue;
}

// TODO terminology below;
// remove vs. detach, dependencies vs. parents/children
//
// Remove a child from this stream's dependencies.
Stream.prototype.removeChild = function(child) {
	assert(this.children.indexOf(child) !== -1);
	this.children.splice(this.children.indexOf(child), 1);
}

// Remove all incoming dependencies
Stream.prototype.detachFromParents = function() {
	for (var i = 0, len = this.parents.length; i < len; i++) {
		this.parents[i].removeChild(this);
	}
	this.parents = [];
};


// rewire: (Stream parent) -> Stream
//
// Unlink 'this' from its old parents.
//
// Add a dependency from 'parent' to 'child'
// Remove old dependencies
//
Stream.prototype.rewire = function(newParent) {
	for (var i = 0, len = this.parents.length; i < len; i++) {
		var parent = this.parents[i];
		parent.removeChild(this);
	}
	// TODO wrap in try-catch-rewire-to-stream()-rethrow?
	return stream.link(newParent, this, rewireUpdater).ensureNoCyclicalDependencies().linkEnds(newParent);
};

// Update value from the most recent value of the master.
//
// Makes use of 'master' that has been set in '.ends()'.
function masterUpdater() {
	this.newValue = mostRecentValue(this.master);
}

// Utility function for linking the .ends() streams.
//
// When 'parent' ends, make 'this' end as well, taking the end value
// from 'this.master'.
Stream.prototype.linkEnds = function(parent) {
	stream.link(parent.ends(), this.ends(), masterUpdater);
	return this;
};

// A shorthand, to enable:
//
// var s = stream(1).tick();
Stream.prototype.tick = function(times) {
	stream.tick(times);
	return this;
};

// TODO there are more than one smells to this one
// - name: it's not canceling the whole transaction, only the actions that
// target this stream
// - it's touching Transaction's internals directly
// - still it's a valid way to .end() a stream that has transactions 
// in the transaction queue
// - maybe a cleaner way would be to mark them as .ended or something
Stream.prototype.cancelTransactions = function() {
	var tx = stream.transaction();
	var that = this;
	tx.actions = tx.actions.filter(function(action) {
		return action.stream !== that;
	});
};

Stream.prototype.ends = function() {
	if (!this.endStream) {
		this.endStream = stream();
		this.endStream.master = this;
		this.endStream.ends = function() {
			throw new Error("Don't call .ends() of an .ends(), you silly");
		};
	}
	return this.endStream;
};

// TODO endWhen, endWhenOne, endWhenAll
// for combine and merge, respectively
// or are all just special cases?

// Shorthand
Stream.prototype.onEnd = function(f) {
	this.ends().forEach(f.bind(this));
};

// End stream when 'value' encountered
Stream.prototype.endWhen = function(value) {
	this.forEach(function(v) {
		if (v === value) {
			this.end();
		}
	});
	return this;
};

// Will updates automatically schedule a commit?
stream.autoCommit = true;

// HACK HACK HACK
// To enable .end() to work correctly when it's called
// during the commit phase
stream.withinCommit = false;

stream.nextTick = 0;

stream.ticks = stream();

stream.ticks.updater = function() {
	this.newValue = stream.nextTick++;
};

// Get the current transaction or create one.
stream.transaction = function transaction() {
	return stream.tx || (stream.tx = new Transaction());
};

// "Tick" by committing the current transaction.
//
// Optionally, specify a number of times to tick.
stream.tick = function tick(times) {
	times = times || 1;
	while (times--) {
		stream.transaction().commit();
	}
	return stream;
}

// Make a stream out of pretty much anything.
//
// stream.from(String) -> Stream
// stream.from([Object]) -> Stream
// stream.from(Object...) -> Stream
stream.from = function from(first) {
	if (arguments.length === 1) {
		if (typeof first === 'string') {
			return stream.fromString(first);
		}
		if (first instanceof Array) {
			return stream.fromArray(first);
		}
		// TODO promises, callbacks, generators, etc.
		// Fall back to '.fromValues'.
	}
	return stream.fromValues.apply(stream, arguments);
}

function forUpdater() {
	if (this.ended()) {
		return;
	}

	this.newValue = this.f();

	if (this.ended()) {
		return this.end();
	}

	stream.ticks.update();
}

// Return a generator stream.
//
// initialState: set to resulting stream's .state
// f: called on each tick. Should modify this.state and return the next
// value.
// ended: inspect this.state to see if the stream has ended.  
//
// As an example, a counter that counts from 1 to 5:
//
// stream.generator(
//   1,
//   function() { return this.state++; },
//   function() { return state <= 5; }).log();
// // -> 1; 2; 3; 4; 5
//
// How about .while(), .do() then?
//
// It would make sense, then, to save 'condition' in 'this.condition'.
// Probably it would be a saner solution than overriding '.ended',
// anyway.
//
// Or, for is a keyword in older browsers, bye IE8
//
stream.for = function(initialState, condition, f) {
	var result = stream.link(
		stream.ticks,
		stream().withState(initialState),
		forUpdater,
		f);

	if (condition) {
		// TODO VERY unclean. Goes against all principles of
		// transparency ('ended' can't be retrieved from the resulting
		// object directly), duplicates code, etc.
		// Get rid of this hack!
		// See Stream.prototype.ended(), too.
		result.ended = function() {
			if (this.endStream && mostRecentValue(this.endStream) !== undefined)
				return true;
			return !condition.apply(this);
		}
	}

	// 'Kickstart' the generator by an update, or by an end
	// if it's ended already
	if (result.ended()) {
		result.end();
	} else {
		result.update();
	}

	return result;
};

// Loop is like 'for' except it never ends (unless .end() is called
// explicitly).
stream.loop = function loop(initialState, f) {
	return stream.for(initialState, alwaysTrue, f);
};

// Count numbers from 'initial'.
stream.count = function(initial) {
	return stream.loop(
		initial || 0,
		function() { return this.state++; }
		);
};

// Make a stream from an array.
//
// stream.fromArray([Object]) -> Stream
//
// Set the the first value in the current transaction and the following
// values in following transactions.
stream.fromArray = function fromArray(array) {
	return stream.for(
		copyArray(array),
		function() { return this.state.length; },
		function() { return this.state.shift(); });
};

stream.fromRange = function fromRange(start, end, step) {
	end = end !== undefined ? end : Infinity;
	step = step || 1;

	return stream.for(
		{ current: start, end: end, step: step },
		function() {
			return this.state.current <= this.state.end;
		},
		function() {
			var current = this.state.current;
			this.state.current += this.state.step;
			return current;
		}
		);
}

// Make a stream from a list of values.
//
// stream.fromArray(Object...) -> Stream
//
// stream.fromValues(1,2,3) is equal to stream.fromArray([1,2,3]).
stream.fromValues = function fromValues() {
	var args = Array.prototype.slice.call(arguments);
	return stream.fromArray.call(stream, args);
};

// Make a stream from a string's characters.
//
// stream.fromString(String) -> Stream
//
// stream.fromString('abc') is equal to stream.fromArray('a', 'b', 'c').
stream.fromString = function fromString(string) {
	return stream.fromArray(string.split(''));
};

// Maybe not the right place for this
stream.speedtest = function speedtest() {
	var start;

	var count = 5000;

	// just iterate with .forEach()
	function simple(end) {
		start = new Date();
		var s = stream.fromRange(0, count);
		s.onEnd(end);
	}

	// iterate and count
	function counter(end) {
		start = new Date();
		var s = stream.fromRange(0, count);
		var s2 = s.reduce(function(count) {
			return count + 1;
		}, 0);
		var s3 = s2.map(function(x) {
			return x * 2;
		});
		s3.onEnd(end);
	}

	var reporter = function(name) {
		return function(end) {
			var time = new Date() - start;
			var perSecond = count / time * 1000;
			perSecond = String(perSecond).replace(/(\.\d).*/, '$1');
			console.log(name + ':', perSecond, 'iterations / s');
		};
	};

	simple(reporter('simple'));
	setTimeout(function() { counter(reporter('counter')); }, 1000);
}

// Has stream been updated during this tick or before?
function hasValue(s) {
	return mostRecentValue(s) !== undefined;
}

// Has stream been updated during this tick?
function hasNewValue(s) {
	return s.hasOwnProperty('newValue');
}

// Return .newValue if exists, otherwise .value
function mostRecentValue(s) {
	if (s.hasOwnProperty('newValue'))
		return s.newValue;
	return s.value;
}

function combine2Updater(firstParent, secondParent) {
	this.newValue = this.f(
		mostRecentValue(firstParent),
		mostRecentValue(secondParent));
}

function combine3Updater(firstParent, secondParent, thirdParent) {
	this.newValue = this.f(
		mostRecentValue(firstParent),
		mostRecentValue(secondParent),
		mostRecentValue(thirdParent));
}

function combineUpdater() {
	var values = this.parents.map(mostRecentValue);
	this.newValue = this.f.apply(null, values);
};

function combineWhenAll2Updater(firstParent, secondParent) {
	if (hasValue(firstParent) && hasValue(secondParent)) {
		this.newValue = this.f(
			mostRecentValue(firstParent),
			mostRecentValue(secondParent));
	}
}

function combineWhenAll3Updater(firstParent, secondParent, thirdParent) {
	if (hasValue(firstParent) && hasValue(secondParent) && 
		hasValue(thirdParent)) {
		this.newValue = this.f(
			mostRecentValue(firstParent),
			mostRecentValue(secondParent),
			mostRecentValue(thirdParent));
	}
}

function combineWhenAllUpdater() {
	if (this.parents.every(hasValue)) {
		var values = this.parents.map(mostRecentValue);
		this.newValue = this.f.apply(null, values);
	}
};


// stream.combine(Stream streams..., f) -> Stream
// TODO link .ends()
// TODO document
stream.combine = function combine() {
	var parents = copyArray(arguments);
	var f = parents.pop();
	var updater = parents.length === 2 ? combine2Updater :
		parents.length === 3 ? combine3Updater :
		combineUpdater;

	return stream.link(parents, stream(), updater, f);
}

// TODO link .ends()
stream.combineWhenAll = function combineWhenAll() {
	var parents = copyArray(arguments);
	var f = parents.pop();
	var updater = parents.length === 2 ? combineWhenAllUpdater :
		parents.length === 3 ? combineWhenAllUpdater :
		combineWhenAllUpdater;

	return stream.link(parents, stream(), updater, f);
}

function merge2Updater(firstParent, secondParent) {
	if (hasNewValue(firstParent)) {
		this.newValue = firstParent.newValue;
	}
	if (hasNewValue(secondParent)) {
		this.newValue = secondParent.newValue;
	}
}

function mergeUpdater() {
	// arguments === this.parents
	for (var i = 0, len = arguments.length; i < len; i++) {
		if (hasNewValue(arguments[i])) {
			this.newValue = arguments[i].newValue;
		}
	}
}

// stream.merge(Stream streams...) -> Stream
// TODO document
stream.merge = function merge() {
	var parents = copyArray(arguments);
	var updater = parents.length === 2 ? merge2Updater : mergeUpdater;
	return stream.link(parents, stream(), updater);
}

// Take n streams and make a stream of arrays from them that is updated
// whenever one of the source streams is updated.
//
// stream.zip(stream1, stream2, ...) -> Stream
//
// Example:
//
// var s1 = stream.fromValues(1, 2, 3);
// var s2 = stream.fromString('abc');
// stream.zip(s1, s2).forEach(function(x) { console.log(x); });
// // -> [ 1, 'a' ]; [ 2, 'b' ]; [ 3, 'c' ]
// 
// TODO better example?
//
stream.zip = function() {
	var args = copyArray(arguments);
	args.push(Array);
	return stream.combine.apply(null, args);
};

//
// A collection of useful functions.
//

stream.util = {};

// Identity function
//
// stream.util.identity(Object) -> Object
stream.util.identity = function identity(a) { return a; };

// Returns a function that maps value -> !f(value)
stream.util.not = function not(f) { return function(a) { return !f(a); } }

// Add two numbers.
//
// stream.util.plus(Number, Number) -> Number
//
// (Or you can use it for strings, too, if you're creative.)
stream.util.plus = function plus(a, b) { return a + b; };

// Return number increased by 1.
//
// stream.util.inc(Number) -> Number
stream.util.inc = function inc(a) { return a + 1; };

// Is number even?
//
// stream.util.isEven(Number) -> Boolean
stream.util.isEven = function isEven(a) { return !(a % 2); }

// Is number odd?
//
// stream.util.isOdd(Number) -> Boolean
stream.util.isOdd = function isOdd(a) { return !!(a % 2); }

//
// Utilities used by Transaction
//

// Find first element in array that satisfies test(element), or undefined
function find(array, test) {
	for (var i = 0, len = array.length; i < len; i++) {
		var item = array[i];
		if (test(item)) {
			return item;
		}
	}
}

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

function deferTimeout(f) {
	var timeout = setTimeout(f);
	return function() {
		clearTimeout(timeout);
	};
}

// Do 'f' at a later time. Return a function that can be called to
// cancel the the deferred call.
var defer = typeof process !== 'undefined' && process.nextTick ? deferNextTick : deferTimeout;

//
// Transaction
//
// TODO documentation
//
function Transaction() {
	var that = this;
	if (stream.autoCommit) {
		this.cancel = defer(function() {
			that.commit();
		});
	}
	this.actions = [];
}

function UpdateAction(stream, value) {
	this.stream = stream;
	this.value = value;
}

// Perform by convention returns true if this action resulted in a
// direct update action (i.e. stream.newValue was set).
UpdateAction.prototype.preUpdate = function preUpdate() {
	if (this.stream.ended()) {
		throw new Error('cannot update ended stream');
	}
	this.stream.newValue = this.value;
	return true;
};

UpdateAction.prototype.postUpdate = nop;

UpdateAction.prototype.toString = UpdateAction.prototype.inspect = function() {
	return 'update(s' + this.stream.id + ', ' + this.value + ')';
};

function EndAction(stream) {
	this.stream = stream;
}

EndAction.prototype.preUpdate = function preUpdate() {
	var s = this.stream;
	// This 'update()', unlike all others, will take effect
	// during the same tick as this EndAction, and it will
	// push a new action to the action queue.
	s.ends().update(mostRecentValue(s));

	// TODO dump parent-child relations, but only after
	// dependencies have been sought out
	// TODO dump listener relations but only after they have been called
	// with possibly the new value 
	// TODO who dumps the listeners from .ends() streams? should they
	// .end() as well
};

EndAction.prototype.postUpdate = function postUpdate() {
	this.stream.detachFromParents();
};

EndAction.prototype.toString = EndAction.prototype.inspect = function() {
	return 'end(s' + this.stream.id + ')';
};

Transaction.prototype.update = function(stream, value) {
	this.actions.push(new UpdateAction(stream, value));
};

Transaction.prototype.end = function(stream) {
	this.actions.push(new EndAction(stream));
};

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
	// TODO detect cyclical dependencies, eventually
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
		// This assumption is false if someone has update()d a node
		// that has parents.  We used to assume that, but it's no longer
		// true now that we have generators that can have parents and
		// be update()d at the same time.
//		parentCounts[node.id] = 0;
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
		// remove a node with 0 parents from graph
		// ideally take the one that should have come first in the
		// natural ordering
		// update children's parent counts
		// push it into nodesToUpdate
		var nodeKeys = Object.keys(parentCounts);
		if (nodeKeys.length === 0) {
			break;
		}

		var nodeKeyWithZeroParents = find(nodeKeys, function(nodeKey) {
			// Assert parentCounts[nodeKey] >= 0
			return parentCounts[nodeKey] === 0;
		});

		removeNode(nodeKeyWithZeroParents);
	}

	return nodesToUpdate;
}

// Needs to treat EndActions specially.
//
// ..., update(s, x), end(s), ...  should result in 
// ..., update(s, x), update(s.endStream, x), ...
//
// However
//
// ..., end(s), update(s, x), ... should be error
//
Transaction.prototype.commit = function() {
	stream.withinCommit = true;

	// Ensure that stream.ticks is always in the update queue.
	stream.ticks.update();

	try {
		if (this.cancel) {
			this.cancel();
		}

		var updatedStreams = {};
		var updatedStreamsOrdered = [];

		for (var i = 0; i < this.actions.length; i++) {
			var action = this.actions[i];

			if (action.preUpdate()) {
				var s = action.stream;
				if (!updatedStreams[s.id]) {
					updatedStreamsOrdered.push(s);
					updatedStreams[s.id] = true;
				}
			}
		}

		// This clears the transaction queue.
		// In practice, this means that actions resulting from updaters or
		// listeners will be scheduled to the next transaction.
		if (stream.tx === this) {
			delete stream.tx;
		}

		var streamsToUpdate = updateOrder(updatedStreamsOrdered);

		streamsToUpdate.forEach(function(s) {
			// Only update if at least one of the parents were updated.
			// OR if it's stream.ticks. Ugly special case?
			if (s.parents.some(hasNewValue) || s === stream.ticks) {
				s.updater.apply(s, s.parents);
			}
		});

		streamsToUpdate.forEach(function(s) {
			// Only broadcast the new value if this stream was updated,
			// and delete s.newValue while we're at it; it's no longer
			// needed.
			if (hasNewValue(s)) {
				s.value = s.newValue;
				delete s.newValue;
				s.broadcast();
			}
		});

		for (var i = 0; i < this.actions.length; i++) {
			var action = this.actions[i];
			action.postUpdate();
		}

	} finally {
		// In case of emergency, dump the whole transaction queue
		if (stream.tx === this) {
			delete stream.tx;
		}
		stream.withinCommit = false;
	}
};

