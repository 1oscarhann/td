class_name LegTip
extends Area2D
## The "spider" that isn't. A few pixels twitching at the lip of a vent, just
## like the real spiders around it. Lit, it doesn't scatter: it slides out a
## little further (a long jointed leg, the Wedged Thing's colour) and then pulls
## back SLOWLY into the vent and is gone for good. The voice repeats "they're
## only spiders", now a lie. Every spider after this is suspicious.
##
## Creature layer + Light Only material. Root sits just under the vent.

enum State { WAITING, REVEAL, RETRACT }

@export var reveal_length := 22.0
@export var retract_time := 3.5

var state := State.WAITING
var length := 4.0
var _t := 0.0
var _lit_time := 0.0
var _hold := 0.6


func _ready() -> void:
	collision_layer = GameState.LAYER_CREATURES
	collision_mask = 0
	light_mask = GameState.LIGHT_CREATURES


func get_light_probe_points() -> Array:
	return [global_position + Vector2(0, length)]


func _physics_process(delta: float) -> void:
	_t += delta
	match state:
		State.WAITING:
			# Wait for a proper look, not a sweep.
			_lit_time = _lit_time + delta if GameState.is_lit(self) else 0.0
			if _lit_time > 0.6:
				state = State.REVEAL
				Narrator.say("only_spiders_lie")
				GameState.mark_encounter("leg", "leg", 1e9)
		State.REVEAL:
			length = move_toward(length, reveal_length, 26.0 * delta)
			if length >= reveal_length:
				_hold -= delta   # a beat fully out, then it goes
				if _hold <= 0.0:
					state = State.RETRACT
		State.RETRACT:
			length = move_toward(length, 0.0, reveal_length / retract_time * delta)
			if length <= 0.0:
				queue_free()   # gone for good
	queue_redraw()


func _draw() -> void:
	var leg := Color(0.56, 0.53, 0.50)
	var dark := Color(0.30, 0.29, 0.28)
	if state == State.WAITING:
		# Looks like a spider at the vent: a dark speck with twitching "legs".
		var w := int(_t * 7.0) % 2
		draw_rect(Rect2(-1, 1, 2, 2), dark)
		draw_rect(Rect2(-2 - w, 1 + w, 1, 1), dark)
		draw_rect(Rect2(1 + w, 1 + w, 1, 1), dark)
		draw_line(Vector2(0, 0), Vector2(0, 1), leg, 1.0)
		return
	# A long thin segment, a knee, then the tip: the real thing.
	var knee := Vector2(2, length * 0.6)
	var tip := Vector2(-1, length)
	draw_line(Vector2.ZERO, knee, leg, 1.0)
	draw_line(knee, tip, leg, 1.0)
	draw_rect(Rect2(knee - Vector2(1, 1), Vector2(2, 2)), dark)
