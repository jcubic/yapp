/* __   __
 * \ \ / /_ _ _ __  _ __
 *  \ V / _` | '_ \| '_ \
 *   | | (_| | |_) | |_) |
 *   |_|\__,_| .__/| .__/
 *           |_|   |_|
 *   Yet Another Php Proxy
 *
 * Copyright (c) 2016-2018 Jakub Jankiewicz <https://jcubic.pl/me>
 *
 * Released under MIT license <https://opensource.org/licenses/MIT>
 */

/* global atob, location, btoa, global, ServiceWorkerContainer, history */

var __proxy = __proxy || {};
__proxy.location_proxy = function(location) {
    return new Proxy(location, {
        set: function(target, name, value) {
            if (value.match(/__proxy_url/)) {
                target[name] = value;
            } else {
                target[name] = __proxy.get_url(value);
            }
            return true;
        },
        get: function(target, name) {
            if (typeof target[name] === 'function' && name === 'replace') {
                var fn = function(url) {
                    target['href'] = __proxy.get_url(url);
                };
                fn.toString = function() {
                    return 'function () { [native code] }';
                };
            }
            return target[name];
        }
    });
};
__proxy.parse_url = (function(createElement) {
    return function(href) {
        var l = createElement.call(document, "a");
        l.href = href;
        return l;
    };
})(document.createElement);

if (!__proxy.url) {
    throw new Error('__proxy.url not found');
}
if (!__proxy.parsed) {
    __proxy.parsed = __proxy.parse_url(__proxy.url);
}
__proxy.is_proxy_url = function(url) {
    return !!url.match(/__proxy_url=(.*)/);
};
__proxy.param = function(obj) {
    var r20 = /%20/g;
    return Object.keys(obj).map(function(key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(obj[key] == null ? "" : obj[key]);
    }).join('&').replace(r20, '+');
};
__proxy.split_proxy_url = function(url) {
    var arg = url.match(/__proxy_url=(.*)/)[1];
    var match = decodeURIComponent(arg).match(/base64:([^&]+)&?(.*)/);
    if (match) {
        url = atob(match[1]);
        var query = Object.assign({}, __proxy. parse_query(url.replace(/[^?]+\??/, '')), __proxy. parse_query(match[2]));
        return {
            url: url.replace(/\?.*$/, ''),
            query: __proxy.param(query)
        };
    }
};
__proxy. parse_query = function(string) {
    var query = {};
    if (string) {
        var array = string.split('&');
        for (var i = 0; i < array.length; i++) {
            var parts = array[i].split('=');
            var name = decodeURIComponent(parts[0]);
            if (name != '__proxy_url') {
                query[name] = decodeURIComponent(parts[1] || '').replace(/\+/g, ' ');
            }
        }
    }
    return query;
};
__proxy.absolute_url = function(original) {
    if (__proxy.is_proxy_url(original)) {
        var split = __proxy.split_proxy_url(original);
        if (split) {
            if (split.query) {
                if (split.url.match(/\?/)) {
                    return split.url + '&' + split.query;
                } else {
                    return split.url + '?' + split.query;
                }
            } else {
                return split.url;
            }
        }
    }
    if (original.match(/^http/)) {
        var re = new RegExp('^' + location.protocol + '//' + location.host + '/');
        if (original.match(re)) {
            return __proxy.url.replace(/[^\/]+$/, '') + original.replace(re, '');
        } else {
            return original;
        }
    } else if (original.match(/^\/\//)) {
        return __proxy.parsed.protocol + original;
    } else if (original.match(/^\//)) {
        return __proxy.parsed.protocol + '//' + __proxy.parsed.host + original;
    } else {
        return __proxy.url.replace(/[^\/]+$/, '') + original;
    }
};
function debug(name, fn) {
    return function() {
        console.log({ name, arguments });
        var output = fn.apply(this, arguments);
        console.log(output);
        return output;
    };
}
__proxy.get_url = function(url) {
    if (url.match(/__proxy_url=/) || url.match(/^(chrome-extension:\/\/|data:|#|javascript:|blob:)/)) {
        var url_p = __proxy.parse_url(url);
        var self_p = __proxy.parse_url(__proxy.self);
        if (self_p.pathname != url_p.pathname) {
            return self_p.origin + self_p.pathname + url_p.search;
        } else {
            return url;
        }
    } else {
        var base = __proxy.self.replace(/__proxy_url=.*/, '__proxy_url=');
        if (!base.match(/\?/)) {
            base += '?__proxy_url=';
        }
        if (location.href === url) {
            return __proxy.url;
        } else {
            return base + 'base64:' + btoa(__proxy.absolute_url(url));
        }
    }
};
__proxy.fix_form = function(form) {
    var re = new RegExp('^http\\/\\/:' + location.host);
    var url = location.href.replace(/\?__proxy_url=.*/, '?__proxy_url=');
    var action = __proxy.parse_url(form.action);
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
__proxy.post_data = function(url, options) {
    if (window.parent) {
        options = options || {};
        var title = document.getElementsByTagName('title')[0];
        var data = {
            __proxy: {
                url: url || __proxy.url,
                replace: !!options.replace
            }
        };
        if (title) {
            data.__proxy.title = title.textContent || title.text;
        }
        window.parent.postMessage(JSON.stringify(data), '*');
    }
};
if (window.parent) {
    (function(window, postMessage) {
        window.parent.postMessage = function(message, origin) {
            origin = '*';
            // some page was sending post message to parent that was failing because of different origin
            return postMessage.apply(window.parent, [].slice.call(arguments));
        };
    })(window, window.parent.postMessage);
    // location is replaced by loc.href by php
    window.parent.loc = __proxy.location_proxy(window.parent.location);
}
var loc = __proxy.location_proxy(window.location);
if (window.top) {
    self = window.top; // fix for stackoverflow frame check
    global = window;
}
document.addEventListener('mousedown', function(e) {
    var node;
    if (window.event && window.event.srcElement) {
        node = window.event.srcElement;
    } else {
        node = e.target;
    }
    if (node.nodeName.toLowerCase() == 'a') {
        if (!__proxy.is_proxy_url(node.href)) {
            location.href = __proxy.get_url(node.href);
        }
    }
});
(function(open) {
    XMLHttpRequest.prototype.open = function(method, filepath, sync) {
        console.log(filepath);
        open.call(this, method, __proxy.get_url(filepath), sync);
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
                return true;
            },
            get: function(target, name) {
                return target[name];
            }
        });
    };
})(window.Image);

(function() {
    function attr(name) {
        return ['data-src', 'src', 'href', 'action', 'data-link'].indexOf(name) != -1;
    }
    var attr_re = /((?:href|src|data-src|data|data-link)=['"])([^'"]+)(['"])/g;
    var param_re = /__proxy_url=/;
    var style_re = /(<style[^>]*>)([\s\S]*?)(<\/style>)/g;
    function safe_url(url) {
        return url.match(param_re) || url.match(/^(chrome-extension:\/\/|data:|#)/);
    }
    function real_node(node) {
        if (node && node.originalNode) {
            return node.originalNode;
        } else {
            return node;
        }
    }
    function fix_style_urls(string) {
        if (!string) {
            return string;
        }
        var re = /url\((['"]?)(.*?)\1\)/g;
        var m = string.match(re);
        if (m) {
            return string.replace(re, function(all, quote, url) {
                if (safe_url(url)) {
                    return all;
                } else {
                    return 'url(' + quote + __proxy.get_url(url) + quote + ')';
                }
            });
        } else {
            return string;
        }
    }
    (function(insertRule, addRule) {
        // all browsers, except IE before version 9
        if (insertRule) {
            CSSStyleSheet.prototype.insertRule = function(style, index) {
                return insertRule.call(this, fix_style_urls(style), index);
            };
        } else if (addRule) {
            CSSStyleSheet.prototype.addRule = function(rule, style, index) {
                return addRule.call(this, rule, fix_style_urls(style), index);
            };
        }
    })(CSSStyleSheet.prototype.insertRule, CSSStyleSheet.prototype.addRule);
    function fix_html(html) {
        if (html.match(attr_re)) {
            html = html.replace(attr_re, function(all, prefix, url, postfix) {
                if (safe_url(url)) {
                    return all;
                } else {
                    return prefix + __proxy.get_url(url) + postfix;
                }
            });
        }
        if (html.match(style_re)) {
            html = html.replace(style_re, function(_, start, style, end) {
                return start + fix_style_urls(style) + end;
            });
        }
        return html;
    }
    var proxies = new WeakMap();
    function src_proxy(element) {
        if (!element) {
            return element;
        } else if (element.originalNode) {
            return element;
        }
        if (proxies.has(element)) {
            return proxies.get(element);
        }
        var proxy = new Proxy(element, {
            set: function(target, name, value) {
                if (name == 'innerHTML') {
                    target[name] = fix_html(value);
                } else if (attr(name) && !safe_url(value)) {
                    target[name] = __proxy.get_url(value);
                } else {
                    target[name] = value;
                }
                return true;
            },
            get: function(target, name) {
                if (name == 'originalNode') {
                    return target;
                } else if (name === 'parentNode' && target.nodeName === 'HTML') {
                    return window.document;
                } else if (!target[name]) {
                    return target[name];
                } else if (name == 'compareDocumentPosition') {
                    return function(wrapper) {
                        return target.compareDocumentPosition(real_node(wrapper));
                    };
                } else if (name == 'setAttribute') {
                    return function(name, value) {
                        if (attr(name) && !safe_url(value)) {
                            target.setAttribute(name, __proxy.get_url(value));
                        } else {
                            target.setAttribute(name, value);
                        }
                    };
                } else if (['getElementsByTagName', 'getElementsByClassName', 'querySelectorAll'].indexOf(name) != -1) {
                    return function() {
                        var nodes = target[name].call(target, [].slice.call(arguments));
                        return [].map.call(nodes, src_proxy);
                    };
                } else if (['querySelector', 'getElementById'].indexOf(name) != -1) {
                    return function() {
                        return src_proxy(target[name].call(target, [].slice.call(arguments)));
                    };
                } else if (typeof target[name] == 'function') {
                    return target[name].bind(target);
                } else if (['firstChild', 'parentNode', 'previousSibling', 'lastChild'].indexOf(name) != -1) {
                    return src_proxy(target[name]);
                } else if (['childNodes', 'children'].indexOf(name) != -1) {
                    return [].slice.call(target[name]).map(src_proxy);
                } else if (name == 'style') {
                    return new Proxy(target[name], {
                        get: function(target, name) {
                            if (typeof target[name] === 'function') {
                                return target[name].bind(target);
                            }
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
        proxies.set(element, proxy);
        return proxy;
    }
    (function(createElement) {
        document.createElement = function(tag) {
            var element = createElement.call(document, tag);
            if (tag.toUpperCase() == 'FORM') {
                __proxy.fix_form(element);
            }
            return src_proxy(element);
        };
        return document;
    })(document.createElement);
    (function(createHTMLDocument) {
        document.implementation.createHTMLDocument = function() {
            var doc = createHTMLDocument.apply(this, arguments);
            var createElement = doc.createElement;
            doc.createElement = function(tag) {
                var element = createElement.call(document, tag);
                return src_proxy(element);
            };
            return doc;
        };
    })(document.implementation.createHTMLDocument);
    function proxifyNode(node) {
        if (node && node.nodeName.toUpperCase() == 'STYLE') {
            node.innerHTML = fix_style_urls(node.innerHTML);
        }
    }
    ["HTMLElement", "DocumentFragment"].forEach(function(element) {
        element = window[element];
        var originals = {
            appendChild: element.prototype.appendChild,
            removeChild: element.prototype.removeChild,
            insertBefore: element.prototype.insertBefore,
            replaceChild: element.prototype.replaceChild
        };
        element.prototype.appendChild = function(node) {
            proxifyNode(node);
            return src_proxy(originals.appendChild.call(this, real_node(node)));
        };
        element.prototype.removeChild = function(node) {
            originals.removeChild.call(this, real_node(node));
        };
        element.prototype.insertBefore = function(newChild, refChild) {
            proxifyNode(newChild);
            proxifyNode(refChild);
            return  originals.insertBefore.call(this, real_node(newChild), real_node(refChild));
        };
        element.prototype.replaceChild = function(newNode, oldNode) {
            proxifyNode(newNode);
            proxifyNode(oldNode);
            return originals.replaceChild.call(this, real_node(newNode), real_node(oldNode));
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
    (function() {
        ['IntersectionObserver', 'MutationObserver', 'WebKitMutationObserver'].forEach(function(name) {
            var Observer = window[name];
            if (Observer) {
                var original = Observer.prototype.observe;
                Observer.prototype.observe = function(wrapper) {
                    var args = [].slice.call(arguments, 1);
                    args.unshift(real_node(wrapper));
                    return original.apply(this, args);
                };
            }
        });
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
                document[fun] = function() {
                    var obj = original.apply(document, arguments);
                    if (obj) {
                        return src_proxy(obj);
                    } else {
                        return obj;
                    }
                };
                document[fun].__original = original;
                document[fun].toString = function() {
                    return original.toString();
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
                document[fun].__original = original;
                document[fun].toString = function() {
                    return original.toString();
                };
            }
        });
    })();
    (function(toString) {
        Object.prototype.toString = function(obj) {
            if (typeof obj == 'function' &&
                typeof obj.__orginal == 'function') {
                return toString.call(this, obj.__orginal);
            } else {
                return toString.call(this, obj);
            }
        };
    })(Object.prototype.toString);
    if (typeof window.MutationObserver !== 'undefined') {
        (function(observe) {
            MutationObserver.prototype.observe = function(node, options) {
                return observe.call(this, real_node(node), options);
            };
        })(MutationObserver.prototype.observe);
    }
    if (typeof window.CanvasRenderingContext2D !== 'undefined') {
        (function(drawImage) {
            window.CanvasRenderingContext2D.prototype.drawImage = function(image) {
                image = real_node(image);
                return drawImage.apply(this, [].slice.call(arguments));
            };
        })(window.CanvasRenderingContext2D.prototype.drawImage);
    }
    (function(getComputedStyle) {
        window.getComputedStyle = function(node) {
            node = real_node(node);
            return getComputedStyle.apply(window, [].slice.call(arguments));
        };
    })(window.getComputedStyle);
})();
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
(function() {
    if (window.history) {
        if (history.pushState) {
            var pushState = history.pushState;
            history.pushState = function(state, title, url) {
                __proxy.post_data(__proxy.absolute_url(url));
                url = __proxy.get_url(url);
                pushState.call(history, state, title, url);
            };
        }
        if (history.replaceState) {
            var replaceState = history.replaceState;
            history.replaceState = function(state, title, url) {
                __proxy.post_data(__proxy.absolute_url(url), {replace: true});
                url = __proxy.get_url(url);
                replaceState.call(history, state, title, url);
            };
        }
    }
})();
window.onload = function() {
    // duck duck go replace the url with https and remove the URI
    [].forEach.call(document.getElementsByTagName('form'), __proxy.fix_form);
};
document.addEventListener('DOMContentLoaded', function() {
    __proxy.post_data();
});
