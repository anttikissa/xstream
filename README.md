## STREAM

A JS library for easy dataflow programming.

What's a stream?

1. A stream has a value
2. A stream can notify you whenever that value changes

From these two properties we can derive a multitude of applications.

But first, let's see the API:

	var stream = require('stream');
	console.log(stream) // -> [Function: stream]

So the main API andpoint is a function. The simplest way to invoke it is to call
it with no arguments, which creates a stream.  

	var s = stream();
	
A stream's value is 'undefined' by default.

	console.log(s.value); // -> undefined

You could have specified an initial value, too.

	console.log(stream(123).value); // -> 123

You can listen for changes in a stream's value:

	s.forEach(function(value) {
		console.log(value);
	});

	s.set(1); // -> 1
	console.log(s.value); // -> 1

By default, a stream only broadcasts its value if it changes.

	s.set(1); // no effect

For demonstration purposes, we'll be using a function that just logs its
arguments, so let's give it a name:

	// because if you simply pass console.log around, it'll 
	// have the wrong `this`
	var log = console.log.bind(console);

You can map streams into other streams.

	var s2 = s.map(function(x) { return x * 2; });
	s2.forEach(function(value) {
		console.log('s2 is', value);
	});

	s.set(5); // -> 5; s2 is 10

And combine streams to make new streams.  Whenever one of the source streams
changes, the resulting stream changes, too.

	var s1 = stream(1);
	var s2 = stream(1);
	var s3 = stream(s1, s2, function(value1, value2) {
		return value1 * value2;
	});
	s3.forEach(log);
	s1.set(2); // -> 2
	s2.set(3); // -> 6

// TODO should this be so?:
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

	log('random')
	// -> prints a number 60 times per second

You may have noticed that .map() and .forEach() are quite like the array
functions of the same name.  Streams are like arrays in other respects, too.

But before that, let's introduce a third property of streams:

3. A stream can notify you when it no longer wants to broadcast its value

You can end a stream by calling `stream.end()`, and listen to end events by
calling `stream.onEnd()`.

	var s3 = stream(1);
	s3.forEach(log);
	s3.onEnd(function() { console.log('end'); });
	s3.set(2); // -> 2
	s3.end(); // -> end
	// you can still access its final value directly
	log(s3.value); // -> 2
	// but it won't broadcast its value to listeners
	s3.set(3); // no effect

You can convert an array into a stream:

	var numbers = stream.fromArray([1,2,3,4,5]);
	numbers.forEach(value) { console.log(value); }
	numbers.onEnd() { console.log('end'); }
	// (on subsequent ticks) -> 1; 2; 3; 4; 5; end

Or you can convert an array into a stream that broadcasts a new value every X
milliseconds, using setInterval() internally:

	var numbers2 = stream.fromArray([1,2,3,4,5], 100);
	numbers2.forEach(function(value) { console.log(value); });
	// (during the next 500 ms) -> 1; 2; 3; 4; 5

Ranges work, too:

	var someNumbers = stream.fromRange(1, 5).forEach(log); // -> 1; 2; 3; 4; 5
	var allIntegers = stream.fromRange(0).forEach(log); // -> 1; 2; 3; ...

Several other array utilities work, too:

`concat` combines several streams sequentially. Naturally, for this to work as
expected, all of the concatenated streams must be finite, except for the last one.

	first = stream.fromArray([1,2,3]);
	second = stream.fromArray([4,5]);
	first.concat(second).forEach(function(value) {
		console.log(value);
	}); // -> 1; 2; 3; 4; 5

`concat` is actually the reason why I first needed .onEnd() and .end(), but I
figure they might be useful in other contexts, too.

You can `filter` a stream; the resulting stream only broadcasts the value if a
predicate returns true.

	var oddNumbers = stream.fromRange(0).filter(function(value) {
		return (value % 2);
	}).forEach(log); // -> 1; 3; 5; ...

`find` returns a stream whose value is undefined until a value is found in the
stream, after which it ends immediately. If the original stream ends before a
value is found, it ends without never yielding a value.

	var numbers = stream.fromRange(0);
	var foundStream = stream.find(function(value) { return value == 42; });
	foundStream.forEach(log); // -> 42

findIndex
indexOf
join
pop, push?
shift, unshift?
reduce, reduceRight?

slice(start, end)
take(n) is shorthand for slice(0, n)

Other commonly used helpers:

also stream.zip(s1, s2, s3)

zipWith() is actually the same as combine() 

.every() is true before an element is found that makes it false?
.some() is false before an element is found that makes it true?

Should s1.zip(s2) be a shorthand for stream.zip(s1, s2)
and same for combine() and possibly others?


## Re-wiring a stream

Conceptually, a stream consists of two parts: its identity, which consists of
its value and its listeners, and its implementation, which dictates where its
value comes from.

When you create a stream and give it a name, possibly using it somewhere else,
you give it a permanent, unchangeable identity. At the same time, it gets an
implementation.

	var someStream = stream(123);
	var mapped = someStream.map(function(value) { return value * 2; });
	var combined = stream.combine(someStream, mappedStream, function(a, b) {
		return a + b;
	});

You can now change someStream's underlying implementation by saying, for
example:

	someStream.rewire(combine(s1, s2, f(v1, v2) { ... }));

This changes causes changes in `s1` and `s2` to be propagated to `someStream`,
and eventually to `mapped` and `combined`.

TODO circular dependencies, detecting them


## A crazy idea

That streams would, by default, always broadcast their new value, even if the
value didn't change

What would that be called, "an eager stream"?

s.eager = false

## Bacon notes

### Pros

Seems to do pretty much what I expected to do with this :)

### Cons

Seems big and complex

stream.merge(...) and stream.combine(...) are not as readable as
merge(stream1, stream2) and combine(stream1, stream2).

API reference needs examples

to .value

.rewrite is cleaner than Bacon.Bus

HOW IS IT IMPLEMENTED?

The implementation should be crystal clear and simple enough that you can
include it in the first paragraph of the documentation.

Are things pushed or are they pulled?


## DOM events

Sure enough,

You can map DOM events into streams.

But instead of (RxJS)

	var close1Button = document.querySelector('.close1');
	var close1ClickStream = Rx.Observable.fromEvent(close1Button, 'click');

you can use the shorthand

	var clicks = stream.fromEvent('.close1', 'click');


