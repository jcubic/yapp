var __proxy = {};
var getLocation = function(href) {
    var l = document.createElement("a");
    l.href = href;
    return l;
};

function proxy_url(original) {
    var base = __proxy.location.replace(/__proxy_url=.*/, '__proxy_url=');
    var url;
    if (original.match(/^http/)) {
        url = original;
    } else if (original.match(/^\/\//)) {
        url = __proxy.parsed.protocol + url;
    } else if (original.match(/^\//)) {
        url = __proxy.parsed.protocol + '//' + __proxy.parsed.host + original;
    } else {
        url = __proxy.url + original;
    }
    if (location.href == original) {
        return original;
    } else {
        return base + 'base64:' + btoa(url);
    }
}
self.addEventListener('message', function message(event) {
    if (event.data.__proxy) {
        __proxy = event.data.__proxy;
        __proxy.parsed = getLocation(__proxy.url);
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
