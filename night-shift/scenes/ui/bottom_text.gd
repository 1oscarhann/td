class_name BottomText
extends Label
## The bottom-of-screen voice, as seen. Narrator decides WHAT and WHEN; this
## decides HOW:
##  - types out letter by letter at an uneven speed, with occasional longer
##    pauses mid-line
##  - very faint static hiss while typing, no typewriter beeps
##  - holds 2-4 s, then fades out over ~1 s (never vanishes instantly)
##  - very rarely stays on screen far too long, after you've moved on
##  - later zones: one-frame glitches (a letter swaps, then swaps back)

signal line_done

@export_range(0.0, 1.0) var base_opacity := 0.85
@export var char_delay_min := 0.035
@export var char_delay_max := 0.09
## Chance of a longer pause at a space.
@export_range(0.0, 1.0) var pause_chance := 0.25
@export var fade_time := 1.0
## Chance a line lingers for `linger_time` instead of the normal hold.
@export_range(0.0, 1.0) var linger_chance := 0.03
@export var linger_time := 9.0

var _hiss: AudioStreamPlayer
var _run := 0


func _ready() -> void:
	text = ""
	modulate.a = 0.0
	_hiss = AudioStreamPlayer.new()
	_hiss.stream = AudioDirector.get_stream("hiss")
	_hiss.volume_db = -30.0
	add_child(_hiss)
	Narrator.register_display(self)


func show_line(line: String, glitch := 0.0) -> void:
	_run += 1
	var run := _run
	text = line
	visible_characters = 0
	modulate.a = base_opacity
	_hiss.play()

	# Type it out, unevenly.
	for i in line.length():
		visible_characters = i + 1
		var delay := randf_range(char_delay_min, char_delay_max)
		if line[i] == " " and randf() < pause_chance:
			delay += randf_range(0.2, 0.45)
		elif randf() < 0.03:
			delay += randf_range(0.12, 0.25)
		await get_tree().create_timer(delay).timeout
		if run != _run:
			return
	_hiss.stop()

	# Hold. Glitch now and then in later zones.
	var hold := clampf(1.5 + line.length() * 0.08, 2.0, 4.0)
	if randf() < linger_chance:
		hold = linger_time
	var held := 0.0
	while held < hold:
		if glitch > 0.0 and randf() < glitch * 0.08:
			var idx := randi() % line.length()
			if line[idx] != " ":
				text = line.substr(0, idx) + char(randi_range(97, 122)) + line.substr(idx + 1)
				await get_tree().process_frame
				text = line
		await get_tree().create_timer(0.1).timeout
		if run != _run:
			return
		held += 0.1

	# Fade, never vanish.
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 0.0, fade_time)
	await tw.finished
	if run == _run:
		line_done.emit()
