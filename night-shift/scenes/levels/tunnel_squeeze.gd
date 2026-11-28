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
var _veins: Array = []


func _ready() -> void:
	add_to_group("creatures")
	z_as_relative = false
	z_index = 3
	_thrum = AudioStreamPlayer2D.new()
	_thrum.stream = AudioDirector.get_stream("hum")
	_thrum.pitch_scale = 0.45            # low, wet, heartbeat-like
	_thrum.volume_db = -8.0
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
	if squeeze > 0.25:
		GameState.mark_encounter("tunnel", "tunnel", 30.0)
	_thrum.pitch_scale = 0.45 + squeeze * 0.25
	_thrum.volume_db = -8.0 + squeeze * 8.0
	# The camera slowly zooms in as space tightens.
	p.camera.zoom = Vector2.ONE * (1.0 + squeeze * 0.35)
	if squeeze >= 1.0 and inside and not _caught:
		_caught = true
		GameState.player_caught.emit(self)
	queue_redraw()


## A double beat every 1.4 s, 0..1: the flesh swells on it.
func _heartbeat() -> float:
	var ph := fmod(_t, 1.4)
	return exp(-ph * ph / 0.004) + 0.6 * exp(-(ph - 0.25) * (ph - 0.25) / 0.004)


## Branching veins, made once: x positions and depth fractions (0 = ceiling,
## 1 = the underside), redrawn at whatever depth the flesh has come down to.
func _make_veins() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = int(global_position.x)
	_veins = []
	var x := rng.randf_range(4.0, 20.0)
	while x < length:
		var path := PackedVector2Array()
		var vx := x
		for j in 6:
			path.append(Vector2(vx, float(j) / 5.0 * 0.92))
			vx += rng.randf_range(-5.0, 5.0)
		_veins.append(path)
		var b := PackedVector2Array([path[2]])
		var bx := path[2].x
		for j in 3:
			bx += rng.randf_range(2.0, 6.0) * (1.0 if rng.randf() < 0.5 else -1.0)
			b.append(Vector2(bx, path[2].y + float(j + 1) * 0.15))
		_veins.append(b)
		x += rng.randf_range(26.0, 48.0)


func _draw() -> void:
	if squeeze <= 0.01:
		return
	if _veins.is_empty():
		_make_veins()
	var flesh := Color(0.33, 0.16, 0.14)
	var deep := Color(0.15, 0.06, 0.06)
	var wet := Color(0.78, 0.55, 0.48)
	var vein := Color(0.40, 0.07, 0.08)
	var mucus := Color(0.70, 0.62, 0.52, 0.85)
	var bone := Color(0.72, 0.66, 0.56)
	var beat := _heartbeat()
	var drop := squeeze * (room - 22.0)

	# 1) The mass, down from the ceiling to a lumpy underside that pulses.
	var under := PackedVector2Array()
	var x := 0.0
	while x <= length:
		var lump := sin(x * 0.11 + _t * 2.0) * 3.0 + sin(x * 0.037 - _t) * 4.0 + beat * 2.0 * (0.5 + 0.5 * sin(x * 0.05))
		under.append(Vector2(x, -room + drop + lump * squeeze))
		x += 2.0
	for u in under:
		draw_rect(Rect2(u.x, -room, 2, maxf(0.0, u.y + room - 6.0)), deep)
		draw_rect(Rect2(u.x, u.y - 6.0, 2, 6), flesh)

	# 2) Veins, branching down through it, darker and fatter on the beat.
	for path: PackedVector2Array in _veins:
		var prev := Vector2.ZERO
		for j in path.size():
			var q := Vector2(path[j].x, -room + path[j].y * (drop + 2.0))
			if j > 0:
				draw_line(prev, q, vein.darkened(0.3 - beat * 0.3), 1.0 + (beat if j < 3 else 0.0))
			prev = q

	# 3) Swollen lobes along the underside: irregular, overlapping, a darker row
	#    behind, creases between them, the odd wet glint.
	for layer in 2:
		var i := layer * 3
		while i < under.size():
			var h := absf(sin(float(i) * 12.9898 + float(layer) * 4.1))
			var c := under[i] + Vector2(0, -2.0 - float(layer) * 4.0)
			var r := 2.5 + 5.5 * h + beat * 0.9 * (1.0 - float(layer))
			var col := flesh.darkened(0.35 if layer == 1 else 0.1 * h)
			draw_circle(c + Vector2(0, 1.0), r, deep)
			draw_circle(c, r * 0.9, col)
			if layer == 0:
				draw_circle(c + Vector2(-0.7, -0.8), r * 0.5, col.lightened(0.08))
				if h > 0.55:
					draw_rect(Rect2((c + Vector2(-r * 0.3, -r * 0.45)).round(), Vector2(1, 1)), wet)
				draw_arc(c, r * 0.9, 0.3, PI - 0.3, 6, deep, 1.0)    # the crease under it
			i += 2 + int(h * 5.0)

	# 4) Pale ridges along the very edge, like something's gums.
	for i in range(1, under.size(), 3):
		var u2 := under[i]
		draw_rect(Rect2(u2.x, u2.y + 1.0, 1, 2), bone.darkened(0.2 + 0.2 * float(i % 2)))

	# 5) Strands of mucus hanging off it, stretching as it comes down, dripping.
	for i in range(3, under.size(), 23):
		var top := under[i] + Vector2(0, 2.0)
		var len_s := (4.0 + 16.0 * squeeze) * (0.7 + 0.3 * sin(_t * 1.3 + float(i)))
		var bottom := top + Vector2(sin(_t * 0.8 + float(i)) * 1.5, len_s)
		draw_line(top, bottom, mucus, 1.0)
		draw_rect(Rect2((bottom - Vector2(0.5, 0)).round(), Vector2(2, 2)), wet)
		var fall := fmod(_t * 0.7 + float(i) * 0.37, 1.0)
		if fall > 0.6:
			var dy := (fall - 0.6) / 0.4 * (room - (bottom.y + room))
			draw_rect(Rect2((bottom + Vector2(0, dy)).round(), Vector2(1, 2)), wet)
