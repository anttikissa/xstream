//
// using setTimeout(step):
//
// 1000 iterations in 1235 ms, 810 ops per second
// 10000 iterations in 12434 ms, 804 ops per second
//
// one iteration is about 1ms
//
// using setImmediate(step):
//
// 100000 iterations in 323 ms, 309598 ops per second
// 1000000 iterations in 3165 ms, 315956 ops per second
//

var counter = 0;
var max = 10000;

function step() {
	if (counter++ === max)
		return finished();

	setTimeout(step);
	//setImmediate(step);
}

var start = new Date();

function finished() {
	var end = new Date();
	var time = (end - start);
	var opsPerSec = Math.round(max / time * 1000);
	console.log(String(max), 'iterations in', time, 'ms,', opsPerSec, 'ops per second');
}

step();


