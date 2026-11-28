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
## on it for a couple of seconds. Otherwise, while disguised: NO movement at all.
## MOVING (scary phase 4): it drops off the wall and comes along the floor in
## S-curves like a snake, the front end reared up off the floor, swaying,
## sniffing. Its head is the cut end: the rubber split back, a mouth of bare
## copper strands opening and closing, sparks spitting, arcs jumping between
## the strands. It coils twice round your ankle when it has you.
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
var _sparks: CPUParticles2D
var _tip_draw: Node2D
var _arc_draw: Node2D        # unshaded: the arcs glow in the dark
var _arc := PackedVector2Array()


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
	# Spark particles when it moves (design doc).
	_sparks = CPUParticles2D.new()
	_sparks.emitting = false
	_sparks.amount = 10
	_sparks.lifetime = 0.35
	_sparks.explosiveness = 0.6
	_sparks.direction = Vector2(0, -1)
	_sparks.spread = 70.0
	_sparks.gravity = Vector2(0, 420)
	_sparks.initial_velocity_min = 30.0
	_sparks.initial_velocity_max = 70.0
	_sparks.scale_amount_min = 1.0
	_sparks.scale_amount_max = 1.0
	_sparks.color = Color(1.0, 0.92, 0.6)
	_sparks.texture = CreatureDraw.pixel_texture()
	var spark_mat := CanvasItemMaterial.new()
	spark_mat.light_mode = CanvasItemMaterial.LIGHT_MODE_UNSHADED
	_sparks.material = spark_mat
	add_child(_sparks)
	# The frayed copper end, drawn as part of the cable (environment layer).
	_tip_draw = Node2D.new()
	_tip_draw.draw.connect(_draw_tip)
	# In front of the player: the coils go round your ankle, not behind it.
	_tip_draw.z_as_relative = false
	_tip_draw.z_index = 2
	add_child(_tip_draw)
	_arc_draw = Node2D.new()
	var arc_mat := CanvasItemMaterial.new()
	arc_mat.light_mode = CanvasItemMaterial.LIGHT_MODE_UNSHADED
	_arc_draw.material = arc_mat
	_arc_draw.z_as_relative = false
	_arc_draw.z_index = 2
	_arc_draw.draw.connect(func():
		if _arc.size() == 3:
			_arc_draw.draw_line(_arc[0], _arc[1], Color(0.85, 0.92, 1.0), 1.0)
			_arc_draw.draw_line(_arc[1], _arc[2], Color(0.85, 0.92, 1.0), 1.0))
	add_child(_arc_draw)


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
	if points.size() > 0:
		pts.append(to_global(points[points.size() - 1]))   # the reared head
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
	GameState.mark_encounter("cable", "cable_%d" % get_instance_id())


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
	var head := points[points.size() - 1] if moving and points.size() > 0 else _tip
	_spark.position = head
	_spark.energy = randf_range(0.2, 0.9) if moving and randf() < 0.25 else 0.0
	_sparks.position = head
	if moving and randf() < 0.07:
		_sparks.restart()
		_sparks.emitting = true
	_tip_draw.queue_redraw()
	_arc_draw.queue_redraw()


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


## Anchor -> down the wall -> along the floor to the tip. On the floor it moves
## in S-curves: a wave travelling from the head back down the body. The front
## end rears up off the floor in an S of its own, swaying like a snake's head.
## While it has you it's pulled taut and trembling, coiled round your ankle.
func _build_slither() -> void:
	var pts := PackedVector2Array()
	var floor_y := _floor_local
	var corner := Vector2(0, floor_y)
	var n := 28
	var head_dir := signf(_tip.x) if absf(_tip.x) > 0.5 else 1.0
	for i in n + 1:
		var t := float(i) / n
		var p: Vector2
		if t < 0.18:
			# Down the wall, swinging a little.
			var k := t / 0.18
			p = Vector2(sin(_t * 3.0) * 2.0 * k * (1.0 - k), lerpf(0.0, floor_y, k))
		else:
			var k := (t - 0.18) / 0.82
			p = corner.lerp(Vector2(_tip.x, floor_y), k)
			if state == State.GRAB:
				p.y -= sin(_t * 70.0 + k * 30.0) * 0.7 * k             # taut, trembling
			else:
				# The S-wave along the floor, bigger towards the head...
				p.y -= absf(sin(_t * 7.0 - k * 16.0)) * (1.0 + 3.0 * k)
				p.x += sin(_t * 7.0 - k * 16.0) * 1.5 * k * head_dir
				# ...and the head reared up off the floor, swaying.
				var rear := smoothstep(0.78, 1.0, k)
				p.y -= rear * (9.0 + sin(_t * 2.3) * 3.0)
				p.x -= rear * rear * head_dir * (4.0 + sin(_t * 1.7) * 2.0)
		pts.append(p.round())
	if state == State.GRAB:
		pts[pts.size() - 1] = _tip.round()
	points = pts


func _find_floor_local() -> float:
	var space := get_world_2d().direct_space_state
	var hit := space.intersect_ray(PhysicsRayQueryParameters2D.create(
			global_position, global_position + Vector2(0, 200), GameState.LAYER_WORLD))
	if hit.is_empty():
		return 40.0
	var hp: Vector2 = hit.position
	return hp.y - global_position.y - 1.0


## While it hunts, the free end is a head: the rubber sheath split and peeled
## back, and a mouth of bare copper strands that opens and closes, sniffing for
## you, twitching, spitting sparks. Hanging, it's just a cable.
func _draw_tip() -> void:
	if state == State.HANGING or points.size() < 2:
		_arc = PackedVector2Array()
		return
	var copper := Color(0.62, 0.40, 0.22)
	var bright := Color(0.95, 0.72, 0.42)
	var rubber := Color(0.08, 0.08, 0.09)
	var head := points[points.size() - 1]
	var base := (head - points[points.size() - 2]).angle()
	# A dull sheen along the body while it moves, so the S-curve reads.
	var sheen := PackedVector2Array()
	for i in range(int(points.size() * 0.18), points.size()):
		sheen.append(points[i] + Vector2(0, -1))
	if sheen.size() > 1:
		_tip_draw.draw_polyline(sheen, Color(0.34, 0.34, 0.36), 1.0)
	if state == State.GRAB:
		_draw_coils(rubber)
		head = _tip
	var open := 0.5 + 0.5 * sin(_t * (14.0 if state == State.GRAB else 6.0))
	# The split sheath, peeled back in two flaps.
	for side: float in [-1.0, 1.0]:
		var flap := head + Vector2.from_angle(base + side * 2.3) * 3.0
		_tip_draw.draw_line(head, flap, rubber, 2.0)
	# Seven strands: a mouth that opens, the ends twitching on their own.
	var ends := []
	for i in 7:
		var a := base + (float(i) - 3.0) * (0.22 + open * 0.24) + sin(_t * 23.0 + float(i) * 1.7) * 0.18
		var mid := head + Vector2.from_angle(a) * (3.0 + float(i % 2))
		var end := mid + Vector2.from_angle(a + sin(_t * 9.0 + float(i) * 2.0) * 0.7) * (2.0 + open * 3.0)
		_tip_draw.draw_line(head, mid, copper, 1.0)
		_tip_draw.draw_line(mid, end, bright if i % 2 == 0 else copper, 1.0)
		ends.append(end)
	# Now and then an arc jumps between two strands: a hard white crack.
	_arc = PackedVector2Array()
	if randf() < 0.18 and ends.size() > 2:
		var a0: Vector2 = ends[randi() % ends.size()]
		var a1: Vector2 = ends[randi() % ends.size()]
		_arc = PackedVector2Array([a0, (a0 + a1) * 0.5 + Vector2(randf_range(-2, 2), randf_range(-2, 2)), a1])


## Two loops of cable round your ankle, squeezing.
func _draw_coils(rubber: Color) -> void:
	var p = GameState.player
	if p == null:
		return
	var ankle: Vector2 = to_local(p.global_position + Vector2(0, -5))
	var squeeze := 0.8 + 0.2 * sin(_t * 9.0)
	for c in 2:
		var cy := ankle.y - float(c) * 4.0
		var rx := 6.0 * squeeze
		var prev := ankle
		for s in 13:
			var ang := TAU * float(s) / 12.0
			var q := Vector2(ankle.x + cos(ang) * rx, cy + sin(ang) * 1.6)
			if s > 0:
				var front := sin(ang) > 0.0
				_tip_draw.draw_line(prev, q, rubber if front else Color(0.20, 0.20, 0.22), 2.0)
				if front:
					_tip_draw.draw_line(prev + Vector2(0, -1), q + Vector2(0, -1), Color(0.40, 0.40, 0.42), 1.0)
			prev = q
