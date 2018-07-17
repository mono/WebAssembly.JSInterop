# mono

This is a debug build with a few small changes to the driver for debugging purposes.

Adds bindings for java script objects.


## Contents
You should now have the following directory structure

```
.
|--- mono                           
     |--- src						// Source files for building driver and managed code
          |--- Mono					// Contains driver source
                |--- binding_support.js	// bindings
                |--- driver.c	// Contains driver source
     Makefile						// Makefile to build the DOM binary and managed libraries
```

# Prerequisites

- A prebuilt mono wasm release which will be downloaded automatically in the Makefile.
- Latest emscripten installed and build[1]

# Building custom mono

Mono requires the latest emscripten installed and built[1]. The pre-built binaries are compiled using the following command line for the debug build:

```
	emcc -g4 -Os -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s BINARYEN=1 -s "BINARYEN_TRAP_MODE='clamp'" -s TOTAL_MEMORY=134217728 -s ALIASING_FUNCTION_POINTERS=0 -s ASSERTIONS=2 --js-library $(WASM_SDKS_DIR)/library_mono.js --js-library library_mono_dom.js $(BUILD_DIR)/driver.o $(WASM_SDKS_DIR)/libmonosgen-2.0.a -o debug/mono.js -s NO_EXIT_RUNTIME=1 -s "EXTRA_EXPORTED_RUNTIME_METHODS=$(EXTRA_EXPORTED_RUNTIME_METHODS)"

```

To retrieve and build the latest emscripten.

```
$ make	
```

This will download the latest emscripten libraries and build them.

Once that is finished and built successfully you can then build the wasm-dom target.

Right now the following targets are available:

- build: Build the DOM binaries and managed code.
- clean: Cleans up certain libraries so that the build will rebuild all targets.

```
$ make build
```

# Debug Info

Right now, by default there are debugging messages sent to the `console` window from the driver program.  To get rid of the messages open the `driver.cpp` program and change the `BOOL debugMode = TRUE;` to false as follows: `BOOL debugMode = FALSE;`.  You will need to rebuild the driver.

```
$ make clean
$ make build
```

The `emscripten` library will not be rebuilt by doing this.

[1] https://github.com/kripken/emscripten
