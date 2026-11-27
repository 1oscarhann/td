class_name CeilingArm
extends Area2D
## Ceiling Arm. A long, thin, grey-pale arm with too many joints, living in a vent.
##
## LIGHT RULE: lit -> it pulls back into the vent (fast) and stays there a while.
## In the dark it reaches down, feels around, and grabs you if you're underneath.
## SOUND FIRST: scratching inside the duct before it appears.
## Makes vertical torch aiming essential: check above, not just left and right.
##
## Creature layer + Light Only material: invisible outside the beam.
## Root sits on the ceiling at the vent. Placeholder procedural arm: a jointed
## chain that sways, steers towards you and twitches its fingers.

enum State { HIDDEN, SCRATCH, REACH, RETRACT }

## Starts scratching when the player comes within this horizontal distance.
@export var notice_range := 110.0
@export var scratch_time := 1.3
@export var reach_speed := 38.0
@export var retract_speed := 220.0
## Stays in the vent this long after being lit.
@export var lit_cooldown := 3.0
## Gives up and pulls back after hanging this long.
@export var linger_time := 4.0
@export var segments := 8
## Reaches UP out of a floor grate instead of down from a vent (design doc:
## "vents and holes above and below"). Walk over it in the dark and it has you.
@export var from_floor := false
## Floor arms only come up to the shins.
@export var floor_reach := 30.0

var state := State.HIDDEN
var length := 0.0         # current reach in px
var max_length := 40.0    # set from the space under the vent
var _state_time := 0.0
var _cooldown := 0.0
var _t := 0.0
var _caught := false
var _measured := false
var _points := PackedVector2Array()
var _tip_shape := CircleShape2D.new()

@onready var scratch: AudioStreamPlayer2D = $Scratch


func _ready() -> void:
	add_to_group("creatures")
	collision_layer = GameState.LAYER_CREATURES
	collision_mask = GameState.LAYER_PLAYER
	light_mask = GameState.LIGHT_CREATURES
	_tip_shape.radius = 6.0
	$Tip.shape = _tip_shape
	_t = randf() * 10.0
	scratch.stream = AudioDirector.get_stream("scrape")
	scratch.bus = AudioDirector.WORLD_BUS
	_update_points()


## Leave room to stand: the hand stops a few px above the floor. Retried each
## physics tick until the tile collision exists.
func _measure() -> void:
	if from_floor:
		max_length = floor_reach
		_measured = true
		return
	var space := get_world_2d().direct_space_state
	var hit := space.intersect_ray(PhysicsRayQueryParameters2D.create(
			global_position + Vector2(0, 2), global_position + Vector2(0, 200), GameState.LAYER_WORLD))
	if not hit.is_empty():   # tile collision can take a frame or two to exist: retry
		var hp: Vector2 = hit.position
		max_length = maxf(8.0, hp.y - global_position.y - 6.0)
		_measured = true


func reset() -> void:
	_enter(State.HIDDEN)
	length = 0.0
	_cooldown = 0.0
	_caught = false
	scratch.stop()


func get_light_probe_points() -> Array:
	var pts: Array = []
	for i in range(1, _points.size()):
		pts.append(global_position + _points[i])
	return pts


func on_torch_lit_changed(lit: bool) -> void:
	if lit and (state == State.REACH or state == State.SCRATCH):
		_enter(State.RETRACT)
		AudioDirector.play_at("tap", global_position, -10.0, 0.3, 300.0, 0.7)


func _enter(new_state: State) -> void:
	state = new_state
	_state_time = 0.0


func _physics_process(delta: float) -> void:
	_t += delta
	_state_time += delta
	_cooldown = maxf(0.0, _cooldown - delta)
	if not _measured:
		_measure()
	if GameState.player == null:
		return
	var player_pos: Vector2 = GameState.player.global_position
	var near := absf(player_pos.x - global_position.x) < notice_range
	if from_floor:
		near = near and absf(player_pos.y - global_position.y) < 40.0
	else:
		near = near and player_pos.y > global_position.y and player_pos.y - global_position.y < max_length + 40.0

	match state:
		State.HIDDEN:
			if near and _cooldown <= 0.0:
				_enter(State.SCRATCH)
				scratch.pitch_scale = 1.9
				scratch.volume_db = -14.0
				scratch.play()
				Narrator.say("dont_stand_under_it")
		State.SCRATCH:
			if _state_time >= scratch_time:
				scratch.stop()
				_enter(State.REACH)
		State.REACH:
			length = minf(max_length, length + reach_speed * delta)
			if length >= max_length and _state_time > linger_time and not near:
				_enter(State.RETRACT)
		State.RETRACT:
			scratch.stop()
			length = maxf(0.0, length - retract_speed * delta)
			if length <= 0.0:
				_cooldown = lit_cooldown
				_enter(State.HIDDEN)

	_update_points()
	$Tip.position = _points[_points.size() - 1]
	$Tip.set_deferred("disabled", length < 10.0)
	_check_grab()
	queue_redraw()


func _check_grab() -> void:
	if _caught or state != State.REACH or length < max_length * 0.5:
		return
	for body in get_overlapping_bodies():
		if body.is_in_group("player"):
			_caught = true
			GameState.player_caught.emit(self)
			return


## Builds the jointed chain: hangs down, sways, steers towards the player.
func _update_points() -> void:
	_points = PackedVector2Array([Vector2.ZERO])
	if length <= 0.5:
		return
	var seg := length / segments
	var down := -1.0 if from_floor else 1.0
	var angle := PI * 0.5 * down
	var steer := 0.0
	if GameState.player != null:
		var dx: float = GameState.player.global_position.x - global_position.x
		steer = clampf(dx / maxf(max_length, 1.0), -1.0, 1.0) * 0.12
	var p := Vector2.ZERO
	for i in segments:
		angle += sin(_t * 1.7 + i * 1.3) * 0.22 + steer
		if from_floor:
			angle = clampf(angle, -PI * 0.85, -PI * 0.15)   # never curls back down
		else:
			angle = clampf(angle, PI * 0.15, PI * 0.85)     # never curls back up
		p += Vector2.from_angle(angle) * seg
		_points.append(p)


func _draw() -> void:
	if _points.size() < 2:
		return
	var skin := Color(0.74, 0.72, 0.69)
	var shade := Color(0.42, 0.40, 0.39)
	var dark := Color(0.16, 0.15, 0.15)
	var nail := Color(0.86, 0.82, 0.70)
	var n := _points.size()
	# Too many joints: a thin grey-pale arm, each joint a swollen knuckle.
	for i in range(1, n):
		var w := lerpf(3.0, 1.5, float(i - 1) / maxf(1.0, float(n - 2)))
		var a := _points[i - 1]
		var b := _points[i]
		draw_line(a, b, skin, w)
		var side := (b - a).orthogonal().normalized()
		draw_line(a + side * (w * 0.5), b + side * (w * 0.5), shade, 1.0)
		if i < n - 1:
			var k := b.round()
			draw_rect(Rect2(k - Vector2(1, 1), Vector2(3, 3)), shade)
			draw_rect(Rect2(k - Vector2(1, 1), Vector2(2, 1)), skin)
	# The hand: a bony wrist, a narrow palm, four long fingers that feel about
	# and tap, each with a long yellowed nail.
	var wrist := _points[n - 1]
	var along := (wrist - _points[n - 2]).normalized()
	var palm := wrist + along * 4.0
	draw_line(wrist, palm, skin, 3.0)
	draw_line(wrist, palm, shade, 1.0)
	var searching := state == State.REACH and length >= max_length - 0.5
	for f in 4:
		var spread := (f - 1.5) * 0.42
		var tap := 0.0
		if searching:
			# Fingers lift and tap one after another, feeling for you.
			tap = maxf(0.0, sin(_t * 6.0 - f * 1.1)) * 0.6
		var a1 := along.angle() + spread - tap * signf(spread + 0.01)
		var mid := palm + Vector2.from_angle(a1) * 5.0
		var curl := a1 + (0.6 + tap) * (1.0 if spread >= 0.0 else -1.0)
		var tip := mid + Vector2.from_angle(curl) * 5.0
		draw_line(palm, mid, skin, 1.0)
		draw_line(mid, tip, skin, 1.0)
		draw_rect(Rect2(mid.round(), Vector2(1, 1)), dark)          # finger joint
		draw_rect(Rect2(tip.round(), Vector2(1, 1)), nail)           # nail
