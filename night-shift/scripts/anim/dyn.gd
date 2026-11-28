class_name Dyn
extends RefCounted
## Second-order dynamics: a value that FOLLOWS a target the way a physical thing
## would, with a personality. This one tool gives anticipation, overshoot,
## follow-through and settling for free. (Technique: t3ssel8r, "Giving
## Personality to Procedural Animations using Math".)
##
##   f  speed, in Hz: how fast it responds
##   z  damping: < 1 overshoots and wobbles, 1 settles without overshoot, > 1 sluggish
##   r  response: 0 eases in, 1 reacts at once, > 1 overshoots at the start,
##      < 0 ANTICIPATES (moves the wrong way for a beat before it goes)
##
## Works on float and Vector2 (anything with + - * float).

var y          # current value
var v          # its velocity
var _xp        # last target, for the target's own velocity
var _k1 := 0.0
var _k2 := 0.0
var _k3 := 0.0


func _init(f: float, z: float, r: float, x0) -> void:
	set_params(f, z, r)
	reset(x0)


func set_params(f: float, z: float, r: float) -> void:
	_k1 = z / (PI * f)
	_k2 = 1.0 / ((TAU * f) * (TAU * f))
	_k3 = r * z / (TAU * f)


## Step towards target `x`. Returns the new value.
func update(dt: float, x):
	if dt <= 0.0:
		return y
	var xd = (x - _xp) / dt
	_xp = x
	# Clamp k2 so it stays stable at any frame rate.
	var k2s := maxf(_k2, maxf(dt * dt / 2.0 + dt * _k1 / 2.0, dt * _k1))
	y = y + v * dt
	v = v + (x + xd * _k3 - y - v * _k1) * (dt / k2s)
	return y


## Jump straight to `x`, at rest.
func reset(x) -> void:
	y = x
	_xp = x
	v = x * 0.0


## A shove: adds velocity. Snaps, jolts, impacts.
func kick(impulse) -> void:
	v = v + impulse
