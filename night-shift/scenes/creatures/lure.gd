class_name Lure
extends Node2D
## The Lure. A single flickering fluorescent tube hanging in the dark, far down
## a tunnel. After a long stretch in the dark you WANT to go to it.
## RULE: it is a light. Angler-fish: the tube hangs off something.
##
## The tube's light is on the ENVIRONMENT mask only, so it lights the tunnel
## like a real lamp but never shows what it hangs from. Only the torch does:
## look up along the cord and the body is there, clinging to the ceiling, an
## eyeless head that is mostly mouth.
## Its signature is the shop's comforting fluorescent buzz, used against you.
## Tell: the cord sways. Something up there is breathing.
##
## mode (three appearances in the design doc, never more):
##   "vanish" - goes out when you get close. Nothing happens.
##   "choice" - next to a real light. Pick it and it shows you what it is, then goes.
##   "bite"   - deep down. Get close and it bites.
##   "real"   - not a Lure at all: an honest hanging light (for the choice).
## Root sits on the ceiling.

signal revealed
signal bit

@export_enum("vanish", "choice", "bite", "real") var mode := "vanish"
@export var cord := 64.0
@export var trigger_distance := 70.0

const TUBE_TEX := preload("res://art/props/tube.tres")

var _light: PointLight2D
var _buzz: AudioStreamPlayer2D
var _body: Node2D
var _t := 0.0
var _done := false
var _lunge := 0.0      # 0..1, how far the head has dropped (bite)
var _reveal_left := 0.0
var _retract := 0.0    # 0..1 into the ceiling


func _ready() -> void:
	add_to_group("creatures")
	_light = PointLight2D.new()
	_light.texture = LightTextures.radial(256)
	_light.color = Color(0.82, 0.96, 0.88)
	_light.energy = 1.6
	_light.range_item_cull_mask = GameState.LIGHT_ENV   # never reveals creatures
	_light.shadow_enabled = true
	_light.shadow_item_cull_mask = GameState.LIGHT_ENV
	_light.height = 30.0
	add_child(_light)
	_buzz = AudioStreamPlayer2D.new()
	_buzz.stream = AudioDirector.get_stream("buzz")
	_buzz.bus = AudioDirector.WORLD_BUS
	_buzz.volume_db = -14.0
	_buzz.max_distance = 520.0
	add_child(_buzz)
	_buzz.play()
	if mode != "real":
		_body = Node2D.new()
		var mat := CanvasItemMaterial.new()
		mat.light_mode = CanvasItemMaterial.LIGHT_MODE_LIGHT_ONLY
		_body.material = mat
		_body.light_mask = GameState.LIGHT_CREATURES
		_body.draw.connect(_draw_body)
		add_child(_body)
	queue_redraw()


func reset() -> void:
	# Lures don't come back after they've shown themselves (3 appearances only).
	_lunge = 0.0


func _process(delta: float) -> void:
	_t += delta
	var tube := _tube_pos()
	_light.position = tube + Vector2(0, 4)
	# Flicker: mostly on, stuttering now and then.
	if not _done:
		var stutter := fmod(_t, 3.7) < 0.25 and mode != "real"
		_light.enabled = not (stutter and randf() < 0.5)
		_light.energy = 1.6 if mode == "real" else randf_range(1.3, 1.7)
	if _reveal_left > 0.0:
		_reveal_left -= delta
		if _reveal_left <= 0.0:
			_go_dark()
	if _retract > 0.0 and _retract < 1.0:
		_retract = minf(1.0, _retract + delta * 0.8)
	if mode == "bite" and _lunge > 0.0:
		_lunge = minf(1.0, _lunge + delta * 4.0)
	_check_player()
	queue_redraw()
	if _body:
		_body.queue_redraw()


func _tube_pos() -> Vector2:
	var sway := sin(_t * 1.1) * 2.0 if mode != "real" else 0.0   # the tell
	var drop := cord * (1.0 - _retract) + _lunge * 40.0
	return Vector2(sway, drop)


func _check_player() -> void:
	if _done or mode == "real" or GameState.player == null:
		return
	var p: Vector2 = GameState.player.global_position
	var d := absf(p.x - global_position.x)
	match mode:
		"vanish":
			if d < trigger_distance:
				_go_dark()
				GameState.mark_encounter("lure", "lure_%d" % get_instance_id())
		"choice":
			if d < trigger_distance * 0.7:
				_reveal()
		"bite":
			if d < trigger_distance * 0.6 and _lunge == 0.0:
				_lunge = 0.01
				GameState.mark_encounter("lure", "lure_%d" % get_instance_id())
				AudioDirector.play_at("crack", global_position + _tube_pos(), 2.0, 0.1, 700.0, 0.5)
			if _lunge >= 1.0:
				_done = true
				bit.emit()
				GameState.player_caught.emit(self)


## The wrong choice: it flares and, for a moment, you see what it is.
func _reveal() -> void:
	_done = true
	GameState.mark_encounter("lure", "lure_%d" % get_instance_id())
	_reveal_left = 1.3
	_light.energy = 2.6
	if _body:
		var mat := CanvasItemMaterial.new()
		mat.light_mode = CanvasItemMaterial.LIGHT_MODE_UNSHADED
		_body.material = mat
	AudioDirector.play_at("creak", global_position, 2.0, 0.0, 700.0, 0.4)
	AudioDirector.play_at("crack", global_position, -2.0, 0.1, 700.0, 0.6)
	if GameState.torch != null:
		GameState.torch.flicker(0.8)
	revealed.emit()


func _go_dark() -> void:
	_done = true
	_light.enabled = false
	_buzz.stop()
	AudioDirector.play_at("clunk", global_position + _tube_pos(), -10.0, 0.1, 500.0, 1.4)
	_retract = 0.01
	if _body:
		var mat := CanvasItemMaterial.new()
		mat.light_mode = CanvasItemMaterial.LIGHT_MODE_LIGHT_ONLY
		_body.material = mat


func _draw() -> void:
	if _retract >= 1.0:
		return
	var tube := _tube_pos()
	# The cord: a thin dark line (environment layer: you can see it hanging).
	draw_line(Vector2.ZERO, tube, Color(0.10, 0.10, 0.11), 1.0)
	var lit := _light.enabled and not (_done and mode != "real")
	var tint := Color(1.7, 1.8, 1.7) if lit else Color(1, 1, 1)
	draw_texture(TUBE_TEX, tube - Vector2(16, 0), tint)


## The body, Light Only: clinging upside-down to the ceiling above the tube.
func _draw_body() -> void:
	if _retract >= 1.0:
		return
	var skin := Color(0.46, 0.48, 0.44)
	var shade := Color(0.24, 0.25, 0.23)
	var dark := Color(0.05, 0.05, 0.05)
	var tooth := Color(0.86, 0.84, 0.74)
	# It hangs about 40 px above its tube (within reach of your beam), holding
	# the ceiling with impossibly long arms.
	var up := maxf(0.0, cord - 40.0) - _retract * (cord + 30.0)
	var breathe := sin(_t * 2.0) * 1.0
	for i in 4:
		var side := -1.0 if i < 2 else 1.0
		var reach := 14.0 + (i % 2) * 12.0
		var shoulder := Vector2(side * 4.0, 5.0 + up)
		var elbow := Vector2(side * reach, up * 0.45)
		var hand := Vector2(side * (reach + 6.0), -1.0)
		_body.draw_line(shoulder, elbow, skin, 2.0)
		_body.draw_line(elbow, hand, skin, 1.0)
		_body.draw_line(hand, hand + Vector2(side * 3.0, 1.0), shade, 1.0)
	# Hunched back pressed to the ceiling, spine knuckles.
	for x in range(-6, 7):
		_body.draw_rect(Rect2(x, 2.0 + up + absf(x) * 0.25, 1, 6.0 + breathe - absf(x) * 0.3), skin if absf(x) < 5 else shade)
	for x in range(-5, 6, 2):
		_body.draw_rect(Rect2(x, 1.0 + up, 1, 1), shade)
	# The head hangs down: no eyes, just a long vertical mouth of needle teeth,
	# and the stalk the tube hangs from grows out of where the face should be.
	var head := Vector2(0, 12.0 + up + _lunge * 34.0)
	var open := 1.0 + _lunge * 4.0 + (2.0 if _reveal_left > 0.0 else 0.0)
	_body.draw_rect(Rect2(head.x - 4, head.y - 3, 8, 12 + open), skin)
	_body.draw_rect(Rect2(head.x - 4, head.y - 3, 1, 12 + open), shade)
	_body.draw_rect(Rect2(head.x - 1 - open * 0.5, head.y, 2 + open, 9 + open), dark)
	for ty in range(int(head.y), int(head.y + 9 + open), 2):
		_body.draw_rect(Rect2(head.x - 1 - open * 0.5, ty, 1, 1), tooth)
		_body.draw_rect(Rect2(head.x + open * 0.5, ty + 1, 1, 1), tooth)
	# The fleshy stalk, from the mouth to the tube (over the plain cord).
	var tube := _tube_pos()
	var stalk_top := head + Vector2(0, 10 + open)
	for i in 6:
		var t := float(i) / 5.0
		var p := stalk_top.lerp(tube, t)
		_body.draw_rect(Rect2(p.round() - Vector2(1, 0), Vector2(2, 2)), skin if i % 2 == 0 else shade)
