var Vau = {};

Vau.Symbol = function (name) {
    this.name = name;
};

Vau.eval = function(exp, env) {
    //print("** " + uneval(exp));//, uneval(env));
    if (!(exp instanceof Array)) {
	if (exp instanceof Vau.Symbol) {
	    var val = env[exp.name];
	    if (val === undefined) {
		throw {message: "Undefined variable",
		       variable: exp};
	    }
	    return val;
	} else {
	    return exp;
	}
    }

    // It's an Array.
    var rator = Vau.eval(exp[0], env);

    if (typeof rator === "function") {
	return rator.apply(null, Vau.evalargs(exp, env, []));
    }

    if (typeof rator === "object") {
	return rator.invoke(exp, env);
    }

    throw {message: "Attempt to invoke non-callable",
	   rator: rator,
	   exp: exp};
};

Vau.evalargs = function (exp, env, result) {
    for (var i = 1; i < exp.length; i++) {
	result.push(Vau.eval(exp[i], env));
    }
    return result;
};

Vau.Keyword = function (name) {
    // Like a Symbol, but self-evaluating.
    this.name = name;
};

Vau.extend = function (baseenv) {
    function c() {}
    c.prototype = baseenv;
    return new c();
};

Vau.ignore = new Vau.Keyword("#ignore");

Vau.Operative = function (formals, envformal, body, staticenv) {
    this.formals = formals;
    this.envformal = envformal;
    this.body = body;
    this.staticenv = staticenv;

    this.checkFormals();
};

Vau.Operative.prototype.checkFormals = function () {
    for (var i = 0; i < this.formals.length; i++) {
	if (this.formals[i].name === "#rest" && i !== this.formals.length - 2) {
	    throw {message: "#rest arg must be last in formals list",
		   formals: this.formals};
	}
    }
};

Vau.Operative.prototype.invoke = function (exp, dynenv) {
    var staticenv = Vau.extend(this.staticenv);
    for (var i = 0; i < this.formals.length; i++) {
	var formal = this.formals[i];
	if (formal.name === "#ignore") {
	    continue;
	} else if (formal.name === "#rest") {
	    staticenv[this.formals[this.formals.length - 1].name] = exp.slice(i + 1);
	    break; // done with the formals list at this point
	} else {
	    staticenv[formal.name] = exp[i + 1];
	}
    }
    if (this.envformal.name !== "#ignore") {
	staticenv[this.envformal.name] = dynenv;
    }
    return Vau.eval(this.body, staticenv);
};

Vau.Applicative = function (underlying) {
    this.underlying = underlying;
};

Vau.Applicative.prototype.invoke = function (exp, dynenv) {
    var newexp = [this.underlying];
    Vau.evalargs(exp, dynenv, newexp);
    return Vau.eval(newexp, dynenv);
};

Vau.Primitive = function (underlying) {
    this.underlying = underlying;
};

Vau.Primitive.prototype.invoke = function (exp, dynenv) {
    var newargs = exp.slice(0);
    newargs[0] = dynenv;
    return this.underlying.apply(null, newargs);
};

Vau.read = function (str) {
    var stack = [];
    var closers = [];
    var result = undefined;
    var match;

    var ws_re = /^\s+/;
    var num_re = /^-?[0-9]+(\.[0-9]*)?([eE][-+]?[0-9]+)?/;
    var str_re = /^"([^\\"]|\\"|\\\\)*"/;
    var kw_re = /**/ /^#[-!@$%^&*_=+:<>/?a-zA-Z][-!@$%^&*_=+:<>/?a-zA-Z0-9]*/;
    var sym_re = /**/ /^[-!@$%^&*_=+:<>/?a-zA-Z][-!@$%^&*_=+:<>/?a-zA-Z0-9]*/;
    // Those /**/ comments are to unconfuse emacs' lexer.

    function probe(re) {
	match = str.match(re);
	if (match) {
	    match = match[0];
	    str = str.substring(match.length);
	    return true;
	} else {
	    return false;
	}
    }

    function emit(v) {
	if (stack.length) {
	    stack[stack.length - 1].push(v);
	} else {
	    result = v;
	}
    }

    function stackPush(closer) {
	str = str.substring(1);
	stack.push([]);
	closers.push(closer);
    }

    while (str && (result === undefined)) {
	if (probe(ws_re)) {
	} else if (probe(num_re)) {
	    emit(+match); // converts to a number (!!!)
	} else if (probe(kw_re)) {
	    switch (match) {
	      case "#t": emit(true); break;
	      case "#f": emit(false); break;
	      default: emit(new Vau.Keyword(match)); break;
	    }
	} else if (probe(str_re)) {
	    var raw = match.substring(1, match.length - 1);
	    emit(raw.replace(/\\("|\\)/g, function (wholematch, escaped) { return escaped; }));
	} else if (probe(sym_re)) {
	    emit(new Vau.Symbol(match));
	} else if (str.charAt(0) === '(') {
	    stackPush(')');
	// } else if (str.charAt(0) === '[') {
	//     stackPush(']');
	} else if (closers.length && str.charAt(0) === closers[closers.length - 1]) {
	    str = str.substring(1);
	    closers.pop();
	    emit(stack.pop());
	} else {
	    throw {message: "Illegal input",
		   str: str}
	}
    }

    return [result, str];
};

Vau.coreenv = {};

Vau.coreenv.eval = Vau.eval; /* ! */

Vau.coreenv["$define!"] = new Vau.Primitive(function (dynenv, name, valexp) {
    var value = Vau.eval(valexp, dynenv);
    if (!(name instanceof Vau.Symbol)) {
	throw {message: "$define!: needs symbol name",
	       name: name};
    }
    dynenv[name.name] = value;
    return value;
});

Vau.coreenv.$begin = new Vau.Primitive(function (dynenv /* , expr ... */) {
    for (var i = 1; i < arguments.length - 1; i++) {
	Vau.eval(arguments[i], dynenv);
    }
    return Vau.eval(arguments[arguments.length - 1], dynenv);
});

Vau.coreenv.$vau = new Vau.Primitive(function (dynenv, formals, envformal /* , body ... */) {
    var body = Array.prototype.slice.call(arguments, 3);
    if (body.length === 1) {
	body = body[0];
    } else {
	body.unshift(Vau.coreenv.$begin);
    }
    return new Vau.Operative(formals, envformal, body, dynenv);
});

Vau.coreenv.wrap = function (underlying) {
    return new Vau.Applicative(underlying);
};

Vau.coreenv.unwrap = function (applicative) {
    return applicative.underlying;
};

Vau.baseenv = Vau.extend(Vau.coreenv);

Vau.baseenv.$if = new Vau.Primitive(function (dynenv, test, trueBranch, falseBranch) {
    if (Vau.eval(test, dynenv)) {
	return Vau.eval(trueBranch);
    } else {
	return Vau.eval(falseBranch);
    }
});

Vau.baseenv.$let = new Vau.Primitive(function (dynenv, bindings /* , body ... */) {
    var body = Array.prototype.slice.call(arguments, 2);
    var formals = [];
    var actualexprs = [];
    for (var i = 0; i < bindings.length; i++) {
	formals.push(bindings[i][0]);
	actualexprs.push(bindings[i][1]);
    }
    body.unshift(Vau.ignore); /* envformal */
    body.unshift(formals);
    body.unshift(Vau.coreenv.$vau);
    actualexprs.unshift(body);
    return Vau.eval(actualexprs, dynenv);
});

Vau.baseenv["list*"] = function () {
    return Array.prototype.slice.call(arguments, 0, arguments.length - 1)
	.concat(arguments[arguments.length - 1]);
};

Vau.baseenv["make-base-env"] = function () {
    return Vau.extend(Vau.baseenv);
};
