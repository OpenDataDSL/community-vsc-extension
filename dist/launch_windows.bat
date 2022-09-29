#!/bin/sh
DIR=`dirname $0`
CLASSPATH_OPTIONS="-classpath $DIR/dist/opendsl-debug.jar"
$DIR/windows/bin/java $CLASSPATH_OPTIONS $@
