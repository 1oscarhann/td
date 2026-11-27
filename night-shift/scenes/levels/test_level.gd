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
##   D  shop front door + EXIT     F  FUSE BOX sign       f  a wrong FUSE BOX sign
##   K  crisps shelf + "stack the shelf" job      R  drinks fridge + "check it" job
##   M  mop, bucket and the spill job             C  counter, till, CCTV (+ the torch)
##   X  breaker box (does nothing)
## The CCTV figure stands left of the front door D (only ever seen on camera).
##   1-9  triggers, configured in TRIGGERS below
##
## Section by section (left to right, top to bottom):
##   shop (Act 0: lights on, jobs, then the power cut) -> doorway ->
##   storeroom (strip lights long dead) -> panel -> landing -> stairwell down ->
##   tunnel: left dead end (the Thing sleeps there, next to a familiar shelf),
##   a tight 2-tile tunnel (it's slow here), an open 8-tile room (it's FAST here),
##   a 1-tile crouch gap (it can't fit), and a dead end where the sign points
##   into the wall.

signal ending_reached

const TILE := 16

const MAP := [
	"######################################################################################################################################",
	"######################################################################################################################################",
	"#........................##............................###############################################################################",
	"#........................##............................#......########################################################################",
	"#......................................................#......########################################################################",
	"#.............................................................########################################################################",
	"#.D...P...6K...R..M9.C.7....X8.....S.....S.....S.....1.B..H...########################################################################",
	"##########################################################..##########################################################################",
	"##########################################################..##########################################################################",
	"##########################################################..##########################################################################",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%,,,,,,,,,,,,%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%%%,,,,,,,,,,,,%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,F,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,F,,,,,,,,,,,,,,,,,,,,,%%%,,,,,,,,,,f,%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%,,,,S,,,W,,,,,,,,,,,,,,,,,,,,,2,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,3,,,,,,,,,4,,,,5,,,%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
	"%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
]

## Trigger markers -> LevelTrigger settings.
const TRIGGERS := {
	"1": {"line": "fuse_box_downstairs", "after_power": true},
	"2": {"line": "follow_the_signs", "checkpoint": true, "zone": 2, "event": "wake_thing"},
	"3": {"line": "stay_low"},
	"4": {"line": "doing_so_well", "checkpoint": true},
	"5": {"line": "further_than_that", "event": "end"},
	"6": {"line": "crisps_left"},
	# Shop <-> storeroom doorway: zone 0 is the shop, zone 1 the back room.
	"7": {"zone": 0, "repeat": true},
	"8": {"zone": 1, "repeat": true},
	"9": {"line": "check_cameras"},
}

## Set dressing (Phase 3): things the torch finds as you sweep it around.
## "cell" is any open cell inside the room; ceiling/floor heights come from the map.
##   tube / vent:  hung from the ceiling above "cell" (dead strip lights, ducts)
##   light:        a working fluorescent tube (dies in the power cut)
##   window:       the shop window onto the forecourt
##   pipe / cable: a run from "cell" to column "to_x", placed "below_ceiling" px
##                 under the ceiling or "above_floor" px over the floor
##   spiders:      "count" little spiders crawling on the ceiling around "cell"
##   arm:          a Ceiling Arm living in the vent above "cell" (place a vent too)
## Cables are REAL here (scenery). The creature version reuses cable.tscn later.
const DECOR := [
	# Shop (Act 0): fluorescent tubes that work until the power cut, the window.
	{"type": "light", "cell": Vector2i(5, 4)},
	{"type": "light", "cell": Vector2i(12, 4)},
	{"type": "light", "cell": Vector2i(19, 4)},
	{"type": "window", "cell": Vector2i(6, 4)},
	# Storeroom: dead strip lights, vents, a pipe and a cable along the back wall.
	{"type": "tube", "cell": Vector2i(33, 4)},
	{"type": "tube", "cell": Vector2i(44, 4)},
	{"type": "vent", "cell": Vector2i(38, 4)},
	{"type": "vent", "cell": Vector2i(50, 4)},
	{"type": "pipe", "cell": Vector2i(27, 4), "to_x": 55, "below_ceiling": 6},
	{"type": "cable", "cell": Vector2i(42, 4), "to_x": 53, "below_ceiling": 16, "sag": 7},
	# Tunnel start: pipe run past the stairwell, a sagging cable, a dead light.
	{"type": "pipe", "cell": Vector2i(32, 16), "to_x": 67, "below_ceiling": 3},
	{"type": "cable", "cell": Vector2i(46, 16), "to_x": 57, "below_ceiling": 12, "sag": 6},
	{"type": "tube", "cell": Vector2i(52, 16)},
	# First Ceiling Arm: over ground you never need to cross (left of the stairs).
	# You see it reach down where you would have walked; light it, it pulls back.
	{"type": "vent", "cell": Vector2i(48, 16)},
	{"type": "arm", "cell": Vector2i(48, 16)},
	# First spiders: right where you step off the stairs. Harmless; teach "look up".
	{"type": "vent", "cell": Vector2i(61, 16)},
	{"type": "spiders", "cell": Vector2i(61, 16), "count": 3},
	# Tight tunnel: a vent right above your head.
	{"type": "pipe", "cell": Vector2i(67, 17), "to_x": 85, "below_ceiling": 2},
	{"type": "vent", "cell": Vector2i(73, 17)},
	{"type": "spiders", "cell": Vector2i(73, 17), "count": 2},
	# Open room: high things you only find by looking up.
	{"type": "tube", "cell": Vector2i(89, 12)},
	{"type": "vent", "cell": Vector2i(96, 12)},
	{"type": "spiders", "cell": Vector2i(96, 12), "count": 3},
	{"type": "tube", "cell": Vector2i(101, 12)},
	{"type": "pipe", "cell": Vector2i(85, 14), "to_x": 105, "above_floor": 44},
	{"type": "cable", "cell": Vector2i(86, 12), "to_x": 103, "below_ceiling": 26, "sag": 14},
	# Passage, past the crouch gap, the dead end.
	{"type": "cable", "cell": Vector2i(106, 16), "to_x": 115, "below_ceiling": 9, "sag": 4},
	# The real one: in the passage before the crouch gap, on the chase route.
	{"type": "vent", "cell": Vector2i(110, 16)},
	{"type": "arm", "cell": Vector2i(110, 16)},
	{"type": "vent", "cell": Vector2i(124, 16)},
	{"type": "spiders", "cell": Vector2i(124, 16), "count": 2},
	{"type": "tube", "cell": Vector2i(127, 16)},
]

## Shop with the power on: flat, harsh fluorescent. The boredom is the point.
const POWER_ON_SHOP := Color(0.86, 0.94, 0.84)

## CanvasModulate per zone. Dim but readable: the environment is never pure black.
const ZONE_DARKNESS := {
	0: Color(0.40, 0.41, 0.54),   # shop after the power cut: near-black blues
	1: Color(0.40, 0.40, 0.46),   # back room / storeroom: lights long dead
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
const VENT_SCENE := preload("res://scenes/props/vent.tscn")
const TUBE_SCENE := preload("res://scenes/props/tube.tscn")
const PIPE_SCENE := preload("res://scenes/props/pipe.tscn")
const CABLE_SCENE := preload("res://scenes/props/cable.tscn")
const SPIDER_SCENE := preload("res://scenes/creatures/spider.tscn")
const ARM_SCENE := preload("res://scenes/creatures/ceiling_arm.tscn")
const LIGHT_SCENE := preload("res://scenes/props/shop_light.tscn")
const WINDOW_SCENE := preload("res://scenes/props/shop_window.tscn")
const FRIDGE_SCENE := preload("res://scenes/props/fridge.tscn")
const COUNTER_SCENE := preload("res://scenes/props/counter.tscn")
const MOP_SCENE := preload("res://scenes/props/mop_bucket.tscn")
const BREAKER_SCENE := preload("res://scenes/props/breaker.tscn")
const TASK_SCENE := preload("res://scenes/props/shop_task.tscn")
const FIGURE_SCRIPT := preload("res://scenes/props/cctv_figure.gd")

var player_start := Vector2.ZERO
var thing: WedgedThing
var panel: BoardedPanel
var size_tiles := Vector2i.ZERO

var _drip_timer := 3.0
var _tasks: Array = []
var _after_power: Array = []
var _door_pos := Vector2.ZERO
var _counter_pos := Vector2.ZERO
var _window_pos := Vector2.ZERO
var _variants := 1

@onready var darkness: CanvasModulate = $Darkness
@onready var back_wall: TileMapLayer = $BackWall
@onready var walls: TileMapLayer = $Walls
@onready var props: Node2D = $Props
@onready var triggers: Node2D = $Triggers
@onready var creatures: Node2D = $Creatures
@onready var ambience: AudioStreamPlayer = $Ambience
@onready var act0: Act0 = $Act0


func _ready() -> void:
	var tile_set := TileSetBuilder.build()
	_variants = TileSetBuilder.variant_count(tile_set)
	back_wall.tile_set = tile_set
	walls.tile_set = tile_set
	_build()
	act0.setup(_tasks, panel, _after_power)
	ambience.stream = AudioDirector.get_stream("hum")
	ambience.volume_db = -80.0
	ambience.play()
	GameState.zone_changed.connect(_apply_zone)
	act0.power_changed.connect(func(_on): _apply_zone(GameState.zone, true))
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


## The four CCTV feeds (see CCTVView.setup). Shop floor framing puts the
## figure's spot right at the left edge, half out of frame. Easy to miss.
func cctv_feeds() -> Array:
	return [
		{"label": "CAM1 SHOP FLOOR", "pos": Vector2(_door_pos.x + 80.0, _door_pos.y - 36.0), "zoom": 1.0},
		{"label": "CAM2 TILL", "pos": _counter_pos + Vector2(0, -22), "zoom": 2.0},
		{"label": "CAM3 FORECOURT", "pos": _window_pos, "zoom": 3.0},
		{"label": "CAM4 STOREROOM", "pos": panel.global_position + Vector2(-72, -36), "zoom": 1.0},
	]


func apply_camera_limits(cam: Camera2D) -> void:
	cam.limit_left = 0
	cam.limit_top = 0
	cam.limit_right = size_tiles.x * TILE
	cam.limit_bottom = size_tiles.y * TILE


## After the player is caught: creatures go back to where they started.
func reset_creatures() -> void:
	for c in creatures.get_children():
		if c.has_method("reset"):
			c.reset()


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
					walls.set_cell(cell, 0, _atlas(_solid_tile_for(x, y), cell))
				".":
					back_wall.set_cell(cell, 0, _atlas(TileSetBuilder.BACK_CONCRETE, cell))
				",":
					back_wall.set_cell(cell, 0, _atlas(TileSetBuilder.BACK_BRICK, cell))
				_:
					back_wall.set_cell(cell, 0, _atlas(_background_for(row, x), cell))
					_place_marker(ch, cell)
	_fill_margin(width)
	for d: Dictionary in DECOR:
		_place_decor(d)


func _place_decor(d: Dictionary) -> void:
	var cell: Vector2i = d.cell
	if not _is_open(cell.x, cell.y):
		push_warning("TestLevel: decor %s at %s is inside rock" % [d.type, cell])
		return
	var ceil_y := _ceiling_y(cell)
	var floor_y := _floor_y(cell)
	var x := float(cell.x * TILE)
	var y := ceil_y + float(d.get("below_ceiling", 0))
	if d.has("above_floor"):
		y = floor_y - float(d.above_floor)
	match d.type:
		"light":
			var light: Node2D = LIGHT_SCENE.instantiate()
			light.position = Vector2(x + TILE * 0.5, ceil_y)
			props.add_child(light)
		"window":
			var window: Node2D = WINDOW_SCENE.instantiate()
			window.position = Vector2(x + TILE * 0.5, (ceil_y + floor_y) * 0.5 - 8.0)
			_window_pos = window.position
			props.add_child(window)
		"tube", "vent":
			var hung: Node2D = (TUBE_SCENE if d.type == "tube" else VENT_SCENE).instantiate()
			hung.position = Vector2(x + TILE * 0.5, ceil_y)
			props.add_child(hung)
		"pipe":
			var pipe: Sprite2D = PIPE_SCENE.instantiate()
			pipe.position = Vector2(x, y)
			pipe.region_rect = Rect2(0, 0, (int(d.to_x) - cell.x) * TILE, 6)
			props.add_child(pipe)
		"cable":
			var cable: WallCable = CABLE_SCENE.instantiate()
			cable.position = Vector2(x, y)
			cable.end_point = Vector2((int(d.to_x) - cell.x) * TILE, 0)
			cable.sag = float(d.get("sag", 8))
			props.add_child(cable)
		"spiders":
			for i in int(d.get("count", 3)):
				var spider: Spider = SPIDER_SCENE.instantiate()
				spider.position = Vector2(x + TILE * 0.5 + randf_range(-20.0, 20.0), ceil_y)
				creatures.add_child(spider)
		"arm":
			var arm: CeilingArm = ARM_SCENE.instantiate()
			arm.position = Vector2(x + TILE * 0.5, ceil_y + 4.0)   # just under the vent grille
			creatures.add_child(arm)
		_:
			push_warning("TestLevel: unknown decor type '%s'" % d.type)


## World y of the ceiling (underside of the rock) above an open cell.
func _ceiling_y(cell: Vector2i) -> float:
	var y := cell.y
	while _is_open(cell.x, y - 1):
		y -= 1
	return float(y * TILE)


## World y of the floor (top of the rock) below an open cell.
func _floor_y(cell: Vector2i) -> float:
	var y := cell.y
	while _is_open(cell.x, y + 1):
		y += 1
	return float((y + 1) * TILE)


## Solid rock around the map, so the camera never shows the void past the edge.
func _fill_margin(width: int) -> void:
	const MARGIN := 10
	for y in range(-MARGIN, MAP.size() + MARGIN):
		for x in range(-MARGIN, width + MARGIN):
			if y >= 0 and y < MAP.size() and x >= 0 and x < width:
				continue
			walls.set_cell(Vector2i(x, y), 0, _atlas(TileSetBuilder.ROCK, Vector2i(x, y)))


## Atlas coords for a tile type at a cell: a stable pseudo-random variant row
## (mostly plain, sometimes cracked or grimy) so the repeat isn't obvious.
func _atlas(tile_type: int, cell: Vector2i) -> Vector2i:
	var h := absi(cell.x * 73856093 ^ cell.y * 19349663) % 10
	var variant := 0
	if h >= 8:
		variant = 2
	elif h >= 6:
		variant = 1
	return Vector2i(tile_type, mini(variant, _variants - 1))


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
			_door_pos = floor_point
			var figure := FIGURE_SCRIPT.new() as CCTVFigure
			figure.stage_points = [floor_point + Vector2(-13, 0)]   # far corner, half out of frame
			props.add_child(figure)
		"F", "f":
			var sign_node: Node2D = SIGN_SCENE.instantiate()
			sign_node.position = centre
			sign_node.set("wrong", ch == "f")
			props.add_child(sign_node)
		"K":
			var task_shelf: Node2D = SHELF_SCENE.instantiate()
			task_shelf.position = floor_point
			props.add_child(task_shelf)
			_add_task("shelf", floor_point + Vector2(16, 0), ShopTask.Kind.BOX)
		"R":
			var fridge: Node2D = FRIDGE_SCENE.instantiate()
			fridge.position = floor_point
			props.add_child(fridge)
			_add_task("fridge", floor_point, ShopTask.Kind.NONE, 1.0)
		"M":
			var mop: Node2D = MOP_SCENE.instantiate()
			mop.position = floor_point + Vector2(14, 0)
			props.add_child(mop)
			_add_task("mop", floor_point, ShopTask.Kind.SPILL, 2.0)
		"C":
			var counter: Node2D = COUNTER_SCENE.instantiate()
			counter.position = floor_point
			props.add_child(counter)
			_counter_pos = floor_point
			_add_task("torch", floor_point + Vector2(12, 0), ShopTask.Kind.NONE, 0.6, Vector2(16, 28))
			_add_task("cctv", floor_point + Vector2(-14, 0), ShopTask.Kind.NONE, 0.3, Vector2(16, 28), true)
		"X":
			var breaker: Node2D = BREAKER_SCENE.instantiate()
			breaker.position = centre + Vector2(0, -8)
			props.add_child(breaker)
			_add_task("breaker", floor_point, ShopTask.Kind.NONE, 0.5)
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
	t.one_shot = not cfg.get("repeat", false)
	if cfg.get("after_power", false):
		t.armed = false
		_after_power.append(t)
	t.triggered.connect(_on_trigger)
	triggers.add_child(t)


func _add_task(id: String, at: Vector2, kind: ShopTask.Kind, hold := 1.5,
		zone := Vector2(28, 28), repeatable := false) -> void:
	var task: ShopTask = TASK_SCENE.instantiate()
	task.task_id = id
	task.kind = kind
	task.hold_time = hold
	task.zone_size = zone
	task.repeatable = repeatable
	task.position = at
	props.add_child(task)
	_tasks.append(task)


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
	if zone == 0 and act0.power_on:
		dark = POWER_ON_SHOP
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
