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
## VISIBILITY: the root has a Light Only material on the creature light mask, so
## all of this exists only inside the torch beam. Out of the beam: sound only.
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
var _arm_phase := 0.0
var _bob_phase := 0.0
var _lean := 0.0              # body lean towards its target: turns slower than the head
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
	queue_redraw()


func _enter(new_state: State) -> void:
	state = new_state
	_state_time = 0.0


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
	_dust.position = Vector2(_lean, -_height() + 3.0)
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


# --------------------------------------------------------------------------- legs
# Ten legs, each its own timing: it waits a beat before a step when it's
# unaware, steps fast and messy when it's hunting. Feet are planted in world
# space, so the body slides over them and they catch up.

func _init_legs() -> void:
	_legs.clear()
	var spread := _spread()
	for l: Array in LEG_LAYOUT:
		var rest: float = l[0]
		var foot := Vector2(global_position.x + rest * spread, floor_y)
		_legs.append({"rest": rest, "back": l[1], "k": l[2], "foot": foot, "from": foot,
				"to": foot, "t": 1.0, "dur": 0.2, "lift": 6.0, "wait": -1.0, "taps": 0, "twitch_left": 0.0})


## Width scale: squashed into a low tunnel it gets a little narrower too (so it
## stays the same creature, crammed in, not a squat crab).
func _wscale() -> float:
	return lerpf(_height() / NATURAL_H, 1.0, 0.4)


## Legs splay wider the more it's squashed.
func _spread() -> float:
	return _wscale() * (1.0 + 0.35 * (1.0 - _height() / NATURAL_H))


func _update_legs(delta: float) -> void:
	_update_pose(delta)
	var chase := state == State.CHASE
	var max_stepping := 3 if chase else 2
	if _lurch_left > 0.0:
		max_stepping = 6                                  # out of a freeze: a scramble
	var spread := _spread()
	var stepping := 0
	for leg in _legs:
		if float(leg.t) < 1.0:
			stepping += 1
	var still := state == State.FROZEN or state == State.NOTICED or state == State.DORMANT
	for leg in _legs:
		var desired := Vector2(global_position.x + float(leg.rest) * spread, floor_y)
		if float(leg.t) < 1.0:
			var k := minf(1.0, float(leg.t) + delta / float(leg.dur))
			leg.t = k
			var from: Vector2 = leg.from
			var p := from.lerp(leg.to, smoothstep(0.0, 1.0, k))
			p.y -= sin(k * PI) * float(leg.lift)
			leg.foot = p
			if k >= 1.0:
				leg.foot = leg.to
				if not bool(leg.back):
					AudioDirector.play_at("tap", leg.foot, -15.0, 0.2, 380.0)
				# Testing the floor: tap... tap... then it commits.
				if int(leg.taps) > 0:
					leg.taps = int(leg.taps) - 1
					leg.from = leg.to
					leg.dur = 0.13
					leg.lift = randf_range(2.5, 4.0)
					leg.t = 0.0
			continue
		var foot: Vector2 = leg.foot
		foot.y = floor_y
		if float(leg.twitch_left) > 0.0:
			leg.twitch_left = float(leg.twitch_left) - delta
			foot.y -= 5.0                                 # a sudden twitch: up, and back down
			if float(leg.twitch_left) <= 0.0 and not bool(leg.back):
				AudioDirector.play_at("tap", leg.foot, -18.0, 0.2, 300.0)
		leg.foot = foot
		if still:
			continue
		var too_far := absf(foot.x - desired.x) > STEP_DISTANCE * (1.4 if chase else 1.0)
		if not too_far or stepping >= max_stepping:
			leg.wait = -1.0
			continue
		if float(leg.wait) < 0.0:
			leg.wait = randf_range(0.0, 0.05) if chase else randf_range(0.0, 0.35)   # a beat of hesitation
		leg.wait = float(leg.wait) - delta
		if float(leg.wait) > 0.0:
			continue
		var ahead := signf(desired.x - foot.x)
		leg.from = foot
		leg.to = Vector2(desired.x + ahead * (STEP_DISTANCE * 0.5 + randf_range(0.0, 4.0)), floor_y)
		if chase:
			var slam: Vector2 = leg.to
			slam.x += randf_range(-5.0, 5.0)              # messy: it doesn't place them, it slams them
			leg.to = slam
		leg.dur = (0.11 if chase else 0.24) * randf_range(0.75, 1.3)
		leg.lift = randf_range(5.0, 9.0) * (randf_range(1.2, 2.2) if chase else 1.0)
		leg.taps = randi_range(1, 2) if not chase and randf() < 0.35 else 0
		leg.t = 0.0
		leg.wait = -1.0
		stepping += 1


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


## Head, arms and body motion. The head eases slowly while it wanders, snaps
## when it notices, stays locked on you while it hunts.
func _update_pose(delta: float) -> void:
	var target := 0.0
	var rate := 0.6
	match state:
		State.PATROL, State.DORMANT:
			target = sin(_t * 0.35 + 1.7) * 0.3
			rate = 0.25
		State.NOTICED, State.CHASE:
			target = _head_target_angle()
			rate = 14.0
		State.FROZEN:
			target = _head_angle
			rate = 0.0        # everything stops: only the tips tremble
		State.SEARCH:
			target = sin(_t * 2.3) * 0.5
			rate = 2.0
	if _snap_frames > 0:
		_head_angle = lerpf(_head_angle, _snap_target, 0.5 if _snap_frames == 2 else 1.0)
		_snap_frames -= 1
	else:
		_head_angle = move_toward(_head_angle, target, rate * delta)
	# The body follows the head round, slower.
	var lean_target := float(dir) * 3.0 if state == State.CHASE else 0.0
	if state != State.FROZEN:
		_lean = move_toward(_lean, lean_target, 5.0 * delta)
	_update_idle_twitch(delta)
	if state != State.FROZEN and state != State.NOTICED:
		var moving_rate := 6.0 if state == State.CHASE else (1.4 if _moving else 0.4)
		_arm_phase += delta * moving_rate
		if _moving:
			_bob_phase += delta * (9.0 if state == State.CHASE else 3.0)


## Key body points in local space, shared by drawing, light probes and senses.
func _body_points() -> Dictionary:
	var h := _height()
	var c := 1.0 - h / NATURAL_H                          # 0 = free, ~0.6 = crammed
	var w := _wscale()
	var frozen := state == State.FROZEN or state == State.NOTICED
	var chase := state == State.CHASE
	# Still means STILL: no idle sway, only breathing. It sways only on the move.
	var sway := sin(_t * 1.1) * 1.2 if (_moving or state == State.SEARCH) and not frozen else 0.0
	var bob := absf(sin(_bob_phase)) * (2.0 if chase else 0.6) if _moving else 0.0
	var lean := _lean + _kick
	var breath := sin(_t * (4.0 if chase else 1.8)) * 0.5 + 0.5
	# Crammed into a low tunnel, it bends forward: shoulders pressed up into the
	# ceiling, the head hanging down in front of its chest.
	var fwd := smoothstep(0.15, 0.5, c)
	var pelvis := Vector2(sway * 0.5 + lean * 0.4, -h * PELVIS + bob * 0.5)
	var shoulder_y := lerpf(-h * SHOULDER, -(h - 5.0), fwd)
	var shoulders := Vector2(sway + lean, shoulder_y + bob)
	var sw := 16.0 * w                                     # shoulder half-width
	# Head-stalk. While it hunts, the head stays dead still and locked on you
	# while the body bobs and lurches underneath it.
	var head_base := shoulders + Vector2(0, -2)
	if chase:
		head_base = Vector2(0, shoulder_y - 2.0)
	var head_len := h * 0.21 + fwd * 6.0
	var tilt := _head_angle + _twitch
	var room := maxf(4.0, gap - 3.0 + head_base.y)        # px from the head base to the ceiling
	if fwd < 0.5 and cos(tilt) * head_len > room:
		var bend := acos(clampf(room / head_len, 0.0, 1.0))
		var s := signf(tilt) if absf(tilt) > 0.05 else float(dir)
		tilt = s * maxf(absf(tilt), bend)
	if fwd > 0.0:
		var hang_side := signf(tilt) if absf(tilt) > 0.05 else float(dir)
		tilt = lerpf(tilt, hang_side * (PI - 0.35) + _head_angle * 0.3, fwd)
	var axis := Vector2(sin(tilt), -cos(tilt))
	var head_top := head_base + axis * head_len
	var eye := head_base + axis * (head_len * 0.82)
	# Arms: hanging from the shoulders, blades reaching down to the floor.
	var arms := []
	for side: float in [-1.0, 1.0]:
		var sh := shoulders + Vector2(side * sw, 2.0)
		var swing := 0.0 if frozen else sin(_arm_phase + (0.0 if side < 0.0 else PI)) * (5.0 if chase else 1.5)
		# Splayed out from the body like the concept's A-shape.
		var elbow := sh + Vector2(side * (11.0 * w + 4.0 * c) + swing * 0.4, h * 0.30)
		var tip := Vector2(sh.x + side * (15.0 * w) + swing, -h * 0.10 - 1.0)
		if chase:
			tip.x += float(dir) * 6.0     # blades reach forward while it hunts
		arms.append({"side": side, "shoulder": sh, "elbow": elbow, "tip": tip})
	return {"h": h, "c": c, "w": w, "fwd": fwd, "pelvis": pelvis, "shoulders": shoulders, "sw": sw,
			"head_base": head_base, "head_top": head_top, "axis": axis, "head_len": head_len,
			"eye": eye, "arms": arms, "breath": breath}


# ------------------------------------------------------------------------ drawing
# Charcoal skin with pale bone where the light catches it. Shading is cheap:
# every limb is a strip of quads with a 1 px rim on the edge that faces the
# torch and a dark edge on the side away from it, so it reads as solid volume
# in the beam. Drawn under the Light Only material.

# Tuned for the torch beam, which falls off to nothing at 120 px: brighter
# than "charcoal" on paper so it still reads at the edge of the beam.
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

var _light_dir := Vector2(-0.5, -0.8)


func _col(c: Color) -> Color:
	return SIL if silhouette else c


## Cubic bezier sampled into n+1 points.
func _bez(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, n: int) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in n + 1:
		var t := float(i) / float(n)
		var u := 1.0 - t
		pts.append(p0 * (u * u * u) + p1 * (3.0 * u * u * t) + p2 * (3.0 * u * t * t) + p3 * (t * t * t))
	return pts


## A tapering limb along `pts`, width w0 -> w1, rim-lit on the torch side.
func _limb(pts: PackedVector2Array, w0: float, w1: float, base: Color, rim := RIM) -> void:
	var n := pts.size()
	if n < 2:
		return
	var col := _col(base)
	var cols := PackedColorArray([col, col, col, col])
	var none := PackedVector2Array()
	for i in n - 1:
		var a := pts[i]
		var b := pts[i + 1]
		var d := b - a
		if d.length_squared() < 0.0001:
			continue
		var nrm := d.orthogonal().normalized()
		var wa := lerpf(w0, w1, float(i) / float(n - 1)) * 0.5
		var wb := lerpf(w0, w1, float(i + 1) / float(n - 1)) * 0.5
		draw_primitive(PackedVector2Array([a + nrm * wa, b + nrm * wb, b - nrm * wb, a - nrm * wa]), cols, none)
		if silhouette or wa < 0.9:
			continue
		var lit_side := 1.0 if nrm.dot(_light_dir) > 0.0 else -1.0
		if absf(nrm.dot(_light_dir)) > 0.2:
			draw_line(a + nrm * wa * lit_side, b + nrm * wb * lit_side, rim, 1.0)
		draw_line(a - nrm * wa * lit_side, b - nrm * wb * lit_side, DARK, 1.0)


func _draw() -> void:
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
	if GameState.torch != null:
		_light_dir = (GameState.torch.global_position - global_position - Vector2(0, -h * 0.6)).normalized()

	# 1) Legs: the four behind the body first (darker, thinner), then the six in
	#    front. Each one arcs out from the pelvis, up a little, then down almost
	#    straight to a needle point that hooks inward.
	for pass_back: bool in [true, false]:
		for leg in _legs:
			if bool(leg.back) != pass_back:
				continue
			var foot: Vector2 = leg.foot - global_position
			if frozen:
				foot += Vector2(randf_range(-1, 1), randf_range(-1, 0)).round()   # tips tremble
			var side := signf(float(leg.rest))
			var k: float = leg.k
			var root := pelvis + Vector2(side * clampf(absf(float(leg.rest)) * 0.22, 3.0, 12.0) * w, 2.0)
			var reach := foot.x - root.x
			# Crammed, the knees push up harder towards the ceiling.
			var arch := h * (0.07 + 0.05 * k) + c * 12.0
			var p1 := root + Vector2(reach * 0.55, -arch)
			var p2 := Vector2(foot.x + side * 3.0 * w, lerpf(root.y, foot.y, 0.35) - arch * 0.2)
			var curve := _bez(root, p1, p2, foot, 12)
			# Too many joints: five bones, each kinked the other way.
			var pts := PackedVector2Array([root])
			for j: int in [2, 4, 7, 9]:
				var q := curve[j]
				var nrm := (curve[j + 1] - curve[j - 1]).orthogonal().normalized()
				var kink := (1.6 + k) * (1.0 if j % 4 == 0 else -1.0)
				if float(leg.twitch_left) > 0.0:
					kink *= 2.5                                  # a sudden jerk
				pts.append(q + nrm * kink)
			pts.append(foot)
			if pass_back:
				_limb(pts, 3.6 * lw, 1.0, SKIN_BACK, SKIN)
			else:
				_limb(pts, 5.6 * lw, 1.0, SKIN)
				if not silhouette:
					for j in range(1, pts.size() - 1):          # a knuckle at every joint
						var kn := pts[j].round()
						draw_rect(Rect2(kn - Vector2(1, 1), Vector2(2, 2)), SKIN_LIT)
						draw_rect(Rect2(kn - Vector2(1, 1), Vector2(1, 1)), BONE)
			draw_line(foot, foot + Vector2(-side * 2.0, -2.0), _col(BONE), 1.0)   # hooked tip

	# 2) Torso, top to bottom, one pixel row at a time: traps, a broad ribcage,
	#    a waist pinched far too thin, a hollow gut, then the hip ring.
	var top := shoulders.y + 1.0
	var bot := pelvis.y + 1.0
	var span := maxf(bot - top, 1.0)
	var lit_right := _light_dir.x > 0.0
	var y := top
	while y <= bot:
		var t := (y - top) / span
		var hw := _torso_half(t) * w
		if t < 0.5:
			hw += breath * (1.0 - t * 2.0) * 1.2
		var cx := lerpf(shoulders.x, pelvis.x, t)
		draw_rect(Rect2(cx - hw, y, hw * 2.0, 1), _col(SKIN))
		if not silhouette:
			var lit_x := cx + hw - 2.0 if lit_right else cx - hw
			var dark_x := cx - hw if lit_right else cx + hw - 1.0
			draw_rect(Rect2(lit_x, y, 2, 1), SKIN_LIT)
			draw_rect(Rect2(dark_x, y, 1, 1), DARK)
			# Ribs: ridges arcing down and out from the sternum, every 3 px,
			# catching the light on one side only.
			if t > 0.08 and t < 0.4 and int(y - top) % 3 == 0:
				var rib := hw - 2.5
				var near := 1.0 if lit_right else -1.0
				draw_line(Vector2(cx + near, y), Vector2(cx + near * rib, y + 2), RIM.darkened(0.15 + t), 1.0)
				draw_line(Vector2(cx - near, y), Vector2(cx - near * rib, y + 2), SKIN_LIT, 1.0)
				draw_line(Vector2(cx - near, y + 1), Vector2(cx - near * rib, y + 3), DARK, 1.0)
			# The gut: a dark cavity with something coiled in it.
			if t > 0.44 and t < 0.88:
				var cav := maxf(hw * 0.55, 1.5)
				draw_rect(Rect2(cx - cav, y, cav * 2.0, 1), DARK)
		y += 1.0
	if not silhouette:
		var mid := lerpf(top, bot, 0.66)
		var cxm := lerpf(shoulders.x, pelvis.x, 0.66)
		for i in 4:
			var gp := Vector2(cxm + (i % 2) * 3.0 - 1.5 + sin(_t * 0.9 + i) * 0.6, mid - 4.0 + i * 3.0)
			draw_arc(gp, 1.8 + (i % 2) * 0.6, 0.0, TAU * 0.8, 6, GUT, 1.0)
		draw_line(Vector2(shoulders.x, top + 1), Vector2(lerpf(shoulders.x, pelvis.x, 0.4), lerpf(top, bot, 0.4)), DARK, 1.0)   # sternum
		for side: float in [-1.0, 1.0]:                        # collar bones
			draw_line(shoulders + Vector2(side * 2.0, 2.0), shoulders + Vector2(side * (sw - 3.0), 1.0), BONE.darkened(0.2), 1.0)
		# Hip ring: a lumpy mass the legs grow out of.
		for i in 7:
			var hx := pelvis.x + (float(i) - 3.0) * 3.6 * w
			draw_circle(Vector2(hx, pelvis.y + 2.0 + absf(float(i) - 3.0) * 0.6), 2.8 * lw, SKIN if i % 2 else SKIN_LIT)
		draw_line(pelvis + Vector2(-11.0 * w, 4.0), pelvis + Vector2(11.0 * w, 4.0), DARK, 1.0)

	# 3) Shoulders: bony knobs with spikes curling up and out (they scrape the
	#    ceiling in low tunnels).
	for side: float in [-1.0, 1.0]:
		var knob := shoulders + Vector2(side * sw, 1.0)
		draw_circle(knob, 4.0 * lw, _col(SKIN))
		if not silhouette:
			draw_circle(knob + Vector2(-side * 0.5, -1.0), 1.4, SKIN_LIT)
		for s in 2:
			var root := knob + Vector2(side * (1.0 - s * 3.0), -2.0)
			var tip := root + Vector2(side * (5.0 - s * 2.0), -10.0 + s * 3.0)
			tip.y = maxf(tip.y, -gap + 2.0)
			_limb(_bez(root, root + Vector2(0, -3), tip + Vector2(-side * 2.0, 2.0), tip, 4), 3.0, 1.0, SKIN)
			if not silhouette:
				draw_rect(Rect2(tip.round(), Vector2(1, 1)), BONE)

	# 4) Arms: long, hanging, ending in blades that curl inward at the floor.
	for arm in b.arms:
		var side: float = arm.side
		var sh: Vector2 = arm.shoulder
		var elbow: Vector2 = arm.elbow
		var tip: Vector2 = arm.tip
		if frozen:
			tip += Vector2(randf_range(-1, 1), 0).round()
		_limb(_bez(sh, sh + Vector2(side * 3.0, 4.0), elbow + Vector2(0, -6.0), elbow, 5), 5.5 * lw, 4.0 * lw, SKIN)
		# The forearm bows out, then sweeps back in: a long scythe.
		var ctrl := elbow.lerp(tip, 0.45) + Vector2(side * (6.0 * w + 3.0 * c), 0)
		var blade := _bez(elbow, ctrl, tip + Vector2(side * 2.0 * w, -h * 0.12), tip, 10)
		_limb(blade, 4.0 * lw, 1.0, SKIN, BONE)
		draw_line(tip, tip + Vector2(-side * 3.0, -2.0), _col(BONE), 1.0)               # the hook
		draw_line(elbow, elbow + Vector2(side * 4.0, -5.0), _col(SKIN_LIT), 2.0)       # elbow spur
		if not silhouette:
			draw_rect(Rect2((elbow + Vector2(side * 4.0, -5.0)).round(), Vector2(1, 1)), BONE)

	# 5) The head: one tall stalk, rounded at the top, a seam of a mouth running
	#    down the front (it splits open, teeth showing, when it hunts) and ONE
	#    eye near the top.
	var hb: Vector2 = b.head_base
	var ht: Vector2 = b.head_top
	var axis: Vector2 = b.axis
	var hl: float = b.head_len
	_limb(PackedVector2Array([hb, hb.lerp(ht, 0.5), ht]), 9.0 * lw, 6.0 * lw, SKIN)
	draw_circle(ht, 3.2 * lw, _col(SKIN))
	if not silhouette:
		var perp := axis.orthogonal()
		var seam := 1.0 + (1.0 if hunting else 0.0)
		for s: float in [-1.0, 1.0]:
			draw_line(hb + axis * (hl * 0.12) + perp * s * seam, hb + axis * (hl * 0.70) + perp * s * seam, DARK, 1.0)
		if hunting:
			for i in 5:
				draw_rect(Rect2((hb + axis * (hl * (0.18 + i * 0.1)) + perp * (1.0 if i % 2 else -1.0)).round(), Vector2(1, 1)), BONE)
		# The eye: pale, warm, with a pupil that follows you.
		var e: Vector2 = (b.eye as Vector2).round()
		draw_rect(Rect2(e - Vector2(2, 2), Vector2(5, 5)), DARK)
		draw_rect(Rect2(e - Vector2(1, 1), Vector2(3, 3)), EYE_WHITE)
		var look := Vector2.ZERO
		if GameState.player != null:
			look = (GameState.player.global_position + Vector2(0, -30) - global_position - e).normalized()
		draw_rect(Rect2((e + look).round(), Vector2(1, 1)), PUPIL)


## Torso half-width (px) down the body, t = 0 at the shoulders, 1 at the pelvis.
func _torso_half(t: float) -> float:
	if t < 0.1:
		return lerpf(5.0, 13.0, smoothstep(0.0, 1.0, t / 0.1))   # traps up into the head-stalk
	if t < 0.64:
		# A rounded V: broad ribcage tapering to a waist far too thin.
		var k := (t - 0.1) / 0.54
		return 4.0 + 9.0 * pow(cos(k * PI) * 0.5 + 0.5, 0.75)
	return lerpf(4.0, 8.0, smoothstep(0.0, 1.0, (t - 0.64) / 0.36))   # hips
