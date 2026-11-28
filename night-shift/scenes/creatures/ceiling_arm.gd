class_name CeilingArm
extends Area2D
## Ceiling Arm. A long, thin, grey-pale arm with far too many joints, living in
## a vent (or under a floor grate).
##
## LIGHT RULE: lit -> it's caught: frozen for a heartbeat in your beam, fingers
## splayed and trembling (a black hand, right there), then it snaps back into
## the vent, violently, much faster than it came out, and stays there a while. In the dark it reaches down, feels around,
## and grabs you if you're underneath.
## SOUND FIRST: scratching inside the duct before it appears.
##
## HOW IT MOVES (scary phase 4): it doesn't slide out. It UNFOLDS, one joint at
## a time: each bone jackknifes open with a click and a pause, the arm hanging
## there half-out... then the last few joints and the hand come all at once.
## Fully out, the hand drags its fingertips across the floor and taps, one
## finger after another, feeling for you.
##
## LOOK: 5-14 bones of irregular length, each joint a swollen knuckle; skin
## BLACK, with a wet grey sheen only on the edges that catch your light, so in
## the beam it's a black hand against the lit wall. Five fingers far too long,
## three joints each, pale yellowed nails.
##
## Creature layer + Light Only material for the torch pass; a night pass (black,
## cold edges) keeps it visible in the dark.
## Root sits on the ceiling at the vent (or the floor at a grate).

enum State { HIDDEN, SCRATCH, REACH, RETRACT }

## Starts scratching when the player comes within this horizontal distance.
@export var notice_range := 110.0
@export var scratch_time := 1.3
## Overall reach speed (px/s, roughly). The joints come out unevenly around it.
@export var reach_speed := 38.0
## Snap-back speed when lit (px/s); it pulls back slower when it just gives up.
@export var retract_speed := 220.0
## Stays in the vent this long after being lit.
@export var lit_cooldown := 3.0
## Gives up and pulls back after hanging fully out this long.
@export var linger_time := 4.0
## Reaches UP out of a floor grate instead of down from a vent (design doc:
## "vents and holes above and below"). Walk over it in the dark and it has you.
@export var from_floor := false
## Floor arms only come up to the shins.
@export var floor_reach := 30.0
## The teaching arm (zone 2): it reaches and feels around like the real ones,
## but it can't grab. Taught safely first, then used for real.
@export var harmless := false

const BASE := Color(0.05, 0.05, 0.06)
const RIM := Color(0.58, 0.59, 0.62)       # a wet, oily sheen where the light catches it
const SHEEN := Color(0.22, 0.23, 0.26)     # the highlight running down each bone
const SHADOW := Color(0.015, 0.015, 0.02)
const DARK := Color(0.0, 0.0, 0.0)
const NAIL := Color(0.66, 0.62, 0.50)
const VEIN := Color(0.12, 0.13, 0.15)

var state := State.HIDDEN
var length := 0.0         # current reach in px (for the grab)
var max_length := 40.0    # set from the space under the vent
var _state_time := 0.0
var _cooldown := 0.0
var _t := 0.0
var _caught := false
var _measured := false
var _points := PackedVector2Array()
var _tip_shape := CircleShape2D.new()

var _bones := PackedFloat32Array()   # bone lengths
var _bend := PackedFloat32Array()    # rest bend at each joint (rad): the zig-zag
var _dur := PackedFloat32Array()     # seconds each bone takes to unfold
var _prog := 0.0                     # bones out (0..N, fractional)
var _pause := 0.0
var _violent := false
## Caught in the light: seconds it stays frozen before it whips back.
var _held_in_light := 0.0
var _shake := 0.0
var _full_time := 0.0
var _finger_len := PackedFloat32Array()
var _last_tap := 0.0
var _rng := RandomNumberGenerator.new()

@onready var scratch: AudioStreamPlayer2D = $Scratch


func _ready() -> void:
	# Always visible: the night pass (CreatureDraw.add_night_pass).
	_night = CreatureDraw.add_night_pass(self, _paint)
	add_to_group("creatures")
	collision_layer = GameState.LAYER_CREATURES
	collision_mask = GameState.LAYER_PLAYER
	light_mask = GameState.LIGHT_CREATURES
	_tip_shape.radius = 6.0
	$Tip.shape = _tip_shape
	_t = randf() * 10.0
	_rng.seed = int(global_position.x * 7.0 + global_position.y)
	scratch.stream = AudioDirector.get_stream("scrape_soft")
	scratch.bus = AudioDirector.WORLD_BUS
	_finger_len = PackedFloat32Array()
	for f in 5:
		_finger_len.append(_rng.randf_range(1.0, 1.35) * (0.7 if f == 0 else 1.0))
	_update_points()


## Leave room to stand: the hand stops a few px above the floor. Retried each
## physics tick until the tile collision exists.
func _measure() -> void:
	if from_floor:
		max_length = floor_reach
		_measured = true
		_build_bones()
		return
	var space := get_world_2d().direct_space_state
	var hit := space.intersect_ray(PhysicsRayQueryParameters2D.create(
			global_position + Vector2(0, 2), global_position + Vector2(0, 200), GameState.LAYER_WORLD))
	if not hit.is_empty():   # tile collision can take a frame or two to exist: retry
		var hp: Vector2 = hit.position
		max_length = maxf(8.0, hp.y - global_position.y - 6.0)
		_measured = true
		_build_bones()


## Too many joints, none the same length.
func _build_bones() -> void:
	var n := clampi(roundi(max_length / 7.0), 4, 14)
	_bones = PackedFloat32Array()
	_bend = PackedFloat32Array()
	_dur = PackedFloat32Array()
	var total := 0.0
	for i in n:
		var l := _rng.randf_range(0.7, 1.35)
		_bones.append(l)
		total += l
	for i in n:
		# Crooked: every joint bends the other way, by a different amount.
		var s := 1.0 if i % 2 == 0 else -1.0
		_bend.append(0.0 if i == 0 else s * _rng.randf_range(0.35, 0.75) * (0.5 if i == 1 else 1.0))
		var fast := i >= n - 3
		_dur.append(_rng.randf_range(0.05, 0.08) if fast else _rng.randf_range(0.18, 0.4))
	# The zig-zag shortens the drop: scale the bones so the hand still reaches.
	var a := PI * 0.5
	var drop := 0.0
	for i in n:
		a += _bend[i]
		drop += absf(sin(a)) * _bones[i]
	var fit := max_length / maxf(drop, 1.0)
	for i in n:
		_bones[i] = _bones[i] * fit


func reset() -> void:
	_enter(State.HIDDEN)
	length = 0.0
	_prog = 0.0
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
		_violent = true
		_held_in_light = 0.35 if length > 12.0 else 0.0
		_shake = 1.0
		AudioDirector.play_at("tap", global_position, -8.0, 0.3, 300.0, 0.6)
		AudioDirector.play_at("crack", global_position, -16.0, 0.2, 300.0, 1.6)


func _enter(new_state: State) -> void:
	state = new_state
	_state_time = 0.0


func _physics_process(delta: float) -> void:
	_t += delta
	_state_time += delta
	_cooldown = maxf(0.0, _cooldown - delta)
	_shake = move_toward(_shake, 0.0, delta * 3.0)
	if not _measured:
		_measure()
	if GameState.player == null or _bones.is_empty():
		return
	var player_pos: Vector2 = GameState.player.global_position
	var near := absf(player_pos.x - global_position.x) < notice_range
	if from_floor:
		near = near and absf(player_pos.y - global_position.y) < 40.0
	else:
		near = near and player_pos.y > global_position.y and player_pos.y - global_position.y < max_length + 40.0
	var n := _bones.size()

	match state:
		State.HIDDEN:
			if near and _cooldown <= 0.0:
				_enter(State.SCRATCH)
				# Something scratching around inside the duct (a long loop:
				# start somewhere random in it so it never sounds the same).
				scratch.pitch_scale = randf_range(0.95, 1.1)
				scratch.volume_db = -4.0
				scratch.play(randf() * 20.0)
				Narrator.say("dont_stand_under_it")
		State.SCRATCH:
			if _state_time >= scratch_time:
				scratch.stop()
				_enter(State.REACH)
				_full_time = 0.0
				GameState.mark_encounter("arm", "arm_%d" % get_instance_id())
		State.REACH:
			_unfold(delta, n)
			if _prog >= float(n):
				_full_time += delta
				if _full_time > linger_time and not near:
					_enter(State.RETRACT)
					_violent = false
		State.RETRACT:
			scratch.stop()
			if _held_in_light > 0.0:
				_held_in_light -= delta        # a heartbeat, frozen in the light
				length = _reach_length()
				_update_points()
				$Tip.position = _points[_points.size() - 1]
				_redraw()
				return
			var speed := retract_speed * (1.8 if _violent else 0.3)
			_prog = maxf(0.0, _prog - delta * speed / maxf(max_length, 1.0) * float(n))
			if _prog <= 0.0:
				_cooldown = lit_cooldown
				_enter(State.HIDDEN)

	length = _reach_length()
	_update_points()
	$Tip.position = _points[_points.size() - 1]
	$Tip.set_deferred("disabled", length < 10.0)
	_check_grab()
	_redraw()


## Joint by joint: a bone swings open, a click, a pause... the last ones fast.
func _unfold(delta: float, n: int) -> void:
	if _prog >= float(n):
		return
	if _pause > 0.0:
		_pause -= delta
		return
	var k := int(_prog)
	var before := k
	_prog = minf(float(n), _prog + delta / (_dur[k] * 38.0 / maxf(reach_speed, 1.0)))
	var now := int(_prog)
	if now > before and now < n:
		AudioDirector.play_at("tap", global_position + _points[_points.size() - 1], -20.0, 0.25, 260.0, 0.45)
		if now < n - 3:
			_pause = _rng.randf_range(0.12, 0.55)


func _reach_length() -> float:
	var total := 0.0
	for i in _bones.size():
		total += _bones[i] * clampf(_prog - float(i), 0.0, 1.0)
	return total


func _check_grab() -> void:
	if _caught or harmless or state != State.REACH or length < max_length * 0.5:
		return
	for body in get_overlapping_bodies():
		if body.is_in_group("player"):
			_caught = true
			GameState.player_caught.emit(self)
			return


func _searching() -> bool:
	return state == State.REACH and _prog >= float(_bones.size())


## The chain: each bone hangs from the last at its own crooked angle. A bone
## that's still unfolding is folded back against its parent and swings open
## with a little overshoot.
func _update_points() -> void:
	_points = PackedVector2Array([Vector2.ZERO])
	if _bones.is_empty() or _prog <= 0.0:
		return
	var down := -1.0 if from_floor else 1.0
	var lean := 0.0
	if GameState.player != null:
		var dx: float = GameState.player.global_position.x - global_position.x
		lean = clampf(dx / maxf(max_length * 1.6, 1.0), -0.45, 0.45)
	if _searching():
		lean += sin(_t * 0.6) * 0.18           # the hand drags side to side
	var a := PI * 0.5 * down - lean * down
	a += sin(_t * 47.0) * 0.08 * _shake
	var p := Vector2.ZERO
	for i in _bones.size():
		var frac := clampf(_prog - float(i), 0.0, 1.0)
		if frac <= 0.0:
			break
		var s := 1.0 if _bend[i] >= 0.0 else -1.0
		var open := _ease_open(frac)
		var bend := _bend[i] * open + s * 2.3 * (1.0 - open)
		bend += sin(_t * 1.3 + float(i) * 1.7) * 0.05
		a += bend
		var len_now := _bones[i] * minf(1.0, frac * 1.7)
		p += Vector2.from_angle(a) * len_now
		_points.append(p)


## 0 -> 1 with a small overshoot: a joint snapping open.
func _ease_open(t: float) -> float:
	var c := 1.9
	var u := t - 1.0
	return 1.0 + (c + 1.0) * u * u * u + c * u * u


var _night: Node2D


func _redraw() -> void:
	queue_redraw()
	if _night != null:
		_night.queue_redraw()


func _draw() -> void:
	_paint(self)


## Shared by the torch pass (self) and the night pass.
func _paint(ci: CanvasItem) -> void:
	var ldir := CreatureDraw.light_dir(self, Vector2(0, max_length * 0.5 * (-1.0 if from_floor else 1.0)))
	# The hole it comes out of.
	ci.draw_rect(Rect2(-4, -1, 8, 2), DARK)
	var n := _points.size()
	if n < 2:
		return
	var w_root := 6.0 if not from_floor else 5.0
	var w_wrist := 3.2 if not from_floor else 2.8
	# Bones, each its own tapering segment.
	for i in range(1, n):
		var k0 := float(i - 1) / maxf(float(n - 1), 1.0)
		var k1 := float(i) / maxf(float(n - 1), 1.0)
		var a := _points[i - 1]
		var b := _points[i]
		var seg := PackedVector2Array([a, a.lerp(b, 0.5), b])
		CreatureDraw.limb(ci, seg, lerpf(w_root, w_wrist, k0), lerpf(w_root, w_wrist, k1), BASE, RIM, SHADOW, ldir)
		# Black and wet: a thin highlight down the bone, towards the light.
		var off2 := (b - a).orthogonal().normalized()
		if off2.dot(ldir) < 0.0:
			off2 = -off2
		ci.draw_line(a + off2 * 0.6, b + off2 * 0.6, SHEEN, 1.0)
		# A vein running down the first bones.
		if i <= 3 and a.distance_to(b) > 4.0:
			var off := (b - a).orthogonal().normalized() * 0.8
			ci.draw_line(a + off, a.lerp(b, 0.8) + off, VEIN, 1.0)
		# A bump mid-bone on the long ones: even more joints than joints.
		if a.distance_to(b) > 9.0:
			ci.draw_rect(Rect2(a.lerp(b, 0.5).round(), Vector2(1, 1)), SHADOW)
	for i in range(1, n - 1):
		var w := lerpf(w_root, w_wrist, float(i) / maxf(float(n - 1), 1.0))
		CreatureDraw.knuckle(ci, _points[i], w * 0.62, BASE, RIM, DARK, ldir)
	_draw_hand(ci, ldir)


## A narrow palm and five fingers far too long, three joints each.
func _draw_hand(ci: CanvasItem, ldir: Vector2) -> void:
	var n := _points.size()
	var wrist := _points[n - 1]
	var along := (wrist - _points[n - 2]).normalized()
	if along.length() < 0.5:
		along = Vector2(0, -1 if from_floor else 1)
	var side := along.orthogonal()
	var palm_end := wrist + along * 6.0
	CreatureDraw.limb(ci, PackedVector2Array([wrist, wrist + along * 3.0, palm_end]), 4.0, 5.2, BASE, RIM, SHADOW, ldir)
	var searching := _searching()
	var floor_y := max_length + 6.0
	for f in 5:
		var spread := (float(f) - 2.0) * 0.36
		var root := palm_end + side * (float(f) - 2.0) * 1.1 - along * (2.5 if f == 0 else 0.0)
		var a := along.angle() + spread
		var curl := 0.35 + 0.25 * sin(_t * 0.9 + float(f))
		if searching:
			# Fingertips on the floor, lifting and tapping one after another.
			var tap := maxf(0.0, sin(_t * 5.0 - float(f) * 1.3))
			curl = 0.15 + tap * 0.7
			if tap > 0.95 and _t - _last_tap > 0.3 and not from_floor:
				_last_tap = _t
				AudioDirector.play_at("tap", global_position + root, -22.0, 0.3, 240.0, 1.2)
		elif state == State.RETRACT and _held_in_light > 0.0:
			curl = -0.3 + randf_range(-0.12, 0.12)    # caught: splayed open, trembling
		elif state == State.RETRACT:
			curl = 1.2                                # clenched as it snaps back
		elif randf() < 0.02:
			curl += randf_range(-0.6, 0.6)            # a twitch
		var l := 4.0 * _finger_len[f]
		var p := root
		var pts := PackedVector2Array([p])
		for j in 3:
			a += curl * (1.0 if spread >= 0.0 else -1.0) * (0.5 + 0.25 * float(j))
			p += Vector2.from_angle(a) * l * (1.0 - 0.12 * float(j))
			if searching and not from_floor:
				p.y = minf(p.y, floor_y)              # dragging along the floor
			pts.append(p)
		CreatureDraw.limb(ci, pts, 2.2, 1.1, BASE, RIM, SHADOW, ldir)
		ci.draw_rect(Rect2(pts[1].round(), Vector2(1, 1)), SHADOW)   # finger joints
		ci.draw_rect(Rect2(pts[2].round(), Vector2(1, 1)), SHADOW)
		ci.draw_rect(Rect2(pts[3].round(), Vector2(1, 1)), NAIL)     # the nail
