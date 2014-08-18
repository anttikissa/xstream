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
// for the string "fromArray =".
//
// Likewise for Stream's methods, which are defined using the syntax
//
//    Stream.prototype.<methodName> = function() { ... };
//
// By convention, when speaking of a Stream's method, the '.prototype' part
// is omitted and we just speak about Stream.map, Stream.filter, etc.
//
//
// This file is divided into chapters:
//
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
// Enjoy!
//

//
// Chapter 1 - Internal utilities
//
// General utility functions, used internally for miscellaneous purposes.
// Feel free to skip to the next chapter.
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

// Make a shallow copy of an array or an array-like object.
function copyArray(args) {
	return Array.prototype.slice.apply(args);
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

// Find first element in array that satisfies test(element), or undefined
function find(array, test) {
	for (var i = 0, len = array.length; i < len; i++) {
		var item = array[i];
		if (test(item)) {
			return item;
		}
	}
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



//
// Chapter 2 - Stream() and stream()
//
// This chapter introduces the Stream() constructor, and its little sister,
// stream().
//

//
// new Stream(optional Object initial) -> Stream: Create a Stream.
//
// initial: if defined, updates stream with that value during
// the next tick.
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
// Function updater: a function that is called after either this.set() has
//     been called, or one of this stream's parents is updated.  See
//     Stream.set() for a detailed description of updater's semantics.
// optional Object state: some, but not all, streams have a state, and
//     this is where it lives.  See for example Stream.take(n)
//
// Streams are usually created by calling 'stream()', which calls
// this constructor.
//
function Stream(initial) {
	this.id = Stream.nextId++;
	this.value = undefined;
	this.parents = [];
	this.children = [];
	this.listeners = [];
	this.updater = nop;

	if (initial !== undefined) {
		this.set(initial);
	}
};

// Counter for getting the next stream id.
Stream.nextId = 0;

// stream(Object initial) -> Stream: Create a Stream.
//
// 'stream' is the main entry point to the library.  It's a function that
// serves two purposes: first as a shorthand for calling 'new Stream()',
// and secondly as a namespace for all kinds of functions that don't
// naturally fit into Stream.prototype.
//
// stream.link
// stream.combine
// stream.fromArray (etc)
function stream(initial) {
	return new Stream(initial);
};

// CommonJS entry point for the module.
module.exports = stream;

// Expose Stream as part of stream.
stream.Stream = Stream;



//
// Chapter 3 - Stream general methods
//

// Stream.withInitialValue(Object value) -> Stream: Initialize my .value.
//
// Sets the initial value of a stream to a given value 'silently',
// without broadcasting it.  Useful when you need to need a value to end
// with when the parent stream ends without yielding any values.
//
// Return this.
Stream.prototype.withInitialValue = function(value) {
	this.value = value;
	return this;
};

// Stream.withState(Object state) -> Stream: Initialize my .state.
//
// Return this.
Stream.prototype.withState = function withState(state) {
	this.state = state;
	return this;
};

// Stream.forEach(Function f) -> Stream: Install .forEach listener.
//
// On every tick, if this stream has been updated, call f with the new
// value. 'this' is set to this stream.
//
// So far, there's no way to uninstall listeners.  But .end() should
// do the trick.
//
// Return this.
Stream.prototype.forEach = function forEach(f) {
	this.listeners.push(f);
	return this;
};

// Stream.broadcast(): Tell my listeners that my value has been updated.
//
// Called by stream.tick() after all updaters have been called.
// For internal use (mostly).
Stream.prototype.broadcast = function() {
	for (var i = 0, len = this.listeners.length; i < len; i++) {
		this.listeners[i].call(this, this.value);
	}
};

// Stream.pull() -> Stream: Pull my value from parents, now.
//
// Useful for streams generated by stream.combine(), if you don't want to wait for
// any of the parent streams to update.
//
// Note that because this does not do the full transaction choreography,
// this will not go further than to the first ancestors.  If you say,
// for example,
//
//     s.rewire(stream.combine(a, b, f(x, y) { ... }));
//     s.pull();
//
// then s.pull() won't have any effect because the direct parent stream
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
		this.set(this.newValue);
		delete this.newValue;
	}
	return this;
};

// Stream.name(String name) -> Stream: Give this stream a name (for debugging).
//
// Return this.
Stream.prototype.name = function(name) {
	this._name = name;
	return this;
}

// Stream.log() -> Stream: Log my values.
// Stream.log(String prefix) -> Stream: Log my values, predeced by 'prefix'.
//
// Return this.
Stream.prototype.log = function(prefix) {
	return this.forEach(prefix ? function(value) {
		console.log(prefix, value);
	} : function(value) {
		console.log(value);
	});
}

// Stream.toString() -> String: Convert into a descriptive string.
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
//	function showListeners(name, listeners) {
//		show(name, '[' + listeners.map(function(f) { return f.toString(); }).join(', ') + ']');
//	}
	show('value', this.value);
	show('name', this._name);
	show('newValue', this.newValue);
	show('state', JSON.stringify(this.state));
	showStreams('parents', this.parents);
	showStreams('children', this.children);
//	showListeners('listeners', this.listeners);
	return result + ']';
};

// Stream.toString() -> String: Convert into a descriptive string.
//
// To make Streams look nice in the Node.js console.
Stream.prototype.inspect = function() {
	return this.toString();
};

// Stream.addChild(Stream child)
//
// Add a child-parent relationship to the parent end.
Stream.prototype.addChild = function(child) {
	this.children.push(child);
}

// Stream.removeChild(Stream child)
//
// Destroy a child-parent relationship from the parent end.
// If a stream has been added as a child multiple times (imagine
// 'stream.combine(x, x, f)'), this will only remove the first one.
Stream.prototype.removeChild = function(child) {
	assert(this.children.indexOf(child) !== -1);
	this.children.splice(this.children.indexOf(child), 1);
}

// Stream.link(Stream parent, Function updater, Function f = null) -> Stream
// Stream.link(Stream[] parents, Function updater, Function f = null) -> Stream
//
// Link this stream to one or more parent streams.
//
// link() initializes the dependency relationship between this stream and
// one or more dependencies ('parents').
//
// It's assumed that the stream has no parents when link() is called.
// (.unlink() this first if necessary.)
//
// Whenever a parent is updated within a transaction, 'this.updater()' will be
// called with the parents.  'updater' will only be called once per
// tick, and only after all of child's parents have been updated. The updater
// should set 'this.newValue' if it wants to update this stream's value, and
// otherwise do nothing.  The 'newValue' attribute of parent streams has
// been set for those parents that were updated during this tick.
//
// Return this.
Stream.prototype.link = function(parents, updater, f) {
	assert(this.parents.length === 0);

	if (parents instanceof Stream) {
		parents = [parents];
	}

	for (var i = 0, len = parents.length; i < len; i++) {
		parents[i].addChild(this);
	}

	this.parents = parents;
	this.updater = updater;
	this.f = f || null;

	return this;
};

// Obliterate parent-child relations between my and my parents.
Stream.prototype.unlink = function() {
	for (var i = 0, len = this.parents.length; i < len; i++) {
		this.parents[i].removeChild(this);
	}
	this.parents = [];
};

function SetAction(stream, value) {
	this.stream = stream;
	this.value = value;
}

SetAction.prototype.preUpdate = function() {
	if (this.stream.ended()) {
		throw new Error('cannot set ended stream\'s value');
	}
//	console.realLog('!!! preUpdate for stream with updater', this.stream.updater);
	this.stream.newValue = this.value;
	return true;
};

SetAction.prototype.postUpdate = nop;

SetAction.prototype.toString = SetAction.prototype.inspect = function() {
	return 'set(s' + this.stream.id + ', ' + this.value + ')';
};

// Stream.set(Object value) -> Stream: Set my value to 'value'.
//
// Return this.
Stream.prototype.set = function(value) {
	// TODO make it so that masterUpdater fails, too. It should be so that
	// only nop (or whatever source streams have as updaters) is allowed
	if (this.updater !== nop && this.updater !== masterUpdater) {
		console.realLog('this.updater', this.updater);
		throw new Error('fu');
	}
	stream.onNextTick(new SetAction(this, value));
	return this;
};

function RefreshAction(stream) {
	this.stream = stream;
}

RefreshAction.prototype.preUpdate = function() {
	return true;
};

RefreshAction.prototype.postUpdate = nop;

RefreshAction.prototype.toString = RefreshAction.prototype.inspect =
	function() {
		return 'refresh(s' + this.stream.id + ')';
	};

// Stream.set(Object value) -> Stream: Refresh my value.
//
// Return this.
Stream.prototype.refresh = function() {
	stream.onNextTick(new RefreshAction(this));
	return this;
}

// Stream.end() -> Stream: End this stream.
//
// End this stream, causing this.ends() to update with the most recent
// value of this stream.
//
// If end() is called outside commit phase, the .ends() stream will update
// during the next tick.  Calling set() on a stream after end() is called
// will result in error when the next transaction is committed.
//
// If end() is called in the commit phase (i.e. inside a .forEach handler),
// it will cancel the updates that were scheduled for this stream during the
// next tick.  It works this way so that automatic streams like .fromRange(0)
// can use .forEach() to schedule the next update, and we can use .end() within
// a .forEach handler to end them with the current value.
Stream.prototype.end = function() {
	stream.onNextTick(new EndAction(this));
	return this;
};

// Stream.ended() -> Boolean: Has the stream ended?
//
// I.e. is it safe to call .set() on this stream.
Stream.prototype.ended = function() {
	// TODO FIXME
	// enable spec/stream.pre: `end` should end the stream:
	// This is ugly, and not even correct. (If stream ends without
	// ever yielding a value, end() will be updated with undefined and
	// this will return the wrong result.)
	return !!this.endStream && mostRecentValue(this.endStream) !== undefined;
};

// stream.CyclicalDependencyError(Stream[] path)
//
// A cycle was found when modifying stream dependencies.
// Property 'path' contains an array of streams that form the cycle.
function CyclicalDependencyError(path) {
	Error.call(this, 'Cyclical dependency');
	this.path = path;
}

stream.CyclicalDependencyError = CyclicalDependencyError;

// Stream.ensureNoCyclicalDependencies()
//
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

// Updater function for Stream.rewire().
function rewireUpdater(parent) {
	this.newValue = parent.newValue;
}

// Stream.rewire(Stream parent) -> Stream
//
// Unlink 'this' from its old parents and follow 'parent' instead.
// Downward dependencies still work: all .forEach() listeners and children
// streams of 'this' get their values from the new parent.
//
// Return this.
Stream.prototype.rewire = function(newParent) {
	this.unlink();

	// TODO wrap in try-catch-rewire-to-stream()-rethrow?
	return this.link(newParent, rewireUpdater).ensureNoCyclicalDependencies().linkEnds(newParent);
};

// Update value from the most recent value of the master.
//
// Makes use of 'master' that has been set in '.ends()'.
function masterUpdater() {
	this.newValue = mostRecentValue(this.master);
}

// Utility function for linking the .ends() streams.
//
// When 'parent' ends, end 'this' as well, taking the end value
// from 'this.master'.
Stream.prototype.linkEnds = function(parent) {
	this.ends().unlink();
	this.ends().link(parent.ends(), masterUpdater);
	return this;
};

// Stream.tick(): tick once.
// Stream.tick(Number times): tick 'times' times.
//
// var s = stream(1).tick();
Stream.prototype.tick = function(times) {
	stream.tick(times);
	return this;
};

// Stream.ends() -> Stream
//
// Return a stream that represents the end events of this stream.
// When this stream ends, the .ends() stream will yield a single
// value.
//
// .ends()
//
// The end streams never end, because
// 1) what's the use?
// 2) no worrying about ends() of ends() of ends()
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

// Stream.onEnd(Function f) -> Stream: Install end listener.
//
// A shorthand for listening to .ends() stream.  'f(finalValue)' will be
// called with when this.ends() yields a value, with 'this' set to the
// master stream.
//
// TODO endWhen, endWhenOne, endWhenAll
// for combine and merge, respectively
// or are all just special cases?
//
// Return this.
Stream.prototype.onEnd = function(f) {
	this.ends().forEach(f.bind(this));
	return this;
};

// Stream.endWhen(): End stream when it yields 'value'.
//
// Return this.
Stream.prototype.endWhen = function(value) {
	this.forEach(function(v) {
		if (v === value) {
			this.end();
		}
	});
	return this;
};



//
// Chapter 4 - Stream operators
//
// This chapter introduces operators that create a Stream out of another
// Stream.  They are installed as Stream's methods for chaining convenience:
//
// var randomNumbers = Stream.sample(Math.random).interval(100);
// randomNumbers
//     .filter(function(value) { return value > 0.5; })
//     .map(function(value) { return 10 * value; }
//     .log('value');
//
// Core operators that operate on a stream's values alone include:
//
//    map, filter, uniq, take, skip, leave, slidingWindow
//
// Operators that use the global time in addition to the stream:
// TODO
//
//    delay, throttle, debounce, etc.
//

// Updater function for Stream.map().
function mapUpdater(parent) {
	this.newValue = this.f(parent.newValue);
}

// Return a stream whose value is updated with 'f(x)' whenever this
// stream's value is updated with 'x'.
//
// var s2 = s1.map(function(value) { return value + 1; });
//
// s1: 1 1 2 2 5 6 6
// s2: 2 2 3 3 6 7 7
//
// TODO if .combine() should pull its value, .map() should, too.
// Perhaps .filter() as well.
Stream.prototype.map = function(f) {
	return stream().link(this, mapUpdater, f).linkEnds(this);
};

// Updater function for Stream.filter().
function filterUpdater(parent) {
	if (this.f(parent.newValue)) {
		this.newValue = parent.newValue;
	}
}

// Return a stream whose value is updated with 'x' whenever this
// stream's value is updated with 'x', if 'f(x)' is true.
//
// var s2 = s1.filter(isOdd);
//
// s1: 1 1 2 2 5 6 6
// s2: 1 1     5
Stream.prototype.filter = function(f) {
	return stream().link(this, filterUpdater, f);
};

// Updater function for Stream.uniq().
function uniqUpdater(parent) {
	if (this.value !== parent.newValue) {
		this.newValue = parent.newValue;
	}
}

// Return a stream that follows its parent's values, but only updates
// when the value changes.  Similar to the UNIX tool uniq(1).
//
// TODO use custom equals function
//
// var s2 = s1.uniq()
//
// s1: 1 1 2 2 5 6 6
// s2: 1   2   5 6
Stream.prototype.uniq = function() {
	return stream().link(this, uniqUpdater);
};

// Updater function for Stream.take().
function takeUpdater(parent) {
	if (this.state-- <= 0) {
		return this.end();
	}
	this.newValue = parent.newValue;
}

// Return a stream that yields 'n' first elements of its parent stream,
// then ends.
Stream.prototype.take = function(n) {
	return stream().withState(n).link(this, takeUpdater).linkEnds(this);
};

// Updater function for Stream.skip().
function skipUpdater(parent) {
	if (this.state > 0) {
		this.state--;
		return;
	}
	this.newValue = parent.newValue;
}

// Return a stream that skips the 'n' first elements, then follows the
// parent stream.
Stream.prototype.skip = function(n) {
	return stream().withState(n).link(this, skipUpdater).linkEnds(this);
};

// A stream that waits until the parent stream has ended, then yields
// the last 'n' elements.
Stream.prototype.leave = function(n) {
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

// Updater function for Stream.slidingWindow().
function slidingWindowUpdater(parent) {
	this.newValue = this.value.concat(parent.newValue);
	while (this.newValue.length > this.state) {
		this.newValue.shift();
	}
};

// Return a stream that updates with an array of at most 'n' most recent
// values of its parent.
//
// var s2 = s1.slidingWindow(3);
//
// s1: 1   1       2          2        5         6         6
// s2: [1] [1, 1]  [1, 1, 2] [1, 2, 2] [2, 2, 5] [2, 5, 6] [5, 6, 6]
Stream.prototype.slidingWindow = function(n) {
	return stream().withState(n).withInitialValue([])
		.link(this, slidingWindowUpdater).linkEnds(this);
};

// Return a stream that skips 'start' elements, then follows its parent
// until (but not including) the 'end'th element.
//
// Similar to Array.slice(start, end), but slice(-n) doesn't do what
// it does on an array.  Use 'leave(n)' for that.
Stream.prototype.slice = function(start, end) {
	if (end === undefined) {
		return this.skip(start);
	}
	return this.skip(start).take(end - start);
}

// Updater function for Stream.reduce().
function reduceUpdater(parent) {
	if (this.value !== undefined) {
		this.newValue = this.f(this.value, parent.newValue);
	} else {
		this.newValue = parent.newValue;
	}
}

// Return a reduced stream, whose value represents the values of
// the parent stream, 'boiled down' by function 'f'.  The first value of
// the resulting stream is the same as the next value of 'this', or
// if 'initial' is provided, 'f(initial, next value of this)'.
//
// If the parent stream ends without giving any values, end with 'initial'.
//
// Function f: accumulator function. f(accumulator, value) should return
//     the next value of the accumulator.
//
// Like Array.prototype.reduce, but provides a view to the reduction
// process in realtime.
//
// var s2 = s1.reduce(function(sum, value) { return sum + value; });
//
// s1: 1 1 2 2  5  6  6
// s2: 1 2 4 6 11 17 23
//
// For an example that uses 'initial', see implementation of
// Stream.collect() below.
Stream.prototype.reduce = function(f, initial) {
	return stream().withInitialValue(initial).link(this, reduceUpdater, f)
		.linkEnds(this);
};

// Return a stream that collects all values of a stream into an array.
//
// var s2 = s1.collect();
//
// s1: 1   1      2         2
// s2: [1] [1, 2] [1, 1, 2] [1, 1, 2, 2]
Stream.prototype.collect = function() {
	return this.reduce(function(array, x) {
		return array.concat(x);
	}, []);
};



//
// Chapter 5 - stream general functions
//
// Methods and variables installed directly to 'stream'.
//
// Mostly for internal use.
//
// Plus 'tick()'.
//

// stream.ticks is a special stream that is updated automatically on every
// tick.
//
// It's useful for writing generators, which are streams that are
// updated on every tick.  For now, though, you have to call .set() on
// it in order to trigger updates on the dependent streams, to avoid
// stream.ticks() just ticking forever.
//
// TODO there should be a better solution to make streams stop after they
// have ticked without any listeners for a while.  Should there?
stream.ticks = stream().withState(0);
stream.ticks.updater = function() {
	this.newValue = this.state++;
};

// Update and end actions are collected into stream.actionQueue, which
// is then handled by stream.tick().
stream.actionQueue = [];

// Schedule 'action' to be performed on the next tick, and ensure that
// the next tick happens.
stream.onNextTick = function(action) {
	stream.actionQueue.push(action);

	// Schedule a tick, if one is not already scheduled.
	if (!this.cancelDeferredTick) {
		var that = this;
		this.cancelDeferredTick = defer(function() {
			that.tick();
		});
	}
};

function EndAction(stream) {
	this.stream = stream;
}

EndAction.prototype.preUpdate = function preUpdate() {
	var s = this.stream;
//	s.ends().refresh();
	s.ends().set(mostRecentValue(s));

	// TODO who dumps the listeners from .ends() streams? should they
	// .end() as well
};

EndAction.prototype.postUpdate = function postUpdate() {
	this.stream.unlink();
	this.stream.listeners = [];
};

EndAction.prototype.toString = EndAction.prototype.inspect = function() {
	return 'end(s' + this.stream.id + ')';
};

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

//
// A word about ticks, updates, ends, and so.
// How do ticks happen?
//
// TODO clean up the following, it's collected from multiple sources and the
// same thing is said twice.
//
// Updates happen in ticks.  Ticks are triggered by calling the .set()
// method of any stream.  During one tick, one stream can update at most once.
//
// - Calling .set() doesn't take effect immediately, but will take
//   effect eventually (using process.nextTick(), setImmediate(),
//   setTimeout(..., 1) or similar mechanism)
// - Parents' updaters are called before their children's updaters
// - Update handlers are run exactly once for every updated stream
// - All streams are guaranteed to be updated when .forEach() handlers are
//   called, so the world looks consistent to them.
//
// The updater should either set this stream's .newValue property (which
// updates the value of this stream), or do nothing.  A parent stream's
// .newValue has been set if and only if it has been updated during this tick.
// Updaters can also use the helper functions hasValue(Stream),
// hasNewValue(Stream), and mostRecentValue(Stream) to access the parents'
// value within the transaction.
//

// tick(): Actual implementation of stream.tick().
function tick() {
	// Ensure that stream.ticks is always in the update queue.
	// TODO maybe make this refresh
	stream.ticks.refresh();

	try {
		if (stream.cancelDeferredTick) {
			stream.cancelDeferredTick();
			delete stream.cancelDeferredTick;
		}

		var updatedStreams = {};
		var updatedStreamsOrdered = [];

		var actionQueue = stream.actionQueue;

		// We don't cache stream.actionQueue: .preUpdate() phase can schedule
		// new actions, which causes stream.actionQueue to grow while we're
		// iterating it.
		for (var i = 0; i < actionQueue.length; i++) {
			var action = actionQueue[i];

			var result = action.preUpdate();

			// This is... odd.
			if (result) {
				var s = action.stream;
				if (!updatedStreams[s.id]) {
					updatedStreamsOrdered.push(s);
					updatedStreams[s.id] = true;
				}
			}
		}

	} finally {
		// Clear the actionQueue
		stream.actionQueue = [];
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

	for (var i = 0, len = actionQueue.length; i < len; i++) {
		var action = actionQueue[i];
		action.postUpdate();
	}

};

// stream.tick(): Tick once.
// stream.tick(Number n): Tick n times.
stream.tick = function(times) {
	if (times === undefined)
		times = 1;

	while (times--) {
		tick();
	}
}


//
// Chapter 6 - stream combinators
//
// Operators that combine multiple streams live in the 'stream'
// namespace and are called combinators.  They include:
//
// merge, combine,
//
// TODO sampledBy, takeUntil,
// TODO where to put .concatAll, .mergeAll, .followLatest, .mergeFirst, etc.?
//

function combine2Updater(firstParent, secondParent) {
	this.newValue = this.f(
		mostRecentValue(firstParent),
		mostRecentValue(secondParent));
}

// TODO is this necessary?
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

// stream.combine(Stream streams..., f) -> Stream
// TODO link .ends()
// TODO document
stream.combine = function combine() {
	var parents = copyArray(arguments);
	var f = parents.pop();
	var updater =
		parents.length === 2 ? combine2Updater :
		parents.length === 3 ? combine3Updater :
		combineUpdater;

	return stream().link(parents, updater, f);
}

function combineWhenAll2Updater(firstParent, secondParent) {
	if (hasValue(firstParent) && hasValue(secondParent)) {
		this.newValue = this.f(
			mostRecentValue(firstParent),
			mostRecentValue(secondParent));
	}
}

// TODO is this necessary?
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

// TODO link .ends()
stream.combineWhenAll = function combineWhenAll() {
	var parents = copyArray(arguments);
	var f = parents.pop();
	var updater =
		parents.length === 2 ? combineWhenAll2Updater :
		parents.length === 3 ? combineWhenAll3Updater :
		combineWhenAllUpdater;

	return stream().link(parents, updater, f);
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

// stream.merge(Stream streams...) -> Stream: Merge multiple streams.
//
// Return a stream the updates whenever one of its parent streams update.
//
// If two or more parent streams are updated during the same tick, the
// one that comes last in the argument list will take effect. (Note that
// the order in which the set()s are scheduled doesn't matter.)
//
// var s3 = stream.merge(s1, s2);
//
// s1: 1   1   2   2    5     6    6
// s2:   a   b   c      d   e   f
// s3: 1 a 1 b 2 c 2    d   d 6 f  6
stream.merge = function merge() {
	var parents = copyArray(arguments);
	var updater =
		parents.length === 2 ? merge2Updater :
		mergeUpdater;
	return stream().link(parents, updater);
}

// stream.zip(Stream streams...-> Stream
//
// Return a stream of arrays of parent streams' values.
// The stream will be updated whenever one of parent streams updates.
//
// var s3 = stream.zip(s1, s2);
//
// s1: 1                     1             2
// s2:                a             b      c
// s3: [1, undefined] [1, a] [1, a] [1, b] [2, c]
stream.zip = function() {
	var args = copyArray(arguments);
	args.push(Array);
	return stream.combine.apply(null, args);
};

//
// Chapter 7 - Metastream operators
//
// Metastreams are streams whose values are streams.
//
// Sounds more complex than it is. Example:
//
// TODO
//
// Then explain the whole duality. parallel/series
//

//
// Chapter 8 - Generators
//
// Generators are streams that produce values until they end.  After yielding
// a value, a generator automatically schedules the next tick (unless it has
// ended).
//
// I'm not totally sold on this concept, but it seems interesting and there
// might be some interesting use cases for these.
//


// Updater function for stream.for().
function forUpdater() {
	if (this.ended()) {
		return;
	}

	this.newValue = this.f();

	if (this.ended()) {
		return this.end();
	}

	stream.ticks.refresh();
}

// Stream.for(Object initialState, Function condition, Function f) -> Stream
//
// Return a generic generator stream.
//
// initialState: Resulting stream's .state will be set to this.
// condition: Keep running as long as this function returns a truthy value.
// f: Produce the next value and update this.state.
//
// 'for' is used like a for loop, except that 'f' is responsible
// for both updating the internal state and producing a
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
	var result = stream().withState(initialState).link(
		stream.ticks,
		forUpdater,
		f);

	if (condition) {
		// TODO VERY unclean. Goes against all principles of
		// transparency ('ended' can't be retrieved from the resulting
		// object directly), duplicates code, etc.
		// Get rid of this hack!
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
		result.refresh();
	}

	return result;
};

// Loop is like 'for' except it never ends (unless .end() is called
// explicitly).
stream.loop = function loop(initialState, f) {
	return stream.for(initialState, alwaysTrue, f);
};

// stream.count(Number initial) -> Stream: Count numbers from 'initial'.
//
// Functionally identical .fromRange(initial), but more like an example
// of how to use 'loop'.
stream.count = function(initial) {
	return stream.loop(initial || 0, function() { return this.state++; });
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
		});
}

// Make a stream from a list of values.
//
// stream.fromArray(Object...) -> Stream
//
// stream.fromValues(1,2,3) is equal to stream.fromArray([1,2,3]).
stream.fromValues = function fromValues() {
	return stream.fromArray.call(stream, arguments);
};

// stream.fromString(String string) -> Stream
//
// Return a generator that produces all characters in 'string', then ends.
//
// stream.fromString('abc') is equal to stream.fromArray('a', 'b', 'c').
stream.fromString = function fromString(string) {
	return stream.fromArray(string.split(''));
};

// Make a generator stream out of pretty much anything.
//
// stream.from(String) -> Stream: Delegate to stream.fromString()
// stream.from([Object]) -> Stream: Delegate to stream.fromArray()
// stream.from(Object...) -> Stream: Delegate to stream.fromValues()
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


//
// Chapter 9 - Utilities (stream.util)
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
