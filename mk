#!/bin/bash
#
# Build files in dist/
#

cd $(dirname $0)

UGLIFYJS=./node_modules/.bin/uglifyjs

BEFORE=`ls -l dist/*`

NAME=xstream

mkdir -p dist

# Wrap it into a browser-friendly container 
echo 'var module = {};' > dist/$NAME.js
echo '(function(module) {' >> dist/$NAME.js
cat xstream.js >> dist/$NAME.js
echo '})(module); var stream = module.exports;' >> dist/$NAME.js

$UGLIFYJS $NAME.js -cm > dist/$NAME.min.js 2> /tmp/uglify-errors
gzip -c dist/$NAME.min.js > dist/$NAME.min.js.gz

echo "Uglify output:"

cat /tmp/uglify-errors

echo
echo "Before:"
echo "$BEFORE"
echo
echo "After:"

ls -l dist/*

