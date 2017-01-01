__proxy = __proxy || {};
__proxy.location_proxy = function(location) {
    return new Proxy(location, {
        set: function(target, name, value) {
            if (value.match(/__proxy_url/)) {
                target[name] = value;
            } else {
                target[name] = __proxy.get_url(value);
            }
        },
        get: function(target, name) {
            return target[name];
        }
    });
};
__proxy.get_location = (function(createElement) {
    return function(href) {
        var l = createElement.call(document, "a");
        l.href = href;
        return l;
    };
})(document.createElement);
__proxy.parsed = __proxy.get_location(__proxy.url);
__proxy.get_url = function(original) {
    var base = location.href.replace(/__proxy_url=.*/, '__proxy_url=');
    if (!base.match(/\?/)) {
        base += '?__proxy_url=';
    }
    var url;
    if (original.match(/^http/)) {
        url = original;
    } else if (original.match(/^\/\//)) {
        url = __proxy.parsed.protocol + original;
    } else if (original.match(/^\//)) {
        url = __proxy.parsed.protocol + '//' + __proxy.parsed.host + original;
    } else {
        url = __proxy.url.replace(/[^\/]+$/, '') + original;
    }
    if (location.href == original) {
        return original;
    } else {
        return base + 'base64:' + btoa(url);
    }
};
__proxy.fix_form = function(form) {
    var re = new RegExp('^http\\/\\/:' + location.host);
    var url = location.href.replace(/\?__proxy_url=.*/, '?__proxy_url=');
    var action = __proxy.get_location(form.action);
    if (action.host == location.host && !form.action.match(/__proxy_url=/)) {
        var input = form.querySelector('[name="__proxy_url"]');
        if (!input) {
            input = document.createElement('input');
            input.setAttribute('type', 'hidden');
            form.appendChild(input);
        }
        input.setAttribute('value', 'base64:' + btoa(__proxy.parsed.origin + action.pathname));
        form.setAttribute('action', url);
    }
};
if (window.parent) {
    (function(window, postMessage) {
        window.parent.postMessage = function(message, origin) {
            origin = '*';
            return postMessage.apply(window.parent, [].slice.call(arguments));
        };
    })(window, window.parent.postMessage);
    // location is replaced by loc.href by php
    window.parent.loc = __proxy.location_proxy(window.parent.location);
}
var loc = __proxy.location_proxy(window.location);
if (window.top) {
    self = window.top; // fix for stackoverflow frame check
}
(function(open) {
    XMLHttpRequest.prototype.open = function(method, filepath, sync) {
        open.call(this, method, __proxy.get_url(filepath));
    };
})(XMLHttpRequest.prototype.open);
(function(img) {
    window.Image = function() {
        return new Proxy(new img(), {
            set: function(target, name, value) {
                if (name == 'src') {
                    target[name] = __proxy.get_url(value);
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
        return ['data-src', 'src', 'href', 'action', 'data-link'].indexOf(name) != -1;
    }
    var attr_re = /((?:href|src|data-src|data|data-link)=['"])([^'"]+)(['"])/g;
    var param_re = /__proxy_url=/;
    function real_node(node) {
        if (node && node.originalNode) {
            return node.originalNode;
        } else {
            return node;
        }
    }
    function fix_style_urls(string) {
        var re = /url\((['"])([^"']+)\1\)/;
        var m = string.match(re);
        if (m && !m[2].match(/^(data:|#)/)) {
            return string.replace(re, function(_, quote, url) {
                return 'url(' + quote + __proxy.get_url(url) + quote + ')';
            });
        } else {
            return string;
        }
    }
    if (window.sheet) {
        if (sheet.insertRule) {   // all browsers, except IE before version 9
            var insertRule = sheet.insertRule;
            sheet.insertRule = function(style) {
                style = fix_style_urls(style);
                return insertRule.apply(sheet, [].slice.call(arguments));
            };
        } else if (sheet.addRule) { // Internet Explorer before version 9
            var addRule = sheet.addRule;
            sheet.addRule = function(rule, style) {
                style = fix_style_urls(style);
                return addRule.apply(sheet, [].slice.call(arguments));
            };
        }
    }
    function fix_html(html) {
        if (html.match(attr_re)) {
            return html.replace(attr_re, function(_, prefix, url, postfix) {
                if (url.match(param_re)) {
                    return prefix + url + postfix;
                } else {
                    return prefix + __proxy.get_url(url) + postfix;
                }
            });
        } else {
            return html;
        }
    }
    function src_proxy(element) {
        if (!element) {
            return element;
        }
        return new Proxy(element, {
            set: function(target, name, value) {
                if (name == 'innerHTML') {
                    target[name] = fix_html(value);
                } else if (attr(name) && !value.match(/^(data:|#)/) && !value.match(param_re)) {
                    target[name] = __proxy.get_url(value);
                } else {
                    target[name] = value;
                }
                return true;
            },
            get: function(target, name) {
                if (name == 'setAttribute') {
                    return function(name, value) {
                        if (attr(name) && !value.match(/^(data:|#)/) && !value.match(param_re)) {
                            target.setAttribute(name, __proxy.get_url(value));
                        } else {
                            target.setAttribute(name, value);
                        }
                    };
                } else if (name == 'originalNode') {
                    return target;
                } else if (typeof target[name] == 'function') {
                    return target[name].bind(target);
                } else if (['firstChild', 'parentNode', 'previousSibling'].indexOf(name) != -1) {
                    return src_proxy(target[name]);
                } else if (['childNodes', 'children'].indexOf(name) != -1) {
                    return [].slice.call(target[name]).map(src_proxy);
                } else if (name == 'style') {
                    return new Proxy(target[name], {
                        get: function(target, name) {
                            return target[name];
                        },
                        set: function(target, name, value) {
                            if (value) {
                                name = String(name);
                                if (name.match(/background/)) {
                                    target[name] = fix_style_urls(value);
                                } else {
                                    target[name] = value;
                                }
                            }
                            return true;
                        }
                    });
                } else {
                    return target[name];
                }
            }
        });
    }
    document.createElement = function(tag) {
        var element = createElement.call(document, tag);
        if (tag.toUpperCase() == 'FORM') {
            __proxy.fix_form(element);
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
            var result = src_proxy(originals.appendChild.call(this, real_node(node)));
            //node.innerHTML += " ";
            return result;
        };
        element.prototype.removeChild = function(node) {
            originals.removeChild.call(this, real_node(node));
        };
        element.prototype.insertBefore = function(newChild, refChild) {
            var result =  originals.insertBefore.call(this, real_node(newChild), real_node(refChild));
            //newChild.innerHTML += " ";
            //refChild.innerHTML += " ";
            return result;
        };
    });
    (function() {
        var original;
        var name;
        "matchesSelector:mozMatchesSelector:webkitMatchesSelector:msMatchesSelector".split(":").forEach(function(fn) {
            if (HTMLElement.prototype[fn]) {
                name = fn;
                original = HTMLElement.prototype[fn];
            }
        });
        if (original) {
            HTMLElement.prototype[name] = function() {
                var node = real_node(this);
                return original.apply(node, [].slice.call(arguments));
            };
        }
    })();
    (function(contains) {
        HTMLElement.prototype.contains = function(node) {
            return contains.call(this, real_node(node));
        };
    })(HTMLElement.prototype.contains);
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
    (function(getComputedStyle) {
        window.getComputedStyle = function(node) {
            node = real_node(node);
            return getComputedStyle.apply(window, [].slice.call(arguments));
        };
    })(window.getComputedStyle);
})(document.createElement);
(function(fetch) {
    window.fetch = function(url, options) {
        return fetch.call(null, __proxy.get_url(url), options || {});
    };
})(window.fetch);
(function() {
    if ('ServiceWorkerContainer' in window) {
        var register = ServiceWorkerContainer.prototype.register;
        ServiceWorkerContainer.prototype.register = function(script) {
            script = __proxy.get_url(script) + '&__proxy_worker';
            var promise = register.apply(this, [].slice.call(arguments));
            return promise.then(function() {
                navigator.serviceWorker.controller.postMessage({
                    __proxy: {
                        url: __proxy.url,
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
            url = __proxy.get_url(url);
            return sendBeacon.apply(navigator, [].slice.call(arguments));
        };
    }
})(navigator.sendBeacon);
window.onload = function() {
    // duck duck go replace the url with https and remove the URI
    [].forEach.call(document.getElementsByTagName('form'), __proxy.fix_form);
};
document.addEventListener('DOMContentLoaded', function() {
    if (window.parent) {
        var title = document.getElementsByTagName('title')[0];
        var data = {
            __proxy: {
                url: __proxy.url
            }
        };
        if (title) {
            data.__proxy.title = title.textContent || title.text;
        }
        window.parent.postMessage(JSON.stringify(data), '*');
    }
});
