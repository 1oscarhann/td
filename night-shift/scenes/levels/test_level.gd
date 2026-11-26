extends Node2D
## Test level (milestone 1): storeroom -> boarded panel -> stairs -> one tunnel.
##
## The layout is ASCII so it can be tweaked in a text editor without a tile
## editor. Each character is one 16x16 tile:
##
##   #  concrete (solid)          .  concrete back wall (open space)
##   %  brick (solid)             ,  brick back wall (open space)
##
## Markers sit on open space; their background copies the tile to their left.
##   P  player start               B  boarded panel (bottom cell of a 1x2 opening)
##   H  stairs (top-left, on the landing; the shaft below it is the stairwell)
##   W  Wedged Thing spawn         S  shelf of crisps (identical everywhere)
##   D  door back to the shop      F  FUSE BOX sign       f  a wrong FUSE BOX sign
##   1-9  triggers, configured in TRIGGERS below
##
## Section by section (left to right, top to bottom):
##   storeroom (dead, power's out) -> panel -> landing -> stairwell down ->
##   tunnel: left dead end (the Thing sleeps there, next to a familiar shelf),
##   a tight 2-tile tunnel (it's slow here), an open 8-tile room (it's FAST here),
##   a 1-tile crouch gap (it can't fit), and a dead end where the sign points
##   into the wall.

signal ending_reached

const TILE := 16

const MAP := [
	"############################################################################################################",
	"############################################################################################################",
	"#............................###############################################################################",
	"#............................#......########################################################################",
	"#............................#......########################################################################",
	"#...................................########################################################################",
	"#.D.P....S.....S.....S.....1.B..H...########################################################################",
	"################################..##########################################################################",
	"################################..##########################################################################",
	"################################..##########################################################################",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%,,,,,,,,,,,,%%%",
	"%%%%%%,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%%%,,,,,,,,,,,,%%%",
	"%%%%%%,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,F,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,F,,,,,,,,,,,,,,,,,,,,,%%%,,,,,,,,,,f,%%%",
	"%%%%%%,,,,S,,,W,,,,,,,,,,,,,,,,,,,,,2,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,3,,,,,,,,,4,,,,5,,,%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
]

## Trigger markers -> LevelTrigger settings.
const TRIGGERS := {
	"1": {"line": "fuse_box_downstairs"},
	"2": {"line": "follow_the_signs", "checkpoint": true, "zone": 2, "event": "wake_thing"},
	"3": {"line": "stay_low"},
	"4": {"line": "doing_so_well", "checkpoint": true},
	"5": {"line": "further_than_that", "event": "end"},
}

## CanvasModulate per zone. Dim but readable: the environment is never pure black.
const ZONE_DARKNESS := {
	0: Color(0.34, 0.35, 0.48),   # shop after the power cut: near-black blues
	1: Color(0.40, 0.38, 0.33),   # storage cellar: grey, dirty yellow
	2: Color(0.33, 0.38, 0.46),   # service tunnels: cold grey-blue
}
## Ambience hum volume (dB) and World-bus reverb [room_size, wet] per zone.
const ZONE_HUM_DB := {0: -80.0, 1: -32.0, 2: -26.0}
const ZONE_REVERB := {0: [0.25, 0.08], 1: [0.45, 0.15], 2: [0.75, 0.28]}

const PANEL_SCENE := preload("res://scenes/props/boarded_panel.tscn")
const STAIRS_SCENE := preload("res://scenes/props/stairs.tscn")
const TRIGGER_SCENE := preload("res://scenes/props/level_trigger.tscn")
const SHELF_SCENE := preload("res://scenes/props/shelf.tscn")
const SIGN_SCENE := preload("res://scenes/props/fuse_sign.tscn")
const DOOR_SCENE := preload("res://scenes/props/shop_door.tscn")
const THING_SCENE := preload("res://scenes/creatures/wedged_thing.tscn")

var player_start := Vector2.ZERO
var thing: WedgedThing
var panel: BoardedPanel
var size_tiles := Vector2i.ZERO

var _drip_timer := 3.0

@onready var darkness: CanvasModulate = $Darkness
@onready var back_wall: TileMapLayer = $BackWall
@onready var walls: TileMapLayer = $Walls
@onready var props: Node2D = $Props
@onready var triggers: Node2D = $Triggers
@onready var creatures: Node2D = $Creatures
@onready var ambience: AudioStreamPlayer = $Ambience


func _ready() -> void:
	var tile_set := TileSetBuilder.build()
	back_wall.tile_set = tile_set
	walls.tile_set = tile_set
	_build()
	ambience.stream = AudioDirector.get_stream("hum")
	ambience.volume_db = -80.0
	ambience.play()
	GameState.zone_changed.connect(_apply_zone)
	_apply_zone(GameState.zone, true)


func _process(delta: float) -> void:
	# Random drips somewhere in the dark around you, underground only.
	if GameState.zone < 1 or GameState.player == null:
		return
	_drip_timer -= delta
	if _drip_timer <= 0.0:
		_drip_timer = randf_range(2.5, 7.0)
		var p: Vector2 = GameState.player.global_position
		AudioDirector.play_at("drip", p + Vector2(randf_range(-220, 220), randf_range(-40, 0)), -15.0, 0.15)


func apply_camera_limits(cam: Camera2D) -> void:
	cam.limit_left = 0
	cam.limit_top = 0
	cam.limit_right = size_tiles.x * TILE
	cam.limit_bottom = size_tiles.y * TILE


## After the player is caught: creatures go back to where they started.
func reset_creatures() -> void:
	if thing != null:
		thing.reset()


# -------------------------------------------------------------------- building

func _build() -> void:
	var width := 0
	for row: String in MAP:
		width = maxi(width, row.length())
	size_tiles = Vector2i(width, MAP.size())

	for y in MAP.size():
		var row: String = MAP[y]
		for x in width:
			var ch := row[x] if x < row.length() else "#"
			var cell := Vector2i(x, y)
			match ch:
				"#", "%":
					walls.set_cell(cell, 0, Vector2i(_solid_tile_for(x, y), 0))
				".":
					back_wall.set_cell(cell, 0, Vector2i(TileSetBuilder.BACK_CONCRETE, 0))
				",":
					back_wall.set_cell(cell, 0, Vector2i(TileSetBuilder.BACK_BRICK, 0))
				_:
					back_wall.set_cell(cell, 0, Vector2i(_background_for(row, x), 0))
					_place_marker(ch, cell)
	_fill_margin(width)


## Solid rock around the map, so the camera never shows the void past the edge.
func _fill_margin(width: int) -> void:
	const MARGIN := 10
	for y in range(-MARGIN, MAP.size() + MARGIN):
		for x in range(-MARGIN, width + MARGIN):
			if y >= 0 and y < MAP.size() and x >= 0 and x < width:
				continue
			walls.set_cell(Vector2i(x, y), 0, Vector2i(TileSetBuilder.ROCK, 0))


## Which solid tile a cell gets, from its open neighbours:
## open above = floor, open below = ceiling, open beside = side wall, else rock.
func _solid_tile_for(x: int, y: int) -> int:
	if _is_open(x, y - 1):
		return TileSetBuilder.FLOOR
	if _is_open(x, y + 1):
		return TileSetBuilder.CEILING
	if _is_open(x - 1, y) or _is_open(x + 1, y):
		return TileSetBuilder.SIDE
	return TileSetBuilder.ROCK


func _is_open(x: int, y: int) -> bool:
	if y < 0 or y >= MAP.size():
		return false
	var row: String = MAP[y]
	if x < 0 or x >= row.length():
		return false
	return row[x] != "#" and row[x] != "%"


## Markers take the back-wall tile of the nearest open tile to their left.
func _background_for(row: String, x: int) -> int:
	for i in range(x - 1, -1, -1):
		if row[i] == ",":
			return TileSetBuilder.BACK_BRICK
		if row[i] == ".":
			return TileSetBuilder.BACK_CONCRETE
	return TileSetBuilder.BACK_CONCRETE


func _place_marker(ch: String, cell: Vector2i) -> void:
	var floor_point := Vector2(cell.x * TILE + TILE * 0.5, (cell.y + 1) * TILE)
	var centre := Vector2(cell.x * TILE + TILE * 0.5, cell.y * TILE + TILE * 0.5)
	match ch:
		"P":
			player_start = floor_point
		"B":
			panel = PANEL_SCENE.instantiate()
			panel.position = Vector2(cell.x * TILE, (cell.y + 1) * TILE)
			panel.board_ripped.connect(_on_board_ripped)
			props.add_child(panel)
		"H":
			var stairs: Stairs = STAIRS_SCENE.instantiate()
			stairs.position = Vector2(cell.x * TILE, (cell.y + 1) * TILE)
			stairs.width = TILE * 2
			stairs.height = _open_rows_below(cell) * TILE
			props.add_child(stairs)
		"W":
			thing = THING_SCENE.instantiate()
			thing.position = floor_point
			creatures.add_child(thing)
		"S":
			var shelf: Node2D = SHELF_SCENE.instantiate()
			shelf.position = floor_point
			props.add_child(shelf)
		"D":
			var door: Node2D = DOOR_SCENE.instantiate()
			door.position = floor_point
			props.add_child(door)
		"F", "f":
			var sign_node: Node2D = SIGN_SCENE.instantiate()
			sign_node.position = centre
			sign_node.set("wrong", ch == "f")
			props.add_child(sign_node)
		_:
			if TRIGGERS.has(ch):
				_place_trigger(TRIGGERS[ch], floor_point)
			else:
				push_warning("TestLevel: unknown map marker '%s' at %s" % [ch, cell])


func _place_trigger(cfg: Dictionary, at: Vector2) -> void:
	var t: LevelTrigger = TRIGGER_SCENE.instantiate()
	t.position = at
	t.line_id = cfg.get("line", "")
	t.event_name = cfg.get("event", "")
	t.sets_checkpoint = cfg.get("checkpoint", false)
	t.zone = cfg.get("zone", -1)
	t.triggered.connect(_on_trigger)
	triggers.add_child(t)


## Counts open (non-solid) tiles straight down from below the given cell.
func _open_rows_below(cell: Vector2i) -> int:
	var n := 0
	var y := cell.y + 1
	while y < MAP.size():
		var row: String = MAP[y]
		var ch := row[cell.x] if cell.x < row.length() else "#"
		if ch == "#" or ch == "%":
			break
		n += 1
		y += 1
	return n


# ---------------------------------------------------------------------- events

func _on_trigger(t: LevelTrigger) -> void:
	match t.event_name:
		"wake_thing":
			if thing != null:
				thing.activate()
		"end":
			ending_reached.emit()


func _on_board_ripped(remaining: int) -> void:
	if remaining == panel.board_count - 1:
		Narrator.say("its_fine")
	elif remaining == 0:
		Narrator.say("dont_worry_boards")


func _apply_zone(zone: int, instant := false) -> void:
	var dark: Color = ZONE_DARKNESS.get(zone, ZONE_DARKNESS[2])
	var hum: float = ZONE_HUM_DB.get(zone, -26.0)
	var verb: Array = ZONE_REVERB.get(zone, ZONE_REVERB[2])
	AudioDirector.set_reverb(verb[0], verb[1])
	if instant:
		darkness.color = dark
		ambience.volume_db = hum
		return
	var tw := create_tween().set_parallel()
	tw.tween_property(darkness, "color", dark, 2.5)
	tw.tween_property(ambience, "volume_db", hum, 4.0)
