<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

$uri = preg_replace("/__proxy_url=.*/", "__proxy_url=", $_SERVER['REQUEST_URI']);
if (!preg_match("/\?/", $uri)) {
    $uri .= "?__proxy_url=";
}
$self = 'http' . (isset($_SERVER['HTTPS']) ? 's' : '') . '://' . "{$_SERVER['HTTP_HOST']}{$uri}";

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

if (isset($_REQUEST['__proxy_url']) && !preg_match("/base64:$/", $_REQUEST['__proxy_url']) || $_REQUEST['__proxy_url'] != "") {
    $cookie_name = "PROXY_SESSION_ID";
    if (isset($_COOKIE[$cookie_name])) {
        $session_id = $_COOKIE[$cookie_name];
    } else {
        $session_id = md5(time());
        setcookie($cookie_name, $session_id);
        mkdir("sessions/" . $session_id);
    }
    $cookies = "sessions/" . $session_id . "/cookies.txt";
    if (preg_match("/base64:(.*)/", $_REQUEST['__proxy_url'], $match)) {
        $url = base64_decode($match[1]);
    } else {
        $url = $_REQUEST['__proxy_url'];
    }
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
    $proxy_url = 'var __proxy_url="' . $url . '";';
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

    $html_replace = array(
        "/(<style[^>]*>)(.*?)(<\/style>)/s" => function($match) use ($style_replace) {
            $style = preg_replace_callback_array($style_replace, $match[2]);
            return $match[1] . $style . $match[3];
        },
        "/<head>(?!<script>var __proxy_url)/" => function() use ($proxy_url) {
            return "<head><script>$proxy_url</script><script src=\"script.js\"></script>";
        }
    );
    $tags = implode("|", array("a", "script", "link", "iframe", "img", "object"));
    $attrs = implode("|", array("href", "src", "data", "data-src"));
    $any_tag = "\w+(?:\s*=\s*[\"'][^\"']*[\"'])?";
    $replace = array(
        "/(<(?:$tags)(?:\s+$any_tag)*\s*(?:$attrs)=[\"'])([^'\"]+)([\"'][^>]*>)/" => function($match) use ($self, $url) {
            $re = "/target\s*=\s*[\"'][^\"']*[\"']/";
            if (preg_match("/target=/", $match[1])) {
                $match[1] = preg_replace($re, 'target="_self"', $match[1]);
            }
            if (preg_match("/target=/", $match[3])) {
                $match[3] = preg_replace($re, 'target="_self"', $match[3]);
            }
            if (preg_match("%^$self%", $match[2]) || preg_match("/^(?:data:|#)/", $match[2])) {
                return $match[1] . $match[2] . $match[3];
            } else {
                return $match[1] . $self . proxy_url($url, $match[2]) . $match[3];
            }
        },
        "/(<(?:img|source)(?:\s+$any_tag)*\s*srcset=[\"'])([^'\"]+)([\"'])/" => function($match) use ($self, $url) {
            return $match[1] . preg_replace_callback("/([^\s]+)( [0-9]x,?)?/", function($match) use ($self, $url) {
                return $self . proxy_url($url, $match[1]) . isset($match[2]) ? " " . $match[2] : "";
            }, $match[2]) . $match[3];
        },
        "/(style=[\"'])([^'\"]+)([\"'])/" => function($match) use ($style_replace) {
            $style = preg_replace_callback_array($style_replace, $match[2]);
            return $match[1] . $style . $match[3];
        },
        "/(<form(?:\s+$any_tag)*\s*action=[\"'])([^'\"]+)([\"'][^>]*>)(?!<input name=\"__proxy_url\")/" => function($match) use ($self, $url) {
            return $match[1] . $self . $match[3] . '<input type="hidden" name="__proxy_url" value="' .
                proxy_url($url, $match[2]) . '"/>';
        }
    );
    header("Content-Type: $content_type");
    if (isset($_GET['__proxy_worker'])) {
        $page = file_get_contents("worker.js") . $page;
    }
    //header("Content-Type: text/plain");
    if (preg_match("/html|javascript/", $content_type)) { // javacript can contain html in strings
        $page = preg_replace_callback_array($replace, $page);
        if ($page == NULL) {
            switch(preg_last_error()) {
                case PREG_INTERNAL_ERROR:
                    echo "PREG_INTERNAL_ERROR";
                    break;
                case PREG_BACKTRACK_LIMIT_ERROR:
                    echo "PREG_BACKTRACK_LIMIT_ERROR";
                    break;
                case PREG_RECURSION_LIMIT_ERROR:
                    echo "PREG_RECURSION_LIMIT_ERROR";
                    break;
                case PREG_BAD_UTF8_ERROR:
                    echo "PREG_BAD_UTF8_ERROR";
                    break;
                case PREG_BAD_UTF8_OFFSET_ERROR:
                    echo "PREG_BAD_UTF8_OFFSET_ERROR";
                    break;
                case PREG_JIT_STACKLIMIT_ERROR:
                    echo "PREG_JIT_STACKLIMIT_ERROR";
                    break;
            }
        }
        if (preg_match("/html/", $content_type)) {
            $page = preg_replace_callback_array($html_replace, $page);
        }
        echo $page;
    } elseif (preg_match("/css/", $content_type)) {
        echo preg_replace_callback_array($style_replace, $page);
    } else {
        echo $page;
    }
} else {
    ?>
<!DOCTYPE HTML>
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
    <style>
form {
	position: absolute;
	top: 50%;
	left: 50%;
	-webkit-transform: translate(-50%, -50%);
	    -ms-transform: translate(-50%, -50%);
	        transform: translate(-50%, -50%);
	font-size: 16px;
}
input {
	border: 1px solid #dcdcdc;
	line-height: 1.3em;
	font-size: 1em;
	padding: 0.4em 1em;
	outline: none;
	-webkit-box-shadow: inset 0px 1px 0px 0px #ffffff;
	   -moz-box-shadow: inset 0px 1px 0px 0px #ffffff;
	        box-shadow: inset 0px 1px 0px 0px #ffffff;
}
#query {
    -webkit-border-radius: 20px 0 0 20px;
    -moz-border-radius: 20px 0 0 20px;
	border-radius: 20px 0 0 20px;
	margin-right: -10px;
	border-right: none;
}
#submit {
    -webkit-border-radius: 0 20px 20px 0;
    -moz-border-radius: 0 20px 20px 0;
	border-radius: 0 20px 20px 0;
	background: -webkit-gradient( linear, left top, left bottom, color-stop(0.05, #ededed), color-stop(1, #dfdfdf) );
	background: -moz-linear-gradient( center top, #ededed 5%, #dfdfdf 100% );
	filter: progid:DXImageTransform.Microsoft.gradient(startColorstr='#ededed', endColorstr='#dfdfdf');
	background-color: #ededed;
	text-indent: 0;
	display: inline-block;
	color: #777777;
	font-family: arial;
	font-size: 15px;
	font-weight: bold;
	font-style: normal;
	text-decoration: none;
	text-align: center;
	text-shadow: 1px 1px 0px #ffffff;
	cursor: pointer;
}
#submit:hover {
	background: -webkit-gradient( linear, left top, left bottom, color-stop(0.05, #dfdfdf), color-stop(1, #ededed) );
	background: -moz-linear-gradient( center top, #dfdfdf 5%, #ededed 100% );
	filter: progid:DXImageTransform.Microsoft.gradient(startColorstr='#dfdfdf', endColorstr='#ededed');
	background-color: #dfdfdf;
}
#submit:active {
	position: relative;
	top: 1px;
}
</style>
</head>
<body>
    <form action="" method="GET">
        <input id="query" placeholder="https://duckduckgo.com/"/>
        <input id="__proxy_url" type="hidden" name="__proxy_url" value="base64%3AaHR0cHM6Ly9kdWNrZHVja2dvLmNvbS8%3D"/>
        <input id="submit" type="submit" value="go"/>
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
    </script>
</body>
</html>
<?php } ?>
