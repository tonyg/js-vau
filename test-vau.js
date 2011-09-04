load("vau2.js");

var t_env = Vau.extend(Vau.baseenv);

function t(exp) {
    try {
	print(uneval(exp));
	var result = Vau.eval(exp, t_env);
	print(uneval(result));
    } catch (e) {
	print("EXCEPTION: " + uneval(e));
    }
    print();
    return result;
}

function te(str) {
    var exp;
    try {
	exp = Vau.read(str)[0];
    } catch (e) {
	print("EXCEPTION: " + uneval(e));
	return;
    }
    return t(exp);
}

function tx(str, expected) {
    var result = te(str);
    if (result !== expected) {
	print("MISMATCH: " + uneval(result) + " !== " + uneval(expected));
	print();
    }
}

var $define = new Vau.Symbol("$define!");
var $lambda = new Vau.Symbol("$lambda");
var $begin = new Vau.Symbol("$begin");
var $vau = new Vau.Symbol("$vau");
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
    print(uneval(Vau.read("(#keyword #ignore)")));
    print(uneval(Vau.read("($define! (hello) \"world\") (rest)")));
    print(uneval(Vau.read("; comment to end of line\n; another\n123456")));
    print(uneval(Vau.read("(this [is] legal)"))); // not yet it isn't
    // I'd like to reserve [...] for Clojure-style (list ...) syntax.
} catch (e) {
    print(uneval(e));
}

t("hi");
te("123");
te("($begin 123 234)");
t(Vau.arrayToList([$define, _print, print]));
t(Vau.arrayToList([_print, "hello", "there"]));
t(Vau.arrayToList([$if, true, 1, 2]));
t(Vau.arrayToList([$if, false, 1, 2]));
te("(list* 1 2 3)");

te('($define! $lambda ($vau (formals . body) dynenv (wrap (eval (list* $vau formals #ignore body) dynenv))))');
te('($define! list ($lambda x x))');
te('($define! cadr ($lambda (v) (car (cdr v))))');
te('(list 1 2 3)');
te('($define! map ($lambda (f xs) ($if (null? xs) xs (cons (f (car xs)) (map f (cdr xs))))))');
te('(map car (list (list 1 2) (list 2 3)))');
te('($define! $let ($vau (bindings . body) env (eval (list* (list* $lambda (map car bindings) body) (map cadr bindings)) env)))');
tx('($let ((x 123)) (print "hi") (print "there") x)', 123);

te('(print "hello")');
te('($lambda (x) x)');
tx('(($lambda (x) x) 123)', 123);
te('($define! first ($lambda (f s) f))');
te('($define! second ($lambda (f s) s))');
tx('(first 123 234)', 123);
tx('(second 123 234)', 234);
tx('"hello \\"world\\" \\\\ foo"', "hello \"world\" \\ foo");
te('#ignore');
tx('#t', true);
tx('#f', false);
