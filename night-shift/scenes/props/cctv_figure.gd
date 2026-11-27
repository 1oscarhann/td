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

## name -> [world position, pose ("side" or "front")]. Set by the level.
var stages: Dictionary = {}
var _pose := "side"
var _trip_seen := -1
var _checks_this_trip := 0


func _ready() -> void:
	add_to_group("cctv_figure")
	visibility_layer = 2
	visible = false


## The design doc's escalation, driven by return trips. He only ever moves
## between checks, never while you watch.
func on_check(check_count: int) -> void:
	if GameState.trips != _trip_seen:
		_trip_seen = GameState.trips
		_checks_this_trip = 0
	_checks_this_trip += 1
	var stage := ""
	match GameState.trips:
		0:
			stage = "" if check_count <= 1 else "corner"
		1:
			stage = "crisps"
		2:
			stage = "counter"
		_:
			stage = "panel" if _checks_this_trip <= 1 else "facing"
	visible = stage != "" and stages.has(stage)
	if visible:
		position = stages[stage][0]
		_pose = stages[stage][1]
	queue_redraw()


func _draw() -> void:
	var c := Color8(87, 109, 109)
	if _pose == "front":
		# Facing the camera: square shoulders, arms straight down, head level.
		draw_rect(Rect2(-4, -44, 8, 9), c)
		draw_rect(Rect2(-8, -34, 16, 16), c)
		draw_rect(Rect2(-10, -33, 2, 16), c)
		draw_rect(Rect2(8, -33, 2, 16), c)
		draw_rect(Rect2(-6, -18, 5, 18), c)
		draw_rect(Rect2(1, -18, 5, 18), c)
		return
	draw_rect(Rect2(-4, -44, 8, 9), c)      # head, no face
	draw_rect(Rect2(-7, -34, 14, 16), c)    # shoulders, torso
	draw_rect(Rect2(-9, -33, 2, 15), c)     # arms hanging, too straight
	draw_rect(Rect2(7, -33, 2, 15), c)
	draw_rect(Rect2(-6, -18, 5, 18), c)     # legs
	draw_rect(Rect2(1, -18, 5, 18), c)
