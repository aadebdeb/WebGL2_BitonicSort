# GPGPU Bitonic Sort with WebGL2

https://aadebdeb.github.io/WebGL2_BitonicSort/

![](https://user-images.githubusercontent.com/10070637/54861722-4b363e00-4d71-11e9-8c3d-51087c340e38.gif)


## Implementation

make draw calls in dual loop to swap values in texture

```js
for (let i = 0; i < sizeN; i++) {
  for (let j = 0; j <= i; j++) {
    executeKernel(writableFramebuffer.framebuffer, readableFramebuffer.texture, textureSize, i, j);
    swapFramebuffer();
  }
}
```

```glsl
#version 300 es

precision highp float;

out float o_value;

uniform sampler2D u_valueTexture;
uniform uint u_size;
uniform uint u_blockStep;
uniform uint u_subBlockStep;

uint convertCoordToIndex(uvec2 coord) {
  return coord.x + coord.y * u_size;
}

uvec2 convertIndexToCoord(uint index) {
  return uvec2(index % u_size, index / u_size);
}

void main(void) {
  uint index = convertCoordToIndex(uvec2(gl_FragCoord.xy));
  uint d = 1u << (u_blockStep - u_subBlockStep);

  bool up = ((index >> u_blockStep) & 2u) == 0u;

  uint targetIndex;
  if ((index & d) == 0u) {
    targetIndex = index | d;
  } else {
    targetIndex = index & ~d;
    up = !up;
  }

  float a = texelFetch(u_valueTexture, ivec2(gl_FragCoord.xy), 0).x;
  float b = texelFetch(u_valueTexture, ivec2(convertIndexToCoord(targetIndex)), 0).x;
  if ((a > b) == up) {
    o_value = b; // swap
  } else {
    o_value = a; // no_swap
  }
}
```

## Link to Article (in Japanese)
<a href="https://qiita.com/aa_debdeb/items/e04aa08bcb9ff9be8e32">WebGL2でGPGPUバイトニックソート - Qiita</a>