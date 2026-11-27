extends Node2D
## The Tunnel (zone 4). RULE: keep moving. Standing still makes the passage
## tighten: a wet mass of flesh sags down from the ceiling over this stretch,
## lower the longer you stay still, and the camera creeps in as space closes.
## If it comes all the way down on you, it crushes you. Indifferent, not cruel.
## Root sits on the floor at the start of the stretch.

@export var length := 560.0
@export var room := 96.0
## Seconds of standing still before it's fully down.
@export var close_time := 6.0

var squeeze := 0.0     # 0 open .. 1 closed
var _t := 0.0
var _thrum: AudioStreamPlayer2D
var _caught := false


func _ready() -> void:
	add_to_group("creatures")
	z_as_relative = false
	z_index = 3
	_thrum = AudioStreamPlayer2D.new()
	_thrum.stream = AudioDirector.get_stream("hum")
	_thrum.pitch_scale = 0.45            # low, wet, heartbeat-like
	_thrum.volume_db = -18.0
	_thrum.max_distance = 600.0
	_thrum.bus = AudioDirector.WORLD_BUS
	add_child(_thrum)
	_thrum.play()


func reset() -> void:
	squeeze = 0.0
	_caught = false


func _process(delta: float) -> void:
	_t += delta
	var p = GameState.player
	if p == null:
		return
	var px: float = p.global_position.x - global_position.x
	var inside := px > -40.0 and px < length + 40.0
	if inside and not p.input_locked:
		var still: bool = absf(p.velocity.x) < 5.0
		squeeze = clampf(squeeze + (delta / close_time if still else -delta / 2.0), 0.0, 1.0)
	else:
		squeeze = maxf(0.0, squeeze - delta / 2.0)
	_thrum.pitch_scale = 0.45 + squeeze * 0.25
	_thrum.volume_db = -18.0 + squeeze * 10.0
	# The camera slowly zooms in as space tightens.
	p.camera.zoom = Vector2.ONE * (1.0 + squeeze * 0.35)
	if squeeze >= 1.0 and inside and not _caught:
		_caught = true
		GameState.player_caught.emit(self)
	queue_redraw()


func _draw() -> void:
	if squeeze <= 0.01:
		return
	var flesh := Color(0.30, 0.18, 0.16)
	var dark := Color(0.10, 0.04, 0.05)
	var vein := Color(0.45, 0.10, 0.11)
	var drop := squeeze * (room - 22.0)
	var x := 0.0
	while x < length:
		# A lumpy underside that pulses: lower in the middle of each swelling.
		var lump := sin(x * 0.11 + _t * 2.0) * 3.0 + sin(x * 0.037 - _t) * 4.0
		var bottom := -room + drop + lump * squeeze
		draw_rect(Rect2(x, -room, 2, bottom + room), flesh)
		draw_rect(Rect2(x, bottom - 2.0, 2, 2), dark)
		if int(x) % 22 == 0:
			draw_rect(Rect2(x, -room + 4.0, 1, bottom + room - 6.0), vein)
		x += 2.0
