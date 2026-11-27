class_name WedgedThing
extends Area2D
## The Wedged Thing (placeholder). Main threat.
##
## A tall, thin, ribbed body with one eye and many long legs, too big for the
## tunnels: it is wedged between floor and ceiling, legs braced on both,
## squeezing itself along. Drawn procedurally (lines + rects) with two-bone IK
## legs that step one at a time on the floor AND the ceiling.
##
## VISIBILITY: the root has a CanvasItemMaterial with Light Mode = Light Only and
## light_mask = creature bit, so everything drawn here exists only inside the
## torch beam. Out of the beam you get sound only: scraping and leg taps.
##
## LIGHT RULE (the open question from the doc, implemented as proposed):
##   Lit -> freezes for `freeze_time` (2 s), legs still twitching. Then it comes
##   FASTER for `enrage_time`, ignoring the light. Each freeze makes it angrier.
##   Lighting it buys time but makes it worse.
##
## TUNNEL HEIGHT IS THE DESIGN: speed scales with the floor-to-ceiling gap.
##   Tight tunnels: squeezed, slow, louder scraping. Open rooms: fast.
##   Gaps lower than `min_squeeze` (the crouch gaps) stop it completely.
##
## The root sits on the floor. It only moves horizontally along its tunnel.

enum State { DORMANT, STALK, HUNT, FROZEN, ENRAGED }

@export_group("Speed (px/s)")
## Slow, constant drift towards the player once awake ("follows the player").
@export var stalk_speed := 18.0
## Heard something / saw the beam: heads for it.
@export var hunt_speed := 38.0
@export var enrage_multiplier := 1.8
## Floor-to-ceiling gap (px) at which speed is exactly 1x. Smaller = slower.
@export var normal_gap := 84.0
## Can't fit through gaps lower than this. Crouch gaps (32 px) are safe.
@export var min_squeeze := 40.0
## Never stretches taller than this, even in a shaft.
@export var max_gap := 176.0

@export_group("Light")
@export var freeze_time := 2.0
@export var enrage_time := 3.5
## After a rage ends it can't be frozen again for this long.
@export var freeze_immunity := 1.0

@export_group("Senses")
## Seconds it keeps hunting a noise before going back to stalking.
@export var hunt_memory := 5.0
## Always knows where the player is inside this radius.
@export var sense_radius := 90.0
## Notices a beam pointed its way from this far, even out of the beam's reach.
@export var light_sight_range := 230.0
## The eye catches the torch from this far (well past the 120 px beam) and
## glints back: "a single bright pixel in the dark is the warning sign".
@export var glint_range := 340.0
## Delay before it moves again after the player respawns.
@export var respawn_grace := 3.0

const BODY_HALF_WIDTH := 6.0
const STEP_DISTANCE := 12.0
const FLOOR := 1
const CEILING := -1

var state := State.DORMANT
var dir := -1                 # facing / travel direction (+1 = right)
var floor_y := 0.0
var ceil_y := 0.0
var gap := 64.0               # clamped floor-to-ceiling gap used for the body
var target_x := 0.0

var _active := false          # woken up by the level at least once
var _spawn := Vector2.ZERO
var _state_time := 0.0
var _hunt_left := 0.0
var _immune_left := 0.0
var _wake_left := 0.0
var _sight_cooldown := 0.0
var _anger := 0
var _moving := false
var _blocked := false
var _caught := false
var _seen_once := false
var _flickered := false
var _t := 0.0
var _legs: Array = []         # [{surface, rest, hip, foot, from, to, t}]
var _shape := RectangleShape2D.new()
var _glint: Node2D
var _glint_on := false
var _glint_check := 0.0

@onready var scrape: AudioStreamPlayer2D = $Scrape


func _ready() -> void:
	add_to_group("creatures")
	collision_layer = GameState.LAYER_CREATURES
	collision_mask = GameState.LAYER_PLAYER
	light_mask = GameState.LIGHT_CREATURES
	$Shape.shape = _shape
	_spawn = global_position
	floor_y = global_position.y
	target_x = global_position.x
	_refresh_space()
	_init_legs()
	GameState.noise_made.connect(_on_noise)
	scrape.stream = AudioDirector.get_stream("scrape")
	scrape.bus = AudioDirector.WORLD_BUS
	scrape.volume_db = -60.0
	scrape.play()
	# The glint is drawn UNSHADED (not Light Only): it shows even out of the beam.
	_glint = Node2D.new()
	var glint_mat := CanvasItemMaterial.new()
	glint_mat.light_mode = CanvasItemMaterial.LIGHT_MODE_UNSHADED
	_glint.material = glint_mat
	_glint.z_index = 1
	_glint.visible = false
	_glint.draw.connect(_draw_glint)
	add_child(_glint)


# --------------------------------------------------------------------------- API

## Wake it up (the level calls this when the player reaches the tunnel).
func activate() -> void:
	_active = true
	if state == State.DORMANT and _wake_left <= 0.0:
		_enter(State.STALK)


## Back to the spawn point after the player is caught.
func reset() -> void:
	global_position = _spawn
	floor_y = _spawn.y
	target_x = _spawn.x
	_refresh_space()
	_anger = 0
	_caught = false
	_hunt_left = 0.0
	_immune_left = 0.0
	_enter(State.DORMANT)
	_wake_left = respawn_grace if _active else 0.0
	_init_legs()


## Points the torch raycasts to. Lit if any of them is in the beam with clear LOS.
func get_light_probe_points() -> Array:
	var eye: Vector2 = _body_points().eye
	return [
		global_position + Vector2(0, -gap * 0.5),
		global_position + Vector2(0, -gap * 0.25),
		global_position + Vector2(0, -gap * 0.75),
		global_position + eye,
	]


## Called by the torch when the beam starts / stops touching it.
func on_torch_lit_changed(lit: bool) -> void:
	if not lit or state == State.DORMANT:
		return
	if not _seen_once:
		_seen_once = true
		Narrator.say("it_can_see_you")
	if (state == State.STALK or state == State.HUNT) and _immune_left <= 0.0:
		_anger += 1
		_enter(State.FROZEN)
		# A low groan as it locks up.
		AudioDirector.play_at("creak", _center(), -8.0, 0.0, 420.0, 0.5)


func debug_text() -> String:
	return "%s gap:%d anger:%d%s" % [State.keys()[state], int(gap), _anger,
			" BLOCKED" if _blocked else ""]


# ---------------------------------------------------------------------- behaviour

func _physics_process(delta: float) -> void:
	_t += delta
	_state_time += delta
	_immune_left = maxf(0.0, _immune_left - delta)
	_hunt_left = maxf(0.0, _hunt_left - delta)
	if GameState.player == null:
		return
	if state == State.DORMANT and not _moving:
		# Tile collision may not exist on the spawn frame; keep measuring the
		# tunnel while it waits so it's drawn the right height if you light it.
		_refresh_space()
	var player_pos: Vector2 = GameState.player.global_position

	match state:
		State.DORMANT:
			if _wake_left > 0.0:
				_wake_left -= delta
				if _wake_left <= 0.0:
					_enter(State.STALK)
		State.STALK:
			target_x = player_pos.x
		State.HUNT:
			if _hunt_left <= 0.0:
				_enter(State.STALK)
		State.FROZEN:
			if _state_time >= freeze_time:
				_enter(State.ENRAGED)
				if _anger == 1:
					Narrator.say("it_likes_the_light")
		State.ENRAGED:
			# It knows exactly where the light came from.
			target_x = player_pos.x
			if _state_time >= enrage_time:
				_immune_left = freeze_immunity
				_hunt_left = hunt_memory
				_enter(State.HUNT)

	if state == State.STALK or state == State.HUNT:
		if _center().distance_to(player_pos + Vector2(0, -14)) < sense_radius:
			target_x = player_pos.x
		_sight_cooldown -= delta
		if _sight_cooldown <= 0.0:
			_sight_cooldown = 0.2
			_check_torch_sight()

	_update_glint(delta)
	_move(delta)
	_update_legs(delta)
	_update_shape()
	_update_audio(delta)
	_check_events(player_pos)
	_check_catch()
	queue_redraw()


func _enter(new_state: State) -> void:
	state = new_state
	_state_time = 0.0


## Noise system: it hunts by sound.
func _on_noise(origin: Vector2, radius: float) -> void:
	if state == State.DORMANT or state == State.FROZEN or state == State.ENRAGED:
		return
	if _center().distance_to(origin) > radius:
		return
	target_x = origin.x
	_hunt_left = hunt_memory
	if state == State.STALK:
		_enter(State.HUNT)


## The eye glint: when the torch points at the eye from up to `glint_range`
## away with clear line of sight, one warm pixel answers back. Works even while
## it sleeps ("the eye far down a tunnel"). The colour is torchlight, not red:
## a seed for the ending.
func _update_glint(delta: float) -> void:
	_glint_check -= delta
	if _glint_check <= 0.0:
		_glint_check = 0.08
		_glint_on = _torch_points_at_eye(glint_range, 0.0)
	_glint.visible = _glint_on
	if _glint_on:
		_glint.position = _body_points().eye
		_glint.queue_redraw()


func _torch_points_at_eye(max_range: float, slack: float) -> bool:
	var torch = GameState.torch
	if torch == null or not torch.is_on:
		return false
	var from: Vector2 = torch.global_position
	var eye_local: Vector2 = _body_points().eye
	var to := global_position + eye_local - from
	if to.length() > max_range:
		return false
	var half := deg_to_rad(float(torch.cone_angle_deg)) * 0.5 + slack
	if absf(angle_difference(float(torch.global_rotation), to.angle())) > half:
		return false
	var query := PhysicsRayQueryParameters2D.create(from, from + to, GameState.LAYER_WORLD)
	return get_world_2d().direct_space_state.intersect_ray(query).is_empty()


func _draw_glint() -> void:
	var flick := 0.75 + 0.25 * sin(_t * 23.0)
	_glint.draw_rect(Rect2(-1, -1, 3, 3), Color(1.0, 0.85, 0.55, 0.18 * flick))
	_glint.draw_rect(Rect2(0, 0, 1, 1), Color(1.0, 0.95, 0.78, flick))


## Some of the danger is looking for the torch: a beam pointed its way is
## noticed from well beyond the distance the beam actually lights.
func _check_torch_sight() -> void:
	var torch = GameState.torch
	if torch == null or not torch.is_on or GameState.is_lit(self):
		return
	var from: Vector2 = torch.global_position
	var eye_local: Vector2 = _body_points().eye
	var eye := global_position + eye_local
	var to := eye - from
	if to.length() > light_sight_range:
		return
	var half := deg_to_rad(float(torch.cone_angle_deg)) * 0.5 + 0.2
	if absf(angle_difference(float(torch.global_rotation), to.angle())) > half:
		return
	var query := PhysicsRayQueryParameters2D.create(from, eye, GameState.LAYER_WORLD)
	if not get_world_2d().direct_space_state.intersect_ray(query).is_empty():
		return
	target_x = from.x
	_hunt_left = hunt_memory
	if state == State.STALK:
		_enter(State.HUNT)


func _current_speed() -> float:
	var base := 0.0
	match state:
		State.STALK:
			base = stalk_speed
		State.HUNT:
			base = hunt_speed
		State.ENRAGED:
			base = hunt_speed * enrage_multiplier * (1.0 + 0.15 * float(_anger - 1))
	return base * clampf(gap / normal_gap, 0.5, 1.8)


func _move(delta: float) -> void:
	_moving = false
	var speed := _current_speed()
	if speed <= 0.0:
		return
	var dx := target_x - global_position.x
	if absf(dx) < 2.0:
		return
	var step_dir := 1 if dx > 0.0 else -1
	dir = step_dir
	var advance := minf(speed * delta, absf(dx))
	var lead := float(step_dir) * (advance + BODY_HALF_WIDTH)
	# 1) Wall straight ahead?
	var space := get_world_2d().direct_space_state
	var eye_level := Vector2(global_position.x, floor_y - 8.0)
	var wall := space.intersect_ray(PhysicsRayQueryParameters2D.create(
			eye_level, eye_level + Vector2(lead, 0), GameState.LAYER_WORLD))
	# 2) Is the space ahead tall enough to squeeze into, with the same floor?
	var ahead := _measure_at(global_position.x + lead)
	_blocked = not wall.is_empty() or ahead.x - ahead.y < min_squeeze \
			or absf(ahead.x - floor_y) > 2.0
	if _blocked:
		return
	global_position.x += float(step_dir) * advance
	_moving = true
	_refresh_space()


## Returns Vector2(floor_y, ceiling_y) at world x.
func _measure_at(x: float) -> Vector2:
	var space := get_world_2d().direct_space_state
	var from := Vector2(x, floor_y - 6.0)
	var down := space.intersect_ray(PhysicsRayQueryParameters2D.create(
			from, from + Vector2(0, 48), GameState.LAYER_WORLD))
	var f := floor_y
	if not down.is_empty():
		var dp: Vector2 = down.position
		f = dp.y
	var up_from := Vector2(x, f - 1.0)
	var up := space.intersect_ray(PhysicsRayQueryParameters2D.create(
			up_from, up_from + Vector2(0, -400), GameState.LAYER_WORLD))
	var c := f - 400.0
	if not up.is_empty():
		var upos: Vector2 = up.position
		c = upos.y
	return Vector2(f, c)


func _refresh_space() -> void:
	var m := _measure_at(global_position.x)
	floor_y = m.x
	ceil_y = m.y
	global_position.y = floor_y
	gap = clampf(floor_y - ceil_y, 16.0, max_gap)


func _update_shape() -> void:
	_shape.size = Vector2(BODY_HALF_WIDTH * 2.0, maxf(gap * 0.8, 14.0))
	$Shape.position = Vector2(0, -gap * 0.5)


func _update_audio(delta: float) -> void:
	# Silence when it stops is part of the scare: it's frozen, or it's listening.
	var target_db := -60.0
	if _moving:
		var loud := clampf(_current_speed() / 50.0, 0.25, 1.0)
		if gap < 48.0:
			loud = minf(loud * 1.4, 1.0)   # squeezed: skin dragging on both surfaces
		target_db = linear_to_db(loud) - 4.0
		scrape.pitch_scale = 0.8 + _current_speed() / 160.0
	scrape.volume_db = lerpf(scrape.volume_db, target_db, clampf(delta * 6.0, 0.0, 1.0))


func _check_events(player_pos: Vector2) -> void:
	# Scripted torch flicker the first time it gets close.
	if not _flickered and state != State.DORMANT and global_position.distance_to(player_pos) < 150.0:
		_flickered = true
		if GameState.torch != null:
			GameState.torch.flicker(0.5)
	if GameState.get_lit_time(self) > 3.0:
		Narrator.say("stop_looking")


func _check_catch() -> void:
	if _caught or state == State.DORMANT:
		return
	for body in get_overlapping_bodies():
		if body.is_in_group("player"):
			_caught = true
			GameState.player_caught.emit(self)
			return


func _center() -> Vector2:
	return global_position + Vector2(0, -gap * 0.5)


# --------------------------------------------------------------------------- legs
# Placeholder procedural legs: two-bone IK, feet planted on floor and ceiling,
# one leg per surface stepping at a time. Swap for Skeleton2D + Bone2D later;
# the foot-target logic carries over.

func _init_legs() -> void:
	_legs.clear()
	# Many long legs (design doc): four braced on the floor, four on the ceiling.
	var floor_rest := [-24.0, -9.0, 7.0, 22.0]
	var ceil_rest := [-20.0, -5.0, 11.0, 26.0]
	for r: float in floor_rest:
		_legs.append(_make_leg(FLOOR, r, 0.38))
	for r: float in ceil_rest:
		_legs.append(_make_leg(CEILING, r, 0.62))


func _make_leg(surface: int, rest: float, hip: float) -> Dictionary:
	var foot := Vector2(global_position.x + rest * dir, _surface_y(surface))
	return {"surface": surface, "rest": rest, "hip": hip,
			"foot": foot, "from": foot, "to": foot, "t": 1.0}


func _surface_y(surface: int) -> float:
	if surface == FLOOR:
		return floor_y
	if floor_y - ceil_y <= max_gap + 8.0:
		return ceil_y
	return floor_y - gap * 0.9   # ceiling out of reach (a shaft): legs reach up into nothing


func _update_legs(delta: float) -> void:
	var step_time := 0.1 if state == State.ENRAGED else 0.2
	var stepping := {FLOOR: 0, CEILING: 0}
	for leg in _legs:
		if float(leg.t) < 1.0:
			stepping[leg.surface] += 1
	for leg in _legs:
		var surface: int = leg.surface
		var surface_y := _surface_y(surface)
		var desired := Vector2(global_position.x + (float(leg.rest) + 3.0) * dir, surface_y)
		if float(leg.t) < 1.0:
			var k := minf(1.0, float(leg.t) + delta / step_time)
			leg.t = k
			var from: Vector2 = leg.from
			var p := from.lerp(leg.to, smoothstep(0.0, 1.0, k))
			p.y -= sin(k * PI) * 5.0 * surface   # floor feet lift up, ceiling feet drop
			leg.foot = p
			if k >= 1.0:
				leg.foot = leg.to
				AudioDirector.play_at("tap", leg.foot, -14.0 if surface == FLOOR else -18.0, 0.2, 380.0)
		else:
			var foot: Vector2 = leg.foot
			foot.y = surface_y   # stay braced as the tunnel height changes
			leg.foot = foot
			if state != State.FROZEN and stepping[surface] == 0 \
					and foot.distance_to(desired) > STEP_DISTANCE:
				leg.from = foot
				leg.to = desired + Vector2(dir * 5.0, 0)
				leg.t = 0.0
				stepping[surface] += 1


## Two-bone IK. Picks the knee that bends AWAY from the body: spidery, wrong.
func _knee(hip: Vector2, foot: Vector2, seg: float, body_x: float) -> Vector2:
	var d := clampf(hip.distance_to(foot), 0.01, seg * 2.0 - 0.01)
	var base := (foot - hip).angle()
	var a := acos(clampf(d / (2.0 * seg), -1.0, 1.0))
	var k1 := hip + Vector2.from_angle(base + a) * seg
	var k2 := hip + Vector2.from_angle(base - a) * seg
	return k1 if absf(k1.x - body_x) > absf(k2.x - body_x) else k2


## Key body points in local space, shared by drawing and light probes.
func _body_points() -> Dictionary:
	var sway := 0.0 if state == State.FROZEN else sin(_t * 1.3) * 1.5
	var torso_top := -gap * 0.78
	var neck := Vector2(sway, torso_top)
	var head_len := clampf(gap * 0.22, 7.0, 20.0)
	var tip := neck + Vector2(dir * head_len * 0.8, -head_len * 0.6)
	tip.y = maxf(tip.y, -(floor_y - ceil_y) + 2.0)   # never through the ceiling
	return {"sway": sway, "torso_top": torso_top, "torso_bottom": -gap * 0.25,
			"neck": neck, "tip": tip, "eye": neck.lerp(tip, 0.75)}


# ------------------------------------------------------------------------ drawing
# Placeholder-free procedural look: tapered bone-white legs with knobbed knees,
# a pinched ribcage of a body, an elongated skull with one eye. Everything is
# drawn under the Light Only material, so only what the beam touches exists.

const SKIN := Color(0.80, 0.77, 0.72)
const SKIN_HI := Color(0.94, 0.91, 0.86)
const SKIN_SHADE := Color(0.52, 0.49, 0.47)
const SKIN_DARK := Color(0.27, 0.25, 0.25)
const EYE := Color(1.0, 0.93, 0.66)


## A limb that tapers from w0 to w1 px, with a darker underside.
func _bone(a: Vector2, b: Vector2, w0: float, w1: float, col: Color) -> void:
	var steps := 3
	var side := (b - a).orthogonal().normalized()
	for i in steps:
		var p0 := a.lerp(b, float(i) / steps)
		var p1 := a.lerp(b, float(i + 1) / steps)
		var w := lerpf(w0, w1, (i + 0.5) / steps)
		draw_line(p0, p1, col, w)
		if w >= 2.0:
			draw_line(p0 + side * (w * 0.5), p1 + side * (w * 0.5), SKIN_SHADE, 1.0)


func _draw() -> void:
	var b := _body_points()
	var sway: float = b.sway
	var seg := gap * 0.3 + 8.0
	var leg_col := SKIN.darkened(0.12)

	# Legs behind the body: thigh 3 px, shin to a needle tip, knobbed knee.
	for leg in _legs:
		var hip := Vector2(sway + (2.0 if float(leg.rest) > 0.0 else -2.0), -gap * float(leg.hip))
		var foot: Vector2 = leg.foot - global_position
		var knee := _knee(hip, foot, seg, sway)
		if state == State.FROZEN and randf() < 0.3:
			knee += Vector2(randf_range(-1.5, 1.5), randf_range(-1.5, 1.5))   # still twitching
		_bone(hip, knee, 3.0, 2.0, leg_col)
		_bone(knee, foot, 2.0, 1.0, leg_col)
		var k := knee.round()
		draw_rect(Rect2(k - Vector2(1, 1), Vector2(3, 3)), SKIN_SHADE)
		draw_rect(Rect2(k - Vector2(1, 1), Vector2(1, 1)), SKIN_HI)
		draw_rect(Rect2(foot.round(), Vector2(1, 1)), SKIN_DARK)   # tip on concrete

	# Body: a pinched ribcage, wider at the chest, narrow at the waist.
	var top: float = b.torso_top
	var bottom: float = b.torso_bottom
	var h := bottom - top
	var y := top
	while y < bottom:
		var k := (y - top) / maxf(h, 1.0)
		var half := 2.0 + 2.5 * sin(PI * clampf(k * 1.4, 0.0, 1.0))   # ribcage swell, then waist
		var x0 := sway - half
		draw_rect(Rect2(x0, y, half * 2.0, 1), SKIN)
		draw_rect(Rect2(x0, y, 1, 1), SKIN_HI)                       # lit edge
		draw_rect(Rect2(sway + half - 1.0, y, 1, 1), SKIN_SHADE)     # shadow edge
		if int(y - top) % 3 == 2 and k < 0.75:
			draw_rect(Rect2(x0 + 1.0, y, half * 2.0 - 2.0, 1), SKIN_SHADE)   # rib
		y += 1.0
	draw_line(Vector2(sway, top + 1.0), Vector2(sway, bottom), SKIN_SHADE, 1.0)  # spine

	# Neck and an elongated skull leaning the way it travels.
	var neck: Vector2 = b.neck
	var tip: Vector2 = b.tip
	draw_line(Vector2(sway, top), neck, SKIN_SHADE, 2.0)
	for i in 5:
		var t := float(i) / 4.0
		var p := neck.lerp(tip, t)
		var w := lerpf(4.0, 1.5, t)
		draw_rect(Rect2(p.round() - Vector2(w * 0.5, w * 0.5), Vector2(w, w)), SKIN if i < 4 else SKIN_SHADE)
	draw_line(neck + Vector2(0, 2), tip + Vector2(0, 1), SKIN_SHADE, 1.0)          # jaw line

	# The eye: a dark socket around one warm, torch-coloured point. NOT a red
	# monster eye: seed for ending A ("the eye was a torch").
	var eye: Vector2 = b.eye.round()
	draw_rect(Rect2(eye - Vector2(2, 1), Vector2(4, 3)), SKIN_DARK)
	draw_rect(Rect2(eye - Vector2(1, 0), Vector2(2, 1)), EYE)
	draw_rect(Rect2(eye, Vector2(1, 1)), Color(1, 1, 1))
