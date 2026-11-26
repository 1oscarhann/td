extends Node
## AudioDirector (autoload).
##
## Placeholder sound library + helpers for positional audio.
## Every sound in the slice is synthesised at startup into an AudioStreamWAV, so
## the project has zero audio assets. Swap any entry for a real recording later by
## replacing it in `_streams` (e.g. `_streams["step"] = preload("res://audio/step.ogg")`).
##
## All world sounds play on the "World" bus, which carries a reverb whose size is
## changed per zone (tight in the storeroom, big and echoey in the tunnels).

const RATE := 22050
const WORLD_BUS := &"World"

var _streams: Dictionary = {}
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_rng.seed = 1337
	_setup_buses()
	_build_library()


# --------------------------------------------------------------------------- API

func get_stream(sound: String) -> AudioStream:
	if not _streams.has(sound):
		push_warning("AudioDirector: unknown sound '%s'" % sound)
		return null
	return _streams[sound]


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
