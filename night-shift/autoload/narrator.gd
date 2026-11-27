extends Node
## Narrator (autoload): the voice at the bottom of the screen.
##
## The only entry point is `say(line_id)`. Lines live in data/narrator_lines.json:
##   "line_id": {
##     "text": "lowercase, no punctuation, short",
##     "priority": 0-3,   # >= QUEUE_MIN_PRIORITY waits in a queue when the voice is busy
##     "once": true,      # rule 16: never repeat in one playthrough (default true)
##     "min_gap": 20,     # optional: override the global cooldown for this line
##     "max_wait": 12     # optional: seconds it may sit in the queue before going stale
##   }
##
## Rules enforced here (see design doc, "Bottom text"):
##  - rare: one global cooldown, never two lines within `global_cooldown` seconds
##  - no repeats: a played set, cleared only when a new playthrough starts
##  - busy handling: low-priority lines are dropped, important ones queue briefly
## Display is delegated to the BottomText label, which registers itself.

signal line_started(id: String, text: String)
signal line_finished(id: String)

const LINES_PATH := "res://data/narrator_lines.json"
## Lines with at least this priority queue up instead of being dropped.
const QUEUE_MIN_PRIORITY := 2
const DEFAULT_MAX_WAIT := 12.0

## Rule 11: never two lines within this many seconds.
var global_cooldown := 20.0

var _lines: Dictionary = {}
var _played: Dictionary = {}
var _queue: Array = []          # [{id, priority, expires}], highest priority first
var _last_start := -1000.0
var _busy := false
var _current := ""
var _display = null             # BottomText (duck typed: show_line(), line_done)


func _ready() -> void:
	_load_lines()


# --------------------------------------------------------------------------- API

## Ask the voice to say a line. Returns true if it started speaking right now.
func say(id: String) -> bool:
	if not _lines.has(id):
		push_warning("Narrator: unknown line '%s'" % id)
		return false
	var line: Dictionary = _lines[id]
	if bool(line.get("once", true)) and _played.has(id):
		return false
	if id == _current or _is_queued(id):
		return false
	if _can_speak(line):
		_speak(id)
		return true
	var priority := int(line.get("priority", 1))
	if priority >= QUEUE_MIN_PRIORITY:
		_queue.append({
			"id": id,
			"priority": priority,
			"expires": _now() + float(line.get("max_wait", DEFAULT_MAX_WAIT)),
		})
		_queue.sort_custom(func(a, b): return a.priority > b.priority)
	return false


func has_played(id: String) -> bool:
	return _played.has(id)


func is_speaking() -> bool:
	return _busy


## Seconds until the global cooldown allows another line (debug overlay).
func cooldown_left() -> float:
	return maxf(0.0, global_cooldown - (_now() - _last_start))


## Called by BottomText when it enters the tree.
func register_display(display) -> void:
	# A new screen (scene change) mid-line: the old display is gone, so the
	# line it was showing will never report done. Don't stay busy forever.
	_busy = false
	_current = ""
	_display = display
	if not display.line_done.is_connected(_on_line_done):
		display.line_done.connect(_on_line_done)


## New playthrough: forget everything that was said.
func reset() -> void:
	_played.clear()
	_queue.clear()
	_busy = false
	_current = ""
	_last_start = -1000.0


# ---------------------------------------------------------------------- internals

func _process(_delta: float) -> void:
	if _busy or _queue.is_empty():
		return
	var now := _now()
	for i in range(_queue.size() - 1, -1, -1):
		if float(_queue[i].expires) < now:
			_queue.remove_at(i)
	for i in _queue.size():
		var id: String = _queue[i].id
		if _can_speak(_lines[id]):
			_queue.remove_at(i)
			_speak(id)
			return


func _can_speak(line: Dictionary) -> bool:
	if _busy:
		return false
	var gap := float(line.get("min_gap", global_cooldown))
	return _now() - _last_start >= gap


func _speak(id: String) -> void:
	_played[id] = true
	_busy = true
	_current = id
	_last_start = _now()
	var text: String = _lines[id].text
	line_started.emit(id, text)
	if _display != null and is_instance_valid(_display):
		_display.show_line(text, _glitch_amount())
	else:
		# No BottomText in the scene (e.g. running a test scene): log it instead.
		print("[narrator] ", text)
		get_tree().create_timer(3.0).timeout.connect(_on_line_done)


func _on_line_done() -> void:
	var id := _current
	_busy = false
	_current = ""
	line_finished.emit(id)


func _is_queued(id: String) -> bool:
	for q in _queue:
		if q.id == id:
			return true
	return false


## Later zones: the text starts to glitch (a letter swaps, then swaps back).
func _glitch_amount() -> float:
	if GameState.zone >= 4:
		return 0.6
	if GameState.zone == 3:
		return 0.25
	return 0.0


func _now() -> float:
	return Time.get_ticks_msec() / 1000.0


func _load_lines() -> void:
	if not FileAccess.file_exists(LINES_PATH):
		push_error("Narrator: missing %s" % LINES_PATH)
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(LINES_PATH))
	if parsed is Dictionary:
		_lines = parsed
	else:
		push_error("Narrator: %s is not a JSON object" % LINES_PATH)
