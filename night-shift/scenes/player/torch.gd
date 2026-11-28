class_name Torch
extends Node2D
## The torch: a cone of light from the player's hand towards the mouse.
##
## Two jobs:
##  1. Rendering. Light is a PointLight2D whose range_item_cull_mask includes the
##     creature light-mask bit. It is the ONLY light that does, so creatures
##     (Light Only material) are invisible everywhere except inside this beam.
##  2. Gameplay. Cone is an Area2D matching the beam. Every physics frame, each
##     creature area inside it gets raycast checks (torch -> creature probe points)
##     against the world layer, so walls block the beam for logic as well as for
##     shadows. Results are exposed through is_lit() and get_lit_time().
##
## Costs come from the world, not a battery: creatures react to the beam, and
## two-handed interactions force it to point at the floor (force_aim()).
##
## Scary phase 5: a cheap, dirty torch. A narrow hot spot inside a dim spill,
## lens dirt in the light, dust drifting through the beam, the odd brownout.
## It's heavy in the hand: the beam trails the mouse slightly and shakes more
## the more scared you are (tension). The gameplay cone is unchanged.

signal toggled(on: bool)
## Emitted when a target enters or leaves the beam (with line of sight).
signal lit_changed(target: Node, lit: bool)

@export var cone_angle_deg := 40.0
## Beam length in px (16 px tiles: 120 px = 7.5 tiles).
@export var cone_length := 120.0
@export var energy := 2.7
@export var light_color := Color(1.0, 0.88, 0.68)
## The beam follows the mouse this fast (higher = snappier). Weight in the hand.
@export var aim_follow := 16.0
## Brightness steps in the bright part of the beam (0 = smooth). The far tail
## always fades smoothly to nothing.
@export var falloff_bands := 0
@export_group("Floor spill")
## Light pooling on the floor in front of the player. Environment mask only:
## it can never reveal a creature (only the beam can).
@export var spill_energy := 0.9
## How far in front of the feet the pool sits, along the aim direction.
@export var spill_reach := 20.0
@export_group("")
@export var start_on := true
## Torch held on one empty spot this long -> "what are you looking for".
@export var hold_still_line_time := 10.0

var is_on := false
## False until the player picks the torch up (Act 0: it's under the counter).
var available := true

var _forced_dir := Vector2.ZERO
## target (Node) -> {"lit": bool, "time": float, "total": float}
var _lit: Dictionary = {}
var _flicker_left := 0.0
var _still_time := 0.0
var _last_rot := 0.0
var _spill: PointLight2D
var _motes: CPUParticles2D
var _brownout := 0.0          # seconds left of a battery dip
var _next_brownout := 6.0
var _t := 0.0

@onready var light: PointLight2D = $Light
@onready var cone: Area2D = $Cone
@onready var cone_shape: CollisionPolygon2D = $Cone/Polygon


func _ready() -> void:
	GameState.torch = self
	# The visible beam: a dirty torch (hot spot ~24 deg inside a dim spill a bit
	# wider than the gameplay cone).
	light.texture = LightTextures.torch_beam(cone_length * 1.08, cone_angle_deg + 6.0, 24.0)
	light.color = light_color
	light.energy = energy
	# The visibility rule: the torch lights the environment AND the creature layer.
	light.range_item_cull_mask = GameState.LIGHT_ENV | GameState.LIGHT_CREATURES
	light.shadow_enabled = true
	light.shadow_item_cull_mask = GameState.LIGHT_ENV
	cone.collision_layer = 0
	cone.collision_mask = GameState.LAYER_CREATURES
	cone.monitorable = false
	cone_shape.polygon = _cone_polygon()
	_make_spill()
	_make_motes()
	set_on(start_on, false)


func _physics_process(delta: float) -> void:
	_t += delta
	_aim(delta)
	_update_flicker(delta)
	_update_brownout(delta)
	_update_spill()
	_update_lit(delta)
	_update_hold_still(delta)


# --------------------------------------------------------------------------- API

func is_lit(target: Node) -> bool:
	return _lit.has(target) and _lit[target].lit


## Seconds the target has been continuously lit (0 if not lit right now).
func get_lit_time(target: Node) -> float:
	if not _lit.has(target):
		return 0.0
	return _lit[target].time


## Total seconds the target has been lit this run.
func get_total_lit_time(target: Node) -> float:
	if not _lit.has(target):
		return 0.0
	return _lit[target].total


func toggle() -> void:
	set_on(not is_on)


func set_available(value: bool) -> void:
	available = value
	if not available:
		set_on(false, false)


func set_on(on: bool, with_sound := true) -> void:
	on = on and available
	is_on = on
	light.enabled = on
	light.energy = energy
	_flicker_left = 0.0
	if with_sound:
		AudioDirector.play_at("click", global_position, -8.0, 0.05)
	toggled.emit(on)


## Point the torch in a fixed direction (two-handed actions: torch at the floor).
func force_aim(direction: Vector2) -> void:
	_forced_dir = direction


func release_aim() -> void:
	_forced_dir = Vector2.ZERO


## Scripted flicker. A storytelling tool, never random noise.
func flicker(duration := 0.6) -> void:
	_flicker_left = maxf(_flicker_left, duration)


func get_aim_direction() -> Vector2:
	return Vector2.from_angle(global_rotation)


# ---------------------------------------------------------------------- internals

func _aim(delta: float) -> void:
	var dir := _forced_dir
	if dir == Vector2.ZERO:
		dir = get_global_mouse_position() - global_position
	if dir.length_squared() < 0.01:
		return
	var want := dir.angle()
	# Your hand isn't steady down here, and it gets worse the more scared you are.
	var shake := 0.006 + 0.03 * GameState.tension
	want += (sin(_t * 7.3) * 0.6 + sin(_t * 13.1 + 1.3) * 0.4) * shake
	if _forced_dir != Vector2.ZERO:
		# Swing down to the floor rather than snapping: it should feel like your
		# hands are busy, not like the game took the mouse away.
		global_rotation = lerp_angle(global_rotation, want, 0.25)
	else:
		# Heavy: the beam trails the mouse a little.
		global_rotation = lerp_angle(global_rotation, want, 1.0 - exp(-aim_follow * delta))


func _update_flicker(delta: float) -> void:
	if not is_on or _flicker_left <= 0.0:
		return
	_flicker_left -= delta
	if _flicker_left <= 0.0:
		light.enabled = true
		light.energy = energy
	elif randf() < 0.45:
		# Fully off, not just dim: Light Only creatures don't fade with energy,
		# so a dim frame would show the creature while the walls go dark.
		light.enabled = false
	else:
		light.enabled = true
		light.energy = energy * randf_range(0.4, 1.0)


## Battery dips: now and then the beam sags for a moment (never fully off:
## that's for scripted flickers). More often deeper down.
func _update_brownout(delta: float) -> void:
	if not is_on or _flicker_left > 0.0:
		return
	if _brownout > 0.0:
		_brownout -= delta
		light.energy = energy * 0.55 if _brownout > 0.0 else energy
		return
	_next_brownout -= delta * (1.0 + 0.25 * float(GameState.zone))
	if _next_brownout <= 0.0:
		_next_brownout = randf_range(5.0, 14.0)
		_brownout = randf_range(0.04, 0.12)


## Dust hanging in the air, only visible where light falls on it (Light Only on
## the environment mask): in your beam it drifts and glitters.
func _make_motes() -> void:
	_motes = CPUParticles2D.new()
	_motes.name = "Motes"
	var mat := CanvasItemMaterial.new()
	mat.light_mode = CanvasItemMaterial.LIGHT_MODE_LIGHT_ONLY
	_motes.material = mat
	_motes.light_mask = GameState.LIGHT_ENV
	_motes.texture = CreatureDraw.pixel_texture()
	_motes.local_coords = false
	_motes.amount = 46
	_motes.lifetime = 5.0
	_motes.preprocess = 5.0
	_motes.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	_motes.emission_sphere_radius = 110.0
	_motes.direction = Vector2(1, 0)
	_motes.spread = 180.0
	_motes.gravity = Vector2(0, 1.5)
	_motes.initial_velocity_min = 0.5
	_motes.initial_velocity_max = 3.0
	_motes.color = Color(0.85, 0.82, 0.74, 0.55)
	_motes.top_level = true
	add_child(_motes)


func _make_spill() -> void:
	_spill = PointLight2D.new()
	_spill.name = "Spill"
	_spill.texture = LightTextures.ellipse(112, 36)
	_spill.color = light_color
	_spill.range_item_cull_mask = GameState.LIGHT_ENV
	_spill.shadow_enabled = false
	_spill.height = 20.0
	_spill.top_level = true   # doesn't rotate with the beam
	add_child(_spill)


## The pool slides along the floor towards where you aim and gets stronger the
## more the beam points down. Pointing up still leaks a little from the hand.
func _update_spill() -> void:
	if _motes != null:
		_motes.global_position = global_position + get_aim_direction() * 50.0
	var aim := get_aim_direction()
	var feet := global_position
	var body := get_parent() as Node2D
	if body != null:
		feet = body.global_position
	_spill.global_position = feet + Vector2(aim.x * spill_reach, 0)
	var down := clampf(aim.y, 0.0, 1.0)
	_spill.enabled = light.enabled
	_spill.energy = spill_energy * (0.45 + 0.55 * down) * (light.energy / energy)


func _update_lit(delta: float) -> void:
	var current := {}
	if is_on:
		for area in cone.get_overlapping_areas():
			var target := _target_for(area)
			if target != null and _has_line_of_sight(target):
				current[target] = true

	for target in current:
		if not _lit.has(target):
			_lit[target] = {"lit": false, "time": 0.0, "total": 0.0}

	for target in _lit.keys():
		if not is_instance_valid(target):
			_lit.erase(target)
			continue
		var state: Dictionary = _lit[target]
		var now_lit := current.has(target)
		if now_lit:
			state.time += delta
			state.total += delta
		if now_lit != state.lit:
			state.lit = now_lit
			if not now_lit:
				state.time = 0.0
			lit_changed.emit(target, now_lit)
			if target.has_method("on_torch_lit_changed"):
				target.on_torch_lit_changed(now_lit)


## A creature's root is normally the Area2D itself (it defines get_light_probe_points).
## Otherwise the area is a part of a bigger creature, so use its parent.
func _target_for(area: Area2D) -> Node:
	if area.has_method("get_light_probe_points"):
		return area
	return area.get_parent()


## The area overlap is a coarse broadphase. A target counts as lit only if one of
## its probe points is inside the real cone and not hidden behind a wall.
func _has_line_of_sight(target: Node) -> bool:
	var points: Array = []
	if target.has_method("get_light_probe_points"):
		points = target.get_light_probe_points()
	elif target is Node2D:
		points = [(target as Node2D).global_position]
	var half := deg_to_rad(cone_angle_deg) * 0.5
	var space := get_world_2d().direct_space_state
	for p in points:
		var point: Vector2 = p
		var to := point - global_position
		if to.length() > cone_length:
			continue
		if absf(angle_difference(global_rotation, to.angle())) > half:
			continue
		var query := PhysicsRayQueryParameters2D.create(global_position, point, GameState.LAYER_WORLD)
		if space.intersect_ray(query).is_empty():
			return true
	return false


func _any_lit() -> bool:
	for target in _lit:
		if _lit[target].lit:
			return true
	return false


func _update_hold_still(delta: float) -> void:
	if not is_on or _forced_dir != Vector2.ZERO or GameState.zone < 1:
		_still_time = 0.0
		return
	if absf(angle_difference(_last_rot, global_rotation)) < 0.04:
		_still_time += delta
	else:
		_still_time = 0.0
		_last_rot = global_rotation
	if _still_time > hold_still_line_time and not _any_lit():
		Narrator.say("what_are_you_looking_for")


func _cone_polygon() -> PackedVector2Array:
	var pts := PackedVector2Array([Vector2.ZERO])
	var half := deg_to_rad(cone_angle_deg) * 0.5
	var segments := 8
	for i in segments + 1:
		var a := lerpf(-half, half, float(i) / segments)
		pts.append(Vector2.from_angle(a) * cone_length)
	return pts
