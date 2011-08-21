#lang racket/base

(struct operative (formals envformal body staticenv) #:transparent)
(struct applicative (underlying) #:transparent)
(struct primitive (underlying) #:transparent)

(define (vau-eval exp env)
  (let v ((exp exp))
    (cond
     ((symbol? exp) (lookup exp env))
     ((not (pair? exp)) exp)
     (else (let ((rator (v (car exp))))
	     (cond
	      ((procedure? rator) (apply rator (map v (cdr exp))))
	      ((operative? rator) (vau-eval (operative-body rator)
					    (extend (operative-staticenv rator)
						    (bind! (vau-match (operative-formals rator)
								      (cdr exp))
							   (operative-envformal rator)
							   env))))
	      ((applicative? rator) (v (cons (applicative-underlying rator)
					     (map v (cdr exp)))))
	      ((primitive? rator) (apply (primitive-underlying rator) (cons env (cdr exp))))
	      (else (error 'vau-eval "Not a callable: ~v in exp: ~v" rator exp))))))))

(define (lookup name env)
  (if (null? env)
      (error 'vau-eval "Variable not found: ~v" name)
      (hash-ref (car env) name (lambda () (lookup name (cdr env))))))

(define (extend env rib)
  (cons rib env))

(define (bind! rib name value)
  (if (eq? name '#:ignore)
      rib
      (begin (hash-set! rib name value)
	     rib)))

(define (empty-env)
  '())

(define (empty-rib)
  (make-hash))

(define (vau-match p v)
  (let m ((p p)
	  (v v)
	  (rib (empty-rib)))
    (cond
     ((pair? p) (if (pair? v)
		    (m (cdr p) (cdr v) (m (car p) (car v) rib))
		    (error 'vau-match "Expected a pair matching ~v; got ~v" p v)))
     ((symbol? p) (bind! rib p v))
     ((eq? p '#:ignore) rib)
     (else (if (eqv? p v)
	       rib
	       (error 'vau-match "Expected a literal eqv? to ~v; got ~v" p v))))))

;---------------------------------------------------------------------------

(define (alist->rib xs)
  (let ((rib (empty-rib)))
    (for-each (lambda (entry)
		(bind! rib (car entry) (cadr entry)))
	      xs)
    rib))

;---------------------------------------------------------------------------

(define $begin
  (primitive (lambda (dynenv . exps)
	       (if (null? exps)
		   (void)
		   (let loop ((exps exps))
		     (if (null? (cdr exps))
			 (vau-eval (car exps) dynenv)
			 (begin (vau-eval (car exps) dynenv)
				(loop (cdr exps)))))))))

(define $vau
  (primitive (lambda (dynenv formals envformal . exps)
	       (let ((body (cond
			    ((null? exps) (void))
			    ((null? (cdr exps)) (car exps))
			    (else (cons $begin exps)))))
		 (operative formals envformal body dynenv)))))

(define coreenv
  (extend (empty-env)
	  (alist->rib
	   `((eval ,vau-eval)
	     (cons ,cons)
	     (list* ,list*)
	     (car ,car)
	     (cdr ,cdr)
	     ($define! ,(primitive (lambda (dynenv name valexp)
				     (let ((value (vau-eval valexp dynenv)))
				       (when (not (symbol? name))
					 (error '$define! "Needs symbol name; got ~v" name))
				       (bind! (car dynenv) name value)
				       value))))
	     ($begin ,$begin)
	     ($vau ,$vau)
	     (wrap ,applicative)
	     (unwrap ,applicative-underlying)))))

(define $lambda
  (vau-eval `($define! $lambda
		       ($vau (formals . exps) dynenv
			     (wrap (eval (list* $vau formals #:ignore exps) dynenv))))
	    coreenv))

;---------------------------------------------------------------------------

(define baseenv
  (extend coreenv
	  (alist->rib
	   `(($if ,(primitive (lambda (dynenv test true false)
				(if (vau-eval test dynenv)
				    (vau-eval true dynenv)
				    (vau-eval false dynenv)))))
	     ($let ,(primitive (lambda (dynenv bindings . exps)
				 (vau-eval (list* (list* $lambda (map car bindings) exps)
						  (map cadr bindings))
					   dynenv))))))))

(require racket/pretty)
(let ((t (extend baseenv (empty-rib))))
  (for-each (lambda (exp)
	      (pretty-print exp)
	      (pretty-print (vau-eval exp t))
	      (newline))
	    `(
	      "hi"
	      123
	      ($begin 123 234)
	      ($define! pp ,pretty-print)
	      (pp "hello there")
	      ($let ((x 123))
		    (pp "hi")
		    (pp "there")
		    x)
	      ($if #t 1 2)
	      ($if #f 1 2)
	      ($lambda (x) x)
	      (($lambda (x) x) 123)
	      ($define! first ($lambda (f s) f))
	      ($define! second ($lambda (f s) s))
	      (first 123 234)
	      (second 123 234)
	      )))
