class_name LevelTrigger
extends Area2D
## Invisible trigger volume. When the player walks in it can, in order:
##   - set the checkpoint (respawn point = this trigger's position)
##   - change the depth zone (palette / ambience / narrator behaviour)
##   - ask the Narrator to say a line (scripted bottom-text trigger)
##   - emit `triggered` with an event name the level script listens for
## The root sits on the floor; the volume extends upwards by `size.y`.

signal triggered(trigger: LevelTrigger)

@export var line_id := ""
@export var event_name := ""
@export var sets_checkpoint := false
## -1 = don't change the zone.
@export var zone := -1
@export var one_shot := true
## Disarmed triggers ignore the player until arm() (e.g. lines that only make
## sense after the power cut).
@export var armed := true
@export var size := Vector2(16, 64)

var _fired := false


func _ready() -> void:
	collision_layer = 0
	collision_mask = GameState.LAYER_PLAYER
	monitorable = false
	var shape := RectangleShape2D.new()
	shape.size = size
	$Shape.shape = shape
	$Shape.position = Vector2(0, -size.y * 0.5)
	body_entered.connect(_on_body_entered)


func rearm() -> void:
	_fired = false


func arm() -> void:
	armed = true
	# Already standing in it? Fire now rather than waiting for a re-entry.
	for body in get_overlapping_bodies():
		_on_body_entered(body)


func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return
	if not armed or (_fired and one_shot):
		return
	_fired = true
	if sets_checkpoint:
		GameState.checkpoint = global_position
	if zone >= 0:
		GameState.set_zone(zone)
	if line_id != "":
		Narrator.say(line_id)
	triggered.emit(self)
