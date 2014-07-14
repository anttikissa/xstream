function Stream(initial) {
	this.listeners = [];
	this.value = initial;
};

Stream.prototype = {
	forEach: function(f) {
		this.listeners.push(f);
	},

	set: function(value) {
		var changed = this.value !== value;
		this.value = value;
		if (changed) {
			for (var i = 0, len = this.listeners.length; i < len; i++) {
				this.listeners[i](value);
			}
		}
	},

	map: function(f) {
		var result = stream();
		this.forEach(function(value) {
			result.set(f(value));
		});
		return result;
	}
};

var stream = function(initial) {
	return new Stream(initial);
};

module.exports = stream;
