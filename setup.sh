#!/bin/bash

for file in common/js/*.js common/vendor/js/*.js
do
  ln -f $file ./Chrome/js/
  ln -f $file ./Firefox/data/
  ln -f $file ./Safari.safariextension/js/
done

for file in common/res/*.*
do
  ln -f $file ./Chrome/res/
  ln -f $file ./Firefox/data/
  ln -f $file ./Safari.safariextension/res/
done
