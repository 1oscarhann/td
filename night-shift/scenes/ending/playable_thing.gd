extends WedgedThing
## The ending: you ARE the Wedged Thing. Same body, same legs, same eye; your
## eye is now a torch cone. A/D move you. Standing still, the tunnel squeezes
## you forward anyway.

var eye_light: PointLight2D
var _idle := 0.0


func _ready() -> void:
	super._ready()
	_active = true
	state = State.CHASE
	chase_speed = 58.0
	puppet = true          # you are it: it doesn't catch or notice anything
	eye_light = PointLight2D.new()
	eye_light.texture = LightTextures.cone(150.0, 38.0, 0)
	eye_light.color = Color(1.0, 0.9, 0.72)              # torchlight, the same warm colour
	eye_light.energy = 1.3
	eye_light.range_item_cull_mask = GameState.LIGHT_ENV | GameState.LIGHT_CREATURES
	eye_light.shadow_enabled = true
	add_child(eye_light)
	var self_glow := PointLight2D.new()                  # just enough to see your own legs
	self_glow.texture = LightTextures.radial(160)
	self_glow.energy = 0.35
	self_glow.range_item_cull_mask = GameState.LIGHT_CREATURES
	self_glow.position = Vector2(0, -40)
	add_child(self_glow)


func _physics_process(delta: float) -> void:
	_t += delta
	_state_time += delta
	var axis := Input.get_axis("move_left", "move_right")
	if absf(axis) > 0.1:
		_idle = 0.0
		target_x = global_position.x + axis * 80.0
	else:
		_idle += delta
		# Standing still makes the tunnel squeeze you forward.
		target_x = global_position.x + (30.0 * dir if _idle > 1.2 else 0.0)
	_update_twitch(delta)
	_move(delta)
	_update_legs(delta)
	_update_shape()
	_update_audio(delta)
	var b := _body_points()
	eye_light.position = b.eye
	eye_light.rotation = Vector2(dir, 0.25).angle()
	_redraw()
