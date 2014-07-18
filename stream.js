function Stream(initial) {
	this.listeners = [];
	this.value = initial;
};

Stream.prototype = {
	forEach: function(f) {
		this.listeners.push(f);
		return this;
	},

	set: function(value) {
		var that = this;
		setImmediate(function() {
			// TODO push to stream.tx
			// instead of this
			var changed = that.value !== value;
			that.value = value;
			if (changed) {
				for (var i = 0, len = that.listeners.length; i < len; i++) {
					that.listeners[i](value);
				}
			}
		});

		return this;
	},

	fromStream: function(updater) {
		
	},

	map: function(f) {
		var result = stream();
		this.forEach(function(value) {
			result.set(f(value));
		});
		return result;
	},

	toString: function() {
		return 'stream(' + this.value + ')';
	}
};

var stream = function(initial) {
	return new Stream(initial);
};

stream.tx = [];
stream.commit = function() {
	stream.tx.forEach(function(op) {
		var target = op[0];
		var value = op[1];
		console.log('set target', target, 'to value', value);
	});
	stream.tx = [];
	delete stream.txImmediate;
};

module.exports = stream;
