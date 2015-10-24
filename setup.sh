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

ln -f common/js/adapters/rechat.chrome.js ./Chrome/js/
ln -f common/js/adapters/rechat.firefox.js ./Firefox/data/
ln -f common/js/adapters/rechat.safari.js ./Safari.safariextension/js/
