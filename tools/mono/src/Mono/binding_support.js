
var BindingSupportLib = {
	$BINDING__postset: 'BINDING.export_functions (Module);',
	$BINDING: {
		BINDING_ASM: "WebAssembly.JSInterop",
		mono_wasm_object_registry: [],
		mono_wasm_ref_counter: 0,
		mono_wasm_free_list: [],
		mono_bindings_init: function (binding_asm) {
			this.BINDING_ASM = binding_asm;
		},

		export_functions: function (module) {
			module ["mono_bindings_init"] = BINDING.mono_bindings_init.bind(BINDING);
			module ["mono_method_invoke"] = BINDING.call_method.bind(BINDING);
			module ["mono_method_get_call_signature"] = BINDING.mono_method_get_call_signature.bind(BINDING);
			module ["mono_method_resolve"] = BINDING.resolve_method_fqn.bind(BINDING);
			module ["mono_bind_static_method"] = BINDING.bind_static_method.bind(BINDING);
			module ["mono_call_static_method"] = BINDING.call_static_method.bind(BINDING);
		},

		bindings_lazy_init: function () {
			if (this.init)
				return;
		
			this.assembly_load = Module.cwrap ('mono_wasm_assembly_load', 'number', ['string']);
			this.find_class = Module.cwrap ('mono_wasm_assembly_find_class', 'number', ['number', 'string', 'string']);
			this.find_method = Module.cwrap ('mono_wasm_assembly_find_method', 'number', ['number', 'string', 'number']);
			this.invoke_method = Module.cwrap ('mono_wasm_invoke_method', 'number', ['number', 'number', 'number']);
			this.mono_string_get_utf8 = Module.cwrap ('mono_wasm_string_get_utf8', 'number', ['number']);
			this.js_string_to_mono_string = Module.cwrap ('mono_wasm_string_from_js', 'number', ['string']);
			this.mono_get_obj_type = Module.cwrap ('mono_wasm_get_obj_type', 'number', ['number']);
			this.mono_unbox_int = Module.cwrap ('mono_unbox_int', 'number', ['number']);
			this.mono_unbox_float = Module.cwrap ('mono_wasm_unbox_float', 'number', ['number']);
			this.mono_array_length = Module.cwrap ('mono_wasm_array_length', 'number', ['number']);
			this.mono_array_get = Module.cwrap ('mono_wasm_array_get', 'number', ['number', 'number']);
			this.mono_obj_array_new = Module.cwrap ('mono_wasm_obj_array_new', 'number', ['number']);
			this.mono_obj_array_set = Module.cwrap ('mono_wasm_obj_array_set', 'void', ['number', 'number', 'number']);
			
			// receives a byteoffset into allocated Heap with a size.
			this.mono_byte_array_new = Module.cwrap ('mono_wasm_byte_array_new', 'number', ['number','number']);
			this.mono_is_byte_array = Module.cwrap ('mono_wasm_is_byte_array', 'number', ['number']);
			this.mono_array_to_heap = Module.cwrap ('mono_wasm_array_to_heap', 'void', ['number','number']);

			this.binding_module = this.assembly_load (this.BINDING_ASM);
			var wasm_runtime_class = this.find_class (this.binding_module, "WebAssembly.JSInterop", "JSInterop")
			if (!wasm_runtime_class)
				throw "Can't find WebAssembly.JSInterop class";

			var get_method = function(method_name) {
				var res = BINDING.find_method (wasm_runtime_class, method_name, -1)
				if (!res)
					throw "Can't find method WebAssembly.JSInterop:" + method_name;
				return res;
			}
			this.bind_js_obj = get_method ("BindJSObject");
			this.bind_existing_obj = get_method ("BindExistingObject");
			this.unbind_js_obj = get_method ("UnBindJSObject");
			this.unbind_js_obj_and_fee = get_method ("UnBindJSObjectAndFree");
			this.get_js_id = get_method ("GetJSObjectId");
			this.get_raw_mono_obj = get_method ("GetMonoObject");

			this.box_js_int = get_method ("BoxInt");
			this.box_js_double = get_method ("BoxDouble");
			this.box_js_bool = get_method ("BoxBool");
			this.setup_js_cont = get_method ("SetupJSContinuation");

			this.create_tcs = get_method ("CreateTaskSource");
			this.set_tcs_result = get_method ("SetTaskSourceResult");
			this.set_tcs_failure = get_method ("SetTaskSourceFailure");
			this.tcs_get_task_and_bind = get_method ("GetTaskAndBind");
			this.get_call_sig = get_method ("GetCallSignature");

			this.object_to_string = get_method ("ObjectToString");
			
			this.init = true;
		},
		//FIXME this is wastefull, we could remove the temp malloc by going the UTF16 route
		//FIXME this is unsafe, cuz raw objects could be GC'd.
		conv_string: function (mono_obj) {
			if (mono_obj == 0)
				return null;
			var raw = this.mono_string_get_utf8 (mono_obj);
			var res = Module.UTF8ToString (raw);
			Module._free (raw);

			return res;
		},
		
		mono_array_to_js_array: function (mono_array) {
			if (mono_array == 0)
				return null;

			var res = [];
			var len = this.mono_array_length (mono_array);
			for (var i = 0; i < len; ++i)
				res.push (this.unbox_mono_obj (this.mono_array_get (mono_array, i)));

			return res;
		},

		js_array_to_mono_array: function (js_array) {
			var mono_array = this.mono_obj_array_new (js_array.length);
			for (var i = 0; i < js_array.length; ++i) {
				this.mono_obj_array_set (mono_array, i, this.js_to_mono_obj (js_array [i]));
			}
			return mono_array;
		},

		unbox_mono_obj: function (mono_obj) {
			if (mono_obj == 0)
				return undefined;
			var type = this.mono_get_obj_type (mono_obj);
			//See MARSHAL_TYPE_ defines in driver.c
			switch (type) {
			case 1: // int
				return this.mono_unbox_int (mono_obj);
			case 2: // float
				return this.mono_unbox_float (mono_obj);
			case 3: //string
				return this.conv_string (mono_obj);
			case 4: //vts
				throw new Error ("no idea on how to unbox value types");
			case 5: { // delegate
				var obj = this.extract_js_obj (mono_obj);
				return function () {
					return BINDING.invoke_delegate (obj, arguments);
				};
			}
			case 6: {// Task
				var obj = this.extract_js_obj (mono_obj);
				var cont_obj = null;
				var promise = new Promise (function (resolve, reject) {
					cont_obj = {
						resolve: resolve,
						reject: reject
					};
				});

				this.call_method (this.setup_js_cont, null, "mo", [ mono_obj, cont_obj ]);
				return promise;
			}

			case 7: // ref type
				return this.extract_js_obj (mono_obj);

			case 8: // bool
				return this.mono_unbox_int (mono_obj) != 0;

			case 9: // array type
				var isByteArray = this.mono_is_byte_array(mono_obj);
				if (isByteArray)
				{
					return this.mono_array_to_js_typedarray(mono_obj);
				}
				return this.extract_js_obj (mono_obj);

			default:
				throw new Error ("no idea on how to unbox object kind " + type);
			}
		},

		create_task_completion_source: function () {
			return this.call_method (this.create_tcs, null, "", []);
		},

		set_task_result: function (tcs, result) {
			this.call_method (this.set_tcs_result, null, "oo", [ tcs, result ]);
		},

		set_task_failure: function (tcs, reason) {
			this.call_method (this.set_tcs_failure, null, "os", [ tcs, reason.toString () ]);
		},

		//https://github.com/Planeshifter/emscripten-examples/blob/master/01_PassingArrays/sum_post.js
		js_typedarray_to_heap: function(typedArray){
			var numBytes = typedArray.length * typedArray.BYTES_PER_ELEMENT;
			var ptr = Module._malloc(numBytes);
			var heapBytes = new Uint8Array(Module.HEAPU8.buffer, ptr, numBytes);
			heapBytes.set(new Uint8Array(typedArray.buffer));
			return heapBytes;
		},
		mono_array_to_js_typedarray: function(mono_array){

			var byteArrayLength = this.mono_array_length(mono_array);
			
			// Allocate bytes needed for the array of bytes
			var bufferSize = byteArrayLength * Uint8Array.BYTES_PER_ELEMENT;
			var bufferPtr = Module._malloc(bufferSize);

			// blit the mono array to the heap
			this.mono_array_to_heap(mono_array, bufferPtr);

			// create a new type array from the allocated heap
			var res = Module.HEAPU8.slice(bufferPtr, bufferPtr+byteArrayLength);
			// free the allocated memory
			Module._free(bufferPtr);
			// return new typed array
			return res;
			
		},
		js_to_mono_obj: function (js_obj, is_managed) {
	  		this.bindings_lazy_init ();
			
			if (js_obj === null || typeof js_obj === "undefined")
				return 0;

			if (is_managed === null || typeof is_managed === "undefined")
				is_managed = false;
  
			  if (typeof js_obj === 'number') {
				if (parseInt(js_obj) == js_obj)
					return this.call_method (this.box_js_int, null, "im", [ js_obj ]);
				return this.call_method (this.box_js_double, null, "dm", [ js_obj ]);
			}
			if (typeof js_obj === 'string')
				return this.js_string_to_mono_string (js_obj);

			if (typeof js_obj === 'boolean')
				return this.call_method (this.box_js_bool, null, "im", [ js_obj ]);

			if (Promise.resolve(js_obj) === js_obj) {
				var the_task = this.try_extract_mono_obj (js_obj);
				if (the_task)
					return the_task;
				var tcs = this.create_task_completion_source ();
				//FIXME dispose the TCS once the promise completes
				js_obj.then (function (result) {
					BINDING.set_task_result (tcs, result);
				}, function (reason) {
					BINDING.set_task_failure (tcs, reason);
				})

				return this.get_task_and_bind (tcs, js_obj);
			}

			// JavaScript typed arrays are array-like objects and provide a mechanism for accessing 
			// raw binary data. (...) To achieve maximum flexibility and efficiency, JavaScript typed arrays 
			// split the implementation into buffers and views. A buffer (implemented by the ArrayBuffer object)
			//  is an object representing a chunk of data; it has no format to speak of, and offers no 
			// mechanism for accessing its contents. In order to access the memory contained in a buffer, 
			// you need to use a view. A view provides a context — that is, a data type, starting offset, 
			// and number of elements — that turns the data into an actual typed array.
			// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays
			if (!!(js_obj.buffer instanceof ArrayBuffer && js_obj.BYTES_PER_ELEMENT))
			{
				var heapBytes = this.js_typedarray_to_heap(js_obj);
				var bufferArray = this.mono_byte_array_new(heapBytes.byteOffset, heapBytes.length);
				Module._free(heapBytes.byteOffset);
				return bufferArray;
			}

			return this.extract_mono_obj (js_obj, is_managed);
		},

		wasm_binding_obj_new: function (js_obj_id)
		{
			return this.call_method (this.bind_js_obj, null, "i", [js_obj_id]);
		},

		wasm_bind_existing: function (mono_obj, js_id)
		{
			return this.call_method (this.bind_existing_obj, null, "mi", [mono_obj, js_id]);
		},

		wasm_unbinding_js_obj: function (js_obj_id)
		{
			return this.call_method (this.unbind_js_obj, null, "i", [js_obj_id]);
		},		

		wasm_unbinding_js_obj_and_free: function (js_obj_id)
		{
			return this.call_method (this.unbind_js_obj_and_fee, null, "i", [js_obj_id]);
		},		

		wasm_get_js_id: function (mono_obj)
		{
			return this.call_method (this.get_js_id, null, "m", [mono_obj]);
		},

		wasm_get_raw_obj: function (gchandle)
		{
			return this.call_method (this.get_raw_mono_obj, null, "im", [gchandle]);
		},

		try_extract_mono_obj:function (js_obj) {
			if (js_obj === null || typeof js_obj === "undefined" || !js_obj.__mono_gchandle__)
				return 0;
			return this.wasm_get_raw_obj (js_obj.__mono_gchandle__);
		},

		mono_method_get_call_signature: function(method) {
			this.bindings_lazy_init ();

			return this.call_method (this.get_call_sig, null, "i", [ method ]);
		},

		get_task_and_bind: function (tcs, js_obj) {
			var task_gchandle = this.call_method (this.tcs_get_task_and_bind, null, "oi", [ tcs, this.mono_wasm_object_registry.length + 1 ]);
			js_obj.__mono_gchandle__ = task_gchandle;
			this.mono_wasm_register_obj (js_obj);
			return this.wasm_get_raw_obj (js_obj.__mono_gchandle__);
		},

		extract_mono_obj: function (js_obj, is_managed) {
			//halp JS ppl, is this enough?
			if (js_obj === null || typeof js_obj === "undefined")
				return 0;

			if (is_managed === null || typeof is_managed === "undefined")
				is_managed = false;
			
			if (is_managed || js_obj.is_clr_managed)
				return this.call_method (this.box_js_int, null, "im", [ this.mono_wasm_register_obj(js_obj, true) ]);

			if (!js_obj.__mono_gchandle__) {
				this.mono_wasm_register_obj(js_obj, false);
			}

			return this.wasm_get_raw_obj (js_obj.__mono_gchandle__);
		},

		extract_js_obj: function (mono_obj) {
			if (mono_obj === 0)
				return null;

			var js_id = this.wasm_get_js_id (mono_obj);
			if (js_id > 0)
				return this.mono_wasm_require_handle(js_id);

			var gcHandle = this.mono_wasm_free_list.length ? this.mono_wasm_free_list.pop() : this.mono_wasm_ref_counter++;
			var js_obj = {
				__mono_gchandle__: this.wasm_bind_existing(mono_obj, gcHandle + 1),
				is_mono_bridged_obj: true
			};

			this.mono_wasm_object_registry[gcHandle] = js_obj;

			return js_obj;
		},

		/*
		args_marshal is a string with one character per parameter that tells how to marshal it, here are the valid values:

		i: int32
		l: int64
		f: float
		d: double
		s: string
		o: js object will be converted to a C# object (this will box numbers/bool/promises)
		m: raw mono object. Don't use it unless you know what you're doing

		additionally you can append 'm' to args_marshal beyond `args.length` if you don't want the return value marshaled
		*/
		call_method: function (method, this_arg, args_marshal, args) {
			this.bindings_lazy_init ();

			var extra_args_mem = 0;
			for (var i = 0; i < args.length; ++i) {
				//long/double memory must be 8 bytes aligned and I'm being lazy here
				if (args_marshal[i] == 'i' || args_marshal[i] == 'f' || args_marshal[i] == 'l' || args_marshal[i] == 'd')
					extra_args_mem += 8;
			}
			
			var extra_args_mem = extra_args_mem ? Module._malloc (extra_args_mem) : 0;
			var extra_arg_idx = 0;
			var args_mem = Module._malloc (args.length * 4);
			var eh_throw = Module._malloc (4);
			for (var i = 0; i < args.length; ++i) {
				if (args_marshal[i] == 's') {
					Module.setValue (args_mem + i * 4, this.js_string_to_mono_string (args [i]), "i32");
				} else if (args_marshal[i] == 'm') {
					Module.setValue (args_mem + i * 4, args [i], "i32");
				} else if (args_marshal[i] == 'o') {
					Module.setValue (args_mem + i * 4, this.js_to_mono_obj (args [i]), "i32");
				} else if (args_marshal[i] == 'i' || args_marshal[i] == 'f' || args_marshal[i] == 'l' || args_marshal[i] == 'd') {
					var extra_cell = extra_args_mem + extra_arg_idx;
					extra_arg_idx += 8;

					if (args_marshal[i] == 'i')
						Module.setValue (extra_cell, args [i], "i32");
					else if (args_marshal[i] == 'l')
						Module.setValue (extra_cell, args [i], "i64");
					else if (args_marshal[i] == 'f')
						Module.setValue (extra_cell, args [i], "float");
					else
						Module.setValue (extra_cell, args [i], "double");

					Module.setValue (args_mem + i * 4, extra_cell, "i32");
				}
			}
			Module.setValue (eh_throw, 0, "i32");

			var res = this.invoke_method (method, this_arg, args_mem, eh_throw);

			var eh_res = Module.getValue (eh_throw, "i32");

			if (extra_args_mem)
				Module._free (extra_args_mem);
			Module._free (args_mem);
			Module._free (eh_throw);

			if (eh_res != 0) {
				var msg = this.conv_string (res);
				throw new Error (msg); //the convention is that invoke_method ToString () any outgoing exception
			}

			if (args_marshal.length >= args.length && args_marshal [args.length] == 'm')
				return res;
			return this.unbox_mono_obj (res);
		},

		invoke_delegate: function (delegate_obj, js_args) {
			this.bindings_lazy_init ();

			if (!this.delegate_dynamic_invoke) {
				if (!this.corlib)
					this.corlib = this.assembly_load ("mscorlib");
				if (!this.delegate_class)
					this.delegate_class = this.find_class (this.corlib, "System", "Delegate");
				this.delegate_dynamic_invoke = this.find_method (this.delegate_class, "DynamicInvoke", -1);
			}
			var mono_args = this.js_array_to_mono_array (js_args);
			return this.call_method (this.delegate_dynamic_invoke, this.extract_mono_obj (delegate_obj), "m", [ mono_args ]);
		},
		
		resolve_method_fqn: function (fqn) {
			var assembly = fqn.substring(fqn.indexOf ("[") + 1, fqn.indexOf ("]")).trim();
			fqn = fqn.substring (fqn.indexOf ("]") + 1).trim();

			var methodname = fqn.substring(fqn.indexOf (":") + 1);
			fqn = fqn.substring (0, fqn.indexOf (":")).trim ();

			var namespace = "";
			var classname = fqn;
			if (fqn.indexOf(".") != -1) {
				var idx = fqn.lastIndexOf(".");
				namespace = fqn.substring (0, idx);
				classname = fqn.substring (idx + 1);
			}

			var asm = this.assembly_load (assembly);
			if (!asm)
				throw new Error ("Could not find assembly: " + assembly);

			var klass = this.find_class(asm, namespace, classname);
			if (!klass)
				throw new Error ("Could not find class: " + namespace + ":" +classname);

			var method = this.find_method (klass, methodname, -1);
			if (!method)
				throw new Error ("Could not find method: " + methodname);
			return method;
		},

		call_static_method: function (fqn, args, signature) {
			this.bindings_lazy_init ();

			var method = this.resolve_method_fqn (fqn);

			if (typeof signature === "undefined")
				signature = Module.mono_method_get_call_signature (method);

			return this.call_method (method, null, signature, args);
		},

		bind_static_method: function (fqn, signature) {
			this.bindings_lazy_init ();

			var method = this.resolve_method_fqn (fqn);

			if (typeof signature === "undefined")
				signature = Module.mono_method_get_call_signature (method);

			return function() {
				return BINDING.call_method (method, null, signature, arguments);
			};
		},

		// Object wrapping helper functions to handle reference handles that will
		// be used in managed code.
		mono_wasm_register_obj: function(obj, is_managed) {

			if (typeof is_managed === 'undefined' && is_managed !== null)
			{
				is_managed = false;
			}
			var gc_handle = undefined;
			if (typeof obj !== "undefined" && obj !== null) {
				gc_handle = obj.__mono_gchandle__;
				if (typeof gc_handle === "undefined") {
					var handle = this.mono_wasm_free_list.length ?
								this.mono_wasm_free_list.pop() : this.mono_wasm_ref_counter++;
					obj.__mono_gchandle__ = gc_handle = handle + 1;
					
					if (is_managed)
						obj.is_clr_managed = true;
					else
						obj.__mono_gchandle__ = this.wasm_binding_obj_new(gc_handle);
					
						
				}
				this.mono_wasm_object_registry[handle] = obj;
			}
			return gc_handle;
		},
		mono_wasm_require_handle: function(handle) {
			return this.mono_wasm_object_registry[handle - 1];
		},
		mono_wasm_unregister_obj: function(obj) {
	
			if (typeof obj  !== "undefined" && obj !== null) {
				var gc_handle = obj.__mono_gchandle__;
				if (typeof gc_handle  !== "undefined") {
					this.mono_wasm_free_list.push(gc_handle - 1);
					delete obj.__mono_gchandle__;
					return this.wasm_unbinding_js_obj_and_free(gc_handle);
				}
			}
			return null;
		},
		mono_wasm_free_handle: function(handle) {
			var obj = this.mono_wasm_object_registry[handle - 1]
			this.mono_wasm_unregister_obj(obj);
		},
	
	},
	mono_wasm_invoke_js_with_args: function(js_handle, method_name, args, is_managed, is_exception) {
		BINDING.bindings_lazy_init ();

		var obj = BINDING.mono_wasm_require_handle (js_handle);
		if (!obj) {
			setValue (is_exception, 1, "i32");
			return BINDING.js_string_to_mono_string ("Invalid JS object handle '" + js_handle + "'");
		}

		var js_name = BINDING.conv_string (method_name);
		if (!js_name) {
			setValue (is_exception, 1, "i32");
			return BINDING.js_string_to_mono_string ("Invalid method name object '" + method_name + "'");
		}

		var js_args = BINDING.mono_array_to_js_array(args);

		var res;
		try {
			var m = obj [js_name];
			var res = m.apply (obj, js_args);
			return BINDING.js_to_mono_obj (res, is_managed);
		} catch (e) {
			var res = e.toString ();
			setValue (is_exception, 1, "i32");
			if (res === null || typeof res  === "undefined")
				res = "unknown exception";
			return BINDING.js_string_to_mono_string (res);
		}
	},

};

autoAddDeps(BindingSupportLib, '$BINDING')
mergeInto(LibraryManager.library, BindingSupportLib)

