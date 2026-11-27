extends Node
## AudioDirector (autoload).
##
## Sound library + helpers for positional audio.
##
## A sound NAME maps to a list of variants. Real recordings live in res://audio/
## (see FILES); every play picks one variant at random, never the same one twice
## in a row. Names with no files fall back to a sound synthesised at startup.
##
## Buses:
##  - "World": every positional world sound. Reverb size changes per zone.
##  - "Distant": far-away creature calls. Lowpass ~700 Hz + a big wet reverb, so
##    they sound like they're coming through a lot of tunnel.
##  - The sub-bass drone plays straight to Master. Its level follows `tension`
##    (0..1, set by the level) and it can be cut to silence before big moments.

const RATE := 22050
const WORLD_BUS := &"World"
const DISTANT_BUS := &"Distant"

const ENGINE := "res://audio/engine/"
const CREATURE := "res://audio/creature/"
## name -> recordings. Missing files are skipped (synth fallback if none load).
const FILES := {
	"hum": [ENGINE + "hum.ogg"],
	"drip": [ENGINE + "drip_1.ogg", ENGINE + "drip_2.ogg", ENGINE + "drip_3.ogg", ENGINE + "drip_4.ogg",
			ENGINE + "drip_5.ogg", ENGINE + "drip_6.ogg", ENGINE + "drip_7.ogg", ENGINE + "drip_8.ogg"],
	"tap": [ENGINE + "tap_1.ogg", ENGINE + "tap_2.ogg", ENGINE + "tap_3.ogg",
			ENGINE + "tap_4.ogg", ENGINE + "tap_5.ogg", ENGINE + "tap_6.ogg"],
	"caught": [ENGINE + "caught.ogg"],
	"scrape": [CREATURE + "creature_drag.ogg"],                # Wedged Thing body loop
	"thing_breath": [CREATURE + "creature_breath_loop.ogg"],  # Wedged Thing, close + unlit
	"scrape_soft": [CREATURE + "creature_scrape_soft.ogg"],   # Ceiling Arm in the duct
	"notice": [CREATURE + "wail_notice_sting.ogg"],
	"gurgle": [CREATURE + "creature_gurgle_1.ogg", CREATURE + "creature_gurgle_2.ogg",
			CREATURE + "creature_gurgle_3.ogg"],
	"moan_distant": [CREATURE + "creature_moan_distant.ogg"],
	"wail_distant": [CREATURE + "wail_distant.ogg"],
	"growl": [CREATURE + "creature_growl_1.ogg", CREATURE + "creature_growl_2.ogg",
			CREATURE + "creature_growl_3.ogg"],
	"call": [CREATURE + "creature_call.ogg"],
}
## Recordings that loop (also flagged loop=true in their .import files).
const LOOPS := ["hum", "scrape", "thing_breath", "scrape_soft"]
## Always routed through the Distant bus.
const DISTANT := ["moan_distant", "wail_distant", "growl", "call"]

## Drone level at tension 0 and 1 (dB). Silence is -80.
const DRONE_MIN_DB := -42.0
const DRONE_MAX_DB := -10.0

## 0..1. The level sets it every frame (Phase 3 drives it properly).
var tension := 0.0

var _streams: Dictionary = {}     # name -> Array[AudioStream]
var _last: Dictionary = {}        # name -> index played last (no immediate repeats)
var _rng := RandomNumberGenerator.new()
var _drone: AudioStreamPlayer
var _drone_hush := 0.0            # seconds the drone stays silent


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_rng.seed = 1337
	_setup_buses()
	_build_library()
	_load_files()
	_drone = AudioStreamPlayer.new()
	_drone.stream = get_stream("drone")
	_drone.volume_db = -80.0
	add_child(_drone)
	_drone.play()


func _process(delta: float) -> void:
	_drone_hush = maxf(0.0, _drone_hush - delta)
	var target := -80.0
	if _drone_hush <= 0.0 and tension > 0.01:
		target = lerpf(DRONE_MIN_DB, DRONE_MAX_DB, clampf(tension, 0.0, 1.0))
	# Cuts out fast, swells back slowly.
	var rate := 60.0 if target < _drone.volume_db else 6.0
	_drone.volume_db = move_toward(_drone.volume_db, target, rate * delta)


# --------------------------------------------------------------------------- API

## One variant of `sound`, chosen at random (never the same one twice running).
func get_stream(sound: String) -> AudioStream:
	if not _streams.has(sound):
		push_warning("AudioDirector: unknown sound '%s'" % sound)
		return null
	var list: Array = _streams[sound]
	if list.size() == 1:
		return list[0]
	var i := _rng.randi() % list.size()
	if i == int(_last.get(sound, -1)):
		i = (i + 1 + _rng.randi() % (list.size() - 1)) % list.size()
	_last[sound] = i
	return list[i]


func variant_count(sound: String) -> int:
	return (_streams[sound] as Array).size() if _streams.has(sound) else 0


## The drone drops to silence for `seconds` (right before a big moment), then
## swells back on its own.
func hush_drone(seconds: float) -> void:
	_drone_hush = maxf(_drone_hush, seconds)


## A far-away creature sound: off to one side of `listener`, through the
## Distant bus (muffled + big reverb). Returns the player, or null.
func play_distant(sound: String, listener: Vector2, volume_db := -6.0) -> AudioStreamPlayer2D:
	var side := -1.0 if _rng.randf() < 0.5 else 1.0
	var pos := listener + Vector2(side * _rng.randf_range(260.0, 420.0), _rng.randf_range(-30.0, 30.0))
	return play_at(sound, pos, volume_db, 0.06, 1600.0)


## Fire-and-forget positional sound. Players learn to locate threats by ear, so
## creatures should always use this (never a flat, non-positional sound).
func play_at(sound: String, pos: Vector2, volume_db := 0.0, pitch_jitter := 0.08,
		max_distance := 600.0, pitch := 1.0) -> AudioStreamPlayer2D:
	var stream := get_stream(sound)
	if stream == null:
		return null
	var p := AudioStreamPlayer2D.new()
	p.stream = stream
	p.volume_db = volume_db
	p.pitch_scale = maxf(0.05, pitch + _rng.randf_range(-pitch_jitter, pitch_jitter))
	p.max_distance = max_distance
	p.attenuation = 1.6
	p.bus = WORLD_BUS
	if sound in DISTANT:
		p.bus = DISTANT_BUS
		p.attenuation = 0.6     # far away already: don't fade it to nothing
	var parent: Node = get_tree().current_scene
	if parent == null:
		parent = get_tree().root
	parent.add_child(p)
	p.global_position = pos
	p.finished.connect(p.queue_free)
	p.play()
	return p


## Non-positional sound (UI, the death sting).
func play_ui(sound: String, volume_db := 0.0) -> AudioStreamPlayer:
	var stream := get_stream(sound)
	if stream == null:
		return null
	var p := AudioStreamPlayer.new()
	p.stream = stream
	p.volume_db = volume_db
	add_child(p)
	p.finished.connect(p.queue_free)
	p.play()
	return p


## Change the World bus reverb. room_size/wet are 0..1.
func set_reverb(room_size: float, wet: float) -> void:
	var idx := AudioServer.get_bus_index(WORLD_BUS)
	if idx == -1:
		return
	var reverb := AudioServer.get_bus_effect(idx, 0) as AudioEffectReverb
	if reverb:
		reverb.room_size = room_size
		reverb.wet = wet


# ------------------------------------------------------------------------- setup

func _setup_buses() -> void:
	if AudioServer.get_bus_index(WORLD_BUS) != -1:
		return
	var idx := AudioServer.bus_count
	AudioServer.add_bus(idx)
	AudioServer.set_bus_name(idx, WORLD_BUS)
	AudioServer.set_bus_send(idx, &"Master")
	var reverb := AudioEffectReverb.new()
	reverb.room_size = 0.3
	reverb.damping = 0.6
	reverb.spread = 0.8
	reverb.dry = 1.0
	reverb.wet = 0.1
	AudioServer.add_bus_effect(idx, reverb)

	# Distant: muffled through rock, lots of tail.
	var d := AudioServer.bus_count
	AudioServer.add_bus(d)
	AudioServer.set_bus_name(d, DISTANT_BUS)
	AudioServer.set_bus_send(d, &"Master")
	var lp := AudioEffectLowPassFilter.new()
	lp.cutoff_hz = 700.0
	lp.resonance = 0.4
	AudioServer.add_bus_effect(d, lp)
	var far := AudioEffectReverb.new()
	far.room_size = 0.95
	far.damping = 0.75
	far.spread = 1.0
	far.dry = 0.35
	far.wet = 0.75
	AudioServer.add_bus_effect(d, far)


## Recordings replace the synth fallback for every name that has files.
func _load_files() -> void:
	for sound: String in FILES:
		var list: Array = []
		for path: String in FILES[sound]:
			if not ResourceLoader.exists(path):
				continue
			var stream := load(path) as AudioStream
			if stream == null:
				continue
			if sound in LOOPS and "loop" in stream:
				stream.loop = true      # in case the .import flag was lost
			list.append(stream)
		if list.is_empty():
			if not _streams.has(sound):
				push_warning("AudioDirector: no files and no synth for '%s'" % sound)
			continue
		_streams[sound] = list


## Synthesised sounds: the fallback for any name without recordings, plus the
## ones that are synth on purpose (UI click, fridge hum, drone...).
func _build_library() -> void:
	_streams["click"] = _to_wav(_synth_click())
	_streams["step"] = _to_wav(_synth_step())
	_streams["creak"] = _to_wav(_synth_creak())
	_streams["crack"] = _to_wav(_synth_crack())
	_streams["scrape"] = _to_wav(_synth_scrape(), true)
	_streams["tap"] = _to_wav(_synth_tap())
	_streams["hum"] = _to_wav(_synth_hum(), true)
	_streams["hiss"] = _to_wav(_synth_hiss(), true)
	_streams["caught"] = _to_wav(_synth_caught())
	_streams["drip"] = _to_wav(_synth_drip())
	_streams["buzz"] = _to_wav(_synth_buzz(), true)
	_streams["clunk"] = _to_wav(_synth_clunk())
	_streams["crackle"] = _to_wav(_synth_crackle(), true)
	_streams["fridge_hum"] = _to_wav(_synth_hum(), true)
	_streams["drone"] = _to_wav(_synth_drone(), true)
	# Everything is a list of variants.
	for k in _streams:
		_streams[k] = [_streams[k]]


# --------------------------------------------------------------------- synthesis
# Tiny DSP helpers: everything is noise, sines and exponential envelopes.

func _noise() -> float:
	return _rng.randf_range(-1.0, 1.0)


func _buffer(seconds: float) -> PackedFloat32Array:
	var s := PackedFloat32Array()
	s.resize(int(RATE * seconds))
	return s


## Torch click: tiny, dry, satisfying.
func _synth_click() -> PackedFloat32Array:
	var s := _buffer(0.04)
	for i in s.size():
		var t := float(i) / RATE
		s[i] = (sin(TAU * 2300.0 * t) * 0.5 + _noise() * 0.5) * exp(-t * 170.0) * 0.6
	return s


## Footstep on concrete: low thump + short filtered scuff.
func _synth_step() -> PackedFloat32Array:
	var s := _buffer(0.14)
	var lp := 0.0
	for i in s.size():
		var t := float(i) / RATE
		lp += (_noise() - lp) * 0.18
		var thump := sin(TAU * 85.0 * t) * exp(-t * 55.0) * 0.7
		s[i] = (lp * 1.5 + thump) * exp(-t * 32.0) * 0.8
	return s


## Board strain: a wobbling sawtooth groan, used when you start pulling.
func _synth_creak() -> PackedFloat32Array:
	var dur := 0.7
	var s := _buffer(dur)
	var phase := 0.0
	var lp := 0.0
	for i in s.size():
		var t := float(i) / RATE
		var f := 150.0 + 35.0 * sin(TAU * 3.0 * t) + _rng.randf_range(-8.0, 8.0)
		phase = fposmod(phase + f / RATE, 1.0)
		var saw := phase * 2.0 - 1.0
		lp += (saw - lp) * 0.25
		s[i] = lp * sin(PI * t / dur) * 0.45
	return s


## Board ripping free: splintering crackle + a wooden thunk. Loud on purpose.
func _synth_crack() -> PackedFloat32Array:
	var s := _buffer(0.5)
	var lp := 0.0
	for i in s.size():
		var t := float(i) / RATE
		var n := _noise()
		lp += (n - lp) * 0.3
		var hp := n - lp
		var crackle := 0.0
		if _rng.randf() < 0.025 * exp(-t * 6.0):
			crackle = _rng.randf_range(-1.0, 1.0)
		var thunk := sin(TAU * 130.0 * t) * exp(-t * 18.0)
		s[i] = clampf(hp * 0.55 * exp(-t * 22.0) + crackle * 0.7 + thunk * 0.6, -1.0, 1.0) * exp(-t * 4.0)
	return s


## Wedged Thing body: skin dragging over brick. Seamless 1.6 s loop.
func _synth_scrape() -> PackedFloat32Array:
	var dur := 1.6
	var s := _buffer(dur)
	var lp := 0.0
	var lp2 := 0.0
	for i in s.size():
		var t := float(i) / RATE
		lp += (_noise() - lp) * 0.35
		lp2 += (lp - lp2) * 0.35
		var band := lp - lp2 * 0.6
		# 1.25 Hz * 1.6 s = 2 whole cycles, so the loop point is seamless.
		var am := 0.35 + 0.65 * pow(sin(PI * 1.25 * t), 2.0)
		var grain := 0.0
		if _rng.randf() < 0.004:
			grain = _rng.randf_range(-0.6, 0.6)
		s[i] = (band * am * 0.9 + grain) * 0.8
	return s


## Wedged Thing leg tip tapping on concrete.
func _synth_tap() -> PackedFloat32Array:
	var s := _buffer(0.05)
	var lp := 0.0
	for i in s.size():
		var t := float(i) / RATE
		var n := _noise()
		lp += (n - lp) * 0.2
		s[i] = ((n - lp) * exp(-t * 260.0) + sin(TAU * 3100.0 * t) * exp(-t * 380.0) * 0.4) * 0.8
	return s


## Low electrical hum for the tunnels. 2 s loop, whole cycles of 50 Hz.
func _synth_hum() -> PackedFloat32Array:
	var s := _buffer(2.0)
	for i in s.size():
		var t := float(i) / RATE
		s[i] = sin(TAU * 50.0 * t) * 0.28 + sin(TAU * 100.0 * t) * 0.12 \
				+ sin(TAU * 150.0 * t) * 0.05 + _noise() * 0.015
	return s


## Sub-bass drone, 4 s seamless loop: two close low sines beating against each
## other (45 + 52 Hz, whole cycles in 4 s), a quiet octave so small speakers get
## a hint of it, and a slow swell. Felt more than heard.
func _synth_drone() -> PackedFloat32Array:
	var s := _buffer(4.0)
	var lp := 0.0
	for i in s.size():
		var t := float(i) / RATE
		lp += (_noise() - lp) * 0.01
		var swell := 0.75 + 0.25 * sin(TAU * 0.25 * t)
		s[i] = (sin(TAU * 45.0 * t) * 0.45 + sin(TAU * 52.0 * t) * 0.35
				+ sin(TAU * 90.0 * t) * 0.08 + lp * 0.6) * swell
	return s


## Faint static under the bottom text while it types.
func _synth_hiss() -> PackedFloat32Array:
	var s := _buffer(1.0)
	var lp := 0.0
	for i in s.size():
		var n := _noise()
		lp += (n - lp) * 0.5
		s[i] = (n - lp) * 0.35
	return s


## Caught: a low falling boom. No scream, no gore.
func _synth_caught() -> PackedFloat32Array:
	var s := _buffer(1.4)
	var phase := 0.0
	var lp := 0.0
	for i in s.size():
		var t := float(i) / RATE
		var f := lerpf(75.0, 28.0, minf(t / 1.2, 1.0))
		phase += f / RATE
		lp += (_noise() - lp) * 0.08
		s[i] = (sin(TAU * phase) * exp(-t * 2.5) * 0.9 + lp * exp(-t * 6.0) * 1.2) * 0.9
	return s


## Water drip: a short falling "plink".
func _synth_drip() -> PackedFloat32Array:
	var s := _buffer(0.25)
	var phase := 0.0
	for i in s.size():
		var t := float(i) / RATE
		var f := 1500.0 * exp(-t * 14.0) + 550.0
		phase += f / RATE
		s[i] = sin(TAU * phase) * exp(-t * 22.0) * 0.5
	return s


## Fluorescent tube buzz: Act 0 normality. Its absence after the cut is the point.
## 1 s loop, whole cycles of 100 Hz.
func _synth_buzz() -> PackedFloat32Array:
	var s := _buffer(1.0)
	for i in s.size():
		var t := float(i) / RATE
		var saw := fposmod(t * 100.0, 1.0) * 2.0 - 1.0
		s[i] = saw * 0.18 + sin(TAU * 200.0 * t) * 0.08 + _noise() * 0.02
	return s


## Heavy electrical clunk: the power dying, a breaker that does nothing.
func _synth_clunk() -> PackedFloat32Array:
	var s := _buffer(0.45)
	var lp := 0.0
	for i in s.size():
		var t := float(i) / RATE
		lp += (_noise() - lp) * 0.12
		s[i] = (sin(TAU * 60.0 * t) * exp(-t * 14.0) + lp * exp(-t * 30.0) * 1.5) * 0.8
	return s


## Electrical crackle: the Cables' signature. 1.2 s loop of sparse sharp pops
## over a thin buzz.
func _synth_crackle() -> PackedFloat32Array:
	var s := _buffer(1.2)
	var pop := 0.0
	for i in s.size():
		var t := float(i) / RATE
		if _rng.randf() < 0.0015:
			pop = _rng.randf_range(0.5, 1.0) * (1.0 if _rng.randf() < 0.5 else -1.0)
		pop *= 0.93
		s[i] = pop * 0.8 + sin(TAU * 120.0 * t) * 0.05 + _noise() * pop * 0.3
	return s


func _to_wav(samples: PackedFloat32Array, loop := false) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		bytes.encode_s16(i * 2, int(clampf(samples[i], -1.0, 1.0) * 32767.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = RATE
	wav.stereo = false
	wav.data = bytes
	if loop:
		wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
		wav.loop_begin = 0
		wav.loop_end = samples.size()
	return wav
