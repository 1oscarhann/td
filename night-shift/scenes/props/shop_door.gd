extends Node2D
## The door back to the shop floor, with the red EXIT sign above it.
## After the power cut the exit sign is the only lit thing upstairs.
## Its light only uses the environment mask, so it can never reveal a creature.

@export var exit_light_energy := 0.7
## Return trips: you come back up and the door is open.
var ajar := false:
	set(v):
		ajar = v
		queue_redraw()

const DOOR_TEX := preload("res://art/props/door.tres")


func _ready() -> void:
	var light := PointLight2D.new()
	light.texture = LightTextures.radial(96)
	light.color = Color(1.0, 0.18, 0.15)
	light.energy = exit_light_energy
	light.range_item_cull_mask = GameState.LIGHT_ENV
	light.height = 20.0
	light.position = Vector2(0, -59)
	add_child(light)
	queue_redraw()


func _draw() -> void:
	# The door itself: generated art with a frame, glass pane, push bar and handle.
	if ajar:
		# Swung open into the dark: just the frame and black where the door was.
		draw_rect(Rect2(-12, -52, 24, 52), Color(0.02, 0.02, 0.03))
		draw_rect(Rect2(-12, -52, 2, 52), Color(0.3, 0.32, 0.34))
		draw_rect(Rect2(10, -52, 2, 52), Color(0.3, 0.32, 0.34))
		draw_rect(Rect2(-12, -52, 24, 2), Color(0.3, 0.32, 0.34))
		draw_texture_rect(DOOR_TEX, Rect2(-12, -52, 6, 52), false)   # the edge of the open door
	else:
		draw_texture(DOOR_TEX, Vector2(-12, -52))
	# EXIT sign above it.
	draw_rect(Rect2(-12, -64, 24, 10), Color(0.85, 0.18, 0.15))
	draw_string(ThemeDB.fallback_font, Vector2(-12, -56), "EXIT", HORIZONTAL_ALIGNMENT_CENTER, 24, 8,
			Color(1, 0.92, 0.9))
