class_name Stairs
extends Node2D
## A stairwell going down. Stand in it and hold W/S to go up or down.
##
## The root sits at the top-left of the shaft, on the landing's floor line.
## Children:
##   Climb       Area2D on the "climbable" layer; the player's ClimbSensor finds it.
##   TopPlatform One-way StaticBody2D so you can walk over the top of the shaft.
##               The player ignores it while latched, so you can climb through.
## Future: "the stairs back up get longer every time" -> just grow `height` and
## offset the lower level on each return trip. Never mention it.

@export var width := 32.0
@export var height := 176.0
## How far the climb area pokes above the landing, so you can latch from the top.
const TOP_REACH := 6.0

var top_y: float:
	get:
		return global_position.y

var bottom_y: float:
	get:
		return global_position.y + height

var center_x: float:
	get:
		return global_position.x + width * 0.5


func _ready() -> void:
	var climb_shape := RectangleShape2D.new()
	climb_shape.size = Vector2(width - 8.0, height + TOP_REACH)
	$Climb.collision_layer = GameState.LAYER_CLIMB
	$Climb/Shape.shape = climb_shape
	$Climb/Shape.position = Vector2(width * 0.5, (height - TOP_REACH) * 0.5)

	var platform_shape := RectangleShape2D.new()
	platform_shape.size = Vector2(width, 4.0)
	$TopPlatform.collision_layer = GameState.LAYER_STAIR_PLATFORM
	$TopPlatform/Shape.shape = platform_shape
	$TopPlatform/Shape.position = Vector2(width * 0.5, 2.0)
	queue_redraw()


func _draw() -> void:
	# Steep metal service stairs: two stringers and treads every 8 px.
	var rail := Color(0.40, 0.40, 0.43)
	var tread := Color(0.52, 0.51, 0.49)
	draw_rect(Rect2(4, 0, 2, height), rail)
	draw_rect(Rect2(width - 6.0, 0, 2, height), rail)
	var y := 7.0
	while y < height:
		draw_rect(Rect2(6, y, width - 12.0, 2), tread)
		y += 8.0
	# Landing grate over the top of the shaft.
	draw_rect(Rect2(0, 0, width, 3), Color(0.36, 0.36, 0.38))
	for x in range(1, int(width), 3):
		draw_rect(Rect2(x, 1, 1, 1), Color(0.12, 0.12, 0.13))
