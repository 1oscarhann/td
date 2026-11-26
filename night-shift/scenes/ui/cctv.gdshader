shader_type canvas_item;
// Grainy black-and-white CCTV feed: luminance, gain (the cameras see better in
// the dark than you do), animated grain, scanlines, vignette, slight green tint.

uniform float gain = 1.7;
uniform float grain = 0.14;
uniform vec2 resolution = vec2(192.0, 108.0);

float rand(vec2 co) {
	return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)) * gain + 0.04;
	vec2 px = floor(UV * resolution);
	l += (rand(px + vec2(floor(TIME * 12.0) * 1.7, floor(TIME * 12.0) * 3.1)) - 0.5) * grain;
	if (mod(px.y, 2.0) < 1.0) {
		l *= 0.82;
	}
	vec2 d = UV - 0.5;
	l *= 1.0 - dot(d, d) * 1.4;
	COLOR = vec4(clamp(l, 0.0, 1.0) * vec3(0.9, 1.0, 0.92), 1.0);
}
