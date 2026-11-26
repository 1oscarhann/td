class_name ShopTask
extends Node2D
## A hold-E job: stack the crisps, mop the spill, check the fridge, grab the
## torch, try the breaker. The Act 0 director listens to `completed` and decides
## what it means. Boring on purpose: the boredom is the point.
##
## Uses the same duck-typed interactable interface as BoardedPanel.
## Root sits on the floor where the job is.

signal completed(task: ShopTask)

enum Kind { NONE, BOX, SPILL }

@export var task_id := ""
@export var hold_time := 1.5
## What it looks like until it's done: a box of crisps, a spill, or nothing.
@export var kind := Kind.NONE
## Disabled tasks can't be done yet (the torch before the power cut).
@export var enabled := true
## Repeatable jobs (the CCTV) reset instead of staying done.
@export var repeatable := false
@export var zone_size := Vector2(28, 28)
## Where the prompt ring floats, relative to the root.
@export var prompt_offset := Vector2(0, -34)

const BOX_TEX := preload("res://art/props/box.tres")

var requires_two_hands := false
var done := false
var progress := 0.0


func _ready() -> void:
	var area := Area2D.new()
	area.collision_layer = GameState.LAYER_INTERACT
	area.collision_mask = 0
	area.monitoring = false
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = zone_size
	shape.shape = rect
	shape.position = Vector2(0, -zone_size.y * 0.5)
	area.add_child(shape)
	add_child(area)


func can_interact() -> bool:
	return enabled and not done


func get_progress() -> float:
	return progress


func get_interact_point() -> Vector2:
	return global_position + Vector2(0, -8)


func get_prompt_point() -> Vector2:
	return global_position + prompt_offset


func interact_hold(_by: Node, delta: float) -> void:
	if not can_interact():
		return
	progress += delta / hold_time
	if progress >= 1.0:
		progress = 0.0
		done = not repeatable
		AudioDirector.play_at("step", global_position, -12.0, 0.2, 400.0, 1.6)
		queue_redraw()
		completed.emit(self)


func interact_release() -> void:
	progress = 0.0


func _draw() -> void:
	if done:
		return
	match kind:
		Kind.BOX:
			draw_texture(BOX_TEX, Vector2(-6, -9))
		Kind.SPILL:
			# A flat grey puddle on the floor surface.
			draw_rect(Rect2(-10, -1, 20, 1), Color8(87, 109, 109))
			draw_rect(Rect2(-7, -2, 13, 1), Color8(111, 133, 130))
			draw_rect(Rect2(-3, -1, 4, 1), Color8(142, 161, 155))
