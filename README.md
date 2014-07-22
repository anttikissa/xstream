## streams.js

Streams, flows, sources, sinks, nodes, whatever.  Figure out a good name.

A few notes to the reader:

*The reader should note that this README experienced explosive growth
with very little gardening.  Things might be introduced in an illogical
order, some things may seem irrelevant or unnecessary, and some things
that should be mentioned might have been omitted. If you find the
situation like that, could you be so kind as to inform me.*

This README is a living test suite, which explains the fact that the
examples may feel a bit too verbose and detailed for general
consumption. (But it's not an excuse - TODO move more detailed tests &
internal tests to another file.)

## Now, what's a stream?

Basically,

1. A stream has a value
2. A stream can notify you whenever its value is updated

From these two properties we can derive a multitude of interesting applications.

Let's take a look at the API:

	var s = require('stream');
	console.log(s) // -> [object Function]

So the main API endpoint is a function. The simplest way to invoke it is
to call it with no arguments, which creates a stream.  

	var s = stream();
	
A stream's value is 'undefined' by default.

	var s = stream();
	console.log(s.value); // -> undefined

You can set the value using `.set()`, but it won't be set immediately.
Instead, it creates a transaction which will be committed after the
current call stack exits:

	var s = stream();
	s.set(1);
	console.log(s.value);
	// -> undefined

	later(function() {
		console.log(s.value);
		// -> 1
	});

`later` is defined as:

	function later(f) {
		setTimeout(f, 1);
	}

TODO should you be able to say `.set().commit()` in order to commit the
perform operation instantly?  Internally it would just call
stream.transaction().commit().

Internally, streams use `setImmediate` or a similar mechanism to
schedule the transaction.

TODO make this current. In node, it uses `process.nextTick()`. In the
browser, it uses a suitable mechanism (if starvation is a problem,
invent some suitable workaround)

Back to `set`. Like many other methods of `stream`, it returns the
stream itself:

	var s = stream();
	console.log(s.set(123) === s);
	// -> true
	
So you could have written the previous example as:

	var s = stream().set(2);
	console.log(s.value);
	// -> undefined
	later(function() {
		console.log(s.value);
		// -> 2
	});

Or simply use the constructor `stream(value)`, which triggers
`set(value)` (if `value` is defined):

	var s = stream(123);
	console.log(s.value);
	// -> undefined
	later(function() {
		console.log(s.value);
		// -> 123
	});

You can listen for changes in a stream's value:

	var s = stream();
	s.forEach(function(value) {
		console.log(value);
	});

	s.set(1);
	// later:
	// -> 1
	console.log(s.value); // -> 1

Like `.set()`, `.forEach()` returns the set itself, so you can use them in the
same expression:

	var s = stream().forEach(function(value) {
		console.log('s', value); 
	}).set(1);
	// later:
	// -> s 1

The order of `.set() and `.forEach()` doesn't matter, because the
transaction only happens later:

	var s = stream().set(2).forEach(function(value) {
		console.log('s', value); 
	});
	// later:
	// -> s 2

How do transactions work?

There's `stream.tx`, which is the current transaction if it exists.

Alternatively, you can call stream.transaction() to get the current
transaction, or start a new one if there isn't one already.

	//console.log(stream.tx); // x-> []
	//var s = stream().set(1);
	//console.log(stream.tx); // x-> [[xxx, 1]]

For demonstration purposes, we'll be using a function that just logs its
arguments, so let's give it a name:

	// because if you simply pass console.log around, it'll 
	// have the wrong `this`
	var log = console.log.bind(console);

A stream broadcasts its value always when a new value is set, even if
it's the same as the old value:

	var s = stream();
	s.forEach(log);
	s.set(1);
	setTimeout(function() {
		// -> 1
		s.set(1);
		setTimeout(function() {
			// -> 1
		}, 10);
	}, 10);

However you can get a stream that only broadcasts its value when it
changes with `stream.uniq()` (similar to Unix tool `uniq(1)`)

	var s = stream();
	s.uniq().forEach(log);
	s.set(1);
	setTimeout(function() {
		// -> 1
		s.set(1);
		setTimeout(function() {
			// no effect
		}, 10);
	}, 10);

You can map streams into other streams.

	var s = stream();
	s.forEach(log);
	var s2 = s.map(function(x) { return x * 2; });
	s2.forEach(function(value) {
		console.log('s2 is', value);
	});

	s.set(5);
	// later:
	// -> 5; s2 is 10

	s.set(10);
	// later:
	// -> 10; s2 is 20

Transitive dependencies work:

	var s = stream();
	var s2 = s.map(function(x) { return x + 1; });
	var s3 = s2.map(function(x) { return x * 2; });

	s3.forEach(log);
	s.set(1);
	// later:
	// -> 4

You can convert an array into a stream:

	var numbers = stream.fromArray([1,2,3,4,5]);
	numbers.forEach(log);
	//	numbers.onEnd(function(value) { console.log('end'); });
	// later:
	// -> 1; 2; 3; 4; 5

// TODO eventually add .pause(), .play(), .rewind(), .interval(),
// maybe .delay() to these kinds of streams, give them a name
// 'timed stream', 'buffered stream', 'automatic stream', 'generator stream',
// or something

You should be able to set how long a delay `.fromArray()` (or a
`.set()`) is.

	stream.fromValues(1,2,3).delay(100);
	// wait 100 ms, then give 1, 2, 3 in a burst

	stream.fromValues(1).delay(100);
	// should be equivalent to
	stream().set(1).delay(100);
	// but .set() already committed a transaction!
	// this means that we should have means to remove a stream from
	// the transaction queue. transaction().remove(stream) ->
	// would return an array of operations.

This may need some magic (for instance, an internal .rewire())

Streams can be filtered, like arrays:

	var numbers = stream.fromArray([1,2,3,4,5,6,7,8,9,10]);
	var oddNumbers = numbers.filter(function(value) {
		return value % 2;
	});
	//	numbers.forEach(function(value) { console.log('nums', value); });
	oddNumbers.forEach(log);
	// later:
	// -> 1; 3; 5; 7; 9

You can combine streams to make new streams.  Whenever one of the source
streams is updated, the resulting stream is updated as well.

	var s1 = stream(1);
	var s2 = stream(1);
	var s3 = stream.combine(s1, s2, function(value1, value2) {
		return value1 * value2;
	});
	s3.forEach(log);
	s1.set(2);
	// later:
	// -> 2
	s2.set(3);
	// later:
	// -> 6

Works with three streams, as well. This example introduces two more ways
to create a stream, `fromValues` and `fromString`:

TODO is it just an implementation artifact that s1 and s2 are updated in
the same commit? Debug this!

	var s1 = stream.fromValues(1,2,3,4,5);
	var s2 = stream.fromString('abcde');
	var s3 = s2.map(function(s) { return s.toUpperCase(); });

	stream.combine(s1, s2, s3, Array).forEach(log);
	// later:
	// -> [ 1, 'a', 'A' ]; [ 2, 'b', 'B' ]; [ 3, 'c', 'C' ]

Combining with `Array` is a common enough operation to warrant its own
name, `zip`:

	var s1 = stream.fromArray([1,2,3]);
	var s2 = stream.fromString('abc');
	stream.zip(s1, s2).forEach(log);
	// later:
	// -> [ 1, 'a' ]; [ 2, 'b' ]; [ 3, 'c' ]

TODO is there any sense in this?

Normally, streams only notify their listeners whenever their value
changes.  But sometimes you don't care about the value, just about the
notification.  In those cases you can trigger the notification manually:

	var s = stream();
	s.forEach(function() { console.log('ping'); });
	s.forEach(function() { console.log('pong'); });
	s.broadcast();
	// -> ping; pong

The dependency handler functions should only be called after all
children have been updated. The following example sets up a network of 9
streams (3 sources and 6 dependent streams) and ensures that each
dependency handler is called only once.

	var s1 = stream(1);
	var s2 = stream(2);
	var s3 = stream(3);

	var plusCount = 0;
	var plus = function(a, b, c) { plusCount++; return a + b + c; }
	var mulCount = 0;
	var mul = function(a, b, c) { mulCount++; return a * b * c; }

	var s4 = stream.combine(s1, s2, s3, plus);
	var s5 = stream.combine(s1, s2, s3, plus);
	var s6 = stream.combine(s1, s2, s3, plus);

	var s7 = stream.combine(s4, s5, s6, mul);
	var s8 = stream.combine(s4, s5, s6, mul);
	var s9 = stream.combine(s4, s5, s6, mul).forEach(log);

	// later:
	// (1 + 2 + 3) * (1 + 2 + 3) * (1 + 2 + 3)
	// -> 216
	// A naive implementation would call plus 9 times
	console.log(plusCount); // -> 3
	// A naive implementation would call mul 27 times
	console.log(mulCount); // -> 3

Topological sort TODO move somewhere else

	var s1 = stream();
	var s2 = stream();
	var s3 = stream();
	var identity = function(x) { return x; };
	stream.dependency(s1, s3, identity);
	stream.dependency(s1, s2, identity);
	stream.dependency(s2, s3, identity);

	// s1.set(1); would result in:
	var sorted = stream.updateOrder([s1]);
	console.log(sorted[0].id === s1.id); // -> true
	console.log(sorted[1].id === s2.id); // -> true
	console.log(sorted[2].id === s3.id); // -> true

Rewire

	// 

TODO

.merge() is actually flatMap() when generalized to streams
.concat() similarly could also take a stream of arrays (but if one
.end()s, the whole stream end()s and it stops listening)
.reduce()
.errors(),
.ends()

.ends() should return the last value of the stream, to enable things
like:

	stream.fromArray([1,2,3,4]).reduce(function(a, b) {
		return a + b;
	}).ends().forEach(function(sum) {
		console.log('sum is', sum);
		// -> 10
	});


.er

What other 


When can that be useful? For instance, if you are making a game and want
a random number on every frame:

	var randomStream = stream.sample(function() {
		// Produce a random digit
		return Math.random().toString().charAt(2);
	}, 1000 / 60);

	log('random')
	// -> prints a number 60 times per second

`sample`, by the way, either takes a stream or a function, and takes its
value at a specified interval.

`sample` can be used to to synchronize streams to another stream that is
used as a clock stream, to make other streams update simultaneously:

	var clock = stream.clock(1000 / 60);
	var mouseMoves = stream.fromEvent(document, 'mousemove').pluck(['x', 'y']);
	var randoms = stream.sample(Math.random, clock);
	var coords = stream.sample(mouseMoveStream, clock);

	stream.combine(randoms, coords, function(random, coord) {
		// do something with them
	});

You can use `stream.frame` to return a stream that is synchronized with
an `requestAnimationFrame` callback:

	var stream.frame();
	// Do stream.frame.forEach() or something to do some drawing
	// TODO How to avoid the .setImmediate caused by .forEach()?
	// .map(...).assign(domElement, 'property')?

You may have noticed that .map() and .forEach() are quite like the array
functions of the same name.  Streams are like arrays in other respects,
too.

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

Or you can convert an array into a stream that broadcasts a new value
every X milliseconds, using setInterval() internally:

	var numbers2 = stream.fromArray([1,2,3,4,5], 100);
	numbers2.forEach(function(value) { console.log(value); });
	// (during the next 500 ms) -> 1; 2; 3; 4; 5

Ranges work, too:

	var someNumbers = stream.fromRange(1, 5).forEach(log); // -> 1; 2; 3; 4; 5
	var allIntegers = stream.fromRange(0).forEach(log); // -> 1; 2; 3; ...

	// The third argument is the step
	var someEvenNumbers = stream.fromRange(0, 10, 2).
		forEach(log); // -> 2; 4; 6; 8; 10
	// If you need to use step with infinite ranges, you can use Infinity
	var allEvenNumbers = stream.fromRange(0, Infinity, 2).
		forEach(log); // -> 2; 4; 6; 8; 10; ...

Several other array utilities work, too:

`concat` combines several streams sequentially. Naturally, for this to
work as expected, all of the concatenated streams must be finite, except
for the last one.

	first = stream.fromArray([1,2,3]);
	second = stream.fromArray([4,5]);
	first.concat(second).forEach(function(value) {
		console.log(value);
	}); // -> 1; 2; 3; 4; 5

`concat` is actually the reason why I first needed .onEnd() and .end(),
but I figure they might be useful in other contexts, too.

You can `filter` a stream; the resulting stream only broadcasts the
value if a predicate returns true.

	var oddNumbers = stream.fromRange(0).filter(function(value) {
		return (value % 2);
	}).forEach(log); // -> 1; 3; 5; ...

`find` returns a stream whose value is undefined until a value is found
in the stream, after which it ends immediately. If the original stream
ends before a value is found, it ends without never yielding a value.

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


## Transactions

Stream updates are atomic: outside observers will never see inconsistent
state.  This is achieved using transactions.

Whenever you make a modification on a stream using `.set()`, it starts a
transaction or continues a new one.

A transaction is simply a set of modifications that will be performed on nodes:

	//var s = stream(1);
	//var s2 = s.map(double);
	//log(stream.tx); // -> []
	//s.set(2);
	//log(s.value); // -> undefined
	//log(s2.value); // -> undefined

	//s.forEach(log);
	//s2.forEach(log);

	//log(stream.tx); // -> [stream(undefined), 1]

	// You can commit a transaction manually:
	//stream.commit(); // -> 2; 4
	//log(stream.tx); // -> []
	//log(s.value); // -> 2
	//log(s2.value); // -> 4

You can also use transactions to modify a stream atomically. Consider
the classical bank account transfer example:

	var bobAccount = stream(100); // Bob has $100
	var maryAccount = stream(200); // Mary has $200

	function sendMoney(from, to, amount) {
		function deposit(balance, amount) {
			return balance + amount;
		}

		function withdraw(balance, amount) {
			if (amount > balance) {
				throw new InsufficientFundsException('need more');
			}
			return balance - value;
		}

		to.modify(function(balance) {
			return deposit(balance, amount);
		});
	
		from.modify(function(balance) {
			return withdraw(balance, amount);
		});

		// Similar to bluebird's .catch() handlers
		stream.transaction()
			.catch(InsufficientFundsException, function(e) {
				console.log(e.message);
			}).commit();
	}

	sendMoney(bobAccount, maryAccount, 101);
	// -> need more
	console.log(bobAccount.value, maryAccount.value);
	// unchanged:
	// -> 100 200
	sendMoney(maryAccount, bobAccount, 50);
	console.log(bobAccount.value, maryAccount.value);
	// -> 150 150

TODO write about `dependency` instead

`onUpdate` observes state changes in one stream, and optionally lets you update
another stream within the same transaction:

	var s = stream.fromRange(0);
	var oddNumbersTimesThree = stream();
	var s2 = s.onUpdate(value, function(set) {
		if (value % 2) {
			setS2(value * 3);
		}
	});

	s.forEach(logWithPrefix('s'));
	s2.forEach(logWithPrefix('s2'));
	// -> s 1; s2 3; s 2; s 3; s2 9; s 4; s 5; s2 15; ...

TODO should onUpdate() be called fromStream()? Probably!

## Re-wiring a stream

Conceptually, a stream consists of two parts: its identity, which
consists of its value and its listeners, and its implementation, which
dictates where its value comes from.

When you create a stream and give it a name, possibly using it somewhere
else, you give it a permanent, unchangeable identity. At the same time,
it gets an implementation.

	var someStream = stream(123);
	var mapped = someStream.map(function(value) { return value * 2; });
	var combined = stream.combine(someStream, mappedStream, function(a, b) {
		return a + b;
	});

You can now change someStream's underlying implementation by saying, for
example:

	someStream.rewire(combine(s1, s2, f(v1, v2) { ... }));

This changes causes changes in `s1` and `s2` to be propagated to
`someStream`, and eventually to `mapped` and `combined`.

TODO circular dependencies, detecting them


## A crazy idea

That streams would, by default, always broadcast their new value, even
if the value didn't change

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

The implementation should be crystal clear and simple enough that you
can include it in the first paragraph of the documentation.

Are things pushed or are they pulled?


## DOM events

Sure enough,

You can map DOM events into streams.

But instead of (RxJS)

	var close1Button = document.querySelector('.close1');
	var close1ClickStream = Rx.Observable.fromEvent(close1Button, 'click');

you can use the shorthand

	var clicks = stream.fromEvent('.close1', 'click');

## 
