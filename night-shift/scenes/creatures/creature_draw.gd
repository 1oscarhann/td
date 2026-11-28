class_name CreatureDraw
## Shared procedural drawing for the creatures (the Arms, the Lure, the leg,
## the spiders). The Wedged Thing uses the same technique in its own script.
##
## The trick that makes pixel-art limbs read as solid in a torch beam: every
## limb is a strip of quads, with a 1 px rim on the edge that faces the torch
## and a dark edge on the side away from it. Knuckles and blobs get a highlight
## offset towards the light and a dark crescent away from it.


const NIGHT_SHADER := preload("res://shaders/creature_night.gdshader")


## VISIBILITY RULE: darkness hides DETAIL, not existence. Every creature is drawn
## twice:
##   - the night pass (this): always visible, unshaded, behind. With `remap` the
##     creature's own drawing is turned into night tones by the night shader (a
##     black silhouette, a cold edge where its highlights were). Without it,
##     `paint` draws its own night colours.
##   - the torch pass: the creature node itself, Light Only, on top. Where a light
##     that reveals creatures falls (your torch, a few worklights), the real
##     colours and detail fade in over the silhouette.
## `paint` is called with the night node as the canvas to draw on. Remember to
## queue_redraw() the returned node whenever the creature redraws.
static func add_night_pass(owner: CanvasItem, paint: Callable, remap := true) -> Node2D:
	var n := Node2D.new()
	n.name = "Night"
	n.show_behind_parent = true
	n.light_mask = 0
	if remap:
		var sm := ShaderMaterial.new()
		sm.shader = NIGHT_SHADER
		n.material = sm
	else:
		var cm := CanvasItemMaterial.new()
		cm.light_mode = CanvasItemMaterial.LIGHT_MODE_UNSHADED
		n.material = cm
	n.draw.connect(func(): paint.call(n))
	owner.add_child(n)
	return n


## A tiny white square texture for particles (they draw nothing without one).
static func pixel_texture(size := 1) -> ImageTexture:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	img.fill(Color.WHITE)
	return ImageTexture.create_from_image(img)


## Direction (local to `ci`) from a point on the creature towards the torch.
## Falls back to "light from above and a bit in front" without a torch.
static func light_dir(ci: Node2D, local_point: Vector2) -> Vector2:
	var torch = GameState.torch
	if torch == null or not is_instance_valid(torch):
		return Vector2(-0.4, -0.9).normalized()
	var to: Vector2 = ci.to_local(torch.global_position) - local_point
	return to.normalized() if to.length() > 0.01 else Vector2(0, -1)


## Cubic bezier sampled into n+1 points.
static func bez(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, n: int) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in n + 1:
		var t := float(i) / float(n)
		var u := 1.0 - t
		pts.append(p0 * (u * u * u) + p1 * (3.0 * u * u * t) + p2 * (3.0 * u * t * t) + p3 * (t * t * t))
	return pts


## A tapering limb along `pts`, width w0 -> w1, rim-lit on the torch side.
static func limb(ci: CanvasItem, pts: PackedVector2Array, w0: float, w1: float,
		base: Color, rim: Color, dark: Color, ldir: Vector2) -> void:
	var n := pts.size()
	if n < 2:
		return
	var cols := PackedColorArray([base, base, base, base])
	var none := PackedVector2Array()
	for i in n - 1:
		var a := pts[i]
		var b := pts[i + 1]
		var d := b - a
		if d.length_squared() < 0.0001:
			continue
		var nrm := d.orthogonal().normalized()
		var wa := lerpf(w0, w1, float(i) / float(n - 1)) * 0.5
		var wb := lerpf(w0, w1, float(i + 1) / float(n - 1)) * 0.5
		ci.draw_primitive(PackedVector2Array([a + nrm * wa, b + nrm * wb, b - nrm * wb, a - nrm * wa]), cols, none)
		if wa < 0.8:
			continue
		var side := 1.0 if nrm.dot(ldir) > 0.0 else -1.0
		if absf(nrm.dot(ldir)) > 0.15:
			ci.draw_line(a + nrm * wa * side, b + nrm * wb * side, rim, 1.0)
		ci.draw_line(a - nrm * wa * side, b - nrm * wb * side, dark, 1.0)


## A shaded round lump: base disc, a highlight nudged towards the light, a dark
## crescent on the far side.
static func blob(ci: CanvasItem, c: Vector2, r: float, base: Color, hi: Color, dark: Color, ldir: Vector2) -> void:
	if r < 0.6:
		ci.draw_rect(Rect2(c.round(), Vector2(1, 1)), base)
		return
	ci.draw_circle(c - ldir * (r * 0.25), r, dark)
	ci.draw_circle(c, r * 0.9, base)
	ci.draw_circle(c + ldir * (r * 0.4), maxf(r * 0.35, 0.5), hi)


## A knuckle: a swollen joint with one pale pixel of bone catching the light.
static func knuckle(ci: CanvasItem, c: Vector2, r: float, base: Color, hi: Color, dark: Color, ldir: Vector2) -> void:
	ci.draw_circle(c, r + 0.6, dark)
	ci.draw_circle(c, r, base)
	ci.draw_rect(Rect2((c + ldir * r * 0.6).round(), Vector2(1, 1)), hi)
