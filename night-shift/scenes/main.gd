extends Node2D
## Main: wires the level, the player and the UI together, and runs the
## death / respawn and ending sequences.
##
## Death (open question in the doc): checkpoint restart. Cut to black the
## instant it has you, the caught sting, then two full seconds of total silence
## in the black. No gore. Back at the last checkpoint, creatures reset.

const START_LINE_DELAY := 0.8
## The sting plays out over the black, then this much silence.
const DEATH_STING_TIME := 2.2
const DEATH_SILENCE := 2.0

@onready var level = $Level
@onready var player: Player = $Player
@onready var ui = $UI

var _dying := false


func _ready() -> void:
	GameState.reset_run()
	Narrator.reset()
	# The level read GameState.zone in its own _ready (before this reset), so
	# re-apply: matters when the ending reloads the scene from a deeper zone.
	level._apply_zone(GameState.zone, true)
	GameState.player = player
	GameState.torch = player.torch
	player.global_position = level.player_start
	GameState.checkpoint = level.player_start
	level.apply_camera_limits(player.camera)
	player.snap_camera()
	# Act 0: the torch is under the counter until the power goes.
	player.torch.set_available(false)
	# The CCTV figure lives on visibility layer 2: only the CCTV feeds draw it.
	get_viewport().set_canvas_cull_mask_bit(1, false)
	var cctv: CCTVView = ui.get_node("CCTV")
	cctv.setup(level.cctv_feeds())
	cctv.closed.connect(func(n: int):
		if n == 1:
			Narrator.say("see"))
	GameState.player_caught.connect(_on_player_caught)
	level.ending_reached.connect(_on_ending_reached)

	ui.fade_to(0.0, 2.0)
	await get_tree().create_timer(START_LINE_DELAY).timeout
	Narrator.say("alone_tonight")


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key != null and key.pressed and not key.echo:
		if key.keycode == KEY_F3:
			GameState.debug = not GameState.debug
			ui.set_debug(GameState.debug)


func _process(_delta: float) -> void:
	if GameState.debug:
		ui.set_debug(true, _debug_text())


func _on_player_caught(_by: Node) -> void:
	if _dying:
		return
	_dying = true
	player.input_locked = true
	ui.cut_to_black()
	AudioDirector.set_world_silent(true)
	AudioDirector.play_ui("caught", -4.0)
	await get_tree().create_timer(DEATH_STING_TIME + DEATH_SILENCE).timeout
	player.respawn(GameState.checkpoint)
	level.reset_creatures()
	await get_tree().create_timer(0.4).timeout
	AudioDirector.set_world_silent(false)
	ui.fade_to(0.0, 1.5)
	player.input_locked = false
	_dying = false


## End of the slice. The basement doesn't stop: it just goes dark.
func _on_ending_reached() -> void:
	await get_tree().create_timer(6.0).timeout
	player.input_locked = true
	await ui.fade_to(1.0, 3.0).finished
	ui.show_card("night shift\n\nvertical slice")
	await get_tree().create_timer(6.0).timeout
	get_tree().reload_current_scene()


func _debug_text() -> String:
	var lines := PackedStringArray()
	lines.append("fps %d  zone %d  stamina %.1f%s" % [Engine.get_frames_per_second(), GameState.zone,
			player.stamina, " EXHAUSTED" if player.exhausted else ""])
	lines.append("torch %s  narrator cd %.0fs" % ["on" if player.torch.is_on else "off",
			Narrator.cooldown_left()])
	var thing: WedgedThing = level.thing
	if thing != null:
		lines.append("thing %s  lit %s %.1fs  dist %d" % [thing.debug_text(),
				GameState.is_lit(thing), GameState.get_lit_time(thing),
				int(thing.global_position.distance_to(player.global_position))])
	return "\n".join(lines)
