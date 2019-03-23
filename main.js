(function() {

  function createShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) + source);
    }
    return shader;
  }

  function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  function createVbo(gl, array) {
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vbo;
  }

  function createIbo(gl, array) {
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, array, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return ibo;
  }

  function createVao(gl, ibo, vboObjs) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    vboObjs.forEach((vboObj, idx) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, vboObj.buffer);
      gl.enableVertexAttribArray(idx);
      gl.vertexAttribPointer(idx, vboObj.size, gl.FLOAT, false, 0, 0);
    });
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vao;
  }

  function createTexture(gl, size) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, size, size, 0, gl.RED, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  function createFramebuffer(gl, size) {
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const texture = createTexture(gl, size);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return {
      framebuffer: framebuffer,
      texture: texture
    };
  }

  function getUniformLocations(gl, program, keys) {
    const locations = {};
    keys.forEach(key => {
        locations[key] = gl.getUniformLocation(program, key);
    });
    return locations;
  }

  const SORT_VERTEX_SHADER_SOURCE =
`#version 300 es

layout (location = 0) in vec2 position; 

void main(void) {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

  const INITIALIZE_FRAGMENT_SHADER_SOURCE =
`#version 300 es

precision highp float;

out float o_value;

uniform vec2 u_randomSeed;

float random(vec2 x){
  return fract(sin(dot(x,vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void) {
  o_value = random(gl_FragCoord.xy * 0.01 + u_randomSeed);
}
`

  const KERNEL_FRAGMENT_SHADER_SOURCE = 
`#version 300 es

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

`;

const RENDER_VERTEX_SHADER_SOURCE =
`#version 300 es

layout (location = 0) in vec2 position;

out vec2 v_uv;

void main(void) {
  v_uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}

`

  const RENDER_FRAGMENT_SHADER_SOURCE =
`#version 300 es

precision highp float;

in vec2 v_uv;

out vec4 o_color;

uniform sampler2D u_valueTexture;

void main(void) {
  float v = texture(u_valueTexture, v_uv).x;
  o_color = vec4(v, v, v, 1.0);
}
`;

  const VERTICES_POSITION = new Float32Array([
    -1.0, -1.0,
    1.0, -1.0,
    -1.0,  1.0,
    1.0,  1.0
  ]);

  const VERTICES_INDEX = new Int16Array([
    0, 1, 2,
    3, 2, 1
  ]);


  const canvas = document.getElementById('canvas');
  const gl = canvas.getContext('webgl2');
  gl.getExtension('EXT_color_buffer_float');

  function createInitializeProgram(gl) {
    const vertexShader = createShader(gl, SORT_VERTEX_SHADER_SOURCE, gl.VERTEX_SHADER);
    const fragmentShader = createShader(gl, INITIALIZE_FRAGMENT_SHADER_SOURCE, gl.FRAGMENT_SHADER);
    return createProgram(gl, vertexShader, fragmentShader);
  }

  function createKernelProgram(gl) {
    const vertexShader = createShader(gl, SORT_VERTEX_SHADER_SOURCE, gl.VERTEX_SHADER);
    const fragmentShader = createShader(gl, KERNEL_FRAGMENT_SHADER_SOURCE, gl.FRAGMENT_SHADER);
    return createProgram(gl, vertexShader, fragmentShader);
  }

  function createRenderProgram(gl) {
    const vertexShader = createShader(gl, RENDER_VERTEX_SHADER_SOURCE, gl.VERTEX_SHADER);
    const fragmentShader = createShader(gl, RENDER_FRAGMENT_SHADER_SOURCE, gl.FRAGMENT_SHADER);
    return createProgram(gl, vertexShader, fragmentShader);
  }

  const initializeProgram = createInitializeProgram(gl);
  const initializeProgramUniforms = getUniformLocations(gl, initializeProgram, ['u_randomSeed']);
  const kernelProgram = createKernelProgram(gl);
  const kernelProgramUniforms = getUniformLocations(gl, kernelProgram, ['u_valueTexture', 'u_size', 'u_blockStep', 'u_subBlockStep']);
  const renderProgram = createRenderProgram(gl);
  const renderProgramUniforms = getUniformLocations(gl, renderProgram, ['u_valueTexture']);

  const vao = createVao(gl,
    createIbo(gl, VERTICES_INDEX),
    [{buffer: createVbo(gl, VERTICES_POSITION), size: 2}]);

  function initializeFramebuffer(framebuffer, size) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0.0, 0.0, size, size);

    gl.useProgram(initializeProgram);
    gl.uniform2f(initializeProgramUniforms['u_randomSeed'], Math.random() * 100.0, Math.random() * 100.0);
  
    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  const render = function(texture) {
    gl.viewport(0.0, 0.0, canvas.width, canvas.height);

    gl.useProgram(renderProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(renderProgramUniforms['u_valueTexture'], 0);

    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  const executeKernel = function(framebuffer, texture, size, blockStep, subBlockStep) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0.0, 0.0, size, size);

    gl.useProgram(kernelProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(kernelProgramUniforms['u_valueTexture'], 0);
    gl.uniform1ui(kernelProgramUniforms['u_size'], size);
    gl.uniform1ui(kernelProgramUniforms['u_blockStep'], blockStep);
    gl.uniform1ui(kernelProgramUniforms['u_subBlockStep'], subBlockStep);

    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  let sizeN = null;
  let textureSize = null;
  let readableFramebuffer = null;
  let writableFramebuffer = null;

  const swapFramebuffer = function() {
    const tmp = readableFramebuffer;
    readableFramebuffer = writableFramebuffer;
    writableFramebuffer = tmp;
  }

  const selectSize = document.getElementById('select-size');
  const buttonReset = document.getElementById('button-reset');
  const buttonRun = document.getElementById('button-run');
  const buttonMeasure = document.getElementById('button-measure');
  const spanTime = document.getElementById('span-time');
  const spanDrawCall = document.getElementById('span-drawcall');

  let isRunning = false;

  const writeToSpanTime = function(str) {
    spanTime.textContent = str;
  }

  const writeToSpanDrawCall = function(str) {
    spanDrawCall.textContent = str;
  }

  const reset = function() {
    isRunning = true;

    const size = parseInt(selectSize.value);
    textureSize = 2 ** size;
    sizeN = 2 * size;
    readableFramebuffer = createFramebuffer(gl, textureSize);
    writableFramebuffer = createFramebuffer(gl, textureSize);

    initializeFramebuffer(writableFramebuffer.framebuffer, textureSize);
    swapFramebuffer();

    render(readableFramebuffer.texture);
    writeToSpanTime('');
    writeToSpanDrawCall('');

    isRunning = false;
  };

  const stepAnimation = function(i, j) {
    executeKernel(writableFramebuffer.framebuffer, readableFramebuffer.texture, textureSize, i, j);
    swapFramebuffer();
    render(readableFramebuffer.texture);
    const ni = i == j ? i + 1 : i;
    const nj = i == j ? 0 : j + 1;
    if (ni !== sizeN) {
      setTimeout(stepAnimation, 100.0, ni, nj);
    } else {
      isRunning = false;
    }
  }

  const runAnimation = function() {
    isRunning = true;
    stepAnimation(0, 0);
  };

  const measureTime = function() {
    isRunning = true;
    const startTime = performance.now();
    let drawCallNum = 0;
    for (let i = 0; i < sizeN; i++) {
      for (let j = 0; j <= i; j++) {
        executeKernel(writableFramebuffer.framebuffer, readableFramebuffer.texture, textureSize, i, j);
        drawCallNum++;
        swapFramebuffer();
      }
    }
    const elapsedTime = performance.now() - startTime;
    render(readableFramebuffer.texture);
    writeToSpanTime('elapsed time: ' + 0.001 * elapsedTime + ' seconds');
    writeToSpanDrawCall('draw call: ' + drawCallNum);
    isRunning = false;
  };

  buttonReset.addEventListener('click', () => {
    if (!isRunning) {
      reset();
    }
  });

  buttonRun.addEventListener('click', () => {
    if (!isRunning) {
      runAnimation();
    }
  });

  buttonMeasure.addEventListener('click', () => {
    if (!isRunning) {
      measureTime();
    }
  });

  reset();

}());