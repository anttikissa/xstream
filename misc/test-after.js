var TIME = 6;

function declareSuite() {
	var suite = suites[0];
	realLog('\nRunning tests from ' + suite.name + '...\n');
}

// TODO make use of a concept like 'test is done' and somehow arrange
// following tests to only start after the previous test is done; this
// is hacky and shaky and fragile and stupid, tests can leave behind all
// kind of crap
function runOneTest() {
	console.log = makeConsole();
	console.realLog = realLog;

	function nextTest() {
		if (suites.length) {
			if (suites[0].length === 0) {
				suites.shift();
				if (suites[0]) {
					declareSuite();
				}
			}
			if (suites[0]) {
				return suites[0].shift();
			}
		}
			
		return tests.shift();
	}

	var test = nextTest();

	if (test) {
		test();
		setTimeout(runOneTest, TIME);
	}
};

declareSuite();
runOneTest();

})();
