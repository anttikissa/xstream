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
//var log = console.log.bind(console);
var log = function() {};

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
	this.listeners = []; // 'external' listeners
	this.parents = []; // my dependencies
	this.children = []; // 'internal' listeners
	this.value = undefined;
	this.id = stream.nextId++;

	if (initial !== undefined) {
		this.set(initial);
	}
};

// Tell my listeners that my value has been updated.
Stream.prototype.broadcast = function broadcast() {
	for (var i = 0, len = this.listeners.length; i < len; i++) {
		this.listeners[i](this.value);
	}
};

// Call f whenever my value has been updated.
Stream.prototype.forEach = function forEach(f) {
	this.listeners.push(f);
	return this;
};

// Set my value to `value`. The value will be updated, and listeners will
// be notified, when the next transaction is committed.
Stream.prototype.set = function set(value) {
	var that = this;

	var tx = stream.transaction();
	tx.set(that, value);
	return this;
};

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
	var parent = this;
	return depends(parent, stream(), function() {
		this.newValue = f(parent.newValue);
	}).endWhen(this);
};

// Returns a stream whose value is updated with `x` whenever this 
// stream's value is updated with `x`, if `f(x)` is true.
//
// var s2 = s1.filter(isOdd);
//
// s1: 1 1 2 2 5 6 6
// s2: 1 1	 5
Stream.prototype.filter = function filter(f) {
	var parent = this;
	return depends(this, stream(), function() {
		if (f(parent.newValue)) {
			this.newValue = parent.newValue;
		}
	});
};

// Returns a stream whose value is the same as this stream's value,
// but is only broadcast whenever this stream's value changes.
//
// var s2 = s1.uniq()
//
// s1: 1 1 2 2 5 6 6 
// s2: 1   2   5 6
Stream.prototype.uniq = function uniq() {
	var parent = this;
	return depends(this, stream(), function() {
		if (this.value !== parent.newValue) {
			this.newValue = parent.newValue;
		}
	});
};

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
// TODO example with initial`
Stream.prototype.reduce = function reduce(f, initial) {
	var parent = this;
	return depends(this, stream(), function() {
		if (this.value !== undefined) {
			this.newValue = f(this.value, parent.newValue);
		} else {
			this.newValue = initial !== undefined
				? f(initial, parent.newValue)
				: parent.newValue;
		}
	}).endWhen(parent);
};

// Collect all values of a stream into an array
Stream.prototype.collect = function collect() {
	return this.reduce(function(array, x) {
		return array.concat(x);
	}, []);
};

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
	this.parents = [];
	return depends(newParent, this, function() {
		this.newValue = newParent.newValue;
	});
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

// Update function. For regular streams, this is a no-op.
Stream.prototype.f = function fNoOp() {
};

Stream.prototype.ends = function ends() {
	if (!this.endStream) {
		this.endStream = stream();
	}
	return this.endStream;
};

Stream.prototype.end = function end() {
	// TODO should probably cut ties to parents to enable GC
	// TODO how about children?
	if (this.endStream) {
		// TODO within a transaction?
		this.endStream.set(this.value);
	}
};

// This stream ends when s ends
Stream.prototype.endWhen = function endWhen(s) {
	this.ends().rewire(s.ends());
	return this;
};

// TODO endWhenOne, endWhenAll
// for combine and merge, respectively

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
stream.transaction = function() {
	return stream.tx || (stream.tx = new Transaction());
};

// Make a stream from an array.
//
// Set the the first value in the current transaction and the following
// values in following transactions.
stream.fromArray = function(array) {
	// TODO ensure it's an array
	// at least in debug build
	var result = stream();
	var update = function() {
		if (array.length) {
			result.set(array.shift());

			defer(update);
		} else {
			result.end();
		}
	};

	update();
	return result;
};

// Make a stream from a set of values.
//
// stream.fromValues(1,2,3) is equal to stream.fromArray([1,2,3]).
stream.fromValues = function() {
	var args = Array.prototype.slice.call(arguments);
	return stream.fromArray.call(stream, args);
};

// Make a stream from a string's characters.
//
// stream.fromString('abc') is equal to stream.fromArray('a', 'b', 'c').
stream.fromString = function(string) {
	return stream.fromArray(string.split(''));
};

// TODO consider making `depends` a member of `stream`.
//
// In fact, it's a bit similar to `rewire`. Can they be merged?

// depends: (Stream parents..., Stream child, f) -> Stream
//
// Declare value of `child` to depend on each of `parents`.
//
// Whenever one or more parents is updated, `f` gets called with child
// assigned to `this`.  Parents' `.newValue` is set if the parent has
// been updated during this transaction. `f` should set `this.newValue`
// if it wants to update the child.
//
function depends() {
	// TODO should check that child doesn't have active .set()s in the
	// current commit queue, or figure out another solution for that
	//
	// Parents are only needed for .rewire(), at least right now.
	// But they could be used to avoid allocating new memory on `map`,
	// etc. Every stream could have the same `updater`, which would
	// take `f` from `this.f` and `parents` from `this.parents`
	var arglen = arguments.length;
	// `child` is the second last argument
	var child = arguments[arglen - 2];
	// `f` is the last argument
	var f = arguments[arglen - 1];

	// `parents` are all except the last two arguments
	for (var i = 0; i < arglen - 2; i++) {
		arguments[i].children.push(child);
		child.parents.push(arguments[i]);
	}
	child.f = f;
	return child;
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

// combine: (Stream streams..., f) -> Stream
// TODO document
stream.combine = function combine() {
	var parents = toArray(arguments);
	var f = parents.pop();

	var args = parents.concat([stream(), function() {
		this.newValue = f.apply(null, parents.map(mostRecentValue));
	}]);

	return depends.apply(null, args);
}

// merge: (Stream streams...) -> Stream
// TODO document
stream.merge = function merge() {
	var parents = toArray(arguments);

	var args = parents.concat([stream(), function() {
		var child = this;

		for (var i = 0, len = parents.length; i < len; i++) {
			if (hasNewValue(parents[i])) {
				child.newValue = parents[i].newValue;
			}
		}
	}]);

	return depends.apply(null, args);
}

// Take n streams and make a stream of arrays from them that is updated
// whenever one of the source streams is updated.
//
// stream.zip(stream1, stream2, ...)
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

	var nodesToUpdate = updateOrder(updatedStreamsOrdered);
	// TODO vocabulary! stream or node! or what?
	
	nodesToUpdate.forEach(function(s) {
		s.f();
	});

	// I wonder if these could be done in the same .forEach()
	nodesToUpdate.forEach(function(s) {
		if (hasNewValue(s)) {
			s.value = s.newValue;
			delete s.newValue;
			s.broadcast();
		}
	});
};

module.exports = stream;
