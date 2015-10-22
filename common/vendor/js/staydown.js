function StayDown(opts) {
    opts = opts || {};
    this.target = opts.target;
    this.interval = opts.interval;
    this.max = opts.max || 0;
    this.callback = opts.callback;
    this.userScroll = true;
    this.spinner = opts.spinner;
    this.spin_img = new Image();
    if (this.spinner) {
        this.spin_img.src = this.spinner;
    }
    var staydown = this;
    this.intend_down = true;

    this.emit('lock');

    var wheelevent = "wheel";
    if (document.onmousewheel !== undefined) {
        wheelevent = 'mousewheel';
    }

    window.addEventListener('resize', function (event) {
        staydown.emit('windowresize');
        staydown.checkdown();
    });

    this.lock = function() {
      staydown.intend_down = true;
      staydown.emit('lock');
    }

    this.target.addEventListener('scroll', function (event) {
        if (staydown.userScroll) {
            if (staydown.intend_down && !staydown.isdown()) {
                staydown.intend_down = false;
                staydown.emit('release');
            } else if (!staydown.intend_down && staydown.isdown()) {
                staydown.intend_down = true;
                staydown.emit('lock');
            }
        }
        staydown.userScroll = true;
    });

    if (window.MutationObserver) {
        //private function for getting images recursively from dom

        //mutation observer for whenever the overflow element changes
        this.mo = new MutationObserver(function (mutations) {
            var mut, idx, nidx, imgs, img, iidx, ilen, parent, spin;
            staydown.userScroll = false;
            //something changed, check scroll
            staydown.checkdown();
            //check to see if image was added, and add onload check
            for (idx = 0; idx < mutations.length; idx++) {
                mut = mutations[idx];
                for (nidx = 0; nidx < mut.addedNodes.length; nidx++) {
                    // Check if we appended a node type that isn't
                    // an element that we can search for images inside.
                    if (!mut.addedNodes[nidx].getElementsByTagName) {
                        continue;
                    }

                    imgs = mut.addedNodes[nidx].getElementsByTagName('img');
                    for (iidx = 0, ilen = imgs.length; iidx < ilen; iidx++) {
                        img = imgs[iidx];
                        if (!img.complete) {
                            parent = img.parentNode;
                            if (staydown.spinner) {
                                spin = staydown.spin_img.cloneNode();
                                parent.replaceChild(spin, img);
                            }
                            var onImageLoad = function (event) {
                                if (spin) {
                                    //image loads later, and isn't a mutation
                                    parent.replaceChild(img, spin);
                                }
                                staydown.emit('imageload');
                                staydown.checkdown();
                                event.target.removeEventListener('load', onImageLoad);
                            };
                            img.addEventListener('load', onImageLoad);
                        }
                    }
                }
            }
        });
        this.mo.observe(this.target, {attributes: true, childList: true, characterData: true, subtree: true});
    } else {
        var checkdown = function () {
            staydown.checkdown();
            window.setTimeout(function() {
              checkdown();
            }, staydown.interval);
        };
        checkdown();
    }

}

(function () {

    this.isdown = function () {
        return (this.target.scrollTop + this.target.clientHeight == this.target.scrollHeight);
    };

    this.append = function (newel) {
        this.emit('append');
        this.target.appendChild(newel);
        if (this.intend_down) {
            this.target.scrollTop = this.target.scrollHeight;
            this.emit('scrolldown');
        }
        while (this.max !== 0 && this.target.children.length > this.max) {
            this.target.removeChild(this.target.children[0]);
            this.emit('removechild');
        }
    };

    this.emit = function (type, msg) {
        if (typeof this.callback === 'function') {
            this.callback(type, msg);
        }
    };

    this.checkdown = function () {
        if (this.intend_down && 
            this.target.scrollTop + this.target.clientHeight != this.target.scrollHeight) {
            this.target.scrollTop = this.target.scrollHeight;
            this.userScroll = false;
            this.emit('scrolldown');
        }
    };

}).call(StayDown.prototype);

if (typeof module === 'undefined') {
    window.StayDown = StayDown;
} else {
    module.exports = StayDown;
}
