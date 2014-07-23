#!/bin/bash
#
# Build files in dist/
#

cd $(dirname $0)

UGLIFYJS=./node_modules/.bin/uglifyjs

BEFORE=`du -sh dist/*`

mkdir -p dist

# TODO wrap `stream.js` into something suitable for the browser
cp stream.js dist/stream.js

$UGLIFYJS stream.js -cm > dist/stream.min.js 2> /tmp/uglify-errors

echo "Uglify output:"

cat /tmp/uglify-errors

echo
echo "Before:"
echo "$BEFORE"
echo
echo "After:"

du -sh dist/*

