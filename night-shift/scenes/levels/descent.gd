class_name Descent
extends Node
## The descent after Act 0: return trips, the stairs that get longer, the
## sections that shouldn't connect, zone 3's lies, zone 4's climax and the end.
##
## Return trips (design doc: "between trips into the basement, the player
## sometimes comes back up, and the shop is slightly different each time"):
##   an up-stair deeper down -> you come out at the top of the storeroom stairs
##   -> the shop has changed, the CCTV man has moved -> back down the main
##   stairs (longer every time) to the basement landing, which has changed too
##   -> the door there that was sealed now stands ajar ("deeper"), onto the
##   NEXT section, not where you left. Endless is a feeling, not a system.
## Three trips (open question: 2, 3 or 4 -> 3): after zone 2, mid zone 3, end
## of zone 3. Then zone 4 and the ending.

signal ending_started

const ENDING_SCENE := "res://scenes/ending/ending.tscn"

var level            # TestLevel (duck typed to avoid a cyclic class reference)
var main_stairs: Stairs
var resume_points: Dictionary = {}   # trip -> {pos, zone, thing_pos, thing_active}
var _pending := -1                    # trip whose resume point the main stairs lead to
var _busy := false
var _max_x := 0.0
var _said_lie := false


func setup(lvl, stairs: Stairs) -> void:
	level = lvl
	main_stairs = stairs
	main_stairs.reached_bottom.connect(_on_main_bottom)


func register_upstairs(s: Stairs) -> void:
	s.exited_up.connect(_on_exited_up)


func _process(_delta: float) -> void:
	var p = GameState.player
	if p == null:
		return
	var thing: WedgedThing = level.thing
	# Zone 3 lie: "you're alone" while the Thing is right there (and unlit).
	if GameState.zone == 3 and not _said_lie and thing.state != WedgedThing.State.DORMANT \
			and thing.global_position.distance_to(p.global_position) < 170.0 and not GameState.is_lit(thing):
		_said_lie = Narrator.say("youre_alone_lie")
	# Zone 4: "don't go back" when you turn back the way you came.
	if GameState.zone == 4:
		var x: float = p.global_position.x
		_max_x = maxf(_max_x, x)
		if _max_x - x > 140.0:
			Narrator.say("dont_go_back")


# ------------------------------------------------------------------ return trips

func _on_exited_up(s: Stairs) -> void:
	if _busy or s.trip != GameState.trips + 1:
		return
	_busy = true
	var ui = level.get_tree().current_scene.get_node("UI")
	await ui.fade_to(1.0, 0.5).finished
	GameState.trips = s.trip
	var p = GameState.player
	p.stop_climbing()
	p.global_position = Vector2(main_stairs.center_x, main_stairs.top_y)
	p.velocity = Vector2.ZERO
	p.snap_camera()
	GameState.set_zone(1)
	GameState.checkpoint = p.global_position
	main_stairs.extra_loops = s.trip * 4
	_pending = s.trip
	level.thing.relocate(level.thing.global_position + Vector2(0, 0), false)
	level.apply_shop_changes(s.trip)
	await ui.fade_to(0.0, 1.2).finished
	if s.trip == 1:
		Narrator.say("you_left_the_door_open")
	_busy = false


func _on_main_bottom(_s: Stairs) -> void:
	if _pending < 0 and GameState.trips == 0:
		Narrator.say("mind_the_step")   # true, a small kindness


## Through the "deeper" door on the basement landing: it rattles (sealed)
## until a return trip has opened it, then it leads out onto that trip's section.
func can_go_deeper() -> bool:
	return not _busy and _pending >= 0 and resume_points.has(_pending)


func go_deeper() -> void:
	if not can_go_deeper():
		return
	_busy = true
	AudioDirector.play_at("creak", GameState.player.global_position, -8.0, 0.1, 420.0, 0.85)
	var r: Dictionary = resume_points[_pending]
	_pending = -1
	var ui = level.get_tree().current_scene.get_node("UI")
	await ui.fade_to(1.0, 0.35).finished
	var p = GameState.player
	p.stop_climbing()
	p.global_position = r.pos
	p.velocity = Vector2.ZERO
	p.snap_camera()
	GameState.set_zone(r.zone)
	GameState.checkpoint = r.pos
	_max_x = r.pos.x
	level.thing.relocate(r.thing_pos, r.thing_active, 5.0)
	await ui.fade_to(0.0, 0.8).finished
	if GameState.trips == 1:
		Narrator.say("how_many_stairs")
	if r.zone == 4:
		Narrator.say("its_warm")
	_busy = false


# ----------------------------------------------------------------- zone 4 beats

func on_event(event_name: String) -> void:
	var thing: WedgedThing = level.thing
	match event_name:
		"climax":
			AudioDirector.hush_drone(3.0)
			# The final chase: it comes from behind, in a space that's closing.
			# It wakes already hunting you.
			# It comes through the door behind you (never into the rock).
			var pp: Vector2 = GameState.player.global_position
			var sec: Dictionary = level.section_at(pp)
			var sx := pp.x - 260.0
			if not sec.is_empty():
				sx = maxf(sx, float(sec.x0) * 16.0 + 24.0)
			thing.relocate(Vector2(sx, pp.y), true, 0.5, true)
			thing.chase_speed *= 1.25
		"last_stretch":
			# Creatures stop chasing you. No explanation. And you start to change.
			thing.stop_chasing()
			GameState.changed = true
		"never_was":
			await level.get_tree().create_timer(5.0).timeout
			Narrator.say("there_never_was")
		"ending":
			_start_ending()


func _start_ending() -> void:
	if _busy:
		return
	_busy = true
	var p = GameState.player
	p.input_locked = true
	ending_started.emit()
	# The walls close. The last line is the first line.
	await level.get_tree().create_timer(2.5).timeout
	Narrator.say("alone_tonight_last")
	await level.get_tree().create_timer(4.0).timeout
	var ui = level.get_tree().current_scene.get_node("UI")
	ui.cut_to_black()
	AudioDirector.play_ui("caught", 0.0)
	await level.get_tree().create_timer(3.0).timeout
	level.get_tree().change_scene_to_file(ENDING_SCENE)
