class_name Player
extends CharacterBody2D
## The night-shift worker.
##
## A/D walk, Shift run (loud, drains stamina), Ctrl crouch (quiet, slow, fits under
## low gaps), W/S stairs, hold E to interact, mouse aims the torch, click toggles it.
## The sprite faces the direction of MOVEMENT, never the torch: walking right
## while shining left is intended and should feel exposed.
##
## Origin is at the feet (bottom centre) so floor-placed things line up easily.

@export_group("Movement")
@export var walk_speed := 55.0
@export var run_speed := 100.0
@export var crouch_speed := 26.0
@export var climb_speed := 40.0
@export var acceleration := 700.0
@export var gravity := 900.0

@export_group("Camera")
## How far (world px) the camera leans towards the mouse.
@export var camera_lead := 48.0

@export_group("Stamina")
## Seconds of running from full.
@export var stamina_max := 5.0
## Stamina regained per second while not running.
@export var stamina_regen := 0.7
## Once empty, running is locked until stamina is back above this fraction.
@export_range(0.0, 1.0) var exhausted_until := 0.35

@export_group("Noise radius (px)")
## How far away the Wedged Thing can hear you. Footsteps also send these as
## noise events. Crouch = 32, walk = 96, run = 220 (scary phase 2 spec).
@export var walk_noise := 96.0
@export var run_noise := 220.0
@export var crouch_noise := 32.0
@export var climb_noise := 96.0
## Standing still: you can only be heard from (almost) touching distance.
## Crouched and still in the dark you make no sound at all.
@export var still_noise := 18.0
@export var still_crouched_noise := 0.0

## Where the torch hand sits (facing right). Matches the 44 px sprite's front
## shoulder; player_visual.gd draws the arm from the shoulder to here.
const STAND_HAND := Vector2(7, -27)
const CROUCH_HAND := Vector2(10, -16)
const STAND_HEIGHT := 44.0
## Standing still underground this long -> "keep moving".
const IDLE_LINE_TIME := 15.0
## World px of floor kept visible under the feet.
const CAMERA_FLOOR_MARGIN := 18.0

var facing := 1
var crouching := false
var running := false
var climbing := false
var interacting := false
## Set by Main during death / ending sequences.
var input_locked := false
## Held by a Cable: can't walk, can still aim and toggle the torch.
var held := false
## Speed a Cable drags you at while held.
var pull_speed := 0.0
var stamina := 0.0
var exhausted := false
var idle_time := 0.0

var _step_accum := 0.0
var _stairs: Stairs = null
var _interactable = null        # duck typed: interact_hold(), can_interact(), ...
var _active_interactable = null # the one we're currently holding E on
var _headroom := RectangleShape2D.new()
var _room_mid_y := 0.0
var _shake := 0.0
var _shake_left := 0.0

@onready var torch: Torch = $Torch
@onready var stand_shape: CollisionShape2D = $StandShape
@onready var crouch_shape: CollisionShape2D = $CrouchShape
@onready var climb_sensor: Area2D = $ClimbSensor
@onready var interact_area: Area2D = $InteractArea
@onready var prompt: InteractPrompt = $InteractPrompt
@onready var camera: Camera2D = $Camera2D
@onready var glow: PointLight2D = $Glow


func _ready() -> void:
	add_to_group("player")
	GameState.player = self
	stamina = stamina_max
	# Space between the crouched head and the standing head. Must be clear to stand up.
	_headroom.size = Vector2(8, 16)
	# Dim glow so the player never fully vanishes. Its cull mask excludes the
	# creature bit, so it can never reveal a creature: only the torch does that.
	glow.texture = LightTextures.radial(96)
	glow.range_item_cull_mask = GameState.LIGHT_ENV
	collision_layer = GameState.LAYER_PLAYER
	collision_mask = GameState.LAYER_WORLD | GameState.LAYER_STAIR_PLATFORM
	climb_sensor.collision_mask = GameState.LAYER_CLIMB
	interact_area.collision_mask = GameState.LAYER_INTERACT


func _physics_process(delta: float) -> void:
	_measure_room()
	if input_locked:
		_locked_move(delta)
		return
	if Input.is_action_just_pressed("torch_toggle") and not interacting:
		torch.toggle()
	if held:
		_held_move(delta)
		return
	if _update_interact(delta):
		return
	_update_crouch()
	_update_climb_state()
	if climbing:
		_climb_move(delta)
	else:
		_ground_move(delta)
	_update_hand()
	_update_idle(delta)


func _process(delta: float) -> void:
	_update_camera(delta)


## Camera framing (zoom 1 at 640x360). Framed on the ROOM, not just the player: it aims at the middle between the
## floor and ceiling you're standing in, clamped so your feet and head always
## stay on screen. Rooms fill the view instead of leaving big rock bands.
## It also leans a little towards the mouse so aiming into the dark shows you
## more of that side.
func _update_camera(delta: float) -> void:
	var vp := get_viewport()
	var view := vp.get_visible_rect().size / camera.zoom
	var m := vp.get_mouse_position() / vp.get_visible_rect().size - Vector2(0.5, 0.5)
	var feet := global_position.y
	var target_y := clampf(_room_mid_y,
			feet + CAMERA_FLOOR_MARGIN - view.y * 0.5,   # floor stays in view
			feet - STAND_HEIGHT - 10.0 + view.y * 0.5)   # head stays in view
	var target := Vector2(m.x * camera_lead, target_y - feet)
	camera.position = camera.position.lerp(target, clampf(delta * 4.0, 0.0, 1.0))
	if _shake_left > 0.0:
		_shake_left -= delta
		var k := clampf(_shake_left / 0.3, 0.0, 1.0)
		camera.offset = Vector2(randf_range(-1, 1), randf_range(-1, 1)).round() * _shake * k
	else:
		_shake = 0.0
		camera.offset = Vector2.ZERO


## Middle of the open space at the player's x (floor-to-ceiling raycasts).
func _measure_room() -> void:
	var space := get_world_2d().direct_space_state
	var from := global_position + Vector2(0, -8)
	var down := space.intersect_ray(PhysicsRayQueryParameters2D.create(
			from, from + Vector2(0, 64), GameState.LAYER_WORLD))
	var up := space.intersect_ray(PhysicsRayQueryParameters2D.create(
			from, from + Vector2(0, -240), GameState.LAYER_WORLD))
	var floor_y := global_position.y
	var ceil_y := global_position.y - 120.0
	if not down.is_empty():
		var dp: Vector2 = down.position
		floor_y = dp.y
	if not up.is_empty():
		var upos: Vector2 = up.position
		ceil_y = upos.y
	_room_mid_y = (floor_y + ceil_y) * 0.5


## Teleport to a checkpoint and reset transient state.
func respawn(pos: Vector2) -> void:
	global_position = pos
	velocity = Vector2.ZERO
	_set_climbing(false, null)
	if crouching:
		_set_crouch(false)
	interacting = false
	held = false
	pull_speed = 0.0
	_active_interactable = null
	torch.release_aim()
	torch.set_on(true, false)
	stamina = stamina_max
	exhausted = false
	idle_time = 0.0
	snap_camera()


## Let go of any stairs (used before teleports).
func stop_climbing() -> void:
	_set_climbing(false, null)


## How far away something can hear you right now: depends only on how you're
## moving. Standing still in the dark, crouched, you're nearly silent.
func hearing_radius() -> float:
	if climbing:
		return climb_noise
	if absf(velocity.x) < 4.0:
		return still_crouched_noise if crouching else still_noise
	if crouching:
		return crouch_noise
	if running:
		return run_noise
	return walk_noise


## Small screen shake (world px) for `time` seconds.
func shake(strength: float, time: float) -> void:
	_shake = maxf(_shake, strength)
	_shake_left = maxf(_shake_left, time)


## Jump the camera straight to its framed position (no smoothing).
func snap_camera() -> void:
	_measure_room()
	var view := get_viewport().get_visible_rect().size / camera.zoom
	var feet := global_position.y
	var y := clampf(_room_mid_y, feet + CAMERA_FLOOR_MARGIN - view.y * 0.5,
			feet - STAND_HEIGHT - 10.0 + view.y * 0.5)
	camera.position = Vector2(0, y - feet)
	camera.reset_smoothing()


# ---------------------------------------------------------------------- movement

func _ground_move(delta: float) -> void:
	var dir := Input.get_axis("move_left", "move_right")
	var wants_run := Input.is_action_pressed("run") and absf(dir) > 0.1 and not crouching
	running = wants_run and not exhausted
	_update_stamina(delta)

	var speed := walk_speed
	if crouching:
		speed = crouch_speed
	elif running:
		speed = run_speed
	if GameState.changed:
		speed *= 0.72   # near the end: slower, stiffer. Never explained.
	velocity.x = move_toward(velocity.x, dir * speed, acceleration * delta)
	velocity.y += gravity * delta
	if absf(dir) > 0.1:
		facing = 1 if dir > 0.0 else -1
	move_and_slide()

	if is_on_floor() and absf(velocity.x) > 4.0:
		_step_accum += absf(velocity.x) * delta
		var stride := 10.0 if crouching else (20.0 if running else 14.0)
		if _step_accum >= stride:
			_step_accum -= stride
			_footstep()


func _held_move(delta: float) -> void:
	velocity.x = pull_speed
	velocity.y += gravity * delta
	move_and_slide()
	_update_hand()


func _locked_move(delta: float) -> void:
	velocity.x = move_toward(velocity.x, 0.0, acceleration * delta)
	if climbing:
		velocity.y = 0.0
	else:
		velocity.y += gravity * delta
	move_and_slide()


func _update_stamina(delta: float) -> void:
	if running:
		stamina = maxf(stamina - delta, 0.0)
		if stamina <= 0.0:
			exhausted = true
	else:
		stamina = minf(stamina + stamina_regen * delta, stamina_max)
		if exhausted and stamina >= stamina_max * exhausted_until:
			exhausted = false


## Every footstep is both a sound and a noise event creatures can hear.
func _footstep() -> void:
	var noise := walk_noise
	# Quiet in the mix (creatures should be what you hear), but running is
	# clearly louder than walking.
	var vol := -21.0
	if crouching:
		noise = crouch_noise
		vol = -31.0
	elif running:
		noise = run_noise
		vol = -11.0
	AudioDirector.play_at("step", global_position, vol, 0.12)
	GameState.make_noise(global_position, noise, "running" if running and not crouching else "footsteps")


func _update_hand() -> void:
	var hand := CROUCH_HAND if crouching else STAND_HAND
	torch.position = Vector2(hand.x * facing, hand.y)


func _update_idle(delta: float) -> void:
	if velocity.length() < 2.0:
		idle_time += delta
	else:
		idle_time = 0.0
	if idle_time > IDLE_LINE_TIME and GameState.zone >= 1:
		Narrator.say("keep_moving")


# ------------------------------------------------------------------------ crouch

func _update_crouch() -> void:
	var wants := Input.is_action_pressed("crouch") and not climbing
	if wants and not crouching:
		_set_crouch(true)
	elif not wants and crouching and _has_headroom():
		_set_crouch(false)


func _set_crouch(on: bool) -> void:
	crouching = on
	stand_shape.disabled = on
	crouch_shape.disabled = not on


## Can't stand up under a low ceiling: you stay crouched until there's room.
func _has_headroom() -> bool:
	var query := PhysicsShapeQueryParameters2D.new()
	query.shape = _headroom
	query.transform = Transform2D(0.0, global_position + Vector2(0, -33))
	query.collision_mask = GameState.LAYER_WORLD
	return get_world_2d().direct_space_state.intersect_shape(query, 1).is_empty()


# ------------------------------------------------------------------------ stairs
# Stairwells are latched with W/S. While latched there's no gravity and the
# one-way platform at the top is ignored, so you can climb down through it.

func _find_stairs() -> Stairs:
	for area in climb_sensor.get_overlapping_areas():
		var s := area.get_parent() as Stairs
		if s != null:
			return s
	return null


func _update_climb_state() -> void:
	var stairs := _find_stairs()
	if stairs == null:
		if climbing:
			_set_climbing(false, null)
		return
	var v := Input.get_axis("move_up", "move_down")
	var feet := global_position.y
	if climbing and stairs != _stairs:
		_stairs = stairs   # teleported between stairwells: hold on to the one you're in
	if not climbing:
		if v < -0.1 and feet > stairs.top_y + 2.0:
			_set_climbing(true, stairs)
		elif v > 0.1 and feet < stairs.bottom_y - 2.0:
			_set_climbing(true, stairs)
		return
	# Up-stairs deeper down end in a hatch: reaching the top takes you up.
	if stairs.exit_up and feet < stairs.top_y + STAND_HEIGHT + 4.0:
		_set_climbing(false, null)
		stairs.exited_up.emit(stairs)
		return
	# Off the top: feet just above the landing, gravity drops us onto the platform.
	if feet < stairs.top_y - 3.0:
		_set_climbing(false, null)
		return
	# Walk off at the bottom. (Near the bottom counts too: let go of S a few px
	# early and you'd otherwise hover there, since there's no gravity on stairs.)
	if (is_on_floor() or feet >= stairs.bottom_y - 6.0) and v >= 0.0 \
			and absf(Input.get_axis("move_left", "move_right")) > 0.1:
		_set_climbing(false, null)


func _set_climbing(on: bool, stairs: Stairs) -> void:
	climbing = on
	_stairs = stairs
	velocity = Vector2.ZERO
	if on:
		collision_mask = GameState.LAYER_WORLD
		if crouching:
			_set_crouch(false)
	else:
		collision_mask = GameState.LAYER_WORLD | GameState.LAYER_STAIR_PLATFORM


func _climb_move(delta: float) -> void:
	var v := Input.get_axis("move_up", "move_down")
	# The stairs that get longer: past the middle, quietly back up a flight.
	if v > 0.1 and _stairs.extra_loops > 0 and global_position.y > _stairs.top_y + _stairs.height * 0.55:
		_stairs.extra_loops -= 1
		global_position.y -= 48.0
		camera.reset_smoothing()
	if v > 0.1 and global_position.y >= _stairs.bottom_y - 1.0:
		_stairs.reached_bottom.emit(_stairs)
	velocity.y = v * climb_speed
	# Centre on the stairs, but never yank sideways faster than walking.
	velocity.x = clampf((_stairs.center_x - global_position.x) * 10.0, -walk_speed, walk_speed)
	move_and_slide()
	if absf(v) > 0.1 and not is_on_floor():
		_step_accum += climb_speed * delta
		if _step_accum >= 9.0:
			_step_accum -= 9.0
			AudioDirector.play_at("step", global_position, -13.0, 0.1, 600.0, 1.3)
			GameState.make_noise(global_position, climb_noise, "climbing")


# ---------------------------------------------------------------------- interact

## Returns true while an interaction is consuming this frame's movement.
func _update_interact(delta: float) -> bool:
	_interactable = _find_interactable()
	var holding := Input.is_action_pressed("interact")
	if _interactable != null and holding and is_on_floor() and not climbing:
		if not interacting or _active_interactable != _interactable:
			interacting = true
			_active_interactable = _interactable
			if _interactable.requires_two_hands:
				# Two hands on the board: the torch ends up pointing at the floor.
				var p: Vector2 = _interactable.get_interact_point()
				torch.force_aim(Vector2(signf(p.x - global_position.x) * 0.35, 1.0))
		var point: Vector2 = _interactable.get_interact_point()
		facing = 1 if point.x >= global_position.x else -1
		_interactable.interact_hold(self, delta)
		velocity.x = move_toward(velocity.x, 0.0, acceleration * delta)
		velocity.y += gravity * delta
		move_and_slide()
		_update_hand()
		_update_prompt()
		idle_time = 0.0
		return true

	if interacting:
		interacting = false
		torch.release_aim()
		if _active_interactable != null and is_instance_valid(_active_interactable):
			_active_interactable.interact_release()
		_active_interactable = null
	_update_prompt()
	return false


## The nearest thing in reach that can be used right now (several can overlap,
## e.g. the CCTV monitor and the torch under the same counter).
func _find_interactable():
	var best = null
	var best_d := INF
	for area in interact_area.get_overlapping_areas():
		var target = area.get_parent()
		if target.has_method("interact_hold") and target.can_interact():
			var p: Vector2 = target.get_interact_point()
			var d := absf(p.x - global_position.x)
			if d < best_d:
				best_d = d
				best = target
	return best


func _update_prompt() -> void:
	if _interactable == null:
		prompt.set_state(false, 0.0)
		return
	prompt.global_position = _interactable.get_prompt_point()
	prompt.set_state(true, _interactable.get_progress())
