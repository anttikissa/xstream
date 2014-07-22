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
// extract Array.prototype.slice.call(arguments); to a function
// 

// util

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

// Do `f` soon. Return a function that can be called to cancel the
// the deferred call.
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
//	console.log('tx set', stream.id, 'to', value);
//	console.log('tx set: already got ops ', this.ops.map(function(op) {
//		return "set s" + op[0].id + " to " + op[1];
//	}));
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

	var updated = {};
	var updatedOrdered = [];

	for (var i = 0, opsLen = this.ops.length; i < opsLen; i++) {
//		console.log('this.ops is', this.ops);
//		console.log('this.ops.length is', this.ops.length);

		var op = this.ops[i];
//		console.log('op is', this.ops[i]);
		var s = op[0];
		var value = op[1];

		// TODO update values with topological sort and magic
		// instead of this, which is a bit simplistic

		s.newValue = op[1];

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
	}

	for (var i = 0, len = updatedOrdered.length; i < len; i++) {
		var updatedStream = updatedOrdered[i];
		updatedStream.value = updatedStream.newValue;
		delete updatedStream.newValue;
		updatedStream.broadcast();
	}
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
	map: function(f) {
		return stream.dependency(this, stream(), function(newValue, updater) {
			updater(f(newValue));
		});
	},

	// Returns a stream whose value is updated with `x` whenever this 
	// stream's value is updated with `x`, if `f(x)` is true.
	//
	// var s2 = s1.filter(isOdd);
	//
	// s1: 1 1 2 2 5 6 6
	// s2: 1 1     5
	filter: function(f) {
		return stream.dependency(this, stream(), function(newValue, updater) {
			if (f(newValue)) {
				updater(newValue);
			}
		});
	},

	// Returns a stream whose value is the same as this stream's value,
	// but is only broadcast whenever this stream's value changes.
	//
	// var s2 = s1.uniq()
	//
	// s1: 1 1 2 2 5 6 6 
	// s2: 1   2   5 6
	uniq: function() {
		return stream.dependency(this, stream(), function(newValue, updater) {
			if (this.value !== newValue) {
				updater(newValue);
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
stream.fromArray = function(array) {
	var result = stream();
	var update = function() {
		if (array.length) {
			result.set(array.shift());

			defer(update);
		}
	};

	defer(update);
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
// `parent` and a function `updater`.
// `updater`, when called, updates the value of `child` within the 
// transaction that is currently being committed.
//
// Return `child` for convenience, so you can make nice one-liners
// like `return stream.dependency(s, stream(), f(v, u) { u(v); });`.
//
stream.dependency = function(parent, child, f) {
	parent.children.push([child, f]);
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
stream.combine = function() {
	var result = stream();
	var parents = Array.prototype.slice.apply(arguments);
	var f = parents.pop();

	parents.forEach(function(parent) {
		stream.dependency(parent, result, function(_, updater) {
			// Don't use value since we access the .newValue of all
			// parents directly (if available; otherwise just access
			// their .values)
			//
			// This relies heavily on internals of
			// Transaction.prototype.commit(): we can assume that the
			// parent stream's .newValue is updated before dependency
			// handlers are called.
			var values = parents.map(function(s) {
				return s.hasOwnProperty('newValue') ? s.newValue : s.value;
			});
			var result = f.apply(null, values);
			updater(result);
		});
	});
	return result;
};

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
	var args = Array.prototype.slice.apply(arguments);
	args.push(Array);
	return stream.combine.apply(null, args);
};


// Perform a topological sort for a sequence of nodes.
// Return a sorted list of [node, parents] in order that updates
// must be performed
stream.topoSort = function(nodes) {
	function parent(n1, n2) {
		for (var i = 0, len = n1.children.length; i < len; i++) {
			var child = n1.children[i];
			if (child[0].id === n2.id) {
				return true;
			}
		}

		return false;
	}

	// check dependencies
	console.log('parent s1 s2', parent(nodes[2], nodes[0]));
	console.log('parent s2 s3', parent(nodes[0], nodes[1]));
	console.log('parent s1 s3', parent(nodes[2], nodes[1]));

	nodes.forEach(function(node) {
		console.log('sort', node);
	});

	return nodes;
}

module.exports = stream;
