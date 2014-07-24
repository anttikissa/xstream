#!/bin/bash
#
# Build files in dist/
#

cd $(dirname $0)

UGLIFYJS=./node_modules/.bin/uglifyjs

BEFORE=`ls -l dist/*`

mkdir -p dist

ls -l stream.js

# Wrap it into a browser-friendly container 
echo 'var module = {};' > dist/stream.js
echo '(function(module) {' >> dist/stream.js
cat stream.js >> dist/stream.js
echo '})(module); var stream = module.exports;' >> dist/stream.js

ls -l dist/stream.js

$UGLIFYJS stream.js -cm > dist/stream.min.js 2> /tmp/uglify-errors

echo "Uglify output:"

cat /tmp/uglify-errors

echo
echo "Before:"
echo "$BEFORE"
echo
echo "After:"

ls -l dist/*

