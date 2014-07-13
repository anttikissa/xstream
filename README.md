STREAM

A JS library for easy dataflow programming.

What's a stream?

1. A stream has a value
2. A stream can notify you whenever that value changes

From these two properties we can derive a multitude of applications.

But first, let's see the API:

	var stream = require('stream');

	var s = stream();
	console.log(s.value); // -> undefined
	s.forEach(function(value) {
		console.log('s is', value);
	});

	s.set(1); // -> s is 1
	console.log(s.value); // -> 1
	s.set(1); // no effect

You can map streams into other streams.

	var s2 = s.map(function(x) { return x * 2; });
	s2.forEach(function(value) {
		console.log('s2 is', value);
	});

	s = 5; // -> s is 5; s2 is 10

Normally, streams only notify their listeners whenever their value changes.  But
sometimes you don't care about the value, just about the notification.  In those
cases you can trigger the notification manually:

	s.broadcast();
	// -> s is 5; s2 is 10

When can that be useful? For instance, if you are making a game and want a
random number on every frame:

	var randomStream = stream.sample(function() {
		// Produce a random digit
		return Math.random().toString().charAt(2);
	}, 1000 / 60);

	console.log('random')
	// -> prints a number 60 times per second

You may have noticed that .map() and .forEach() are quite like the array
functions of the same name.  Streams are like arrays in other respects, too.

But before that, let's introduce a third property of streams:

3. A stream can notify you when it no longer wants to broadcast its value

	var s3 = stream(1);
	s3.forEach(function(value) { console.log('s3 is', s3'); });
	s3.onEnd(function() { console.log('s3 ended'); });
	s3.set(2); // -> s3 is 2
	s3.end(); // -> s3 ended
	// you can still access its final value directly
	console.log(s3.value); // -> 2
	// but it won't broadcast its value to listeners
	s3.set(3); // no effect

You can convert an array into a stream:

	var numbers = stream.fromArray([1,2,3,4,5]);
	numbers.forEach(value) { console.log(value); }
	numbers.onEnd() { console.log('end'); }
	// (on subsequent ticks) -> 1; 2; 3; 4; 5; end

Or you can specify an interval for the value changes:

	var numbers2 = stream.fromArray([1,2,3,4,5], 100);
	numbers2.forEach(function(value) { console.log(value); });
	// (during the next 500 ms) -> 1; 2; 3; 4; 5

Ranges work, too:


Several other array utilities work, too:

	first = stream.fromArray([1,2,3]);
	second = stream.fromArray([4,5]);
	first.concat(second).forEach(function(value) {
		console.log(value);
	}); // -> 1; 2; 3; 4; 5

.concat() is actually the reason why I first needed .onEnd() and .end(), but I
figure they might be useful in other contexts, too.

	

(You can convert a stream to an array, but that requires promises or something
so it's up to you to implement.)

Streams can end, too.

stream.

	var numbers = 
	s.onEnd
You can map DOM events into streams.

Instead of

	var close1Button = document.querySelector('.close1');
	var close1ClickStream = Rx.Observable.fromEvent(close1Button, 'click');

you can say

	var clicks = stream.fromEvent('.close1', 'click');

