shader_type canvas_item;
// Zone 4: the walls breathe (design doc: "wall tiles scaled and offset by a
// sine shader"). Slow, uneven pulsing that drifts along the tunnel.
uniform float amp = 1.3;
uniform float speed = 1.2;

void vertex() {
	vec2 w = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
	float b = sin(TIME * speed + w.x * 0.04) * 0.5 + 0.5;
	VERTEX += vec2(cos(TIME * speed * 0.7 + w.y * 0.09), sin(TIME * speed + w.x * 0.06)) * amp * b;
}
