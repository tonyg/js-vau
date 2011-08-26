load("vau.js");

var t_env = Vau.extend(Vau.baseenv);

function t(exp) {
    try {
	print(uneval(exp));
	print(uneval(Vau.eval(exp, t_env)));
    } catch (e) {
	print("EXCEPTION: " + uneval(e));
    }
    print();
}

function te(str) {
    var exp;
    try {
	exp = Vau.read(str)[0];
    } catch (e) {
	print("EXCEPTION: " + uneval(e));
	return;
    }
    t(exp);
}

var $define = new Vau.Symbol("$define!");
var $lambda = new Vau.Symbol("$lambda");
var $begin = new Vau.Symbol("$begin");
var $$rest = new Vau.Keyword("#rest");
var $vau = new Vau.Symbol("$vau");
var $let = new Vau.Symbol("$let");
var $if = new Vau.Symbol("$if");
var listStar = new Vau.Symbol("list*");
var wrap = new Vau.Symbol("wrap");

var x = new Vau.Symbol("x");
var formals = new Vau.Symbol("formals");
var dynenv = new Vau.Symbol("dynenv");
var body = new Vau.Symbol("body");
var _eval = new Vau.Symbol("eval");
var _print = new Vau.Symbol("print");

try {
    print(uneval(Vau.read("   ")));
    print(uneval(Vau.read(" -123.45e2")));
    print(uneval(Vau.read("(this [is] legal)"))); // not yet it isn't
    // I'd like to reserve [...] for Clojure-style (list ...) syntax.
    print(uneval(Vau.read("(#rest #ignore)")));
    print(uneval(Vau.read("($define! (hello) \"world\") (rest)")));
} catch (e) {
    print(uneval(e));
}

t("hi");
t(123);
t([$begin, 123, 234]);
t([$define, _print, print]);
t([_print, "hello", "there"]);
t([$let, [[x, 123]], [_print, "hi"], [_print, "there"], x]);
t([$if, true, 1, 2]);
t([$if, false, 1, 2]);

t([$define, $lambda,
   [$vau, [formals, $$rest, body], dynenv,
    [wrap,
     [_eval, [listStar, $vau, formals, Vau.ignore, body], dynenv]]]]);

te('(print "hello")');
te('($lambda (x) x)');
te('(($lambda (x) x) 123)');
te('($define! first ($lambda (f s) f))');
te('($define! second ($lambda (f s) s))');
te('(first 123 234)');
te('(second 123 234)');
te('"hello \\"world\\" \\\\ foo"');
te('#ignore');
te('#t');
te('#f');
