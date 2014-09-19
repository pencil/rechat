#!/bin/bash

for file in common/js/*.js common/vendor/js/*.js
do
  ln $file ./Chrome/js/
done

for file in common/res/*.*
do
  ln $file ./Chrome/res/
done
