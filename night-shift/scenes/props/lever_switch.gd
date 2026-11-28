class_name LeverSwitch
extends Node2D
## A heavy lever on a junction box. Switches are the game's progression: this
## one opens a door. Every switch must COST something (design doc):
##   - Two hands: the torch is forced at the floor while you pull.
##   - Noise: a heavy clunk that carries a long way. The Thing hears it.
##   - Electricity: power through the walls (GameState.switch_flipped).
##     The Cables slither towards the live circuit, i.e. towards you.
## Root sits on the floor under the box.

signal flipped(switch_id: String)

const OFF_TEX := preload("res://art/props/lever_off.tres")
const ON_TEX := preload("res://art/props/lever_on.tres")

@export var switch_id := ""
@export var pull_time := 1.6
@export var noise_radius := 320.0
## Lights out (design doc): flipping it kills the working light with this id.
@export var kills_light := ""

var requires_two_hands := true
var is_on := false
var progress := 0.0
var _pulling := false


func _ready() -> void:
	var area := Area2D.new()
	area.collision_layer = GameState.LAYER_INTERACT
	area.collision_mask = GameState.LAYER_PLAYER
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(32, 44)
	shape.shape = rect
	shape.position = Vector2(0, -22)
	area.add_child(shape)
	add_child(area)
	area.body_entered.connect(_on_body_entered)
	queue_redraw()


func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player") and not is_on:
		Narrator.say("switch_is_loud")


func can_interact() -> bool:
	return not is_on


func get_progress() -> float:
	return progress


func get_interact_point() -> Vector2:
	return global_position + Vector2(0, -20)


func get_prompt_point() -> Vector2:
	return global_position + Vector2(0, -46)


func interact_hold(_by: Node, delta: float) -> void:
	if is_on:
		return
	if not _pulling:
		_pulling = true
		AudioDirector.play_at("creak", global_position, -8.0, 0.1, 500.0, 0.6)
	progress += delta / pull_time
	if progress >= 1.0:
		_flip()


func interact_release() -> void:
	_pulling = false
	progress = 0.0


func _flip() -> void:
	is_on = true
	progress = 0.0
	queue_redraw()
	AudioDirector.play_at("clunk", global_position, 4.0, 0.05, 900.0)
	GameState.make_noise(global_position, noise_radius, "switch")
	GameState.switch_flipped.emit(global_position)
	flipped.emit(switch_id)
	await get_tree().create_timer(2.0).timeout
	Narrator.say("they_heard_that")


func _draw() -> void:
	draw_texture(ON_TEX if is_on else OFF_TEX, Vector2(-8, -38))
