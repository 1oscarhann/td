extends Node2D
## A landmark: one unique, recognisable thing per section, so you can tell
## rooms apart (and notice when one changes). Drawn in pixels, lit like the
## environment. Root sits on the floor (or `above_floor` px up the wall).
##
## Return trips can change it (`trips`: trip number -> change):
##   "turned"   facing the other way      "missing"  gone
##   "double"   there are two of them     "move:N"   moved N tiles

var kind := "chair"
var trips: Dictionary = {}
var _facing := 1.0
var _double := false
var _home := Vector2.ZERO


func _ready() -> void:
	_home = position
	queue_redraw()


## Called on every return trip (the level passes the new trip number).
func apply_trip(trip: int) -> void:
	visible = true
	_facing = 1.0
	_double = false
	position = _home
	var change: String = trips.get(str(trip), "")
	if change == "turned":
		_facing = -1.0
	elif change == "missing":
		visible = false
	elif change == "double":
		_double = true
	elif change.begins_with("move:"):
		position = _home + Vector2(float(change.substr(5)) * 16.0, 0)
	queue_redraw()


func _draw() -> void:
	_one(Vector2.ZERO, _facing)
	if _double:
		_one(Vector2(-18, 0), -_facing)


func _r(at: Vector2, x: float, y: float, w: float, h: float, c: Color, f: float) -> void:
	# A rect mirrored by facing f around `at`.
	var rx := x if f > 0.0 else -x - w
	draw_rect(Rect2(at + Vector2(rx, y), Vector2(w, h)), c)


func _one(at: Vector2, f: float) -> void:
	match kind:
		"chair":                       # a plastic chair, facing the wall
			var c := Color(0.30, 0.30, 0.34)
			_r(at, -6, -12, 12, 2, c, f)
			_r(at, 4, -22, 2, 12, c, f)
			_r(at, -6, -10, 1, 10, c, f)
			_r(at, 5, -10, 1, 10, c, f)
		"bucket":
			draw_rect(Rect2(at + Vector2(-5, -9), Vector2(10, 9)), Color(0.48, 0.32, 0.12))
			draw_rect(Rect2(at + Vector2(-5, -9), Vector2(10, 1)), Color(0.62, 0.45, 0.2))
			draw_arc(at + Vector2(0, -9), 5.0, PI, TAU, 8, Color(0.35, 0.35, 0.35), 1.0)
		"trolley":                     # a shop trolley, a long way from the shop
			var m := Color(0.45, 0.46, 0.48)
			for i in 5:
				draw_line(at + Vector2(-10 + i * 4.0, -18), at + Vector2(-9 + i * 4.0, -6), m, 1.0)
			draw_line(at + Vector2(-11, -18), at + Vector2(9, -18), m, 1.0)
			draw_line(at + Vector2(-10, -6), at + Vector2(8, -6), m, 1.0)
			_r(at, 9, -22, 1, 5, m, f)
			draw_circle(at + Vector2(-8, -1), 1.5, Color(0.12, 0.12, 0.12))
			draw_circle(at + Vector2(6, -1), 1.5, Color(0.12, 0.12, 0.12))
		"boiler":                      # a dead boiler, gauges stuck at zero
			draw_rect(Rect2(at + Vector2(-9, -40), Vector2(18, 40)), Color(0.30, 0.28, 0.24))
			draw_rect(Rect2(at + Vector2(-9, -40), Vector2(18, 2)), Color(0.40, 0.37, 0.32))
			draw_circle(at + Vector2(-3, -30), 3.0, Color(0.75, 0.72, 0.62))
			draw_line(at + Vector2(-3, -30), at + Vector2(-5, -31), Color(0.1, 0.1, 0.1), 1.0)
			draw_rect(Rect2(at + Vector2(-7, -14), Vector2(14, 6)), Color(0.08, 0.06, 0.05))
		"cone":
			draw_colored_polygon(PackedVector2Array([at + Vector2(-5, 0), at + Vector2(5, 0), at + Vector2(1, -15), at + Vector2(-1, -15)]), Color(0.70, 0.30, 0.10))
			draw_rect(Rect2(at + Vector2(-3, -9), Vector2(6, 2)), Color(0.85, 0.85, 0.80))
			draw_rect(Rect2(at + Vector2(-7, -1), Vector2(14, 1)), Color(0.25, 0.12, 0.05))
		"radio":                       # a site radio, aerial up, off
			draw_rect(Rect2(at + Vector2(-8, -10), Vector2(16, 10)), Color(0.60, 0.45, 0.12))
			draw_rect(Rect2(at + Vector2(-6, -8), Vector2(6, 6)), Color(0.12, 0.12, 0.12))
			_r(at, 5, -26, 1, 16, Color(0.55, 0.55, 0.55), f)
		"clock":                       # a wall clock, stopped
			draw_circle(at, 6.0, Color(0.15, 0.15, 0.15))
			draw_circle(at, 5.0, Color(0.78, 0.76, 0.70))
			draw_line(at, at + Vector2(0, -4), Color(0.05, 0.05, 0.05), 1.0)
			draw_line(at, at + Vector2(3, 1), Color(0.05, 0.05, 0.05), 1.0)
		"boot":                        # one work boot, on its own
			_r(at, -4, -8, 6, 8, Color(0.22, 0.15, 0.08), f)
			_r(at, -4, -2, 11, 2, Color(0.12, 0.08, 0.05), f)
			_r(at, -3, -8, 4, 1, Color(0.55, 0.5, 0.3), f)
		"pallet":
			draw_rect(Rect2(at + Vector2(-14, -6), Vector2(28, 2)), Color(0.40, 0.30, 0.18))
			draw_rect(Rect2(at + Vector2(-14, -2), Vector2(28, 2)), Color(0.36, 0.27, 0.16))
			for i in 3:
				draw_rect(Rect2(at + Vector2(-13 + i * 11, -4), Vector2(4, 2)), Color(0.25, 0.18, 0.10))
		"mannequin":                   # a shop dummy, facing the wall, arm raised
			var s := Color(0.62, 0.58, 0.52)
			_r(at, -2, -42, 5, 5, s, f)
			_r(at, -3, -36, 7, 15, s, f)
			_r(at, 3, -46, 2, 12, s, f)
			_r(at, -2, -21, 2, 21, s, f)
			_r(at, 1, -21, 2, 21, s, f)
		"lockers":
			for i in 2:
				draw_rect(Rect2(at + Vector2(-12 + i * 12, -38), Vector2(11, 38)), Color(0.28, 0.33, 0.36))
				draw_rect(Rect2(at + Vector2(-10 + i * 12, -34), Vector2(7, 1)), Color(0.12, 0.14, 0.15))
				draw_rect(Rect2(at + Vector2(-10 + i * 12, -32), Vector2(7, 1)), Color(0.12, 0.14, 0.15))
			draw_rect(Rect2(at + Vector2(1, -38), Vector2(10, 38)), Color(0.05, 0.05, 0.06))   # one hangs open
