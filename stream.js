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
// Utility functions
//

// Convert argument-like object to array
function toArray(args) {
	return Array.prototype.slice.apply(args);
}

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

// Return a function that accesses `member`
//
// TODO is this used just for debugging?
function pluck(member) {
	return function(o) {
		return o[member];
	}
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

Transaction.prototype.commit = function() {
	if (this.cancel) {
		this.cancel();
	}

	// TODO doesn't this mean that the result of calling
	// .set(), etc., is well-defined even within a commit?
	// And most importantly, in .forEach() handlers, it's safe to
	// .set() (and .modify() when it eventually comes)
	if (stream.tx === this) {
		delete stream.tx;
	}

	var updatedStreams = {};
	var updatedStreamsOrdered = [];

	for (var i = 0, opsLen = this.ops.length; i < opsLen; i++) {
//		console.log('this.ops is', this.ops);
//		console.log('this.ops.length is', this.ops.length);

		var op = this.ops[i];
//		console.log('op is', this.ops[i]);
		var s = op[0];
		var value = op[1];

		s.newValue = op[1];
		if (!updatedStreams[s.id]) {
			updatedStreamsOrdered.push(s);
			updatedStreams[s.id] = true;
		}

		/*
		function updateStream(s) {
			if (!updated[s.id]) {
				updatedOrdered.push(s);
				updated[s.id] = true;
			}

			for (var j = 0, childrenLen = s.children.length; j < childrenLen; j++) {
				var dependency = s.children[j];
				var child = dependency[0];
				var f = dependency[1];
				f.call(child, s.newValue, function(value) {
					child.newValue = value;

					updateStream(child);
				});
			}
		}

		updateStream(s);
		*/
	}

	var nodesToUpdate = stream.updateOrder(updatedStreamsOrdered);
	console.log('nodesToUpdate', nodesToUpdate.map(function(s) { return s.id; }));

	// AUGH need to pick some dependency function to actually produce
	// the value of a child! This hurts.
	var dependencies = [];

	/*
	for (var i = 0, len = updatedOrdered.length; i < len; i++) {
		var updatedStream = updatedOrdered[i];
		updatedStream.value = updatedStream.newValue;
		delete updatedStream.newValue;
		updatedStream.broadcast();
	} */
};

function Stream(initial) {
	this.listeners = []; // 'external' listeners
	this.children = []; // 'internal' listeners
	this.value = undefined;
	this.id = stream.nextId++;

	if (initial !== undefined) {
		this.set(initial);
	}
};

// Declare dependency `parent` -> `child` with optional update handler.
// Return `child`.
//
// parent: Stream
// child: Stream
// f (optional): update handler
//
// f gets called whenever on or more child's parents gets updated.
// It's `this` is set to `child`.
// .newValue will be set for those parents whose value was updated in
// this transaction.
//
// TODO make into depends(parents..., child, f);
//
function depends(parent, child, f) {
	parent.children.push(child);
	if (f) {
		child.f = f;
	}
	return child;
}

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

function hasNewValue(s) {
	return (s.hasOwnProperty('newValue'));
}

// Return .newValue if exists, otherwise .value
function mostRecentValue(s) {
	if (s.hasOwnProperty('newValue'))
		return s.newValue;
	return s.value;
}

// Generalize this later
function combine(s1, s2, f) {
	var child = stream(); 
	depends(s1, child);
	depends(s2, child);
	child.f = function() {
		this.newValue = f(mostRecentValue(s1), mostRecentValue(s2));
	};

	return child;
}

// Generalize this later
function merge(s1, s2) {
	var child = stream();
	depends(s1, child);
	depends(s2, child);
	child.f = function() {
		if (hasNewValue(s1)) {
			this.newValue = s1.newValue;
		}
		if (hasNewValue(s2)) {
			this.newValue = s2.newValue;
		}
	};

	return child;
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
		throw new Error('TODO');
		return stream.dependency(this, stream(), function(value, updater) {
			if (this.value) {
				updater(f(this.value, value));
			} else {
				updater(value);
			}
		});
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

// Declares `child` to be dependent on `parent`.
// 
// This is a 'plumbing' function intended for implementing primitives
// such as `map`, `filter`, or `reduce`.  
//
// parent: stream
// child: stream
// f: function(newValue, function updater(value))
//
// Whenever `parent` changes, `f` gets called with the new value of
// `parent` and a function `updater`, with `this` set to `child`.
//
// `updater`, when called, updates the value of `child` within the 
// transaction that is currently being committed.
//
// Return `child` for convenience, so you can make nice one-liners
// like `return stream.dependency(s, stream(), f(v, u) { u(v); });`.
//
stream.dependency = function(parent, child, f) {
	parent.children.push([child]);
	child.f = f;
	return child;
};

// Make a stream that depends on a set of other streams.
//
// stream.combine(stream1, stream2, ..., function(value1, value2, ...))
//
// Whenever any of streams `stream1`, `stream2`, ... is updated, the
// given function is called and the resulting stream is updated within
// the same transaction.
//
// TODO example
//
stream.combine = combine;

// Marge n streams.
stream.merge = merge;

// merge(stream) and mergeLatest(stream) really belongs into
// stream.prototype
//
// Merge a stream of streams
//
// Return a stream that updates when the latest stream in the stream is
// updated.
stream.mergeLatest = function(stream) {
	// This is roughly how it should work. Right?
	// Now just go implement .rewire().
	var result = stream();
	streams.forEach(function(s) {
		result.rewire(s);
	});

	return result;
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
stream.updateOrder = function(nodes) {
	console.log('updateOrder', nodes.map(pluck('id')));
	// navigate the internal data structure
	function children(node) {
		return node.children.map(function(child) { return child[0]; });
	}

	parentCounts = {};
	allNodes = {};
	nodesToUpdate = [];

	// Find all nodes reachable from `node`
	// and record into `parentCounts` the amount of incoming edges
	// within this graph.
	// TODO detect cyclical dependencies, eventually
	function findNodesToUpdate(node) {
		allNodes[node.id] = node;
		children(node).forEach(function(child) {
			parentCounts[child.id] = (parentCounts[child.id] || 0) + 1;
			findNodesToUpdate(child);
		});
	}

	nodes.forEach(function(node) {
		parentCounts[node.id] = 0;
		findNodesToUpdate(node);
	});

//	console.log('nodes', parentCounts);
//	console.log('allNodes', allNodes);

	function removeNode(nodeKey) {
//		console.log('before removeNode', parentCounts);
//		console.log('allNodes, looking for', nodeKey);
//		console.log('allNodes', allNodes);
		var node = allNodes[nodeKey];
		var itsChildren = children(node);
		itsChildren.forEach(function(child) {
			parentCounts[child.id]--;
		});
		delete parentCounts[nodeKey];
		delete allNodes[nodeKey];
		nodesToUpdate.push(node);
//		console.log('after removeNode', parentCounts);
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
//		console.log('finding one', nodeKeys);
		var nodeKeyWithZeroParents = find(nodeKeys, function(nodeKey) {
//			console.log('checking if parentCounts[nodeKey] is zero');
//			console.log('parentCounts', parentCounts);
//			console.log('nodeKey', nodeKey);
			return parentCounts[nodeKey] === 0;
		});
		removeNode(nodeKeyWithZeroParents);

	}

	return nodesToUpdate;

}

module.exports = stream;
