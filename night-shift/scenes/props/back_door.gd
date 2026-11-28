class_name BackDoor
extends Area2D
## A door in the back wall. Stand in front of it and press W: a short fade, the
## door's sound, and you're standing at the door it leads to. Which door leads
## where is the level's map (TestLevel: "backdoor" decor + use_door()).
##
## look:
##   "metal"    a steel service door with a wired-glass slot (default)
##   "wood"     an old timber door
##   "sealed"   boarded across and chained: it rattles, it won't open
##              (the basement's "deeper" door opens on later trips: "ajar")
##   "ajar"     the same door, the boards gone, open a crack onto black
##   "arrival"  the door you just came through: it won't open from this side
## Root sits on the floor at the door's centre.

signal used(door: BackDoor)

@export var door_id := ""
@export var target := ""
@export var look := "metal"
## The zone of the section it's in (set by the level).
var zone := 1
var level = null

var _player_in := false
var _hint := 0.0
var _rattle := 0.0


func _ready() -> void:
	collision_layer = 0
	collision_mask = GameState.LAYER_PLAYER
	var shape := RectangleShape2D.new()
	shape.size = Vector2(16, 30)
	var cs := CollisionShape2D.new()
	cs.shape = shape
	cs.position = Vector2(0, -15)
	add_child(cs)
	body_entered.connect(func(b): if b.is_in_group("player"): _player_in = true)
	body_exited.connect(func(b): if b.is_in_group("player"): _player_in = false)
	z_index = -4                   # in the back wall: behind you and the props
	queue_redraw()


func is_locked() -> bool:
	return look == "sealed" or look == "arrival"


func set_look(new_look: String) -> void:
	look = new_look
	queue_redraw()


## Won't open: a rattle, the door shudders.
func rattle() -> void:
	_rattle = 0.35
	AudioDirector.play_at("rattle", global_position + Vector2(0, -16), -8.0, 0.1, 360.0, 1.15)


func _process(delta: float) -> void:
	var p = GameState.player
	var near: bool = _player_in and p != null and not p.input_locked and not p.climbing
	var h := move_toward(_hint, 1.0 if near else 0.0, delta * 5.0)
	if h != _hint or _rattle > 0.0:
		_hint = h
		queue_redraw()
	_rattle = maxf(0.0, _rattle - delta)
	if near and Input.is_action_just_pressed("move_up"):
		used.emit(self)
		if level != null:
			level.use_door(self)


func _draw() -> void:
	var shake := Vector2(sin(_rattle * 90.0), 0) if _rattle > 0.0 else Vector2.ZERO
	var frame := Color(0.18, 0.18, 0.19)
	var dark := Color(0.025, 0.025, 0.03)
	# Frame and the black of the opening.
	draw_rect(Rect2(-12, -36, 24, 36), frame)
	draw_rect(Rect2(-10, -34, 20, 34), dark)
	draw_rect(Rect2(-12, -36, 24, 1), Color(0.28, 0.28, 0.29))
	var slab := Rect2(Vector2(-9, -33) + shake, Vector2(18, 33))
	match look:
		"wood":
			draw_rect(slab, Color(0.24, 0.16, 0.10))
			for i in 4:
				draw_line(slab.position + Vector2(4.0 + i * 4.0, 1), slab.position + Vector2(4.0 + i * 4.0, 32), Color(0.17, 0.11, 0.07), 1.0)
			draw_rect(Rect2(slab.position + Vector2(14, 16), Vector2(2, 2)), Color(0.5, 0.45, 0.3))
		"ajar":
			# Open a crack onto black. Something might be just behind it.
			draw_rect(Rect2(slab.position + Vector2(5, 0), Vector2(13, 33)), Color(0.20, 0.21, 0.22))
			draw_line(slab.position + Vector2(5, 0), slab.position + Vector2(5, 33), Color(0.32, 0.32, 0.33), 1.0)
		_:
			draw_rect(slab, Color(0.21, 0.22, 0.23))
			draw_rect(Rect2(slab.position + Vector2(4, 5), Vector2(10, 7)), Color(0.08, 0.09, 0.10))   # wired glass
			draw_line(slab.position + Vector2(4, 8), slab.position + Vector2(14, 8), Color(0.15, 0.16, 0.17), 1.0)
			draw_rect(Rect2(slab.position + Vector2(13, 17), Vector2(3, 1)), Color(0.42, 0.42, 0.40))  # handle
			if look == "arrival":
				draw_rect(Rect2(slab.position + Vector2(13, 17), Vector2(3, 1)), Color(0.12, 0.12, 0.13))  # no handle this side
	if look == "sealed":
		# Boards nailed across, a chain through the handle.
		for i in 2:
			var y0 := -28.0 + i * 14.0
			draw_line(Vector2(-11, y0) + shake, Vector2(11, y0 + 6.0) + shake, Color(0.33, 0.24, 0.14), 3.0)
		for i in 6:
			draw_rect(Rect2(Vector2(-6.0 + i * 2.5, -16.0 + (i % 2)) + shake, Vector2(2, 2)), Color(0.40, 0.40, 0.42))
	# The hint: a small W, only while you're right in front of it.
	if _hint > 0.01:
		draw_string(ThemeDB.fallback_font, Vector2(-3, -40), "W", HORIZONTAL_ALIGNMENT_LEFT, -1, 8,
				Color(0.85, 0.85, 0.8, 0.55 * _hint))
