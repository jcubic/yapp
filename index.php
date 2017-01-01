<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);


function get_self() {
    $uri = preg_replace("/__proxy_url=.*/", "__proxy_url=", $_SERVER['REQUEST_URI']);
    if (!preg_match("/\?/", $uri)) {
        $uri .= "?__proxy_url=";
    }
    return 'http' . (isset($_SERVER['HTTPS']) ? 's' : '') . '://' . "{$_SERVER['HTTP_HOST']}{$uri}";
}
function encodeURI($uri) {
    return preg_replace_callback("/[^0-9a-z_.!~*'();,\/@&+$#-]/i", function($match) {
        return sprintf('%%%02X', ord($match[0]));
    }, $uri);
}
function proxy_url($page_url, $url) {
    $parsed = parse_url($page_url);
    if (!preg_match("%^(http|//)%", $url)) {
        $base = $parsed['scheme'] . "://" . $parsed['host'] .
            (isset($parsed['port']) ? ":" . $parsed['port'] : "");
        $dir = (isset($parsed['path']) ? preg_replace("%[^/]+$%", "", $parsed['path']) : "/");
        if (preg_match("%^/%", $url)) {
            $url = $base . "/" . $url;
        } else {
            $url =  $base . $dir . $url;
        }
    } else if (preg_match("%^//%", $url)) {
        $url = $parsed['scheme'] . ":" . $url;
    }
    $url = preg_replace("%(?<!http:)(?<!https:)//%", "/", $url);
    return 'base64:' . base64_encode(preg_replace("/&amp;/", "&", $url));
}
function get_params() {
    $data = array();
    foreach ($_GET as $key => $value) {
        if ($key != "__proxy_url") {
            $data[$key] = $value;
        }
    }
    return http_build_query($data);
}
function session_init() {
    $cookie_name = "PROXY_SESSION_ID";
    if (isset($_COOKIE[$cookie_name])) {
        $session_id = $_COOKIE[$cookie_name];
    } else {
        $session_id = md5(time());
        setcookie($cookie_name, $session_id);
    }
    if (!is_dir("sessions")) {
        mkdir("sessions");
    }
    if (!is_dir("sessions/" . $session_id)) {
        mkdir("sessions/" . $session_id);
    }
    return $session_id;
}

$session_id = session_init();
$self = get_self();
$cookies = "sessions/" . $session_id . "/cookies.txt";
if (isset($_REQUEST['__proxy_url']) && (!preg_match("/base64$/", $_REQUEST['__proxy_url']) || $_REQUEST['__proxy_url'] != "")) {
    $url = urldecode($_REQUEST['__proxy_url']);
    if (preg_match("/base64:(.*)/",$url, $match)) {
        $url = base64_decode($match[1]);
    } else {
        $url = $_REQUEST['__proxy_url'];
    }
    $url = html_entity_decode($url);
    $params = get_params();
    if ($params) {
        if (preg_match("/\?/", $url)) {
            $url .= '&' . $params;
        } else {
            $url .= '?' . $params;
        }
    }

    $headers = array();
    if (isset($_SERVER["HTTP_REFERER"]) && preg_match("/base64:(.*)/", $_SERVER["HTTP_REFERER"], $match)) {
        $headers[] = "Referer: " . base64_decode($match[1]);
    }
    if (isset($_SERVER["CONTENT_TYPE"])) {
        $headers[] = "Content-Type: " . $_SERVER["CONTENT_TYPE"];
    } elseif (isset($_SERVER["HTTP_CONTENT_TYPE"])) {
        $headers[] = "Content-Type: " . $_SERVER["HTTP_CONTENT_TYPE"];
    }
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, FALSE);
    curl_setopt($ch, CURLOPT_USERAGENT, $_SERVER["HTTP_USER_AGENT"]);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_HEADER, 0);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
    curl_setopt($ch, CURLOPT_ENCODING, "");
    curl_setopt($ch, CURLOPT_COOKIESESSION, 1);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
    curl_setopt($ch, CURLOPT_COOKIEFILE, $cookies);
    curl_setopt($ch, CURLOPT_COOKIEJAR, $cookies);
    curl_setopt($ch, CURLOPT_URL, $url);
    $page = curl_exec($ch);
    $url = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $content_type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $proxy_object = 'var __proxy = {url: "' . $url . '"};';
    $style_replace = array(
        "/(@import\s+[\"'])([^'\"]+)([\"'])/" => function($match) use ($self, $url) {
            return $match[1] . $self . proxy_url($url, $match[2]) . $match[3];
        },
        '/url\(([\'"]?)([^\)]+)(\1\))/' => function($match) use ($self, $url) {
            if (preg_match("/^data:/", $match[2])) {
                return "url(" . $match[1] . $match[2] . $match[3];
            } else {
                return "url(" . $match[1] . $self . proxy_url($url, $match[2]) . $match[3];
            }
        }
    );
    $any_attr = "\w+(?:\s*=\s*[\"'][^\"']*[\"'])?";
    $html_replace = array(
        "/(<style[^>]*>)(.*?)(<\/style>)/s" => function($match) use ($style_replace) {
            $style = preg_replace_callback_array($style_replace, $match[2]);
            return $match[1] . $style . $match[3];
        },
        "/<head>(?!<script>var __proxy)/" => function() use ($proxy_object) {
            return "<head><script>$proxy_object</script><script src=\"script.js\"></script>";
        },
        '/(style=(["\']))(((?!\2).)*)(\2)/' => function($match) use ($style_replace) {
            $style = preg_replace_callback_array($style_replace, $match[3]);
            return $match[1] . $style . $match[4];
        },
        "/(<form(?:\s+(?!action)$any_attr)*\s*)((action=[\"'])([^'\"]+)([\"']))?([^>]*>)(?!<input name=\"__proxy_url\")/" => function($match) use ($self, $url) {
            $input = '<input type="hidden" name="__proxy_url" value="' . proxy_url($url, $match[4]) . '"/>';
            if ($match[2]) {
                return $match[1] . $match[3] . $self . $match[5] . $match[6] . $input;
            } else {
                return $match[1] . $match[3] . $match[6] . $input;
            }
        }
    );
    $tags = implode("|", array("a", "script", "link", "iframe", "img", "object"));
    $attrs = implode("|", array("href", "src", "data", "data-src", "data-link")); // data-src and data-link from duckduckgo
    
    $replace = array(
        "/([.}; ])location(.href)?\s*=/" => function($match) {
            return $match[1] . "loc.href=";
        },
        "/(<(?:$tags)(?:\s+$any_attr)*\s*(?:$attrs)=[\"'])([^'\"]+)([\"'][^>]*>)/" => function($match) use ($self, $url) {
            $url_re = "/^(https?:)?\/\//";
            $uri_re = "/^(?:\/?(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})+)+(\??(&?[^=]+=?[^=]*)*)$/";
            $var_plus =  "/^([\$A-Z_][0-9A-Z_\$]*|\s+|\+)+$/i"; // some site have string concatenetion src="+e+"
            $target_re = "/(target\s*=\s*[\"'])[^\"']*([\"'])/";
            if (preg_match("/target=/", $match[1])) {
                $match[1] = preg_replace($target_re, '$1_self$2"', $match[1]);
            }
            if (preg_match("/target=/", $match[3])) {
                $match[3] = preg_replace($target_re, '$1_self$2', $match[3]);
            }
            if (preg_match("%^$self%", $match[2]) || preg_match("/^(?:data:|#)/", $match[2]) ||
                !(preg_match($uri_re, $match[2]) || preg_match($url_re, $match[2])) || preg_match($var_plus, $match[2])) {
                return $match[1] . $match[2] . $match[3];
            } else {
                if (preg_match("/redirect=([^&]+)/", $match[2])) {
                    $match[2] = preg_replace_callback("/redirect=([^&]+)/i", function($match) use ($self, $url) {
                        return 'redirect=' . encodeURI($self . proxy_url($url, $match[1]));
                    }, $match[2]);
                }
                return $match[1] . $self . proxy_url($url, $match[2]) . $match[3];
            }
        },
        "/(<(?:img|source)(?:\s+$any_attr)*\s*srcset=[\"'])([^'\"]+)([\"'])/" => function($match) use ($self, $url) {
            return $match[1] . preg_replace_callback("/([^\s]+)( [0-9.]+x,?)?/", function($match) use ($self, $url) {
                return $self . proxy_url($url, $match[1]) . (isset($match[2]) ? $match[2] : "");
            }, $match[2]) . $match[3];
        }
        
    );
    header("Content-Type: $content_type");
    if (isset($_GET['__proxy_worker'])) {
        $page = file_get_contents("worker.js") . $page;
    }
    if (preg_match("/html|javascript/", $content_type)) { // javacript can contain html in strings
        $page = preg_replace_callback_array($replace, $page);
        if (preg_match("/html/", $content_type)) {
            $page = preg_replace_callback_array($html_replace, $page);
        }
        echo $page;
    } elseif (preg_match("/css/", $content_type)) {
        echo preg_replace_callback_array($style_replace, $page);
    } else {
        echo $page;
    }
} elseif (isset($_REQUEST["action"])) {
    if ($_REQUEST["action"] == "clear_cookies") {
        if (file_exists($cookies)) {
            echo unlink($cookies) ? "true" : "false";
        } else {
            echo "false";
        }
    }
} else {
?><!DOCTYPE HTML>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="utf-8" />
    <title>Yapp Proxy demo using jQuery UI dialog and iframe</title>
    <meta name="Description" content=""/>
    <link rel="apple-touch-icon" sizes="180x180" href="favicon/apple-touch-icon.png">
    <link rel="icon" type="image/png" href="favicon/favicon-32x32.png" sizes="32x32">
    <link rel="icon" type="image/png" href="favicon/favicon-16x16.png" sizes="16x16">
    <link rel="manifest" href="favicon/manifest.json">
    <link rel="mask-icon" href="favicon/safari-pinned-tab.svg" color="#5bbad5">
    <link rel="shortcut icon" href="favicon/favicon.ico">
    <meta name="msapplication-config" content="favicon/browserconfig.xml">
    <meta name="theme-color" content="#ffffff">
    <!--[if IE]>
    <script src="http://html5shim.googlecode.com/svn/trunk/html5.js"></script>
    <![endif]-->
    <link href="css/style.css" rel="stylesheet"/>
    <script src="https://cdn.rawgit.com/github/fetch/master/fetch.js"></script>
</head>
<body>
    <form action="" method="GET" class="search">
        <input id="query" placeholder="https://duckduckgo.com/"/>
        <input id="__proxy_url" type="hidden" name="__proxy_url" value="base64%3AaHR0cHM6Ly9kdWNrZHVja2dvLmNvbS8%3D"/>
        <input id="submit" type="submit" value="go"/>
        <button class="button">clear cookies</button>
    </form>
    <script>
        var query = document.getElementById('query');
        var __proxy_url = document.getElementById('__proxy_url');
        query.addEventListener('keyup', function() {
            var url = query.value;
            if (!url.match(/^http/)) {
                if (url.match(/^\/\//)) {
                    url = 'http:' + url;
                } else {
                    url = 'http://' + url;
                }
            }
            __proxy_url.value = 'base64:' + btoa(url);
        });
        document.querySelector('.button').addEventListener('click', function(e) {
            fetch('./?action=clear_cookies', {credentials: "same-origin"}).then(function(response) {
                return response.json();
            }).then(function(data) {
                alert('cookies ' + (!data ? 'not ' : '') + 'cleared');
            });
            e.preventDefault();
        });
    </script>
</body>
</html>
<?php } ?>
