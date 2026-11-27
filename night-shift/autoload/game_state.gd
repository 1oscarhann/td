extends Node
## GameState (autoload).
##
## Shared run state and the small global systems everything else talks through:
##  - the noise system (noise_made), which creatures listen to
##  - light queries (is_lit / get_lit_time), forwarded to the player's torch
##  - checkpoint and zone tracking
##  - the pacing log: real creature encounters vs false alarms (scary phase 3)
## Keep it dumb: it stores and forwards, it never decides gameplay.

## Something made a sound. `radius` is how far (px) it carries.
## Creatures within the radius may react.
signal noise_made(origin: Vector2, radius: float)
## A switch sent power through the walls at `origin`. The Cables move towards it.
signal switch_flipped(origin: Vector2)
## A creature reached the player.
signal player_caught(by: Node)
## The player crossed into a new depth zone (0 = shop, 1..4 = basement zones).
signal zone_changed(zone: int)
## A REAL creature encounter happened (Pacing resets its quiet timer on this).
signal encounter(kind: String)

# --- Physics layers (bit values). Keep in sync with [layer_names] in project.godot.
const LAYER_WORLD := 1           # layer 1: tiles, panel blockers
const LAYER_PLAYER := 2          # layer 2: the player body
const LAYER_STAIR_PLATFORM := 4  # layer 3: one-way platforms at the top of stairwells
const LAYER_CREATURES := 8       # layer 4: creature areas (what the torch cone looks for)
const LAYER_INTERACT := 16       # layer 5: hold-E interaction zones
const LAYER_CLIMB := 32          # layer 6: stairwell climb areas

# --- Light masks (CanvasItem.light_mask / Light2D cull masks).
## Environment: walls, props, the player. Lit by every light.
const LIGHT_ENV := 1
## Creatures: drawn with Light Mode = Light Only. ONLY the torch includes this bit,
## so creatures exist only inside the beam. This is the core visibility rule.
const LIGHT_CREATURES := 2

## Set by the player / torch in their _ready. Untyped on purpose (duck typed) so
## this autoload doesn't depend on scene scripts.
var player = null
var torch = null

var checkpoint := Vector2.ZERO
var zone := 0
## Return trips made up to the shop (drives the CCTV man and the shop changes).
var trips := 0
## Zone 4's last stretch: the player is changing (slower, the hand looks wrong).
var changed := false
var debug := false

## Pacing log for this run: [{t, kind}] of real encounters, and a count of false
## alarms (sounds and flickers that lead to nothing).
var encounters: Array = []
var false_alarms := 0
## Dread 0..1, computed by the level's Pacing node (drone, grain, vignette...).
var tension := 0.0
var _encounter_last: Dictionary = {}   # key -> time, so one creature counts once per scare
## Game time (s) since the app started. Pacing and the encounter log use it.
var clock := 0.0

## Default bindings, used only if an action is missing from the project Input Map
## (e.g. someone wiped it). project.godot is the real source of truth.
const DEFAULT_KEYS := {
	"move_left": [KEY_A, KEY_LEFT],
	"move_right": [KEY_D, KEY_RIGHT],
	"move_up": [KEY_W, KEY_UP],
	"move_down": [KEY_S, KEY_DOWN],
	"run": [KEY_SHIFT],
	"crouch": [KEY_CTRL],
	"interact": [KEY_E],
}


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_ensure_input_actions()


func _process(delta: float) -> void:
	clock += delta


## Resets per-run state. Called by Main when a run (re)starts.
func reset_run() -> void:
	zone = 0
	trips = 0
	changed = false
	checkpoint = Vector2.ZERO
	player = null
	torch = null
	encounters.clear()
	false_alarms = 0
	tension = 0.0
	_encounter_last.clear()


## A creature just did something real (reached, grabbed, noticed you, showed
## itself). `key` identifies the creature so a single scare counts once:
## the same key within `debounce` seconds is ignored.
func mark_encounter(kind: String, key := "", debounce := 20.0) -> void:
	var now := clock
	var k := key if key != "" else kind
	if _encounter_last.has(k) and now - float(_encounter_last[k]) < debounce:
		_encounter_last[k] = now
		return
	_encounter_last[k] = now
	encounters.append({"t": now, "kind": kind})
	encounter.emit(kind)


func mark_false_alarm() -> void:
	false_alarms += 1


## Emit a noise. Running, boards and switches all go through here.
func make_noise(origin: Vector2, radius: float) -> void:
	if radius <= 0.0:
		return
	noise_made.emit(origin, radius)


## True if `node` is currently inside the torch beam with clear line of sight.
func is_lit(node: Node) -> bool:
	if torch == null or not is_instance_valid(torch):
		return false
	return torch.is_lit(node)


## Seconds `node` has been continuously lit (0 when unlit).
func get_lit_time(node: Node) -> float:
	if torch == null or not is_instance_valid(torch):
		return 0.0
	return torch.get_lit_time(node)


func set_zone(new_zone: int) -> void:
	if new_zone == zone:
		return
	zone = new_zone
	zone_changed.emit(zone)


func _ensure_input_actions() -> void:
	for action: String in DEFAULT_KEYS:
		if InputMap.has_action(action):
			continue
		InputMap.add_action(action)
		for code: int in DEFAULT_KEYS[action]:
			var ev := InputEventKey.new()
			ev.physical_keycode = code as Key
			InputMap.action_add_event(action, ev)
	if not InputMap.has_action("torch_toggle"):
		InputMap.add_action("torch_toggle")
		var mb := InputEventMouseButton.new()
		mb.button_index = MOUSE_BUTTON_LEFT
		InputMap.action_add_event("torch_toggle", mb)
