extends Node2D
## Metal shelving with crisp packets. Root sits on the floor.
##
## The packet layout uses a FIXED seed on purpose: every shelf in the game is
## identical, so the one in the tunnel is exactly the one you see upstairs.
## "Things from upstairs, down here": wrong, not gory.

@export var width := 24.0
@export var height := 40.0
@export var layout_seed := 4242


func _ready() -> void:
	queue_redraw()


func _draw() -> void:
	var metal := Color(0.46, 0.48, 0.52)
	draw_rect(Rect2(-width * 0.5, -height, 2, height), metal)
	draw_rect(Rect2(width * 0.5 - 2.0, -height, 2, height), metal)
	var packets := [
		Color(0.80, 0.22, 0.20), Color(0.22, 0.40, 0.80),
		Color(0.85, 0.70, 0.22), Color(0.30, 0.62, 0.32),
	]
	var rng := RandomNumberGenerator.new()
	rng.seed = layout_seed
	var shelves := 3
	for i in shelves:
		var y := -height + 3.0 + i * (height - 3.0) / shelves + (height - 3.0) / shelves - 1.0
		draw_rect(Rect2(-width * 0.5, y, width, 1), metal)
		var x := -width * 0.5 + 2.5
		while x < width * 0.5 - 4.0:
			var ph := rng.randf_range(4.0, 7.0)
			var col: Color = packets[rng.randi() % packets.size()]
			draw_rect(Rect2(x, y - ph, 3, ph), col)
			x += 4.0
