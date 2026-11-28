class_name Lure
extends Node2D
## The Lure. A single flickering fluorescent tube hanging in the dark, far down
## a tunnel. After a long stretch in the dark you WANT to go to it.
## RULE: it is a light. Angler-fish: the tube hangs off something.
##
## The tube's light is on the ENVIRONMENT mask only, so it lights the tunnel
## like a real lamp but never shows what it hangs from. Only the torch does:
## look up along the cord and the body is there, clinging upside-down to the
## ceiling on six long jointed limbs, a pale bloated thing with an eyeless head
## that is mostly a vertical mouth of needle teeth. The tube hangs from a fleshy
## stalk growing out of its jaw.
## VISIBILITY: the one creature that stays hidden while it waits (it IS the
## light; what holds it is the secret). When it shows itself (the choice reveal,
## the bite) the body is drawn unshaded: you see it, torch or not.
## Its signature is the shop's comforting fluorescent buzz, used against you.
## Tell: the light rises and falls, gently, like something up there breathing.
##
## mode (three appearances in the design doc, never more):
##   "vanish" - goes out when you get close. Nothing happens.
##   "choice" - next to a real light. Pick it and it shows you what it is: the
##              stalk snaps taut, the jaw splits, and it scuttles off along the
##              ceiling into the dark, the tube dragged after it.
##   "bite"   - deep down. Get close and the head drops on its neck and bites.
##   "real"   - not a Lure at all: an honest hanging light (for the choice).
## Root sits on the ceiling.

signal revealed
signal bit

@export_enum("vanish", "choice", "bite", "real") var mode := "vanish"
@export var cord := 64.0
@export var trigger_distance := 70.0

const TUBE_TEX := preload("res://art/props/tube.tres")

const BASE := Color(0.54, 0.52, 0.48)
const RIM := Color(0.82, 0.80, 0.74)
const SHADOW := Color(0.27, 0.26, 0.25)
const DARK := Color(0.06, 0.05, 0.05)
const GUM := Color(0.42, 0.13, 0.13)
const THROAT := Color(0.16, 0.03, 0.04)
const TOOTH := Color(0.92, 0.89, 0.78)

var _light: PointLight2D
var _buzz: AudioStreamPlayer2D
var _body: Node2D
var _t := 0.0
var _done := false
var _lunge := 0.0      # 0..1, how far the head has dropped (bite)
var _reveal_left := 0.0
var _retract := 0.0    # 0..1 gone into the dark
var _flee_dir := -1.0  # which way along the ceiling it scuttles off


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
		_retract = minf(1.0, _retract + delta * 1.6)   # off into the dark, fast
	if mode == "bite" and _lunge > 0.0:
		_lunge = minf(1.0, _lunge + delta * 4.0)
	_check_player()
	queue_redraw()
	if _body:
		_body.queue_redraw()


## Its breath, 0..1: slow, a little too deep.
func _breath() -> float:
	return 0.5 + 0.5 * sin(_t * 1.5)


## Body proportions scale with the cord: a short cord means a smaller thing.
func _k() -> float:
	return clampf(cord / 80.0, 0.45, 1.0)


## Where the body is: it scuttles off sideways along the ceiling when it goes.
func _body_off() -> Vector2:
	var e := _retract * _retract * (3.0 - 2.0 * _retract)
	return Vector2(_flee_dir * 110.0 * e, 0)


func _chin() -> Vector2:
	var k := _k()
	return _body_off() + Vector2(0, 42.0 * k + _lunge * 38.0)


func _tube_pos() -> Vector2:
	if mode == "real":
		return Vector2(0, cord)
	var taut := _reveal_left > 0.0 or _retract > 0.0
	# The tell: the light rises and falls with its breath, and sways a little.
	var sway := 0.0 if taut else sin(_t * 0.8) * 2.0
	var lift := 0.0 if taut else -_breath() * 2.0
	var tube := Vector2(sway, cord + lift + _lunge * 40.0)
	if taut:
		tube.y -= 8.0                               # the stalk snaps tight
	if _retract > 0.0:
		# Dragged after it, pulled up towards the mouth as it goes.
		var chin := _chin()
		tube = chin.lerp(tube + _body_off(), 1.0 - _retract * 0.85)
	return tube


func _check_player() -> void:
	if _done or mode == "real" or GameState.player == null:
		return
	var p: Vector2 = GameState.player.global_position
	var d := absf(p.x - global_position.x)
	_flee_dir = -1.0 if p.x > global_position.x else 1.0
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
				_show_body()                  # you SEE what bites you, torch or not
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
	_show_body()
	AudioDirector.play_at("creak", global_position, 2.0, 0.0, 700.0, 0.4)
	AudioDirector.play_at("crack", global_position, -2.0, 0.1, 700.0, 0.6)
	if GameState.torch != null:
		GameState.torch.flicker(0.8)
	revealed.emit()


## The body drawn unshaded: visible with or without the torch.
func _show_body() -> void:
	if _body:
		var mat := CanvasItemMaterial.new()
		mat.light_mode = CanvasItemMaterial.LIGHT_MODE_UNSHADED
		_body.material = mat


func _go_dark() -> void:
	_done = true
	_light.enabled = false
	_buzz.stop()
	AudioDirector.play_at("clunk", global_position + _tube_pos(), -10.0, 0.1, 500.0, 1.4)
	AudioDirector.play_at("scrape", global_position, -10.0, 0.1, 500.0, 1.5)   # scuttling off
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
	var top := Vector2.ZERO if mode == "real" or _retract <= 0.0 else _chin()
	draw_line(top, tube, Color(0.10, 0.10, 0.11), 1.0)
	var lit := _light.enabled and not (_done and mode != "real")
	var tint := Color(1.7, 1.8, 1.7) if lit else Color(1, 1, 1)
	draw_texture(TUBE_TEX, tube - Vector2(16, 0), tint)


## The body, Light Only: clinging upside-down to the ceiling above the tube.
func _draw_body() -> void:
	if _retract >= 1.0:
		return
	var k := _k()
	var off := _body_off()
	var b := _breath()
	var ldir := CreatureDraw.light_dir(_body, off + Vector2(0, 20.0 * k))
	var torso := off + Vector2(0, 9.0 * k)
	var tw := 15.0 * k
	var th := (5.5 + b * 1.2) * k
	var scuttle := _retract > 0.0

	# 1) Six limbs gripping the ceiling: out from the torso, elbows hanging low,
	#    long fingers dug into the ceiling.
	# [reach out, elbow depth, elbow out] per limb, front to back: no two alike.
	var limb_shape := [[12.0, 9.0, 0.4], [30.0, 19.0, 0.55], [50.0, 13.0, 0.75]]
	for i in 6:
		var side := -1.0 if i < 3 else 1.0
		var j := i % 3
		var ls: Array = limb_shape[(j + (1 if side > 0.0 else 0)) % 3] if j != 1 else limb_shape[1]
		var shoulder := torso + Vector2(side * tw * (0.35 + 0.22 * float(j)), th * 0.3)
		var step := sin(_t * 18.0 + float(i) * 2.1) * 4.0 * k if scuttle else sin(_t * 0.6 + float(i) * 1.3) * 0.6
		var hand := off + Vector2(side * (tw * 0.4 + float(ls[0]) * k) + step, 0.0)
		var elbow := shoulder.lerp(hand, float(ls[2])) + Vector2(0, float(ls[1]) * k + 2.0)
		var wrist := hand + Vector2(-side * 2.0 * k, 3.0 * k)
		CreatureDraw.limb(_body, CreatureDraw.bez(shoulder, shoulder + Vector2(side * 2.0, 4.0 * k), elbow + Vector2(-side * 4.0 * k, 0), elbow, 5), 3.4 * k + 0.6, 2.2 * k + 0.5, BASE, RIM, SHADOW, ldir)
		CreatureDraw.limb(_body, CreatureDraw.bez(elbow, elbow + Vector2(side * 4.0 * k, -2.0), wrist + Vector2(-side * 1.0, 4.0 * k), wrist, 5), 2.2 * k + 0.5, 1.4, BASE, RIM, SHADOW, ldir)
		CreatureDraw.knuckle(_body, elbow, 1.5 * k + 0.5, BASE, RIM, DARK, ldir)
		for f in 3:                                     # long fingers dug into the ceiling
			var fa := -PI * 0.5 + side * (0.4 + 0.45 * float(f))
			var f1 := wrist + Vector2.from_angle(fa) * (2.5 + float(f))
			_body.draw_line(wrist, f1, BASE, 1.0)
			_body.draw_line(f1, Vector2(f1.x + side * 1.5, 0.0), SHADOW, 1.0)

	# 2) The torso: a pale, bloated sac pressed to the ceiling, ribs showing
	#    through, swelling as it breathes.
	var poly := PackedVector2Array()
	for s in 16:
		var ang := TAU * float(s) / 16.0
		var r := Vector2(cos(ang) * tw, sin(ang) * th)
		if r.y < 0.0:
			r.y *= 0.5                                  # flat against the ceiling
		poly.append(torso + r)
	_body.draw_colored_polygon(poly, SHADOW)
	var inner := PackedVector2Array()
	for v in poly:
		inner.append(torso + (v - torso) * 0.86 + ldir * 0.8)
	_body.draw_colored_polygon(inner, BASE)
	for r in 4:
		var rx := (float(r) - 1.5) * tw * 0.42
		_body.draw_arc(torso + Vector2(rx, -th * 0.2), th * 0.75, 0.3, PI - 0.3, 5, RIM.darkened(0.25), 1.0)
	_body.draw_line(torso + Vector2(-tw * 0.8, th * 0.6), torso + Vector2(tw * 0.8, th * 0.6), SHADOW, 1.0)

	# 3) The neck, hanging from the front of the sac, and the head on it.
	var neck_top := torso + Vector2(0, th * 0.8)
	var chin := _chin()
	var head_top := neck_top + Vector2(0, 7.0 * k + _lunge * 30.0)
	var neck := CreatureDraw.bez(neck_top, neck_top + Vector2(2.0, 3.0), head_top + Vector2(-2.0, -3.0), head_top, 4)
	CreatureDraw.limb(_body, neck, 3.5 * k + 0.8, 3.0 * k + 0.6, BASE, RIM, SHADOW, ldir)
	_draw_head(head_top, chin, k, ldir)

	# 4) The lure stalk: fleshy, segmented, from the jaw to the tube.
	var tube := _tube_pos()
	var taut := _reveal_left > 0.0 or scuttle
	# An S-curve that slackens and tightens as it breathes.
	var bend := 0.0 if taut else (6.0 + _breath() * 3.0) * k
	var stalk := CreatureDraw.bez(chin, chin + Vector2(bend, (tube.y - chin.y) * 0.35),
			tube + Vector2(-bend, -(tube.y - chin.y) * 0.35), tube + Vector2(0, -1), 10)
	CreatureDraw.limb(_body, stalk, 5.0 * k + 0.8, 1.4, BASE, RIM, SHADOW, ldir)
	for i in range(1, stalk.size() - 1, 2):
		_body.draw_rect(Rect2(stalk[i].round(), Vector2(1, 1)), SHADOW)   # segment rings


## Eyeless: a long hanging skull with two shallow pits where eyes should be,
## split down the front by a mouth of needle teeth. It opens when it shows
## itself, and wide when it bites.
func _draw_head(top: Vector2, chin: Vector2, k: float, ldir: Vector2) -> void:
	var open := 0.0
	if _reveal_left > 0.0 or _retract > 0.0:
		open = 7.0 * k + 1.5
	open += _lunge * 7.0
	var hw := 6.0 * k + 0.8
	# The two halves of the skull, pushed apart by the opening jaw.
	for side: float in [-1.0, 1.0]:
		var shift := Vector2(side * open * 0.5, 0)
		var half := PackedVector2Array([
			top + shift + Vector2(0, -1),
			top + shift + Vector2(side * hw, 2.0 * k),
			top.lerp(chin, 0.55) + shift + Vector2(side * (hw + 0.5), 0),
			chin + shift + Vector2(side * 1.5, -1.0),
			chin + shift,
		])
		_body.draw_colored_polygon(half, BASE if side * ldir.x >= 0.0 else BASE.darkened(0.2))
		_body.draw_line(half[1], half[2], RIM if side * ldir.x >= 0.0 else SHADOW, 1.0)
	if open > 0.5:
		var throat := PackedVector2Array([top + Vector2(-open * 0.5, 2), top + Vector2(open * 0.5, 2),
				chin + Vector2(open * 0.5, -1), chin + Vector2(-open * 0.5, -1)])
		_body.draw_colored_polygon(throat, THROAT)
	# Gums and teeth down both edges of the slit.
	var y := top.y + 2.0
	var i := 0
	while y < chin.y - 1.0:
		for side: float in [-1.0, 1.0]:
			var edge := Vector2(top.x + side * open * 0.5, y)
			_body.draw_rect(Rect2(edge.round(), Vector2(1, 1)), GUM)
			var tooth_len := 1.5 + float((i * 7 + int(side > 0.0) * 3) % 3) + open * 0.25
			_body.draw_line(edge, edge + Vector2(-side * tooth_len, 0.6), TOOTH, 1.0)
		y += 2.0
		i += 1
	# Where the eyes should be.
	for side: float in [-1.0, 1.0]:
		_body.draw_rect(Rect2((top + Vector2(side * (hw * 0.55 + open * 0.5), 3.0 * k)).round(), Vector2(1, 1)), DARK)
