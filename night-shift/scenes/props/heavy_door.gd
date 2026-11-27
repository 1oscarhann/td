class_name HeavyDoor
extends Node2D
## A heavy service door that blocks a tunnel until a switch powers it. It grinds
## up into the ceiling and stays open. Blocks movement AND light while shut.
## Root sits on the floor; `height` is the floor-to-ceiling gap it fills.

const TEX := preload("res://art/props/heavy_door.tres")

@export var door_id := ""
@export var height := 64.0
@export var open_time := 1.6
## Timed doors (design doc): once powered, stay open this long, then grind shut.
## 0 = stays open.
@export var open_seconds := 0.0

var is_open := false
var _lift := 0.0
var _body: StaticBody2D
var _shape: CollisionShape2D
var _occluder: LightOccluder2D


func _ready() -> void:
	_body = StaticBody2D.new()
	_body.collision_layer = GameState.LAYER_WORLD
	_body.collision_mask = 0
	_shape = CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(12, height)
	_shape.shape = rect
	_shape.position = Vector2(0, -height * 0.5)
	_body.add_child(_shape)
	add_child(_body)
	_occluder = LightOccluder2D.new()
	var occ := OccluderPolygon2D.new()
	occ.polygon = PackedVector2Array([Vector2(-6, -height), Vector2(6, -height), Vector2(6, 0), Vector2(-6, 0)])
	_occluder.occluder = occ
	add_child(_occluder)
	queue_redraw()


func open() -> void:
	if is_open:
		return
	is_open = true
	AudioDirector.play_at("creak", global_position + Vector2(0, -height * 0.5), 0.0, 0.0, 700.0, 0.35)
	var tw := create_tween()
	tw.tween_property(self, "_lift", height - 8.0, open_time).set_trans(Tween.TRANS_SINE)
	tw.parallel().tween_method(func(_v): queue_redraw(), 0.0, 1.0, open_time)
	await get_tree().create_timer(open_time * 0.4).timeout
	_shape.set_deferred("disabled", true)
	_occluder.visible = false
	var occ_poly := _occluder.occluder
	_occluder.occluder = null
	if open_seconds > 0.0:
		await get_tree().create_timer(open_seconds).timeout
		# Don't shut on someone standing in the doorway: wait until it's clear.
		while GameState.player != null and absf(GameState.player.global_position.x - global_position.x) < 12.0:
			await get_tree().create_timer(0.2).timeout
		AudioDirector.play_at("creak", global_position + Vector2(0, -height * 0.5), 0.0, 0.0, 700.0, 0.3)
		var shut := create_tween()
		shut.tween_property(self, "_lift", 0.0, 0.5).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		shut.parallel().tween_method(func(_v): queue_redraw(), 0.0, 1.0, 0.5)
		await shut.finished
		AudioDirector.play_at("clunk", global_position, 2.0, 0.0, 800.0)
		_shape.set_deferred("disabled", false)
		_occluder.occluder = occ_poly
		_occluder.visible = true
		is_open = false


func _draw() -> void:
	# The slab slides up into the ceiling; only the bottom 8 px stay visible.
	var visible_h := height - _lift
	var src := Rect2(0, _lift * TEX.get_height() / height, TEX.get_width(), visible_h * TEX.get_height() / height)
	draw_texture_rect_region(TEX, Rect2(-7, -height, 14, visible_h), src)
