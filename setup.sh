#!/bin/bash

for file in common/js/*.js common/vendor/js/*.js
do
  ln $file ./Chrome/js/
  ln $file ./Firefox/data/
  ln $file ./Safari.safariextension/js/
done

for file in common/res/*.*
do
  ln $file ./Chrome/res/
  ln $file ./Firefox/data/
  ln $file ./Safari.safariextension/res/
done

ln ./Safari.safariextension/res/icon128.png ./Safari.safariextension/Icon.png
