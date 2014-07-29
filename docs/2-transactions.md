# Transactions

As we've seen, transactions are what make streams tick.

Quite literally so, as the function `stream.tick()` is what is used to complete a
transaction.

TODO this is fiction still

	var s = stream();
	s.set(123);
	s.forEach(function(value) { console.log(value); });
	stream.tick();
	// -> 123
	s.set(234);
	stream.tick();
	// -> 234

