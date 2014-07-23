// TODO to make code shorter, consider:
//
// extract pattern
//   if (some[thing]) {
//     some[thing].push(value);
//   } else {
//     some[thing] = [value];
//   }
//
// into a function and call it like 
// some[thing] = push(some[thing], value);
//

//
// General utility functions
//

// Convert argument-like object to array
function toArray(args) {
	return Array.prototype.slice.apply(args);
}

function Stream(initial) {
	this.listeners = []; // 'external' listeners
	this.children = []; // 'internal' listeners
	this.value = undefined;
	this.id = stream.nextId++;

	if (initial !== undefined) {
		this.set(initial);
	}
};

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
	var arglen = arguments.length;
	// `child` is the second last argument
	var child = arguments[arglen - 2];
	// `f` is the last argument
	var f = arguments[arglen - 1];
	// `parents` are all except the last two arguments
	for (var i = 0; i < arglen - 2; i++) {
		arguments[i].children.push(child);
	}
	child.f = f;
	return child;
}

//
// 'Bare' functions that are later installed into `stream` and
// `stream.prototype`
//

function map(s, f) {
	return depends(s, stream(), function() {
		this.newValue = f(s.newValue);
	});
}

function filter(s, f) {
	return depends(s, stream(), function() {
		if (f(s.newValue)) {
			this.newValue = s.newValue;
		}
	});
}

function uniq(s) {
	return depends(s, stream(), function() {
		if (this.value !== s.newValue) {
			this.newValue = s.newValue;
		}
	});
}

function reduce(s, f) {
	return depends(s, stream(), function() {
		if (this.value != null) {
			this.newValue = f(this.value, s.newValue);
		} else {
			this.newValue = s.newValue;
		}
	});
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
function combine() {
	var parents = toArray(arguments);
	var f = parents.pop();

	var args = parents.concat([stream(), function() {
		this.newValue = f.apply(null, parents.map(mostRecentValue));
	}]);

	return depends.apply(null, args);
}

// merge: (Stream streams...) -> Stream
function merge() {
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

Stream.prototype = {

	// Tell my listeners that my value has been updated.
	broadcast: function() {
		for (var i = 0, len = this.listeners.length; i < len; i++) {
			this.listeners[i](this.value);
		}
	},

	// Call f whenever my value has been updated.
	forEach: function(f) {
		this.listeners.push(f);
		return this;
	},

	// Set my value to `value`. The value will be updated, and listeners will
	// be notified, when the next transaction is committed.
	//
	// `after` (optional): if specified, delay the update by `after` ms
	set: function(value, after) {
		var that = this;
		
		if (after) {
			setTimeout(function() {
				var tx = stream.transaction();
				tx.set(that, value);
			}, after);
			return this;
		}
		var tx = stream.transaction();
		tx.set(that, value);
		return this;
	},

	// Returns a stream whose value is updated with `f(x)` whenever this
	// stream's value is updated with `x`.
	//
	// var s2 = s1.map(plusOne);
	//
	// s1: 1 1 2 2 5 6 6
	// s2: 2 2 3 3 6 7 7
	//
	// TODO map is just stream.combine(this, f).
	//
	// Should we implement it in terms of a more complex and generalized
	// function or leave it as is?
	map: function(f) {
		return map(this, f);
	},

	// Returns a stream whose value is updated with `x` whenever this 
	// stream's value is updated with `x`, if `f(x)` is true.
	//
	// var s2 = s1.filter(isOdd);
	//
	// s1: 1 1 2 2 5 6 6
	// s2: 1 1     5
	filter: function(f) {
		return filter(this, f);
	},

	// Returns a stream whose value is the same as this stream's value,
	// but is only broadcast whenever this stream's value changes.
	//
	// var s2 = s1.uniq()
	//
	// s1: 1 1 2 2 5 6 6 
	// s2: 1   2   5 6
	uniq: function() {
		return uniq(this);
	},

	// Returns a reduced stream, whose value represents the values of
	// this stream, 'boiled down' by function `f`.  The first value of
	// the resulting stream is the same as the next value of this
	// stream.
	//
	// f: function(accumulator, value) -> accumulator'
	//
	// Like Array.prototype.reduce, but provides a view to the reduction
	// process in realtime.
	//
	// TODO need to would take an initial value that we can return
	// in case this stream is empty. Should the initial value be
	// broadcast?
	//
	// var s2 = s1.reduce(function(sum, value) { return sum + value; });
	//
	// s1: 1 1 2 2  5  6  6
	// s2: 1 2 4 6 11 17 23
	//
	reduce: function(f) {
		return reduce(this, f);
	},

	toString: function() {
		return 'stream(' + this.value + ', id: ' + this.id + ')';
	},

	// A shorthand, to enable:
	//
	// var s = stream(1).commit();
	commit: function() {
		stream.transaction().commit();
		return this;
	},

	// Update function. For regular streams, this is a no-op.
	f: function() {
	}
};

var stream = function(initial) {
	return new Stream(initial);
};

stream.nextId = 0;

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
		}
	};

	update();
	return result;
};

// Make a stream from a set of values.
//
// Is to `stream.toArray` what `Array.prototype.call` is to
// `Array.prototype.apply`.
stream.fromValues = function() {
	var args = Array.prototype.slice.call(arguments);
	return stream.fromArray.call(stream, args);
};

// Make a stream from a string's characters.
//
// Internall calls `stream.fromArray`.
stream.fromString = function(string) {
	return stream.fromArray(string.split(''));
};

// TODO move code around, find a logical ordering

stream.combine = combine;

stream.merge = merge;

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
		if (test(array[i])) {
			return array[i];
		}
	}
}

// Do `f` at a later time. Return a function that can be called to
// cancel the the deferred call.
function defer(f) {
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
