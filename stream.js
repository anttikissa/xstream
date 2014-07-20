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

function Transaction() {
	var that = this;
	this.immediate = setImmediate(function() {
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
	if (this.immediate) {
		clearImmediate(this.immediate);
	}

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
	this.value = initial;
	this.id = stream.nextId++;
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
		return stream.dependency(this, stream(), function(newValue, setter) {
			setter(f(newValue));
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
		return stream.dependency(this, stream(), function(newValue, setter) {
			if (f(newValue)) {
				setter(newValue);
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
		return stream.dependency(this, stream(), function(newValue, setter) {
//			console.log('dependency called with', newValue);
			if (this.value !== newValue) {
				setter(newValue);
			}
		});
	},

	toString: function() {
		return 'stream(' + this.value + ', id: ' + this.id + ')';
	}
};

var stream = function(initial) {
	return new Stream(initial);
};

stream.nextId = 0;

stream.transaction = function() {
	return stream.tx || (stream.tx = new Transaction());
};

// Declares `child` to be dependent on `parent`.
//
// parent: stream
// child: stream
// f: function(newValue, function updater(value))
//
// Whenever `parent` changes, `f` gets called with the new value of
// `parent` and a function that updates `child` when called.
//
// Return `child` for convenience.
stream.dependency = function(parent, child, f) {
	parent.children.push([child, f]);
	return child;
};

module.exports = stream;

