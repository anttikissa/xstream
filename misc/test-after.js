var realLog = console.log.bind(console);

var TIME = 5;

// TODO make use of a concept like 'test is done' and somehow arrange
// following tests to only start after the previous test is done; this
// is hacky and shaky and fragile and stupid, tests can leave behind all
// kind of crap
function runOneTest() {
	console.log = makeConsole();
	console.realLog = realLog;

//	realLog('runOneTest,', tests.length, 'to go');
	var test = tests.shift();

	if (test) {
		test();
		setTimeout(runOneTest, TIME);
	}

};

runOneTest();

})();
