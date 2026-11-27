class_name CableCreature
extends WallCable
## The Cables. Identical to the real power cables (same scene, same art, the
## ENVIRONMENT layer, always visible). This is the one creature that breaks the
## visibility rule on purpose: players walk past them for ages thinking they're
## scenery.
##
## RULE: drawn to electricity. When a switch powers the walls nearby
## (GameState.switch_flipped), it drops off its fixings and slithers along the
## floor towards the live circuit, which is usually where you're standing.
## GRAB: wraps your leg and drags you towards the dark it came from. You can
## still aim the torch: hold the beam on it to make it let go (decision: the doc
## leaves the escape open).
## TELL: a slightly wrong droop (extra sag), and a twitch if you hold the light
## on it for a couple of seconds.
## The root stays on the wall fixing; the free end moves.

enum State { HANGING, SLITHER, GRAB, RETREAT }

## Reacts to switches within this distance of its fixing.
@export var hearing_range := 420.0
@export var crawl_speed := 24.0
@export var drag_speed := 16.0
@export var max_length := 320.0
## Seconds of continuous light to make it let go once it has you.
@export var release_light_time := 1.0
## Gives up hunting after this long.
@export var give_up_time := 14.0

var state := State.HANGING
var _tip := Vector2.ZERO        # free end, local
var _floor_local := 0.0
var _target_x := 0.0
var _state_time := 0.0
var _t := 0.0
var _hang_points := PackedVector2Array()
var _area: Area2D
var _area_shape := CircleShape2D.new()
var _crackle: AudioStreamPlayer2D
var _spark: PointLight2D


func _ready() -> void:
	sag += 3.0          # the tell: droops slightly more than the real ones
	super._ready()
	_hang_points = points
	add_to_group("creatures")
	_tip = end_point
	GameState.switch_flipped.connect(_on_switch_flipped)
	# Invisible detection area on the creature layer so the torch can "light" it.
	_area = Area2D.new()
	_area.collision_layer = GameState.LAYER_CREATURES
	_area.collision_mask = GameState.LAYER_PLAYER
	var shape := CollisionShape2D.new()
	_area_shape.radius = 10.0
	shape.shape = _area_shape
	_area.add_child(shape)
	add_child(_area)
	_crackle = AudioStreamPlayer2D.new()
	_crackle.stream = AudioDirector.get_stream("crackle")
	_crackle.bus = AudioDirector.WORLD_BUS
	_crackle.max_distance = 400.0
	_crackle.volume_db = -12.0
	add_child(_crackle)
	_spark = PointLight2D.new()
	_spark.texture = LightTextures.radial(48)
	_spark.color = Color(0.7, 0.85, 1.0)
	_spark.energy = 0.0
	_spark.range_item_cull_mask = GameState.LIGHT_ENV
	add_child(_spark)


func reset() -> void:
	_release_player()
	_enter(State.HANGING)
	_tip = end_point
	points = _hang_points
	_crackle.stop()


func get_light_probe_points() -> Array:
	var pts: Array = []
	for i in range(0, points.size(), 3):
		pts.append(to_global(points[i]))
	pts.append(to_global(_tip))
	return pts


func _enter(new_state: State) -> void:
	state = new_state
	_state_time = 0.0


func _on_switch_flipped(origin: Vector2) -> void:
	if state != State.HANGING or global_position.distance_to(origin) > hearing_range:
		return
	_floor_local = _find_floor_local()
	_target_x = to_local(origin).x
	_enter(State.SLITHER)
	_crackle.play()


func _physics_process(delta: float) -> void:
	_t += delta
	_state_time += delta
	var player = GameState.player
	match state:
		State.HANGING:
			# The tell: held in the light long enough, it twitches.
			if GameState.get_lit_time(self) > 2.0:
				var pts := _hang_points.duplicate()
				for i in range(1, pts.size() - 1):
					var v := pts[i]   # packed arrays hand out copies: edit, then write back
					v.y += sin(_t * 40.0 + i) * 1.0
					pts[i] = v
				points = pts
			elif points != _hang_points:
				points = _hang_points
		State.SLITHER:
			if player != null:
				var p_local := to_local(player.global_position)
				if absf(p_local.x - _tip.x) < 140.0:
					_target_x = p_local.x   # it has found you
			var dir := signf(_target_x - _tip.x)
			var reach_ok := _tip.length() < max_length or signf(-_tip.x) == dir
			if reach_ok:
				_tip.x += dir * crawl_speed * delta
			_tip.y = move_toward(_tip.y, _floor_local, 60.0 * delta)
			_build_slither()
			_check_grab(player)
			if _state_time > give_up_time:
				_enter(State.RETREAT)
		State.GRAB:
			if player == null:
				_enter(State.RETREAT)
			else:
				# Drag you back towards the fixing (and the dark).
				var to_anchor := signf(global_position.x - player.global_position.x)
				player.pull_speed = to_anchor * drag_speed
				_tip = to_local(player.global_position + Vector2(0, -6))
				_build_slither()
				if GameState.get_lit_time(self) >= release_light_time:
					_release_player()
					AudioDirector.play_at("tap", global_position + _tip, -6.0, 0.3, 300.0, 0.5)
					_enter(State.RETREAT)
		State.RETREAT:
			_tip = _tip.move_toward(end_point, crawl_speed * 3.0 * delta)
			_build_slither()
			if _tip.distance_to(end_point) < 1.0:
				points = _hang_points
				_crackle.stop()
				_enter(State.HANGING)
	_area.position = _tip
	var moving := state == State.SLITHER or state == State.GRAB or state == State.RETREAT
	_spark.position = _tip
	_spark.energy = randf_range(0.2, 0.9) if moving and randf() < 0.25 else 0.0


func _check_grab(player) -> void:
	if player == null or player.held:
		return
	var feet := to_local(player.global_position)
	if absf(feet.x - _tip.x) < 7.0 and absf(feet.y - _tip.y) < 10.0 and player.is_on_floor():
		player.held = true
		AudioDirector.play_at("crack", player.global_position, -4.0, 0.2, 500.0, 1.4)
		_enter(State.GRAB)


func _release_player() -> void:
	var player = GameState.player
	if player != null and player.held:
		player.held = false
		player.pull_speed = 0.0


## Anchor -> down the wall -> along the floor to the tip, with a slither wave on
## the floor part. Quadratic curve with its corner under the anchor.
func _build_slither() -> void:
	var pts := PackedVector2Array()
	var corner := Vector2(0, _tip.y)
	var n := 16
	for i in n + 1:
		var t := float(i) / n
		var a := Vector2.ZERO.lerp(corner, t)
		var b := corner.lerp(_tip, t)
		var p := a.lerp(b, t)
		if state != State.GRAB:
			p.y -= absf(sin(_t * 9.0 - t * 12.0)) * 2.0 * t   # little humps along the floor
		pts.append(p.round())
	points = pts


func _find_floor_local() -> float:
	var space := get_world_2d().direct_space_state
	var hit := space.intersect_ray(PhysicsRayQueryParameters2D.create(
			global_position, global_position + Vector2(0, 200), GameState.LAYER_WORLD))
	if hit.is_empty():
		return 40.0
	var hp: Vector2 = hit.position
	return hp.y - global_position.y - 1.0
