if (window.parent) {
    (function(window, postMessage) {
        window.parent.postMessage = function(message, origin) {
            origin = '*';
            return postMessage.apply(window.parent, [].slice.call(arguments));
        };
    })(window, window.parent.postMessage);
}

var __proxy_get_location = (function(createElement) {
    return function(href) {
        var l = createElement.call(document, "a");
        l.href = href;
        return l;
    };
})(document.createElement);
var proxy = __proxy_get_location(__proxy_url);
function proxy_url(original) {
    var base = location.href.replace(/__proxy_url=.*/, '__proxy_url=');
    if (!base.match(/\?/)) {
        base += '?__proxy_url=';
    }
    var url;
    if (original.match(/^http/)) {
        url = original;
    } else if (original.match(/^\/\//)) {
        url = proxy.protocol + original;
    } else if (original.match(/^\//)) {
        url = proxy.protocol + '//' + proxy.host + original;
    } else {
        url = __proxy_url + original;
    }
    if (location.href == original) {
        return original;
    } else {
        return base + 'base64:' + btoa(url);
    }
}
(function(open) {
    XMLHttpRequest.prototype.open = function(method, filepath, sync) {
        open.call(this, method, proxy_url(filepath));
    };
})(XMLHttpRequest.prototype.open);
(function(img) {
    window.Image = function() {
        return new Proxy(new img(), {
            set: function(target, name, value) {
                if (name == 'src') {
                    target[name] = proxy_url(value);
                } else {
                    target[name] = value;
                }
            },
            get: function(target, name) {
                return target[name];
            }
        });
    };
})(window.Image);
(function(createElement) {
    function attr(name) {
        return name == 'src' || name == 'href' || name == 'action';
    }
    var attr_re = /((?:href|src|data-src|data)=['"])([^'"]+)(['"])/g;
    var param_re = /__proxy_url=/;
    function src_proxy(element) {
        return new Proxy(element, {
            set: function(target, name, value) {
                if (name == 'innerHTML') {
                    if (value.match(attr_re)) {
                        target[name] = value.replace(attr_re, function(_, prefix, url, postfix) {
                            if (url.match(param_re)) {
                                return prefix + url + postfix;
                            } else {
                                return prefix + proxy_url(url) + postfix;
                            }
                        });
                    } else {
                        target[name] = value;
                    }
                } else if (attr(name) && !value.match(/^(data:|#)/) && !value.match(param_re)) {
                    target[name] = proxy_url(value);
                } else {
                    target[name] = value;
                }
            },
            get: function(target, name) {
 
                if (name == 'setAttribute') {
                    return function(name, value) {
                        if (attr(name) && !value.match(/^(data:|#)/) && !value.match(param_re)) {
                            target.setAttribute(name, proxy_url(value));
                        } else {
                            target.setAttribute(name, value);
                        }
                    };
                } else if (name == 'originalNode') {
                    return target;
                } else if (typeof target[name] == 'function') {
                    return target[name].bind(target);
                } else {
                    return target[name];
                }
            }
        });
    }
    document.createElement = function(tag) {
        var element = createElement.call(document, tag);
        if (tag.toUpperCase() == 'FORM') {
            __proxy_fix_form(element);
        }
        return src_proxy(element);
    };
    ["HTMLElement", "DocumentFragment"].forEach(function(element) {
        element = window[element];
        var originals = {
            appendChild: element.prototype.appendChild,
            removeChild: element.prototype.removeChild,
            insertBefore: element.prototype.insertBefore
        };
        
        element.prototype.appendChild = function(node) {
            if (node && node.originalNode) {
                node = node.originalNode;
            }
            return src_proxy(originals.appendChild.call(this, node));
        };
        element.prototype.removeChild = function(node) {
            if (node && node.originalNode) {
                node = node.originalNode;
            }
            return originals.removeChild.call(this, node);
        };
        element.prototype.insertBefore = function(newChild, refChild) {
            if (newChild && newChild.originalNode) {
                newChild = newChild.originalNode;
            }
            if (refChild && refChild.originalNode) {
                refChild = refChild.originalNode;
            }
            return originals.insertBefore.call(this, newChild, refChild);
        };
    });
    (function() {
        ['getElementById', 'querySelector'].forEach(function(fun) {
            if (document[fun]) {
                var original = document[fun];
                document[fun] = function(arg) {
                    var obj = original.call(document, arg);
                    if (obj) {
                        return src_proxy(obj);
                    } else {
                        return obj;
                    }
                };
            }
        });
        ['querySelectorAll', 'getElementsByTagName', 'getElementsByClassName', 'getElementsByName'].forEach(function(fun) {
            if (document[fun]) {
                var original = document[fun];
                document[fun] = function() {
                    var list = original.apply(document, [].slice.call(arguments));
                    var result = [];
                    for (var i=list.length; i--;) {
                        result[i] = list[i] ? src_proxy(list[i]) : list[i];
                    }
                    return result;
                };
            }
        });
    })();
})(document.createElement);
(function(fetch) {
    window.fetch = function(url, options) {
        return fetch.call(null, proxy_url(url), options || {});
    };
})(window.fetch);
(function(getComputedStyle) {
    window.getComputedStyle = function(node) {
        if (node.originalNode) {
            node = node.originalNode;
        }
        return getComputedStyle.apply(window, [].slice.call(arguments));
    };
})(window.getComputedStyle);
(function() {
    if ('ServiceWorkerContainer' in window) {
        var register = ServiceWorkerContainer.prototype.register;
        ServiceWorkerContainer.prototype.register = function(script) {
            script = proxy_url(script) + '&__proxy_worker';
            var promise = register.apply(this, [].slice.call(arguments));
            return promise.then(function() {
                navigator.serviceWorker.controller.postMessage({
                    __proxy: {
                        url: __proxy_url,
                        location: location.href
                    }
                });
                return promise;
            });
        };
    }
})();
(function(sendBeacon) {
    if (sendBeacon) {
        navigator.sendBeacon = function(url) {
            url = proxy_url(url);
            return sendBeacon.apply(navigator, [].slice.call(arguments));
        };
    }
})(navigator.sendBeacon);
function __proxy_fix_form(form) {
    var re = new RegExp('^http\\/\\/:' + location.host);
    var url = location.href.replace(/\?__proxy_url=.*/, '?__proxy_url=');
    var action = __proxy_get_location(form.action);
    if (action.host == location.host && !form.action.match(/__proxy_url=/)) {
        var input = form.querySelector('[name="__proxy_url"]');
        if (!input) {
            input = document.createElement('input');
            input.setAttribute('type', 'hidden');
            form.appendChild(input);
        }
        input.setAttribute('value', 'base64:' + btoa(proxy.origin + action.pathname));
        form.setAttribute('action', url);
    }
}
window.onload = function() {
    // duck duck go replace the url with https and remove the URI
    [].forEach.call(document.getElementsByTagName('form'), __proxy_fix_form);
};
document.addEventListener('DOMContentLoaded', function() {
    if (window.parent) {
        var title = document.getElementsByTagName('title')[0];
        var data = {
            __proxy: {
                url: __proxy_url
            }
        };
        if (title) {
            data.__proxy.title = title.textContent || title.text;
        }
        window.parent.postMessage(JSON.stringify(data), '*');
    }
});
