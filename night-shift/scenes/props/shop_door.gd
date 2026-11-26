extends Node2D
## The door back to the shop floor, with the red EXIT sign above it.
## After the power cut the exit sign is the only lit thing upstairs.
## Its light only uses the environment mask, so it can never reveal a creature.

@export var exit_light_energy := 0.7


func _ready() -> void:
	var light := PointLight2D.new()
	light.texture = LightTextures.radial(96)
	light.color = Color(1.0, 0.18, 0.15)
	light.energy = exit_light_energy
	light.range_item_cull_mask = GameState.LIGHT_ENV
	light.height = 20.0
	light.position = Vector2(0, -40)
	add_child(light)
	queue_redraw()


func _draw() -> void:
	# Door + frame.
	draw_rect(Rect2(-9, -32, 18, 32), Color8(29, 40, 45))
	draw_rect(Rect2(-8, -31, 16, 31), Color8(51, 69, 74))
	draw_rect(Rect2(4, -17, 2, 2), Color8(142, 161, 155))
	# Push bar.
	draw_rect(Rect2(-6, -16, 12, 1), Color8(111, 133, 130))
	# EXIT sign.
	draw_rect(Rect2(-9, -43, 18, 7), Color(0.85, 0.18, 0.15))
	draw_string(ThemeDB.fallback_font, Vector2(-8, -37.5), "EXIT", HORIZONTAL_ALIGNMENT_LEFT, -1, 6,
			Color(1, 0.92, 0.9))
