var Vau = {};

//---------------------------------------------------------------------------
// Data structures, utilities, and reader

Vau.Symbol = function (name) {
    this.name = name;
};

Vau.Keyword = function (name) {
    // Like a Symbol, but self-evaluating.
    this.name = name;
};

Vau.Pair = function (a, d) {
    this.car = a;
    this.cdr = d;
};

Vau.reverse = function (xs, rightmost) {
    var result = rightmost || null;
    while (xs) {
	result = new Vau.Pair(xs.car, result);
	xs = xs.cdr;
    }
    return result;
};

Vau.listToArray = function (xs) {
    var result = [];
    while (xs) {
	result.push(xs.car);
	xs = xs.cdr;
    }
    return result;
};

Vau.arrayToList = function (a, rightmost) {
    var result = rightmost || null;
    for (var i = a.length - 1; i >= 0; i--) {
	result = new Vau.Pair(a[i], result);
    }
    return result;
};

Vau.read = function (str) {
    var stack = null;
    var closers = null;
    var result = undefined;
    var match;

    var ws_re = /^(\s+|;.*)/;
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
	if (stack !== null) {
	    stack.car = new Vau.Pair(v, stack.car);
	} else {
	    result = v;
	}
    }

    function stackPush(closer) {
	str = str.substring(1);
	stack = new Vau.Pair(null, stack);
	closers = new Vau.Pair(closer, closers);
    }

    function badInput() {
	throw {message: "Illegal input", str: str};
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
	} else if (closers === null) {
	    badInput();
	} else if (str.charAt(0) === '.') {
	    if (closers.car !== ')') badInput();
	    str = str.substring(1);
	    closers = new Vau.Pair('.', closers);
	} else if (str.charAt(0) === ')' && closers.car === '.') {
	    str = str.substring(1);
	    closers = closers.cdr.cdr; // both the '.' and the ')'
	    var tail = stack.car.car;
	    var val = stack.car.cdr;
	    stack = stack.cdr;
	    emit(Vau.reverse(val, tail));
	} else if (str.charAt(0) === closers.car) {
	    str = str.substring(1);
	    closers = closers.cdr;
	    var val = stack.car;
	    stack = stack.cdr;
	    emit(Vau.reverse(val));
	} else {
	    badInput();
	}
    }

    return [result, str];
};

//---------------------------------------------------------------------------
// Evaluator core, Operatives, Applicatives, Primitives

Vau.eval = function (exp, env) {
    var vm = new Vau.VM(exp, env);
    return vm.run();
};

Vau.VM = function (exp, env) {
    this.a = null;
    this.k = null;
    this.pushEval(exp, env);
};

Vau.VM.prototype.pushEval = function (exp, env) {
    this.a = exp;
    this.k = new Vau.KEval(env, this.k);
};

Vau.VM.prototype.run = function () {
    while (this.k) {
	var frame = this.k;
	//print('/// ' + uneval(this.a) + ", " + uneval(frame.constructor.name));
	this.k = "deliberately undefined continuation frame";
	frame.invoke(this);
    }
    return this.a;
};

Vau.KEval = function (env, k) {
    this.env = env;
    this.k = k;
};

Vau.KEval.name = "KEval";

Vau.KEval.prototype.invoke = function (vm) {
    if (vm.a instanceof Vau.Symbol) {
	var val = this.env[vm.a.name];
	if (val === undefined) {
	    throw {message: "Undefined variable",
		   variable: vm.a};
	}
	vm.a = val;
	vm.k = this.k;
    } else if (!(vm.a instanceof Vau.Pair)) {
	// vm.a = vm.a;
	vm.k = this.k;
    } else {
	vm.k = new Vau.KCombination(vm.a.cdr, this.env, this.k);
	vm.pushEval(vm.a.car, this.env);
    }
};

Vau.KCombination = function (argtree, env, k) {
    this.argtree = argtree;
    this.env = env;
    this.k = k;
};

Vau.KCombination.name = "KCombination";

Vau.KCombination.prototype.invoke = function (vm) {
    if (typeof vm.a === "function") {
	Vau.evalargs(vm, this.argtree, null, this.env, new Vau.KPrimitiveApplier(vm.a, this.k));
    } else if (typeof vm.a === "object" && vm.a !== null && vm.a.invokeOp) {
	vm.k = this.k;
	vm.a.invokeOp(vm, this.env, this.argtree);
    } else {
	throw {message: "Attempt to invoke non-callable",
	       rator: vm.a,
	       argtree: this.argtree};
    }
};

Vau.KPrimitiveApplier = function (rator, k) {
    this.rator = rator;
    this.k = k;
};

Vau.KPrimitiveApplier.name = "KPrimitiveApplier";

Vau.KPrimitiveApplier.prototype.invoke = function (vm) {
    vm.k = this.k;
    vm.a = this.rator.apply(null, Vau.listToArray(vm.a));
};

Vau.evalargs = function (vm, args, revacc, env, k) {
    if (args === null) {
	vm.a = Vau.reverse(revacc);
	vm.k = k;
    } else {
	vm.k = new Vau.KEvalArgs(args.cdr, revacc, env, k);
	vm.pushEval(args.car, env);
    }
};

Vau.KEvalArgs = function (remainder, revacc, env, k) {
    this.remainder = remainder;
    this.revacc = revacc;
    this.env = env;
    this.k = k;
};

Vau.KEvalArgs.name = "KEvalArgs";

Vau.KEvalArgs.prototype.invoke = function (vm) {
    Vau.evalargs(vm, this.remainder, new Vau.Pair(vm.a, this.revacc), this.env, this.k);
};

Vau.extend = function (baseenv) {
    function c() {}
    c.prototype = baseenv;
    return new c();
};

Vau.Operative = function (formals, envformal, body, staticenv) {
    this.formals = formals;
    this.envformal = envformal;
    this.body = body;
    this.staticenv = staticenv;
};

Vau.match = function (env, pattern, value) {
    if (pattern instanceof Vau.Keyword && pattern.name === "#ignore") {
	// no-op.
    } else if (pattern instanceof Vau.Symbol) {
	env[pattern.name] = value;
    } else if (pattern instanceof Vau.Pair && value instanceof Vau.Pair) {
	Vau.match(env, pattern.car, value.car);
	Vau.match(env, pattern.cdr, value.cdr);
    } else if (pattern === value) {
	// no-op.
    } else {
	throw {message: "Argument tree mismatch",
	       pattern: pattern,
	       value: value};
    }
};

Vau.Operative.prototype.invokeOp = function (vm, dynenv, argtree) {
    var staticenv = Vau.extend(this.staticenv);
    Vau.match(staticenv, this.formals, argtree);
    if (this.envformal.name !== "#ignore") {
	staticenv[this.envformal.name] = dynenv;
    }
    vm.pushEval(this.body, staticenv);
};

Vau.Applicative = function (underlying) {
    this.underlying = underlying;
};

Vau.Applicative.prototype.invokeOp = function (vm, env, argtree) {
    Vau.evalargs(vm, argtree, null, env, new Vau.KApplicativeApplier(this.underlying, env, vm.k));
};

Vau.KApplicativeApplier = function (underlying, env, k) {
    this.underlying = underlying;
    this.env = env;
    this.k = k;
};

Vau.KApplicativeApplier.name = "KApplicativeApplier";

Vau.KApplicativeApplier.prototype.invoke = function (vm) {
    vm.k = this.k;
    vm.pushEval(new Vau.Pair(this.underlying, vm.a), this.env);
};

Vau.Primitive = function (underlying) {
    this.underlying = underlying;
};

Vau.Primitive.prototype.invokeOp = function (vm, env, argtree) {
    this.underlying(vm, env, argtree);
};

//---------------------------------------------------------------------------
// Core environment

Vau.coreenv = {};

Vau.coreenv.eval = new Vau.Primitive(function (vm, dynenv, argtree) {
    vm.k = new Vau.KEvalPrim1(argtree.car, dynenv, vm.k);
    vm.pushEval(argtree.cdr.car, dynenv);
});

Vau.KEvalPrim1 = function (expexp, env, k) {
    this.expexp = expexp;
    this.env = env;
    this.k = k;
};

Vau.KEvalPrim1.name = "KEvalPrim1";

Vau.KEvalPrim1.prototype.invoke = function (vm) {
    vm.k = new Vau.KEvalPrim2(vm.a, this.k);
    vm.pushEval(this.expexp, this.env);
};

Vau.KEvalPrim2 = function (env, k) {
    this.env = env;
    this.k = k;
};

Vau.KEvalPrim2.name = "KEvalPrim2";

Vau.KEvalPrim2.prototype.invoke = function (vm) {
    vm.k = this.k;
    vm.pushEval(vm.a, this.env);
};

Vau.coreenv["$define!"] = new Vau.Primitive(function (vm, env, argtree) {
    var name = argtree.car;
    if (!(name instanceof Vau.Symbol)) {
	throw {message: "$define!: needs symbol name",
	       name: name};
    }
    vm.k = new Vau.KDefine(env, name, vm.k);
    vm.pushEval(argtree.cdr.car, env);
});

Vau.KDefine = function (env, name, k) {
    this.env = env;
    this.name = name;
    this.k = k;
};

Vau.KDefine.name = "KDefine";

Vau.KDefine.prototype.invoke = function (vm) {
    this.env[this.name.name] = vm.a;
    vm.k = this.k;
};

Vau.coreenv.$begin = new Vau.Primitive(function (vm, env, argtree) {
    if (argtree === null) {
	vm.a = undefined;
    } else {
	Vau.begin1(vm, env, argtree);
    }
});

Vau.begin1 = function (vm, env, argtree) {
    if (argtree.cdr !== null) {
	vm.k = new Vau.KBegin(argtree.cdr, env, vm.k);
    }
    vm.pushEval(argtree.car, env);
};

Vau.KBegin = function (exps, env, k) {
    this.exps = exps;
    this.env = env;
    this.k = k;
};

Vau.KBegin.name = "KBegin";

Vau.KBegin.prototype.invoke = function (vm) {
    vm.k = this.k;
    Vau.begin1(vm, this.env, this.exps);
};

Vau.coreenv.$vau = new Vau.Primitive(function (vm, dynenv, argtree) {
    var body = argtree.cdr.cdr;
    if (body.cdr === null) {
	body = body.car;
    } else {
	body = new Vau.Pair(Vau.coreenv.$begin, body);
    }
    vm.a = new Vau.Operative(argtree.car, argtree.cdr.car, body, dynenv);
});

Vau.coreenv.wrap = function (underlying) {
    return new Vau.Applicative(underlying);
};

Vau.coreenv.unwrap = function (applicative) {
    return applicative.underlying;
};

//---------------------------------------------------------------------------
// Base environment (extends core environment)

Vau.baseenv = Vau.extend(Vau.coreenv);

Vau.baseenv.$if = new Vau.Primitive(function (vm, dynenv, argtree) {
    vm.k = new Vau.KIf(argtree.cdr.car, argtree.cdr.cdr.car, dynenv, vm.k);
    vm.pushEval(argtree.car, dynenv);
});

Vau.KIf = function (trueBranch, falseBranch, env, k) {
    this.trueBranch = trueBranch;
    this.falseBranch = falseBranch;
    this.env = env;
    this.k = k;
};

Vau.KIf.name = "KIf";

Vau.KIf.prototype.invoke = function (vm) {
    vm.k = this.k;
    vm.pushEval(vm.a ? this.trueBranch : this.falseBranch, this.env);
};

Vau.baseenv.cons = function (a, d) {
    return new Vau.Pair(a, d);
};

Vau.baseenv["pair?"] = function (x) {
    return x instanceof Vau.Pair;
};

Vau.baseenv["null?"] = function (x) {
    return x === null;
};

Vau.baseenv.car = function (x) { return x.car; };
Vau.baseenv.cdr = function (x) { return x.cdr; };

Vau.baseenv["list*"] = function () {
    return Vau.arrayToList(Array.prototype.slice.call(arguments, 0, arguments.length - 1),
			   arguments[arguments.length - 1]);
};

Vau.baseenv["make-base-env"] = function () {
    return Vau.extend(Vau.baseenv);
};
