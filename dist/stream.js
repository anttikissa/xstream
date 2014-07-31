var module = {};
(function(module) {
// TODO to make code shorter, consider:
//
// extract pattern
//   if (some[thing]) {
//	 some[thing].push(value);
//   } else {
//	 some[thing] = [value];
//   }
//
// into a function and call it like 
// some[thing] = push(some[thing], value);
//

//
// General utility functions
//

// Identical to console.log but shorter to write
var log = console.log.bind(console);
//var log = function() {};

// Convert argument-like object to array
function toArray(args) {
	return Array.prototype.slice.apply(args);
}

// ".key" -> function that returns .key
function access(selector) {
	if (selector[0] !== '.') {
		throw new Error('invalid', selector);
	}
	var key = selector.slice(1);
	return function(o) { return o[key]; };
}

function Stream(initial) {
	this.id = stream.nextId++;
	this.parents = []; // streams I depend on
	this.children = []; // streams that depend on me
	this.listeners = []; // listeners that get my value when it updates
	this.value = undefined;
	this.updater = function() {};
	this.f = null;

	if (initial !== undefined) {
		this.update(initial);
	}
};

// Set the initial value of a stream to a given value 'silently',
// without broadcasting it.
//
// Return this.
Stream.prototype.withInitialValue = function withInitialValue(value) {
	this.value = value;
	return this;
};

// Tell my listeners that my value has been updated.
Stream.prototype.broadcast = function broadcast() {
	for (var i = 0, len = this.listeners.length; i < len; i++) {
		this.listeners[i].call(this, this.value);
	}
};

// Call f whenever my value has been updated.
// 
// `this` will be set to the object.
Stream.prototype.forEach = function forEach(f) {
	this.listeners.push(f);
	return this;
};

// Update my value to `value`.
//
// The value of this stream and the values of streams depending on it
// will be updated during this tick.
//
// `.forEach` listeners for the updated streams will be called at the
// end of this tick.
Stream.prototype.update = function update(value) {
	var tx = stream.transaction();
	tx.set(this, value);
	return this;
};

// Deprecated name for `update`. For test compatibility.
Stream.prototype.set = function set(value) {
	return this.update(value);
};

function mapUpdater(parent) {
	this.newValue = this.f(parent.newValue);
}

// Returns a stream whose value is updated with `f(x)` whenever this
// stream's value is updated with `x`.
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
	var result = stream();
	stream.link(this, result, mapUpdater, f);
	// one way to do it:
	//stream.link(this.ends(), result.ends(), mapUpdater, f);
	// but this is exactly the same as with .reduce()
	stream.link(this.ends(), result.ends(), function() {
		this.newValue = mostRecentValue(this.master);
	});
	return result;
};

function filterUpdater(parent) {
	if (this.f(parent.newValue)) {
		this.newValue = parent.newValue;
	}
}

// Returns a stream whose value is updated with `x` whenever this 
// stream's value is updated with `x`, if `f(x)` is true.
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

function reduceUpdater(parent) {
	if (this.value !== undefined) {
		this.newValue = this.f(this.value, parent.newValue);
	} else {
		this.newValue = parent.newValue;
	}
}

// Returns a reduced stream, whose value represents the values of
// this stream, 'boiled down' by function `f`.  The first value of
// the resulting stream is the same as the next value of `this`, or
// if `initial` is provided, `f(initial, next value of this)`.
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
// TODO example with `initial`
Stream.prototype.reduce = function reduce(f, initial) {
	var result = stream().withInitialValue(initial);
	stream.link(this, result, reduceUpdater, f);
	stream.link(this.ends(), result.ends(), function() {
		this.newValue = mostRecentValue(result);
	});

	return result;
};

// Collect all values of a stream into an array
Stream.prototype.collect = function collect() {
	return this.reduce(function(array, x) {
		return array.concat(x);
	}, []);
};

function rewireUpdater(parent) {
	this.newValue = parent.newValue;
}

// rewire: (Stream parent) -> Stream
//
// Unlink `this` from its old parents.
//
// Add a dependency from `parent` to `child`
// Remove old dependencies
//
Stream.prototype.rewire = function rewire(newParent) {
	for (var i = 0, len = this.parents.length; i < len; i++) {
		var parent = this.parents[i];
		// TODO move into .remove()
		parent.children.splice(parent.children.indexOf(this));
	}
	return stream.link(newParent, this, rewireUpdater);
};

//
// Debugging support
//
Stream.prototype.toString = function toString() {
	var result = '[Stream s' + this.id;
	function show(name, value) {
		if (value !== undefined) {
			result += ', ' + name + ': ' + value;
		}
	}
	function showStreams(name, streams) {
		show(name, '[' + streams.map(function(s) { return 's' + s.id; }).join(', ') + ']');
	}
	show('value', this.value);
	show('newValue', this.newValue);
	show('state', JSON.stringify(this.state));
	showStreams('parents', this.parents);
	showStreams('children', this.children);
	return result + ']';
};

// For node.js console
Stream.prototype.inspect = function inspect() {
	return this.toString();
};

// A shorthand, to enable:
//
// var s = stream(1).commit();
Stream.prototype.commit = function commit() {
	stream.transaction().commit();
	return this;
};

// TODO there are more than one smells to this one
// - name: it's not canceling the whole transaction, only the ops that
// target this stream
// - it's touching Transaction's internals directly
// - still it's a valid way to .end() a stream that has transactions 
// in the transaction queue
// - maybe a cleaner way would be to mark them as .ended or something
Stream.prototype.cancelTransactions = function cancelTransactions() {
	var tx = stream.transaction();
	var that = this;
	tx.ops = tx.ops.filter(function(op) {
		return op[0] !== that;
	});
};


// Update function. For regular streams, this is a no-op.
Stream.prototype.f = function fNoOp() {
};

Stream.prototype.ends = function ends() {
	if (!this.endStream) {
		this.endStream = stream();
		this.endStream.master = this;
	}
	return this.endStream;
};

// Updater function that is usually used with .ends() streams.
// Update value from the most recent value of the master.
function masterUpdater() {
	this.newValue = mostRecentValue(this.master);
}

Stream.prototype.end = function end() {
	// TODO should probably cut ties to parents to enable GC
	// TODO how about children?
	// when end() is part of a transaction 
	// var s = stream();
	// s.onEnd(log);
	// s.set(1);
	// s.end();
	// -> should print 1
	if (this.endStream) {
		// TODO within a transaction?
		this.endStream.set(this.value);
	}

	this.cancelTransactions();
	// TODO make in a transaction
//	this.listeners = [];
//	do something with listeners, children/parents, etc.?
};

// TODO endWhen, endWhenOne, endWhenAll
// for combine and merge, respectively
// or are all just special cases?

// Shorthand
Stream.prototype.onEnd = function onEnd(f) {
	this.ends().forEach(f);
};

//
// The visible part of the library is the `stream` function,
// which creates a stream.
//
var stream = function stream(initial) {
	return new Stream(initial);
};

// All streams have an `id`, starting from 1.
// Debug functions refer to them as 's1', 's2', and so on.
stream.nextId = 1;

// Get the current transaction or create one.
stream.transaction = function transaction() {
	return stream.tx || (stream.tx = new Transaction());
};

// TODO there are more than one smells to this one
// - name: it's not canceling the whole transaction, only the ops that
// target this stream
// - it's touching Transaction's internals directly
stream.prototype.cancelTransactions = function cancelTransactions() {
	var tx = stream.transaction();
	var that = this;
	log('cancel', this);
	log('trans', tx.ops);
	tx.ops = tx.ops.filter(function(op) {
		return op[0] !== that;
	});
	log('trans after', tx.ops);
};

// Commit the current transaction.
stream.tick = function tick() {
	stream.transaction().commit();
}

// Make a stream out of pretty much anything.
//
// stream.from(String) -> Stream
// stream.from([Object]) -> Stream
// stream.from(Object...) -> Stream
stream.from = function from(first) {
	if (typeof first === 'string') {
		return stream.fromString(first);
	}
	if (first instanceof Array) {
		return stream.fromArray(first);
	}
	// TODO promises, callbacks, generators, etc.
	// Fall back to `.fromValues`.
	return stream.fromValues.apply(stream, arguments);
}

// Make a stream from an array.
//
// stream.fromArray([Object]) -> Stream
//
// Set the the first value in the current transaction and the following
// values in following transactions.
stream.fromArray = function fromArray(array) {
	var result = stream();
	result.rest = array.slice();

	result.next = function next() {
		if (this.rest.length) {
			this.update(this.rest.shift());
		} else {
			this.end();
		}
		return this;
	}

	result.next();

	return result.forEach(result.next);
};

stream.fromRange = function fromRange(start, end, step) {
	var result = stream();
	result.state = {
		current: start,
		end: end || Infinity,
		step: step || 1
	};

	result.next = function next() {
		var state = this.state;
		state.current += state.step;
		if (state.current <= state.end) {
			this.update(state.current);
		} else {
			this.end();
		}
	};

	result.update(start);

	return result.forEach(result.next);
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
// Establish a dependency relationship a between a stream (`child`) and
// one or more dependencies (`parents`).
//
// Set child.parents to parents, child.updater to updater, and child.f
// to f.
//
// Whenever a parent is updated within a transaction, `updater` will be
// called with `child` as `this`.  `updater` will only be called once
// per transaction, and only after all of child's parents have been
// updated.
//
// It should set `this.newValue` if it wants to update `child`'s value,
// and otherwise do nothing.  The `newValue` attribute of parent streams
// has been set for those parents that were updated during this tick. 
//
// Return child.
stream.link = function link(parents, child, updater, f) {
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

// stream.combine(Stream streams..., f) -> Stream
// TODO document
stream.combine = function combine() {
	var parents = toArray(arguments);
	var f = parents.pop();
	var updater = parents.length === 2 ? combine2Updater :
		parents.length === 3 ? combine3Updater :
		combineUpdater;

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
	var parents = toArray(arguments);
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
	var args = toArray(arguments);
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
// Debugging utilities
//

// Log arguments using console.log
//
// stream.util.log(Object arguments...) -> undefined
//
// Like `console.log`, but can be passed around without context.
stream.util.log = console.log.bind(console);

// Return a logger function that prefixes its arguments with `prefix`.
//
// stream.util.log(String prefix) -> (function(Object arguments) -> undefined)
//
// Example:
//
// logPrefix('[module x]')('hello', 1, 2, 3);
// // -> [module x] hello 1 2 3
stream.util.logPrefix = function logPrefix(prefix) {
	return function() {
		var args = toArray(arguments);
		args.unshift(prefix);
		console.log.apply(console, args);
	};
};





//
// Utilities used by Transaction
//

// Return array of keys in object
// IE8 needs this
function keys(o) {
	if (Object.keys) {
		return Object.keys(o);
	}
	var keys = [];
	for (var key in o) {
		if (o.hasOwnProperty(key)) {
			keys.push(key);
		}
	}
	return keys;
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

// Do `f` at a later time. Return a function that can be called to
// cancel the the deferred call.
var defer = typeof process !== 'undefined' && process.nextTick ? deferNextTick : deferTimeout;

//
// Transaction
//
// TODO documentation
//
function Transaction() {
	var that = this;
	this.cancel = defer(function() {
		that.commit();
	});
	this.ops = [];
}

Transaction.prototype.set = function(stream, value) {
	this.ops.push([stream, value]);
}

// Given an array of streams to update, create a graph of those streams
// and their dependencies and return a topological ordering of that graph 
// where parents come before their children.
//
// nodes: array of Streams
//
// The algorithm assumes that `nodes` only contains a single instance of
// each stream.
//
// TODO clarify the order in which the updates happen.
// Should we start updating from the nodes that come first?
//
function updateOrder(nodes) {
	parentCounts = {};
	allNodes = {};
	nodesToUpdate = [];

	// Find all nodes reachable from `node`
	// and record into `parentCounts` the amount of incoming edges
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
		parentCounts[node.id] = 0;
		findNodesToUpdate(node);
	});

	function removeNode(nodeKey) {
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
		var nodeKeys = keys(parentCounts);
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

Transaction.prototype.commit = function() {
	if (this.cancel) {
		this.cancel();
	}

	if (stream.tx === this) {
		delete stream.tx;
	}

	var updatedStreams = {};
	var updatedStreamsOrdered = [];

//	log('commit [' + this.ops.map(function(op) {
//		return 'set ' + op[0] + ' to ' + op[1];
//	}).join(', ') + ']');

	for (var i = 0, opsLen = this.ops.length; i < opsLen; i++) {
		var op = this.ops[i];
		var s = op[0];

		s.newValue = op[1];
		if (!updatedStreams[s.id]) {
			updatedStreamsOrdered.push(s);
			updatedStreams[s.id] = true;
		}
	}

	var streamsToUpdate = updateOrder(updatedStreamsOrdered);
	
	streamsToUpdate.forEach(function(s) {
		s.updater.apply(s, s.parents);
	});

	// I wonder if these could be done in the same .forEach()
	streamsToUpdate.forEach(function(s) {
		if (hasNewValue(s)) {
			s.value = s.newValue;
			delete s.newValue;
			s.broadcast();
		}
	});
};

module.exports = stream;
})(module); var stream = module.exports;
