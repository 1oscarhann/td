shader_type canvas_item;
// Full-screen post effects from the design doc ("subtle"): film grain,
// vignette, desaturation, and very slight chromatic aberration in later zones.
// Grain is stronger in the shadows, where the eye is already unsure.

uniform sampler2D screen_tex : hint_screen_texture, filter_nearest;
uniform float grain = 0.07;
uniform float vignette = 0.6;
uniform float desaturate = 0.25;
uniform float aberration = 0.0;   // in pixels at the screen edge; 0 until zone 3
uniform vec2 res = vec2(640.0, 360.0);

float rand(vec2 c) {
	return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	vec3 c;
	if (aberration > 0.0) {
		vec2 o = (uv - 0.5) * 2.0 * aberration / res;
		c = vec3(texture(screen_tex, uv + o).r, texture(screen_tex, uv).g, texture(screen_tex, uv - o).b);
	} else {
		c = texture(screen_tex, uv).rgb;
	}
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	c = mix(c, vec3(l), desaturate);
	vec2 px = floor(uv * res);
	float n = rand(px + vec2(floor(TIME * 24.0) * 7.31, floor(TIME * 24.0) * 3.17)) - 0.5;
	c += n * grain * (0.35 + (1.0 - clamp(l * 2.0, 0.0, 1.0)) * 0.65);
	vec2 d = uv - 0.5;
	d.x *= res.x / res.y;
	c *= 1.0 - smoothstep(0.3, 1.0, length(d)) * vignette;
	COLOR = vec4(max(c, vec3(0.0)), 1.0);
}
