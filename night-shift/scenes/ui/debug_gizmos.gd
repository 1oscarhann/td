extends Node2D
## F3 world gizmos for the Wedged Thing, drawn over everything, visible in the
## dark:
##   cyan circle    hearing: it hears you if you're inside (it's the radius of
##                  how you're moving right now: still, crouch, walk, run)
##   yellow circle  sight: torch on = it sees you this far; in the dark only
##                  while it hunts (and only this close)
##   red line       it can see you right now
##   orange X       where it last had you (while it knows or is searching)

const HEAR := Color(0.35, 0.85, 1.0, 0.85)
const SIGHT := Color(1.0, 0.9, 0.3, 0.85)
const SEEN := Color(1.0, 0.25, 0.2, 0.95)
const LAST := Color(1.0, 0.6, 0.15, 0.95)

var level: Node = null


func _ready() -> void:
	z_as_relative = false
	z_index = 100
	var m := CanvasItemMaterial.new()
	m.light_mode = CanvasItemMaterial.LIGHT_MODE_UNSHADED
	material = m


func _process(_delta: float) -> void:
	visible = GameState.debug
	if visible:
		queue_redraw()


func _draw() -> void:
	if level == null or level.thing == null or not is_instance_valid(level.thing):
		return
	var thing: WedgedThing = level.thing
	var info: Dictionary = thing.debug_info()
	var font := ThemeDB.fallback_font
	var ear := to_local(thing.global_position + Vector2(0, -20))
	var eye := to_local(info.eye as Vector2)
	var hearing: float = info.hearing
	var sight: float = info.sight
	if hearing > 0.0:
		draw_arc(ear, hearing, 0.0, TAU, 96, HEAR, 1.0)
		draw_string(font, ear + Vector2(hearing + 2.0, 0), "hear %d" % int(hearing), HORIZONTAL_ALIGNMENT_LEFT, -1, 8, HEAR)
	if sight > 0.0:
		draw_arc(eye, sight, 0.0, TAU, 128, SIGHT, 1.0)
		draw_string(font, eye + Vector2(-sight - 2.0, -2.0), "see %d" % int(sight), HORIZONTAL_ALIGNMENT_RIGHT, -1, 8, SIGHT)
	var p = GameState.player
	if bool(info.can_see) and p != null:
		draw_line(eye, to_local(p.global_position + Vector2(0, -24)), SEEN, 1.0)
	if int(info.knows_level) >= 1:
		var lk := to_local(info.last_known as Vector2) + Vector2(0, -12)
		draw_line(lk + Vector2(-4, -4), lk + Vector2(4, 4), LAST, 1.0)
		draw_line(lk + Vector2(-4, 4), lk + Vector2(4, -4), LAST, 1.0)
		draw_string(font, lk + Vector2(-20, -7), "last known", HORIZONTAL_ALIGNMENT_LEFT, -1, 8, LAST)
