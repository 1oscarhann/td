class_name WedgedThing
extends Area2D
## The Wedged Thing. Main threat.
##
## LOOK (from the concept art, original design): a tall charcoal body seen from
## the front. One long head-stalk with a single eye near the top and a seam of a
## mouth running down it, spiked bony shoulders, a ribbed chest, a hollow gut,
## two very long arms ending in blades that hang to the floor, and a skirt of ten
## long curved legs splaying out from the pelvis. Too big for the tunnels: in a
## low tunnel it's crammed in, head bent against the ceiling, shoulder spikes
## scraping it, legs splayed wider.
##
## VISIBILITY: always visible as a black silhouette with a cold edge and a pale
## eye (the night pass); the torch reveals the real skin and detail (the root
## has a Light Only material on the creature light mask). Darkness hides
## detail, not existence.
## ANIMATION: procedural, in layers (springs, IK legs with a gait, verlet arms,
## acting per state). See the rig section.
##
## BEHAVIOUR (scary phase 2):
##   DORMANT  sleeping / not here yet. Stays dormant until zone 3.
##   PATROL   wanders slowly between points. It does NOT know where you are.
##            It notices you by HEARING (how you move: crouch 32 px, walk 96,
##            run 220, standing still 18, crouched and still: nothing), by
##            noise events (boards, levers),
##            or by your torch held on it for 1.5 s. While lit it holds still.
##   NOTICED  freezes 0.8 s, the sting, the head snaps to you, the screen jolts.
##   CHASE    ~75 px/s at a normal tunnel height (faster than walking, slower
##            than running), scaled by the gap rule. Lit -> FROZEN for 1 s, then
##            it lurches on and ignores the light for a moment.
##            It tracks you while it can hear you or see you (LOS: 48 px in the
##            dark, 420 px if your torch is on). 3 s without either -> SEARCH.
##   SEARCH   goes to where it last had you and sniffs around for 6 s, then
##            back to PATROL.
##   Director: every 60-120 s of patrolling it drifts towards your general area,
##   never your exact position.
##
## HIDING: its body sits high on the leg skirt. Crouched and still in the dark,
## in a tunnel tall enough, it can walk right over you. Moving, standing or a
## lit torch gives you away. In tight tunnels there's no room under it.
##
## TUNNEL HEIGHT IS THE DESIGN: speed scales with the floor-to-ceiling gap.
## Gaps lower than `min_squeeze` (the crouch gaps) stop it completely.
## The root sits on the floor. It only moves horizontally along its tunnel.

enum State { DORMANT, PATROL, NOTICED, CHASE, FROZEN, SEARCH }

@export_group("Speed (px/s at normal_gap)")
@export var patrol_speed := 20.0
@export var chase_speed := 75.0
@export var search_speed := 32.0
## Floor-to-ceiling gap (px) at which speed is exactly 1x. Smaller = slower.
## 72: tight tunnels (48) ~50 px/s, corridors (64-96) 67-100, rooms 130+.
@export var normal_gap := 72.0
## Can't fit through gaps lower than this. Crouch gaps (32 px) are safe.
@export var min_squeeze := 40.0
## Never stretches taller than this, even in a shaft.
@export var max_gap := 176.0

@export_group("Senses")
## Torch held on it (or pointed at it from afar) this long while it's unaware.
@export var light_notice_time := 1.5
## How far it can see you with your torch OFF while it hunts (it hunts by
## sound). Searching, it only sniffs: in the dark, it can't see you at all.
@export var sight_dark := 48.0
## ...and with it ON. Your light gives you away.
@export var sight_torch := 420.0
## Seconds without hearing or seeing you before it gives up the chase.
@export var lose_time := 3.0
@export var search_time := 6.0
## A beam pointed its way is noticed from this far, even past the beam's reach.
@export var light_sight_range := 230.0
## The eye catches the torch from this far and glints back.
@export var glint_range := 340.0
## Delay before it moves again after the player respawns.
@export var respawn_grace := 3.0

@export_group("Light")
@export var notice_time := 0.8
@export var freeze_time := 1.0
## After a freeze it can't be frozen again for this long ("then continue").
@export var freeze_immunity := 2.5
@export var lurch_time := 0.45

@export_group("Director")
@export var nudge_min := 60.0
@export var nudge_max := 120.0

## Its full height when nothing is in the way (3.4x the player): taller than
## almost every tunnel, so it's nearly always crammed in.
const NATURAL_H := 150.0
## Body proportions as fractions of its current height.
const PELVIS := 0.42
const SHOULDER := 0.80
const BODY_HALF_WIDTH := 6.0
const STEP_DISTANCE := 14.0
## The breathing fades in this close (px), only while it's NOT in the beam.
const BREATH_RANGE := 200.0
## [rest x at natural height, behind the body?, length/arch factor]. Irregular
## on purpose: no two legs the same.
const LEG_LAYOUT := [
	[-46.0, true, 1.00], [47.0, true, 0.94], [-15.0, true, 0.90], [16.0, true, 0.97],
	[-55.0, false, 1.08], [-39.0, false, 0.93], [-25.0, false, 1.02],
	[24.0, false, 0.98], [38.0, false, 1.10], [53.0, false, 0.90],
]

var state := State.DORMANT
var dir := -1                 # travel / lean direction (+1 = right)
var floor_y := 0.0
var ceil_y := 0.0
var gap := 84.0               # clamped floor-to-ceiling gap
var target_x := 0.0
## Scripted puppets (zone 2 glimpses) and the ending drive speed directly.
var speed_override := -1.0
## A puppet never catches, notices or talks.
var puppet := false
## Drawn pitch black: a cut-out against a light (the zone 2 glimpse).
var silhouette := false

var _active := false          # woken up by the level at least once
var _wake_chase := false      # wake straight into a chase (the zone 4 climax)
var _spawn := Vector2.ZERO
var _state_time := 0.0
var _wake_left := 0.0
var _immune_left := 0.0
var _lurch_left := 0.0
var _kick := 0.0              # lurch jolt (px), decays
var _anger := 0
var _moving := false
var _blocked := false
var _caught := false
var _seen_once := false
var _flickered := false
var _t := 0.0
var _legs: Array = []
var _shape := RectangleShape2D.new()
var _glint: Node2D
var _glint_on := false
var _glint_check := 0.0
var _twitch := 0.0            # sudden head snap offset (rad), decays
var _twitch_timer := 2.0
var _breath: AudioStreamPlayer2D
var _gurgle_timer := 6.0
var _notice_cooldown := 0.0
## Why it last noticed you (debug overlay): "heard", "light", "noise", "touch"...
var notice_reason := ""

# Senses and memory.
var _last_known := Vector2.ZERO
var _unseen := 0.0
var _light_seen := 0.0
var _sense_timer := 0.0
var _perceived := false
var _beam_timer := 0.0
var _beam_on_me := false

# Patrol.
var _span_ready := false
var _span_tries := 0
var _patrol_min := 0.0
var _patrol_max := 0.0
var _patrol_goal := 0.0
var _patrol_pause := 0.0
var _nudge_left := 90.0
var _sniffing := false
var _sniff_time := 0.0
var _sniff_next := 0.0

# Animation.
var _head_angle := 0.0        # head-stalk tilt from vertical (rad, + = right)
var _snap_frames := 0         # the head snapping round on notice: 2 frames, no easing
var _snap_target := 0.0
var _idle_twitch := 2.0       # seconds to the next sudden leg twitch while still
var _dust: CPUParticles2D

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
	_patrol_goal = target_x
	_refresh_space()
	_init_legs()
	# Always visible: the night pass (see the drawing section).
	_night_node = CreatureDraw.add_night_pass(self, func(ci): _paint(ci, true), false)
	GameState.noise_made.connect(_on_noise)
	scrape.stream = AudioDirector.get_stream("scrape")
	scrape.bus = AudioDirector.WORLD_BUS
	scrape.volume_db = -60.0
	scrape.play(randf() * 8.0)
	# Second loop: wet, slow breathing. You hear it before you see it.
	_breath = AudioStreamPlayer2D.new()
	_breath.stream = AudioDirector.get_stream("thing_breath")
	_breath.bus = AudioDirector.WORLD_BUS
	_breath.max_distance = BREATH_RANGE + 60.0
	_breath.attenuation = 1.2
	_breath.volume_db = -60.0
	add_child(_breath)
	_breath.play(randf() * 25.0)
	# The glint is drawn UNSHADED (not Light Only): it shows even out of the beam.
	_glint = Node2D.new()
	var glint_mat := CanvasItemMaterial.new()
	glint_mat.light_mode = CanvasItemMaterial.LIGHT_MODE_UNSHADED
	_glint.material = glint_mat
	_glint.z_index = 1
	_glint.visible = false
	_glint.draw.connect(_draw_glint)
	add_child(_glint)
	# Dust off the ceiling where its shoulders scrape: drawn like the environment,
	# so you see it fall even when you can't see what's doing it.
	_dust = CPUParticles2D.new()
	_dust.material = CanvasItemMaterial.new()
	_dust.local_coords = false
	_dust.emitting = false
	_dust.amount = 26
	_dust.lifetime = 1.4
	_dust.scale_amount_min = 1.0
	_dust.scale_amount_max = 2.0
	_dust.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	_dust.emission_rect_extents = Vector2(14, 1)
	_dust.direction = Vector2(0, 1)
	_dust.spread = 25.0
	_dust.gravity = Vector2(0, 70)
	_dust.initial_velocity_min = 2.0
	_dust.initial_velocity_max = 10.0
	_dust.color = Color(0.78, 0.74, 0.66, 0.95)
	_dust.texture = CreatureDraw.pixel_texture()
	add_child(_dust)


# --------------------------------------------------------------------------- API

## Wake it up. It starts patrolling (it doesn't know where you are).
func activate() -> void:
	_active = true
	if state == State.DORMANT and _wake_left <= 0.0:
		_wake()


## Move it to another section of the basement (return trips). It starts
## dormant and wakes after `delay` seconds if `active`. With `chase` it wakes
## already hunting you (the zone 4 climax).
func relocate(pos: Vector2, active: bool, delay := 3.0, chase := false) -> void:
	_spawn = pos
	_active = active
	reset()
	_wake_chase = chase
	if active:
		_wake_left = maxf(delay, 0.01)


## The last stretch: it simply stops following you. No explanation.
func stop_chasing() -> void:
	_active = false
	_wake_left = 0.0
	_wake_chase = false
	_enter(State.DORMANT)


## Back to the spawn point after the player is caught.
func reset() -> void:
	global_position = _spawn
	floor_y = _spawn.y
	target_x = _spawn.x
	_patrol_goal = _spawn.x
	_refresh_space()
	_anger = 0
	_caught = false
	_immune_left = 0.0
	_lurch_left = 0.0
	_unseen = 0.0
	_light_seen = 0.0
	_span_ready = false
	_span_tries = 0
	_head_angle = 0.0
	_enter(State.DORMANT)
	_wake_left = respawn_grace if _active else 0.0
	_init_legs()


## Points the torch raycasts to. Lit if any of them is in the beam with clear LOS.
func get_light_probe_points() -> Array:
	var b := _body_points()
	var pelvis: Vector2 = b.pelvis
	var shoulders: Vector2 = b.shoulders
	var eye: Vector2 = b.eye
	return [
		global_position + pelvis,
		global_position + pelvis.lerp(shoulders, 0.5),
		global_position + shoulders,
		global_position + eye,
	]


## Called by the torch when the beam starts / stops touching it.
func on_torch_lit_changed(lit: bool) -> void:
	if not lit or state == State.DORMANT or puppet:
		return
	GameState.mark_encounter("thing", "thing", 15.0)
	if not _seen_once:
		_seen_once = true
		Narrator.say("it_can_see_you")


func debug_text() -> String:
	return "%s gap:%d anger:%d light:%.1f unseen:%.1f%s%s" % [State.keys()[state], int(gap), _anger,
			_light_seen, _unseen, " BLOCKED" if _blocked else "",
			(" (" + notice_reason + ")") if notice_reason != "" else ""]


# ---------------------------------------------------------------------- behaviour

func _physics_process(delta: float) -> void:
	_t += delta
	_state_time += delta
	_immune_left = maxf(0.0, _immune_left - delta)
	_lurch_left = maxf(0.0, _lurch_left - delta)
	_notice_cooldown = maxf(0.0, _notice_cooldown - delta)
	_kick = move_toward(_kick, 0.0, 40.0 * delta)
	if GameState.player == null:
		return
	if state == State.DORMANT and not _moving:
		# Tile collision may not exist on the spawn frame; keep measuring the
		# tunnel while it waits so it's drawn the right height if you light it.
		_refresh_space()
	var player: Player = GameState.player
	var lit := GameState.is_lit(self)

	if state != State.DORMANT:
		if not _span_ready:
			_compute_span()
		_sense_timer -= delta
		if _sense_timer <= 0.0:
			_sense_timer = 0.1
			_perceived = _hears(player) or _sees(player)
			if _perceived:
				_last_known = player.global_position
		_beam_timer -= delta
		if _beam_timer <= 0.0:
			_beam_timer = 0.15
			_beam_on_me = not lit and _beam_points_at_me()

	match state:
		State.DORMANT:
			if _wake_left > 0.0:
				_wake_left -= delta
				if _wake_left <= 0.0:
					_wake()
		State.PATROL:
			_patrol(delta, lit, player)
		State.NOTICED:
			target_x = global_position.x
			if _state_time >= notice_time:
				_unseen = 0.0
				_enter(State.CHASE)
		State.CHASE:
			_chase(delta, lit)
		State.FROZEN:
			target_x = global_position.x
			if _state_time >= freeze_time:
				# It doesn't ease back in. It lurches.
				_immune_left = freeze_immunity
				_lurch_left = lurch_time
				_kick = 8.0 * float(dir)
				_enter(State.CHASE)
				if _anger == 1:
					Narrator.say("it_likes_the_light")
		State.SEARCH:
			_search(delta, lit, player)

	_update_glint(delta)
	_update_twitch(delta)
	_move(delta)
	_update_legs(delta)
	_update_shape()
	_update_audio(delta)
	_check_events(player.global_position)
	_check_catch()
	_redraw()


func _enter(new_state: State) -> void:
	state = new_state
	_state_time = 0.0
	_look_timer = 0.0


func _wake() -> void:
	if _wake_chase and GameState.player != null:
		_notice(GameState.player.global_position, "woke hunting")
	else:
		_enter(State.PATROL)
		_nudge_left = randf_range(nudge_min, nudge_max)
		_patrol_pause = randf_range(0.5, 2.0)


## Unaware. Wanders, pauses, listens.
func _patrol(delta: float, lit: bool, player: Player) -> void:
	if lit or _beam_on_me:
		# The light holds it still, and if it stays on it, it notices.
		_light_seen += delta
		target_x = global_position.x
		if _light_seen >= light_notice_time:
			_notice(player.global_position, "light")
		return
	_light_seen = maxf(0.0, _light_seen - delta * 0.5)
	# Walking right over you without knowing: that's an encounter too, as far
	# as the pacing is concerned (it doesn't know, but YOU do).
	if absf(player.global_position.x - global_position.x) < 26.0 \
			and absf(player.global_position.y - global_position.y) < 40.0:
		GameState.mark_encounter("thing_pass", "thing", 15.0)
	if _perceived and _hears(player):
		_notice(player.global_position, "heard")
		return
	# The director: now and then it drifts towards where you roughly are.
	_nudge_left -= delta
	if _nudge_left <= 0.0:
		_nudge_left = randf_range(nudge_min, nudge_max)
		_pick_patrol_point(true)
	if _patrol_pause > 0.0:
		_patrol_pause -= delta
		target_x = global_position.x
		if _patrol_pause <= 0.0:
			_pick_patrol_point(false)
		return
	target_x = _patrol_goal
	if absf(_patrol_goal - global_position.x) < 3.0 or (_blocked and _state_time > 0.5):
		_patrol_pause = randf_range(1.5, 4.5)


## It knows. Head locked on, coming.
func _chase(delta: float, lit: bool) -> void:
	if lit and _immune_left <= 0.0:
		_anger = mini(_anger + 1, 4)
		_enter(State.FROZEN)
		AudioDirector.play_at("creak", _center(), -8.0, 0.0, 420.0, 0.5)
		return
	if _perceived:
		_unseen = 0.0
	else:
		_unseen += delta
	target_x = _last_known.x
	if _unseen >= lose_time:
		_enter(State.SEARCH)
		_sniffing = false
		_sniff_time = 0.0


## Lost you. Goes where it last had you, then sniffs about.
func _search(delta: float, lit: bool, player: Player) -> void:
	if lit:
		_notice(player.global_position, "light")   # the light came from somewhere
		return
	if _perceived:
		_notice(player.global_position, "heard")
		return
	if not _sniffing:
		target_x = _last_known.x
		if absf(_last_known.x - global_position.x) < 4.0 or _blocked or _state_time > 10.0:
			_sniffing = true
			_sniff_next = 0.0
		return
	_sniff_time += delta
	_sniff_next -= delta
	if _sniff_next <= 0.0:
		_sniff_next = randf_range(0.9, 1.7)
		target_x = _last_known.x + randf_range(-36.0, 36.0)
	if _sniff_time >= search_time:
		_enter(State.PATROL)
		_pick_patrol_point(false)


## Something gave you away: freeze, snap the head round, sting, then come.
func _notice(at: Vector2, reason := "") -> void:
	if puppet or state == State.NOTICED or state == State.CHASE:
		return
	notice_reason = reason
	GameState.mark_encounter("thing", "thing", 15.0)
	_last_known = at
	_light_seen = 0.0
	_enter(State.NOTICED)
	target_x = global_position.x
	if absf(at.x - global_position.x) > 2.0:
		dir = 1 if at.x > global_position.x else -1
	_snap_target = _head_target_angle()    # snaps round in two frames, no easing
	_snap_frames = 2
	if _chest_dyn != null:
		_chest_dyn.kick(Vector2(0, -70.0))   # a jolt through the whole body
		_pelvis_dyn.kick(Vector2(0, -25.0))
	if _notice_cooldown <= 0.0:
		_notice_cooldown = 4.0
		AudioDirector.hush_drone(0.8)
		AudioDirector.play_at("notice", _center(), 0.0, 0.04, 700.0)
	var p = GameState.player
	if p != null and p.global_position.distance_to(global_position) < 450.0:
		p.shake(2.0, 0.3)


## Noise system: boards, levers, footsteps.
func _on_noise(origin: Vector2, radius: float) -> void:
	if puppet or state == State.DORMANT or state == State.FROZEN or state == State.NOTICED:
		return
	if _ear().distance_to(origin) > radius:
		return
	match state:
		State.PATROL, State.SEARCH:
			_notice(origin, "noise")
		State.CHASE:
			if not _perceived:
				_last_known = origin
				_unseen = 0.0


## Can it hear you? Only depends on how you move (Player.hearing_radius). It
## feels you through the floor, so it's the distance along the tunnel that
## counts, not how high its body is. Crouched and still, you make no sound.
func _hears(player: Player) -> bool:
	if absf(player.global_position.y - global_position.y) > 100.0:
		return false
	return absf(player.global_position.x - global_position.x) <= player.hearing_radius()


## Can it see you? Barely in the dark; from far away if your torch is on.
func _sees(player: Player) -> bool:
	var torch_on: bool = GameState.torch != null and GameState.torch.is_on
	var reach := sight_torch if torch_on else (sight_dark if state == State.CHASE else 0.0)
	if reach <= 0.0:
		return false
	var eye := global_position + (_body_points().eye as Vector2)
	var chest := player.global_position + Vector2(0, -12.0 if player.crouching else -24.0)
	if eye.distance_to(chest) > reach:
		return false
	var query := PhysicsRayQueryParameters2D.create(eye, chest, GameState.LAYER_WORLD)
	return get_world_2d().direct_space_state.intersect_ray(query).is_empty()


## It listens from the pelvis, low down where its legs feel the floor.
func _ear() -> Vector2:
	return global_position + Vector2(0, -_height() * PELVIS)


func _pick_patrol_point(near_player: bool) -> void:
	var lo := _patrol_min
	var hi := _patrol_max
	_patrol_pause = 0.0
	if hi - lo < 40.0:
		_patrol_goal = global_position.x
		return
	var goal := global_position.x
	if near_player and GameState.player != null:
		# Your general area, never your exact spot.
		var px: float = GameState.player.global_position.x
		var side := -1.0 if randf() < 0.5 else 1.0
		goal = px + side * randf_range(120.0, 300.0)
		if goal < lo or goal > hi:
			goal = px - side * randf_range(120.0, 300.0)
	else:
		for i in 6:
			goal = randf_range(lo, hi)
			if absf(goal - global_position.x) > 120.0:
				break
	_patrol_goal = clampf(goal, lo, hi)


## Where it can get to from here: walk left and right with the same rules as
## _move until a wall, a step, or a gap it can't squeeze into.
func _compute_span() -> void:
	_span_tries += 1
	_patrol_min = _scan(-1)
	_patrol_max = _scan(1)
	_span_ready = _patrol_max - _patrol_min > 24.0 or _span_tries > 30


func _scan(s: int) -> float:
	var space := get_world_2d().direct_space_state
	var x := global_position.x
	for i in 175:
		var nx := x + float(s) * 8.0
		var lead := nx + float(s) * BODY_HALF_WIDTH
		var eye_level := Vector2(x, floor_y - 8.0)
		var wall := space.intersect_ray(PhysicsRayQueryParameters2D.create(
				eye_level, Vector2(lead, floor_y - 8.0), GameState.LAYER_WORLD))
		var m := _measure_at(lead)
		if not wall.is_empty() or m.x - m.y < min_squeeze or absf(m.x - floor_y) > 2.0:
			break
		x = nx
	return x


func _head_target_angle() -> float:
	var p = GameState.player
	var look := _last_known
	if p != null and (state == State.CHASE or state == State.NOTICED) and _perceived:
		look = p.global_position + Vector2(0, -24)
	if p == null and _last_known == Vector2.ZERO:
		return 0.25 * float(dir)
	var base := global_position + Vector2(0, -_height() * SHOULDER)
	var to := look - base
	return clampf(atan2(to.x, -to.y), -1.0, 1.0)


## The eye glint: when the torch points at the eye from up to `glint_range`
## away with clear line of sight, one warm pixel answers back. Works even while
## it sleeps ("the eye far down a tunnel"). The colour is torchlight, not red:
## a seed for the ending.
func _update_glint(delta: float) -> void:
	_glint_check -= delta
	if _glint_check <= 0.0:
		_glint_check = 0.08
		_glint_on = not silhouette and _torch_points_at_eye(glint_range, 0.0)
		if _glint_on and not _seen_once and state != State.DORMANT:
			_seen_once = true
			Narrator.say("it_can_see_you")   # first time the eye glints
	_glint.visible = _glint_on
	if _glint_on:
		_glint.position = _body_points().eye
		_glint.queue_redraw()


## Now and then the head snaps sideways and back. Wrong movement beats blood.
func _update_twitch(delta: float) -> void:
	_twitch = move_toward(_twitch, 0.0, 3.0 * delta)
	_twitch_timer -= delta
	if _twitch_timer <= 0.0 and state != State.DORMANT and state != State.FROZEN:
		_twitch = randf_range(0.25, 0.45) * (1.0 if randf() < 0.5 else -1.0)
		_twitch_timer = randf_range(0.8, 2.0) if state == State.CHASE else randf_range(2.0, 5.0)


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
	var flick := 0.8 + 0.2 * sin(_t * 23.0)
	_glint.draw_rect(Rect2(-2, -2, 5, 5), Color(1.0, 0.85, 0.55, 0.12 * flick))
	_glint.draw_rect(Rect2(-1, 0, 3, 1), Color(1.0, 0.90, 0.65, 0.5 * flick))
	_glint.draw_rect(Rect2(0, -1, 1, 3), Color(1.0, 0.90, 0.65, 0.5 * flick))
	_glint.draw_rect(Rect2(0, 0, 1, 1), Color(1.0, 0.97, 0.85, flick))


## A beam pointed its way from well beyond the distance it lights still counts
## as "the torch on it": some of the danger is looking for it.
func _beam_points_at_me() -> bool:
	return _torch_points_at_eye(light_sight_range, 0.2)


func _current_speed() -> float:
	var base := 0.0
	if speed_override >= 0.0:
		base = speed_override
	else:
		match state:
			State.PATROL:
				base = patrol_speed
			State.SEARCH:
				base = search_speed
			State.CHASE:
				base = chase_speed * (1.0 + 0.06 * float(_anger))
				if _lurch_left > 0.0:
					base *= 1.7
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


## Its current height: as tall as the tunnel lets it be.
func _height() -> float:
	return clampf(gap - 2.0, 30.0, NATURAL_H)


## The catch box. Unaware or searching, only the torso counts (pelvis up), so a
## crouched player can be underneath it. Hunting, it reaches all the way down.
func _update_shape() -> void:
	var h := _height()
	var top := -h
	var bottom := -h * PELVIS
	if state == State.CHASE:
		bottom = -2.0
	_shape.size = Vector2(BODY_HALF_WIDTH * 2.0, bottom - top)
	$Shape.position = Vector2(0, (top + bottom) * 0.5)


func _update_audio(delta: float) -> void:
	# Silence when it stops is part of the scare: it's frozen, or it's listening.
	var target_db := -60.0
	if _moving:
		var loud := clampf(_current_speed() / 50.0, 0.25, 1.0)
		if gap < 64.0:
			loud = minf(loud * 1.4, 1.0)   # squeezed: skin dragging on the ceiling
		target_db = linear_to_db(loud) - 4.0
		scrape.pitch_scale = 0.8 + _current_speed() / 160.0
	scrape.volume_db = lerpf(scrape.volume_db, target_db, clampf(delta * 6.0, 0.0, 1.0))

	# Breathing: close and NOT lit. Fades in over ~2 s, out over ~1 s.
	var breath_db := -60.0
	if GameState.player != null and not GameState.is_lit(self) \
			and _center().distance_to(GameState.player.global_position) < BREATH_RANGE:
		breath_db = -3.0
	var fade := 30.0 if breath_db > _breath.volume_db else 60.0
	_breath.volume_db = move_toward(_breath.volume_db, breath_db, fade * delta)

	# Dust off the ceiling while it scrapes along pressed up into it.
	var crammed := smoothstep(0.15, 0.5, 1.0 - _height() / NATURAL_H)
	_dust.emitting = _moving and crammed > 0.3 and not silhouette
	var chest_x := 0.0
	if _chest_dyn != null:
		chest_x = (_chest_dyn.y as Vector2).x - global_position.x
	_dust.position = Vector2(chest_x, -_height() + 3.0)
	_dust.emission_rect_extents = Vector2(16.0 * _wscale(), 1)

	# A wet gurgle from the body every 4-10 s while it moves. Quiet.
	if _moving:
		_gurgle_timer -= delta
		if _gurgle_timer <= 0.0:
			_gurgle_timer = randf_range(4.0, 10.0)
			AudioDirector.play_at("gurgle", _center(), -12.0, 0.08, 380.0)


func _check_events(player_pos: Vector2) -> void:
	if puppet:
		return
	# Scripted torch flicker the first time it gets close.
	if not _flickered and state != State.DORMANT and global_position.distance_to(player_pos) < 150.0:
		_flickered = true
		if GameState.torch != null:
			GameState.torch.flicker(0.5)
	if GameState.get_lit_time(self) > 3.0:
		Narrator.say("stop_looking")


func _check_catch() -> void:
	if _caught or puppet or state == State.DORMANT:
		return
	for body in get_overlapping_bodies():
		if body.is_in_group("player"):
			if state == State.PATROL:
				_notice(body.global_position, "touch")   # walked into it: it knows now
			elif state != State.NOTICED:
				_caught = true
				GameState.player_caught.emit(self)
			return


func _center() -> Vector2:
	return global_position + Vector2(0, -_height() * 0.6)


# --------------------------------------------------------------------------- rig
# Procedural animation in layers (the toolkit is in scripts/anim):
#  1. LEGS: two-bone IK from each hip to a foot planted in WORLD space. Bones
#     keep their length, so knees rise and fold instead of legs stretching like
#     rubber. Feet step in two alternating groups (a wave gait) on arcs, after a
#     beat of hesitation, testing the floor now and then. Hunting, it stops
#     bothering with the gait: legs thrown forward and slammed down.
#  2. BODY: the pelvis and the chest are springs (Dyn) chasing where the legs
#     carry them, in world space, so they have weight: a start lags, a stop
#     overshoots and settles, the chest whips after the pelvis, every footfall
#     jolts up through it, legs in the air make it sag.
#  3. HEAD: a spring with anticipation (it dips the wrong way for a beat before
#     it looks somewhere new). Glances and holds while it wanders, listens your
#     way when it stops, sniffs in jerks when it searches, snaps round and
#     wobbles when it notices you, and hangs dead still in the air, locked on
#     you, while the body bobs under it when it hunts.
#  4. ARMS: verlet chains pulled towards the posed arm: the blades swing, trail
#     behind when it lurches, and drag along the floor.
#  5. ACTING: pose targets per state: hunched asleep; low and listening; the
#     wind-up when it notices you (a jolt upright, then it coils and rears back,
#     blades lifting); pitched forward when it hunts; frozen in the light it
#     strains on the spot, updating on threes like stop-motion.

var _night_node: Node2D
var _pelvis_dyn: Dyn
var _chest_dyn: Dyn
var _head_dyn: Dyn
var _sink_dyn: Dyn
var _raise_dyn: Dyn
var _arm_chains: Array = []
var _vx := 0.0                 # how fast it's really moving (px/s), smoothed
var _prev_x := 0.0
var _last_group := 0           # the gait group that stepped last
var _look_timer := 0.0
var _look_target := 0.0
var _breath_phase := 0.0
var _tremble := Vector2.ZERO   # frozen: the strain, updated every third frame
var _tremble_frame := 0
var _chest_rest := Vector2.ZERO
var _arm_raise := 0.0
var _sink := 0.0
var _night := false


func _init_legs() -> void:
	_legs.clear()
	# Gait groups alternate along the skirt, so each group has legs on both sides.
	var order: Array = range(LEG_LAYOUT.size())
	order.sort_custom(func(a, b): return float(LEG_LAYOUT[a][0]) < float(LEG_LAYOUT[b][0]))
	var spread := _spread()
	var rng := RandomNumberGenerator.new()
	for i in LEG_LAYOUT.size():
		var l: Array = LEG_LAYOUT[i]
		var rest: float = l[0]
		var k: float = l[2]
		var side := signf(rest)
		rng.seed = 7919 + i
		# Bone lengths from the pose at full height: the thigh angles down and
		# out (a skirt, like the concept), the knee juts outward, a long shin
		# comes back in to the point.
		var root := Vector2(side * clampf(absf(rest) * 0.22, 3.0, 12.0), -NATURAL_H * PELVIS + 2.0)
		var to := Vector2(rest, 0.0) - root
		var d := to.length()
		var below := atan2(to.y, absf(to.x))
		var bend := maxf(below - deg_to_rad(22.0 + 12.0 * k), deg_to_rad(8.0))
		var a := d * (0.46 + 0.06 * k)
		var b := sqrt(maxf(a * a + d * d - 2.0 * a * d * cos(bend), 1.0))
		var foot := Vector2(global_position.x + rest * spread, floor_y)
		_legs.append({"rest": rest, "back": l[1], "k": k, "side": side,
				"group": order.find(i) % 2, "a": a, "b": b,
				"kinks": [rng.randf_range(1.2, 2.2), -rng.randf_range(1.0, 2.0), rng.randf_range(1.0, 2.2)],
				"foot": foot, "from": foot, "to": foot, "t": 1.0, "dur": 0.3, "lift": 6.0,
				"style": 0, "wait": -1.0, "taps": 0, "twitch_left": 0.0})
	_init_rig()


## Width scale: squashed into a low tunnel it gets a little narrower too (so it
## stays the same creature, crammed in, not a squat crab).
func _wscale() -> float:
	return lerpf(_height() / NATURAL_H, 1.0, 0.4)


## Legs splay wider the more it's squashed.
func _spread() -> float:
	return _wscale() * (1.0 + 0.35 * (1.0 - _height() / NATURAL_H))


## Bones shrink a little in low tunnels, but less than the body: the knees fold
## up towards the ceiling.
func _leg_scale() -> float:
	return lerpf(0.5, 1.0, _height() / NATURAL_H)


## 0 = standing free .. 1 = crammed, bent forward under the ceiling.
func _fwd() -> float:
	return smoothstep(0.15, 0.5, 1.0 - _height() / NATURAL_H)


func _shoulder_y(h: float) -> float:
	return lerpf(-h * SHOULDER, -(h - 5.0), _fwd())


## Springs and chains back to rest at the current spot.
func _init_rig() -> void:
	var gp := global_position
	var h := _height()
	_prev_x = gp.x
	_vx = 0.0
	var pelvis := gp + Vector2(0, -h * PELVIS)
	var chest := gp + Vector2(0, _shoulder_y(h))
	if _pelvis_dyn == null:
		_pelvis_dyn = Dyn.new(2.2, 0.45, 0.0, pelvis)    # heavy, settles
		_chest_dyn = Dyn.new(1.5, 0.32, 0.0, chest)      # whips after the pelvis
		_head_dyn = Dyn.new(1.5, 0.45, -0.6, 0.0)
		_sink_dyn = Dyn.new(1.8, 0.6, 0.0, 0.0)
		_raise_dyn = Dyn.new(2.5, 0.5, 0.0, 0.0)
	_pelvis_dyn.reset(pelvis)
	_chest_dyn.reset(chest)
	_head_dyn.reset(_head_angle)
	_sink_dyn.reset(0.0)
	_raise_dyn.reset(0.0)
	_sink = 0.0
	_arm_raise = 0.0
	_chest_rest = chest - gp
	_arm_chains.clear()
	var b := _body_points()
	for arm in b.arms:
		var ch := VerletChain.new()
		ch.setup(_arm_pose(arm, gp))
		ch.floor_y = floor_y - 0.5
		_arm_chains.append(ch)


func _update_legs(delta: float) -> void:
	_update_pose(delta)
	var chase := state == State.CHASE
	var lurch := _lurch_left > 0.0
	var search := state == State.SEARCH
	var still := state == State.FROZEN or state == State.NOTICED or state == State.DORMANT
	var max_stepping := 7 if lurch else (5 if chase else 4)
	var spread := _spread()
	var gp := global_position
	var lead := 0.12 if chase else 0.3            # feet land ahead of where it's going
	var threshold := (15.0 if chase else (9.0 if search else 11.0)) * maxf(_wscale(), 0.7)
	var stepping := 0
	var busy := [0, 0]
	var due := [0, 0]
	var desired := []
	for leg in _legs:
		var dx: float = gp.x + float(leg.rest) * spread + _vx * lead
		desired.append(dx)
		if float(leg.t) < 1.0:
			stepping += 1
			busy[int(leg.group)] += 1
		elif not still and absf((leg.foot as Vector2).x - dx) > threshold:
			due[int(leg.group)] += 1
	for i in _legs.size():
		var leg: Dictionary = _legs[i]
		if float(leg.t) < 1.0:
			_advance_step(leg, delta)
			continue
		var foot: Vector2 = leg.foot
		foot.y = floor_y
		leg.foot = foot
		if float(leg.twitch_left) > 0.0:
			leg.twitch_left = float(leg.twitch_left) - delta
			if float(leg.twitch_left) <= 0.0 and not bool(leg.back):
				AudioDirector.play_at("tap", foot, -18.0, 0.2, 300.0)
		var dx: float = desired[i]
		if still or absf(foot.x - dx) <= threshold:
			leg.wait = -1.0
			continue
		if stepping >= max_stepping:
			continue
		var g := int(leg.group)
		if not chase and not lurch:
			# The wave gait: a group only lifts while the other is planted, and
			# takes turns with it.
			if busy[1 - g] > 0:
				continue
			if g == _last_group and due[1 - g] > 0 and busy[g] == 0:
				continue
		if float(leg.wait) < 0.0:
			leg.wait = randf_range(0.0, 0.04) if chase or lurch else randf_range(0.0, 0.3)   # a beat of hesitation
		leg.wait = float(leg.wait) - delta
		if float(leg.wait) > 0.0:
			continue
		var ahead := signf(dx - foot.x)
		var to := Vector2(dx + ahead * (threshold * 0.45 + randf_range(-1.0, 3.0)), floor_y)
		if chase or lurch:
			to.x += randf_range(-5.0, 5.0)              # slammed down, not placed
		leg.from = foot
		leg.to = to
		leg.style = 1 if chase or lurch else 0
		var base_dur := 0.09 if lurch else (0.12 if chase else (0.26 if search else 0.36))
		leg.dur = base_dur * randf_range(0.8, 1.25)
		leg.lift = (randf_range(9.0, 15.0) if chase or lurch else randf_range(4.5, 8.0)) * maxf(_wscale(), 0.6)
		leg.taps = randi_range(1, 2) if state == State.PATROL and randf() < 0.3 else 0
		leg.t = 0.0
		leg.wait = -1.0
		busy[g] += 1
		stepping += 1
		_last_group = g


## One step along its arc. Wandering, it PLACES a foot: up quickly, a hang, set
## down deliberately. Hunting, it throws it forward and slams it down.
func _advance_step(leg: Dictionary, delta: float) -> void:
	var k := minf(1.0, float(leg.t) + delta / float(leg.dur))
	leg.t = k
	var from: Vector2 = leg.from
	var to: Vector2 = leg.to
	var ex: float
	var ey: float
	if int(leg.style) == 1:
		ex = 1.0 - (1.0 - k) * (1.0 - k)
		ey = sin(PI * minf(k * 1.15, 1.0))
	else:
		ex = smoothstep(0.0, 1.0, k)
		ey = pow(sin(PI * k), 0.6)
	var p := from.lerp(to, ex)
	p.y = floor_y - float(leg.lift) * ey
	leg.foot = p
	if k < 1.0:
		return
	leg.foot = Vector2(to.x, floor_y)
	# The footfall travels up into the body.
	var slam := int(leg.style) == 1
	_pelvis_dyn.kick(Vector2(0, 16.0 if slam else 6.0))
	_chest_dyn.kick(Vector2(0, 9.0 if slam else 3.0))
	if not bool(leg.back):
		AudioDirector.play_at("tap", leg.foot, -15.0, 0.2, 380.0)
	# Testing the floor: tap... tap... then it commits.
	if int(leg.taps) > 0:
		leg.taps = int(leg.taps) - 1
		leg.from = leg.foot
		leg.to = leg.foot
		leg.dur = 0.13
		leg.lift = randf_range(2.5, 4.0)
		leg.style = 0
		leg.t = 0.0


## Standing still it is STILL, except that now and then one or two legs
## twitch, all at once, for no reason.
func _update_idle_twitch(delta: float) -> void:
	if _moving or state == State.FROZEN or state == State.CHASE:
		return
	_idle_twitch -= delta
	if _idle_twitch > 0.0:
		return
	_idle_twitch = randf_range(1.8, 6.0)
	for i in randi_range(1, 2):
		var leg: Dictionary = _legs[randi() % _legs.size()]
		leg.twitch_left = randf_range(0.08, 0.18)


## Head target for looking around: hold, then somewhere new. `toward` (+1/-1):
## most of the time it turns that way (listening towards you).
func _glance(delta: float, base: float, spread: float, tmin: float, tmax: float, toward := 0.0) -> float:
	_look_timer -= delta
	if _look_timer <= 0.0:
		_look_timer = randf_range(tmin, tmax)
		if toward != 0.0 and randf() < 0.6:
			_look_target = toward * randf_range(0.35, 0.65)
		else:
			_look_target = base + randf_range(-spread, spread)
	return _look_target


## The acting: what the body wants to do in this state, fed through springs.
func _update_pose(delta: float) -> void:
	if _pelvis_dyn == null:
		_init_legs()
	var gp := global_position
	# Teleported (respawn, relocate, a test): start over instead of whipping
	# across the map.
	if absf(gp.x - _prev_x) > 60.0:
		_init_legs()
	var vx := (gp.x - _prev_x) / maxf(delta, 0.0001)
	_prev_x = gp.x
	_vx = lerpf(_vx, vx, clampf(delta * 10.0, 0.0, 1.0))
	var h := _height()
	var to_player := float(dir)
	var p = GameState.player
	if p != null and absf(p.global_position.x - gp.x) > 2.0:
		to_player = signf(p.global_position.x - gp.x)

	var sink := 0.0          # px the body lowers (hunch, coil); < 0 rises
	var lean := 0.0          # px the chest leans (+ = right)
	var raise := 0.0         # 0..1: blades lifted off the floor
	var head := 0.0          # head-stalk angle it wants
	var style := 0           # head: 0 wandering, 1 locked on, 2 sniffing
	var breath_rate := 1.8
	match state:
		State.DORMANT:
			sink = h * 0.07                                   # hunched, asleep
			head = float(dir) * 0.75
			breath_rate = 1.0
		State.PATROL:
			if _moving:
				sink = 2.0
				lean = float(dir) * 2.0
				head = _glance(delta, float(dir) * 0.12, 0.35, 1.6, 4.0)
			else:
				# Stopped: it LISTENS. The head tilts and holds, usually your way.
				sink = 3.5
				head = _glance(delta, 0.0, 0.5, 2.0, 5.0, to_player)
		State.NOTICED:
			style = 1
			head = _head_target_angle()
			breath_rate = 4.0
			if _state_time < 0.14:
				sink = -3.0                                   # a jolt: it straightens
			else:
				sink = 7.0                                    # then it coils, rearing back
				lean = -to_player * 4.0
				raise = 1.0                                   # blades come up off the floor
		State.CHASE:
			style = 1
			head = _head_target_angle()
			sink = 4.0                                        # low, pitched forward
			lean = float(dir) * 5.0
			raise = 0.45
			breath_rate = 4.8
		State.FROZEN:
			style = 1
			head = _head_angle
			breath_rate = 6.5                                 # held: shallow and fast
		State.SEARCH:
			style = 2
			var side := float(dir)
			if absf(_last_known.x - gp.x) > 4.0:
				side = signf(_last_known.x - gp.x)
			head = _glance(delta, side * 0.25, 0.5, 0.35, 0.9)
			sink = 5.0
			lean = float(dir) * 2.0
			raise = 0.15
			breath_rate = 3.2
	# Breathing: irregular, and now and then one too deep (see _breath_amt()).
	_breath_phase += delta * breath_rate * (1.0 + 0.3 * sin(_t * 0.41) + 0.15 * sin(_t * 1.7))

	if state == State.FROZEN:
		# Held in the light: nothing eases. It strains on the spot, on threes.
		_tremble_frame += 1
		if _tremble_frame % 3 == 0:
			_tremble = Vector2(randf_range(-0.9, 0.9), randf_range(-0.6, 0.6))
		return
	_tremble = Vector2.ZERO

	# Legs in the air make it sag; it shifts its weight onto the planted side.
	var lifted := 0
	var shift := 0.0
	for leg in _legs:
		if float(leg.t) < 1.0:
			lifted += 1
			shift -= float(leg.side)
	_sink = _sink_dyn.update(delta, sink + float(lifted) * 0.5)
	_arm_raise = _raise_dyn.update(delta, raise)
	var fwd := _fwd()
	var pelvis_t := gp + Vector2(lean * 0.35 + shift * 0.4, -h * PELVIS + _sink * 0.8)
	_chest_rest = Vector2(lean + (pelvis_t.x - gp.x) * 0.5,
			_shoulder_y(h) + _sink * (0.1 if fwd > 0.5 else 0.4) - _breath_amt() * 0.8)
	_pelvis_dyn.update(delta, pelvis_t)
	_chest_dyn.update(delta, gp + _chest_rest)
	if _kick != 0.0:
		# Out of a freeze: a lurch, all at once.
		_chest_dyn.kick(Vector2(_kick * 22.0, -30.0))
		_pelvis_dyn.kick(Vector2(_kick * 12.0, 0.0))
		_kick = 0.0

	match style:
		1:
			_head_dyn.set_params(6.0, 0.55, 0.0)             # locked on: tight
		2:
			_head_dyn.set_params(5.0, 0.45, 0.0)             # sniffing: quick jerks
		_:
			_head_dyn.set_params(1.5, 0.45, -0.6)            # wandering: anticipation, overshoot
	if _snap_frames > 0:
		# It noticed you: round in two frames, no easing, then a wobble.
		_head_angle = lerpf(_head_angle, _snap_target, 0.5 if _snap_frames == 2 else 1.0)
		_snap_frames -= 1
		_head_dyn.reset(_head_angle)
		if _snap_frames == 0:
			_head_dyn.kick(3.0 if _snap_target >= 0.0 else -3.0)
	else:
		_head_angle = _head_dyn.update(delta, head)
	_update_idle_twitch(delta)

	# Arms: verlet chains pulled towards the pose.
	var b := _body_points()
	for i in _arm_chains.size():
		var ch: VerletChain = _arm_chains[i]
		var pose := _arm_pose(b.arms[i], gp)
		ch.set_lengths_from(pose)
		ch.floor_y = floor_y - 0.5
		match state:
			State.CHASE:
				ch.stiffness = 0.32
			State.NOTICED:
				ch.stiffness = 0.5
			_:
				ch.stiffness = 0.14
		ch.step(delta, pose[0], pose)


## 0..1: slow, irregular, and now and then one breath far too deep.
func _breath_amt() -> float:
	var deep := 1.7 if sin(_t * 0.13 + 2.0) > 0.93 else 1.0
	return (sin(_breath_phase) * 0.5 + 0.5) * deep


## Key body points in local space, shared by drawing, light probes and senses.
func _body_points() -> Dictionary:
	var h := _height()
	var c := 1.0 - h / NATURAL_H                          # 0 = free, ~0.6 = crammed
	var w := _wscale()
	var fwd := _fwd()
	var gp := global_position
	var pelvis := Vector2(0, -h * PELVIS)
	var shoulders := Vector2(0, _shoulder_y(h))
	if _pelvis_dyn != null:
		pelvis = (_pelvis_dyn.y as Vector2) - gp + _tremble
		shoulders = (_chest_dyn.y as Vector2) - gp + _tremble * 1.6
	shoulders.y = maxf(shoulders.y, -gap + 4.0)           # never through the ceiling
	pelvis.y = maxf(pelvis.y, shoulders.y + 8.0)
	var sw := 16.0 * w                                     # shoulder half-width
	# Head-stalk. While it hunts, the head hangs dead still in the air, locked
	# on you, while the body bobs and lurches underneath it.
	var head_base := shoulders + Vector2(0, -2)
	if state == State.CHASE or state == State.NOTICED:
		head_base = Vector2(_chest_rest.x, maxf(_chest_rest.y, -gap + 4.0) - 2.0) + _tremble
	var head_len := h * 0.21 + fwd * 6.0
	var tilt := _head_angle + _twitch
	var room := maxf(4.0, gap - 3.0 + head_base.y)        # px from the head base to the ceiling
	if fwd < 0.5 and cos(tilt) * head_len > room:
		var bend := acos(clampf(room / head_len, 0.0, 1.0))
		var s := signf(tilt) if absf(tilt) > 0.05 else float(dir)
		tilt = s * maxf(absf(tilt), bend)
	if fwd > 0.0:
		# Crammed: the head hangs down in front of its chest, towards you.
		var hang_side := signf(tilt) if absf(tilt) > 0.05 else float(dir)
		tilt = lerpf(tilt, hang_side * (PI - 0.35) + _head_angle * 0.3, fwd)
	var axis := Vector2(sin(tilt), -cos(tilt))
	var head_top := head_base + axis * head_len
	var eye := head_base + axis * (head_len * 0.82)
	# Arms: hanging from the shoulders, blades down to the floor (dragging while
	# it wanders), lifted and spread in the wind-up, reaching forward when it hunts.
	var arms := []
	for side: float in [-1.0, 1.0]:
		var sh := shoulders + Vector2(side * sw, 2.0)
		var r := _arm_raise
		var elbow := sh + Vector2(side * (11.0 * w + 4.0 * c + 6.0 * r), h * 0.30 - h * 0.10 * r)
		var tip := Vector2(sh.x + side * (15.0 * w + 9.0 * r), -2.0 - h * 0.24 * r)
		if state == State.CHASE:
			tip.x += float(dir) * 6.0
		arms.append({"side": side, "shoulder": sh, "elbow": elbow, "tip": tip})
	return {"h": h, "c": c, "w": w, "fwd": fwd, "pelvis": pelvis, "shoulders": shoulders, "sw": sw,
			"head_base": head_base, "head_top": head_top, "axis": axis, "head_len": head_len,
			"eye": eye, "arms": arms, "breath": _breath_amt()}


## The posed arm in world space, six points: shoulder, upper arm, elbow, then
## the blade sweeping out and back in to its tip.
func _arm_pose(arm: Dictionary, gp: Vector2) -> PackedVector2Array:
	var side: float = arm.side
	var sh: Vector2 = arm.shoulder
	var el: Vector2 = arm.elbow
	var tip: Vector2 = arm.tip
	var h := _height()
	var c := 1.0 - h / NATURAL_H
	var w := _wscale()
	var upper := sh.lerp(el, 0.5) + Vector2(side * 2.0, 0)
	var ctrl := el.lerp(tip, 0.45) + Vector2(side * (6.0 * w + 3.0 * c), 0)
	var blade := _bez(el, ctrl, tip + Vector2(side * 2.0 * w, -h * 0.12), tip, 3)
	return PackedVector2Array([sh + gp, upper + gp, el + gp, blade[1] + gp, blade[2] + gp, tip + gp])


# ------------------------------------------------------------------------ drawing
# Drawn twice (CreatureDraw.add_night_pass):
#  - NIGHT (always visible): a charcoal-black silhouette, darker than the walls,
#    with a cold edge where faint light from above catches it (head, shoulders,
#    knees, blade edges) and a pale eye. You always know it's there.
#  - TORCH (Light Only, on top): the real thing fades in wherever your beam
#    falls: charcoal skin, pale bone, ribs, the gut, the seam of a mouth.
# Every limb is a strip of quads with a 1 px rim on the lit edge and a dark edge
# on the other, so it reads as solid volume.

const DARK := Color(0.05, 0.05, 0.06)
const SKIN := Color(0.30, 0.29, 0.29)
const SKIN_BACK := Color(0.17, 0.17, 0.18)
const SKIN_LIT := Color(0.42, 0.40, 0.39)
const RIM := Color(0.58, 0.55, 0.51)
const BONE := Color(0.74, 0.70, 0.63)
const GUT := Color(0.42, 0.24, 0.23)
const EYE_WHITE := Color(0.93, 0.87, 0.70)   # warm, torch-like: seed for the ending
const PUPIL := Color(0.02, 0.02, 0.02)
const SIL := Color(0.012, 0.012, 0.015)
# Night colours.
const N_FILL := Color(0.030, 0.030, 0.040)
const N_BACK := Color(0.020, 0.020, 0.027)
const N_RIM := Color(0.36, 0.38, 0.43)
const N_EDGE := Color(0.12, 0.125, 0.145)
const N_EYE := Color(0.66, 0.62, 0.53)


func _draw() -> void:
	_paint(self, false)


## Queue both passes (the night one is a child canvas item).
func _redraw() -> void:
	queue_redraw()
	if _night_node != null:
		_night_node.queue_redraw()


func _c(lit: Color, night_col: Color) -> Color:
	if silhouette:
		return SIL
	return night_col if _night else lit


## Cubic bezier sampled into n+1 points.
func _bez(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, n: int) -> PackedVector2Array:
	return CreatureDraw.bez(p0, p1, p2, p3, n)


## A point part-way from a to b, pushed sideways: the extra, wrong joints.
func _kink(a: Vector2, b: Vector2, t: float, amount: float) -> Vector2:
	var d := b - a
	if d.length_squared() < 0.0001:
		return a
	return a.lerp(b, t) + d.orthogonal().normalized() * amount


## A smooth curve through chain points (Catmull-Rom), `sub` samples per span.
func _smooth(pts: PackedVector2Array, sub: int) -> PackedVector2Array:
	var out := PackedVector2Array()
	var n := pts.size()
	for i in n - 1:
		var p0 := pts[maxi(i - 1, 0)]
		var p1 := pts[i]
		var p2 := pts[i + 1]
		var p3 := pts[mini(i + 2, n - 1)]
		for s in sub:
			var t := float(s) / float(sub)
			var t2 := t * t
			var t3 := t2 * t
			out.append(0.5 * ((2.0 * p1) + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
					+ (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3))
	out.append(pts[n - 1])
	return out


func _limb(ci: CanvasItem, pts: PackedVector2Array, w0: float, w1: float, base: Color, rim: Color,
		night_base: Color, night_rim: Color, ldir: Vector2) -> void:
	if silhouette:
		CreatureDraw.limb(ci, pts, w0, w1, SIL, SIL, SIL, ldir)
	elif _night:
		CreatureDraw.limb(ci, pts, w0, w1, night_base, night_rim, night_base, ldir)
	else:
		CreatureDraw.limb(ci, pts, w0, w1, base, rim, DARK, ldir)


## Draw the whole creature on `ci`: the night pass or the torch pass.
func _paint(ci: CanvasItem, night: bool) -> void:
	_night = night
	var b := _body_points()
	var h: float = b.h
	var c: float = b.c
	var w: float = b.w
	var lw := maxf(w, 0.7)                                # limb thickness scale
	var pelvis: Vector2 = b.pelvis
	var shoulders: Vector2 = b.shoulders
	var sw: float = b.sw
	var breath: float = b.breath
	var frozen := state == State.FROZEN
	var hunting := state == State.CHASE or state == State.NOTICED
	var gp := global_position
	var ldir := Vector2(0.0, -1.0)
	if night:
		# Faint light from above, a little from your side.
		var p = GameState.player
		var sx := 0.0
		if p != null:
			sx = clampf((p.global_position.x - gp.x) / 200.0, -1.0, 1.0) * 0.4
		ldir = Vector2(sx, -1.0).normalized()
	elif GameState.torch != null:
		ldir = (GameState.torch.global_position - gp - Vector2(0, -h * 0.6)).normalized()
	var detail := not night and not silhouette

	# 1) Legs: the four behind the body first (darker, thinner), then the six in
	#    front. Hip -> knee by IK, each bone kinked into extra joints, down to a
	#    needle point that hooks inward.
	var ls := _leg_scale()
	var ceil_local := -gap + 3.0
	for pass_back: bool in [true, false]:
		for i in _legs.size():
			var leg: Dictionary = _legs[i]
			if bool(leg.back) != pass_back:
				continue
			var side: float = leg.side
			var root := pelvis + Vector2(side * clampf(absf(float(leg.rest)) * 0.22, 3.0, 12.0) * w, 2.0)
			var foot: Vector2 = (leg.foot as Vector2) - gp
			var twitching := float(leg.twitch_left) > 0.0
			if twitching:
				foot.y -= 5.0                                 # a sudden twitch: up, and back down
			if frozen:
				foot += Vector2(_tremble.x * (1.0 if i % 2 == 0 else -1.0), -absf(_tremble.y)).round()
			var knee := IK.two_bone(root, foot, float(leg.a) * ls, float(leg.b) * ls, -side)
			knee.y = maxf(knee.y, ceil_local)                 # pressed up against the ceiling
			var kk: Array = leg.kinks
			var amp := 2.5 if twitching else 1.0
			var pts := PackedVector2Array([root, _kink(root, knee, 0.5, float(kk[0]) * amp), knee,
					_kink(knee, foot, 0.36, float(kk[1]) * amp), _kink(knee, foot, 0.7, float(kk[2]) * amp), foot])
			if pass_back:
				_limb(ci, pts, 3.6 * lw, 1.0, SKIN_BACK, SKIN, N_BACK, N_EDGE, ldir)
			else:
				_limb(ci, pts, 5.6 * lw, 1.0, SKIN, RIM, N_FILL, N_RIM, ldir)
				if detail:
					for j in range(1, pts.size() - 1):          # a knuckle at every joint
						var kn := pts[j].round()
						ci.draw_rect(Rect2(kn - Vector2(1, 1), Vector2(2, 2)), SKIN_LIT)
						ci.draw_rect(Rect2(kn - Vector2(1, 1), Vector2(1, 1)), BONE)
				elif night and not silhouette:
					ci.draw_rect(Rect2(knee.round() + Vector2(-1, -2), Vector2(3, 1)), N_RIM)   # the knee catches the light
			var lifted := float(leg.t) < 1.0
			var hook := Vector2(-side * 1.0, 2.0) if lifted else Vector2(-side * 2.0, -2.0)
			ci.draw_line(foot, foot + hook, _c(BONE, N_RIM), 1.0)

	# 2) Torso, top to bottom, one pixel row at a time: traps, a broad ribcage,
	#    a waist pinched far too thin, a hollow gut, then the hip ring.
	var top := shoulders.y + 1.0
	var bot := pelvis.y + 1.0
	var span := maxf(bot - top, 1.0)
	var lit_right := ldir.x > 0.0
	var y := top
	while y <= bot:
		var t := (y - top) / span
		var hw := _torso_half(t) * w
		if t < 0.5:
			hw += breath * (1.0 - t * 2.0) * 1.2
		var cx := lerpf(shoulders.x, pelvis.x, t)
		ci.draw_rect(Rect2(cx - hw, y, hw * 2.0, 1), _c(SKIN, N_FILL))
		var lit_x := cx + hw - 2.0 if lit_right else cx - hw
		var dark_x := cx - hw if lit_right else cx + hw - 1.0
		if detail:
			ci.draw_rect(Rect2(lit_x, y, 2, 1), SKIN_LIT)
			ci.draw_rect(Rect2(dark_x, y, 1, 1), DARK)
			# Ribs: ridges arcing down and out from the sternum, every 3 px,
			# catching the light on one side only.
			if t > 0.08 and t < 0.4 and int(y - top) % 3 == 0:
				var rib := hw - 2.5
				var near := 1.0 if lit_right else -1.0
				ci.draw_line(Vector2(cx + near, y), Vector2(cx + near * rib, y + 2), RIM.darkened(0.15 + t), 1.0)
				ci.draw_line(Vector2(cx - near, y), Vector2(cx - near * rib, y + 2), SKIN_LIT, 1.0)
				ci.draw_line(Vector2(cx - near, y + 1), Vector2(cx - near * rib, y + 3), DARK, 1.0)
			# The gut: a dark cavity with something coiled in it.
			if t > 0.44 and t < 0.88:
				var cav := maxf(hw * 0.55, 1.5)
				ci.draw_rect(Rect2(cx - cav, y, cav * 2.0, 1), DARK)
		elif night and not silhouette:
			# The outline: a cold edge on the side towards the light, a fainter one opposite.
			ci.draw_rect(Rect2(cx + hw - 1.0 if lit_right else cx - hw, y, 1, 1), N_RIM if t < 0.45 else N_EDGE)
			ci.draw_rect(Rect2(cx - hw if lit_right else cx + hw - 1.0, y, 1, 1), N_EDGE)
		y += 1.0
	if detail:
		var mid := lerpf(top, bot, 0.66)
		var cxm := lerpf(shoulders.x, pelvis.x, 0.66)
		for i in 4:
			var gpt := Vector2(cxm + (i % 2) * 3.0 - 1.5 + sin(_t * 0.9 + i) * 0.6, mid - 4.0 + i * 3.0)
			ci.draw_arc(gpt, 1.8 + (i % 2) * 0.6, 0.0, TAU * 0.8, 6, GUT, 1.0)
		ci.draw_line(Vector2(shoulders.x, top + 1), Vector2(lerpf(shoulders.x, pelvis.x, 0.4), lerpf(top, bot, 0.4)), DARK, 1.0)   # sternum
		for side: float in [-1.0, 1.0]:                        # collar bones
			ci.draw_line(shoulders + Vector2(side * 2.0, 2.0), shoulders + Vector2(side * (sw - 3.0), 1.0), BONE.darkened(0.2), 1.0)
	# Hip ring: a lumpy mass the legs grow out of.
	for i in 7:
		var hx := pelvis.x + (float(i) - 3.0) * 3.6 * w
		ci.draw_circle(Vector2(hx, pelvis.y + 2.0 + absf(float(i) - 3.0) * 0.6), 2.8 * lw,
				_c(SKIN if i % 2 else SKIN_LIT, N_FILL))
	if detail:
		ci.draw_line(pelvis + Vector2(-11.0 * w, 4.0), pelvis + Vector2(11.0 * w, 4.0), DARK, 1.0)

	# 3) Shoulders: bony knobs with spikes curling up and out (they scrape the
	#    ceiling in low tunnels).
	for side: float in [-1.0, 1.0]:
		var knob := shoulders + Vector2(side * sw, 1.0)
		ci.draw_circle(knob, 4.0 * lw, _c(SKIN, N_FILL))
		if detail:
			ci.draw_circle(knob + Vector2(-side * 0.5, -1.0), 1.4, SKIN_LIT)
		elif night and not silhouette:
			ci.draw_rect(Rect2((knob + Vector2(-1.5, -4.0 * lw)).round(), Vector2(3, 1)), N_RIM)
		for s in 2:
			var root := knob + Vector2(side * (1.0 - s * 3.0), -2.0)
			var tip := root + Vector2(side * (5.0 - s * 2.0), -10.0 + s * 3.0)
			tip.y = maxf(tip.y, -gap + 2.0)
			_limb(ci, _bez(root, root + Vector2(0, -3), tip + Vector2(-side * 2.0, 2.0), tip, 4),
					3.0, 1.0, SKIN, RIM, N_FILL, N_RIM, ldir)
			if not silhouette:
				ci.draw_rect(Rect2(tip.round(), Vector2(1, 1)), _c(BONE, N_RIM))

	# 4) Arms: the verlet chains. A long upper arm, then a scythe of a blade
	#    curling inward at the floor.
	for i in _arm_chains.size():
		var ch: VerletChain = _arm_chains[i]
		if ch.p.size() < 6:
			continue
		var side: float = b.arms[i].side
		var q := PackedVector2Array()
		for pt in ch.p:
			q.append(pt - gp + (_tremble if frozen else Vector2.ZERO))
		var upper := _smooth(PackedVector2Array([q[0], q[1], q[2]]), 3)
		_limb(ci, upper, 5.5 * lw, 4.0 * lw, SKIN, RIM, N_FILL, N_RIM, ldir)
		var blade := _smooth(PackedVector2Array([q[2], q[3], q[4], q[5]]), 4)
		_limb(ci, blade, 4.0 * lw, 1.0, SKIN, BONE, N_FILL, N_RIM, ldir)
		var tip := q[5]
		var el := q[2]
		ci.draw_line(tip, tip + Vector2(-side * 3.0, -2.0), _c(BONE, N_RIM), 1.0)            # the hook
		ci.draw_line(el, el + Vector2(side * 4.0, -5.0), _c(SKIN_LIT, N_FILL), 2.0)          # elbow spur
		if not silhouette:
			ci.draw_rect(Rect2((el + Vector2(side * 4.0, -5.0)).round(), Vector2(1, 1)), _c(BONE, N_RIM))

	# 5) The head: one tall stalk, rounded at the top, a seam of a mouth running
	#    down the front (it splits open, teeth showing, when it hunts) and ONE
	#    eye near the top.
	var hb: Vector2 = b.head_base
	var ht: Vector2 = b.head_top
	var axis: Vector2 = b.axis
	var hl: float = b.head_len
	_limb(ci, PackedVector2Array([hb, hb.lerp(ht, 0.5), ht]), 9.0 * lw, 6.0 * lw, SKIN, RIM, N_FILL, N_RIM, ldir)
	ci.draw_circle(ht, 3.2 * lw, _c(SKIN, N_FILL))
	if night and not silhouette:
		ci.draw_rect(Rect2((ht + Vector2(-1.0, -3.2 * lw)).round(), Vector2(2, 1)), N_RIM)
	if detail:
		var perp := axis.orthogonal()
		var seam := 1.0 + (1.0 if hunting else 0.0)
		for s: float in [-1.0, 1.0]:
			ci.draw_line(hb + axis * (hl * 0.12) + perp * s * seam, hb + axis * (hl * 0.70) + perp * s * seam, DARK, 1.0)
		if hunting:
			for i in 5:
				ci.draw_rect(Rect2((hb + axis * (hl * (0.18 + i * 0.1)) + perp * (1.0 if i % 2 else -1.0)).round(), Vector2(1, 1)), BONE)
	if not silhouette:
		# The eye: pale, with a pupil that follows you. In the dark it's dimmer,
		# but it's still the one thing on it that catches the light.
		var e: Vector2 = (b.eye as Vector2).round()
		ci.draw_rect(Rect2(e - Vector2(2, 2), Vector2(5, 5)), _c(DARK, N_FILL))
		ci.draw_rect(Rect2(e - Vector2(1, 1), Vector2(3, 3)), _c(EYE_WHITE, N_EYE))
		var look := Vector2.ZERO
		if GameState.player != null:
			look = (GameState.player.global_position + Vector2(0, -30) - gp - e).normalized()
		ci.draw_rect(Rect2((e + look).round(), Vector2(1, 1)), PUPIL)


## Torso half-width (px) down the body, t = 0 at the shoulders, 1 at the pelvis.
func _torso_half(t: float) -> float:
	if t < 0.1:
		return lerpf(5.0, 13.0, smoothstep(0.0, 1.0, t / 0.1))   # traps up into the head-stalk
	if t < 0.64:
		# A rounded V: broad ribcage tapering to a waist far too thin.
		var k := (t - 0.1) / 0.54
		return 4.0 + 9.0 * pow(cos(k * PI) * 0.5 + 0.5, 0.75)
	return lerpf(4.0, 8.0, smoothstep(0.0, 1.0, (t - 0.64) / 0.36))   # hips
