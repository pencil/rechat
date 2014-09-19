#!/bin/bash

for file in common/js/*.js common/vendor/js/*.js
do
  ln $file ./Chrome/js/
  ln $file ./Firefox/data/
done

for file in common/res/*.*
do
  ln $file ./Chrome/res/
  ln $file ./Firefox/data/
done
