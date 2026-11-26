extends Node2D
## The FUSE BOX sign. A cheap printed sign taped to the wall, always pointing deeper.
## `wrong` signs are older, handwritten, lowercase, and point somewhere they
## shouldn't (into walls, back the way you came). The fuse box is never reached.

@export var text := "FUSE BOX >"
@export var wrong := false
@export var font_size := 8


func _ready() -> void:
	if wrong:
		text = text.to_lower()
		rotation = 0.07
	queue_redraw()


func _draw() -> void:
	var font := ThemeDB.fallback_font
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x + 5.0
	var paper := Color(0.70, 0.62, 0.45) if wrong else Color(0.88, 0.88, 0.84)
	draw_rect(Rect2(-w * 0.5, -6, w, 12), paper)
	# Tape at the top.
	draw_rect(Rect2(-4, -7, 8, 2), Color(0.85, 0.85, 0.75, 0.7))
	var ink := Color(0.25, 0.12, 0.10) if wrong else Color(0.08, 0.08, 0.08)
	draw_string(font, Vector2(-w * 0.5 + 2.5, 3), text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, ink)
