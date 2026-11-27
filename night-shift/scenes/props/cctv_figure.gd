class_name CCTVFigure
extends Node2D
## The man on the CCTV. A plain grey man-shaped silhouette, no face, slightly
## too still. He exists only on the feeds: visibility layer 2, which the main
## viewport culls (see Main). Never in the shop, never attacks, never speaks.
##
## He never moves while you watch: on_check() repositions him only when the
## view opens, i.e. between checks.
## Stages from the doc used in this slice:
##   check 1: empty shop (the voice says "see")
##   check 2+: far corner of the shop-floor feed, half out of frame
## Later stages (by the crisps, by the counter, facing the panel, facing the
## camera) need the return trips upstairs, which the slice doesn't have yet.

## World positions per stage (index = stage - 1). Set by the level.
var stage_points: Array = []


func _ready() -> void:
	add_to_group("cctv_figure")
	visibility_layer = 2
	visible = false


func on_check(check_count: int) -> void:
	var stage := 0 if check_count <= 1 else 1
	visible = stage > 0 and stage <= stage_points.size()
	if visible:
		position = stage_points[stage - 1]
	queue_redraw()


func _draw() -> void:
	var c := Color8(87, 109, 109)
	draw_rect(Rect2(-4, -44, 8, 9), c)      # head, no face
	draw_rect(Rect2(-7, -34, 14, 16), c)    # shoulders, torso
	draw_rect(Rect2(-9, -33, 2, 15), c)     # arms hanging, too straight
	draw_rect(Rect2(7, -33, 2, 15), c)
	draw_rect(Rect2(-6, -18, 5, 18), c)     # legs
	draw_rect(Rect2(1, -18, 5, 18), c)
