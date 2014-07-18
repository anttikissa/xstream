// setImmediate(callback, [arg], [. . . ])
//
// To schedule the “immediate” execution of callback after I/O events
// callbacks and before setTimeout and setInterval . Returns an
// immediateObject for possible use with clearImmediate(). Optionally
// you can also pass arguments to the callback.
//
// Callbacks for immediates are queued in the order in which they were
// created. The entire callback queue is processed every event loop
// iteration. If you queue an immediate from a inside an executing
// callback that immediate won’t fire until the next event loop
// iteration.

// process.nextTick(callback)
//
// • callback {Function}
//
// Once the current event loop turn runs to completion, call the
// callback function.
//
// This is not a simple alias to setTimeout(fn, 0), it’s much more
// efficient. It runs before any additional I/O events (including
// timers) fire in subsequent ticks of the event loop.

// setTimeout(cb, ms)
//
// Run callback cb after at least ms milliseconds. The actual delay
// depends on external factors like OS timer granularity and system
// load.
//
// The timeout must be in the range of 1-2,147,483,647 inclusive. If the
// value is outside that range, it’s changed to 1 millisecond. Broadly
// speaking, a timer cannot span more than 24.8 days.
// Returns an opaque value that represents the timer.

//var defer = setImmediate;
var defer = process.nextTick;

var result = [];

defer(function() {
	result.push(1);
	defer(function() {
		result.push(2);
	});
});

defer(function() {
	result.push(3);
	defer(function() {
		result.push(4);
	});
});

setTimeout(function() {
	console.log(result);
}, 5);
