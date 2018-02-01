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
var __proxy = {};
__proxy.getLocation = function(href) {
    var l = document.createElement("a");
    l.href = href;
    return l;
};
__proxy.proxy_url = function(original) {
    var base = __proxy.location.replace(/__proxy_url=.*/, '__proxy_url=');
    var url;
    if (original.match(/^http/)) {
        url = original;
    } else if (original.match(/^\/\//)) {
        url = __proxy.parsed.protocol + url;
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
}
self.addEventListener('message', function message(event) {
    if (event.data.__proxy) {
        __proxy.url = event.data.__proxy.url;
        __proxy.location = event.data.__proxy.location;
        __proxy.parsed = __proxy.get_location(__proxy.url);
        (function(fetch) {
            window.fetch = function(url, options) {
                return fetch.call(window, proxy_url(url), options || {});
            };
        })(window.fetch);
        (function(importScripts) {
            window.importScripts = function(script) {
                return importScripts.call(window, proxy_url(script));
            };
        })(window.importScripts);
        self.removeEventListener('message', message);
    }
};
(function(fetch) {
    if (fetch) {
        window.fetch = function(url, options) {
            return fetch.call(null, __proxy.get_url(url), options || {});
        };
    }
})(window.fetch);
