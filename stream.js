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
		if (stream.tx === that) {
			delete stream.tx;
		}
	});
	this.ops = [];
}

Transaction.prototype.set = function(stream, value) {
	this.ops.push([stream, value]);
}

Transaction.prototype.commit = function() {
	var updated = {};
	var updatedOrdered = [];

	for (var i = 0, len = this.ops.length; i < len; i++) {
		var op = this.ops[i];
		var stream = op[0];
		var value = op[1];

		// TODO update values with topological sort and magic
		
		stream.value = op[1];
		if (!updated[stream.id]) {
			updatedOrdered.push(stream);
			updated[stream.id] = true;
		}
	}

	for (var i = 0, len = this.ops.length; i < len; i++) {
		updatedOrdered[i].broadcast();
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
	set: function(value) {
		var tx = stream.transaction();
		tx.set(this, value);
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
		var result = stream();
		stream.dependency(this, result, function(newValue, setter) {
			setter(f(newValue));
		});
		return result;
	},

	// Returns a stream whose value is updated with `x` whenever this 
	// stream's value is updated with `x`, if `f(x)` is true.
	//
	// var s2 = s1.filter(isOdd);
	//
	// s1: 1 1 2 2 5 6 6
	// s2: 1 1     5
	filter: function(f) {
		var result = stream();
		stream.dependency(this, result, function(newValue, setter) {
			if (f(newValue)) {
				setter(newValue);
			}
		});
		return result;
	},

	// Returns a stream whose value is the same as this stream's value,
	// but is only broadcast whenever this stream's value changes.
	//
	// var s2 = s1.uniq()
	//
	// s1: 1 1 2 2 5 6 6 
	// s2: 1   2   5 6
	uniq: function() {
		var result = stream();
		stream.dependency(this, result, function(newValue, setter) {
			if (result.value !== newValue) {
				setter(newValue);
			}
		});
		return result;
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

